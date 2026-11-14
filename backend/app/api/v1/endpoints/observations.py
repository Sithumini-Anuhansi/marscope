import asyncio
import json
import os
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from app.api.v1.endpoints.crew import MISSION_ID, _roster
from app.schemas.observation import Observation, ObservationCreate, ObservationUpdate, VerificationStatus

router = APIRouter(prefix='/missions/{mission_id}/observations', tags=['collaborative observations'])
_observations: dict[str, Observation] = {}
_audit: list[dict] = []
_clients: set[WebSocket] = set()
_lock = asyncio.Lock()

def _actor(actor_id: str | None, actor_role: str | None, actor_token: str | None) -> tuple[str, str]:
    if not actor_token: raise HTTPException(401, 'X-Actor-Token is required')
    try: configured = json.loads(os.getenv('MARSCOPE_ACTOR_TOKENS', '{}'))
    except json.JSONDecodeError: raise HTTPException(503, 'MARSCOPE_ACTOR_TOKENS must be valid JSON')
    identity = configured.get(actor_token)
    if not isinstance(identity, dict): raise HTTPException(401, 'Invalid actor token')
    verified_id, verified_role = identity.get('actor_id'), identity.get('role')
    if actor_id != verified_id or actor_role != verified_role: raise HTTPException(403, 'Actor headers do not match the token identity')
    if verified_id not in {person.id for person in _roster} and verified_role != 'mission-control': raise HTTPException(403, 'Unknown crew member')
    if verified_role not in {'crew', 'mission-control'}: raise HTTPException(403, 'Role must be crew or mission-control')
    return verified_id, verified_role

def _persist(action: str, observation: Observation | None, observation_id: str | None = None, actor_id: str = 'system', changed_fields: list[str] | None = None) -> None:
    database_url = os.getenv('DATABASE_URL')
    if not database_url: return
    import psycopg
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        mission_id = observation.mission_id if observation else MISSION_ID
        target_id = observation.id if observation else observation_id
        if action == 'deleted': cursor.execute('DELETE FROM mission_observations WHERE id=%s', (observation_id,))
        else:
            assert observation is not None
            cursor.execute(
              "INSERT INTO mission_observations (id,mission_id,astronaut_id,category,description,position,latitude_deg,longitude_deg,submitted_at,severity,image_refs,verification_status,supporting_evidence) VALUES (%s,%s,%s,%s,%s,ST_SetSRID(ST_MakePoint(%s,%s),0),%s,%s,%s,%s,%s::jsonb,%s,%s) ON CONFLICT(id) DO UPDATE SET description=EXCLUDED.description,severity=EXCLUDED.severity,image_refs=EXCLUDED.image_refs,verification_status=EXCLUDED.verification_status,supporting_evidence=EXCLUDED.supporting_evidence",
              (observation.id,observation.mission_id,observation.astronaut_id,observation.category.value,observation.description,observation.longitude_deg,observation.latitude_deg,observation.latitude_deg,observation.longitude_deg,observation.submitted_at,observation.severity,json.dumps(observation.image_refs),observation.verification_status.value,observation.supporting_evidence))
        cursor.execute('INSERT INTO observation_audit (observation_id,mission_id,action,actor_id,changed_fields) VALUES (%s,%s,%s,%s,%s::jsonb)',
                       (target_id, mission_id, action, actor_id, json.dumps(changed_fields or [])))

def _read_persisted() -> tuple[list[Observation], list[dict]]:
    database_url = os.getenv('DATABASE_URL')
    if not database_url: return [], []
    import psycopg
    from psycopg.rows import dict_row
    with psycopg.connect(database_url, row_factory=dict_row) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT id,mission_id,astronaut_id,category,description,ST_Y(position) AS latitude_deg,ST_X(position) AS longitude_deg,submitted_at,severity,image_refs,verification_status,supporting_evidence FROM mission_observations WHERE mission_id=%s ORDER BY submitted_at DESC", (MISSION_ID,))
        records = [Observation(**{**row, 'category':row['category'], 'image_refs':row['image_refs'] or []}) for row in cursor.fetchall()]
        cursor.execute('SELECT observation_id,action,actor_id,occurred_at,changed_fields FROM observation_audit WHERE mission_id=%s ORDER BY occurred_at DESC LIMIT 1000', (MISSION_ID,))
        audit = [dict(row) for row in cursor.fetchall()]
    return records, audit

async def _refresh_persisted() -> None:
    if not os.getenv('DATABASE_URL'): return
    records, audit = await asyncio.to_thread(_read_persisted)
    _observations.clear()
    _observations.update((item.id,item) for item in records)
    _audit[:] = audit

async def _broadcast(event: str, observation: Observation | None, observation_id: str | None = None) -> None:
    message={'type':event,'observation':observation.model_dump(mode='json') if observation else None,'observation_id':observation_id}
    for client in tuple(_clients):
        try: await client.send_json(message)
        except RuntimeError: _clients.discard(client)

@router.get('', response_model=list[Observation])
async def list_observations(mission_id: str, category: str | None = None, astronaut_id: str | None = None,
 min_latitude: float | None = Query(None,ge=-90,le=90), max_latitude: float | None = Query(None,ge=-90,le=90),
 min_longitude: float | None = Query(None,ge=-180,le=180), max_longitude: float | None = Query(None,ge=-180,le=180)):
    if mission_id != MISSION_ID: raise HTTPException(404,'Mission not found')
    await _refresh_persisted()
    return [o for o in _observations.values() if (category is None or o.category.value==category) and (astronaut_id is None or o.astronaut_id==astronaut_id) and (min_latitude is None or o.latitude_deg>=min_latitude) and (max_latitude is None or o.latitude_deg<=max_latitude) and (min_longitude is None or o.longitude_deg>=min_longitude) and (max_longitude is None or o.longitude_deg<=max_longitude)]

@router.post('', response_model=Observation, status_code=201)
async def create_observation(mission_id: str, payload: ObservationCreate, actor_id: str | None=Header(None,alias='X-Actor-ID'), actor_role: str | None=Header(None,alias='X-Actor-Role'), actor_token: str | None=Header(None,alias='X-Actor-Token')):
    actor_id,_=_actor(actor_id,actor_role,actor_token)
    if mission_id != MISSION_ID: raise HTTPException(404,'Mission not found')
    if payload.astronaut_id != actor_id: raise HTTPException(403,'Astronaut ID must match the actor')
    item=Observation(**payload.model_dump(),id=str(uuid4()),mission_id=mission_id,submitted_at=datetime.now(timezone.utc),verification_status=VerificationStatus.UNVERIFIED)
    async with _lock:
        await asyncio.to_thread(_persist,'created',item,None,actor_id,[]); _observations[item.id]=item
        _audit.append({'action':'created','observation_id':item.id,'actor_id':actor_id,'at':item.submitted_at.isoformat()})
    await _broadcast('created',item); return item

@router.patch('/{observation_id}', response_model=Observation)
async def update_observation(mission_id: str, observation_id: str, payload: ObservationUpdate, actor_id: str | None=Header(None,alias='X-Actor-ID'), actor_role: str | None=Header(None,alias='X-Actor-Role'), actor_token: str | None=Header(None,alias='X-Actor-Token')):
    actor_id,role=_actor(actor_id,actor_role,actor_token)
    await _refresh_persisted()
    async with _lock:
        item=_observations.get(observation_id)
        if mission_id!=MISSION_ID or item is None or item.mission_id!=mission_id: raise HTTPException(404,'Observation not found')
        changes=payload.model_dump(exclude_unset=True)
        if 'verification_status' in changes and role!='mission-control': raise HTTPException(403,'Only mission control can change verification status')
        if role!='mission-control' and item.astronaut_id!=actor_id: raise HTTPException(403,'Only the author or mission control can update this observation')
        updated=item.model_copy(update=changes); await asyncio.to_thread(_persist,'updated',updated,None,actor_id,list(changes)); _observations[observation_id]=updated
        _audit.append({'action':'updated','observation_id':observation_id,'actor_id':actor_id,'at':datetime.now(timezone.utc).isoformat(),'changes':list(changes)})
    await _broadcast('updated',updated); return updated

@router.delete('/{observation_id}',status_code=204)
async def delete_observation(mission_id: str, observation_id: str, actor_id: str | None=Header(None,alias='X-Actor-ID'), actor_role: str | None=Header(None,alias='X-Actor-Role'), actor_token: str | None=Header(None,alias='X-Actor-Token')):
    actor_id,role=_actor(actor_id,actor_role,actor_token)
    await _refresh_persisted()
    async with _lock:
        item=_observations.get(observation_id)
        if mission_id!=MISSION_ID or item is None or item.mission_id!=mission_id: raise HTTPException(404,'Observation not found')
        if role!='mission-control' and item.astronaut_id!=actor_id: raise HTTPException(403,'Only the author or mission control can delete this observation')
        await asyncio.to_thread(_persist,'deleted',None,observation_id,actor_id,[]); del _observations[observation_id]
        _audit.append({'action':'deleted','observation_id':observation_id,'actor_id':actor_id,'at':datetime.now(timezone.utc).isoformat()})
    await _broadcast('deleted',None,observation_id)

@router.get('/audit/events')
async def audit_events(mission_id: str, actor_id: str | None=Header(None,alias='X-Actor-ID'), actor_role: str | None=Header(None,alias='X-Actor-Role'), actor_token: str | None=Header(None,alias='X-Actor-Token')):
    _,role=_actor(actor_id,actor_role,actor_token)
    if role!='mission-control': raise HTTPException(403,'Only mission control can review the audit trail')
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    await _refresh_persisted()
    return {'items':_audit[-1000:]}

@router.websocket('/live')
async def observation_stream(websocket: WebSocket, mission_id: str):
    if mission_id!=MISSION_ID: await websocket.close(code=1008,reason='Mission not found'); return
    await _refresh_persisted()
    await websocket.accept(); _clients.add(websocket)
    await websocket.send_json({'type':'snapshot','observations':[o.model_dump(mode='json') for o in _observations.values()]})
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: _clients.discard(websocket)
