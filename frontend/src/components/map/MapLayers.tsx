import { Layers } from 'lucide-react'
import { MAP_LAYER_DEFINITIONS } from '../../services/marsImageryService'
import type { ImageryLayerId, MapLayerCategory } from '../../types/map'

interface MapLayersProps {
  imageryVisibility: Record<ImageryLayerId, boolean>
  onToggleImagery: (id: ImageryLayerId, visible: boolean) => void
}

const CATEGORY_LABEL: Record<MapLayerCategory, string> = {
  imagery: 'Surface and terrain imagery',
  environment: 'Environment',
  operations: 'Operations',
}

export function MapLayers({ imageryVisibility, onToggleImagery }: MapLayersProps) {
  const categories: MapLayerCategory[] = ['imagery', 'environment', 'operations']

  return (
    <aside className="max-h-[min(50vh,24rem)] w-[min(18.5rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-void/90 p-3 shadow-lg backdrop-blur-md">
      <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
        <Layers className="h-3 w-3" aria-hidden="true" />
        Layers
      </p>

      {categories.map((category) => (
        <section key={category} className="mb-3 last:mb-0">
          <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-sand uppercase">
            {CATEGORY_LABEL[category]}
          </h3>
          <ul className="space-y-1">
            {MAP_LAYER_DEFINITIONS.filter((layer) => layer.category === category).map((layer) => {
              const live = layer.availability === 'live'
              const checked = live ? imageryVisibility[layer.id as ImageryLayerId] : false

              return (
                <li key={layer.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 ${
                      live ? 'border-transparent hover:border-line hover:bg-panel/70' : 'cursor-not-allowed border-transparent opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#c24a32]"
                      checked={checked}
                      disabled={!live}
                      onChange={(event) => {
                        if (live) onToggleImagery(layer.id as ImageryLayerId, event.target.checked)
                      }}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-[12px] text-sand">
                        {layer.label}
                        {!live ? (
                          <span className="rounded-full border border-gold/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-gold uppercase">
                            Coming soon
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                        {layer.description}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </aside>
  )
}
