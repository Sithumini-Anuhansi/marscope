import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CameraFlyTo, Entity, Globe, ImageryLayer, ScreenSpaceEvent, ScreenSpaceEventHandler, Viewer, useCesium } from 'resium'
import { Cartesian3, Cartographic, Color, Ellipsoid, ScreenSpaceEventType } from 'cesium'
import { AlertTriangle, LoaderCircle, MapPin, RotateCcw, Route as RouteIcon } from 'lucide-react'
import { createImageryProvider } from '../services/marsImageryService'
import { generateRoute, getRoutePlannerStatus } from '../services/routeService'
import type { GenerateRouteInput } from '../services/routeService'
import type { MarsRoutePoint, RouteCandidate, RouteGeometry, RoutePlanResponse, RoutePlannerStatus } from '../types/route'
import { geodeticToPlanetocentricLatitude, planetocentricToGeodeticLatitude } from '../utils/marsCoordinates'

type Target = 'start' | 'destination'
const CREW = [
  { id: 'crew-01', name: 'Asha Raman' },
  { id: 'crew-02', name: 'Mateo Silva' },
  { id: 'crew-03', name: 'Nia Okafor' },
  { id: 'crew-04', name: 'Owen Park' },
]
const ROUTE_COLORS = ['#e5b84b', '#8e8bf2', '#4dc6bc']

function routeSegments(geometry: RouteGeometry): [number, number][][] {
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
}

function RouteMap({
  picking,
  points,
  result,
  selectedRouteId,
  onMapPoint,
}: {
  picking: Target | null
  points: Partial<Record<Target, MarsRoutePoint>>
  result: RoutePlanResponse | null
  selectedRouteId: string | null
  onMapPoint: (point: MarsRoutePoint) => void
}) {
  const imageryProvider = useMemo(() => {
    try { return createImageryProvider('viking-mdim') } catch { return undefined }
  }, [])
  const routes = [result?.recommended_route, ...(result?.alternative_routes ?? [])].filter((item): item is RouteCandidate => Boolean(item))
  const startDisplayLat = points.start ? planetocentricToGeodeticLatitude(points.start.latitude_deg) : null
  const destinationDisplayLat = points.destination ? planetocentricToGeodeticLatitude(points.destination.latitude_deg) : null

  return (
    <div className="relative h-[min(65vh,44rem)] min-h-[25rem] overflow-hidden rounded-2xl border border-line bg-[#070605]">
      <Viewer full ellipsoid={Ellipsoid.MARS} baseLayer={false} animation={false} timeline={false} geocoder={false} homeButton={false} sceneModePicker={false} navigationHelpButton={false} fullscreenButton={false} infoBox={false} selectionIndicator={false} skyAtmosphere={false}>
        <Globe showGroundAtmosphere={false} baseColor={Color.fromCssColorString('#6b2d22')} />
        {imageryProvider ? <ImageryLayer imageryProvider={imageryProvider} /> : null}
        {points.start && startDisplayLat !== null ? <Entity name="Route start" position={Cartesian3.fromDegrees(points.start.longitude_deg, startDisplayLat, 0, Ellipsoid.MARS)} point={{ pixelSize: 13, color: Color.fromCssColorString('#57c8d5'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: 'START', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, font: '11px IBM Plex Mono', disableDepthTestDistance: Number.POSITIVE_INFINITY }} /> : null}
        {points.destination && destinationDisplayLat !== null ? <Entity name="Route destination" position={Cartesian3.fromDegrees(points.destination.longitude_deg, destinationDisplayLat, 0, Ellipsoid.MARS)} point={{ pixelSize: 13, color: Color.fromCssColorString('#c792ea'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: 'DESTINATION', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, font: '11px IBM Plex Mono', disableDepthTestDistance: Number.POSITIVE_INFINITY }} /> : null}
        {routes.flatMap((route, index) => routeSegments(route.geometry).map((segment, segmentIndex) => (
          <Entity key={`${route.route_id}-${segmentIndex}`} name={`${route.objective} route`} polyline={{
            positions: segment.map(([longitude, latitude]) => Cartesian3.fromDegrees(longitude, planetocentricToGeodeticLatitude(latitude), 0, Ellipsoid.MARS)),
            width: route.route_id === selectedRouteId ? 5 : index === 0 ? 4 : 2,
            material: Color.fromCssColorString(ROUTE_COLORS[index % ROUTE_COLORS.length]).withAlpha(route.route_id === selectedRouteId ? 0.95 : 0.65),
            clampToGround: true,
          }} />
        )))}
        {routes.flatMap((route) => route.encountered_hazards.map((hazard, index) => <Entity key={`${route.route_id}-hazard-${index}`} name="Policy-classified route hazard" position={Cartesian3.fromDegrees(hazard.longitude_deg, planetocentricToGeodeticLatitude(hazard.latitude_deg), 0, Ellipsoid.MARS)} point={{ pixelSize: 10, color: Color.RED, outlineColor: Color.BLACK, outlineWidth: 2 }} />))}
        <CameraFlyTo destination={Cartesian3.fromDegrees(0, 10, 16_000_000, Ellipsoid.MARS)} duration={0} once />
        <RouteMapClick picking={picking} onMapPoint={onMapPoint} />
      </Viewer>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-void/90 px-3 py-2 text-[10px] text-muted"><span className="font-mono text-gold">MARS 2000</span> · Planetocentric latitude · Positive-east longitude</div>
      {picking ? <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-gold/40 bg-void/90 px-3 py-2 text-xs text-gold">Click the globe to set {picking === 'start' ? 'the start point' : 'the destination'}.</div> : null}
      <div className="pointer-events-none absolute bottom-3 right-3 flex gap-3 rounded-lg border border-line bg-void/90 px-3 py-2 text-[9px] text-muted"><span className="text-[#e5b84b]">Recommended</span><span className="text-[#8e8bf2]">Alternative</span><span className="text-red-400">Policy hazard</span></div>
    </div>
  )
}

function RouteMapClick({ picking, onMapPoint }: { picking: Target | null; onMapPoint: (point: MarsRoutePoint) => void }) {
  const { viewer } = useCesium()
  return <ScreenSpaceEventHandler>
    <ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={(event) => {
      if (!picking || !viewer) return
      const position = 'position' in event ? event.position : event.endPosition
      const surface = viewer.camera.pickEllipsoid(position, Ellipsoid.MARS)
      if (!surface) return
      const coordinates = Cartographic.fromCartesian(surface, Ellipsoid.MARS)
      const latitude = geodeticToPlanetocentricLatitude(coordinates.latitude * 180 / Math.PI)
      const longitude = ((coordinates.longitude * 180 / Math.PI + 180) % 360 + 360) % 360 - 180
      onMapPoint({ latitude_deg: latitude, longitude_deg: longitude, latitude_type: 'planetocentric', longitude_direction: 'positive-east' })
    }} />
  </ScreenSpaceEventHandler>
}

export function RoutePlanningPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<RoutePlannerStatus | null>(null)
  const [points, setPoints] = useState<Partial<Record<Target, MarsRoutePoint>>>(() => {
    const latitude = Number(searchParams.get('start_latitude_deg'))
    const longitude = Number(searchParams.get('start_longitude_deg'))
    if (!searchParams.has('start_latitude_deg') || !searchParams.has('start_longitude_deg') || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return {}
    return { start: { latitude_deg: geodeticToPlanetocentricLatitude(latitude), longitude_deg: longitude, latitude_type: 'planetocentric', longitude_direction: 'positive-east' } }
  })
  const [picking, setPicking] = useState<Target | null>(null)
  const [maximumResolution, setMaximumResolution] = useState('5')
  const [maximumSlope, setMaximumSlope] = useState('')
  const [slopePenalty, setSlopePenalty] = useState('')
  const [roughnessPenalty, setRoughnessPenalty] = useState('')
  const [objective, setObjective] = useState<GenerateRouteInput['mission_objective']>('balanced')
  const [astronautId, setAstronautId] = useState('')
  const [avoidHazards, setAvoidHazards] = useState(true)
  const [result, setResult] = useState<RoutePlanResponse | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getRoutePlannerStatus(controller.signal).then(setStatus).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Route planner status is unavailable.')
    })
    return () => controller.abort()
  }, [])

  function setCoordinate(target: Target, key: 'latitude_deg' | 'longitude_deg', value: string) {
    const numeric = Number(value)
    setPoints((current) => {
      const previous = current[target] ?? { latitude_deg: 0, longitude_deg: 0, latitude_type: 'planetocentric' as const, longitude_direction: 'positive-east' as const }
      return { ...current, [target]: { ...previous, [key]: Number.isFinite(numeric) ? numeric : NaN } }
    })
  }

  function applyMapPoint(point: MarsRoutePoint) {
    if (!picking) return
    setPoints((current) => ({ ...current, [picking]: point }))
    setPicking(null)
    setResult(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setResult(null)
    setSelectedRouteId(null)
    const start = points.start
    const destination = points.destination
    if (!start || !destination || ![start.latitude_deg, start.longitude_deg, destination.latitude_deg, destination.longitude_deg].every(Number.isFinite)) {
      setError('Choose valid start and destination coordinates on the map or enter them below.')
      return
    }
    const maxCell = Number(maximumResolution)
    const slopeWeight = Number(slopePenalty)
    const roughnessWeight = Number(roughnessPenalty)
    const maxSlope = maximumSlope.trim() ? Number(maximumSlope) : undefined
    if (!Number.isFinite(maxCell) || maxCell <= 0 || !Number.isFinite(slopeWeight) || slopeWeight < 0 || !Number.isFinite(roughnessWeight) || roughnessWeight < 0 || (maxSlope !== undefined && (!Number.isFinite(maxSlope) || maxSlope < 0 || maxSlope > 90))) {
      setError('Enter a positive source resolution, non-negative terrain cost weights, and an optional slope limit from 0° to 90°.')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    try {
      const response = await generateRoute({
        start, destination, maximum_source_cell_km: maxCell,
        ...(maxSlope !== undefined ? { maximum_slope_deg: maxSlope } : {}),
        slope_penalty_per_degree: slopeWeight,
        roughness_penalty_per_meter: roughnessWeight,
        avoid_policy_classified_high_hazards: avoidHazards,
        alternative_count: 2, mission_objective: objective,
        ...(astronautId ? { astronaut_id: astronautId } : {}),
      }, controller.signal)
      setResult(response)
      setSelectedRouteId(response.recommended_route?.route_id ?? response.alternative_routes[0]?.route_id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Route generation failed.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setPoints({})
    setResult(null)
    setSelectedRouteId(null)
    setPicking(null)
    setError(null)
  }

  const routes = [result?.recommended_route, ...(result?.alternative_routes ?? [])].filter((route): route is RouteCandidate => Boolean(route))
  const selectedRoute = routes.find((route) => route.route_id === selectedRouteId) ?? null
  const inputClass = 'mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-xs text-sand outline-none focus:border-gold'

  return <div className="mx-auto flex max-w-7xl flex-col gap-5">
    <header><p className="font-mono text-[10px] tracking-[0.26em] text-gold uppercase">Navigation · terrain-cost candidates</p><h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Route planning</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Select points on the Mars globe and request A* candidates from processed terrain. The current global MOLA sample is about 14.8 km per cell; it is too coarse for local EVA navigation, and missing hazards never mean safe terrain.</p></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
      <RouteMap picking={picking} points={points} result={result} selectedRouteId={selectedRouteId} onMapPoint={applyMapPoint} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-panel/80 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-sand">Mission route inputs</h2><p className="mt-1 text-[10px] text-muted">Select a field, then click Mars; manual coordinates are also supported.</p></div><RouteIcon className="h-4 w-4 text-gold" aria-hidden="true" /></div>
        {(['start', 'destination'] as const).map((target) => (
          <section key={target} className="rounded-xl border border-line bg-void/45 p-3">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium text-sand">{target === 'start' ? 'Start point' : 'Destination'}</h3><button type="button" onClick={() => setPicking(target)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] ${picking === target ? 'border-gold/50 bg-gold/10 text-gold' : 'border-line text-muted hover:text-sand'}`}><MapPin size={12} />{picking === target ? 'Click map…' : 'Select on map'}</button></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] text-muted">Planetocentric lat °<input required type="number" step="any" min="-90" max="90" className={inputClass} value={points[target]?.latitude_deg ?? ''} onChange={(event) => setCoordinate(target, 'latitude_deg', event.target.value)} /></label><label className="text-[10px] text-muted">East lon °<input required type="number" step="any" min="-180" max="360" className={inputClass} value={points[target]?.longitude_deg ?? ''} onChange={(event) => setCoordinate(target, 'longitude_deg', event.target.value)} /></label></div>
          </section>
        ))}
        <div className="grid grid-cols-2 gap-3"><label className="text-[10px] text-muted">Maximum accepted source cell km<input required type="number" min="0.001" step="any" className={inputClass} value={maximumResolution} onChange={(event) => setMaximumResolution(event.target.value)} /><span className="mt-1 block text-[9px]">Mission constraint; current sample ≈ {status?.source?.cell_resolution_km?.toFixed(3) ?? '—'} km/cell.</span></label><label className="text-[10px] text-muted">Maximum slope ° (optional)<input type="number" min="0.001" max="90" step="any" className={inputClass} value={maximumSlope} onChange={(event) => setMaximumSlope(event.target.value)} /></label></div>
        <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-[10px] text-muted">Terrain cost weights · user-selected, not calibrated</legend><div className="grid grid-cols-2 gap-3"><label className="text-[10px] text-muted">Slope penalty per degree<input required type="number" min="0" step="any" className={inputClass} value={slopePenalty} onChange={(event) => setSlopePenalty(event.target.value)} /></label><label className="text-[10px] text-muted">Roughness penalty per meter<input required type="number" min="0" step="any" className={inputClass} value={roughnessPenalty} onChange={(event) => setRoughnessPenalty(event.target.value)} /></label></div><label className="mt-3 block text-[10px] text-muted">Route objective<select className={inputClass} value={objective} onChange={(event) => setObjective(event.target.value as GenerateRouteInput['mission_objective'])}><option value="balanced">Balanced selected weights</option><option value="minimize_slope">Prefer lower slope</option><option value="minimize_roughness">Prefer lower roughness</option></select></label></fieldset>
        <label className="text-[10px] text-muted">Assign route to astronaut<select className={inputClass} value={astronautId} onChange={(event) => setAstronautId(event.target.value)}><option value="">Unassigned</option>{CREW.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="flex items-start gap-2 text-[10px] leading-relaxed text-sand"><input type="checkbox" checked={avoidHazards} onChange={(event) => setAvoidHazards(event.target.checked)} className="mt-0.5 accent-[#c24a32]" />Avoid high/critical cells only where a reviewed cited policy classifies them. Missing hazard data stays unknown.</label>
        {status ? <div className="rounded-lg border border-line bg-void/50 p-3 text-[10px] text-muted"><p className="font-mono text-gold uppercase">Planner · {status.status}</p><p className="mt-1">{status.warning ?? status.message}</p><p className="mt-1">Hazards: {status.hazards ?? 'Not reported'}</p></div> : <p className="text-[10px] text-muted">Checking route data readiness…</p>}
        {error ? <p role="alert" className="rounded-lg border border-mars/30 bg-mars/5 p-3 text-[10px] text-mars">{error}</p> : null}
        <div className="mt-auto grid grid-cols-2 gap-2"><button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs font-medium text-gold hover:bg-gold/15 disabled:opacity-50">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RouteIcon size={14} />}{loading ? 'Calculating…' : 'Generate candidates'}</button><button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs text-muted hover:text-sand"><RotateCcw size={14} />Reset route</button></div>
      </form>
    </div>
    {result ? <section className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3"><div><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Route request · {result.status}</p><h2 className="mt-1 text-lg font-semibold text-sand">{result.recommended_route ? 'Terrain-cost route candidates' : 'No route generated'}</h2></div><span className="rounded-full border border-warn/35 px-2.5 py-1 font-mono text-[9px] text-warn uppercase">Decision support only</span></div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{result.risk_summary}</p>
      {result.missing_information.length ? <ul className="mt-3 grid gap-1 text-[10px] text-muted sm:grid-cols-2">{result.missing_information.map((item) => <li key={item}>• {item}</li>)}</ul> : null}
      {routes.length ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{routes.map((route, index) => <button type="button" key={route.route_id} onClick={() => setSelectedRouteId(route.route_id)} className={`rounded-xl border p-3 text-left ${route.route_id === selectedRouteId ? 'border-gold/50 bg-gold/5' : 'border-line bg-void/45'}`}><p className="font-mono text-[9px] uppercase" style={{ color: ROUTE_COLORS[index % ROUTE_COLORS.length] }}>{index === 0 ? 'Recommended objective' : 'Alternative'} · {route.objective.replaceAll('_', ' ')}</p><p className="mt-2 text-lg font-semibold text-sand">{route.distance_km.toFixed(2)} km</p><p className="mt-1 text-[10px] text-muted">relative cost {route.cost_value.toFixed(2)} · {route.waypoint_count} cells</p><dl className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-muted"><div>Mean slope<dd className="font-mono text-sand">{route.terrain_summary.mean_slope_deg.toFixed(2)}°</dd></div><div>Max slope<dd className="font-mono text-sand">{route.terrain_summary.maximum_slope_deg.toFixed(2)}°</dd></div><div>Mean roughness<dd className="font-mono text-sand">{route.terrain_summary.mean_roughness_m.toFixed(1)} m</dd></div><div>Known hazards<dd className="font-mono text-sand">{route.encountered_hazards.length}</dd></div></dl><p className="mt-3 text-[9px] leading-relaxed text-muted">{route.risk_summary}</p></button>)}</div> : null}
      {selectedRoute ? <div className="mt-4 grid gap-3 rounded-xl border border-line bg-void/40 p-3 text-[10px] md:grid-cols-3"><p><span className="text-muted">Selected route:</span> <span className="font-mono text-sand">{selectedRoute.route_id.slice(0, 8)}</span></p><p><span className="text-muted">Source:</span> <span className="text-sand">{result.source?.product_id} · {result.source?.cell_resolution_km.toFixed(3)} km/cell</span></p><p><span className="text-muted">Travel time:</span> <span className="text-sand">Not estimated</span></p></div> : null}
      <div className="mt-4 flex gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[10px] leading-relaxed text-muted"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /><p>{result.assumptions.join(' ')} {result.source?.quality}</p></div>
    </section> : <section className="rounded-2xl border border-dashed border-line bg-panel/40 p-5 text-center"><p className="text-sm font-medium text-sand">No route calculation yet</p><p className="mt-2 text-xs text-muted">Use the map to choose endpoints. If source resolution is too coarse, the API returns unavailable and will not draw a route.</p></section>}
  </div>
}
