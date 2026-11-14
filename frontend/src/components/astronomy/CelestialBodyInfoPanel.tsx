import { ExternalLink, Orbit } from 'lucide-react'
import type { CelestialBody, EphemerisTrack, EphemerisVector } from '../../services/solarSystemService'

function display(value: number | null, suffix: string, digits = 2): string {
  return value == null || !Number.isFinite(value) ? 'Not available' : `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${suffix}`
}
function latest(track: EphemerisTrack | undefined): EphemerisVector | undefined {
  if (!track?.vectors.length) return undefined
  return track.vectors.reduce((closest, item) => Math.abs(Date.parse(item.epoch) - Date.now()) < Math.abs(Date.parse(closest.epoch) - Date.now()) ? item : closest)
}

export function CelestialBodyInfoPanel({ body, track, centerName }: { body: CelestialBody; track?: EphemerisTrack; centerName: string }) {
  const vector = latest(track)
  const distance = vector ? Math.hypot(vector.x_km, vector.y_km, vector.z_km) : null
  return <aside className="rounded-2xl border border-line bg-panel p-5" aria-label={`${body.name} details`}>
    <p className="font-mono text-[10px] tracking-[.2em] text-gold uppercase">Selected celestial body</p>
    <h2 className="mt-1 text-2xl font-semibold text-sand">{body.name}</h2>
    <p className="mt-1 text-xs text-muted">{body.classification}</p>
    <p className="mt-4 text-sm leading-relaxed text-sand/85">{body.description}</p>
    <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Diameter</dt><dd className="mt-1 text-sand">{display(body.diameter_km, 'km')}</dd></div>
      {body.dimensions_km ? <div className="rounded-lg bg-void p-3"><dt className="text-muted">Approx. dimensions</dt><dd className="mt-1 text-sand">{body.dimensions_km.join(' × ')} km</dd></div> : null}
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Mass</dt><dd className="mt-1 text-sand">{display(body.mass_kg, 'kg', 3)}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Mean distance {body.parent_id ? 'from Mars' : 'from Sun'}</dt><dd className="mt-1 text-sand">{display(body.mean_distance_km, 'km')}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Orbital period</dt><dd className="mt-1 text-sand">{display(body.orbital_period_days, 'days')}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Rotation period</dt><dd className="mt-1 text-sand">{display(body.rotation_period_hours, 'hours')} {body.rotation_period_hours != null && body.rotation_period_hours < 0 ? '(retrograde)' : ''}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Surface gravity</dt><dd className="mt-1 text-sand">{display(body.gravity_m_s2, 'm/s²')}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Mean temperature</dt><dd className="mt-1 text-sand">{display(body.mean_surface_temperature_c, '°C')}</dd></div>
      <div className="rounded-lg bg-void p-3"><dt className="text-muted">Atmosphere</dt><dd className="mt-1 text-sand">{body.atmosphere ?? 'Not supplied'}</dd></div>
    </dl>
    {body.discovery ? <p className="mt-3 rounded-lg border border-line bg-void p-3 text-xs text-muted"><span className="text-sand">Discovery:</span> {body.discovery}</p> : null}
    {track ? <div className="mt-4 rounded-xl border border-gold/25 bg-gold/5 p-3"><p className="flex items-center gap-2 text-[10px] font-medium text-gold"><Orbit className="h-3.5 w-3.5"/>DYNAMIC POSITION · {track.status.toUpperCase()}</p>{vector ? <><p className="mt-2 font-mono text-[10px] text-sand">{track.target} from {centerName} · {vector.epoch}</p><p className="mt-1 text-[10px] text-muted">Distance {display(distance, 'km', 1)} · vector frame: ECLIPTIC / ICRF · UT · geometric (no light-time correction)</p><p className="mt-1 break-all font-mono text-[9px] text-muted">X {vector.x_km.toExponential(4)} · Y {vector.y_km.toExponential(4)} · Z {vector.z_km.toExponential(4)} km</p></> : <p className="mt-2 text-xs text-muted">Position unavailable{track.error ? `: ${track.error}` : ''}</p>}</div> : null}
    <p className="mt-4 text-[9px] leading-relaxed text-muted">Physical values are approximate static references; live positions are separate Horizons state vectors. Null values are not shown as zero.</p>
    <a href={body.reference_source} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] text-gold hover:text-sand">Reference source <ExternalLink className="h-3 w-3"/></a>
  </aside>
}
