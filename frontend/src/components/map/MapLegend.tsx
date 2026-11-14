interface LegendItem {
  colorClass: string
  label: string
  note: string
}

const LEGEND: LegendItem[] = [
  {
    colorClass: 'bg-mars',
    label: 'High-risk locations',
    note: 'Reserved. No hazard detections are plotted yet.',
  },
  {
    colorClass: 'bg-ember',
    label: 'Moderate-risk locations',
    note: 'Reserved for future severity classes.',
  },
  {
    colorClass: 'bg-ok',
    label: 'Relatively safe locations',
    note: 'Reserved. No ranked sites are shown.',
  },
  {
    colorClass: 'bg-sky-400',
    label: 'Water or ice observations',
    note: 'Shown only when a supporting dataset is connected.',
  },
  {
    colorClass: 'bg-gold',
    label: 'Astronaut markers',
    note: 'Reserved. Crew positions are not invented.',
  },
]

export function MapLegend() {
  return (
    <aside
      className="rounded-xl border border-line bg-void/85 px-3 py-2.5 shadow-lg backdrop-blur-md"
      aria-label="Map legend"
    >
      <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
        Legend · future overlays
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
