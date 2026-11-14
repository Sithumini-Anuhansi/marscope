import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ellipsoid,
  GeographicProjection,
  LabelStyle,
  ScreenSpaceEventType,
  SkyBox,
  defined,
  type ImageryProvider,
  type Viewer as CesiumViewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Info, Layers, LoaderCircle, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  CameraFlyTo,
  Globe,
  ImageryLayer,
  Entity,
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
import type { HazardLocationResponse } from '../../types/hazard'
import { getHazardAssessmentAtLocation } from '../../services/hazardService'
import { submitAIRiskSynthesis } from '../../services/aiService'
import type { AIRiskSynthesisResponse } from '../../types/ai'
import {
  MARS_ELLIPSOID,
  MARS_EQUATORIAL_RADIUS_METERS,
  cartographicToLonLat,
  geodeticToPlanetocentricLatitude,
  installMarsEllipsoid,
  marsHomeDestination,
  planetocentricToGeodeticLatitude,
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
  const [tileErrorLayers, setTileErrorLayers] = useState<Set<ImageryLayerId>>(() => new Set())
  const [homeNonce, setHomeNonce] = useState(0)
  const [layersOpen, setLayersOpen] = useState(isLargeScreen)
  const [legendOpen, setLegendOpen] = useState(isLargeScreen)
  const [viewer, setViewer] = useState<CesiumViewer | null>(null)
  const [hazardAssessmentEnabled, setHazardAssessmentEnabled] = useState(false)
  const [assessment, setAssessment] = useState<HazardLocationResponse | null>(null)
  const [assessmentLoading, setAssessmentLoading] = useState(false)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)
  const [riskSynthesis, setRiskSynthesis] = useState<AIRiskSynthesisResponse | null>(null)
  const [riskSynthesisLoading, setRiskSynthesisLoading] = useState(false)
  const [riskSynthesisError, setRiskSynthesisError] = useState<string | null>(null)
  const [assessedCell, setAssessedCell] = useState<{ longitudeDeg: number; latitudeDeg: number } | null>(null)
  const assessmentRequest = useRef(0)
  const readout = useRef<CoordinateReadoutHandle>(null)
  const { providers, failed } = useImageryProviders()

  const anyImageryOn = IMAGERY_LAYER_IDS.some((id) => imageryVisibility[id])

  const imageryStatus: ImageryRuntimeStatus = failed
    ? 'error'
    : !anyImageryOn
      ? 'ellipsoid-only'
      : tileErrorLayers.size > 0
        ? 'degraded'
        : tilesPending
          ? 'loading'
          : 'ready'

  // Any failed tile request marks the imagery as degraded (reset when layers change).
  useEffect(() => {
    const removers = IMAGERY_LAYER_IDS.flatMap((id) => {
      const provider = providers[id]
      return provider ? [provider.errorEvent.addEventListener(() => {
        setTileErrorLayers((current) => new Set(current).add(id))
      })] : []
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
    setTileErrorLayers((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const handleTileProgress = useCallback((queued: number) => setTilesPending(queued > 0), [])

  const handlePointer = useCallback(
    (event: PointerEventLike) => {
      const target = 'endPosition' in event ? event.endPosition : event.position
      readout.current?.setPointer(pickMars(viewer, target))
    },
    [viewer],
  )

  const handleToggleHazardAssessment = useCallback((visible: boolean) => {
    assessmentRequest.current += 1
    setHazardAssessmentEnabled(visible)
    setAssessment(null)
    setAssessmentError(null)
    setRiskSynthesis(null)
    setRiskSynthesisError(null)
    setRiskSynthesisLoading(false)
    setAssessmentLoading(false)
    setAssessedCell(null)
  }, [])

  const handleMapClick = useCallback(
    (event: PointerEventLike) => {
      handlePointer(event)
      if (!('position' in event)) return
      if (!hazardAssessmentEnabled) return
      const clicked = pickMars(viewer, event.position)
      if (!clicked) {
        setAssessmentError('Select a point on the visible Mars surface.')
        setAssessment(null)
        setAssessedCell(null)
        return
      }

      const requestId = ++assessmentRequest.current
      const planetocentricLatitude = geodeticToPlanetocentricLatitude(clicked.latitudeDeg)
      setAssessmentLoading(true)
      setAssessmentError(null)
      setAssessment(null)
      setRiskSynthesis(null)
      setRiskSynthesisError(null)
      setRiskSynthesisLoading(true)
      setAssessedCell(null)

      void submitAIRiskSynthesis({ latitude_deg: planetocentricLatitude, longitude_deg: clicked.longitudeDeg })
        .then((result) => {
          if (requestId === assessmentRequest.current) setRiskSynthesis(result)
        })
        .catch((error: unknown) => {
          if (requestId === assessmentRequest.current) setRiskSynthesisError(error instanceof Error ? error.message : 'AI risk synthesis request failed.')
        })
        .finally(() => {
          if (requestId === assessmentRequest.current) setRiskSynthesisLoading(false)
        })

      void getHazardAssessmentAtLocation(planetocentricLatitude, clicked.longitudeDeg)
        .then((result) => {
          if (requestId !== assessmentRequest.current) return
          setAssessment(result)
          if (result.sampled_cell) {
            setAssessedCell({
              longitudeDeg: result.sampled_cell.longitude_deg,
              latitudeDeg: planetocentricToGeodeticLatitude(result.sampled_cell.latitude_deg),
            })
          }
        })
        .catch((error: unknown) => {
          if (requestId !== assessmentRequest.current) return
          setAssessmentError(error instanceof Error ? error.message : 'Terrain assessment request failed.')
        })
        .finally(() => {
          if (requestId === assessmentRequest.current) setAssessmentLoading(false)
        })
    },
    [handlePointer, hazardAssessmentEnabled, viewer],
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
          {assessedCell ? (
            <Entity
              name="Terrain assessment query cell"
              position={Cartesian3.fromDegrees(assessedCell.longitudeDeg, assessedCell.latitudeDeg, 0, MARS_ELLIPSOID)}
              point={{
                pixelSize: 13,
                color: Color.fromCssColorString('#c9a24a'),
                outlineColor: Color.fromCssColorString('#070605'),
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
              label={{
                text: 'QUERY CELL · NOT A HAZARD',
                font: '10px IBM Plex Mono',
                fillColor: Color.fromCssColorString('#e8e2d6'),
                outlineColor: Color.fromCssColorString('#070605'),
                outlineWidth: 3,
                style: LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cartesian2(0, -22),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
            />
          ) : null}
          <CameraFlyTo
            key={homeNonce}
            destination={HOME_DESTINATION}
            duration={homeNonce === 0 ? 0 : 1.15}
            once
          />
          <ScreenSpaceEventHandler useDefault>
            <ScreenSpaceEvent type={ScreenSpaceEventType.MOUSE_MOVE} action={handlePointer} />
            <ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={handleMapClick} />
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
                <MapLayers
                  imageryVisibility={imageryVisibility}
                  imageryErrorLayers={tileErrorLayers}
                  onToggleImagery={handleToggleImagery}
                  hazardAssessmentEnabled={hazardAssessmentEnabled}
                  onToggleHazardAssessment={handleToggleHazardAssessment}
                />
              ) : null}
              {hazardAssessmentEnabled ? (
                <div className="mt-2 pointer-events-auto">
                  <TerrainAssessmentPanel
                    assessment={assessment}
                    loading={assessmentLoading}
                    error={assessmentError}
                    riskSynthesis={riskSynthesis}
                    riskSynthesisLoading={riskSynthesisLoading}
                    riskSynthesisError={riskSynthesisError}
                  />
                </div>
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

function TerrainAssessmentPanel({
  assessment,
  loading,
  error,
  riskSynthesis,
  riskSynthesisLoading,
  riskSynthesisError,
}: {
  assessment: HazardLocationResponse | null
  loading: boolean
  error: string | null
  riskSynthesis: AIRiskSynthesisResponse | null
  riskSynthesisLoading: boolean
  riskSynthesisError: string | null
}) {
  const title: Record<string, string> = {
    terrain_slope: 'Slope',
    surface_roughness: 'Surface roughness',
    elevation_variation: 'Local elevation variation',
    crater_depression: 'Crater / depression',
    temperature: 'Temperature',
    wind: 'Wind',
    dust: 'Dust',
    radiation: 'Radiation',
  }
  const source = assessment?.assessments.find((item) => item.source_dataset)?.source_dataset

  return (
    <aside
      className="max-h-[min(42vh,22rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-void/95 p-3 shadow-xl backdrop-blur-md"
      aria-label="Terrain assessment"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">MOLA · point query</p>
          <h3 className="mt-1 text-xs font-semibold text-sand">Terrain assessment</h3>
        </div>
        <span className="rounded-full border border-gold/30 px-2 py-1 font-mono text-[9px] text-gold uppercase">
          {loading ? 'Loading' : assessment?.assessment_status ?? (error ? 'Unavailable' : 'Ready')}
        </span>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted">
        Click the globe to query a cell. The gold marker identifies the queried cell, not a hazard.
      </p>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-sand" role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-gold" aria-hidden="true" />
          Requesting terrain metrics…
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[11px] text-mars">{error}. Confirm the API is running.</p> : null}
      {!assessment && !loading && !error ? (
        <p className="mt-3 rounded-lg border border-line bg-panel/70 p-2 text-[11px] text-sand/80">
          Waiting for a Mars surface selection.
        </p>
      ) : null}

      {assessment ? (
        <>
          <ul className="mt-3 divide-y divide-line">
            {assessment.assessments.map((item) => (
              <li key={item.assessment_id ?? item.category} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-sand">{title[item.category] ?? item.category}</span>
                  <span className="font-mono text-[10px] text-gold">
                    {item.measurement
                      ? `${item.measurement.value.toFixed(2)} ${item.measurement.units}`
                      : 'Unavailable'}
                  </span>
                </div>
                <p className="mt-1 text-[9px] leading-snug text-muted">
                  {item.observation_kind === 'derived'
                    ? `Derived metric · ${item.severity}`
                    : item.classification?.classification_status ?? 'Data unavailable'}
                </p>
              </li>
            ))}
          </ul>
          {source ? (
            <p className="mt-3 border-t border-line pt-2 text-[9px] leading-snug text-muted">
              {source.product_id} · {source.resolution_km_per_cell} km/cell · source period{' '}
              {source.source_period_utc.map((date) => date.slice(0, 10)).join(' – ')}.
            </p>
          ) : null}
          <p className="mt-2 text-[10px] leading-snug text-muted">{assessment.message}</p>
          {assessment.sampled_cell ? (
            <Link
              className="mt-3 inline-flex items-center rounded-lg border border-gold/35 bg-gold/10 px-2.5 py-2 text-[10px] font-medium text-gold hover:bg-gold/15"
              to={`/risk?latitude_deg=${assessment.sampled_cell.latitude_deg}&longitude_deg=${assessment.sampled_cell.longitude_deg}`}
            >
              Open risk assessment for this cell
            </Link>
          ) : null}
        </>
      ) : null}
      <section className="mt-3 border-t border-line pt-3" aria-live="polite" aria-busy={riskSynthesisLoading}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-semibold text-sand">AI risk synthesis</h4>
          <span className="rounded-full border border-warn/35 px-2 py-0.5 font-mono text-[8px] text-warn uppercase">
            {riskSynthesisLoading ? 'Loading' : riskSynthesis?.assessment_status ?? 'Not assessed'}
          </span>
        </div>
        {riskSynthesisLoading ? <p className="mt-2 text-[10px] text-muted">Combining available science indicators…</p> : null}
        {riskSynthesisError ? <p className="mt-2 text-[10px] text-mars" role="alert">{riskSynthesisError}</p> : null}
        {riskSynthesis ? (
          <>
            <p className="mt-2 text-xs font-medium text-sand">{riskSynthesis.overall_assessment}</p>
            <p className="mt-1 text-[9px] leading-snug text-muted">{riskSynthesis.explanation}</p>
            {riskSynthesis.missing_information.length ? (
              <p className="mt-2 text-[9px] leading-snug text-muted">Missing: {riskSynthesis.missing_information.slice(0, 2).join('; ')}</p>
            ) : null}
          </>
        ) : null}
      </section>
    </aside>
  )
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
