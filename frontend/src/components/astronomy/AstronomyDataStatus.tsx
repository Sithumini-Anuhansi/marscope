import { Radio, TriangleAlert } from 'lucide-react'
import type { EphemerisTrack } from '../../services/solarSystemService'

export function AstronomyDataStatus({ tracks, source = 'NASA/JPL Horizons' }: { tracks: EphemerisTrack[]; source?: string }) {
  const states = tracks.map((track) => track.status)
  const live = states.filter((status) => status === 'live').length
  const cached = states.filter((status) => status === 'cached').length
  const stale = states.filter((status) => status === 'stale').length
  const unavailable = states.filter((status) => status === 'unavailable').length
  const label = unavailable === tracks.length ? 'Unavailable' : stale ? 'Cached result · stale' : cached ? 'Cached result' : 'Retrieved from source'
  const latestEpoch = tracks.flatMap((track) => track.vectors).map((vector) => vector.epoch)[0]
  const fetched = tracks.find((track) => track.fetched_at)?.fetched_at
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-void/65 px-3 py-2 text-[10px]" role="status">
    <span className="inline-flex items-center gap-2 text-sand"><Radio className="h-3.5 w-3.5 text-gold"/>{source} · {label}</span>
    <span className="text-muted">{latestEpoch ? `Sample epoch ${latestEpoch}` : 'No position epoch available'}{fetched ? ` · retrieved ${new Date(fetched).toLocaleString()}` : ''}</span>
    {unavailable > 0 || stale > 0 ? <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert className="h-3 w-3"/>{unavailable ? `${unavailable} unavailable` : `${stale} stale`}</span> : null}
    {live + cached > 0 ? <span className="sr-only">{live} live and {cached} cached tracks</span> : null}
  </div>
}
