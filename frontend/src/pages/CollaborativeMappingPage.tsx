import { useEffect, useMemo, useState } from 'react'
import { Cartesian2, Cartesian3, Cartographic, Color, Ellipsoid, ScreenSpaceEventType } from 'cesium'
import { Entity, Globe, ScreenSpaceEvent, Viewer, useCesium } from 'resium'
import { Check, Circle, Radio, Send, ShieldAlert, X } from 'lucide-react'
import { createObservation, CATEGORIES, deleteObservation, observationSocketUrl, updateObservation } from '../services/observationService'
import type { Observation, ObservationCategory, ObservationDraft } from '../services/observationService'

const MISSION_ID = 'ares-iv'
const CREW = [['crew-01','Asha Raman'],['crew-02','Mateo Silva'],['crew-03','Nia Okafor'],['crew-04','Owen Park']] as const

export function CollaborativeMappingPage() {
  const [observations, setObservations] = useState<Observation[]>([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [crewFilter, setCrewFilter] = useState('all')
  const [actorId, setActorId] = useState<string>(CREW[0][0])
  const [role, setRole] = useState<'crew'|'mission-control'>('crew')
  const [actorToken, setActorToken] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [draftLocation, setDraftLocation] = useState<{latitude_deg:number;longitude_deg:number}|null>(null)
  const [category, setCategory] = useState<ObservationCategory>('discovery')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
  const [imageRefs, setImageRefs] = useState('')
  const [evidence, setEvidence] = useState('')
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const socket = new WebSocket(observationSocketUrl(MISSION_ID))
    socket.onopen = () => setStatus('connected')
    socket.onclose = () => setStatus('disconnected')
    socket.onerror = () => setStatus('disconnected')
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; observations?: Observation[]; observation?: Observation; observation_id?: string }
      if (message.type === 'snapshot') setObservations(message.observations ?? [])
      else if (message.type === 'created' && message.observation) setObservations((current) => current.some((o) => o.id === message.observation?.id) ? current : [message.observation!, ...current])
      else if (message.type === 'updated' && message.observation) setObservations((current) => current.map((o) => o.id === message.observation?.id ? message.observation! : o))
      else if (message.type === 'deleted' && message.observation_id) setObservations((current) => current.filter((o) => o.id !== message.observation_id))
    }
    return () => socket.close()
  }, [])

  const visible = useMemo(() => observations.filter((o) => (categoryFilter === 'all' || o.category === categoryFilter) && (crewFilter === 'all' || o.astronaut_id === crewFilter)), [observations, categoryFilter, crewFilter])
  const active = observations.find((o) => o.id === selected) ?? null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draftLocation) return
    setSaving(true); setError(null)
    const draft: ObservationDraft = { astronaut_id: actorId, category, description, ...draftLocation,
      severity: severity || undefined, image_refs: imageRefs.split('\n').map((ref) => ref.trim()).filter(Boolean), supporting_evidence: evidence || undefined }
    try { const created = await createObservation(MISSION_ID, draft, actorId, actorToken); setSelected(created.id); setDraftLocation(null); setDescription(''); setSeverity(''); setImageRefs(''); setEvidence('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit report') }
    finally { setSaving(false) }
  }

  const verify = async (observation: Observation, verification_status: 'verified'|'under-review'|'rejected') => {
    try { const updated = await updateObservation(MISSION_ID, observation.id, { verification_status }, actorId, role, actorToken); setObservations((current) => current.map((item) => item.id === updated.id ? updated : item)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update review status') }
  }
  const remove = async (observation: Observation) => {
    try { await deleteObservation(MISSION_ID, observation.id, actorId, role, actorToken); setObservations((current) => current.filter((item) => item.id !== observation.id)); setSelected(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete report') }
  }

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[0.24em] text-gold uppercase">Ares IV · Shared mission layer</p><h1 className="mt-2 text-2xl font-semibold text-sand">Collaborative map</h1><p className="mt-1 max-w-2xl text-sm text-muted">Share location-based reports with the crew. Every new report is unverified until mission control reviews it.</p></div><span className="flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-muted"><Radio size={13}/>Live sync {status}</span></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="relative h-[min(70vh,52rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-line bg-[#070605]" aria-label="Interactive Mars observation map">
        <Viewer full ellipsoid={Ellipsoid.MARS} baseLayer={false} animation={false} timeline={false} geocoder={false} homeButton={false} sceneModePicker={false} navigationHelpButton={false} fullscreenButton={false} infoBox={false} selectionIndicator={false} skyAtmosphere={false}>
          <Globe showGroundAtmosphere={false} baseColor={Color.fromCssColorString('#6b2d22')}/>
          {visible.map((observation) => { const color = CATEGORIES.find((c) => c.id === observation.category)?.color ?? '#ded6c6'; const author = CREW.find(([id]) => id === observation.astronaut_id)?.[1] ?? observation.astronaut_id; return <Entity key={observation.id} name={`${observation.category} · ${author}`} position={Cartesian3.fromDegrees(observation.longitude_deg, observation.latitude_deg, 0, Ellipsoid.MARS)} point={{ pixelSize: selected === observation.id ? 15 : 11, color: Color.fromCssColorString(color), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} label={{ text: `${observation.category.toUpperCase()} · ${author}`, font: '10px IBM Plex Mono', fillColor: Color.fromCssColorString(color), outlineColor: Color.BLACK, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY }} /> })}
          <MapClickBridge onLocation={setDraftLocation}/>
        </Viewer>
        <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-line bg-void/85 px-3 py-2 text-[10px] text-muted"><span className="font-mono text-gold">MARS 2000</span> · Click surface to mark · Geodetic / east-positive</div>
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 rounded-lg border border-line bg-void/90 p-2 backdrop-blur">{CATEGORIES.map((item)=><span key={item.id} className="flex items-center gap-1 text-[9px] text-muted"><Circle size={8} fill={item.color} color={item.color}/>{item.label}</span>)}</div>
      </section>
      <aside className="flex max-h-[min(70vh,52rem)] min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-line bg-panel/90">
        <div className="border-b border-line p-4"><p className="font-mono text-[10px] tracking-widest text-gold uppercase">Crew reports · unverified</p><div className="mt-3 grid grid-cols-2 gap-2"><select value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)} className="rounded-lg border border-line bg-void px-2 py-2 text-[10px] text-sand"><option value="all">All categories</option>{CATEGORIES.map((c)=><option key={c.id} value={c.id}>{c.label}</option>)}</select><select value={crewFilter} onChange={(e)=>setCrewFilter(e.target.value)} className="rounded-lg border border-line bg-void px-2 py-2 text-[10px] text-sand"><option value="all">All astronauts</option>{CREW.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div><p className="mt-2 text-[9px] text-muted">Signed-in actor · token must match this identity</p><div className="mt-1 flex gap-2"><select value={actorId} onChange={(e)=>setActorId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-void px-2 py-2 text-[10px] text-sand">{CREW.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select value={role} onChange={(e)=>setRole(e.target.value as typeof role)} className="rounded-lg border border-line bg-void px-2 py-2 text-[10px] text-sand"><option value="crew">Crew</option><option value="mission-control">Mission control</option></select></div><input type="password" autoComplete="current-password" value={actorToken} onChange={(e)=>setActorToken(e.target.value)} placeholder="Actor access token" className="mt-2 w-full rounded-lg border border-line bg-void px-2 py-2 text-[10px] text-sand" /></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{visible.length===0?<p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">No crew reports. Select a point on the map to add one.</p>:visible.map((o)=>{const style=CATEGORIES.find((c)=>c.id===o.category)!;const author=CREW.find(([id])=>id===o.astronaut_id)?.[1]??o.astronaut_id;return <button key={o.id} onClick={()=>setSelected(o.id)} className={`w-full rounded-xl border p-3 text-left ${selected===o.id?'border-gold/45 bg-gold/5':'border-line bg-void/40 hover:bg-void/70'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[11px] font-medium text-sand"><Circle size={9} fill={style.color} color={style.color}/>{style.label}</span><span className="rounded-full border border-warn/30 px-2 py-0.5 font-mono text-[8px] text-warn uppercase">{o.verification_status}</span></div><p className="mt-2 line-clamp-2 text-[11px] text-sand/80">{o.description}</p><p className="mt-2 text-[9px] text-muted">{author} · {o.latitude_deg.toFixed(3)}°, {o.longitude_deg.toFixed(3)}° · {new Date(o.submitted_at).toLocaleString()}</p></button>})}</div>
        {active && <div className="border-t border-line p-4"><div className="flex items-center justify-between"><p className="font-mono text-[9px] tracking-widest text-gold uppercase">Report details</p><button aria-label="Close report details" onClick={()=>setSelected(null)}><X size={14} className="text-muted"/></button></div><p className="mt-2 text-xs text-sand">{active.description}</p>{active.severity&&<p className="mt-1 text-[10px] text-warn">Severity: {active.severity}</p>}{active.supporting_evidence&&<p className="mt-2 text-[10px] text-muted">Evidence: {active.supporting_evidence}</p>}{active.image_refs.map((src)=><a key={src} className="mt-2 block truncate text-[10px] text-sky-300 underline" href={src} target="_blank" rel="noreferrer">Attached image reference</a>)}<p className="mt-2 text-[9px] text-muted">Crew reports are not validated hazard data.</p>{role==='mission-control'&&active.verification_status!=='verified'&&<div className="mt-3 flex gap-2"><button onClick={()=>void verify(active,'under-review')} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[9px] text-sand">Review</button><button onClick={()=>void verify(active,'verified')} className="flex items-center gap-1 rounded border border-ok/30 px-2 py-1 text-[9px] text-ok"><Check size={11}/>Verify</button><button onClick={()=>void verify(active,'rejected')} className="rounded border border-mars/30 px-2 py-1 text-[9px] text-mars">Reject</button></div>}{(role==='mission-control'||active.astronaut_id===actorId)&&<button onClick={()=>void remove(active)} className="mt-3 rounded border border-mars/30 px-2 py-1 text-[9px] text-mars">Delete report</button>}</div>}
      </aside>
    </div>
    {draftLocation&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="observation-title"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl border border-line bg-charcoal p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] tracking-widest text-gold uppercase">New crew report · unverified</p><h2 id="observation-title" className="mt-1 text-lg font-medium text-sand">Mark a location</h2><p className="mt-1 font-mono text-[10px] text-muted">{draftLocation.latitude_deg.toFixed(4)}° lat · {draftLocation.longitude_deg.toFixed(4)}° lon</p></div><button type="button" onClick={()=>setDraftLocation(null)}><X size={16}/></button></div><label className="block text-[10px] text-muted">Category<select value={category} onChange={(e)=>setCategory(e.target.value as ObservationCategory)} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand">{CATEGORIES.map((c)=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label className="block text-[10px] text-muted">Description<textarea required minLength={3} maxLength={2000} value={description} onChange={(e)=>setDescription(e.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand" placeholder="Describe what you observed"/></label><label className="block text-[10px] text-muted">Severity (optional)<select value={severity} onChange={(e)=>setSeverity(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand"><option value="">Not specified</option><option>low</option><option>moderate</option><option>high</option><option>critical</option></select></label><label className="block text-[10px] text-muted">Image URL references (optional, one per line)<textarea value={imageRefs} onChange={(e)=>setImageRefs(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand" placeholder="https://…"/></label><label className="block text-[10px] text-muted">Supporting scientific evidence (optional)<textarea value={evidence} onChange={(e)=>setEvidence(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand" placeholder="Reference, instrument, or context"/></label>{error&&<p role="alert" className="text-xs text-mars">{error}</p>}<p className="flex items-center gap-1 text-[9px] text-warn"><ShieldAlert size={12}/>Crew submitted reports are unverified and are not scientifically validated hazards.</p><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-semibold text-void disabled:opacity-50"><Send size={13}/>{saving?'Submitting…':'Submit observation'}</button></form></div>}
    {error&&!draftLocation&&<p role="alert" className="text-xs text-mars">{error}</p>}
  </main>
}

function MapClickBridge({onLocation}:{onLocation:(value:{latitude_deg:number;longitude_deg:number})=>void}) {
  const {viewer}=useCesium()
  return <ScreenSpaceEvent type={ScreenSpaceEventType.LEFT_CLICK} action={(event: {position: Cartesian2}|{startPosition:Cartesian2;endPosition:Cartesian2})=>{
    if (!('position' in event)) return
    if(!viewer||viewer.isDestroyed()) return
    const point=viewer.camera.pickEllipsoid(event.position,Ellipsoid.MARS)
    if(!point) return
    const geo=Cartographic.fromCartesian(point,Ellipsoid.MARS)
    onLocation({latitude_deg:geo.latitude*180/Math.PI,longitude_deg:((((geo.longitude*180/Math.PI)+180)%360+360)%360)-180})
  }}/>
}
