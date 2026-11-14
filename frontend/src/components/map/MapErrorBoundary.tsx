import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface MapErrorBoundaryProps {
  children: ReactNode
  label?: string
}

interface MapErrorBoundaryState {
  error: Error | null
}

/** Keeps a failed globe (for example no WebGL) from taking down the whole dashboard. */
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mars globe failed to start', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section
        className="flex min-h-[24rem] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-mars/40 bg-panel/80 p-6 text-center"
        role="alert"
      >
        <TriangleAlert className="h-6 w-6 text-ember" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-wide text-sand uppercase">
          {this.props.label ?? 'Mars globe'} could not start
        </h2>
        <p className="max-w-md text-xs leading-relaxed text-muted">
          This 3D visualization needs WebGL. Check that hardware acceleration is enabled and the Cesium
          assets are being served from /cesium, then retry. Details are in the browser console.
        </p>
        <button
          type="button"
          className="rounded-lg border border-line bg-void px-3 py-1.5 text-xs text-sand hover:bg-panel-alt"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </section>
    )
  }
}
