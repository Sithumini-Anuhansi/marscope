import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, Brain, CircleHelp, LoaderCircle, RefreshCw } from 'lucide-react'
import { getHazardAssessmentAtLocation } from '../services/hazardService'
import { getRiskServiceStatus, submitRiskAssessment } from '../services/riskService'
import type { HazardAssessment, HazardLocationResponse } from '../types/hazard'
import type { RiskAssessmentResult, RiskFeatureInput, RiskFeatureName, RiskServiceStatus } from '../types/risk'

const FEATURE_LABELS: Record<string, string> = {
  terrain_slope: 'Terrain slope',
  surface_roughness: 'Surface roughness',
  elevation_variation: 'Elevation variation',
  temperature: 'Temperature',
  wind_speed: 'Wind speed',
  dust_opacity: 'Dust opacity',
}

function parseInitialCoordinate(value: string | null, minimum: number, maximum: number): string {
  if (value === null) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? String(parsed) : ''
}

function toRiskFeatures(response: HazardLocationResponse): Partial<Record<RiskFeatureName, RiskFeatureInput>> {
  const features: Partial<Record<RiskFeatureName, RiskFeatureInput>> = {}
  const featureNames = new Set<RiskFeatureName>(['terrain_slope', 'surface_roughness', 'elevation_variation'])
  for (const assessment of response.assessments) {
    if (!featureNames.has(assessment.category as RiskFeatureName) || !assessment.measurement || !assessment.source_dataset) continue
    const [periodStart, periodEnd] = assessment.source_dataset.source_period_utc
    if (!periodStart || !periodEnd) continue
    features[assessment.category as RiskFeatureName] = {
      value: assessment.measurement.value,
      units: assessment.measurement.units,
      source_dataset: assessment.source_dataset.dataset_id,
      source_product_id: assessment.source_dataset.product_id,
      observation_period_start: periodStart,
      observation_period_end: periodEnd,
      resolution_km: assessment.source_dataset.resolution_km_per_cell,
    }
  }
  return features
}

function explainCategory(category: string): string {
  return FEATURE_LABELS[category] ?? category.replaceAll('_', ' ')
}

function classificationTone(classification: string): string {
  const tones: Record<string, string> = {
    low: 'border-ok/35 text-ok',
    moderate: 'border-warn/35 text-warn',
    high: 'border-ember/40 text-ember',
    critical: 'border-mars/40 text-mars',
  }
  return tones[classification] ?? 'border-line text-muted'
}

export function RiskAssessmentPage() {
  const [searchParams] = useSearchParams()
  const [latitude, setLatitude] = useState(() => parseInitialCoordinate(searchParams.get('latitude_deg'), -90, 90))
  const [longitude, setLongitude] = useState(() => parseInitialCoordinate(searchParams.get('longitude_deg'), -180, 360))
  const [status, setStatus] = useState<RiskServiceStatus | null>(null)
  const [result, setResult] = useState<RiskAssessmentResult | null>(null)
  const [terrainSource, setTerrainSource] = useState<HazardLocationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getRiskServiceStatus(controller.signal)
      .then(setStatus)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Could not read risk service status.')
        }
      })
    return () => controller.abort()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const latitudeDeg = Number(latitude)
    const longitudeDeg = Number(longitude)
    if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
      setError('Enter a planetocentric latitude from −90° to 90°.')
      return
    }
    if (!Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 360) {
      setError('Enter a positive-east longitude from −180° to 360°.')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(null)
    setTerrainSource(null)
    try {
      const terrain = await getHazardAssessmentAtLocation(latitudeDeg, longitudeDeg, controller.signal)
      setTerrainSource(terrain)
      const assessment = await submitRiskAssessment({
        latitude_deg: latitudeDeg,
        longitude_deg: longitudeDeg,
        latitude_type: 'planetocentric',
        longitude_direction: 'positive-east',
        features: toRiskFeatures(terrain),
      }, controller.signal)
      setResult(assessment)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Risk assessment request failed.')
    } finally {
      setLoading(false)
    }
  }

  const terrainMetrics = terrainSource?.assessments.filter((item) => item.observation_kind === 'derived') ?? []

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">Decision support · experimental</p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Risk assessment</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Query terrain metrics for a Mars location and submit their provenance to the risk service. A validated ML model is not currently available; results will say so instead of inventing a score.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-gold" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-sand">Assess a location</h2>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Coordinates use planetocentric latitude and positive-east longitude. Select a point on Mars Explorer to prefill these fields.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block text-xs text-muted">
              Planetocentric latitude (°)
              <input
                className="mt-1.5 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-sm text-sand outline-none focus:border-gold"
                inputMode="decimal"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              Positive-east longitude (°)
              <input
                className="mt-1.5 block w-full rounded-lg border border-line bg-void px-3 py-2 font-mono text-sm text-sand outline-none focus:border-gold"
                inputMode="decimal"
                type="number"
                step="any"
                min="-180"
                max="360"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs font-medium text-gold hover:bg-gold/15 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {loading ? 'Assessing…' : 'Refresh assessment'}
            </button>
          </form>

          {error ? <p className="mt-3 text-xs text-mars" role="alert">{error}. Check that the backend is running.</p> : null}
        </div>

        <div className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CircleHelp className="h-4 w-4 text-gold" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-sand">Service readiness</h2>
            </div>
            <span className="rounded-full border border-warn/35 px-2.5 py-1 font-mono text-[10px] text-warn uppercase">
              {status?.validated_model_available ? 'Model available' : 'Model unavailable'}
            </span>
          </div>
          {status ? (
            <>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <ReadinessItem label="Model version" value={status.model_version ?? 'None registered'} />
                <ReadinessItem label="Rule baseline" value={status.rule_based_baseline} />
                <ReadinessItem label="Risk score" value={status.score_available ? 'Available' : 'Unavailable'} />
                <ReadinessItem label="Confidence" value={status.confidence_available ? 'Available' : 'Unquantified'} />
              </dl>
              <ul className="mt-4 space-y-1.5 text-[11px] text-muted">
                {status.reasons.map((reason) => <li key={reason} className="flex gap-2"><span className="text-gold">•</span>{reason}</li>)}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-xs text-muted">Checking model and data readiness…</p>
          )}
        </div>
      </section>

      {result ? (
        <section className="rounded-2xl border border-line bg-panel/80 p-4 md:p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">{result.method.replaceAll('-', ' ')}</p>
              <h2 className="mt-1 text-lg font-semibold text-sand">{result.risk_classification}</h2>
              <p className="mt-1 text-[11px] text-muted">
                {result.location.latitude_deg.toFixed(3)}° planetocentric · {result.location.longitude_deg.toFixed(3)}° E · {result.assessment_status}
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase ${classificationTone(result.risk_classification)}`}>
              {result.classification_status.replaceAll('-', ' ')}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SummaryCard label="Risk score" value={result.risk_score === null ? 'Unavailable' : String(result.risk_score)} note={result.score_unavailable_reason} />
            <SummaryCard label="Model version" value={result.model_version ?? 'None'} note={result.explanation} />
            <SummaryCard label="Uncertainty" value={result.confidence === null ? 'Unquantified' : String(result.confidence)} note={result.uncertainty} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold text-sand">Terrain features submitted</h3>
              {terrainMetrics.length ? (
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {terrainMetrics.map((metric: HazardAssessment) => (
                    <li key={metric.category} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-xs text-sand">{explainCategory(metric.category)}</span>
                      <span className="font-mono text-[11px] text-gold">
                        {metric.measurement ? `${metric.measurement.value.toFixed(2)} ${metric.measurement.units}` : 'Unavailable'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-muted">No validated MOLA terrain metrics were available for this point.</p>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {terrainSource?.message ?? 'Terrain source information was not returned.'}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-sand">Contributing features</h3>
              {result.contributing_features.length ? (
                <ul className="mt-2 space-y-2">
                  {result.contributing_features.map((feature) => (
                    <li key={feature.feature} className="rounded-lg border border-line bg-void/50 p-3 text-[11px]">
                      <p className="font-medium text-sand">{explainCategory(feature.feature)} · {feature.value} {feature.units}</p>
                      <p className="mt-1 leading-relaxed text-muted">{feature.rationale} Source: {feature.reference}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg border border-line bg-void/50 p-3 text-[11px] leading-relaxed text-muted">
                  No feature contributions can be attributed without a matching validated model or configured policy rule.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-line bg-void/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-sand">
              <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              Missing inputs and limits
            </div>
            <ul className="mt-2 grid gap-1 text-[10px] text-muted sm:grid-cols-2">
              {result.missing_inputs.map((item) => <li key={item}>• {item}</li>)}
            </ul>
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              {result.feature_location_status}. This assessment is not a probability of survival or mission success. Result ID: {result.assessment_id}
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-panel/40 p-6 text-center">
          <p className="text-sm font-medium text-sand">No assessment submitted</p>
          <p className="mt-2 text-xs text-muted">Enter coordinates or select a point on the Mars Explorer, then request a refresh.</p>
          <Link to="/explorer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-gold hover:text-sand">
            Open Mars Explorer <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  )
}

function ReadinessItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-void/40 px-3 py-2"><dt className="text-[10px] text-muted">{label}</dt><dd className="mt-1 break-words text-[11px] text-sand">{value}</dd></div>
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-lg border border-line bg-void/40 p-3"><p className="text-[10px] text-muted">{label}</p><p className="mt-1 text-sm font-medium text-sand">{value}</p><p className="mt-1 text-[10px] leading-snug text-muted">{note}</p></div>
}
