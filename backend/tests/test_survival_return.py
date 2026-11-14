from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints.survival import _audit, _communications, _consumption, _equipment, _inventory
from app.main import app
from app.services.survival import estimate_endurance

CREW = {'X-Actor-ID':'crew-01','X-Actor-Role':'crew','X-Actor-Token':'crew-token'}

@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('MARSCOPE_ACTOR_TOKENS','{"crew-token":{"actor_id":"crew-01","role":"crew"},"control-token":{"actor_id":"mission-control","role":"mission-control"}}')
    _inventory.clear(); _consumption.clear(); _equipment.clear(); _communications.clear(); _audit.clear()

def test_endurance_requires_measured_events_and_projects_from_interval_samples():
    assert estimate_endurance(20,'kg',5,[])['days_remaining'] is None
    start=datetime(2026,1,1,tzinfo=timezone.utc)
    samples=[{'amount':4,'recorded_at':start.isoformat()},{'amount':2,'recorded_at':(start+timedelta(days=1)).isoformat()},{'amount':2,'recorded_at':(start+timedelta(days=2)).isoformat()}]
    estimate=estimate_endurance(20,'kg',4,samples)
    assert estimate['rate_per_day']==2
    assert estimate['days_remaining']==8
    assert estimate['confidence']=='low'

def test_inventory_consumption_reserve_equipment_comms_and_audit():
    start=datetime.now(timezone.utc)
    with TestClient(app) as client:
        base='/api/v1/missions/ares-iv/resources'
        inventory=client.put(base+'/inventory',headers=CREW,json={'astronaut_id':'crew-01','resource':'oxygen','amount':20,'reserve_amount':5,'unit':'kg','updated_at':start.isoformat()})
        assert inventory.status_code==200
        for amount,when in [(1,start),(2,start+timedelta(days=1)),(2,start+timedelta(days=2))]:
            result=client.post(base+'/consumption',headers=CREW,json={'astronaut_id':'crew-01','resource':'oxygen','amount':amount,'unit':'kg','recorded_at':when.isoformat()})
            assert result.status_code==201
        oxygen=next(row for row in result.json()['resources'] if row['resource']=='oxygen')
        assert oxygen['amount']==15
        assert oxygen['rate_per_day']==2
        assert oxygen['days_remaining']==5
        depleted=client.put(base+'/inventory',headers=CREW,json={'astronaut_id':'crew-01','resource':'oxygen','amount':5,'reserve_amount':5,'unit':'kg','updated_at':(start+timedelta(days=3)).isoformat()}).json()
        assert next(row for row in depleted['resources'] if row['resource']=='oxygen')['alert']=='shortage'
        assert client.put(base+'/equipment',headers=CREW,json={'astronaut_id':'crew-01','equipment_id':'suit','name':'Surface suit','status':'degraded','updated_at':start.isoformat()}).status_code==200
        assert client.put(base+'/communications',headers=CREW,json={'astronaut_id':'crew-01','available':False,'updated_at':start.isoformat()}).status_code==200
        assert client.get(base+'/audit/events',headers=CREW).status_code==403
        control={**CREW,'X-Actor-ID':'mission-control','X-Actor-Role':'mission-control','X-Actor-Token':'control-token'}
        assert len(client.get(base+'/audit/events',headers=control).json()['items'])==7

def test_return_assessment_names_missing_inputs_and_resource_shortages():
    with TestClient(app) as client:
        path='/api/v1/missions/ares-iv/return-assessments'
        unknown=client.post(path,json={'scenarios':[{'scenario_id':'unknown','name':'Unspecified'}]}).json()['scenarios'][0]
        assert unknown['status']=='insufficient-information'
        assert any('oxygen telemetry' in missing for missing in unknown['missing_information'])
        scenario={'scenario_id':'r1','name':'Supplied plan','return_duration_days':12,'available_time_days':20,'crew_available':True,'route_status':'feasible','environmental_risk':'low','equipment_ready':True,'return_vehicle_ready':True}
        start=datetime.now(timezone.utc)
        control={**CREW,'X-Actor-ID':'mission-control','X-Actor-Role':'mission-control','X-Actor-Token':'control-token'}
        client.put('/api/v1/missions/ares-iv/resources/inventory',headers=control,json={'astronaut_id':None,'resource':'oxygen','amount':5,'reserve_amount':1,'unit':'kg','updated_at':start.isoformat()})
        for when in (start,start+timedelta(days=1)):
            client.post('/api/v1/missions/ares-iv/resources/consumption',headers=control,json={'astronaut_id':None,'resource':'oxygen','amount':1,'unit':'kg','recorded_at':when.isoformat()})
        assert client.post(path,json={'scenarios':[scenario]}).json()['scenarios'][0]['status']=='not-feasible-with-available-resources'
