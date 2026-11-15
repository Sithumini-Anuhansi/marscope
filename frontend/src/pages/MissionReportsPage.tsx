import { ScienceDemoPanel } from '../components/common/ScienceDemoPanel'

export function MissionReportsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <header><p className="font-mono text-[10px] tracking-[0.25em] text-gold uppercase">Mission documentation · examples</p><h1 className="mt-2 text-2xl font-semibold text-sand">Mission Reports</h1><p className="mt-1 max-w-3xl text-sm text-muted">Report generation is not connected to a real mission log yet. Browse synthetic science records to see the kinds of fields a future report could contain.</p></header>
      <section className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-muted"><strong className="text-sand">Report workflow status:</strong> Sol summaries, crew observations, telemetry, and export are not yet assembled into a report. No operational report is generated from these examples.</section>
      <ScienceDemoPanel sections={['atmosphere', 'environmental-hazards', 'terrain', 'habitability', 'biosignatures', 'human-settlement']} title="Sample science records for a future report" />
    </main>
  )
}
