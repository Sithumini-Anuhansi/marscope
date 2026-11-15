import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUpRight, LocateFixed, MapPin, Radio, Search, ShieldCheck, Users } from 'lucide-react'
import { MarsGlobe } from '../components/map/MarsGlobe'
import { MapErrorBoundary } from '../components/map/MapErrorBoundary'
import whereAmIImage from '../assets/branding/where-am-i.jpeg'
import { discoverNearby, type NearbyDiscovery } from '../services/nearbyDiscoveryService'
import { getMissionCrew, type Astronaut } from '../services/crewService'
import { getHazardAssessmentAtLocation } from '../services/hazardService'
import type { HazardLocationResponse } from '../types/hazard'
import { getSurvivalSummary, type SurvivalSummary } from '../services/survivalService'
import { formatLonLat, geodeticToPlanetocentricLatitude } from '../utils/marsCoordinates'

type PositionSource = 'manual' | 'mission-tracking' | 'last-known' | 'imported' | 'earth-gps'
type BodyId = 'earth' | 'mars' | 'moon' | 'mercury' | 'venus' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'
interface LocatedPosition { bodyId: BodyId; latitudeDeg: number; longitudeDeg: number; source: PositionSource; timestamp: string; accuracyMeters?: number; astronautName?: string }
const STORAGE_KEY = 'marscope.where-am-i.last-position'
const sourceNames: Record<PositionSource, string> = { manual: 'Manual surface coordinates', 'mission-tracking': 'Mission tracking feed', 'last-known': 'Locally saved last-known position', imported: 'Imported navigation file', 'earth-gps': 'Browser GPS (Earth)' }
const BODY_NAMES: Record<BodyId, string> = { earth: 'Earth', mars: 'Mars', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' }

function validPosition(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}

export function WhereAmIPage() {
  const [position, setPosition] = useState<LocatedPosition | null>(() => {
    if (typeof window === 'undefined') return null
    try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as LocatedPosition | null; return parsed && validPosition(parsed.latitudeDeg, parsed.longitudeDeg) ? { ...parsed, bodyId: parsed.bodyId ?? 'mars' } : null } catch { return null }
  })
  const [selectedBody, setSelectedBody] = useState<BodyId>(() => {
    try { return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as LocatedPosition | null)?.bodyId ?? 'mars' } catch { return 'mars' }
  })
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [crew, setCrew] = useState<Astronaut[]>([])
  const [selectedCrew, setSelectedCrew] = useState('')
  const [crewError, setCrewError] = useState<string | null>(null)
  const [nearby, setNearby] = useState<NearbyDiscovery | null>(null)
  const [nearbyError, setNearbyError] = useState<string | null>(null)
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [terrainResult, setTerrainResult] = useState<{ key: string; response: HazardLocationResponse } | null>(null)
  const [terrainFailure, setTerrainFailure] = useState<{ key: string; message: string } | null>(null)
  const [resources, setResources] = useState<SurvivalSummary | null>(null)
  const [resourceError, setResourceError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [followCrew, setFollowCrew] = useState(false)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const terrainKey = position?.bodyId === 'mars' ? `${position.bodyId}:${position.latitudeDeg}:${position.longitudeDeg}` : null
  const terrainAssessment = terrainResult?.key === terrainKey ? terrainResult.response : null
  const terrainError = terrainFailure?.key === terrainKey ? terrainFailure.message : null
  const terrainLoading = Boolean(terrainKey && !terrainAssessment && !terrainError)

  useEffect(() => {
    void getMissionCrew().then((result) => { setCrew(result.astronauts); setCrewError(null) }).catch((error: unknown) => setCrewError(error instanceof Error ? error.message : 'Mission tracking is unavailable.'))
    void getSurvivalSummary('ares-iv').then(setResources).catch((error: unknown) => setResourceError(error instanceof Error ? error.message : 'Mission resource service is unavailable.'))
  }, [])

  useEffect(() => {
    if (!followCrew || !selectedCrew) return
    let active = true
    const refresh = async () => {
      try {
        const result = await getMissionCrew()
        if (!active) return
        setCrew(result.astronauts)
        const member = result.astronauts.find((person) => person.id === selectedCrew)
        if (member?.latitude_deg != null && member.longitude_deg != null) {
          const next: LocatedPosition = { bodyId: 'mars', latitudeDeg: member.latitude_deg, longitudeDeg: member.longitude_deg, source: 'mission-tracking', timestamp: member.location_timestamp ?? new Date().toISOString(), astronautName: member.name }
          setPosition(next)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
          setCrewError(null)
        }
      } catch (error) {
        if (active) setCrewError(error instanceof Error ? error.message : 'Mission tracking is unavailable.')
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 5000)
    return () => { active = false; window.clearInterval(interval) }
  }, [followCrew, selectedCrew])

  useEffect(() => {
    if (!gpsTracking) return
    if (!navigator.geolocation) { setGpsError('This browser does not provide geolocation.'); setGpsTracking(false); return }
    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        setGpsError(null)
        setSelectedBody('earth')
        const next: LocatedPosition = { bodyId: 'earth', latitudeDeg: fix.coords.latitude, longitudeDeg: fix.coords.longitude, accuracyMeters: fix.coords.accuracy, source: 'earth-gps', timestamp: new Date(fix.timestamp).toISOString() }
        setPosition(next); setLatitude(String(next.latitudeDeg)); setLongitude(String(next.longitudeDeg))
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
      },
      (error) => setGpsError(error.message || 'GPS fix unavailable.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [gpsTracking])

  useEffect(() => {
    if (!position || position.bodyId !== 'mars') return
    const controller = new AbortController()
    const key = `${position.bodyId}:${position.latitudeDeg}:${position.longitudeDeg}`
    void getHazardAssessmentAtLocation(
      geodeticToPlanetocentricLatitude(position.latitudeDeg),
      position.longitudeDeg,
      controller.signal,
    ).then((response) => { setTerrainResult({ key, response }); setTerrainFailure(null) })
      .catch((error: unknown) => { if (!controller.signal.aborted) setTerrainFailure({ key, message: error instanceof Error ? error.message : 'MOLA terrain assessment is unavailable.' }) })
    return () => controller.abort()
  }, [position])

  useEffect(() => {
    if (!position || position.bodyId !== 'mars') { setNearby(null); setNearbyError(null); setLoadingNearby(false); return }
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoadingNearby(true); setNearbyError(null)
      void discoverNearby(position.latitudeDeg, position.longitudeDeg).then((result) => { if (active) setNearby(result) }).catch((error: unknown) => { if (active) setNearbyError(error instanceof Error ? error.message : 'Nearby mission data is unavailable.') }).finally(() => { if (active) setLoadingNearby(false) })
    })
    return () => { active = false }
  }, [position])

  const locationText = useMemo(() => position ? formatLonLat(position) : 'Position not identified', [position])
  const focusLatitude = position?.latitudeDeg
  const focusLongitude = position?.longitudeDeg
  const mapFocus = useMemo(() => position?.bodyId !== 'mars' || focusLatitude == null || focusLongitude == null ? null : { latitudeDeg: focusLatitude, longitudeDeg: focusLongitude }, [position?.bodyId, focusLatitude, focusLongitude])
  const filteredObservations = (nearby?.observations ?? []).filter((item) => filter === 'all' || item.category === filter)

  function setLocated(next: LocatedPosition) {
    setPosition(next); setSelectedBody(next.bodyId); setLatitude(String(next.latitudeDeg)); setLongitude(String(next.longitudeDeg)); setNotice(`${sourceNames[next.source]} selected for ${BODY_NAMES[next.bodyId]}. Coordinates use body-fixed geodetic latitude and east-positive longitude.`)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
  }
  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const lat = Number(latitude); const lon = Number(longitude)
    if (!validPosition(lat, lon)) { setNotice(`Enter valid ${BODY_NAMES[selectedBody]} body-fixed geodetic latitude (−90° to 90°) and east-positive longitude (−180° to 180°).`); return }
    setFollowCrew(false)
    setLocated({ bodyId: selectedBody, latitudeDeg: lat, longitudeDeg: lon, source: 'manual', timestamp: new Date().toISOString() })
  }
  function chooseCrew(member: Astronaut | undefined) {
    if (!member || member.latitude_deg == null || member.longitude_deg == null) { setFollowCrew(false); setNotice('This crew member has no tracked position yet.'); return }
    setSelectedBody('mars'); setFollowCrew(true)
    setLocated({ bodyId: 'mars', latitudeDeg: member.latitude_deg, longitudeDeg: member.longitude_deg, source: 'mission-tracking', timestamp: member.location_timestamp ?? new Date().toISOString(), astronautName: member.name })
  }
  async function importNavigation(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>
      const lat = data.latitude_deg; const lon = data.longitude_deg
      if (typeof lon !== 'number' || !validPosition(lat, lon) || data.latitude_type !== 'geodetic' || data.longitude_direction !== 'east-positive') throw new Error('File must provide valid latitude_deg/longitude_deg plus latitude_type "geodetic" and longitude_direction "east-positive".')
      const accuracy = typeof data.accuracy_m === 'number' && data.accuracy_m >= 0 ? data.accuracy_m : undefined
      const timestamp = typeof data.timestamp === 'string' && !Number.isNaN(Date.parse(data.timestamp)) ? new Date(data.timestamp).toISOString() : new Date().toISOString()
      const bodyId = typeof data.body_id === 'string' && data.body_id in BODY_NAMES ? data.body_id as BodyId : selectedBody
      setLocated({ bodyId, latitudeDeg: lat, longitudeDeg: lon, source: 'imported', timestamp, ...(accuracy === undefined ? {} : { accuracyMeters: accuracy }) })
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read the navigation file.') }
    event.target.value = ''
  }
  function answer(question: string) {
    if (!position) return 'Identify a location first. A browser can provide Earth GPS only; another world needs mission telemetry or an explicit body-fixed coordinate.'
    if (question === 'Where am I?') return `${BODY_NAMES[position.bodyId]}: ${locationText}. Source: ${sourceNames[position.source]}; update ${new Date(position.timestamp).toLocaleString()}.`
    if (position.bodyId !== 'mars') return 'Nearby crew reports, MOLA terrain, hazards, and resources are Mars-only data and are not queried for this body.'
    if (question === 'Any reported danger nearby?') {
      const dangers = nearby?.observations.filter((item) => item.category === 'danger') ?? []
      return nearbyError ? 'Observation service unavailable; nearby danger status is unknown.' : dangers.length ? `${dangers.length} crew-reported danger observation(s) within 25 km. Reports are not independently validated.` : 'No danger reports found in the available observation feed within 25 km. This does not establish that the area is safe.'
    }
    if (question === 'Nearest crew member?') return crewError ? 'Mission tracking is unavailable; nearest crew cannot be determined.' : nearby?.crew[0] ? `${nearby.crew[0].name} is approximately ${nearby.crew[0].distanceKm?.toFixed(1)} km away (${nearby.crew[0].status}).` : 'No tracked crew position was returned within 25 km.'
    if (question === 'Nearest shelter report?') { const shelter = nearby?.observations.find((item) => item.category === 'shelter'); return shelter ? `Crew report at approximately ${shelter.distanceKm.toFixed(1)} km; verification: ${shelter.verification_status}. Treat as unconfirmed until mission control validates it.` : 'No nearby shelter report is available. No shelter candidate is confirmed.' }
    if (resourceError) return `Mission resource service unavailable: ${resourceError}`
    const measured = resources?.resources ?? []
    if (!resources || measured.length === 0) return 'No measured resource inventory is available. Endurance and travel distance cannot be estimated from missing telemetry.'
    const estimates = measured.map((item) => `${item.resource}: ${item.days_remaining == null ? 'endurance unavailable' : `about ${item.days_remaining.toFixed(1)} days`} (${item.amount} ${item.unit} available; ${item.confidence})`)
    return `${estimates.join('; ')}. These measured resource estimates do not calculate travel distance or authorize a route.`
  }

  return <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
    <section className="grid gap-5 overflow-hidden rounded-2xl border border-line bg-[radial-gradient(ellipse_at_72%_10%,rgba(138,62,36,.38),transparent_42%),linear-gradient(135deg,#15110e,#080706_68%)] p-5 md:grid-cols-[minmax(18rem,.7fr)_minmax(0,1.3fr)] md:p-7">
      <div className="flex flex-col justify-between gap-6"><img src={whereAmIImage} alt="Astronaut looking across a sunlit Martian landscape" className="block h-36 w-full rounded-lg border border-line object-cover object-[center_47%]"/><div><p className="font-mono text-[11px] tracking-[.3em] text-gold uppercase">Interplanetary position tracking</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-sand md:text-6xl">WHERE AM I<span className="text-mars">?</span></h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">Track an Earth GPS fix or follow mission telemetry, and locate a body-fixed position anywhere in the Solar System. Scientific surface analysis is shown only where MARSCOPE has data.</p><a href="#identify" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-mars px-5 py-3 text-sm font-semibold text-white hover:bg-[#aa503a]"><LocateFixed className="h-4 w-4"/>Identify My Location</a></div><div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-muted"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn"/>Browser GPS reports the device on Earth. A Mars or spacecraft position requires a live mission telemetry source; this app cannot infer one from browser GPS.<Link to="/solar-system" className="ml-auto shrink-0 text-gold hover:text-sand">Solar system view ↗</Link></div></div>
      <div className="min-h-[24rem] md:min-h-[34rem]">{position?.bodyId === 'mars' || !position ? <MapErrorBoundary><MarsGlobe focusLocation={mapFocus} onSurfaceSelect={(point) => { setFollowCrew(false); setSelectedBody('mars'); setLocated({ ...point, bodyId: 'mars', source: 'manual', timestamp: new Date().toISOString() }) }} crewMarkers={(nearby?.crew ?? []).flatMap((member) => member.latitude_deg == null || member.longitude_deg == null ? [] : [{ id: member.id, name: member.name, latitudeDeg: member.latitude_deg, longitudeDeg: member.longitude_deg, status: member.status }])} observationMarkers={(nearby?.observations ?? []).map((item) => ({ id: item.id, label: item.category, latitudeDeg: item.latitude_deg, longitudeDeg: item.longitude_deg, category: item.category, verificationStatus: item.verification_status }))}/></MapErrorBoundary> : <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-line bg-void p-8 text-center"><MapPin className="h-10 w-10 text-gold"/><p className="mt-4 text-xl font-semibold text-sand">{BODY_NAMES[position.bodyId]}</p><p className="mt-2 max-w-md text-sm text-muted">Body-fixed coordinates are tracked for this world. Mars-only terrain layers are hidden here. Open the Solar System Explorer to view current JPL Horizons planetary positions.</p><Link to="/solar-system" className="mt-4 rounded-lg border border-line px-4 py-2 text-sm text-gold hover:bg-panel">Open Solar System Explorer</Link></div>}</div>
    </section>

    <section id="identify" className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">Position acquisition</p><h2 className="mt-1 text-lg font-semibold text-sand">Choose a location source</h2></div><MapPin className="h-5 w-5 text-mars"/></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form onSubmit={submitManual} className="space-y-3 rounded-xl border border-line bg-void/60 p-4"><h3 className="text-sm font-medium text-sand">Enter body-fixed coordinates</h3><label className="block text-xs text-muted">Body<select value={selectedBody} onChange={(event) => { setSelectedBody(event.target.value as BodyId); setFollowCrew(false); setGpsTracking(false) }} className="mt-1 w-full rounded-lg border border-line bg-void px-3 py-2 text-sm text-sand">{Object.entries(BODY_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="block text-xs text-muted">Geodetic latitude · degrees<input className="mt-1 w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-sm text-sand" type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="−90 to 90"/></label><label className="block text-xs text-muted">East-positive longitude · degrees<input className="mt-1 w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-sm text-sand" type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="−180 to 180"/></label><button className="w-full rounded-lg border border-mars/40 px-3 py-2 text-sm text-sand hover:bg-mars/10">Use these coordinates</button></form>
          <div className="space-y-3 rounded-xl border border-line bg-void/60 p-4"><h3 className="text-sm font-medium text-sand">Live and navigation sources</h3><button type="button" onClick={() => { setFollowCrew(false); setSelectedCrew(''); setGpsTracking((current) => !current) }} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-sand hover:bg-panel-alt">{gpsTracking ? 'Stop Earth GPS tracking' : 'Start live Earth GPS tracking'}</button>{gpsError ? <p role="alert" className="text-xs text-warn">GPS: {gpsError}</p> : null}<label className="block text-xs text-muted">Follow Mars crew position<select value={selectedCrew} onChange={(event) => { setSelectedCrew(event.target.value); setGpsTracking(false); chooseCrew(crew.find((person) => person.id === event.target.value)) }} className="mt-1 w-full rounded-lg border border-line bg-void px-3 py-2 text-sm text-sand"><option value="">Select a crew member</option>{crew.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.status}{person.latitude_deg == null ? ' · no fix' : ''}</option>)}</select></label>{followCrew ? <p className="text-[11px] text-gold">Following {crew.find((person) => person.id === selectedCrew)?.name ?? 'crew'} · refreshing every 5 seconds</p> : null}<label className="block cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-sand hover:bg-panel-alt">Import navigation JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importNavigation(event)}/><span className="mt-1 block text-[11px] text-muted">Requires geodetic lat/lon, east-positive longitude; optional body_id (defaults to selected body).</span></label><button type="button" disabled={!position} onClick={() => position && setLocated({ ...position, source: 'last-known' })} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-sand disabled:opacity-40">Load last known position</button><p className="text-[11px] leading-relaxed text-muted">Earth GPS requires browser permission and a secure context. Off Earth, continuous tracking requires mission telemetry; selecting a coordinate alone does not create a live fix.</p></div>
        </div>{crewError ? <p className="mt-3 text-xs text-warn">Tracking feed unavailable: {crewError}</p> : null}{notice ? <p role="status" className="mt-3 text-xs text-muted">{notice}</p> : null}
      </article>
      <article className="rounded-2xl border border-line bg-panel p-5"><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">Selected position</p><h2 className="mt-1 text-lg font-semibold text-sand">{position ? `${BODY_NAMES[position.bodyId]} · ${locationText}` : locationText}</h2>{position ? <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-void p-3"><p className="text-muted">Source</p><p className="mt-1 text-sand">{sourceNames[position.source]}</p></div><div className="rounded-lg bg-void p-3"><p className="text-muted">Verification</p><p className="mt-1 text-warn">{position.source === 'mission-tracking' ? 'Feed received · auth not exposed' : position.source === 'earth-gps' ? 'Browser GPS fix · device permission granted' : 'Unverified'}</p></div><div className="rounded-lg bg-void p-3"><p className="text-muted">Last updated</p><p className="mt-1 text-sand">{new Date(position.timestamp).toLocaleString()}</p></div><div className="rounded-lg bg-void p-3"><p className="text-muted">Accuracy / uncertainty</p><p className="mt-1 text-sand">{position.accuracyMeters == null ? 'Not provided' : `±${position.accuracyMeters} m`}</p></div></div> : <p className="mt-4 text-sm text-muted">Select a point on the Mars globe, enter coordinates, or choose a tracked crew member.</p>}{position?.bodyId === 'mars' ? <p className="mt-3 font-mono text-[11px] text-muted">MOLA hazard service latitude conversion: {geodeticToPlanetocentricLatitude(position.latitudeDeg).toFixed(5)}° planetocentric.</p> : null}<Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt">Open full mission dashboard <ArrowUpRight className="h-3 w-3"/></Link></article>
    </section>

    {position ? <>{position.bodyId === 'mars' ? <><section className="grid gap-4 xl:grid-cols-3"><article className="rounded-2xl border border-line bg-panel p-5 xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">What can I find here?</p><h2 className="mt-1 text-lg font-semibold text-sand">Nearby mission information · 25 km</h2></div><select aria-label="Filter nearby observations" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand"><option value="all">All categories</option><option value="danger">Hazards</option><option value="shelter">Shelters</option><option value="water-ice">Water / ice</option><option value="resource">Resources</option><option value="discovery">Discoveries</option><option value="obstacle">Obstacles</option><option value="other">Other</option></select></div>{loadingNearby ? <p role="status" className="mt-4 text-sm text-muted">Searching available mission records…</p> : nearbyError ? <p role="alert" className="mt-4 text-sm text-warn">Nearby records unavailable: {nearbyError}</p> : filteredObservations.length ? <ul className="mt-4 divide-y divide-line">{filteredObservations.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><p className="text-sand">{item.category.replace('-', ' / ')} <span className="text-xs text-muted">· crew report · {item.verification_status}</span></p><p className="mt-1 text-xs text-muted">{item.description}</p><p className="mt-1 text-[10px] text-muted">{item.astronaut_id} · {new Date(item.submitted_at).toLocaleString()}</p></div><span className="font-mono text-xs text-gold">{item.distanceKm.toFixed(1)} km</span></li>)}</ul> : <p className="mt-4 rounded-xl border border-line bg-void/50 p-4 text-sm text-muted">No nearby crew observations are available. MOLA terrain measurements are shown in the assessment below; THEMIS thermal measurements, local HiRISE scenes, and a verified geological/resource feature catalog are not connected.</p>}<p className="mt-3 text-[10px] text-muted">Distances are spherical estimates using Mars mean radius (3,389.5 km). Observation records are crew reports; verification status is shown per record.</p></article>
      <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-gold"/><h2 className="text-lg font-semibold text-sand">Crew distribution</h2></div><p className="mt-2 text-xs text-muted">Crew members returned within the nearby search radius.</p>{nearby?.crew.length ? <ul className="mt-3 space-y-2">{nearby.crew.map((person) => <li key={person.id} className="flex justify-between rounded-lg bg-void p-3 text-xs"><span className="text-sand">{person.name}<span className="block text-muted">{person.status} · {person.location_timestamp ? new Date(person.location_timestamp).toLocaleTimeString() : 'time unavailable'}</span></span><span className="font-mono text-gold">{person.distanceKm?.toFixed(1)} km</span></li>)}</ul> : <p className="mt-3 text-sm text-muted">{crewError ? 'Tracking API unavailable; distribution unknown.' : 'No tracked crew positions returned within 25 km.'}</p>}<Link to="/crew" className="mt-4 inline-flex items-center gap-2 text-xs text-gold hover:text-sand">Open crew tracking <ArrowUpRight className="h-3 w-3"/></Link></article></section>
      <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-warn"/><h2 className="text-lg font-semibold text-sand">Is it safe here?</h2></div><p className="mt-3 text-sm leading-relaxed text-muted">MOLA terrain measurements and crew danger reports are checked for this location. They are evidence only; without reviewed hazard rules and current environmental data, MARSCOPE cannot label the location safe or dangerous.</p><div className="mt-4 rounded-xl border border-line bg-void/50 p-3"><p className="font-mono text-[10px] tracking-widest text-gold uppercase">MOLA terrain evidence</p>{terrainLoading ? <p role="status" className="mt-2 text-xs text-muted">Sampling the processed MOLA raster…</p> : terrainError ? <p role="alert" className="mt-2 text-xs text-warn">Terrain data unavailable: {terrainError}</p> : terrainAssessment?.assessments.some((item) => item.observation_kind === 'derived') ? <><div className="mt-2 grid gap-2 sm:grid-cols-2">{terrainAssessment.assessments.filter((item) => item.observation_kind === 'derived').map((item) => <div key={item.category} className="rounded-lg bg-panel p-2"><p className="text-[10px] text-muted">{item.category.replaceAll('_', ' ')}</p><p className="mt-1 font-mono text-sm text-sand">{item.measurement?.value.toFixed(2)} {item.measurement?.units}</p><p className="mt-1 text-[9px] text-warn">{item.severity} · {item.source_dataset?.product_id ?? 'source unavailable'}</p></div>)}</div><p className="mt-2 text-[9px] leading-relaxed text-muted">Historical MOLA source: {terrainAssessment.assessments.find((item) => item.source_dataset)?.source_dataset?.source_period_utc.join(' – ') ?? 'period unavailable'}; approximately {terrainAssessment.assessments.find((item) => item.source_dataset)?.source_dataset?.resolution_km_per_cell ?? 'unknown'} km/cell. Derived terrain is not a current weather or safety measurement.</p></> : <p className="mt-2 text-xs text-muted">No processed MOLA raster is available for this query. Severity remains unclassified.</p>}</div><p className="mt-3 text-[10px] text-muted">THEMIS temperature and atmospheric wind/dust inputs are unavailable. AI4MARS terrain classes, when enabled, describe image material and are not hazard labels.</p><div className="mt-4 flex flex-wrap gap-2"><Link to={`/risk?latitude_deg=${geodeticToPlanetocentricLatitude(position.latitudeDeg)}&longitude_deg=${position.longitudeDeg}`} className="rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt">Open evidence-based assessment</Link><Link to="/hazards" className="rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt">Review hazard data</Link></div></article>
      <article className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-center gap-2"><Radio className="h-4 w-4 text-gold"/><h2 className="text-lg font-semibold text-sand">Where can I go?</h2></div><p className="mt-3 text-sm leading-relaxed text-muted">No route is computed yet. Route planning depends on available terrain and hazard products; shelter and resource reports remain crew observations until validated.</p><div className="mt-4 flex flex-wrap gap-2"><Link to={`/routes?start_latitude_deg=${position.latitudeDeg}&start_longitude_deg=${position.longitudeDeg}`} className="rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt">Open route planning</Link><Link to="/mapping" className="rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt">Open shared observations</Link></div><p className="mt-4 border-t border-line pt-3 text-xs text-muted">Mission guidance: check communications, current crew status, resource telemetry, route constraints, and reported hazards before moving.</p></article></section>
      </> : <section className="rounded-2xl border border-line bg-panel p-5"><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">{BODY_NAMES[position.bodyId]} position context</p><p className="mt-2 text-sm text-muted">Position is tied to {BODY_NAMES[position.bodyId]}, and this source reports updates {position.source === 'earth-gps' ? 'from the device GPS' : position.source === 'mission-tracking' ? 'from the selected Mars crew telemetry feed' : 'only when coordinates are entered or imported'}. MARSCOPE currently has no local terrain, nearby report, or safety datasets for this body.</p></section>}
      <section className="rounded-2xl border border-line bg-panel p-5"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-gold"/><h2 className="text-lg font-semibold text-sand">Survival companion</h2></div><p className="mt-1 text-xs text-muted">Answers use available mission feeds and label missing or unverified inputs.</p><div className="mt-4 flex flex-wrap gap-2">{['Where am I?','Any reported danger nearby?','Nearest crew member?','Nearest shelter report?','How far can I travel with resources?'].map((question) => <details key={question} className="group rounded-lg border border-line bg-void"><summary className="cursor-pointer list-none px-3 py-2 text-xs text-sand">{question}<ArrowDown className="ml-2 inline h-3 w-3 text-muted group-open:rotate-180"/></summary><p className="max-w-xl border-t border-line px-3 py-2 text-xs leading-relaxed text-muted">{answer(question)}</p></details>)}</div><p className="mt-4 text-[10px] text-muted">{resourceError ? `Resource feed unavailable: ${resourceError}` : resources?.telemetry_status === 'available' ? 'Resource values come from mission telemetry; endurance uses recorded consumption only.' : 'No mission resource telemetry is available; demo data is not substituted here.'} <Link to="/survival" className="text-gold hover:text-sand">Open survival assessment <ArrowUpRight className="inline h-3 w-3"/></Link></p></section></> : <section className="rounded-2xl border border-line bg-panel p-5"><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">Mission orientation</p><p className="mt-2 text-sm text-muted">After selecting a position, MARSCOPE will query nearby crew reports, tracked crew, MOLA terrain, and available mission resource telemetry. Other scientific layers remain unavailable until connected source data exists.</p><div className="mt-4 flex flex-wrap gap-3 text-xs"><span className="inline-flex items-center gap-1 text-muted"><Radio className="h-3 w-3"/>Mission services are read on demand</span><span className="inline-flex items-center gap-1 text-muted"><AlertTriangle className="h-3 w-3"/>Crew reports are not validated hazards</span><span className="inline-flex items-center gap-1 text-muted"><MapPin className="h-3 w-3"/>No actual position is assumed</span></div></section>}
  </div>
}
