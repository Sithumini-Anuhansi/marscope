import { LoaderCircle } from 'lucide-react'

interface LoadingPanelProps {
  label?: string
}

export function LoadingPanel({ label = 'Loading module…' }: LoadingPanelProps) {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-line bg-panel/80"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 font-mono text-xs text-sand">
        <LoaderCircle className="h-4 w-4 animate-spin text-gold" aria-hidden="true" />
        {label}
      </p>
    </div>
  )
}
