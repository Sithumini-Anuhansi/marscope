import { useEffect, useState } from 'react'
import { getScienceDemoRecords } from '../../services/planetaryArchiveService'
import type { ScienceDemoRecord } from '../../types/planetaryArchive'

const SECTION_LABELS: Record<string, string> = {
  atmosphere: 'Atmosphere',
  'environmental-hazards': 'Environmental hazards',
  terrain: 'Terrain classification',
  habitability: 'Habitability',
  biosignatures: 'Biosignatures',
  'human-settlement': 'Human settlement',
}

export function ScienceDemoPanel({ sections, title = 'Demo data examples' }: { sections: string[]; title?: string }) {
  const [records, setRecords] = useState<ScienceDemoRecord[]>([])
  const [error, setError] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void getScienceDemoRecords(controller.signal).then((response) => setRecords(response.items)).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [])

  const shown = records.filter((record) => sections.includes(record.section))
  return <section className="rounded-2xl border border-amber-500/35 bg-[#201606]/70 p-4" aria-label="Synthetic demo data">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[9px] tracking-widest text-amber-300 uppercase">Optional demonstration</p><h2 className="mt-1 text-sm font-semibold text-sand">{title}</h2></div>
      <button type="button" aria-expanded={demo} onClick={() => setDemo((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs ${demo ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-line text-sand hover:bg-panel-alt'}`}>{demo ? 'Stop demo' : 'Start demo'}</button>
    </div>
    {demo ? <><p role="status" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/35 p-2 text-[10px] leading-relaxed text-amber-100">DEMO ONLY · Illustrative values, not NASA observations. Excluded from science maps, hazard classification, risk scores, and route planning. Not operational data.</p>{error ? <p role="status" className="mt-3 text-[10px] text-amber-100">Demo service unavailable. Real assessment inputs remain unchanged.</p> : <div className="mt-3 grid gap-2 md:grid-cols-2">
      {shown.map((record) => <details key={record.id} className="rounded-lg border border-amber-500/25 bg-[#100c07] p-3">
        <summary className="cursor-pointer text-xs font-medium text-sand">{record.name}<span className="ml-2 font-mono text-[8px] text-amber-300">{SECTION_LABELS[record.section] ?? record.section}</span></summary>
        <p className="mt-2 text-[9px] leading-relaxed text-amber-100">{record.explanation}</p>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[9px] text-sand/80">{JSON.stringify(record.sample, null, 2)}</pre>
      </details>)}
    </div>}</> : <p className="mt-2 text-[10px] text-muted">Start the demonstration to view synthetic examples for this section.</p>}
  </section>
}
