import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Crosshair, MapPin, Route as RouteIcon, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MapErrorBoundary } from '../components/map/MapErrorBoundary'
import { MarsGlobe } from '../components/map/MarsGlobe'
import { DemoSampleVisualization } from '../components/common/DemoSampleVisualization'
import { getMedaArchiveIndex, getPlanetaryArchiveProducts, getScienceDemoRecords } from '../services/planetaryArchiveService'
import { getAstrobiologyMaps } from '../services/astrobiologyService'
import type { AstrobiologyEvidenceFeature, AstrobiologyMapsResponse } from '../types/astrobiology'
import type { MedaArchiveResponse, PlanetaryArchiveResponse, ScienceDemoResponse } from '../types/planetaryArchive'
import { geodeticToPlanetocentricLatitude, planetocentricToGeodeticLatitude } from '../utils/marsCoordinates'

type MarsPoint = { latitudeDeg: number; longitudeDeg: number }
type RouteEndpoint = 'start' | 'destination'

// Published center coordinate for one Gale boxwork HiRISE image pair.
// It is a study reference, not a rover position or a safety waypoint.
const BOXWORK_STUDY_POINT: MarsPoint = { latitudeDeg: -4.876048, longitudeDeg: 137.3026 }
const NASA_BOXWORK_IMAGE = 'https://assets.science.nasa.gov/dynamicimage/assets/science/missions/msl/2024/11/PIA26306.jpg?crop=faces%2Cfocalpoint&fit=crop&h=900&w=1600'

function formatPoint(point: MarsPoint | null): string {
  if (!point) return 'Select a point on the globe'
  return `${point.latitudeDeg.toFixed(4)}° lat · ${point.longitudeDeg.toFixed(4)}° E`
}

export function MarsExplorerPage() {
  const [start, setStart] = useState<MarsPoint | null>(null)
  const [destination, setDestination] = useState<MarsPoint | null>(null)
  const [selectedMapPoint, setSelectedMapPoint] = useState<MarsPoint | null>(null)
  const [selecting, setSelecting] = useState<RouteEndpoint | null>(null)
  const [studyAreaFocused, setStudyAreaFocused] = useState(false)
  const [scienceFocus, setScienceFocus] = useState<MarsPoint | null>(null)
  const [archivePoint, setArchivePoint] = useState<MarsPoint>(BOXWORK_STUDY_POINT)
  const [archive, setArchive] = useState<PlanetaryArchiveResponse | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [meda, setMeda] = useState<MedaArchiveResponse | null>(null)
  const [scienceDemo, setScienceDemo] = useState<ScienceDemoResponse | null>(null)
  const [showScienceDemo, setShowScienceDemo] = useState(true)
  const [astrobiology, setAstrobiology] = useState<AstrobiologyMapsResponse | null>(null)
  const [astrobiologyError, setAstrobiologyError] = useState<string | null>(null)
  const [showHabitabilityMap, setShowHabitabilityMap] = useState(true)
  const [showPastLifeMap, setShowPastLifeMap] = useState(false)
  const [showPresentLifeMap, setShowPresentLifeMap] = useState(false)
  const [showSettlementMap, setShowSettlementMap] = useState(false)
  const selectedPoint = selecting === 'start' ? start : destination
  const focusLocation = useMemo(() => selecting ? selectedPoint : selectedMapPoint ?? scienceFocus ?? (studyAreaFocused ? BOXWORK_STUDY_POINT : destination ?? start), [selecting, selectedPoint, selectedMapPoint, scienceFocus, studyAreaFocused, destination, start])

  const visibleScienceFeatures = useMemo(() => {
    if (!astrobiology) return [] as AstrobiologyEvidenceFeature[]
    return [
      ...(showHabitabilityMap ? astrobiology.habitability.features : []),
      ...(showPastLifeMap ? astrobiology.biosignatures.past_life.features : []),
      ...(showPresentLifeMap ? astrobiology.biosignatures.present_life.features : []),
      ...(showSettlementMap ? astrobiology.human_settlement.features : []),
    ]
  }, [astrobiology, showHabitabilityMap, showPastLifeMap, showPresentLifeMap, showSettlementMap])
  const globeScienceMarkers = useMemo(() => {
    const grouped = new Map<string, AstrobiologyEvidenceFeature[]>()
    for (const feature of visibleScienceFeatures) {
      const key = `${feature.site}:${feature.coordinates.latitude_deg}:${feature.coordinates.longitude_deg}`
      grouped.set(key, [...(grouped.get(key) ?? []), feature])
    }
    return [...grouped.entries()].map(([id, features]) => ({
      id,
      label: features[0].site,
      latitudeDeg: planetocentricToGeodeticLatitude(features[0].coordinates.latitude_deg),
      longitudeDeg: features[0].coordinates.longitude_deg,
      color: features.some((feature) => feature.evidence_type === 'regional-resource-context') ? '#f0b35a' : features.some((feature) => feature.evidence_type === 'past-environment-habitability' || feature.evidence_type === 'subsurface-water-resource-context') ? '#55d6be' : '#c780ff',
      category: features.map((feature) => feature.title).join(' · '),
    }))
  }, [visibleScienceFeatures])

  function onSurfaceSelect(point: MarsPoint) {
    setStudyAreaFocused(false)
    setScienceFocus(null)
    setSelectedMapPoint(point)
    setArchivePoint({ ...point, latitudeDeg: geodeticToPlanetocentricLatitude(point.latitudeDeg) })
    if (selecting === 'start') setStart(point)
    if (selecting === 'destination') setDestination(point)
    setSelecting(null)
  }

  const routeLink = start && destination
    ? `/routes?start_latitude_deg=${start.latitudeDeg}&start_longitude_deg=${start.longitudeDeg}&destination_latitude_deg=${destination.latitudeDeg}&destination_longitude_deg=${destination.longitudeDeg}`
    : null

  useEffect(() => {
    const controller = new AbortController()
    setArchiveLoading(true)
    setArchiveError(null)
    void getPlanetaryArchiveProducts(archivePoint.latitudeDeg, archivePoint.longitudeDeg, 20, controller.signal)
      .then(setArchive)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setArchiveError(error instanceof Error ? error.message : 'NASA PDS search failed.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setArchiveLoading(false)
      })
    return () => controller.abort()
  }, [archivePoint])

  useEffect(() => {
    const controller = new AbortController()
    void getMedaArchiveIndex(controller.signal).then(setMeda).catch(() => setMeda(null))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getAstrobiologyMaps(controller.signal)
      .then((result) => { setAstrobiology(result); setAstrobiologyError(null) })
      .catch((error: unknown) => { if (!controller.signal.aborted) setAstrobiologyError(error instanceof Error ? error.message : 'Astrobiology evidence maps are unavailable.') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getScienceDemoRecords(controller.signal).then(setScienceDemo).catch(() => setScienceDemo(null))
    return () => controller.abort()
  }, [])

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8.5rem)] w-full max-w-[1700px] flex-col gap-4">
      <header>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">Mars Explorer · surface mission planning</p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Plan a localized Marswalk</h1>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted">
          Build a study-area route from globe-selected endpoints, inspect connected imagery, and check what evidence is available. This is a planning prototype: the local MOLA grid is too coarse for EVA routing, and unintegrated datasets are identified below rather than shown as live layers.
        </p>
      </header>

      <section className="rounded-xl border border-line bg-panel/75 p-3 text-[10px] leading-relaxed text-muted" aria-label="Data sources and usage notes">
        <p><span className="font-semibold text-sand">Map data and attribution:</span> Mars surface imagery uses NASA/JPL Mars Trek. Visible named-feature labels use the USGS Gazetteer of Planetary Nomenclature and IAU-approved Mars feature center points. The USGS global geologic map is available as a reference; its geologic polygons are not currently overlaid here.</p>
        <p className="mt-1">NASA’s Curiosity Mount Sharp path is a historical proposed-route illustration, not live route data. Perseverance raw images are a gallery, not georeferenced map points. NASA Worldview is an Earth-observation viewer and is not used as Mars imagery. NASA attribution does not imply endorsement of MARSCOPE or non-government hosting providers; follow each linked source’s terms.</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <a className="text-gold underline" href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">NASA/JPL Mars Trek</a>
          <a className="text-gold underline" href="https://planetarynames.wr.usgs.gov/GIS_Downloads" target="_blank" rel="noreferrer">USGS/IAU name catalog</a>
          <a className="text-gold underline" href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars" target="_blank" rel="noreferrer">USGS Mars geologic maps</a>
          <a className="text-gold underline" href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noreferrer">Curiosity proposed path example</a>
          <a className="text-gold underline" href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA Worldview (Earth)</a>
          <a className="text-gold underline" href="https://mars.nasa.gov/mars2020/multimedia/raw-images/" target="_blank" rel="noreferrer">Perseverance raw images</a>
        </div>
      </section>

      <section id="marswalk-map" className="scroll-mt-24 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative min-h-[34rem] overflow-hidden rounded-2xl border border-line bg-[#070605] xl:min-h-[42rem]">
          <MapErrorBoundary>
            <MarsGlobe
              focusLocation={focusLocation}
              onSurfaceSelect={onSurfaceSelect}
              explorationMarkers={globeScienceMarkers}
            />
          </MapErrorBoundary>
          {selecting ? <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-gold/50 bg-void/95 px-4 py-2 text-center text-xs text-gold shadow-lg">
            Click the globe to set the {selecting === 'start' ? 'Marswalk start' : 'science destination'}.
          </div> : null}
        </div>

        <aside className="flex flex-col gap-3">
          {selectedMapPoint ? <section className="rounded-xl border border-gold/35 bg-gold/5 p-3" aria-live="polite"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] tracking-widest text-gold uppercase">Selected Mars point</p><h2 className="mt-1 text-xs font-semibold text-sand">{selectedMapPoint.latitudeDeg.toFixed(4)}° lat · {selectedMapPoint.longitudeDeg.toFixed(4)}° E</h2></div><button type="button" aria-label="Dismiss selected point details" onClick={() => setSelectedMapPoint(null)} className="rounded p-1 text-muted hover:text-sand"><X size={14}/></button></div><p className="mt-2 text-[10px] leading-relaxed text-muted">A point on the Mars surface has been selected. Nearby orbital archive products are searched within 20 km and listed below when available. A map click alone does not identify a hazard, landing zone, or safe route.</p></section> : null}
          <section id="study-area" className="scroll-mt-24 rounded-2xl border border-line bg-panel p-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">Reference science objective</p>
            <h2 className="mt-1 text-base font-semibold text-sand">Gale Crater · Mount Sharp boxwork</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Example Marswalk: inspect boxwork ridges and hollows, then plan a route between a start point and a science stop. The reference coordinate is from a published HiRISE image pair, not a rover position; the separate orbital image below is not claimed to cover that exact point.
            </p>
            <a href="https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] text-gold hover:text-sand">
              NASA Curiosity boxwork field context <ArrowUpRight className="h-3 w-3" />
            </a>
          </section>

          <AstrobiologyMapPanel
            data={astrobiology}
            error={astrobiologyError}
            demoItems={scienceDemo?.items ?? []}
            showHabitability={showHabitabilityMap}
            showPastLife={showPastLifeMap}
            showPresentLife={showPresentLifeMap}
            showSettlement={showSettlementMap}
            onToggleHabitability={setShowHabitabilityMap}
            onTogglePastLife={setShowPastLifeMap}
            onTogglePresentLife={setShowPresentLifeMap}
            onToggleSettlement={setShowSettlementMap}
            onFocus={(latitudeDeg, longitudeDeg) => { setSelecting(null); setStudyAreaFocused(false); setScienceFocus({ latitudeDeg: planetocentricToGeodeticLatitude(latitudeDeg), longitudeDeg }) }}
          />

          <section className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-gold"/><h2 className="text-sm font-semibold text-sand">Marswalk endpoints</h2></div>
            <div className="mt-3 space-y-2">
              <div className="rounded-lg bg-void p-2.5"><p className="text-[9px] uppercase tracking-wide text-muted">Start</p><p className="mt-1 font-mono text-[11px] text-sand">{formatPoint(start)}</p><button type="button" onClick={() => setSelecting('start')} className="mt-2 rounded border border-line px-2 py-1 text-[10px] text-gold hover:bg-panel-alt">Pick start on map</button></div>
              <div className="rounded-lg bg-void p-2.5"><p className="text-[9px] uppercase tracking-wide text-muted">Science destination</p><p className="mt-1 font-mono text-[11px] text-sand">{formatPoint(destination)}</p><button type="button" onClick={() => setSelecting('destination')} className="mt-2 rounded border border-line px-2 py-1 text-[10px] text-gold hover:bg-panel-alt">Pick destination on map</button></div>
            </div>
            {routeLink ? <Link to={routeLink} className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-mars px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#aa503a]">Continue to route planning <RouteIcon className="h-3.5 w-3.5"/></Link> : <p className="mt-3 flex items-start gap-2 rounded-lg border border-line p-2.5 text-[10px] leading-relaxed text-muted"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-gold"/>Choose both points to pass them to route planning. The current MOLA product will be rejected at the planner’s default EVA resolution limit.</p>}
          </section>

          <section className="rounded-2xl border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold text-sand">Study-area data readiness</h2>
            <ul className="mt-3 space-y-2 text-[10px] leading-relaxed">
              <li className="rounded-lg border border-gold/20 bg-void p-2"><span className="font-medium text-gold">Connected · MOLA terrain</span><span className="mt-0.5 block text-muted">Local global sample, about 14.8 km/cell. Regional context only; too coarse for EVA routing.</span></li>
              <li className="rounded-lg border border-gold/20 bg-void p-2"><span className="font-medium text-gold">Connected · Viking imagery</span><span className="mt-0.5 block text-muted">Global visual context; not rover-scale detail.</span></li>
              <li className="rounded-lg border border-gold/20 bg-void p-2"><span className="font-medium text-gold">Connected · NASA PDS product coverage</span><span className="mt-0.5 block text-muted">Location searches return live THEMIS, CTX, HiRISE DTM, CRISM, and SHARAD archive products, browse images, and PDS file links below.</span></li>
              <li className="rounded-lg border border-warn/20 bg-void p-2"><span className="font-medium text-warn">Beta · CTX tile layer</span><span className="mt-0.5 block text-muted">External mosaic service; confirm tile coverage and alignment at the selected site.</span></li>
              {meda ? <li className="rounded-lg border border-gold/20 bg-void p-2"><span className="font-medium text-gold">Ingested · MEDA calibrated ATS index</span><span className="mt-0.5 block text-muted">{meda.manifest.record_count.toLocaleString()} archived product entries, latest listed sol {meda.manifest.latest_record.start_sol} ({new Date(meda.manifest.latest_record.midpoint_utc).toLocaleDateString()}). This is the Perseverance archive index; measurements are not in the index.</span><a href={meda.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-gold underline">PDS index source <ArrowUpRight className="h-3 w-3" /></a></li> : null}
              <li className="rounded-lg border border-line bg-void p-2"><span className="font-medium text-muted">Not yet integrated · MCD, MARCI, MCS, RAD, AI4MARS</span><span className="mt-0.5 block text-muted">These need separate climate-model, orbital archive, rover-site, or labeled-dataset ingestion workflows.</span></li>
            </ul>
            <a href="https://ode.rsl.wustl.edu/mars2/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] text-gold hover:text-sand">Search NASA PDS Mars ODE for site coverage <ArrowUpRight className="h-3 w-3"/></a>
          </section>
        </aside>
      </section>

      {scienceDemo ? <section id="science-demos" aria-labelledby="demo-science-heading" className="rounded-2xl border border-amber-500/40 bg-[#201606]/75 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber-300 uppercase">Optional feature demonstration</p>
            <h2 id="demo-science-heading" className="mt-1 text-lg font-semibold text-sand">Science-source demo gallery</h2>
          </div>
          <button type="button" aria-expanded={showScienceDemo} onClick={() => setShowScienceDemo((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs ${showScienceDemo ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-line text-sand hover:bg-panel-alt'}`}>{showScienceDemo ? 'Stop demo' : 'Start demo'}</button>
        </div>
        {showScienceDemo ? <><p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/35 p-2 text-[10px] leading-relaxed text-amber-100">DEMO ONLY · {scienceDemo.mode}. Values below are synthetic examples, not NASA observations or model output. They are excluded from hazard, risk, and route calculations.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {scienceDemo.items.map((item) => <article key={item.id} className="rounded-xl border border-amber-500/30 bg-[#100c07] p-3">
            <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold text-sand">{item.name}</h3><span className="shrink-0 rounded bg-amber-950 px-1.5 py-0.5 font-mono text-[8px] text-amber-200">DEMO</span></div>
            <p className="mt-2 font-mono text-[9px] text-amber-300">{item.mode}</p>
            <DemoSampleVisualization sample={item.sample}/>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">{item.explanation}</p>
            <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] text-gold underline">Open dataset/topic reference <ArrowUpRight className="h-3 w-3" /></a>
          </article>)}
        </div></> : <p className="mt-2 text-[10px] text-muted">Start the demonstration to browse clearly labeled synthetic examples.</p>}
      </section> : null}

      <section id="pds-products" className="scroll-mt-24 rounded-2xl border border-line bg-panel p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">Live planetary archive query</p>
            <h2 className="mt-1 text-lg font-semibold text-sand">NASA PDS products near this map point</h2>
            <p className="mt-1 text-[11px] text-muted">Search center {archivePoint.latitudeDeg.toFixed(4)}° planetocentric lat, {archivePoint.longitudeDeg.toFixed(4)}° E · 20 km half-width · click the globe to change the search location.</p>
          </div>
          <a href="https://ode.rsl.wustl.edu/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[10px] text-gold hover:bg-void">Open Mars ODE <ArrowUpRight className="h-3 w-3"/></a>
        </div>
        {archiveLoading ? <p role="status" className="mt-4 text-xs text-muted">Searching the NASA PDS Orbital Data Explorer for local product footprints…</p> : null}
        {archiveError ? <p role="alert" className="mt-4 rounded-lg border border-warn/30 bg-void p-3 text-xs text-warn">Archive search unavailable: {archiveError}. Try again after confirming the backend and network connection.</p> : null}
        {archive ? <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
            {archive.items.map((source) => <article key={source.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-void">
              {source.status === 'products-found' && source.products.some((product) => product.browse_url) ? <img src={source.products.find((product) => product.browse_url)?.browse_url ?? undefined} alt={`${source.name} PDS browse preview`} loading="lazy" className="h-32 w-full bg-panel object-cover"/> : <div className="flex h-32 items-center justify-center bg-panel px-4 text-center text-[10px] text-muted">{source.status === 'no-coverage' ? 'No matching product in this search area' : source.status === 'products-found' ? 'Products found · no browse preview supplied' : 'Archive service unavailable'}</div>}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold text-sand">{source.name}</h3><span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] ${source.status === 'products-found' ? 'bg-emerald-950 text-emerald-300' : source.status === 'no-coverage' ? 'bg-panel-alt text-muted' : 'bg-amber-950 text-amber-300'}`}>{source.status === 'products-found' ? `${source.products.length} listed` : source.status.replaceAll('-', ' ')}</span></div>
                {source.dataset_id ? <p className="mt-1 truncate font-mono text-[9px] text-muted" title={source.dataset_id}>{source.dataset_id}</p> : null}
                {source.data_kind ? <p className="mt-2 min-h-8 text-[9px] leading-relaxed text-muted">{source.data_kind}</p> : null}
                {source.products.map((product) => <div key={product.product_id ?? product.product_url} className="mt-2 border-t border-line pt-2">
                  <p className="break-all font-mono text-[9px] text-gold">{product.product_id ?? 'PDS product'}</p>
                  <p className="mt-1 text-[9px] text-muted">{product.observation_time && !product.observation_time.startsWith('0000') ? product.observation_time : 'Observation date not supplied'}</p>
                  {product.center_latitude_deg != null && product.center_longitude_deg != null ? <p className="mt-1 text-[9px] text-muted">Product center: {product.center_latitude_deg.toFixed(4)}° areocentric lat, {product.center_longitude_deg.toFixed(4)}° E</p> : null}
                  {product.minimum_latitude_deg != null && product.maximum_latitude_deg != null && product.western_longitude_deg != null && product.eastern_longitude_deg != null ? <p className="mt-1 text-[9px] leading-relaxed text-muted">Footprint bounds: {product.minimum_latitude_deg.toFixed(3)}° to {product.maximum_latitude_deg.toFixed(3)}° areocentric lat, {product.western_longitude_deg.toFixed(3)}° to {product.eastern_longitude_deg.toFixed(3)}° E{product.map_scale_m_per_pixel != null ? ` · ${product.map_scale_m_per_pixel.toFixed(1)} m/pixel` : ''}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {product.product_url ? <a href={product.product_url} target="_blank" rel="noreferrer" className="text-[9px] text-sand underline underline-offset-2">PDS file{product.product_url_kb ? ` · ${product.product_url_kb} KB` : ''}</a> : null}
                    <a href={product.detail_url} target="_blank" rel="noreferrer" className="text-[9px] text-sand underline underline-offset-2">Product record</a>
                  </div>
                </div>)}
                {source.caveat ? <p className="mt-2 border-t border-line pt-2 text-[9px] leading-relaxed text-muted">{source.caveat}</p> : source.message ? <p className="mt-2 text-[9px] text-warn">{source.message}</p> : null}
              </div>
            </article>)}
          </div>
          <p className="mt-3 text-[9px] text-muted">{archive.provider} · queried {new Date(archive.query_time_utc).toLocaleString()} · results are historical products in approximate location bounds, not current conditions. Preview images are not interpreted as measurements.</p>
          <ul className="mt-2 grid gap-1 text-[9px] text-muted md:grid-cols-3">{archive.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}</ul>
        </> : null}
      </section>

      <section id="research-maps" className="scroll-mt-24 grid items-start gap-4 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:p-5">
        <div className="overflow-hidden rounded-xl border border-line bg-void">
          <img
            src={NASA_BOXWORK_IMAGE}
            alt="NASA HiRISE orbital image showing boxwork ridges on Mount Sharp in Gale Crater"
            loading="lazy"
            className="h-full min-h-56 max-h-[26rem] w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-center">
          <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">Connected orbital science reference · HiRISE</p>
          <h2 className="mt-1 text-lg font-semibold text-sand">Mount Sharp boxwork</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            NASA/JPL-Caltech/University of Arizona image PIA26306, captured by MRO/HiRISE on 10 December 2006. It documents boxwork in the Mount Sharp region; it is a reference image, not a georeferenced overlay or proof of coverage at the rover’s later study site.
          </p>
          <div className="mt-3 rounded-lg bg-void p-3 text-[10px] leading-relaxed text-muted">
            <p><span className="text-sand">Published HiRISE study sample:</span> {BOXWORK_STUDY_POINT.latitudeDeg.toFixed(6)}° latitude, {BOXWORK_STUDY_POINT.longitudeDeg.toFixed(6)}° E.</p>
            <p className="mt-1">The coordinate identifies an image-pair center reported in the boxwork study. MOLA at this scale is regional context only.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setSelecting(null); setStudyAreaFocused(true) }} className="rounded-lg border border-gold/40 px-3 py-2 text-[10px] font-medium text-gold hover:bg-void">Focus published sample on globe</button>
            <a href="https://science.nasa.gov/resource/hirise-views-mount-sharps-boxwork/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[10px] text-sand hover:bg-void">NASA image record <ArrowUpRight className="h-3 w-3"/></a>
            <a href="https://doi.org/10.1002/2013JE004508" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[10px] text-sand hover:bg-void">Published HiRISE study <ArrowUpRight className="h-3 w-3"/></a>
          </div>
        </div>
      </section>

      <p className="text-[10px] leading-relaxed text-muted">A route or map point is not a safety finding. The current terrain products are historical and coarse; no validated astronaut mobility model, local obstacle layer, or calibrated environmental safety stack is connected.</p>
    </div>
  )
}

interface AstrobiologyMapPanelProps {
  data: AstrobiologyMapsResponse | null
  demoItems: ScienceDemoResponse['items']
  error: string | null
  showHabitability: boolean
  showPastLife: boolean
  showPresentLife: boolean
  showSettlement: boolean
  onToggleHabitability: (value: boolean) => void
  onTogglePastLife: (value: boolean) => void
  onTogglePresentLife: (value: boolean) => void
  onToggleSettlement: (value: boolean) => void
  onFocus: (latitudeDeg: number, longitudeDeg: number) => void
}

function AstrobiologyMapPanel({ data, error, demoItems, showHabitability, showPastLife, showPresentLife, showSettlement,
  onToggleHabitability, onTogglePastLife, onTogglePresentLife, onToggleSettlement, onFocus }: AstrobiologyMapPanelProps) {
  const [showDemos, setShowDemos] = useState(true)
  const records = [
    ...(showHabitability ? data?.habitability.features ?? [] : []),
    ...(showPastLife ? data?.biosignatures.past_life.features ?? [] : []),
    ...(showPresentLife ? data?.biosignatures.present_life.features ?? [] : []),
    ...(showSettlement ? data?.human_settlement.features ?? [] : []),
  ]
  const selectedDemoSections = new Set([
    ...(showHabitability ? ['habitability'] : []),
    ...(showPastLife || showPresentLife ? ['biosignatures'] : []),
    ...(showSettlement ? ['human-settlement'] : []),
  ])
  const visibleDemos = demoItems.filter((item) => selectedDemoSections.has(item.section))
  return <section className="rounded-2xl border border-line bg-panel p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-sand">Astrobiology research maps</h2><span className="font-mono text-[8px] text-gold">EVIDENCE ONLY</span></div>
    <p className="mt-1 text-[9px] leading-relaxed text-muted">Habitability asks whether an environment could support life. Biosignature investigations ask whether observations could indicate life. The map layers stay independent.</p>
    {error ? <p role="alert" className="mt-3 rounded-lg border border-warn/30 bg-void p-2 text-[9px] text-warn">Map records unavailable: {error}</p> : null}
    <div className="mt-3 space-y-2">
      <label className="flex items-start gap-2 rounded-lg border border-line bg-void p-2.5 text-[10px]">
        <input type="checkbox" className="mt-0.5 accent-[#55d6be]" checked={showHabitability} onChange={(event) => onToggleHabitability(event.target.checked)} />
        <span><strong className="text-sand">Potential habitability evidence</strong><span className="mt-0.5 block text-muted">Ancient environments and water-resource context; teal map pins.</span></span>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-line bg-void p-2.5 text-[10px]">
        <input type="checkbox" className="mt-0.5 accent-[#c780ff]" checked={showPastLife} onChange={(event) => onTogglePastLife(event.target.checked)} />
        <span><strong className="text-sand">Past-life investigation</strong><span className="mt-0.5 block text-muted">Organic observations and sample targets with unresolved biological origin; violet pins.</span></span>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-line bg-void p-2.5 text-[10px]">
        <input type="checkbox" className="mt-0.5 accent-[#ef7f78]" checked={showPresentLife} onChange={(event) => onTogglePresentLife(event.target.checked)} />
        <span><strong className="text-sand">Present-life investigation</strong><span className="mt-0.5 block text-muted">No validated current-life records are integrated; this empty layer is not evidence of absence.</span></span>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-line bg-void p-2.5 text-[10px]">
        <input type="checkbox" className="mt-0.5 accent-[#f0b35a]" checked={showSettlement} onChange={(event) => onToggleSettlement(event.target.checked)} />
        <span><strong className="text-sand">Human settlement resource context</strong><span className="mt-0.5 block text-muted">Separate from microbial habitability; amber pins show resource evidence only.</span></span>
      </label>
    </div>
    {data ? <div className="mt-3 rounded-lg border border-warn/25 bg-void p-2.5">
      <p className="text-[10px] font-semibold text-warn">Habitability index: {data.habitability.score_0_100 == null ? 'unscored' : `${data.habitability.score_0_100}/100`}</p>
      <p className="mt-1 text-[9px] leading-relaxed text-muted">{data.habitability.score_explanation}</p>
      <p className="mt-1 text-[9px] leading-relaxed text-muted">{data.habitability.temporal_warning}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-[9px] text-gold">Review the ten factor inputs</summary>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-[8px] text-muted">{data.habitability.factors.map((factor) => <li key={factor.id}><span className="text-sand">{factor.label}:</span> {factor.status.replaceAll('-', ' ')}</li>)}</ul>
      </details>
    </div> : !error ? <p role="status" className="mt-3 text-[9px] text-muted">Loading cited regional research records…</p> : null}
    {showPresentLife && data ? <p className="mt-2 rounded-lg border border-line bg-void p-2 text-[9px] leading-relaxed text-muted">{data.biosignatures.present_life.assessment}</p> : null}
    {showSettlement && data ? <div className="mt-2 rounded-lg border border-warn/25 bg-void p-2.5"><p className="text-[10px] font-semibold text-warn">Settlement suitability: unscored</p><p className="mt-1 text-[9px] leading-relaxed text-muted">{data.human_settlement.score_explanation} {data.human_settlement.warning}</p><details className="mt-2"><summary className="cursor-pointer text-[9px] text-gold">Review settlement inputs</summary><ul className="mt-2 space-y-1 text-[8px] text-muted">{data.human_settlement.factors.map((factor) => <li key={factor.id}><span className="text-sand">{factor.id.replaceAll('-', ' ')}:</span> {factor.status.replaceAll('-', ' ')}</li>)}</ul></details></div> : null}
    <div className="mt-3 space-y-2">
      {records.map((record) => <article key={record.id} className="rounded-lg border border-line bg-void p-2.5">
        <div className="flex items-start justify-between gap-2"><div><h3 className="text-[10px] font-semibold text-sand">{record.site}</h3><p className="mt-0.5 text-[9px] text-gold">{record.title}</p></div><span className="shrink-0 text-[8px] text-muted">{record.temporal_context}</span></div>
        <p className="mt-1 text-[9px] leading-relaxed text-muted">{record.summary}</p>
        <p className="mt-1 text-[8px] leading-relaxed text-amber-200">{record.interpretation_limit}</p>
        <p className="mt-1 font-mono text-[8px] text-muted">Regional map anchor · {record.coordinates.latitude_deg.toFixed(3)}° lat · {record.coordinates.longitude_deg.toFixed(3)}° E</p>
        <div className="mt-2 flex items-center justify-between gap-2"><a href={record.source_url} target="_blank" rel="noreferrer" className="text-[8px] text-gold underline">NASA source</a><button type="button" onClick={() => onFocus(record.coordinates.latitude_deg, record.coordinates.longitude_deg)} className="rounded border border-line px-2 py-1 text-[8px] text-gold hover:bg-panel-alt">Focus map</button></div>
      </article>)}
      {!records.length && (showHabitability || showPastLife || showSettlement) && data ? <p className="rounded-lg border border-line bg-void p-2 text-[9px] text-muted">No records are available for the selected layer.</p> : null}
    </div>
    {data ? <p className="mt-3 text-[8px] leading-relaxed text-muted">{data.separation_note} {data.source_note}</p> : null}
    {visibleDemos.length ? <section className="mt-3 rounded-xl border border-amber-500/35 bg-[#201606]/70 p-3" aria-label="Synthetic demonstration records">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-[9px] font-semibold tracking-wide text-amber-300 uppercase">Optional synthetic examples</p><p className="mt-1 text-[8px] text-muted">Not plotted on Mars.</p></div><button type="button" aria-expanded={showDemos} onClick={() => setShowDemos((value) => !value)} className={`rounded-lg border px-2.5 py-1.5 text-[9px] ${showDemos ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-line text-sand hover:bg-panel-alt'}`}>{showDemos ? 'Stop demo' : 'Start demo'}</button></div>
      {showDemos ? <><p role="status" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/35 p-2 text-[8px] leading-relaxed text-amber-100">DEMO ONLY · These examples have no Mars coordinates and are not used by evidence records, scores, hazards, or routes.</p><div className="mt-2 space-y-2">{visibleDemos.map((item) => <article key={item.id} className="rounded-lg border border-amber-500/30 bg-black/30 p-2">
        <h4 className="text-[9px] font-semibold text-sand">{item.name} <span className="font-mono text-amber-300">DEMO</span></h4>
        <DemoSampleVisualization sample={item.sample}/>
        <p className="mt-1 text-[8px] leading-relaxed text-muted">{item.explanation}</p>
      </article>)}</div></> : <p className="mt-2 text-[9px] text-muted">Start demo to view synthetic examples for the selected evidence layer.</p>}
    </section> : null}
  </section>
}
