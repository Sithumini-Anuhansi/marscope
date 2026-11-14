import { Fragment, useCallback, useEffect, useMemo } from 'react'
import { Cartesian2, Cartesian3, Color, Ellipsoid, LabelStyle, PolylineArrowMaterialProperty, ScreenSpaceEventType } from 'cesium'
import { Entity, Globe, Scene, ScreenSpaceCameraController, ScreenSpaceEvent, ScreenSpaceEventHandler, Viewer, useCesium } from 'resium'
import type { EphemerisTrack, EphemerisVector } from '../../services/solarSystemService'

const MOON_COLORS: Record<string, string> = { phobos: '#e8ba72', deimos: '#78c8d1' }
const SCALE = 1 / 500 // 500 km per scene unit; orbit size and body symbols are not to scale.
const toPosition = (vector: EphemerisVector) => new Cartesian3(vector.x_km * SCALE, vector.y_km * SCALE, vector.z_km * SCALE)
function nearestVector(vectors: EphemerisVector[], epoch: string): EphemerisVector | undefined {
  if (!vectors.length) return undefined
  const targetTime = Date.parse(epoch)
  return vectors.reduce((closest, item) => Math.abs(Date.parse(item.epoch) - targetTime) < Math.abs(Date.parse(closest.epoch) - targetTime) ? item : closest)
}

function MarsCamera({ focus, tracks, epoch, resetNonce }: { focus: string; tracks: EphemerisTrack[]; epoch: string; resetNonce: number }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const marker = tracks.find((track) => track.target === focus)
    const current = marker ? nearestVector(marker.vectors, epoch) : undefined
    const center = focus === 'phobos' && current || focus === 'deimos' && current ? toPosition(current) : Cartesian3.ZERO
    const range = focus === 'phobos' ? 14 : focus === 'deimos' ? 24 : 58
    const offset = new Cartesian3(range * 0.75, -range, range * 0.65)
    const destination = Cartesian3.add(center, offset, new Cartesian3())
    const direction = Cartesian3.normalize(Cartesian3.subtract(center, destination, new Cartesian3()), new Cartesian3())
    viewer.camera.setView({ destination, orientation: { direction, up: Cartesian3.UNIT_Z } })
  }, [viewer, focus, tracks, epoch, resetNonce])
  return null
}

function MoonSelection({ onSelect }: { onSelect: (bodyId: string) => void }) {
  const { viewer } = useCesium()
  const select = useCallback((event: { position: Cartesian2 } | { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
    if (!viewer) return
    const picked = viewer.scene.pick('position' in event ? event.position : event.endPosition) as { id?: unknown } | undefined
    const raw = picked?.id
    const id = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: unknown }).id) : ''
    if (id === 'body:phobos' || id === 'body:deimos') onSelect(id.slice(5))
  }, [viewer, onSelect])
  return <ScreenSpaceEventHandler><ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={select}/></ScreenSpaceEventHandler>
}

export function MarsSystemViewer({ tracks, epoch, selectedId, onSelect, resetNonce, onReset }: { tracks: EphemerisTrack[]; epoch: string; selectedId: string; onSelect: (id: string) => void; resetNonce: number; onReset: () => void }) {
  const moonTracks = useMemo(() => tracks.filter((track) => track.target === 'phobos' || track.target === 'deimos'), [tracks])
  const contextTracks = tracks.filter((track) => track.target === 'sun' || track.target === 'earth')
  return <div className="relative min-h-[25rem] overflow-hidden rounded-2xl border border-line bg-[#050607] md:min-h-[38rem]">
    <Viewer full className="mars-cesium-viewer" ellipsoid={Ellipsoid.UNIT_SPHERE} baseLayer={false} animation={false} timeline={false} geocoder={false} homeButton={false} sceneModePicker={false} navigationHelpButton={false} fullscreenButton={false} infoBox={false} selectionIndicator={false} skyAtmosphere={false} scene3DOnly requestRenderMode>
      <Scene backgroundColor={Color.fromCssColorString('#050607')}/><Globe show={false}/>
      <ScreenSpaceCameraController enableRotate enableZoom enableTranslate enableTilt enableLook minimumZoomDistance={2} maximumZoomDistance={1_000}/>
      <Entity id="body:mars" name="Mars center · origin of this frame" position={Cartesian3.ZERO} point={{ pixelSize: 21, color: Color.fromCssColorString('#d46144'), outlineColor: Color.WHITE.withAlpha(0.6), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: 'MARS · FRAME ORIGIN', font: '11px IBM Plex Mono', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY }}/>
      {moonTracks.map((track) => {
        const vectors = track.vectors
        const current = nearestVector(vectors, epoch)
        const currentIndex = current ? vectors.indexOf(current) : -1
        const nextVector = currentIndex >= 0 ? vectors[(currentIndex + 1) % vectors.length] : undefined
        const color = Color.fromCssColorString(MOON_COLORS[track.target])
        return <Fragment key={track.target}>
          {vectors.length > 1 ? <Entity id={`orbit:${track.target}`} name={`${track.target} ephemeris orbit track`} polyline={{ positions: vectors.map(toPosition), width: selectedId === track.target ? 4 : 2, material: color.withAlpha(0.7) }}/> : null}
          {current && nextVector ? <Entity id={`direction:${track.target}`} name={`${track.target} chronological orbital direction from Horizons samples`} polyline={{ positions: [toPosition(current), toPosition(nextVector)], width: 4, material: new PolylineArrowMaterialProperty(color) }}/> : null}
          {current ? <Entity id={`body:${track.target}`} name={`${track.target} · ${track.status}`} position={toPosition(current)} point={{ pixelSize: selectedId === track.target ? 16 : 13, color, outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: track.target.toUpperCase(), font: '11px IBM Plex Mono', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }}/> : null}
        </Fragment>
      })}
      <MoonSelection onSelect={onSelect}/><MarsCamera focus={selectedId} tracks={moonTracks} epoch={epoch} resetNonce={resetNonce}/>
    </Viewer>
    <div className="pointer-events-none absolute left-3 top-3 max-w-[90%] rounded-lg border border-line bg-void/85 px-3 py-2 text-[9px] leading-relaxed text-muted md:text-[10px]">Mars-centered state vectors · ECLIPTIC / ICRF · UT · km · orbital paths sampled every 2 hours across 48 hours. Moon symbols enlarged; displayed distances scaled 500 km per scene unit.</div>
    <button type="button" onClick={onReset} className="absolute bottom-3 right-3 rounded-lg border border-line bg-void/90 px-3 py-2 text-xs text-sand hover:border-gold/50">Reset camera</button>
    <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-line bg-void/90 px-3 py-2 text-[10px]"><button onClick={() => onSelect('phobos')} style={{ color: MOON_COLORS.phobos }}>Phobos</button><button onClick={() => onSelect('deimos')} style={{ color: MOON_COLORS.deimos }}>Deimos</button><button onClick={() => onSelect('mars')} className="text-mars">Mars</button></div>
    <div className="absolute right-3 top-16 max-w-52 rounded-xl border border-line bg-void/90 p-3 text-[9px] text-muted">Mars frame origin<br/>{contextTracks.map((track) => { const vector = nearestVector(track.vectors, epoch); return <p key={track.target} className="mt-2"><span className="text-sand">{track.target === 'sun' ? 'Sun' : 'Earth'}:</span> {vector ? `${Math.hypot(vector.x_km, vector.y_km, vector.z_km).toLocaleString(undefined, { maximumFractionDigits: 0 })} km from Mars` : 'position unavailable'}{vector ? <span className="block font-mono text-[8px]">{vector.epoch}</span> : null}</p> })}</div>
  </div>
}
