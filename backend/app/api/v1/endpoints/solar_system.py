import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from app.schemas.astronomy import CelestialBody, EphemerisTrack, MarsSystemResponse, PositionsResponse
from app.services.astronomy_service import (
    CENTERS, HORIZONS_IDS, MOON_IDS, PLANET_IDS, get_body, get_ephemeris_track,
    list_bodies, validate_time_span,
)

router = APIRouter(prefix='/solar-system', tags=['solar system'])


def _parse_epoch(value: str | None) -> str:
    if value is None:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise HTTPException(422, 'epoch must be an ISO-8601 date/time') from error
    if parsed.tzinfo is None:
        raise HTTPException(422, 'epoch must include a timezone')
    return parsed.astimezone(timezone.utc).isoformat()


@router.get('/bodies', response_model=list[CelestialBody])
async def bodies():
    return list_bodies()


@router.get('/bodies/{body_id}', response_model=CelestialBody)
async def body_details(body_id: str):
    result = get_body(body_id)
    if result is None:
        raise HTTPException(404, 'Celestial body not found')
    return result


@router.get('/moons', response_model=list[CelestialBody])
async def mars_moons():
    return [get_body(moon_id) for moon_id in MOON_IDS]


@router.get('/moons/{moon_id}', response_model=CelestialBody)
async def mars_moon_details(moon_id: str):
    if moon_id.lower() not in MOON_IDS:
        raise HTTPException(404, 'Mars moon not found')
    return get_body(moon_id)


@router.get('/positions', response_model=PositionsResponse)
async def positions(
    target: str | None = Query(None, description='One body id, or use targets for a batch'),
    targets: str | None = Query(None, description='Comma-separated body IDs'),
    center: str = Query('sun', description='Coordinate origin: sun or mars'),
    epoch: str | None = Query(None, description='ISO-8601 epoch with timezone; omitted means current UTC'),
    start_time: str | None = Query(None),
    stop_time: str | None = Query(None),
    step_size: str = Query('15 d', description='Horizons output interval, e.g. 15 d'),
):
    if center not in CENTERS:
        raise HTTPException(422, 'center must be sun or mars')
    if bool(target) == bool(targets):
        raise HTTPException(422, 'Supply exactly one of target or targets')
    selected = [item.strip().lower() for item in (targets.split(',') if targets else [target or ''])]
    if not selected or len(selected) > 8 or len(set(selected)) != len(selected):
        raise HTTPException(422, 'Supply one to eight unique targets')
    if any(item not in HORIZONS_IDS for item in selected):
        raise HTTPException(422, 'One or more target IDs are not supported')
    if center == 'sun' and any(item in MOON_IDS for item in selected):
        raise HTTPException(422, 'Phobos and Deimos positions must use the Mars-centered frame')
    if center == 'mars' and any(item in PLANET_IDS for item in selected if item not in MOON_IDS):
        raise HTTPException(422, 'Planetary overview targets must use the Sun-centered frame')
    if epoch and start_time:
        raise HTTPException(422, 'Use epoch or a time range, not both')
    try:
        validate_time_span(start_time, stop_time, step_size)
    except (ValueError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
    request_epoch = _parse_epoch(epoch) if not start_time else None
    results = await asyncio.gather(*[
        get_ephemeris_track(item, center, epoch=request_epoch, start_time=start_time, stop_time=stop_time, step_size=step_size)
        for item in selected
    ])
    return PositionsResponse(coordinate_frame='Horizons ECLIPTIC plane, ICRF frame; origin is the selected center body.', tracks=results)


@router.get('/mars-system', response_model=MarsSystemResponse)
async def mars_system(
    epoch: str | None = Query(None, description='Common ISO-8601 UTC epoch; omitted means current UTC'),
    orbit_window_hours: int = Query(48, ge=8, le=96),
    orbit_step_hours: int = Query(2, ge=1, le=12),
):
    selected_epoch = _parse_epoch(epoch)
    instant = datetime.fromisoformat(selected_epoch)
    start = (instant - timedelta(hours=orbit_window_hours / 2)).isoformat()
    stop = (instant + timedelta(hours=orbit_window_hours / 2)).isoformat()
    step = f'{orbit_step_hours} h'
    # All four targets use the same Mars-centered inertial frame. The moon
    # tracks span the epoch to draw orbits; Earth and Sun are point states.
    moon_tracks = [get_ephemeris_track(item, 'mars', start_time=start, stop_time=stop, step_size=step) for item in MOON_IDS]
    context_tracks = [get_ephemeris_track(item, 'mars', epoch=selected_epoch, step_size=step) for item in ('sun', 'earth')]
    tracks = await asyncio.gather(*(moon_tracks + context_tracks))
    return MarsSystemResponse(coordinate_frame='Horizons ECLIPTIC plane, ICRF frame; origin is the center of Mars (500@499).', tracks=tracks)
