import pytest

from app.schemas.astronomy import EphemerisVector
from app.services import astronomy_service as astronomy


def test_vector_table_parser_reads_position_velocity_and_horizons_epoch():
    table = '''header\n$$SOE\n 2461360.500000000 = A.D. 2026-Nov-15 00:00:00.0000\n X = 1.000000000000000E+05 Y = -2.500000000000000E+04 Z = 4.000000000000000E+03\n VX = 1.000000000000000E+00 VY = 2.000000000000000E+00 VZ = -3.000000000000000E+00\n$$EOE\nfooter'''
    vectors = astronomy._parse_vectors(table)
    assert vectors == [EphemerisVector(epoch='2026-Nov-15 00:00:00.0000', x_km=100000, y_km=-25000, z_km=4000, vx_km_s=1, vy_km_s=2, vz_km_s=-3)]


def test_static_reference_values_are_explicit_and_missing_values_stay_null():
    bodies = {item.id: item for item in astronomy.list_bodies()}
    assert len([body for body in bodies.values() if body.classification.endswith('planet') or body.id in astronomy.PLANET_IDS]) >= 8
    assert bodies['phobos'].value_kind == 'approximate reference'
    assert bodies['phobos'].gravity_m_s2 is None
    assert astronomy.get_body('unknown') is None


def test_horizons_time_window_validation_rejects_bad_ranges():
    astronomy.validate_time_span('2026-11-15T00:00:00Z', '2026-11-16T00:00:00Z', '2 h')
    with pytest.raises(ValueError):
        astronomy.validate_time_span('2026-11-16T00:00:00Z', '2026-11-15T00:00:00Z', '2 h')
    with pytest.raises(ValueError):
        astronomy.validate_time_span('2026-11-15T00:00:00Z', '2026-11-16T00:00:00Z', 'random')


def test_ephemeris_cache_marks_fresh_and_expired_entries():
    astronomy._cache.clear()
    astronomy._latest.clear()
    track = astronomy.EphemerisTrack(target='mars', center='sun', status='live', vectors=[EphemerisVector(epoch='2026-Nov-15 00:00:00', x_km=1, y_km=2, z_km=3)])
    group = astronomy._cache_group('mars', 'sun', 'point', '1 d')
    key = f'{group}:2026-11-15 00:00:00'
    astronomy._cache[key] = (100.0, track)
    astronomy._latest[group] = (100.0, track)
    fresh = astronomy._cached_result(key, group, 120.0)
    stale = astronomy._cached_result(key, group, 500.0)
    assert fresh is not None and fresh[1] == 'cached' and fresh[2] == 20
    assert stale is not None and stale[1] == 'stale' and stale[2] == 400
