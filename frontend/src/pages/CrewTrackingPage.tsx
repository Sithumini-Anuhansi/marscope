import { useEffect, useState } from 'react'
import { Cartesian3, Color, Ellipsoid } from 'cesium'
import { Entity, Globe, Viewer } from 'resium'
import { Activity, Circle, MapPin, Radio, Users } from 'lucide-react'
import { getMissionCrew, missionSocketUrl } from '../services/crewService'
import type { Astronaut, MissionCrew } from '../services/crewService'

const COLORS = ['#57c8d5', '#f0ad58', '#c792ea', '#87c878']
const STARTS: [number, number][] = [[-12, 18], [24, 8], [45, -16], [-35, -23]]
const NAMES = ['Asha Raman', 'Mateo Silva', 'Nia Okafor', 'Owen Park']
const ROLES = ['Commander', 'Science Officer', 'Engineer', 'Medical Officer']

export function CrewTrackingPage() {
  const [mission, setMission] = useState<MissionCrew | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const crew = mission?.astronauts ?? []

  useEffect(() => {
    let active = true
    let socket: WebSocket | undefined
    getMissionCrew().then((data) => {
      if (!active) return
      setMission(data)
      socket = new WebSocket(missionSocketUrl())
      socket.onopen = () => setConnection('connected')
      socket.onclose = () => setConnection('disconnected')
      socket.onerror = () => setConnection('disconnected')
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as { mission?: MissionCrew; type: string; message?: string }
        if (message.mission) setMission(message.mission)
        if (message.type === 'error') setError(message.message ?? 'Location update rejected')
      }
    }).catch((reason: unknown) => {
      setConnection('disconnected')
      setError(reason instanceof Error ? reason.message : 'Crew service unavailable')
    })
    return () => { active = false; socket?.close() }
  }, [])

  useEffect(() => {
    if (!demo) return
    let step = 0
    const tick = () => {
      const timestamp = new Date().toISOString()
      setMission((current) => {
        const astronauts = current?.astronauts ?? NAMES.map((name, i) => ({ id: `demo-${i + 1}`, name, role: ROLES[i], status: 'untracked' as const, latitude_deg: null, longitude_deg: null, location_timestamp: null, path: [] }))
        return { id: 'demo-ares-iv', name: 'Ares IV · Demonstration', astronauts: astronauts.map((person, i) => {
          const [lon, lat] = STARTS[i % STARTS.length]
          const point = { latitude_deg: lat + Math.sin((step + i) / 4) * 1.5, longitude_deg: lon + Math.cos((step + i) / 4) * 2, timestamp }
          return { ...person, status: 'on-eva', latitude_deg: point.latitude_deg, longitude_deg: point.longitude_deg, location_timestamp: timestamp, path: [...person.path, point].slice(-80) }
        }) as Astronaut[] }
      })
      step += 1
    }
    tick()
    const timer = window.setInterval(tick, 2500)
    return () => window.clearInterval(timer)
  }, [demo])

  const visibleCrew = crew.filter((person) => filter === 'all' || person.id === filter)
  const tracked = crew.filter((person) => person.latitude_deg !== null).length

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.25em] text-gold uppercase">Surface operations · ARES-IV</p><h1 className="mt-2 text-2xl font-semibold text-sand">Crew tracking</h1><p className="mt-1 text-sm text-muted">Individual astronaut positions and exploration paths across Mars.</p></div><div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-muted"><Radio size={14}/>{demo ? 'Demo feed' : `WebSocket ${connection}`}</span><button onClick={() => setDemo((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs ${demo ? 'border-warn/50 bg-warn/10 text-warn' : 'border-line text-sand hover:bg-panel-alt'}`}>{demo ? 'Stop demonstration' : 'Start demonstration'}</button></div></header>
    {demo && <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-warn">DEMONSTRATION MODE · All positions are simulated and do not represent real astronaut locations.</p>}
    {error && !demo && <p role="alert" className="rounded-xl border border-mars/30 bg-mars/5 px-4 py-3 text-xs text-mars">{error}. Start the backend to connect.</p>}
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="relative h-[min(68vh,48rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-line bg-[#070605]"><Viewer full ellipsoid={Ellipsoid.MARS} baseLayer={false} animation={false} timeline={false} geocoder={false} homeButton={false} sceneModePicker={false} navigationHelpButton={false} fullscreenButton={false} infoBox={false} selectionIndicator={false} skyAtmosphere={false}><Globe showGroundAtmosphere={false} baseColor={Color.fromCssColorString('#6b2d22')}/>
        {visibleCrew.map((person) => { const index = crew.indexOf(person); const color = Color.fromCssColorString(COLORS[index % COLORS.length]); const path = person.path.map((p) => Cartesian3.fromDegrees(p.longitude_deg, p.latitude_deg, 0, Ellipsoid.MARS)); return <Entity key={person.id} name={person.name} position={person.latitude_deg == null || person.longitude_deg == null ? undefined : Cartesian3.fromDegrees(person.longitude_deg, person.latitude_deg, 0, Ellipsoid.MARS)} point={{ pixelSize: selected === person.id ? 15 : 11, color, outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: person.name, fillColor: color, outlineColor: Color.BLACK, outlineWidth: 3, font: '12px IBM Plex Sans', disableDepthTestDistance: Number.POSITIVE_INFINITY }} polyline={path.length > 1 ? { positions: path, width: 3, material: color.withAlpha(0.75), clampToGround: true } : undefined}/> })}
      </Viewer><div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-line bg-void/85 px-3 py-2 text-[10px] text-muted"><span className="font-mono text-gold">MARS 2000</span> · Geodetic latitude · East-positive longitude</div><div className="absolute bottom-4 left-4 flex gap-3 rounded-lg border border-line bg-void/85 px-3 py-2 text-[10px] text-muted"><span className="flex items-center gap-1"><MapPin size={12}/>{tracked} tracked</span><span className="flex items-center gap-1"><Users size={12}/>{crew.length} crew</span></div></div>
      <aside className="flex min-h-[28rem] flex-col rounded-2xl border border-line bg-panel/90"><div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Mission crew</p><h2 className="mt-1 text-sm font-medium text-sand">{mission?.name ?? 'Ares IV Surface Mission'}</h2></div><Users size={16} className="text-muted"/></div><label className="px-4 pt-3 text-[10px] text-muted">Filter crew member<select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand"><option value="all">All astronauts</option>{crew.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="space-y-2 p-3">{crew.map((person, i) => <button key={person.id} onClick={() => setSelected(person.id)} className={`w-full rounded-xl border p-3 text-left ${selected === person.id || (!selected && i === 0) ? 'border-gold/45 bg-gold/5' : 'border-line bg-void/40 hover:bg-void/70'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-medium text-sand"><Circle size={10} fill={COLORS[i % COLORS.length]} color={COLORS[i % COLORS.length]}/>{person.name}</span><span className="rounded-full bg-line/60 px-2 py-1 font-mono text-[9px] text-muted uppercase">{person.status.replace('-', ' ')}</span></div><p className="mt-1 pl-[18px] text-[10px] text-muted">{person.role}</p><p className="mt-2 pl-[18px] font-mono text-[10px] text-sand/80">{person.latitude_deg == null ? 'Position unavailable' : `${person.latitude_deg.toFixed(4)}° lat, ${person.longitude_deg?.toFixed(4)}° lon`}</p><p className="mt-1 flex items-center gap-1 pl-[18px] text-[9px] text-muted"><Activity size={10}/>Last update: {person.location_timestamp ? new Date(person.location_timestamp).toLocaleTimeString() : 'No location received'}</p></button>)}</div>
      {crew.find((p) => p.id === selected) && <div className="mt-auto border-t border-line p-4"><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Selected astronaut</p><p className="mt-2 text-sm text-sand">{crew.find((p) => p.id === selected)?.name}</p><p className="mt-1 text-[10px] text-muted">{crew.find((p) => p.id === selected)?.path.length} path positions</p></div>}</aside>
    </section><p className="text-[10px] leading-relaxed text-muted">Mars 2000 convention: geodetic latitude (−90° to 90°), east-positive longitude (−180° to 180°), degrees on the Mars ellipsoid. Locations are stale after 60 seconds without an update.</p>
  </main>
}
