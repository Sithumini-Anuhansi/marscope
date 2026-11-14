import { Globe, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GlobeDisplaySettings } from '../../types/map'

interface MapControlsProps {
  settings: GlobeDisplaySettings
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onSettingsChange: (settings: GlobeDisplaySettings) => void
}

export function MapControls({
  settings,
  onZoomIn,
  onZoomOut,
  onResetView,
  onSettingsChange,
}: MapControlsProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-void/85 shadow-lg backdrop-blur-md">
        <ControlButton label="Zoom in" onClick={onZoomIn}>
          <Plus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={onZoomOut}>
          <Minus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Reset globe view" onClick={onResetView}>
          <RotateCcw className="h-3.5 w-3.5" />
        </ControlButton>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-void/85 shadow-lg backdrop-blur-md">
        <ToggleButton
          pressed={settings.showGlobe}
          label={settings.showGlobe ? 'Hide globe surface' : 'Show globe surface'}
          onClick={() => onSettingsChange({ ...settings, showGlobe: !settings.showGlobe })}
        >
          <Globe className="h-4 w-4" />
        </ToggleButton>
        <ToggleButton
          pressed={settings.showStarfield}
          label={settings.showStarfield ? 'Hide decorative starfield' : 'Show decorative starfield'}
          onClick={() => onSettingsChange({ ...settings, showStarfield: !settings.showStarfield })}
        >
          <Sparkles className="h-4 w-4" />
        </ToggleButton>
      </div>
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center border-b border-line text-sand last:border-b-0 hover:bg-panel-alt"
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function ToggleButton({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`flex h-9 w-9 items-center justify-center border-b border-line last:border-b-0 hover:bg-panel-alt ${
        pressed ? 'text-gold' : 'text-muted'
      }`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
    >
      {children}
    </button>
  )
}
