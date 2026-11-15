import { useState } from 'react'
import { Check, Database, Globe2, LoaderCircle, Radio, RotateCcw, Save, Settings2, Sparkles, TriangleAlert } from 'lucide-react'
import { API_BASE_URL } from '../services/api'
import { IMAGERY_SOURCES } from '../services/marsImageryService'

type Preferences = {
  units: 'metric' | 'imperial'
  latitudeConvention: 'planetocentric' | 'geodetic'
  longitudeConvention: 'positive-east' | 'positive-west'
  showFeatureLabels: boolean
  compactDataPanels: boolean
  notifications: boolean
}

const STORAGE_KEY = 'marscope.settings.preferences'
const DATA_PROFILE_KEY = 'marscope.settings.data-profile'
const DEFAULTS: Preferences = { units: 'metric', latitudeConvention: 'planetocentric', longitudeConvention: 'positive-east', showFeatureLabels: false, compactDataPanels: false, notifications: true }
const SAMPLE: Preferences = { units: 'metric', latitudeConvention: 'planetocentric', longitudeConvention: 'positive-east', showFeatureLabels: true, compactDataPanels: true, notifications: false }
const inputClass = 'mt-1 block w-full rounded-lg border border-line bg-void px-3 py-2 text-xs text-sand'
const SOURCE_OPTIONS = ['MOLA topography', 'MOLA shaded relief', 'Viking MDIM imagery', 'THEMIS', 'CTX', 'CTX mosaic (beta)', 'HiRISE', 'CRISM', 'SHARAD', 'MCD', 'MEDA', 'MARCI', 'MCS', 'RAD', 'AI4MARS', 'JPL Horizons']
type DataProfile = { missionName: string; targetBody: 'Mars' | 'Earth' | 'Moon'; areaName: string; latitude: string; longitude: string; searchRadiusKm: string; epochUtc: string; positionInput: 'manual-or-imported' | 'mission-telemetry'; sources: string[]; productId: string }
const DEFAULT_PROFILE: DataProfile = { missionName: '', targetBody: 'Mars', areaName: '', latitude: '', longitude: '', searchRadiusKm: '25', epochUtc: '', positionInput: 'manual-or-imported', sources: ['MOLA topography', 'Viking MDIM imagery'], productId: '' }
const SAMPLE_PROFILE: DataProfile = { missionName: 'Ares IV · DEMO', targetBody: 'Mars', areaName: 'Gale Crater · sample search area', latitude: '-4.5', longitude: '137.4', searchRadiusKm: '25', epochUtc: new Date().toISOString(), positionInput: 'manual-or-imported', sources: [...SOURCE_OPTIONS], productId: 'Optional NASA PDS product ID' }
const SOURCE_COVERAGE = [
  { sources:[], title:'MARSCOPE backend API', provides:'Health endpoint for the application services used by maps, datasets, crew, and mission workflows.', access:'Backend connection', limit:'Backend must be running and reachable from this browser.' },
  { sources:['MOLA topography'], title:'MOLA topography', provides:'Elevation and derived terrain context such as slope, aspect, and roughness.', access:'Local processing workflow', limit:'Global sample is coarse for local EVA navigation; higher-resolution regional tiles require explicit ingestion.' },
  { sources:['MOLA shaded relief'], title:'MOLA shaded relief', provides:'NASA Mars Trek MOLA-derived hillshade imagery for visual relief context.', access:'External map tile service', limit:'This is a visual layer, not numeric elevation data; browser tile access can fail independently.' },
  { sources:['Viking MDIM imagery'], title:'Viking MDIM', provides:'Base imagery for Mars map context.', access:'Map imagery layer', limit:'Imagery availability depends on the selected provider and network access.' },
  { sources:['CTX mosaic (beta)'], title:'CTX mosaic (beta)', provides:'External CTX map mosaic preview.', access:'External map tile service · beta', limit:'Tile scheme and browser compatibility are not fully verified; this is separate from PDS product search.' },
  { sources:['THEMIS','CTX','HiRISE','CRISM','SHARAD'], title:'NASA PDS: THEMIS · CTX · HiRISE · CRISM · SHARAD', provides:'Searches for products covering a Mars location, with product metadata and available previews.', access:'Product discovery and previews', limit:'Search results and previews are not full raw-data ingestion into hazard analysis or route planning.' },
  { sources:['MCD','MEDA','MARCI','MCS','RAD'], title:'MCD · MEDA · MARCI · MCS · RAD', provides:'Dataset references and labelled example records where available.', access:'Catalogued / demo examples', limit:'Separate calibrated-data ingestion and processing workflows are still needed.' },
  { sources:['JPL Horizons'], title:'JPL Horizons', provides:'Positions of known celestial bodies for the requested epoch.', access:'Backend and network dependent', limit:'Does not determine a traveller’s position; that requires telemetry or a supplied state vector.' },
  { sources:['AI4MARS'], title:'AI4MARS', provides:'Potential labelled rover imagery for terrain-material segmentation.', access:'No local validated model', limit:'No reviewed local archive and approved trained model are installed for operational predictions.' },
]
type CheckState = 'checking' | 'connected' | 'connected-with-limits' | 'unavailable' | 'demo' | 'catalogued'
type CheckResult = { state: CheckState; message: string; checkedAt: string; demoFallback: boolean }

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Preferences> | null
    return { ...DEFAULTS, ...stored }
  } catch { return DEFAULTS }
}
function readDataProfile(): DataProfile {
  try { const stored = JSON.parse(localStorage.getItem(DATA_PROFILE_KEY) ?? 'null') as Partial<DataProfile> | null; return { ...DEFAULT_PROFILE, ...stored } } catch { return DEFAULT_PROFILE }
}

async function fetchServiceJson(path: string, timeoutMs = 12_000): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal })
    let data: unknown = null
    try { data = await response.json() } catch { /* Health checks may return no JSON body. */ }
    return { response, data }
  } finally { window.clearTimeout(timeout) }
}

function probeImage(url: string, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeout = window.setTimeout(() => { image.src = ''; reject(new Error('Tile request timed out.')) }, timeoutMs)
    image.crossOrigin = 'anonymous'
    image.onload = () => { window.clearTimeout(timeout); resolve() }
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Tile could not be loaded with browser cross-origin access.')) }
    image.src = url
  })
}

export function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const [dataProfile, setDataProfile] = useState<DataProfile>(readDataProfile)
  const [demo, setDemo] = useState(false)
  const [saved, setSaved] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [serviceChecks, setServiceChecks] = useState<Record<string, CheckResult>>({})
  const [checkingServices, setCheckingServices] = useState(false)

  function loadSample() {
    setDemo(true)
    setPreferences(SAMPLE)
    setDataProfile(SAMPLE_PROFILE)
    setSaved(false)
    setStorageError('')
    const sampleCheckedAt = new Date().toISOString()
    setServiceChecks(Object.fromEntries(SOURCE_COVERAGE.map((item) => [item.title, { state:'demo' as const, message:'Sample status only. No connection was attempted; use “Check services” for live results.', checkedAt:sampleCheckedAt, demoFallback:true }])) as Record<string, CheckResult>)
  }

  function reset() {
    setDemo(false)
    setPreferences(DEFAULTS)
    setDataProfile(DEFAULT_PROFILE)
    setSaved(false)
    setStorageError('')
    setServiceChecks({})
  }

  function save() {
    if (demo) { setStorageError('Exit sample mode before saving preferences. Sample values are temporary and were not saved.'); return }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      localStorage.setItem(DATA_PROFILE_KEY, JSON.stringify(dataProfile))
      setSaved(true)
      setStorageError('')
    } catch { setStorageError('Browser storage is unavailable; these preference changes were not saved.') }
  }

  async function checkServices() {
    setCheckingServices(true)
    const checkingAt = new Date().toISOString()
    setServiceChecks(Object.fromEntries(SOURCE_COVERAGE.map((item) => [item.title, { state:'checking' as const, message:'Checking this source…', checkedAt:checkingAt, demoFallback:false }])) as Record<string, CheckResult>)
    let backendAvailable = false
    let backendMessage = ''
    try {
      const { response, data } = await fetchServiceJson('/api/v1/health')
      const status = data && typeof data === 'object' && 'status' in data ? String(data.status) : ''
      backendAvailable = response.ok && ['ok','healthy','online'].includes(status.toLowerCase())
      backendMessage = backendAvailable ? 'API health endpoint responded successfully.' : `Health endpoint returned HTTP ${response.status}.`
    } catch (error) { backendMessage = error instanceof Error ? error.message : 'Backend API could not be reached.' }

    const now = () => new Date().toISOString()
    const result = (state: CheckState, message: string, demoFallback = state === 'unavailable' || state === 'demo'): CheckResult => ({ state, message, checkedAt:now(), demoFallback })
    const backendUnavailable = () => result('unavailable', `${backendMessage || 'Backend API is unavailable.'} Local demo examples remain available; no live data was substituted.`, true)
    const queryLat = Number.isFinite(Number(dataProfile.latitude)) && dataProfile.latitude.trim() ? Number(dataProfile.latitude) : -4.5
    const queryLon = Number.isFinite(Number(dataProfile.longitude)) && dataProfile.longitude.trim() ? Number(dataProfile.longitude) : 137.4
    const usingSampleLocation = demo || !(dataProfile.latitude.trim() && dataProfile.longitude.trim() && Number.isFinite(Number(dataProfile.latitude)) && Number.isFinite(Number(dataProfile.longitude)))

    const results = await Promise.all(SOURCE_COVERAGE.map(async (item): Promise<[string, CheckResult]> => {
      if (item.title === 'MARSCOPE backend API') return [item.title, backendAvailable ? result('connected', backendMessage, false) : result('unavailable', backendMessage, true)]
      if (item.title === 'Viking MDIM') {
        const url = IMAGERY_SOURCES['viking-mdim'].urlTemplate.replace('{TileMatrix}','0').replace('{TileRow}','0').replace('{TileCol}','0')
        try { await probeImage(url); return [item.title, result('connected','NASA Mars Trek tile loaded in this browser; this checks one sample tile only.',false)] }
        catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'NASA Mars Trek tile could not be loaded.',true)] }
      }
      if (item.title === 'MOLA shaded relief' || item.title === 'CTX mosaic (beta)') {
        const source = item.title === 'CTX mosaic (beta)' ? IMAGERY_SOURCES['ctx-mosaic'] : IMAGERY_SOURCES['mola-shade']
        const url = source.providerKind === 'url-template'
          ? source.urlTemplate.replace('{z}','0').replace('{y}','0').replace('{x}','0')
          : source.urlTemplate.replace('{TileMatrix}','0').replace('{TileRow}','0').replace('{TileCol}','0')
        try { await probeImage(url); return [item.title, result('connected','One sample tile loaded in this browser; this does not verify full-map coverage or alignment.',false)] }
        catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'Sample imagery tile could not be loaded.',true)] }
      }
      if (item.title === 'MOLA topography') {
        if (!backendAvailable) return [item.title, backendUnavailable()]
        try {
          const { response, data } = await fetchServiceJson('/api/v1/datasets/mola/processed')
          if (!response.ok) return [item.title, result('demo',`MOLA processing endpoint responded HTTP ${response.status}; no processed local run is available. Demo examples remain separate.`,true)]
          const runs = data && typeof data === 'object' && 'runs' in data && Array.isArray(data.runs) ? data.runs.length : 0
          return [item.title, runs ? result('connected',`${runs} locally processed MOLA run(s) found.`,false) : result('demo','Endpoint responded, but no processed MOLA run was found. Demo examples remain separate.',true)]
        } catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'MOLA processing endpoint failed.',true)] }
      }
      if (item.title.startsWith('NASA PDS:')) {
        if (!backendAvailable) return [item.title, backendUnavailable()]
        try {
          const params = new URLSearchParams({ latitude_deg:String(queryLat), longitude_deg:String(queryLon), radius_km:dataProfile.searchRadiusKm || '25' })
          const { response, data } = await fetchServiceJson(`/api/v1/science/products?${params}`, 35_000)
          if (!response.ok) return [item.title, result('unavailable',`PDS product search returned HTTP ${response.status}. A local demo example may be shown on the science pages.`,true)]
          const items = data && typeof data === 'object' && 'items' in data && Array.isArray(data.items) ? data.items as Array<{status?:string;product_count?:number}> : []
          const unreachable = items.filter((entry) => entry.status === 'source-unreachable' || entry.status === 'source-error').length
          const products = items.reduce((sum, entry) => sum + (entry.product_count ?? 0), 0)
          const locationNote = usingSampleLocation ? ' Query used the labelled Gale Crater demo coordinate.' : ' Query used the mission profile coordinates.'
          if (unreachable === items.length && items.length) return [item.title, result('unavailable',`NASA PDS archive services could not be reached.${locationNote}`,true)]
          return [item.title, result(unreachable ? 'connected-with-limits' : 'connected',`PDS search responded: ${products} matching products across ${items.length} archive searches.${locationNote} Zero matches means no coverage for this query, not a service failure.`,false)]
        } catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'PDS search failed.',true)] }
      }
      if (item.title === 'JPL Horizons') {
        if (!backendAvailable) return [item.title, backendUnavailable()]
        try {
          const params = new URLSearchParams({ target:'mars', center:'sun', epoch:dataProfile.epochUtc || new Date().toISOString() })
          const { response, data } = await fetchServiceJson(`/api/v1/solar-system/positions?${params}`)
          if (!response.ok) return [item.title, result('unavailable',`Horizons position endpoint returned HTTP ${response.status}. A simulated ephemeris demo remains available.`,true)]
          const tracks = data && typeof data === 'object' && 'tracks' in data && Array.isArray(data.tracks) ? data.tracks as Array<{status?:string;error?:string}> : []
          const track = tracks[0]
          if (track?.status === 'unavailable') return [item.title, result('unavailable',`Backend responded, but JPL Horizons is unavailable: ${track.error ?? 'no ephemeris returned'}. Simulated demo positions are separate.`,true)]
          return [item.title, result('connected',`Horizons returned a ${track?.status ?? 'successful'} Mars ephemeris for the requested epoch.`,false)]
        } catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'Horizons check failed.',true)] }
      }
      if (item.title === 'AI4MARS') {
        if (!backendAvailable) return [item.title, backendUnavailable()]
        try {
          const { response } = await fetchServiceJson('/api/v1/ai/status')
          if (!response.ok) return [item.title, result('unavailable',`AI readiness endpoint returned HTTP ${response.status}; no model prediction is available.`,true)]
          return [item.title, result('connected-with-limits','AI readiness endpoint responded. This confirms API status only; no validated AI4MARS model is installed for predictions.',true)]
        } catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'AI readiness check failed.',true)] }
      }
      if (item.title === 'Additional atmosphere and instrument sources') {
        if (!backendAvailable) return [item.title, backendUnavailable()]
        try {
          const { response } = await fetchServiceJson('/api/v1/datasets/meda')
          const meda = await fetchServiceJson('/api/v1/science/meda/index')
          const medaReady = meda.response.ok
          return [item.title, result('catalogued',`Dataset catalog API ${response.ok ? 'responded' : `returned HTTP ${response.status}`}; MEDA local index ${medaReady ? 'is available' : `is not ingested (HTTP ${meda.response.status})`}. MCD, MARCI, MCS, and RAD do not have live measurement checks connected; their examples remain demo/catalogue only.`,true)]
        } catch (error) { return [item.title, result('unavailable',error instanceof Error ? error.message : 'Dataset catalogue check failed.',true)] }
      }
      return [item.title, result('catalogued','No live service check is implemented for this source. Catalogue/demo information is shown separately.',true)]
    }))
    setServiceChecks(Object.fromEntries(results))
    setCheckingServices(false)
  }

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => { setPreferences((current) => ({ ...current, [key]: value })); setSaved(false) }
  const updateProfile = <K extends keyof DataProfile>(key: K, value: DataProfile[K]) => { setDataProfile((current) => ({ ...current, [key]: value })); setSaved(false) }

  return <main className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-mono text-[10px] tracking-[.25em] text-gold uppercase">MARSCOPE · Mission configuration</p><h1 className="mt-2 text-2xl font-semibold text-sand">Settings</h1><p className="mt-1 max-w-3xl text-sm text-muted">Set display preferences and prepare the mission, location, and science-source context for exploration.</p></div>
      <button type="button" onClick={demo ? reset : loadSample} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${demo ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line text-sand hover:bg-panel-alt'}`}><Sparkles size={14}/>{demo ? 'Exit sample settings' : 'Load sample settings'}</button>
    </header>

    {demo ? <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-warn">SAMPLE MISSION PROFILE · Ares IV and Gale Crater are demonstration settings. They remain local to this browser and do not request NASA products or connect mission telemetry.</p> : null}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,.8fr)]">
      <section className="space-y-4 rounded-2xl border border-line bg-panel/80 p-4 md:p-5">
        <div className="flex items-center gap-2"><Settings2 size={16} className="text-gold"/><h2 className="text-sm font-semibold text-sand">Display and map preferences</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] text-muted">Distance and measurement units<select className={inputClass} value={preferences.units} onChange={(event) => update('units', event.target.value as Preferences['units'])}><option value="metric">Metric (km, m, °C)</option><option value="imperial">Imperial (mi, ft, °F)</option></select></label>
          <label className="text-[10px] text-muted">Latitude convention<select className={inputClass} value={preferences.latitudeConvention} onChange={(event) => update('latitudeConvention', event.target.value as Preferences['latitudeConvention'])}><option value="planetocentric">Planetocentric</option><option value="geodetic">Geodetic</option></select></label>
          <label className="text-[10px] text-muted">Longitude convention<select className={inputClass} value={preferences.longitudeConvention} onChange={(event) => update('longitudeConvention', event.target.value as Preferences['longitudeConvention'])}><option value="positive-east">Positive east</option><option value="positive-west">Positive west</option></select></label>
        </div>
        <div className="space-y-2 border-t border-line pt-3">
          {([["showFeatureLabels","Show named Mars features"],["compactDataPanels","Use compact data panels"],["notifications","Enable in-app status notices"]] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-void/40 p-3 text-xs text-sand"><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={(event) => update(key, event.target.checked)} className="h-4 w-4 accent-[#d6a84f]"/></label>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><button type="button" onClick={save} disabled={demo} className="inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-void disabled:opacity-50"><Save size={13}/>Save preferences</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-sand"><RotateCcw size={13}/>Reset</button>{saved ? <span role="status" className="inline-flex items-center gap-1 text-[10px] text-ok"><Check size={12}/>Saved in this browser</span> : null}</div>
        {storageError ? <p role="alert" className="text-[10px] text-warn">{storageError}</p> : <p className="text-[9px] leading-relaxed text-muted">Preferences are saved in this browser only. Coordinate choices here describe display preferences; they do not convert imported mission coordinates or change map calculations.</p>}
      </section>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-line bg-panel/80 p-4"><div className="flex items-center gap-2"><Globe2 size={15} className="text-gold"/><h2 className="text-sm font-semibold text-sand">Mission and data request</h2></div>
          <label className="block text-[10px] text-muted">Mission name or ID<input className={inputClass} value={dataProfile.missionName} onChange={(event)=>updateProfile('missionName',event.target.value)} placeholder="e.g. Mission identifier" /></label>
          <label className="block text-[10px] text-muted">Target body<select className={inputClass} value={dataProfile.targetBody} onChange={(event)=>updateProfile('targetBody',event.target.value as DataProfile['targetBody'])}><option>Mars</option><option>Earth</option><option>Moon</option></select></label>
          <label className="block text-[10px] text-muted">Region / site<input className={inputClass} value={dataProfile.areaName} onChange={(event)=>updateProfile('areaName',event.target.value)} placeholder="Named site or search-area label" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-muted">Latitude °<input type="number" step="any" min="-90" max="90" className={inputClass} value={dataProfile.latitude} onChange={(event)=>updateProfile('latitude',event.target.value)} placeholder="Optional" /></label><label className="text-[10px] text-muted">East longitude °<input type="number" step="any" min="-180" max="360" className={inputClass} value={dataProfile.longitude} onChange={(event)=>updateProfile('longitude',event.target.value)} placeholder="Optional" /></label></div>
          <label className="block text-[10px] text-muted">Product search radius · km<input type="number" min="0.1" step="any" className={inputClass} value={dataProfile.searchRadiusKm} onChange={(event)=>updateProfile('searchRadiusKm',event.target.value)} /></label>
          <label className="block text-[10px] text-muted">Reference epoch · UTC<input type="text" className={inputClass} value={dataProfile.epochUtc} onChange={(event)=>updateProfile('epochUtc',event.target.value)} placeholder="ISO-8601, e.g. 2026-11-15T12:00:00Z" /></label>
          <label className="block text-[10px] text-muted">Position input<select className={inputClass} value={dataProfile.positionInput} onChange={(event)=>updateProfile('positionInput',event.target.value as DataProfile['positionInput'])}><option value="manual-or-imported">Manual coordinates or imported state vector</option><option value="mission-telemetry">Mission telemetry (connection required)</option></select></label>
          <fieldset className="space-y-1 border-t border-line pt-3"><legend className="pb-2 text-[10px] text-sand">Requested science sources</legend>{SOURCE_OPTIONS.map((source)=> <label key={source} className="flex items-center gap-2 py-1 text-[10px] text-muted"><input type="checkbox" checked={dataProfile.sources.includes(source)} onChange={(event)=>updateProfile('sources',event.target.checked?[...dataProfile.sources,source]:dataProfile.sources.filter((item)=>item!==source))} className="h-3.5 w-3.5 accent-[#d6a84f]"/>{source}</label>)}</fieldset>
          <label className="block text-[10px] text-muted">Known product ID (optional)<input className={inputClass} value={dataProfile.productId} onChange={(event)=>updateProfile('productId',event.target.value)} placeholder="PDS product identifier" /></label>
          <p className="rounded-lg border border-warn/25 bg-warn/5 p-2 text-[9px] leading-relaxed text-muted">This profile records the mission context and desired data only. It does not trigger a product search or configure a telemetry feed. Public NASA archives generally need no user API key; telemetry credentials must be configured securely by the mission operator.</p>
        </section>
        <section className="rounded-2xl border border-line bg-panel/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Database size={15} className="text-gold"/><h2 className="text-sm font-semibold text-sand">Data source coverage &amp; access</h2></div><button type="button" onClick={()=>void checkServices()} disabled={checkingServices} className="inline-flex items-center gap-2 rounded-lg border border-gold/35 px-3 py-2 text-[10px] text-gold disabled:opacity-50">{checkingServices?<LoaderCircle size={12} className="animate-spin"/>:<Radio size={12}/>}Check services</button></div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted">Checks query configured endpoints and sample imagery tiles. Results include the browser check time. A demo status means no connection was attempted or no live integration exists; it is not a successful connection.</p>
          <div className="mt-3 space-y-2">{SOURCE_COVERAGE.map((item) => {
            const selected = item.sources.filter((source) => dataProfile.sources.includes(source))
            const check = serviceChecks[item.title]
            const stateLabel: Record<CheckState,string> = { checking:'Checking…', connected:'Connected', 'connected-with-limits':'Connected · limits', unavailable:'Unavailable · demo fallback', demo:'Demo status', catalogued:'Catalogue only · no live source check' }
            const stateStyle = check?.state === 'connected' ? 'border-ok/35 text-ok' : check?.state === 'connected-with-limits' ? 'border-gold/35 text-gold' : check?.state === 'checking' ? 'border-line text-muted' : check ? 'border-warn/35 text-warn' : 'border-line text-muted'
            return <article key={item.title} className="rounded-lg border border-line bg-void/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xs text-sand">{item.title}</h3><p className="mt-1 font-mono text-[8px] tracking-wide text-gold uppercase">{item.access}</p></div><div className="flex flex-wrap gap-1.5"><span className={`rounded-full border px-2 py-1 font-mono text-[8px] ${selected.length ? 'border-gold/30 text-gold' : 'border-line text-muted'}`}>{item.sources.length ? selected.length ? `Selected · ${selected.length}/${item.sources.length}` : 'Not selected' : 'Core service'}</span>{check ? <span className={`rounded-full border px-2 py-1 font-mono text-[8px] ${stateStyle}`}>{stateLabel[check.state]}</span> : <span className="rounded-full border border-line px-2 py-1 font-mono text-[8px] text-muted">Not checked</span>}</div></div>
              <p className="mt-2 text-[9px] leading-relaxed text-sand/80">{item.provides}</p><p className="mt-1 text-[9px] leading-relaxed text-muted">Limit: {item.limit}</p>
              {check ? <div className="mt-2 border-t border-line pt-2"><p className="text-[9px] leading-relaxed text-muted">{check.demoFallback ? <TriangleAlert size={10} className="mr-1 inline text-warn"/> : null}{check.message}</p><p className="mt-1 font-mono text-[8px] text-muted">{check.state === 'demo' ? 'Sample status time' : 'Last checked'}: {new Date(check.checkedAt).toLocaleString()}</p></div> : null}
            </article>
          })}</div>
          <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-warn"><Globe2 size={12} className="mt-0.5 shrink-0"/>An endpoint can respond while its dataset or model is still unavailable. Demo records remain illustrative and do not replace measurements.</p>
        </section>
      </aside>
    </div>
  </main>
}
