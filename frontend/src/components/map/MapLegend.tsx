interface LegendItem {
  colorClass: string
  label: string
  note: string
}

const LEGEND: LegendItem[] = [
  {
    colorClass: 'bg-gold',
    label: 'Terrain assessment point',
    note: 'Marks only the selected query cell; it is not a hazard detection.',
  },
  {
    colorClass: 'bg-mars',
    label: 'Severity classification',
    note: 'Unclassified until a documented policy and supporting inputs are available.',
  },
  {
    colorClass: 'bg-sky-400',
    label: 'Environmental data',
    note: 'Temperature, wind, dust, and radiation layers are unavailable.',
  },
  {
    colorClass: 'bg-gold',
    label: 'No detected hazards',
    note: 'The current API returns terrain metrics, not classified hazard locations.',
  },
]

export function MapLegend() {
  return (
    <aside
      className="rounded-xl border border-line bg-void/85 px-3 py-2.5 shadow-lg backdrop-blur-md"
      aria-label="Map legend"
    >
      <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
        Legend · terrain assessment
      </p>
      <ul className="space-y-1.5">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[11px]">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.colorClass}`} aria-hidden="true" />
            <span>
              <span className="text-sand">{item.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-muted">{item.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
