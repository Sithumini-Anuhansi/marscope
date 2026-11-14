import { MapErrorBoundary } from '../components/map/MapErrorBoundary'
import { MarsGlobe } from '../components/map/MarsGlobe'

export function MarsExplorerPage() {
  return (
    <div className="flex h-[calc(100svh-8.5rem)] min-h-[40rem] flex-col gap-3">
      <div>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">
          Mars Explorer
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Interactive Mars globe</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          A 3D globe on Cesium&apos;s Mars ellipsoid. Surface imagery comes from NASA Mars Trek when
          the tile service is reachable; otherwise a labeled temporary globe is shown. Enable
          Terrain assessment (MOLA) and select a point to query available metrics. Results remain
          unclassified; crew, route, and environmental hazard layers are unavailable.
        </p>
      </div>

      <MapErrorBoundary>
        <MarsGlobe />
      </MapErrorBoundary>
    </div>
  )
}
