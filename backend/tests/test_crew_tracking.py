from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints.crew import _roster
from app.main import app


@pytest.fixture(autouse=True)
def reset_roster():
    for member in _roster:
        member.status = 'untracked'
        member.latitude_deg = member.longitude_deg = None
        member.location_timestamp = None
        member.path.clear()


def test_mission_has_four_individually_identified_astronauts():
    with TestClient(app) as client:
        result = client.get('/api/v1/missions/ares-iv/crew')
    assert result.status_code == 200
    assert len(result.json()['astronauts']) == 4
    assert len({member['id'] for member in result.json()['astronauts']}) == 4


def test_websocket_broadcasts_valid_position_and_path():
    with TestClient(app) as client:
        with client.websocket_connect('/api/v1/missions/ares-iv/locations') as websocket:
            assert websocket.receive_json()['type'] == 'snapshot'
            websocket.send_json({'astronaut_id': 'crew-01', 'latitude_deg': 18.5,
                                 'longitude_deg': -12.25, 'timestamp': datetime.now(timezone.utc).isoformat()})
            message = websocket.receive_json()
    astronaut = message['mission']['astronauts'][0]
    assert message['type'] == 'location_update'
    assert astronaut['latitude_deg'] == 18.5
    assert astronaut['longitude_deg'] == -12.25
    assert len(astronaut['path']) == 1


@pytest.mark.parametrize('latitude,longitude', [(90.01, 0), (0, 180.01)])
def test_websocket_rejects_out_of_range_coordinates(latitude, longitude):
    with TestClient(app) as client:
        with client.websocket_connect('/api/v1/missions/ares-iv/locations') as websocket:
            websocket.receive_json()
            websocket.send_json({'astronaut_id': 'crew-01', 'latitude_deg': latitude,
                                 'longitude_deg': longitude, 'timestamp': datetime.now(timezone.utc).isoformat()})
            assert websocket.receive_json()['type'] == 'error'
