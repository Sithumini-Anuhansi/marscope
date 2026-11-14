import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints.observations import _audit, _observations
from app.main import app

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

HEADERS = {'X-Actor-ID': 'crew-01', 'X-Actor-Role': 'crew', 'X-Actor-Token': 'crew-token'}
PAYLOAD = {'astronaut_id': 'crew-01', 'category': 'water-ice', 'description': 'Possible ice exposure in a shaded fracture.', 'latitude_deg': -12.5, 'longitude_deg': 25.25, 'image_refs': ['https://example.test/evidence.jpg']}

@pytest.fixture(autouse=True)
def clean_observations(monkeypatch):
    monkeypatch.setenv('MARSCOPE_ACTOR_TOKENS', '{"crew-token":{"actor_id":"crew-01","role":"crew"},"control-token":{"actor_id":"mission-control","role":"mission-control"}}')
    _observations.clear()
    _audit.clear()

def test_create_filters_update_permissions_and_delete():
    with TestClient(app) as client:
        created = client.post('/api/v1/missions/ares-iv/observations', headers=HEADERS, json=PAYLOAD)
        assert created.status_code == 201
        item = created.json()
        assert item['verification_status'] == 'unverified'
        assert client.get('/api/v1/missions/ares-iv/observations?category=water-ice&astronaut_id=crew-01').json()[0]['id'] == item['id']
        outsider = client.patch(f"/api/v1/missions/ares-iv/observations/{item['id']}", headers={'X-Actor-ID':'crew-02','X-Actor-Role':'crew','X-Actor-Token':'crew-token'}, json={'description':'Changed by another astronaut'})
        assert outsider.status_code == 403
        assert client.patch(f"/api/v1/missions/ares-iv/observations/{item['id']}", headers=HEADERS, json={'description':'Updated field note.'}).status_code == 200
        denied_review = client.patch(f"/api/v1/missions/ares-iv/observations/{item['id']}", headers=HEADERS, json={'verification_status':'verified'})
        assert denied_review.status_code == 403
        mission_control = {'X-Actor-ID':'mission-control','X-Actor-Role':'mission-control','X-Actor-Token':'control-token'}
        assert client.patch(f"/api/v1/missions/ares-iv/observations/{item['id']}", headers=mission_control, json={'verification_status':'verified'}).json()['verification_status'] == 'verified'
        assert client.delete(f"/api/v1/missions/ares-iv/observations/{item['id']}", headers=mission_control).status_code == 204

def test_simultaneous_submissions_and_live_broadcast():
    with TestClient(app) as client:
        with client.websocket_connect('/api/v1/missions/ares-iv/observations/live') as socket:
            assert socket.receive_json()['type'] == 'snapshot'
            with ThreadPoolExecutor(max_workers=4) as pool:
                responses = list(pool.map(lambda _: client.post('/api/v1/missions/ares-iv/observations', headers=HEADERS, json=PAYLOAD), range(4)))
            assert all(response.status_code == 201 for response in responses)
            ids = {response.json()['id'] for response in responses}
            assert len(ids) == 4
            received = {socket.receive_json()['observation']['id'] for _ in range(4)}
            assert received == ids

def test_invalid_coordinates_are_rejected():
    with TestClient(app) as client:
        payload = {**PAYLOAD, 'latitude_deg': 91}
        assert client.post('/api/v1/missions/ares-iv/observations', headers=HEADERS, json=payload).status_code == 422
