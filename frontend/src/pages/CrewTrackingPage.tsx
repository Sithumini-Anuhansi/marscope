import { useEffect, useMemo, useState } from 'react'
import { Activity, Circle, MapPin, Radio, Users } from 'lucide-react'
import { MarsGlobe } from '../components/map/MarsGlobe'
import { getMissionCrew, missionSocketUrl } from '../services/crewService'
import type { Astronaut, CrewPosition, MissionCrew } from '../services/crewService'
import { planetocentricToGeodeticLatitude } from '../utils/marsCoordinates'

const COLORS = ['#57c8d5', '#f0ad58', '#c792ea', '#87c878', '#ef7f78']
const STARTS: [number, number][] = [[-12, 18], [24, 8], [45, -16], [-35, -23]]
const NAMES = ['Asha Raman', 'Mateo Silva', 'Nia Okafor', 'Owen Park']
const ROLES = ['Commander', 'Science Officer', 'Engineer', 'Medical Officer']
const ORBITAL_CREW_ID = 'demo-shuttle-pilot'
const ORBITAL_ALTITUDE_KM = 400
const OTHER_MISSIONS = [
  { mission:'Perseverance Relay-2 · DEMO', status:'Surface traverse · ongoing', members:[{ id:'demo-perseverance-crew', name:'Lena Ortiz', role:'Geologist', latitude:-11.8, longitude:18.1 }] },
  { mission:'Astraeus Orbital Survey · DEMO', status:'Orbital survey · ongoing', members:[{ id:'demo-orbital-crew', name:'Ravi Chen', role:'Orbital pilot', latitude:20, longitude:78 }] },
  { mission:'Polar Ice Recon · DEMO', status:'Reconnaissance · ongoing', members:[{ id:'demo-polar-crew', name:'Mira Solberg', role:'Field scientist', latitude:-4, longitude:140 }] },
]
function surfaceDistanceKm(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}) { const rad=Math.PI/180; const dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad; const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2; return 3389.5*2*Math.asin(Math.sqrt(h)) }

const SPECIAL_LOCATIONS = [
  { id: 'gale-crater', label: 'Gale Crater', latitude_deg: -4.5, longitude_deg: 137.4, category: 'NASA mission site · Curiosity', color: '#f0c36d' },
  { id: 'jezero-crater', label: 'Jezero Crater', latitude_deg: 18.4446, longitude_deg: 77.4509, category: 'NASA mission site · Perseverance', color: '#6fd3c4' },
  { id: 'utopia-planitia', label: 'Utopia Planitia', latitude_deg: 46.7363, longitude_deg: 117.5168, category: 'Subsurface ice research region', color: '#85b9f5' },
]

function samplePoint(longitude: number, latitude: number, index: number, step: number, altitudeKm?: number): CrewPosition {
  const phase = (step + index * 3) / 5
  return {
    longitude_deg: ((longitude + Math.cos(phase) * 2 + 180) % 360 + 360) % 360 - 180,
    latitude_deg: Math.max(-89, Math.min(89, latitude + Math.sin(phase) * 1.5)),
    timestamp: new Date().toISOString(),
    ...(altitudeKm == null ? {} : { altitude_km: altitudeKm }),
  }
}

function buildDemoCrew(liveCrew: Astronaut[], step: number): Astronaut[] {
  const source = liveCrew.length ? liveCrew.slice(0, 4) : NAMES.map((name, index) => ({
    id: `demo-crew-${index + 1}`, name, role: ROLES[index], status: 'untracked' as const,
    latitude_deg: null, longitude_deg: null, location_timestamp: null, path: [],
  }))
  const surfaceCrew = source.map((person, index) => {
    const [longitude, latitude] = STARTS[index % STARTS.length]
    const first = Math.max(0, step - 28)
    const path = Array.from({ length: step - first + 1 }, (_, offset) => samplePoint(longitude, latitude, index, first + offset))
    const current = path[path.length - 1]
    return { ...person, status: 'on-eva' as const, latitude_deg: current.latitude_deg, longitude_deg: current.longitude_deg, location_timestamp: current.timestamp, path }
  })

  const orbitPath = Array.from({ length: 29 }, (_, index) => samplePoint(-40, 4, 5, step - 28 + index, ORBITAL_ALTITUDE_KM))
  const orbitCurrent = orbitPath[orbitPath.length - 1]
  const orbitalCrew: Astronaut = {
    id: ORBITAL_CREW_ID,
    name: 'Iris Vale · DEMO',
    role: 'Pilot aboard demo spacecraft near Mars',
    status: 'in-habitat',
    latitude_deg: orbitCurrent.latitude_deg,
    longitude_deg: orbitCurrent.longitude_deg,
    location_timestamp: orbitCurrent.timestamp,
    path: orbitPath,
  }
  return [...surfaceCrew, orbitalCrew]
}

export function CrewTrackingPage() {
  const [mission, setMission] = useState<MissionCrew | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(true)
  const [demoStep, setDemoStep] = useState(0)

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
    setDemoStep(0)
    const timer = window.setInterval(() => setDemoStep((step) => step + 1), 2500)
    return () => window.clearInterval(timer)
  }, [demo])

  const crew = useMemo(() => demo ? buildDemoCrew(mission?.astronauts ?? [], demoStep) : mission?.astronauts ?? [], [demo, demoStep, mission])
  const visibleCrew = crew.filter((person) => filter === 'all' || person.id === filter)
  const tracked = crew.filter((person) => person.latitude_deg !== null).length
  const crewMarkers = visibleCrew.flatMap((person) => person.latitude_deg == null || person.longitude_deg == null ? [] : [{
    id: person.id,
    name: person.name,
    latitudeDeg: person.latitude_deg,
    longitudeDeg: person.longitude_deg,
    status: person.id === ORBITAL_CREW_ID ? 'SIMULATED · ABOARD SPACECRAFT' : person.status,
    path: person.path.map((point) => ({ latitudeDeg: point.latitude_deg, longitudeDeg: point.longitude_deg, ...(point.altitude_km == null ? {} : { altitudeKm: point.altitude_km }) })),
    ...(person.id === ORBITAL_CREW_ID ? { altitudeKm: ORBITAL_ALTITUDE_KM } : {}),
  }])
  const otherMissionCrew = demo ? OTHER_MISSIONS.flatMap((missionItem) => missionItem.members.map((person) => ({ ...person, mission: missionItem.mission }))) : []
  const crossMissionNearby = demo ? otherMissionCrew.map((person) => ({ ...person, nearest: Math.min(...crew.filter((member) => member.latitude_deg != null && member.longitude_deg != null && member.id !== ORBITAL_CREW_ID).map((member) => surfaceDistanceKm({ latitude: member.latitude_deg!, longitude: member.longitude_deg! }, person))) })).filter((person) => person.nearest <= 150).sort((a,b)=>a.nearest-b.nearest) : []
  const otherMissionMarkers = otherMissionCrew.map((person) => ({ id: person.id, name: `${person.name} · DEMO`, latitudeDeg: person.latitude, longitudeDeg: person.longitude, status: `SIMULATED · ${person.mission}`, path: [] as {latitudeDeg:number;longitudeDeg:number}[] }))
  const focusCrewMember = crew.find((person) => person.id === selected) ?? crew[0]
  const mapFocus = useMemo(() => focusCrewMember?.latitude_deg == null || focusCrewMember.longitude_deg == null ? null : { latitudeDeg: focusCrewMember.latitude_deg, longitudeDeg: focusCrewMember.longitude_deg }, [focusCrewMember?.latitude_deg, focusCrewMember?.longitude_deg])
  const specialMarkers = SPECIAL_LOCATIONS.map((site) => ({
    id: site.id,
    label: site.label,
    latitudeDeg: planetocentricToGeodeticLatitude(site.latitude_deg),
    longitudeDeg: site.longitude_deg,
    color: site.color,
    category: site.category,
  }))

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.25em] text-gold uppercase">Surface and orbital operations · ARES-IV</p><h1 className="mt-2 text-2xl font-semibold text-sand">Crew tracking</h1><p className="mt-1 text-sm text-muted">Track mission positions on Mars, inspect key science regions, or preview a simulated crew member aboard a spacecraft near Mars.</p></div><div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-muted"><Radio size={14}/>{demo ? 'Demo feed' : `WebSocket ${connection}`}</span><button onClick={() => setDemo((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs ${demo ? 'border-warn/50 bg-warn/10 text-warn' : 'border-line text-sand hover:bg-panel-alt'}`}>{demo ? 'Stop demonstration' : 'Start demonstration'}</button></div></header>
    {demo && <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-warn">DEMONSTRATION MODE · Crew paths and the orbital spacecraft marker are simulated. They are not real astronaut locations or an orbital prediction. The mission feed is unchanged.</p>}
    {error && !demo && <p role="alert" className="rounded-xl border border-mars/30 bg-mars/5 px-4 py-3 text-xs text-mars">{error}. Start the backend to connect.</p>}
    <section id="crew-map" className="scroll-mt-24 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="relative h-[min(68vh,48rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-line bg-[#070605]">
        <MarsGlobe focusLocation={mapFocus} crewMarkers={[...crewMarkers, ...otherMissionMarkers]} explorationMarkers={specialMarkers}/>
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-lg border border-line bg-void/85 px-3 py-2 text-[10px] text-muted"><span className="flex items-center gap-1"><MapPin size={12}/>{tracked} tracked</span><span className="flex items-center gap-1"><Users size={12}/>{demo ? crewMarkers.length + otherMissionMarkers.length : crew.length} crew markers on map</span><span className="text-gold">3 special science locations</span></div>
        {demo ? <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-warn/40 bg-void/90 px-3 py-2 font-mono text-[9px] text-warn">SIMULATED SPACECRAFT · 400 KM ALTITUDE</div> : null}
      </div>
      <aside className="flex min-h-[28rem] flex-col rounded-2xl border border-line bg-panel/90"><div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Mission crew</p><h2 className="mt-1 text-sm font-medium text-sand">{mission?.name ?? 'Ares IV Surface Mission'}</h2></div><Users size={16} className="text-muted"/></div><label className="px-4 pt-3 text-[10px] text-muted">Filter crew member<select value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand"><option value="all">All astronauts</option>{crew.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <div className="space-y-2 p-3">{visibleCrew.map((person, index) => { const orbital = person.id === ORBITAL_CREW_ID; return <button key={person.id} onClick={() => setSelected(person.id)} className={`w-full rounded-xl border p-3 text-left ${selected === person.id || (!selected && index === 0) ? 'border-gold/45 bg-gold/5' : 'border-line bg-void/40 hover:bg-void/70'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-medium text-sand"><Circle size={10} fill={COLORS[crew.indexOf(person) % COLORS.length]} color={COLORS[crew.indexOf(person) % COLORS.length]}/>{person.name}</span><span className={`rounded-full border px-2 py-1 font-mono text-[8px] uppercase ${orbital ? 'border-warn/40 text-warn' : 'border-line text-muted'}`}>{orbital ? 'DEMO · ORBIT' : person.status.replace('-', ' ')}</span></div><p className="mt-1 pl-[18px] text-[10px] text-muted">{person.role}</p><p className="mt-2 pl-[18px] font-mono text-[10px] text-sand/80">{person.latitude_deg == null ? 'Position unavailable' : orbital ? `${ORBITAL_ALTITUDE_KM} km above Mars · subpoint ${person.latitude_deg.toFixed(2)}°, ${person.longitude_deg?.toFixed(2)}°` : `${person.latitude_deg.toFixed(4)}° lat, ${person.longitude_deg?.toFixed(4)}° lon`}</p><p className="mt-1 flex items-center gap-1 pl-[18px] text-[9px] text-muted"><Activity size={10}/>{orbital ? 'Inside simulated Mars-orbit spacecraft' : `Last update: ${person.location_timestamp ? new Date(person.location_timestamp).toLocaleTimeString() : 'No location received'}`}</p></button>})}</div>
      {selected && crew.find((person) => person.id === selected) ? <div className="mt-auto border-t border-line p-4"><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Selected astronaut</p><p className="mt-2 text-sm text-sand">{crew.find((person) => person.id === selected)?.name}</p><p className="mt-1 text-[10px] text-muted">{crew.find((person) => person.id === selected)?.path.length} path positions{selected === ORBITAL_CREW_ID ? ' · simulated orbit path' : ''}</p></div> : null}</aside>
    </section>
    {demo ? <section id="other-missions" className="scroll-mt-24 grid items-start gap-3 lg:grid-cols-2"><article className="rounded-xl border border-warn/30 bg-warn/5 p-4"><p className="font-mono text-[10px] tracking-widest text-warn uppercase">Nearby crew on other missions · demo</p><p className="mt-1 text-[10px] text-muted">Surface great-circle estimate; 150 km display radius. Simulated values only.</p>{crossMissionNearby.length ? <div className="mt-3 space-y-2">{crossMissionNearby.map((person) => <div key={person.id} className="rounded-lg border border-line bg-void/50 p-3"><p className="text-xs text-sand">{person.name} · {person.mission}</p><p className="mt-1 font-mono text-[10px] text-gold">~{person.nearest.toFixed(1)} km from your crew</p></div>)}</div> : <p className="mt-3 text-xs text-muted">No demo crew within 150 km of the current crew.</p>}</article><article className="rounded-xl border border-line bg-panel/70 p-4"><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Ongoing missions · demo</p><div className="mt-3 space-y-2">{OTHER_MISSIONS.map((missionItem) => <div key={missionItem.mission} className="rounded-lg border border-line bg-void/50 p-3"><p className="text-xs text-sand">{missionItem.mission}</p><p className="mt-1 text-[10px] text-muted">{missionItem.status} · {missionItem.members.length} crew member</p></div>)}</div></article></section> : null}
    <section id="special-locations" className="scroll-mt-24 grid items-start gap-2 sm:grid-cols-3" aria-label="Special Mars locations">{SPECIAL_LOCATIONS.map((site) => <article key={site.id} className="rounded-xl border border-line bg-panel/70 p-3"><p className="text-xs font-medium text-sand">{site.label}</p><p className="mt-1 text-[10px] text-muted">{site.category}</p><p className="mt-1 font-mono text-[9px] text-gold">{site.latitude_deg.toFixed(2)}° lat · {site.longitude_deg.toFixed(2)}° E</p></article>)}</section>
    <p className="text-[10px] leading-relaxed text-muted">Mars 2000 convention: geodetic latitude (−90° to 90°), east-positive longitude (−180° to 180°), degrees on the Mars ellipsoid. Special locations are cited regional research anchors. Locations are stale after 60 seconds without a live update; demo positions are visibly marked.</p>
  </main>
}
