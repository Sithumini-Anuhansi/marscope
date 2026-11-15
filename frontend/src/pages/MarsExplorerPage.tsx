import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Crosshair, MapPin, Route as RouteIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MapErrorBoundary } from '../components/map/MapErrorBoundary'
import { MarsGlobe } from '../components/map/MarsGlobe'
import { getPlanetaryArchiveProducts } from '../services/planetaryArchiveService'
import type { PlanetaryArchiveResponse } from '../types/planetaryArchive'
import { geodeticToPlanetocentricLatitude } from '../utils/marsCoordinates'

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
  const [selecting, setSelecting] = useState<RouteEndpoint | null>(null)
  const [studyAreaFocused, setStudyAreaFocused] = useState(false)
  const [archivePoint, setArchivePoint] = useState<MarsPoint>(BOXWORK_STUDY_POINT)
  const [archive, setArchive] = useState<PlanetaryArchiveResponse | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const selectedPoint = selecting === 'start' ? start : destination
  const focusLocation = useMemo(() => selecting ? selectedPoint : studyAreaFocused ? BOXWORK_STUDY_POINT : destination ?? start, [selecting, selectedPoint, studyAreaFocused, destination, start])

  function onSurfaceSelect(point: MarsPoint) {
    setStudyAreaFocused(false)
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

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8.5rem)] w-full max-w-[1700px] flex-col gap-4">
      <header>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">Mars Explorer · surface mission planning</p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Plan a localized Marswalk</h1>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted">
          Build a study-area route from globe-selected endpoints, inspect connected imagery, and check what evidence is available. This is a planning prototype: the local MOLA grid is too coarse for EVA routing, and unintegrated datasets are identified below rather than shown as live layers.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative min-h-[34rem] overflow-hidden rounded-2xl border border-line bg-[#070605] xl:min-h-[42rem]">
          <MapErrorBoundary>
            <MarsGlobe
              focusLocation={focusLocation}
              onSurfaceSelect={onSurfaceSelect}
            />
          </MapErrorBoundary>
          {selecting ? <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-gold/50 bg-void/95 px-4 py-2 text-center text-xs text-gold shadow-lg">
            Click the globe to set the {selecting === 'start' ? 'Marswalk start' : 'science destination'}.
          </div> : null}
        </div>

        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl border border-line bg-panel p-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">Reference science objective</p>
            <h2 className="mt-1 text-base font-semibold text-sand">Gale Crater · Mount Sharp boxwork</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Example Marswalk: inspect boxwork ridges and hollows, then plan a route between a start point and a science stop. The reference coordinate is from a published HiRISE image pair, not a rover position; the separate orbital image below is not claimed to cover that exact point.
            </p>
            <a href="https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] text-gold hover:text-sand">
              NASA Curiosity boxwork field context <ArrowUpRight className="h-3 w-3" />
            </a>
          </section>

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
              <li className="rounded-lg border border-line bg-void p-2"><span className="font-medium text-muted">Not yet connected · MCD, MEDA, MARCI, MCS, RAD, AI4MARS</span><span className="mt-0.5 block text-muted">These need their separate climate, rover, or dataset workflows; they are not represented as live measurements here.</span></li>
            </ul>
            <a href="https://ode.rsl.wustl.edu/mars2/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] text-gold hover:text-sand">Search NASA PDS Mars ODE for site coverage <ArrowUpRight className="h-3 w-3"/></a>
          </section>
        </aside>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4 md:p-5">
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

      <section className="grid gap-4 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:p-5">
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
