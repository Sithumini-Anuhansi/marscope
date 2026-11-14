import asyncio
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.schemas.astronomy import CelestialBody, EphemerisTrack, EphemerisVector

HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
CACHE_TTL_SECONDS = 300
MAX_CACHE_ENTRIES = 512
MAX_LATEST_ENTRIES = 256
REQUEST_TIMEOUT_SECONDS = 18
_cache: dict[str, tuple[float, EphemerisTrack]] = {}
_latest: dict[str, tuple[float, EphemerisTrack]] = {}
_request_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix='horizons')

# Horizons major-body IDs. Planet and satellite state vectors are requested in
# one common inertial frame and epoch before being rendered together.
HORIZONS_IDS = {
    'sun': '10', 'mercury': '199', 'venus': '299', 'earth': '399',
    'mars': '499', 'jupiter': '599', 'saturn': '699', 'uranus': '799',
    'neptune': '899', 'phobos': '401', 'deimos': '402',
}
CENTERS = {'sun': '500@10', 'mars': '500@499'}
PLANET_IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']
MOON_IDS = ['phobos', 'deimos']

FACTSHEET = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/planet_table_per.html'
NASA_SOLAR_SYSTEM = 'https://science.nasa.gov/solar-system/'
NASA_MARS_MOONS = 'https://science.nasa.gov/mars/moons/'

# Static values are explicitly approximate reference data, not ephemerides.
_BODY_DATA: dict[str, dict[str, Any]] = {
    'sun': dict(name='Sun', classification='G-type main-sequence star', diameter_km=1392700, mass_kg=1.9885e30, mean_distance_km=None, orbital_period_days=None, rotation_period_hours=609.12, gravity_m_s2=274, mean_surface_temperature_c=5500, atmosphere='Hydrogen and helium plasma', description='The star at the center of the Solar System. Planet sizes and distances in the visualization are not represented at a common physical scale.', reference_source=FACTSHEET),
    'mercury': dict(name='Mercury', classification='Terrestrial planet', diameter_km=4879, mass_kg=3.301e23, mean_distance_km=57900000, orbital_period_days=87.97, rotation_period_hours=1407.6, gravity_m_s2=3.7, mean_surface_temperature_c=167, atmosphere='Very thin exosphere', description='The innermost planet; its long solar day produces extreme day-night temperature variation.', reference_source=FACTSHEET),
    'venus': dict(name='Venus', classification='Terrestrial planet', diameter_km=12104, mass_kg=4.867e24, mean_distance_km=108200000, orbital_period_days=224.7, rotation_period_hours=-5832.5, gravity_m_s2=8.87, mean_surface_temperature_c=464, atmosphere='Dense carbon-dioxide atmosphere with sulfuric-acid clouds', description='A rocky planet with a dense atmosphere and a very hot surface. Rotation period is retrograde.', reference_source=FACTSHEET),
    'earth': dict(name='Earth', classification='Terrestrial planet', diameter_km=12756, mass_kg=5.972e24, mean_distance_km=149600000, orbital_period_days=365.256, rotation_period_hours=23.934, gravity_m_s2=9.81, mean_surface_temperature_c=15, atmosphere='Nitrogen and oxygen dominated', description='The third planet from the Sun and the reference origin of the Earth-centered comparison vector.', reference_source=FACTSHEET),
    'mars': dict(name='Mars', classification='Terrestrial planet', diameter_km=6792, mass_kg=6.417e23, mean_distance_km=227900000, orbital_period_days=686.98, rotation_period_hours=24.623, gravity_m_s2=3.71, mean_surface_temperature_c=-65, atmosphere='Thin, carbon-dioxide dominated', description='The MARSCOPE destination. Its two natural satellites are explored in the Mars system view.', reference_source=FACTSHEET),
    'jupiter': dict(name='Jupiter', classification='Gas giant', diameter_km=142984, mass_kg=1.898e27, mean_distance_km=778600000, orbital_period_days=4332.59, rotation_period_hours=9.925, gravity_m_s2=24.79, mean_surface_temperature_c=-110, atmosphere='Hydrogen and helium dominated', description='The largest planet; the displayed marker size is a symbol and is not to scale.', reference_source=FACTSHEET),
    'saturn': dict(name='Saturn', classification='Gas giant', diameter_km=120536, mass_kg=5.683e26, mean_distance_km=1433500000, orbital_period_days=10759, rotation_period_hours=10.7, gravity_m_s2=10.44, mean_surface_temperature_c=-140, atmosphere='Hydrogen and helium dominated', description='A gas giant with an extensive ring system. Rings are omitted from this vector-focused overview.', reference_source=FACTSHEET),
    'uranus': dict(name='Uranus', classification='Ice giant', diameter_km=51118, mass_kg=8.681e25, mean_distance_km=2872500000, orbital_period_days=30687, rotation_period_hours=-17.24, gravity_m_s2=8.69, mean_surface_temperature_c=-195, atmosphere='Hydrogen, helium and methane', description='An ice giant with a strongly tilted rotation axis; rotation period is retrograde.', reference_source=FACTSHEET),
    'neptune': dict(name='Neptune', classification='Ice giant', diameter_km=49528, mass_kg=1.024e26, mean_distance_km=4495100000, orbital_period_days=60190, rotation_period_hours=16.11, gravity_m_s2=11.15, mean_surface_temperature_c=-200, atmosphere='Hydrogen, helium and methane', description='The most distant major planet in the Solar System overview.', reference_source=FACTSHEET),
    'phobos': dict(name='Phobos', classification='Natural satellite of Mars', diameter_km=22.2, dimensions_km=[27, 22, 18], mass_kg=1.066e16, mean_distance_km=9376, orbital_period_days=0.3189, rotation_period_hours=7.65, gravity_m_s2=None, mean_surface_temperature_c=None, atmosphere=None, description='An irregular, heavily cratered moon that orbits Mars faster than Mars rotates. Its orbit slowly decays.', discovery='Discovered by Asaph Hall in 1877.', parent_id='mars', reference_source=NASA_MARS_MOONS),
    'deimos': dict(name='Deimos', classification='Natural satellite of Mars', diameter_km=12.4, dimensions_km=[15, 12, 11], mass_kg=1.476e15, mean_distance_km=23463, orbital_period_days=1.263, rotation_period_hours=30.31, gravity_m_s2=None, mean_surface_temperature_c=None, atmosphere=None, description='The smaller, more distant of Mars’s two moons; it is tidally locked to Mars.', discovery='Discovered by Asaph Hall in 1877.', parent_id='mars', reference_source=NASA_MARS_MOONS),
}


def list_bodies() -> list[CelestialBody]:
    return [CelestialBody(id=key, **values) for key, values in _BODY_DATA.items()]


def get_body(body_id: str) -> CelestialBody | None:
    values = _BODY_DATA.get(body_id.lower())
    return CelestialBody(id=body_id.lower(), **values) if values else None


def _clean_time(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def _parse_vectors(result_text: str) -> list[EphemerisVector]:
    if '$$SOE' not in result_text or '$$EOE' not in result_text:
        raise ValueError(result_text[-1000:] or 'Horizons returned no vector table')
    table = result_text.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    lines = table.splitlines()
    vectors: list[EphemerisVector] = []
    number = r'([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?)'
    for index, line in enumerate(lines):
        epoch_match = re.search(r'A\.D\.\s*(.+?)\s*$', line)
        if not epoch_match:
            continue
        fields = '\n'.join(lines[index + 1:index + 5])
        xyz = re.search(r'\bX\s*=\s*' + number + r'.*?\bY\s*=\s*' + number + r'.*?\bZ\s*=\s*' + number, fields, re.S)
        if not xyz:
            continue
        velocity = re.search(r'\bVX\s*=\s*' + number + r'.*?\bVY\s*=\s*' + number + r'.*?\bVZ\s*=\s*' + number, fields, re.S)
        vectors.append(EphemerisVector(epoch=epoch_match.group(1).strip(), x_km=float(xyz.group(1)), y_km=float(xyz.group(2)), z_km=float(xyz.group(3)), **({
            'vx_km_s': float(velocity.group(1)), 'vy_km_s': float(velocity.group(2)), 'vz_km_s': float(velocity.group(3)),
        } if velocity else {})))
    if not vectors:
        raise ValueError('Horizons vector table format was not recognized')
    return vectors


def _cache_group(target: str, center: str, mode: str, step: str) -> str:
    return f'{target}:{center}:{mode}:{step}'


def _cached_result(exact_key: str, group: str, now: float) -> tuple[EphemerisTrack, str, int] | None:
    exact = _cache.get(exact_key)
    if exact and now - exact[0] < CACHE_TTL_SECONDS:
        return exact[1], 'cached', int(now - exact[0])
    fallback = _latest.get(group)
    if fallback:
        age = int(now - fallback[0])
        return fallback[1], 'cached' if age < CACHE_TTL_SECONDS else 'stale', age
    return None


def _prune_cache(now: float) -> None:
    expired = [key for key, (stored_at, _) in _cache.items() if now - stored_at >= CACHE_TTL_SECONDS]
    for key in expired:
        _cache.pop(key, None)
    if len(_cache) > MAX_CACHE_ENTRIES:
        for key, _ in sorted(_cache.items(), key=lambda item: item[1][0])[:len(_cache) - MAX_CACHE_ENTRIES]:
            _cache.pop(key, None)
    if len(_latest) > MAX_LATEST_ENTRIES:
        for key, _ in sorted(_latest.items(), key=lambda item: item[1][0])[:len(_latest) - MAX_LATEST_ENTRIES]:
            _latest.pop(key, None)


def _request_horizons(target: str, center: str, epoch: str | None, start_time: str | None, stop_time: str | None, step_size: str) -> list[EphemerisVector]:
    parameters = {
        'format': 'json', 'COMMAND': f"'{HORIZONS_IDS[target]}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
        'EPHEM_TYPE': "'VECTORS'", 'CENTER': f"'{CENTERS[center]}'", 'TIME_TYPE': "'UT'",
        'REF_PLANE': "'ECLIPTIC'", 'REF_SYSTEM': "'ICRF'", 'OUT_UNITS': "'KM-S'",
        'VEC_TABLE': "'2'", 'VEC_CORR': "'NONE'", 'VEC_LABELS': "'YES'",
    }
    if epoch:
        parameters['TLIST'] = f"'{_clean_time(epoch)}'"
        parameters['TLIST_TYPE'] = "'CAL'"
    else:
        parameters.update({'START_TIME': f"'{_clean_time(start_time or '')}'", 'STOP_TIME': f"'{_clean_time(stop_time or '')}'", 'STEP_SIZE': f"'{step_size}'"})
    url = os.getenv('MARSCOPE_HORIZONS_URL', HORIZONS_URL) + '?' + urlencode(parameters)
    request = Request(url, headers={'User-Agent': 'MARSCOPE astronomy integration/1.0'})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f'JPL Horizons request failed: {error}') from error
    if payload.get('error'):
        raise RuntimeError(f"JPL Horizons: {payload['error']}")
    return _parse_vectors(str(payload.get('result', '')))


async def get_ephemeris_track(target: str, center: str, *, epoch: str | None = None,
                              start_time: str | None = None, stop_time: str | None = None,
                              step_size: str = '1 d') -> EphemerisTrack:
    normalized_epoch = _clean_time(epoch) if epoch else None
    normalized_start = _clean_time(start_time) if start_time else None
    normalized_stop = _clean_time(stop_time) if stop_time else None
    if normalized_epoch:
        fallback_group = _cache_group(target, center, 'point', step_size)
        exact_key = f'{fallback_group}:{normalized_epoch}'
        reuse_group = exact_key
    else:
        start = datetime.fromisoformat(normalized_start or '')
        stop = datetime.fromisoformat(normalized_stop or '')
        duration_seconds = int((stop - start).total_seconds())
        time_bucket = int(start.timestamp() // CACHE_TTL_SECONDS)
        mode = f'trajectory:{duration_seconds}:{time_bucket}'
        exact_key = _cache_group(target, center, mode, step_size)
        fallback_group = _cache_group(target, center, f'trajectory:{duration_seconds}', step_size)
        reuse_group = fallback_group if abs(start.timestamp() - time.time()) < 86400 else exact_key
    now = time.monotonic()
    cached = _cached_result(exact_key, reuse_group, now)
    if cached and cached[1] == 'cached':
        return cached[0].model_copy(update={'status': cached[1], 'cache_age_seconds': cached[2]})
    try:
        future = asyncio.get_running_loop().run_in_executor(_request_executor, partial(_request_horizons, target, center, normalized_epoch, normalized_start, normalized_stop, step_size))
        vectors = await asyncio.wait_for(future, timeout=REQUEST_TIMEOUT_SECONDS + 2)
        fetched = datetime.now(timezone.utc).isoformat()
        track = EphemerisTrack(target=target, center=center, status='live', fetched_at=fetched, cache_age_seconds=0, vectors=vectors)
        stored_at = time.monotonic()
        _prune_cache(stored_at)
        _cache[exact_key] = (stored_at, track)
        _latest[fallback_group] = (stored_at, track)
        return track
    except Exception as error:
        fallback = _cached_result(exact_key, fallback_group, time.monotonic())
        if fallback:
            return fallback[0].model_copy(update={'status': 'stale', 'cache_age_seconds': fallback[2], 'error': str(error)})
        return EphemerisTrack(target=target, center=center, status='unavailable', error=str(error), vectors=[])


def validate_time_span(start_time: str | None, stop_time: str | None, step_size: str) -> None:
    if (start_time is None) != (stop_time is None):
        raise ValueError('start_time and stop_time must be supplied together')
    if not re.fullmatch(r'\d{1,4}\s*(?:min|h|d)', step_size.strip()):
        raise ValueError('step_size must use a positive integer and min, h or d (for example 2 h or 15 d)')
    if not start_time:
        return
    start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    stop = datetime.fromisoformat((stop_time or '').replace('Z', '+00:00'))
    if start.tzinfo is None: start = start.replace(tzinfo=timezone.utc)
    if stop.tzinfo is None: stop = stop.replace(tzinfo=timezone.utc)
    seconds = (stop - start).total_seconds()
    if seconds <= 0 or seconds > 366 * 2 * 86400:
        raise ValueError('time range must be positive and no longer than two years')
    amount, unit = re.fullmatch(r'(\d+)\s*(min|h|d)', step_size.strip()).groups()  # type: ignore[union-attr]
    factor = {'min': 60, 'h': 3600, 'd': 86400}[unit]
    if int(amount) * factor <= 0 or seconds / (int(amount) * factor) > 1000:
        raise ValueError('requested ephemeris may contain at most 1,000 output samples')
