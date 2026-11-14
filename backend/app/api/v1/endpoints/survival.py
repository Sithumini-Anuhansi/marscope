import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime
from fastapi import APIRouter, Header, HTTPException
from app.api.v1.endpoints.crew import MISSION_ID, _roster
from app.schemas.survival import CommunicationsUpdate, ConsumptionInput, EquipmentUpdate, InventoryUpdate
from app.services.survival import estimate_endurance

router = APIRouter(prefix='/missions/{mission_id}/resources', tags=['survival resources'])
_inventory: dict[tuple[str,str,str],dict] = {}
_consumption: dict[tuple[str,str,str],list[dict]] = defaultdict(list)
_equipment: dict[tuple[str,str,str],dict] = {}
_communications: dict[tuple[str,str],dict] = {}
_audit: list[dict] = []
_lock = asyncio.Lock()

def _actor(actor_id,actor_role,token):
    if not token: raise HTTPException(401,'X-Actor-Token is required')
    try: configured=json.loads(os.getenv('MARSCOPE_ACTOR_TOKENS','{}'))
    except json.JSONDecodeError as error: raise HTTPException(503,'MARSCOPE_ACTOR_TOKENS must be valid JSON') from error
    identity=configured.get(token)
    if not isinstance(identity,dict): raise HTTPException(401,'Invalid actor token')
    if identity.get('actor_id')!=actor_id or identity.get('role')!=actor_role: raise HTTPException(403,'Actor headers do not match token identity')
    if actor_id not in {person.id for person in _roster} and actor_role!='mission-control': raise HTTPException(403,'Unknown crew member')
    if actor_role not in {'crew','mission-control'}: raise HTTPException(403,'Role must be crew or mission-control')
    return actor_id,actor_role

def _scope(actor_id, actor_role, token, astronaut_id):
    actor,role=_actor(actor_id,actor_role,token)
    if astronaut_id is None and role!='mission-control': raise HTTPException(403,'Only mission control can update mission-wide resources')
    if astronaut_id is not None and role!='mission-control' and astronaut_id!=actor: raise HTTPException(403,'Crew may update only their own resources')
    if astronaut_id is not None and astronaut_id not in {person.id for person in _roster}: raise HTTPException(404,'Astronaut not found')
    return actor,role

def _db_write(sql,params):
    url=os.getenv('DATABASE_URL')
    if not url: return
    import psycopg
    with psycopg.connect(url) as connection,connection.cursor() as cursor: cursor.execute(sql,params)

def _db_consume(mission,owner,resource,amount,unit,recorded_at,actor):
    url=os.getenv('DATABASE_URL')
    if not url: return None
    import psycopg
    with psycopg.connect(url) as connection,connection.cursor() as cursor:
        cursor.execute('UPDATE mission_resource_inventory SET amount=amount-%s,updated_at=%s WHERE mission_id=%s AND astronaut_id=%s AND resource=%s AND unit=%s AND amount >= %s RETURNING amount',(amount,recorded_at,mission,owner,resource,unit,amount))
        row=cursor.fetchone()
        if row is None: raise ValueError('Database inventory is missing, has a different unit, or cannot cover this consumption')
        cursor.execute('INSERT INTO resource_consumption (mission_id,astronaut_id,resource,amount,unit,recorded_at,actor_id) VALUES (%s,%s,%s,%s,%s,%s,%s)',(mission,owner,resource,amount,unit,recorded_at,actor))
        cursor.execute('INSERT INTO resource_audit(mission_id,actor_id,action,target,detail,occurred_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s)',(mission,actor,'consumption-recorded',f'{mission}:{owner}:{resource}',json.dumps({'amount':amount,'unit':unit}),recorded_at))
        return row[0]

def _read_db():
    url=os.getenv('DATABASE_URL')
    if not url: return None
    import psycopg
    from psycopg.rows import dict_row
    with psycopg.connect(url,row_factory=dict_row) as connection,connection.cursor() as cursor:
        cursor.execute('SELECT * FROM mission_resource_inventory WHERE mission_id=%s',(MISSION_ID,)); inventories=cursor.fetchall()
        cursor.execute('SELECT mission_id,astronaut_id,resource,amount,unit,recorded_at FROM resource_consumption WHERE mission_id=%s ORDER BY recorded_at',(MISSION_ID,)); consumption=cursor.fetchall()
        cursor.execute('SELECT * FROM mission_equipment WHERE mission_id=%s',(MISSION_ID,)); equipment=cursor.fetchall()
        cursor.execute('SELECT * FROM mission_comms_status WHERE mission_id=%s',(MISSION_ID,)); communications=cursor.fetchall()
        cursor.execute('SELECT actor_id,action,target,occurred_at,detail FROM resource_audit WHERE mission_id=%s ORDER BY occurred_at DESC LIMIT 1000',(MISSION_ID,)); audit=cursor.fetchall()
    return inventories,consumption,equipment,communications,audit

async def _refresh_db():
    result=await asyncio.to_thread(_read_db)
    if result is None: return
    inventories,consumption,equipment,communications,audit=result
    _inventory.clear(); _consumption.clear(); _equipment.clear(); _communications.clear(); _audit.clear()
    for row in inventories:
        owner=row['astronaut_id'] or ''; _inventory[(MISSION_ID,owner,row['resource'])]={**row,'updated_at':row['updated_at'].isoformat()}
    for row in consumption:
        owner=row['astronaut_id'] or ''; key=(MISSION_ID,owner,row['resource']); _consumption[key].append({**row,'astronaut_id':owner or None,'recorded_at':row['recorded_at'].isoformat()})
    for row in equipment:
        owner=row['astronaut_id'] or ''; _equipment[(MISSION_ID,owner,row['equipment_id'])]={**row,'astronaut_id':owner or None,'updated_at':row['updated_at'].isoformat()}
    for row in communications:
        owner=row['astronaut_id'] or ''; _communications[(MISSION_ID,owner)]={**row,'astronaut_id':owner or None,'updated_at':row['updated_at'].isoformat()}
    _audit.extend({**dict(row),'occurred_at':row['occurred_at'].isoformat()} for row in audit)

def _log(actor,action,target,at,detail):
    _audit.append({'actor_id':actor,'action':action,'target':target,'occurred_at':at.isoformat(),'detail':detail})

def _summary(astronaut_id=None):
    resources=[]
    for (mission,owner,kind),item in _inventory.items():
        if mission!=MISSION_ID or (astronaut_id is not None and owner!=astronaut_id): continue
        rate=estimate_endurance(item['amount'],item['unit'],item['reserve_amount'],_consumption.get((mission,owner,kind),[]))
        resources.append({**item,'astronaut_id':owner or None,'resource':kind,**rate,'alert':'shortage' if item['amount']<=item['reserve_amount'] else ('low' if item['amount']<=item['reserve_amount']*1.25 else 'nominal')})
    equipment=[item for (mission,owner,_),item in _equipment.items() if mission==MISSION_ID and (astronaut_id is None or owner==astronaut_id)]
    communications=[item for (mission,owner),item in _communications.items() if mission==MISSION_ID and (astronaut_id is None or owner==astronaut_id)]
    history=[sample for key,samples in _consumption.items() if key[0]==MISSION_ID and (astronaut_id is None or key[1]==astronaut_id) for sample in samples]
    return {'mission_id':MISSION_ID,'scope_astronaut_id':astronaut_id,'resources':resources,'equipment':equipment,'communications':communications,'consumption_history':sorted(history,key=lambda sample:sample['recorded_at'],reverse=True)[:500],'alerts':[{'astronaut_id':r['astronaut_id'],'resource':r['resource'],'level':r['alert'],'amount':r['amount'],'reserve_amount':r['reserve_amount']} for r in resources if r['alert']!='nominal'],'telemetry_status':'available' if resources or equipment or communications else 'missing','updated_at':max((r['updated_at'] for r in resources),default=None)}

@router.get('')
async def get_resources(mission_id:str,astronaut_id:str|None=None):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    await _refresh_db()
    return _summary(astronaut_id)

@router.put('/inventory')
async def update_inventory(mission_id:str,payload:InventoryUpdate,actor_id:str|None=Header(None,alias='X-Actor-ID'),actor_role:str|None=Header(None,alias='X-Actor-Role'),actor_token:str|None=Header(None,alias='X-Actor-Token')):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    actor,_=_scope(actor_id,actor_role,actor_token,payload.astronaut_id)
    await _refresh_db()
    if payload.reserve_amount>payload.amount: raise HTTPException(422,'Reserve amount cannot exceed available amount')
    owner=payload.astronaut_id or ''; key=(mission_id,owner,payload.resource.value)
    row={**payload.model_dump(mode='json'),'updated_at':payload.updated_at.isoformat()}
    async with _lock:
        await asyncio.to_thread(_db_write,"INSERT INTO mission_resource_inventory (mission_id,astronaut_id,resource,amount,reserve_amount,unit,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (mission_id,astronaut_id,resource) DO UPDATE SET amount=EXCLUDED.amount,reserve_amount=EXCLUDED.reserve_amount,unit=EXCLUDED.unit,updated_at=EXCLUDED.updated_at",(mission_id,owner,payload.resource.value,payload.amount,payload.reserve_amount,payload.unit,payload.updated_at))
        await asyncio.to_thread(_db_write,'INSERT INTO resource_audit(mission_id,actor_id,action,target,detail,occurred_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s)',(mission_id,actor,'inventory-updated',':'.join(key),json.dumps(row),payload.updated_at))
        _inventory[key]=row; _log(actor,'inventory-updated',':'.join(key),payload.updated_at,row)
    return _summary(payload.astronaut_id)

@router.post('/consumption',status_code=201)
async def record_consumption(mission_id:str,payload:ConsumptionInput,actor_id:str|None=Header(None,alias='X-Actor-ID'),actor_role:str|None=Header(None,alias='X-Actor-Role'),actor_token:str|None=Header(None,alias='X-Actor-Token')):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    actor,_=_scope(actor_id,actor_role,actor_token,payload.astronaut_id)
    await _refresh_db()
    owner=payload.astronaut_id or ''; key=(mission_id,owner,payload.resource.value)
    async with _lock:
        item=_inventory.get(key)
        if not item: raise HTTPException(404,'Resource inventory is missing')
        if item['unit']!=payload.unit: raise HTTPException(422,'Consumption unit must match inventory unit')
        if payload.amount>item['amount']: raise HTTPException(422,'Consumption exceeds available inventory')
        try: persisted_amount=await asyncio.to_thread(_db_consume,mission_id,owner,payload.resource.value,payload.amount,payload.unit,payload.recorded_at,actor)
        except ValueError as error: raise HTTPException(409,str(error)) from error
        item['amount']=persisted_amount if persisted_amount is not None else item['amount']-payload.amount
        item['updated_at']=payload.recorded_at.isoformat()
        sample={**payload.model_dump(mode='json'),'mission_id':mission_id,'recorded_at':payload.recorded_at.isoformat()}; _consumption[key].append(sample); _log(actor,'consumption-recorded',':'.join(key),payload.recorded_at,sample)
    return _summary(payload.astronaut_id)

@router.put('/equipment')
async def update_equipment(mission_id:str,payload:EquipmentUpdate,actor_id:str|None=Header(None,alias='X-Actor-ID'),actor_role:str|None=Header(None,alias='X-Actor-Role'),actor_token:str|None=Header(None,alias='X-Actor-Token')):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    actor,_=_scope(actor_id,actor_role,actor_token,payload.astronaut_id)
    await _refresh_db()
    owner=payload.astronaut_id or ''; key=(mission_id,owner,payload.equipment_id)
    row={**payload.model_dump(mode='json'),'updated_at':payload.updated_at.isoformat()}
    async with _lock:
        await asyncio.to_thread(_db_write,"INSERT INTO mission_equipment (mission_id,astronaut_id,equipment_id,name,status,updated_at) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (mission_id,astronaut_id,equipment_id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at",(mission_id,owner,payload.equipment_id,payload.name,payload.status.value,payload.updated_at))
        await asyncio.to_thread(_db_write,'INSERT INTO resource_audit(mission_id,actor_id,action,target,detail,occurred_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s)',(mission_id,actor,'equipment-updated',':'.join(key),json.dumps(row),payload.updated_at))
        _equipment[key]=row; _log(actor,'equipment-updated',':'.join(key),payload.updated_at,row)
    return _summary(payload.astronaut_id)

@router.put('/communications')
async def update_communications(mission_id:str,payload:CommunicationsUpdate,actor_id:str|None=Header(None,alias='X-Actor-ID'),actor_role:str|None=Header(None,alias='X-Actor-Role'),actor_token:str|None=Header(None,alias='X-Actor-Token')):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    actor,_=_scope(actor_id,actor_role,actor_token,payload.astronaut_id)
    await _refresh_db()
    owner=payload.astronaut_id or ''; key=(mission_id,owner)
    row={**payload.model_dump(mode='json'),'updated_at':payload.updated_at.isoformat()}
    async with _lock:
        await asyncio.to_thread(_db_write,"INSERT INTO mission_comms_status (mission_id,astronaut_id,available,updated_at) VALUES (%s,%s,%s,%s) ON CONFLICT (mission_id,astronaut_id) DO UPDATE SET available=EXCLUDED.available,updated_at=EXCLUDED.updated_at",(mission_id,owner,payload.available,payload.updated_at))
        await asyncio.to_thread(_db_write,'INSERT INTO resource_audit(mission_id,actor_id,action,target,detail,occurred_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s)',(mission_id,actor,'communications-updated',':'.join(key),json.dumps(row),payload.updated_at))
        _communications[key]=row; _log(actor,'communications-updated',':'.join(key),payload.updated_at,row)
    return _summary(payload.astronaut_id)

@router.get('/audit/events')
async def get_resource_audit(mission_id:str,actor_id:str|None=Header(None,alias='X-Actor-ID'),actor_role:str|None=Header(None,alias='X-Actor-Role'),actor_token:str|None=Header(None,alias='X-Actor-Token')):
    _,role=_actor(actor_id,actor_role,actor_token)
    if role!='mission-control': raise HTTPException(403,'Only mission control can read the resource audit log')
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    await _refresh_db()
    return {'items':_audit[-1000:]}
