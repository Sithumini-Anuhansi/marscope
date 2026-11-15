import { Fragment, useCallback, useEffect, useMemo } from 'react'
import { Cartesian2, Cartesian3, Color, Ellipsoid, LabelStyle, ScreenSpaceEventType } from 'cesium'
import { Entity, Globe, Scene, ScreenSpaceCameraController, ScreenSpaceEvent, ScreenSpaceEventHandler, Viewer, useCesium } from 'resium'
import type { CelestialBody, EphemerisTrack, EphemerisVector } from '../../services/solarSystemService'

const PLANET_COLORS: Record<string, string> = { sun: '#efb84d', mercury: '#a99d8b', venus: '#e79a5d', earth: '#62a9d8', mars: '#d46144', jupiter: '#d9a576', saturn: '#d8c48b', uranus: '#74cbd0', neptune: '#6282dd' }
const POSITION_SCALE = 1e-6 // One scene unit per million km; distances are preserved, marker sizes are not.
const scaled = (vector: EphemerisVector) => new Cartesian3(vector.x_km * POSITION_SCALE, vector.y_km * POSITION_SCALE, vector.z_km * POSITION_SCALE)

function CameraFrame({ focus, tracks, homeNonce, observerPosition }: { focus: string | null; tracks: EphemerisTrack[]; homeNonce: number; observerPosition?: { x_km: number; y_km: number; z_km: number } | null }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const item = tracks.find((track) => track.target === focus)?.vectors[0]
    const target = focus === 'observer' && observerPosition ? new Cartesian3(observerPosition.x_km * POSITION_SCALE, observerPosition.y_km * POSITION_SCALE, observerPosition.z_km * POSITION_SCALE) : focus === 'sun' || !focus ? Cartesian3.ZERO : item ? scaled(item) : Cartesian3.ZERO
    const magnitude = Cartesian3.magnitude(target)
    const range = focus ? Math.max(60, magnitude * 0.18) : 6100
    const offset = new Cartesian3(range * 0.85, -range, range * 0.62)
    const destination = Cartesian3.add(target, offset, new Cartesian3())
    const direction = Cartesian3.normalize(Cartesian3.subtract(target, destination, new Cartesian3()), new Cartesian3())
    viewer.camera.setView({ destination, orientation: { direction, up: Cartesian3.UNIT_Z } })
  }, [viewer, focus, homeNonce, tracks, observerPosition])
  return null
}

function BodySelection({ onSelect }: { onSelect: (bodyId: string) => void }) {
  const { viewer } = useCesium()
  const select = useCallback((event: { position: Cartesian2 } | { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
    if (!viewer) return
    const picked = viewer.scene.pick('position' in event ? event.position : event.endPosition) as { id?: unknown } | undefined
    const raw = picked?.id
    const id = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: unknown }).id) : ''
    if (id.startsWith('body:')) onSelect(id.slice(5))
  }, [viewer, onSelect])
  return <ScreenSpaceEventHandler><ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={select}/></ScreenSpaceEventHandler>
}

export function SolarSystemViewer({ bodies, tracks, selectedId, onSelect, onReset, homeNonce, observerPosition, extraBodies = [] }: { bodies: CelestialBody[]; tracks: EphemerisTrack[]; selectedId: string | null; onSelect: (id: string) => void; onReset: () => void; homeNonce: number; observerPosition?: { x_km: number; y_km: number; z_km: number } | null; extraBodies?: Array<{ id: string; name: string; x_km: number; y_km: number; z_km: number; color?: string }> }) {
  const byId = useMemo(() => new Map(tracks.map((track) => [track.target, track])), [tracks])
  const demo = tracks.some((track) => track.status === 'demo')
  return <div className="relative min-h-[27rem] overflow-hidden rounded-2xl border border-line bg-[#050607] md:min-h-[42rem]">
    <Viewer full className="mars-cesium-viewer" ellipsoid={Ellipsoid.UNIT_SPHERE} baseLayer={false} animation={false} timeline={false} geocoder={false} homeButton={false} sceneModePicker={false} navigationHelpButton={false} fullscreenButton={false} infoBox={false} selectionIndicator={false} skyAtmosphere={false} scene3DOnly requestRenderMode>
      <Scene backgroundColor={Color.fromCssColorString('#050607')}/><Globe show={false}/>
      <ScreenSpaceCameraController enableRotate enableZoom enableTranslate enableTilt enableLook minimumZoomDistance={8} maximumZoomDistance={20_000}/>
      {bodies.filter((body) => body.id === 'sun' || byId.get(body.id)?.vectors.length).map((body) => {
        const track = byId.get(body.id)
        const vector = body.id === 'sun' ? new Cartesian3(0, 0, 0) : track?.vectors[0] ? scaled(track.vectors[0]) : null
        if (!vector) return null
        const selected = selectedId === body.id
        const color = Color.fromCssColorString(PLANET_COLORS[body.id] ?? '#ded6c6')
        const orbit = track && track.vectors.length > 1 ? track.vectors.map(scaled) : null
        return <Fragment key={body.id}>
          {orbit ? <Entity id={`orbit:${body.id}`} name={`${body.name} Horizons trajectory`} polyline={{ positions: orbit, width: selected ? 2 : 1, material: color.withAlpha(selected ? 0.8 : 0.34) }}/> : null}
          <Entity id={`body:${body.id}`} name={body.name} position={vector} point={{ pixelSize: body.id === 'sun' ? 21 : selected ? 15 : 11, color, outlineColor: Color.WHITE.withAlpha(0.55), outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: body.name.toUpperCase(), font: '12px IBM Plex Mono', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }}/>
        </Fragment>
      })}
      {observerPosition ? <Entity id="observer:current" name="Your supplied spacecraft position" position={new Cartesian3(observerPosition.x_km * POSITION_SCALE, observerPosition.y_km * POSITION_SCALE, observerPosition.z_km * POSITION_SCALE)} point={{ pixelSize: 15, color: Color.fromCssColorString('#66f2ce'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: 'YOUR POSITION · PROVIDED STATE VECTOR', font: '10px IBM Plex Mono', fillColor: Color.fromCssColorString('#66f2ce'), outlineColor: Color.BLACK, outlineWidth: 3, pixelOffset: new Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY }}/> : null}
      {extraBodies.map((body) => <Entity key={`extra:${body.id}`} name={body.name} position={new Cartesian3(body.x_km * POSITION_SCALE, body.y_km * POSITION_SCALE, body.z_km * POSITION_SCALE)} point={{ pixelSize: 8, color: Color.fromCssColorString(body.color ?? '#d6c6a5'), outlineColor: Color.BLACK, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: body.name.toUpperCase(), font: '9px IBM Plex Mono', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, pixelOffset: new Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY }}/>) }
      <BodySelection onSelect={onSelect}/><CameraFrame focus={selectedId} tracks={tracks} homeNonce={homeNonce} observerPosition={observerPosition}/>
    </Viewer>
    <div className="pointer-events-none absolute left-3 top-3 max-w-[90%] rounded-lg border border-line bg-void/85 px-3 py-2 text-[9px] leading-relaxed text-muted md:text-[10px]">{demo ? 'SIMULATED DEMO positions · approximate circular-orbit display model · not JPL ephemerides. Distances are illustrative; body markers are enlarged symbols.' : 'JPL Horizons state vectors · ECLIPTIC plane / ICRF frame · UT · km · orbit curves sampled every 15 days. Distances preserve relative geometry; body markers are enlarged symbols.'}</div>
    <button type="button" onClick={onReset} className="absolute bottom-3 right-3 rounded-lg border border-line bg-void/90 px-3 py-2 text-xs text-sand hover:border-gold/50">Reset camera</button>
    <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-void/90 px-3 py-2 text-[9px]">{bodies.filter((body) => body.id === 'sun' || byId.get(body.id)?.vectors.length).map((body) => <button type="button" key={body.id} onClick={() => onSelect(body.id)} className="hover:text-sand" style={{ color: PLANET_COLORS[body.id] }}>{body.name}</button>)}</div>
  </div>
}
