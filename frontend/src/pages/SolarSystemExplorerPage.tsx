import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle, Moon, RotateCcw, Sun } from 'lucide-react'
import { AstronomyDataStatus } from '../components/astronomy/AstronomyDataStatus'
import { CelestialBodyInfoPanel } from '../components/astronomy/CelestialBodyInfoPanel'
import { MarsSystemViewer } from '../components/astronomy/MarsSystemViewer'
import { SolarSystemNavigation } from '../components/astronomy/SolarSystemNavigation'
import { SolarSystemViewer } from '../components/astronomy/SolarSystemViewer'
import { LoadingPanel } from '../components/common/LoadingPanel'
import { MapErrorBoundary } from '../components/map/MapErrorBoundary'
import { getCelestialBodies, getMarsSystem, getSolarPositions, type CelestialBody, type EphemerisTrack } from '../services/solarSystemService'

type View = 'overview' | 'mars-system'

export function SolarSystemExplorerPage() {
  const [bodies, setBodies] = useState<CelestialBody[]>([])
  const [solarTracks, setSolarTracks] = useState<EphemerisTrack[]>([])
  const [marsTracks, setMarsTracks] = useState<EphemerisTrack[]>([])
  const [view, setView] = useState<View>('overview')
  const [selectedId, setSelectedId] = useState('')
  const [marsEpoch, setMarsEpoch] = useState(() => new Date().toISOString())
  const [homeNonce, setHomeNonce] = useState(0)
  const [loadingBodies, setLoadingBodies] = useState(true)
  const [loadingSolar, setLoadingSolar] = useState(true)
  const [loadingMars, setLoadingMars] = useState(false)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [solarError, setSolarError] = useState<string | null>(null)
  const [marsError, setMarsError] = useState<string | null>(null)
  const marsRequest = useRef<AbortController | null>(null)
  const bodyById = useMemo(() => new Map(bodies.map((body) => [body.id, body])), [bodies])
  const selectedBody = bodyById.get(selectedId) ?? bodyById.get('mars')
  const selectedTrack = (view === 'overview' ? solarTracks : marsTracks).find((track) => track.target === selectedId)
  const systemEpoch = marsEpoch

  const loadSolarSystem = useCallback(async (signal?: AbortSignal) => {
    const start = new Date()
    const stop = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000)
    try { const data = await getSolarPositions(start.toISOString(), stop.toISOString(), signal); setSolarTracks(data.tracks); if (data.tracks.every((track) => track.status === 'unavailable')) setSolarError('JPL Horizons is unavailable and no cached ephemeris is available yet.') }
    catch (error) { if (!signal?.aborted) setSolarError(error instanceof Error ? error.message : 'Solar ephemeris request failed.') }
    finally { if (!signal?.aborted) setLoadingSolar(false) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 85_000)
    const queryTimer = window.setTimeout(() => void loadSolarSystem(controller.signal), 0)
    void getCelestialBodies(controller.signal).then(setBodies).catch((error: unknown) => { if (!controller.signal.aborted) setBodyError(error instanceof Error ? error.message : 'Body reference data is unavailable.') }).finally(() => { if (!controller.signal.aborted) setLoadingBodies(false) })
    return () => { window.clearTimeout(timeout); window.clearTimeout(queryTimer); controller.abort(); marsRequest.current?.abort() }
  }, [loadSolarSystem])

  const enterMarsSystem = useCallback(() => {
    marsRequest.current?.abort()
    const controller = new AbortController(); marsRequest.current = controller
    setView('mars-system'); setSelectedId('mars'); setMarsTracks([]); setMarsError(null); setLoadingMars(true)
    const epoch = new Date().toISOString()
    setMarsEpoch(epoch)
    void getMarsSystem(epoch, controller.signal).then((result) => {
      setMarsTracks(result.tracks)
      if (result.tracks.every((track) => track.status === 'unavailable')) setMarsError('JPL Horizons is unavailable and no Mars-system ephemeris is cached.')
    }).catch((error: unknown) => { if (!controller.signal.aborted) setMarsError(error instanceof Error ? error.message : 'Mars-system ephemeris request failed.') }).finally(() => { if (!controller.signal.aborted) setLoadingMars(false) })
  }, [])
  const showOverview = useCallback(() => { marsRequest.current?.abort(); setView('overview'); setSelectedId(''); setLoadingMars(false) }, [])

  function selectOverviewBody(id: string) { if (id === 'mars') { enterMarsSystem(); return } setSelectedId(id) }
  function selectMarsBody(id: string) { setSelectedId(id) }

  return <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
    <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="font-mono text-[10px] tracking-[.28em] text-gold uppercase">Team ANORA · scientific visualization</p><h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Solar System Explorer</h1><p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">Explore JPL Horizons state vectors, then enter the Mars system to inspect Phobos and Deimos. Static body facts and dynamic positions are identified separately.</p></div><div className="flex items-center gap-2 rounded-lg border border-line bg-void px-3 py-2 text-[10px] text-muted"><Sun className="h-3.5 w-3.5 text-gold"/>Ephemerides are fetched on demand</div></header>
    <SolarSystemNavigation inMarsSystem={view === 'mars-system'} selectedName={view === 'mars-system' && selectedId !== 'mars' ? selectedBody?.name : undefined} onOverview={showOverview} onMars={() => { if (view !== 'mars-system') enterMarsSystem(); else setSelectedId('mars') }}/>

    {bodyError ? <div role="alert" className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-warn">Body reference data is unavailable: {bodyError}</div> : null}
    {loadingBodies && bodies.length === 0 ? <LoadingPanel label="Loading celestial body reference data…"/> : null}

    {view === 'overview' ? <>
      {loadingSolar && solarTracks.length === 0 ? <div className="flex min-h-96 items-center justify-center rounded-2xl border border-line bg-void text-sm text-muted"><LoaderCircle className="mr-2 h-4 w-4 animate-spin text-gold"/>Requesting planetary vectors from JPL Horizons…</div> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <MapErrorBoundary label="Solar System visualization"><SolarSystemViewer bodies={bodies} tracks={solarTracks} selectedId={selectedId} onSelect={selectOverviewBody} homeNonce={homeNonce} onReset={() => { setSelectedId(''); setHomeNonce((n) => n + 1) }}/></MapErrorBoundary>
        {selectedBody ? <div className="space-y-3"><CelestialBodyInfoPanel body={selectedBody} track={selectedTrack} centerName="Sun"/>{selectedBody.id === 'mars' ? <button onClick={enterMarsSystem} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mars px-4 py-3 text-sm font-semibold text-white hover:bg-[#a94d38]">Enter Mars system <ArrowRight className="h-4 w-4"/></button> : <button onClick={() => setSelectedId('')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-sand hover:bg-panel-alt"><ArrowLeft className="h-4 w-4"/>Reset selection</button>}</div> : <div className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">Select a planet marker to inspect its static reference facts and dynamic heliocentric position.</div>}
      </div>}
      {solarTracks.length ? <AstronomyDataStatus tracks={solarTracks}/> : null}{solarError ? <p role="alert" className="rounded-lg border border-warn/30 p-3 text-xs text-warn">Ephemeris status: {solarError} The visualization will not substitute invented coordinates.</p> : null}
      <p className="text-[10px] leading-relaxed text-muted">Overview coordinate frame: Sun-centered vectors in the ECLIPTIC plane and ICRF reference system, returned in km and km/s, UTC input epoch (UT). Curves show a one-year sampled Horizons trajectory; outer-planet curves are partial arcs. Distances use one scene unit per million km; body marker sizes are illustrative and enlarged.</p>
    </> : <>
      <div className="mb-1 flex flex-wrap gap-2">{['phobos','deimos'].map((id) => <button key={id} type="button" onClick={() => setSelectedId(id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selectedId === id ? 'border-gold/50 bg-gold/5 text-sand' : 'border-line text-muted hover:text-sand'}`}><Moon className="h-3.5 w-3.5" style={{ color: id === 'phobos' ? '#e8ba72' : '#78c8d1' }}/>{bodyById.get(id)?.name ?? id}</button>)}<button type="button" onClick={() => setSelectedId('mars')} className={`rounded-lg border px-3 py-2 text-xs ${selectedId === 'mars' ? 'border-mars/40 text-mars' : 'border-line text-muted'}`}>Mars</button></div>
      {loadingMars && marsTracks.length === 0 ? <div className="flex min-h-80 items-center justify-center rounded-2xl border border-line bg-void text-sm text-muted"><LoaderCircle className="mr-2 h-4 w-4 animate-spin text-gold"/>Requesting Mars-centered moon trajectories…</div> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]"><MapErrorBoundary label="Mars system visualization"><MarsSystemViewer tracks={marsTracks} epoch={systemEpoch} selectedId={selectedId} onSelect={selectMarsBody} resetNonce={homeNonce} onReset={() => setHomeNonce((n) => n + 1)}/></MapErrorBoundary>{selectedBody ? <div className="space-y-3"><CelestialBodyInfoPanel body={selectedBody} track={marsTracks.find((track) => track.target === selectedId)} centerName="Mars"/>{selectedId === 'phobos' || selectedId === 'deimos' ? <div className="rounded-xl border border-line bg-panel p-4"><p className="font-mono text-[9px] tracking-widest text-gold uppercase">Available imagery</p><p className="mt-2 text-[10px] leading-relaxed text-muted">This build uses an illustrative untextured marker; no surface texture is presented as imagery.</p><a className="mt-2 inline-block text-[10px] text-gold hover:text-sand" href={`https://images.nasa.gov/search?q=${encodeURIComponent(selectedBody.name)}`} target="_blank" rel="noreferrer">Search NASA Image and Video Library ↗</a></div> : null}<button type="button" onClick={showOverview} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-sand hover:bg-panel-alt"><ArrowLeft className="h-4 w-4"/>Back to Solar System</button></div> : null}</div>}
      {marsTracks.length ? <AstronomyDataStatus tracks={marsTracks}/> : null}{marsError ? <p role="alert" className="rounded-lg border border-warn/30 p-3 text-xs text-warn">Mars-system ephemeris status: {marsError}</p> : null}
      <p className="text-[10px] leading-relaxed text-muted">Mars-system frame: Mars-centered vectors with the same ECLIPTIC/ICRF axes and UT epoch. Moon paths use 48 hours of Horizons samples; chronological order and returned velocity vectors indicate orbital direction. Sun and Earth are shown as distances and state-vector context, not plotted at the moon-view scale.</p>
    </>}
    <div className="flex items-center justify-between border-t border-line pt-3 text-[9px] text-muted"><span>Static reference data: NASA planetary fact sheet and NASA Solar System Exploration.</span><span><button type="button" onClick={() => { if (view === 'overview') { setLoadingSolar(true); setSolarError(null); void loadSolarSystem() } else enterMarsSystem() }} className="inline-flex items-center gap-1 text-gold hover:text-sand"><RotateCcw className="h-3 w-3"/>Refresh ephemerides</button></span></div>
  </div>
}
