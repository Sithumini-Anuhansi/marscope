import asyncio
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from app.schemas.crew import Astronaut, LocationUpdate, Mission, Position

router = APIRouter(prefix='/missions', tags=['crew tracking'])
MISSION_ID = 'ares-iv'
_roster = [Astronaut(id=f'crew-{i:02}', name=name, role=role) for i, (name, role) in enumerate([
    ('Asha Raman', 'Commander'), ('Mateo Silva', 'Science Officer'),
    ('Nia Okafor', 'Engineer'), ('Owen Park', 'Medical Officer')], 1)]
_subscribers: set[WebSocket] = set()
_lock = asyncio.Lock()
STALE_AFTER_SECONDS = 60

def _persist_update(update: LocationUpdate) -> None:
    """Persist the canonical Mars lon/lat point when PostGIS is configured."""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        return
    import psycopg
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO astronaut_positions (astronaut_id, position, latitude_deg, longitude_deg, recorded_at) "
                "VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 0), %s, %s, %s)",
                (update.astronaut_id, update.longitude_deg, update.latitude_deg,
                 update.latitude_deg, update.longitude_deg, update.timestamp),
            )

def mission_snapshot() -> Mission:
    now = datetime.now(timezone.utc)
    crew = []
    for member in _roster:
        data = member.model_dump()
        if member.location_timestamp and (now - member.location_timestamp).total_seconds() > STALE_AFTER_SECONDS:
            data['status'] = 'stale'
        crew.append(Astronaut(**data))
    return Mission(id=MISSION_ID, name='Ares IV Surface Mission', astronauts=crew)

@router.get('/{mission_id}/crew', response_model=Mission)
async def get_crew(mission_id: str):
    if mission_id != MISSION_ID:
        raise HTTPException(status_code=404, detail='Mission not found')
    return mission_snapshot()

async def apply_update(payload: dict) -> dict:
    update = LocationUpdate.model_validate(payload)
    member = next((person for person in _roster if person.id == update.astronaut_id), None)
    if member is None:
        raise ValueError('Unknown astronaut_id')
    now = datetime.now(timezone.utc)
    if update.timestamp.tzinfo is None:
        raise ValueError('timestamp must include a timezone')
    if (now - update.timestamp).total_seconds() > STALE_AFTER_SECONDS:
        raise ValueError('location timestamp is stale')
    if (update.timestamp - now).total_seconds() > 30:
        raise ValueError('location timestamp is too far in the future')
    async with _lock:
        await asyncio.to_thread(_persist_update, update)
        member.latitude_deg = update.latitude_deg
        member.longitude_deg = update.longitude_deg
        member.location_timestamp = update.timestamp
        member.status = 'on-eva'
        member.path.append(Position(latitude_deg=update.latitude_deg, longitude_deg=update.longitude_deg, timestamp=update.timestamp))
        member.path = member.path[-500:]
    return mission_snapshot().model_dump(mode='json')

@router.websocket('/{mission_id}/locations')
async def crew_locations(websocket: WebSocket, mission_id: str):
    if mission_id != MISSION_ID:
        await websocket.close(code=1008, reason='Mission not found')
        return
    await websocket.accept()
    _subscribers.add(websocket)
    await websocket.send_json({'type': 'snapshot', 'mission': mission_snapshot().model_dump(mode='json')})
    try:
        while True:
            try:
                snapshot = await apply_update(await websocket.receive_json())
                message = {'type': 'location_update', 'mission': snapshot}
                for client in tuple(_subscribers):
                    try:
                        await client.send_json(message)
                    except RuntimeError:
                        _subscribers.discard(client)
            except (ValidationError, ValueError) as error:
                await websocket.send_json({'type': 'error', 'message': str(error)})
    except WebSocketDisconnect:
        _subscribers.discard(websocket)
