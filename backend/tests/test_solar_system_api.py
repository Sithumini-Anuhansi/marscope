from app.main import app


def test_solar_system_routes_are_registered_with_documented_contracts():
    schema = app.openapi()
    paths = schema['paths']
    assert '/api/v1/solar-system/bodies' in paths
    assert '/api/v1/solar-system/bodies/{body_id}' in paths
    assert '/api/v1/solar-system/positions' in paths
    assert '/api/v1/solar-system/mars-system' in paths
    assert '/api/v1/solar-system/moons' in paths
    assert '/api/v1/solar-system/moons/{moon_id}' in paths
    position_parameters = {item['name'] for item in paths['/api/v1/solar-system/positions']['get']['parameters']}
    assert {'target', 'targets', 'center', 'epoch', 'start_time', 'stop_time', 'step_size'} <= position_parameters
