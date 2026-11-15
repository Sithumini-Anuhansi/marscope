import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertTriangle, LoaderCircle, Orbit, Upload } from 'lucide-react'
import { SolarSystemViewer } from './SolarSystemViewer'
import { getCelestialBodies, getMarsSystem, getSolarPositions, type CelestialBody, type EphemerisTrack, type EphemerisVector } from '../../services/solarSystemService'
import { DEMO_BODIES, DEMO_NEARBY_OBJECTS, demoMarsTracks, demoSolarTracks } from '../../data/demoSolarSystem'

interface SpacePosition { x_km: number; y_km: number; z_km: number; timestamp: string; source: 'manual' | 'imported' | 'demo'; vehicle_name?: string }
const STORAGE_KEY = 'marscope.where-am-i.space-position'
const FRAME = 'SUN_CENTERED_ECLIPTIC_ICRF'
const localDateTimeValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

function readSavedPosition(): SpacePosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SpacePosition> | null
    if (value && [value.x_km, value.y_km, value.z_km].every((axis) => typeof axis === 'number' && Number.isFinite(axis)) && typeof value.timestamp === 'string') {
      return { x_km: value.x_km!, y_km: value.y_km!, z_km: value.z_km!, timestamp: value.timestamp, source: value.source ?? 'imported', ...(value.vehicle_name ? { vehicle_name: value.vehicle_name } : {}) }
    }
  } catch { /* Ignore invalid stored navigation data. */ }
  return null
}

function distanceKm(a: { x_km: number; y_km: number; z_km: number }, b: { x_km: number; y_km: number; z_km: number }) {
  return Math.hypot(a.x_km - b.x_km, a.y_km - b.y_km, a.z_km - b.z_km)
}

function vectorAtEpoch(track: EphemerisTrack | undefined, timestamp: string): EphemerisVector | null {
  if (!track || track.status === 'unavailable' || !track.vectors.length) return null
  const epoch = Date.parse(timestamp)
  return track.vectors.reduce((closest, vector) => Math.abs(Date.parse(vector.epoch) - epoch) < Math.abs(Date.parse(closest.epoch) - epoch) ? vector : closest)
}

export function SpaceLocationPanel() {
  const [position, setPosition] = useState<SpacePosition | null>(readSavedPosition)
  const [fields, setFields] = useState(() => ({ x_km: '', y_km: '', z_km: '', vehicle_name: '', timestamp: localDateTimeValue(new Date()) }))
  const [bodies, setBodies] = useState<CelestialBody[]>([])
  const [tracks, setTracks] = useState<EphemerisTrack[]>([])
  const [moonTracks, setMoonTracks] = useState<EphemerisTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void getCelestialBodies(controller.signal).then(setBodies).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Celestial body reference data is unavailable.')
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const start = position?.timestamp && !Number.isNaN(Date.parse(position.timestamp)) ? new Date(position.timestamp) : new Date()
    const stop = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000)
    setLoading(true)
    setTracks([])
    setMoonTracks([])
    if (position?.source === 'demo') {
      const solar = demoSolarTracks()
      const mars = demoMarsTracks()
      setBodies(DEMO_BODIES)
      setTracks(solar)
      setMoonTracks(mars)
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }
    void Promise.allSettled([getSolarPositions(start.toISOString(), stop.toISOString(), controller.signal), getMarsSystem(start.toISOString(), controller.signal)]).then(([solarResult, moonResult]) => {
      if (solarResult.status === 'rejected') throw solarResult.reason
      const result = solarResult.value
      setTracks(result.tracks)
      if (moonResult.status === 'fulfilled') setMoonTracks(moonResult.value.tracks)
      const unavailable = result.tracks.every((track) => track.status === 'unavailable')
      setError(unavailable ? 'JPL Horizons positions are unavailable; nearby-body distances cannot be calculated.' : moonResult.status === 'rejected' ? 'Mars moon positions are unavailable; planetary distances are still shown.' : null)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Solar ephemeris request failed.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [position?.timestamp, position?.source])

  const nearby = useMemo(() => {
    if (!position) return []
    const planets = bodies.flatMap((body) => {
      if (body.id === 'sun') return [{ id: body.id, name: body.name, km: distanceKm(position, { x_km: 0, y_km: 0, z_km: 0 }) }]
      const vector = vectorAtEpoch(tracks.find((item) => item.target === body.id), position.timestamp)
      return vector ? [{ id: body.id, name: body.name, km: distanceKm(position, vector) }] : []
    })
    const mars = vectorAtEpoch(tracks.find((item) => item.target === 'mars'), position.timestamp)
    const relativeToMars = mars ? { x_km: position.x_km - mars.x_km, y_km: position.y_km - mars.y_km, z_km: position.z_km - mars.z_km } : null
    const moons = relativeToMars ? moonTracks.flatMap((track) => {
      const vector = vectorAtEpoch(track, position.timestamp)
      return vector && ['phobos', 'deimos'].includes(track.target) ? [{ id: track.target, name: track.target === 'phobos' ? 'Phobos (Mars moon)' : 'Deimos (Mars moon)', km: distanceKm(relativeToMars, vector) }] : []
    }) : []
    const demoObjects = position.source === 'demo' ? DEMO_NEARBY_OBJECTS.map((object) => ({ id: object.id, name: object.name, km: distanceKm(position, object) })) : []
    return [...planets, ...moons, ...demoObjects].sort((a, b) => a.km - b.km).slice(0, 5)
  }, [bodies, position, tracks, moonTracks])

  const mapMoons = useMemo(() => {
    if (!position) return []
    const mars = vectorAtEpoch(tracks.find((item) => item.target === 'mars'), position.timestamp)
    if (!mars) return []
    return moonTracks.flatMap((track) => {
      const moon = vectorAtEpoch(track, position.timestamp)
      return moon && ['phobos', 'deimos'].includes(track.target) ? [{ id: track.target, name: track.target === 'phobos' ? 'Phobos' : 'Deimos', x_km: mars.x_km + moon.x_km, y_km: mars.y_km + moon.y_km, z_km: mars.z_km + moon.z_km, color: track.target === 'phobos' ? '#e8ba72' : '#78c8d1' }] : []
    })
  }, [position, tracks, moonTracks])

  function savePosition(next: SpacePosition) {
    setPosition(next)
    setFields({ x_km: String(next.x_km), y_km: String(next.y_km), z_km: String(next.z_km), vehicle_name: next.vehicle_name ?? '', timestamp: localDateTimeValue(new Date(next.timestamp)) })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
    setNotice(`${next.source === 'demo' ? 'Demonstration position' : next.source === 'imported' ? 'Imported state vector' : 'Manual state vector'} selected. Nearby-body distances use JPL Horizons positions at the vector epoch.`)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const xyz = [fields.x_km, fields.y_km, fields.z_km].map(Number)
    if (!xyz.every(Number.isFinite)) { setError('Enter finite Sun-centered X, Y, and Z coordinates in kilometers.'); return }
    const epoch = new Date(fields.timestamp)
    if (Number.isNaN(epoch.getTime())) { setError('Enter the state vector epoch.'); return }
    setError(null)
    savePosition({ x_km: xyz[0], y_km: xyz[1], z_km: xyz[2], timestamp: epoch.toISOString(), source: 'manual', ...(fields.vehicle_name.trim() ? { vehicle_name: fields.vehicle_name.trim() } : {}) })
  }

  async function importStateVector(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>
      if (data.coordinate_frame !== FRAME || ![data.x_km, data.y_km, data.z_km].every((axis) => typeof axis === 'number' && Number.isFinite(axis))) throw new Error(`JSON must contain coordinate_frame "${FRAME}" and finite x_km, y_km, z_km values.`)
      const timestamp = typeof data.timestamp === 'string' && !Number.isNaN(Date.parse(data.timestamp)) ? new Date(data.timestamp).toISOString() : new Date().toISOString()
      savePosition({ x_km: data.x_km as number, y_km: data.y_km as number, z_km: data.z_km as number, timestamp, source: 'imported', ...(typeof data.vehicle_name === 'string' ? { vehicle_name: data.vehicle_name } : {}) })
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the spacecraft state-vector file.') }
    event.target.value = ''
  }

  function loadDemoPosition() {
    const mars = tracks.find((track) => track.target === 'mars' && track.status !== 'unavailable')?.vectors[0] ?? demoSolarTracks().find((track) => track.target === 'mars')?.vectors[0]
    const base = mars ?? { x_km: 227_900_000, y_km: 0, z_km: 0, epoch: new Date().toISOString() }
    savePosition({ x_km: base.x_km + 10_000, y_km: base.y_km, z_km: base.z_km, timestamp: base.epoch, source: 'demo', vehicle_name: 'Demo spacecraft near Mars' })
    setError(null)
  }

  return <section className="space-y-4 rounded-2xl border border-line bg-panel p-4 md:p-5">
    <header><p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">Spacecraft position · Sun-centered</p><h2 className="mt-1 text-lg font-semibold text-sand">Locate yourself in the Solar System</h2><p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted">Enter or import a spacecraft state vector in the same Sun-centered ECLIPTIC/ICRF frame used by the JPL Horizons map. Browser GPS cannot provide an in-space fix. For real-time automatic tracking, connect a spacecraft telemetry feed.</p></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.7fr)]">
      <div className="relative min-h-[25rem]"><SolarSystemViewer bodies={bodies} tracks={tracks} selectedId={position ? 'observer' : null} onSelect={() => undefined} onReset={() => undefined} homeNonce={0} observerPosition={position} extraBodies={[...mapMoons, ...(position?.source === 'demo' ? DEMO_NEARBY_OBJECTS : [])]}/>{loading ? <div className="absolute right-3 top-3 rounded-lg border border-line bg-void/90 px-2 py-1 text-[9px] text-muted"><LoaderCircle className="mr-1 inline h-3 w-3 animate-spin"/>Updating ephemerides</div> : null}</div>
      <div className="space-y-4">
        <form onSubmit={submit} className="space-y-2 rounded-xl border border-line bg-void/50 p-3"><h3 className="text-xs font-semibold text-sand">Enter state vector</h3>{(['x_km', 'y_km', 'z_km'] as const).map((axis) => <label key={axis} className="block text-[10px] text-muted">Sun-centered {axis[0].toUpperCase()} · km<input required type="number" step="any" value={fields[axis]} onChange={(event) => setFields((current) => ({ ...current, [axis]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-xs text-sand" placeholder="e.g. state-vector component"/></label>)}<label className="block text-[10px] text-muted">State vector epoch<input required type="datetime-local" value={fields.timestamp} onChange={(event) => setFields((current) => ({ ...current, timestamp: event.target.value }))} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-xs text-sand"/><span className="mt-1 block text-[9px]">Use the epoch associated with the coordinates. Imported JSON should use an ISO-8601 timezone.</span></label><label className="block text-[10px] text-muted">Spacecraft / object name (optional)<input value={fields.vehicle_name} onChange={(event) => setFields((current) => ({ ...current, vehicle_name: event.target.value }))} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand" placeholder="Mission or vehicle"/></label><button className="w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Locate this position</button></form>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-sand hover:bg-panel-alt"><Upload size={14}/>Import state-vector JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importStateVector(event)}/></label>
        <button type="button" onClick={loadDemoPosition} className="w-full rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-left text-xs text-amber-200">Load DEMO position near Mars <span className="block pt-1 text-[9px] text-amber-100">Synthetic spacecraft point · 10,000 km from Mars center</span></button>
        {error ? <p role="alert" className="rounded-lg border border-warn/30 bg-warn/5 p-2 text-[10px] text-warn">{error}</p> : null}{notice ? <p role="status" className="text-[9px] text-muted">{notice}</p> : null}
        {position ? <div className={`rounded-xl border p-3 ${position.source === 'demo' ? 'border-amber-500/40 bg-amber-950/20' : 'border-line bg-void/50'}`}><div className="flex items-center gap-2"><Orbit size={14} className={position.source === 'demo' ? 'text-amber-300' : 'text-gold'}/><h3 className="text-xs font-semibold text-sand">{position.vehicle_name ?? 'Current supplied position'}</h3></div><p className="mt-2 font-mono text-[9px] text-muted">{FRAME} · {new Date(position.timestamp).toLocaleString()}</p><p className="mt-1 text-[9px] text-muted">{position.source === 'demo' ? 'DEMO LOCATION · not a real spacecraft fix' : position.source === 'imported' ? 'Imported navigation state · verify source and epoch' : 'Manually entered · unverified'}</p><dl className="mt-3 grid grid-cols-3 gap-1 text-[9px]">{(['x_km', 'y_km', 'z_km'] as const).map((axis) => <div key={axis} className="rounded bg-black/20 p-2 text-muted">{axis[0].toUpperCase()}<dd className="mt-1 break-all font-mono text-sand">{position[axis].toLocaleString()} km</dd></div>)}</dl></div> : <p className="rounded-xl border border-dashed border-line p-3 text-[10px] text-muted">No spacecraft position is set. Enter/import a state vector, or load the clearly marked demo point.</p>}
      </div>
    </div>
    <section className="rounded-xl border border-line bg-void/40 p-4"><div className="flex items-center gap-2"><Orbit size={14} className="text-gold"/><h3 className="text-xs font-semibold text-sand">Nearest mapped objects</h3></div>{!position ? <p className="mt-2 text-[10px] text-muted">Set a position to calculate distances.</p> : loading ? <p className="mt-2 text-[10px] text-muted">Matching your state vector to JPL Horizons ephemerides…</p> : nearby.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{nearby.map((body) => <article key={body.id} className="rounded-lg border border-line bg-panel p-3"><p className="text-xs text-sand">{body.name}</p><p className="mt-1 font-mono text-[10px] text-gold">{body.km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km</p></article>)}</div> : <p className="mt-2 text-[10px] text-warn">Nearby-object distances are unavailable without a matching ephemeris.</p>}<p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-muted"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn"/>{position?.source === 'demo' ? 'DEMO ONLY · all positions, distances, and sample objects are synthetic illustrations. Real nearby-object discovery requires a reachable live ephemeris and spacecraft telemetry source.' : 'Distances use reachable JPL Horizons ephemerides for the Sun, planets, and Mars moons. Other spacecraft and small bodies require separate ephemeris targets and real telemetry. The nearest result is not necessarily safe or reachable.'}</p></section>
    <p className="text-[9px] text-muted">JSON format: <code className="text-sand">{`{"coordinate_frame":"${FRAME}","timestamp":"2026-01-01T00:00:00Z","x_km":149000000,"y_km":0,"z_km":0}`}</code>. The state vector must refer to the supplied epoch and the Sun-centered frame.</p>
  </section>
}
