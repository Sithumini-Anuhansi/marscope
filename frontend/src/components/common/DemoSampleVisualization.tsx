type Scalar = string | number | boolean | null
type Metric = { label: string; value: Scalar; unit?: string }
type Distribution = { label: string; entries: Array<{ label: string; value: number; display: string }> }

const COLORS = ['#d8a84e', '#70c7d7', '#83c78b', '#c792ea', '#e47c67', '#7f9ee8']

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatValue(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function readSample(sample: Record<string, unknown>) {
  const metrics: Metric[] = []
  const distributions: Distribution[] = []
  const notes: Array<{ label: string; value: string }> = []

  function visit(value: unknown, path: string[], skip = false) {
    if (value == null) {
      if (path.length) notes.push({ label: titleCase(path.at(-1) ?? ''), value: 'Not available in this sample' })
      return
    }
    if (typeof value === 'number') {
      if (!skip) metrics.push({ label: titleCase(path.at(-1) ?? 'Value'), value, unit: path.length > 1 && path.at(-2) === 'classes' ? '%' : undefined })
      return
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      if (path.at(-1) !== 'unit' && path.length) notes.push({ label: titleCase(path.at(-1) ?? ''), value: String(value) })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, String(index)]))
      return
    }
    if (typeof value !== 'object') return

    const record = value as Record<string, unknown>
    if (typeof record.value === 'number') {
      metrics.push({ label: titleCase(path.at(-1) ?? 'Value'), value: record.value, unit: typeof record.unit === 'string' ? record.unit : undefined })
      return
    }
    const numericEntries = Object.entries(record).filter(([, item]) => typeof item === 'number') as Array<[string, number]>
    if ((path.at(-1) === 'classes' || path.at(-1) === 'atmosphere') && numericEntries.length > 1) {
      const total = numericEntries.reduce((sum, [, number]) => sum + Math.max(0, number), 0)
      if (total > 0) distributions.push({ label: titleCase(path.at(-1) ?? 'Composition'), entries: numericEntries.map(([name, number]) => ({ label: titleCase(name), value: Math.max(0, number) / total * 100, display: formatValue(number) })) })
      return
    }
    for (const [key, item] of Object.entries(record)) {
      if (key === 'unit') continue
      if (key.endsWith('_0_100') && typeof item === 'number') {
        metrics.push({ label: titleCase(key), value: item, unit: 'demo score / 100' })
      } else visit(item, [...path, key])
    }
  }

  visit(sample, [])
  return { metrics, distributions, notes }
}

export function DemoSampleVisualization({ sample }: { sample: Record<string, unknown> }) {
  const { metrics, distributions, notes } = readSample(sample)
  return <div className="mt-3 space-y-3" aria-label="Visualized illustrative sample values">
    {distributions.map((distribution) => <section key={distribution.label} className="rounded-lg border border-amber-500/20 bg-black/20 p-3">
      <h4 className="text-[10px] font-medium text-sand">{distribution.label} · sample composition</h4>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-black/40" role="img" aria-label={`${distribution.label} sample composition bar`}>
        {distribution.entries.map((entry, index) => <span key={entry.label} title={`${entry.label}: ${entry.display}`} style={{ width: `${entry.value}%`, backgroundColor: COLORS[index % COLORS.length] }}/>) }
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{distribution.entries.map((entry, index) => <p key={entry.label} className="flex items-center gap-1.5 text-[9px] text-muted"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}/>{entry.label}: <span className="font-mono text-sand">{entry.display}</span></p>)}</div>
      <p className="mt-2 text-[8px] text-amber-200">Relative proportions of synthetic demo values; not a scientific distribution.</p>
    </section>)}

    {metrics.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{metrics.map((metric, index) => {
      const score = metric.unit === 'demo score / 100' && typeof metric.value === 'number'
      return <article key={`${metric.label}-${index}`} className="rounded-lg border border-amber-500/20 bg-black/20 p-2.5">
        <p className="text-[8px] leading-snug text-muted">{metric.label}</p><p className="mt-1 break-words font-mono text-sm font-medium text-sand">{typeof metric.value === 'number' ? formatValue(metric.value) : String(metric.value)}{metric.unit && !score ? <span className="ml-1 text-[8px] font-normal text-muted">{metric.unit}</span> : null}</p>
        {score ? <><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/50"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, metric.value as number))}%` }}/></div><p className="mt-1 text-[8px] text-amber-200">Demo score only · not a real assessment</p></> : null}
      </article>
    })}</div> : null}

    {notes.length ? <div className="grid gap-1.5">{notes.map((note, index) => <div key={`${note.label}-${index}`} className="rounded-md border border-line/70 bg-black/15 px-2.5 py-2"><p className="text-[8px] text-muted">{note.label}</p><p className="mt-0.5 break-words text-[9px] leading-relaxed text-sand/90">{note.value}</p></div>)}</div> : null}
  </div>
}
