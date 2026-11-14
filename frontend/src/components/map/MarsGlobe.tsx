import {
  Cartesian2,
  Cartographic,
  Color,
  Ellipsoid,
  GeographicProjection,
  ScreenSpaceEventType,
  SkyBox,
  defined,
  type ImageryProvider,
  type Viewer as CesiumViewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Info, Layers, LoaderCircle, type LucideIcon } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  CameraFlyTo,
  Globe,
  ImageryLayer,
  Scene,
  ScreenSpaceCameraController,
  ScreenSpaceEvent,
  ScreenSpaceEventHandler,
  Viewer,
  useCesium,
} from 'resium'
import {
  IMAGERY_LAYER_IDS,
  IMAGERY_SOURCES,
  createDefaultLayerVisibility,
  createImageryProvider,
} from '../../services/marsImageryService'
import type {
  GlobeDisplaySettings,
  ImageryLayerId,
  ImageryRuntimeStatus,
  PointerCoordinates,
} from '../../types/map'
import {
  MARS_ELLIPSOID,
  MARS_EQUATORIAL_RADIUS_METERS,
  cartographicToLonLat,
  installMarsEllipsoid,
  marsHomeDestination,
} from '../../utils/marsCoordinates'
import { CoordinateDisplay, type CoordinateReadoutHandle } from './CoordinateDisplay'
import { MapControls } from './MapControls'
import { MapLayers } from './MapLayers'
import { MapLegend } from './MapLegend'

// Must run before any Cesium scene objects are created.
installMarsEllipsoid()

const MARS_PROJECTION = new GeographicProjection(MARS_ELLIPSOID)
const MARS_BASE_COLOR = Color.fromCssColorString('#6b2d22')
const SPACE_COLOR = Color.fromCssColorString('#070605')
const HOME_DESTINATION = marsHomeDestination()

// Close enough to reach the finest levels of the integrated imagery (CTX goes to level 11).
const MIN_ZOOM_METERS = 2_000
const MAX_ZOOM_METERS = 48_000_000
const ZOOM_FRACTION = 0.3

const DEFAULT_SETTINGS: GlobeDisplaySettings = {
  showGlobe: true,
  showStarfield: true,
}

type PointerEventLike = { position: Cartesian2 } | { endPosition: Cartesian2 }

/** SkyBox.show exists at runtime in Cesium 1.140 but is missing from its type definitions. */
function setSkyBoxVisible(skyBox: SkyBox, show: boolean): void {
  ;(skyBox as SkyBox & { show: boolean }).show = show
}

function isLargeScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

/** Providers are created once per mounted globe; a failure degrades to the plain ellipsoid. */
function useImageryProviders() {
  return useMemo(() => {
    const providers: Partial<Record<ImageryLayerId, ImageryProvider>> = {}
    let failed = false
    for (const id of IMAGERY_LAYER_IDS) {
      try {
        providers[id] = createImageryProvider(id)
      } catch (error) {
        failed = true
        console.error(`Could not create imagery provider "${id}"`, error)
      }
    }
    return { providers, failed }
  }, [])
}

export function MarsGlobe() {
  const [settings, setSettings] = useState<GlobeDisplaySettings>(DEFAULT_SETTINGS)
  const [imageryVisibility, setImageryVisibility] = useState(createDefaultLayerVisibility)
  const [tilesPending, setTilesPending] = useState(true)
  const [tileErrors, setTileErrors] = useState(false)
  const [homeNonce, setHomeNonce] = useState(0)
  const [layersOpen, setLayersOpen] = useState(isLargeScreen)
  const [legendOpen, setLegendOpen] = useState(isLargeScreen)
  const [viewer, setViewer] = useState<CesiumViewer | null>(null)
  const readout = useRef<CoordinateReadoutHandle>(null)
  const { providers, failed } = useImageryProviders()

  const anyImageryOn = IMAGERY_LAYER_IDS.some((id) => imageryVisibility[id])

  const imageryStatus: ImageryRuntimeStatus = failed
    ? 'error'
    : !anyImageryOn
      ? 'ellipsoid-only'
      : tileErrors
        ? 'degraded'
        : tilesPending
          ? 'loading'
          : 'ready'

  // Any failed tile request marks the imagery as degraded (reset when layers change).
  useEffect(() => {
    const removers = IMAGERY_LAYER_IDS.flatMap((id) => {
      const provider = providers[id]
      return provider ? [provider.errorEvent.addEventListener(() => setTileErrors(true))] : []
    })
    return () => removers.forEach((remove) => remove())
  }, [providers])

  const handleViewerReady = useCallback((next: CesiumViewer) => {
    // Cesium only creates the default star sky box for Earth, so add one for Mars.
    // It is a decorative backdrop, not a Mars-accurate sky.
    if (!next.scene.skyBox) next.scene.skyBox = SkyBox.createEarthSkyBox()
    // The built-in sun is positioned from Earth time, so it would be misleading on Mars.
    if (next.scene.sun) next.scene.sun.show = false
    next.scene.sunBloom = false
    next.camera.percentageChanged = 0.01
    setViewer(next)
  }, [])

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !viewer.scene.skyBox) return
    setSkyBoxVisible(viewer.scene.skyBox, settings.showStarfield)
    viewer.scene.requestRender()
  }, [viewer, settings.showStarfield])

  const handleZoom = useCallback(
    (direction: 1 | -1) => {
      if (!viewer || viewer.isDestroyed()) return
      const height = viewer.camera.positionCartographic.height
      if (direction > 0) {
        const room = height - MIN_ZOOM_METERS
        if (room <= 0) return
        viewer.camera.zoomIn(Math.min(height * ZOOM_FRACTION, room))
      } else {
        const room = MAX_ZOOM_METERS - height
        if (room <= 0) return
        viewer.camera.zoomOut(Math.min(height * ZOOM_FRACTION, room))
      }
      viewer.scene.requestRender()
    },
    [viewer],
  )

  const handleResetView = useCallback(() => setHomeNonce((value) => value + 1), [])

  const handleToggleImagery = useCallback((id: ImageryLayerId, visible: boolean) => {
    setImageryVisibility((current) => ({ ...current, [id]: visible }))
    setTileErrors(false)
  }, [])

  const handleTileProgress = useCallback((queued: number) => setTilesPending(queued > 0), [])

  const handlePointer = useCallback(
    (event: PointerEventLike) => {
      const target = 'endPosition' in event ? event.endPosition : event.position
      readout.current?.setPointer(pickMars(viewer, target))
    },
    [viewer],
  )

  const usingMarsEllipsoid = viewer
    ? viewer.scene.ellipsoid.equals(Ellipsoid.MARS)
    : Ellipsoid.default.equals(Ellipsoid.MARS)

  const credits = useMemo(
    () => IMAGERY_LAYER_IDS.filter((id) => imageryVisibility[id]).map((id) => IMAGERY_SOURCES[id].credit),
    [imageryVisibility],
  )

  const statusMessage = STATUS_MESSAGES[imageryStatus]

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-[#070605]">
      <div
        className="relative min-h-[26rem] flex-1"
        onPointerLeave={() => readout.current?.setPointer(null)}
      >
        <Viewer
          full
          className="mars-cesium-viewer"
          ellipsoid={MARS_ELLIPSOID}
          mapProjection={MARS_PROJECTION}
          baseLayer={false}
          baseLayerPicker={false}
          geocoder={false}
          homeButton={false}
          sceneModePicker={false}
          navigationHelpButton={false}
          animation={false}
          timeline={false}
          fullscreenButton={false}
          vrButton={false}
          infoBox={false}
          selectionIndicator={false}
          scene3DOnly
          skyAtmosphere={false}
          requestRenderMode
          shouldAnimate={false}
        >
          <Scene backgroundColor={SPACE_COLOR} />
          <Globe
            show={settings.showGlobe}
            showGroundAtmosphere={false}
            showWaterEffect={false}
            baseColor={MARS_BASE_COLOR}
            onTileLoadProgress={handleTileProgress}
          />
          <ScreenSpaceCameraController
            enableRotate
            enableZoom
            enableTranslate
            enableTilt
            enableLook
            inertiaSpin={0.9}
            inertiaZoom={0.8}
            inertiaTranslate={0.8}
            minimumZoomDistance={MIN_ZOOM_METERS}
            maximumZoomDistance={MAX_ZOOM_METERS}
          />
          {IMAGERY_LAYER_IDS.map((id) => {
            const provider = providers[id]
            return provider ? (
              <ImageryLayer key={id} imageryProvider={provider} show={imageryVisibility[id]} />
            ) : null
          })}
          <CameraFlyTo
            key={homeNonce}
            destination={HOME_DESTINATION}
            duration={homeNonce === 0 ? 0 : 1.15}
            once
          />
          <ScreenSpaceEventHandler useDefault>
            <ScreenSpaceEvent type={ScreenSpaceEventType.MOUSE_MOVE} action={handlePointer} />
            <ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={handlePointer} />
          </ScreenSpaceEventHandler>
          <ViewerBridge onReady={handleViewerReady} readout={readout} />
        </Viewer>

        {imageryStatus === 'loading' ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-void/35">
            <p
              className="flex items-center gap-2 rounded-full border border-line bg-void/85 px-4 py-2 font-mono text-xs text-sand"
              role="status"
            >
              <LoaderCircle className="h-4 w-4 animate-spin text-gold" aria-hidden="true" />
              Loading Mars imagery…
            </p>
          </div>
        ) : null}

        {/* Bottom padding leaves room for Cesium's own credit strip. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between gap-3 p-3 pb-9 md:p-4 md:pb-9">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto min-w-0">
              {layersOpen ? (
                <MapLayers imageryVisibility={imageryVisibility} onToggleImagery={handleToggleImagery} />
              ) : null}
            </div>
            <div className="pointer-events-auto ml-auto flex shrink-0 flex-col items-end gap-2">
              <MapControls
                settings={settings}
                onZoomIn={() => handleZoom(1)}
                onZoomOut={() => handleZoom(-1)}
                onResetView={handleResetView}
                onSettingsChange={setSettings}
              />
              <PanelToggle
                icon={Layers}
                label="Layers"
                open={layersOpen}
                onToggle={() => setLayersOpen((open) => !open)}
              />
              <PanelToggle
                icon={Info}
                label="Legend"
                open={legendOpen}
                onToggle={() => setLegendOpen((open) => !open)}
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-end">
            <div className="pointer-events-auto">
              <CoordinateDisplay
                ref={readout}
                imageryStatus={imageryStatus}
                usingMarsEllipsoid={usingMarsEllipsoid}
              />
            </div>
            {legendOpen ? (
              <div className="pointer-events-auto sm:max-w-[16rem]">
                <MapLegend />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="border-t border-line bg-void px-3 py-2 text-[10px] leading-snug text-muted">
        {statusMessage ? (
          <p className="mb-1 text-gold" role="status">
            {statusMessage}
          </p>
        ) : null}
        <p>
          Globe: Cesium Ellipsoid.MARS (equatorial radius{' '}
          {(MARS_EQUATORIAL_RADIUS_METERS / 1000).toFixed(0)} km). Drag to rotate · scroll to zoom ·
          right-drag to tilt. Imagery: {credits.length > 0 ? credits.join(' · ') : 'none enabled'}.
        </p>
      </footer>
    </section>
  )
}

const STATUS_MESSAGES: Record<ImageryRuntimeStatus, string | null> = {
  loading: null,
  ready: null,
  degraded:
    'Some imagery tiles failed to load (network, CORS, or a tile-scheme mismatch). Available tiles are shown over a temporary Mars ellipsoid.',
  error:
    'Imagery could not be set up. Showing a temporary Mars ellipsoid globe, not a scientific mosaic.',
  'ellipsoid-only': 'All imagery layers are off. The visible body is the Cesium Mars ellipsoid only.',
}

function PanelToggle({
  icon: Icon,
  label,
  open,
  onToggle,
}: {
  icon: LucideIcon
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`flex h-9 items-center gap-2 rounded-xl border border-line bg-void/85 px-3 text-[11px] shadow-lg backdrop-blur-md hover:bg-panel-alt ${
        open ? 'text-gold' : 'text-sand'
      }`}
      onClick={onToggle}
      aria-pressed={open}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

const ViewerBridge = memo(function ViewerBridge({
  onReady,
  readout,
}: {
  onReady: (viewer: CesiumViewer) => void
  readout: RefObject<CoordinateReadoutHandle | null>
}) {
  const { viewer } = useCesium()

  useEffect(() => {
    if (!viewer) return
    onReady(viewer)

    const publishCamera = () => {
      if (viewer.isDestroyed()) return
      readout.current?.setCamera({
        altitudeMeters: Math.max(0, viewer.camera.positionCartographic.height),
      })
    }
    publishCamera()
    const removeCamera = viewer.camera.changed.addEventListener(publishCamera)

    // requestRenderMode does not redraw on container size changes by itself.
    const observer = new ResizeObserver(() => {
      if (viewer.isDestroyed()) return
      viewer.resize()
      viewer.scene.requestRender()
    })
    observer.observe(viewer.container)

    return () => {
      observer.disconnect()
      removeCamera()
    }
  }, [viewer, onReady, readout])

  return null
})

function pickMars(
  viewer: CesiumViewer | null,
  windowPosition: Cartesian2 | undefined,
): PointerCoordinates | null {
  if (!viewer || viewer.isDestroyed() || !windowPosition) return null
  const cartesian = viewer.camera.pickEllipsoid(windowPosition, MARS_ELLIPSOID)
  if (!defined(cartesian)) return null
  const cartographic = Cartographic.fromCartesian(cartesian, MARS_ELLIPSOID)
  if (!defined(cartographic)) return null
  return {
    ...cartographicToLonLat(cartographic),
    heightMeters: cartographic.height,
  }
}
