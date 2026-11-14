import type { CSSProperties } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { MapMarker } from '../../types/mission'

interface MarsMapPreviewProps {
  markers: MapMarker[]
}

const MARKER_STYLE: Record<MapMarker['kind'], string> = {
  hazard: 'bg-mars ring-mars/40',
  crew: 'bg-ok ring-ok/40',
  waypoint: 'bg-gold ring-gold/40',
}

const MIN_SCALE = 0.85
const MAX_SCALE = 1.6
const SCALE_STEP = 0.15

/**
 * Visual stand-in for the future CesiumJS globe.
 * Marker x/y values are preview percentages on this staged scene, not geographic coordinates.
 */
function SimulatedMarsScene({
  markers,
  scale,
}: {
  markers: MapMarker[]
  scale: number
}) {
  const sceneStyle: CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
  }

  return (
    <div
      className="absolute inset-0 origin-center will-change-transform"
      style={sceneStyle}
      role="img"
      aria-label="Simulated Mars preview with sample hazard, crew, and waypoint markers. Not a real geographic map."
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 48% 46%, #e08a52 0%, #c24a32 18%, #8a2f22 38%, #4a1c18 62%, #140c0a 86%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 32% 38%, rgba(90, 40, 28, 0.55) 0 4%, transparent 12%), radial-gradient(circle at 61% 30%, rgba(70, 28, 20, 0.5) 0 3%, transparent 10%), radial-gradient(circle at 70% 62%, rgba(120, 58, 36, 0.45) 0 5%, transparent 14%), radial-gradient(circle at 40% 70%, rgba(50, 20, 16, 0.4) 0 6%, transparent 16%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(232,226,214,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(232,226,214,0.16) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute inset-[10%] rounded-full border border-gold/15 shadow-[0_0_80px_rgba(194,74,50,0.28)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-void/55 to-transparent" />

      {markers.map((marker) => (
        <div
          key={marker.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
        >
          <span
            className={`block h-2.5 w-2.5 rounded-full ring-4 ${MARKER_STYLE[marker.kind]}`}
            aria-hidden="true"
          />
          <span className="mt-1 block whitespace-nowrap font-mono text-[10px] text-sand/90">
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MarsMapPreview({ markers }: MarsMapPreviewProps) {
  const [previewScale, setPreviewScale] = useState(1)

  return (
    <section className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-line bg-charcoal sm:min-h-[420px]">
      <header className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.24em] text-gold uppercase">
            Simulated visual preview
          </p>
          <h2 className="text-sm font-semibold tracking-wide text-sand uppercase">
            Mars exploration preview
          </h2>
        </div>
        <p className="max-w-md text-[11px] leading-snug text-muted sm:max-w-[240px] sm:text-right">
          Decorative staging scene only. Marker positions are sample layout coordinates, not a
          geographic map. CesiumJS integration is reserved for a later stage.
        </p>
      </header>

      <div className="relative min-h-[260px] flex-1 overflow-hidden bg-[#140c0a] sm:min-h-[340px]">
        <SimulatedMarsScene markers={markers} scale={previewScale} />

        <div className="absolute top-3 left-3 rounded-lg border border-line bg-void/75 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase">Preview zoom</p>
          <p className="mt-1 font-mono text-[11px] text-sand/80">
            {Math.round(previewScale * 100)}% · scales scene and markers together
          </p>
        </div>

        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-void/80 text-sand"
            onClick={() => setPreviewScale((value) => Math.min(Number((value + SCALE_STEP).toFixed(2)), MAX_SCALE))}
            aria-label="Increase preview zoom"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-void/80 text-sand"
            onClick={() => setPreviewScale((value) => Math.max(Number((value - SCALE_STEP).toFixed(2)), MIN_SCALE))}
            aria-label="Decrease preview zoom"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-void/80 text-sand"
            onClick={() => setPreviewScale(1)}
            aria-label="Reset preview zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <aside
          className="absolute right-3 bottom-3 left-3 rounded-lg border border-line bg-void/80 px-3 py-2 text-[11px] sm:right-auto sm:max-w-[220px]"
          aria-label="Map legend"
        >
          <p className="mb-1 font-mono tracking-widest text-gold uppercase">Legend · sample markers</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sand/90 sm:block sm:space-y-1">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-mars" aria-hidden="true" /> Hazard (example)
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" /> Astronaut / habitat
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden="true" /> Safe waypoint
            </li>
          </ul>
        </aside>
      </div>
    </section>
  )
}
