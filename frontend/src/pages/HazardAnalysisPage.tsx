import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { ScienceDemoPanel } from '../components/common/ScienceDemoPanel'
import { getHazardAssessmentForRegion, getHazardServiceStatus } from '../services/hazardService'
import type { HazardRegionResponse, HazardServiceStatus } from '../types/hazard'

const METRIC_LABELS: Record<string, string> = {
  terrain_slope: 'Terrain slope',
  surface_roughness: 'Surface roughness',
  elevation_variation: 'Elevation variation',
  crater_depression: 'Crater / depression',
  temperature: 'Temperature',
  wind: 'Wind exposure',
  dust: 'Dust exposure',
  radiation: 'Radiation',
}

const AVAILABLE_METRICS = ['terrain_slope', 'surface_roughness', 'elevation_variation']

export function HazardAnalysisPage() {
  const [status, setStatus] = useState<HazardServiceStatus | null>(null)
  const [result, setResult] = useState<HazardRegionResponse | null>(null)
  const [bounds, setBounds] = useState({ west: '-1', south: '-1', east: '1', north: '1' })
  const [selected, setSelected] = useState<string[]>(AVAILABLE_METRICS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getHazardServiceStatus(controller.signal)
      .then(setStatus)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Could not load hazard service status.')
      })
    return () => controller.abort()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof bounds, number>
    if (Object.values(parsed).some((value) => !Number.isFinite(value)) || parsed.south < -90 || parsed.north > 90 || parsed.south >= parsed.north) {
      setError('Enter finite bounds with −90° ≤ south < north ≤ 90°.')
      return
    }
    if (parsed.west === parsed.east || !selected.length) {
      setError('Choose a non-zero longitude span and at least one terrain metric.')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await getHazardAssessmentForRegion(parsed, selected, controller.signal)
      setResult(response)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Regional assessment request failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">Scientific context · MOLA</p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Terrain and hazard analysis</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Explore regional statistics from the processed MOLA terrain grid. These coarse, historical measurements are context only: without validated rules and supporting data, the system does not label terrain safe or hazardous.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-sand">Summarize a region</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">Latitude is planetocentric. Longitude is positive east; west-to-east ranges can cross the 0° seam.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(['west', 'south', 'east', 'north'] as const).map((key) => (
              <label key={key} className="text-xs capitalize text-muted">
                {key} bound (°)
                <input
                  className="mt-1.5 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-sm text-sand outline-none focus:border-gold"
                  type="number" step="any" value={bounds[key]}
                  min={key === 'south' ? -90 : undefined} max={key === 'north' ? 90 : undefined}
                  onChange={(event) => setBounds((current) => ({ ...current, [key]: event.target.value }))}
                  required
                />
              </label>
            ))}
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs text-muted">Terrain metrics</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {AVAILABLE_METRICS.map((category) => (
                <label key={category} className="flex items-center gap-2 text-[11px] text-sand">
                  <input type="checkbox" checked={selected.includes(category)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, category] : current.filter((item) => item !== category))} />
                  {METRIC_LABELS[category]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs font-medium text-gold hover:bg-gold/15 disabled:cursor-wait disabled:opacity-60">
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Summarizing…' : 'Run regional summary'}
          </button>
          {error ? <p className="mt-3 text-xs text-mars" role="alert">{error}. Check that the backend is running and the processed MOLA sample is available.</p> : null}
        </form>

        <section className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-sand">Data readiness</h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-gold">{status?.status ?? 'Checking service…'}</p>
            </div>
            <span className="rounded-full border border-warn/35 px-2.5 py-1 font-mono text-[10px] text-warn uppercase">{status?.severity_policy ?? 'Policy status unavailable'}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{status?.message ?? 'Loading hazard service status.'}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CategoryList title="Available terrain metrics" categories={status?.available_categories ?? []} />
            <CategoryList title="Unavailable inputs" categories={status?.unavailable_categories ?? []} />
          </div>
          <p className="mt-3 text-[10px] text-muted">Processing run: <span className="font-mono text-sand">{status?.processing_run ?? 'None detected'}</span></p>
        </section>
      </section>

      <ScienceDemoPanel sections={['environmental-hazards', 'atmosphere', 'terrain']} title="Hazard and atmosphere display examples" />

      {result ? (
        <section className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">{result.assessment_mode?.replaceAll('-', ' ') ?? 'Regional terrain summary'}</p>
              <h2 className="mt-1 text-lg font-semibold text-sand">{result.region ? `${result.region.west_longitude_deg}° to ${result.region.east_longitude_deg}° E · ${result.region.south_latitude_deg}° to ${result.region.north_latitude_deg}°` : 'Region summary'}</h2>
              <p className="mt-1 text-[11px] text-muted">{result.assessment_status} · run {result.processing_run ?? 'unavailable'}</p>
            </div>
            <Link to="/explorer" className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-sand">Open map <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{result.message}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {result.assessments.map((item) => (
              <article key={item.category} className="rounded-xl border border-line bg-void/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-semibold text-sand">{METRIC_LABELS[item.category] ?? item.category}</h3>
                  <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-muted uppercase">{item.severity}</span>
                </div>
                {item.summary ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <Metric label="Minimum" value={`${item.summary.minimum.toFixed(2)} ${item.summary.units}`} />
                    <Metric label="Mean" value={`${item.summary.mean.toFixed(2)} ${item.summary.units}`} />
                    <Metric label="Maximum" value={`${item.summary.maximum.toFixed(2)} ${item.summary.units}`} />
                    <Metric label="Valid cells" value={item.summary.sample_count.toLocaleString()} />
                  </dl>
                ) : <p className="mt-3 text-[11px] text-muted">No validated source data for this input.</p>}
                <p className="mt-3 text-[10px] leading-relaxed text-muted">{item.classification?.reason ?? item.methodology ?? 'Unclassified metric; this is not a hazard decision.'}</p>
                {item.source_dataset ? <p className="mt-2 text-[9px] text-muted">{item.source_dataset.product_id} · {item.source_dataset.resolution_km_per_cell.toFixed(1)} km/cell · uncertainty {item.uncertainty ?? item.source_dataset.uncertainty}</p> : null}
              </article>
            ))}
          </div>
          <div className="mt-4 flex gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[10px] leading-relaxed text-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
            Regional raster summaries are not hazard polygons. Severity remains unclassified unless an explicitly configured, referenced policy applies.
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-panel/40 p-6 text-center">
          <p className="text-sm font-medium text-sand">No regional summary yet</p>
          <p className="mt-2 text-xs text-muted">Choose a bounded area and metrics, or query a point on the Mars Explorer map.</p>
          <Link to="/explorer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-gold hover:text-sand">Open Mars Explorer <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </section>
      )}
    </div>
  )
}

function CategoryList({ title, categories }: { title: string; categories: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-void/40 p-3">
      <h3 className="text-[10px] font-semibold text-sand">{title}</h3>
      {categories.length ? <ul className="mt-2 flex flex-wrap gap-1.5">{categories.map((category) => <li key={category} className="rounded-full border border-line px-2 py-1 text-[9px] text-muted">{METRIC_LABELS[category] ?? category.replaceAll('_', ' ')}</li>)}</ul> : <p className="mt-2 text-[10px] text-muted">None reported</p>}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line/70 px-2 py-1.5"><dt className="text-muted">{label}</dt><dd className="mt-0.5 font-mono text-sand">{value}</dd></div>
}
