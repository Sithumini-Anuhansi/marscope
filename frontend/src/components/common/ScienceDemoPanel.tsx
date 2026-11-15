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
  useEffect(() => {
    const controller = new AbortController()
    void getScienceDemoRecords(controller.signal).then((response) => setRecords(response.items)).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [])

  const shown = records.filter((record) => sections.includes(record.section))
  return <section className="rounded-2xl border-2 border-amber-500/60 bg-[#201606] p-4" aria-label="Synthetic demo data">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[9px] tracking-widest text-amber-300 uppercase">DEMO ONLY · synthetic</p><h2 className="mt-1 text-sm font-semibold text-sand">{title}</h2></div>
      <span className="rounded-full border border-amber-500/40 px-2 py-1 text-[9px] text-amber-200">Not operational data</span>
    </div>
    <p className="mt-2 text-[10px] leading-relaxed text-amber-100">Illustrative UI examples only. These values are not NASA observations and are excluded from science maps, hazard classification, risk scores, and route planning.</p>
    {error ? <p role="status" className="mt-3 text-[10px] text-amber-100">Demo service unavailable. Real assessment inputs remain unchanged.</p> : <div className="mt-3 grid gap-2 md:grid-cols-2">
      {shown.map((record) => <details key={record.id} className="rounded-lg border border-amber-500/25 bg-[#100c07] p-3">
        <summary className="cursor-pointer text-xs font-medium text-sand">{record.name}<span className="ml-2 font-mono text-[8px] text-amber-300">{SECTION_LABELS[record.section] ?? record.section}</span></summary>
        <p className="mt-2 text-[9px] leading-relaxed text-amber-100">{record.explanation}</p>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[9px] text-sand/80">{JSON.stringify(record.sample, null, 2)}</pre>
      </details>)}
    </div>}
  </section>
}
