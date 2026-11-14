import { Compass } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { CameraStatus, ImageryRuntimeStatus, PointerCoordinates } from '../../types/map'
import { formatAltitudeKm, formatLatitude, formatLongitude } from '../../utils/marsCoordinates'

/** Imperative handle so high-frequency map events update only this panel, not the whole globe. */
export interface CoordinateReadoutHandle {
  setPointer: (pointer: PointerCoordinates | null) => void
  setCamera: (camera: CameraStatus) => void
}

interface CoordinateDisplayProps {
  imageryStatus: ImageryRuntimeStatus
  usingMarsEllipsoid: boolean
  ref?: Ref<CoordinateReadoutHandle>
}

interface Readout {
  pointer: PointerCoordinates | null
  camera: CameraStatus | null
}

export function CoordinateDisplay({ imageryStatus, usingMarsEllipsoid, ref }: CoordinateDisplayProps) {
  const [readout, setReadout] = useState<Readout>({ pointer: null, camera: null })
  const latest = useRef<Readout>(readout)
  const frame = useRef<number | null>(null)

  // At most one React update per animation frame, however fast events arrive.
  const schedule = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      setReadout({ ...latest.current })
    })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      setPointer(pointer) {
        latest.current = { ...latest.current, pointer }
        schedule()
      },
      setCamera(camera) {
        latest.current = { ...latest.current, camera }
        schedule()
      },
    }),
    [schedule],
  )

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const { pointer, camera } = readout

  return (
    <div className="rounded-xl border border-line bg-void/85 px-3 py-2.5 shadow-lg backdrop-blur-md">
      <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
        <Compass className="h-3 w-3" aria-hidden="true" />
        Coordinates
      </p>
      <dl
        className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-sand"
        aria-live="off"
      >
        <dt className="text-muted">Lat</dt>
        <dd>{pointer ? formatLatitude(pointer.latitudeDeg) : 'Hover or tap the globe'}</dd>
        <dt className="text-muted">Lon</dt>
        <dd>{pointer ? formatLongitude(pointer.longitudeDeg) : '—'}</dd>
        <dt className="text-muted">Cam</dt>
        <dd>{camera ? formatAltitudeKm(camera.altitudeMeters, 0) : '—'}</dd>
      </dl>
      <p className="mt-2 max-w-[17rem] text-[10px] leading-snug text-muted">
        Geodetic lat / east-positive lon in degrees on Cesium Ellipsoid.MARS.
        {usingMarsEllipsoid ? ' Mars ellipsoid active.' : ' Ellipsoid mismatch.'} Cam is camera
        height above the ellipsoid (no terrain). Imagery: {statusLabel(imageryStatus)}
      </p>
    </div>
  )
}

function statusLabel(status: ImageryRuntimeStatus): string {
  if (status === 'ready') return 'tiles loaded'
  if (status === 'loading') return 'loading tiles'
  if (status === 'degraded') return 'some tiles failed'
  if (status === 'error') return 'setup failed, ellipsoid only'
  return 'off, ellipsoid only'
}
