import type { CelestialBody, EphemerisTrack, EphemerisVector } from '../services/solarSystemService'

const PLANETS = [
  ['mercury','Mercury',57.9e6,88,'#a99d8b'], ['venus','Venus',108.2e6,224.7,'#e79a5d'], ['earth','Earth',149.6e6,365.25,'#62a9d8'], ['mars','Mars',227.9e6,687,'#d46144'],
  ['jupiter','Jupiter',778.6e6,4333,'#d9a576'], ['saturn','Saturn',1.434e9,10759,'#d8c48b'], ['uranus','Uranus',2.871e9,30687,'#74cbd0'], ['neptune','Neptune',4.495e9,60190,'#6282dd'],
] as const
const epoch = new Date().toISOString()
const angleFor = (period: number) => Date.now() / (period * 86400000) * Math.PI * 2
function vec(radius: number, angle: number): EphemerisVector { return { epoch, x_km: radius*Math.cos(angle), y_km: radius*Math.sin(angle), z_km: 0, vx_km_s: null, vy_km_s: null, vz_km_s: null } }
export const DEMO_BODIES: CelestialBody[] = [
  { id:'sun', name:'Sun', classification:'Star', diameter_km:1392700, dimensions_km:null, mass_kg:1.989e30, mean_distance_km:0, orbital_period_days:null, rotation_period_hours:609.12, gravity_m_s2:274, mean_surface_temperature_c:5500, atmosphere:'Hydrogen and helium', description:'Demo reference star at the coordinate origin.', discovery:'Known since antiquity', parent_id:null, reference_source:'NASA Solar System Exploration (reference facts)', value_kind:'reference' },
  ...PLANETS.map(([id,name,radius,period]) => ({ id,name,classification:'Planet',diameter_km:null,dimensions_km:null,mass_kg:null,mean_distance_km:radius,orbital_period_days:period,rotation_period_hours:null,gravity_m_s2:null,mean_surface_temperature_c:null,atmosphere:null,description:`Illustrative ${name} demo marker. Its position is an approximate circular-orbit visualization, not a measured ephemeris.`,discovery:'Reference body',parent_id:'sun',reference_source:'NASA planetary reference facts; approximate demo position',value_kind:'demo' })),
  { id:'phobos',name:'Phobos',classification:'Natural satellite',diameter_km:22.5,dimensions_km:[27,22,18],mass_kg:null,mean_distance_km:9376,orbital_period_days:0.319,rotation_period_hours:null,gravity_m_s2:null,mean_surface_temperature_c:null,atmosphere:null,description:'Demo orbit marker; approximate circular path around Mars, not a current ephemeris.',discovery:'Reference body',parent_id:'mars',reference_source:'NASA Solar System Exploration; approximate demo position',value_kind:'demo' },
  { id:'deimos',name:'Deimos',classification:'Natural satellite',diameter_km:12.4,dimensions_km:[15,12,11],mass_kg:null,mean_distance_km:23463,orbital_period_days:1.263,rotation_period_hours:null,gravity_m_s2:null,mean_surface_temperature_c:null,atmosphere:null,description:'Demo orbit marker; approximate circular path around Mars, not a current ephemeris.',discovery:'Reference body',parent_id:'mars',reference_source:'NASA Solar System Exploration; approximate demo position',value_kind:'demo' },
]
export function demoSolarTracks(): EphemerisTrack[] { return PLANETS.map(([id,,radius,period]) => { const a=angleFor(period); return { target:id,center:'sun',status:'demo',fetched_at:null,cache_age_seconds:null,error:null,vectors:[vec(radius,a),vec(radius,a+0.04),vec(radius,a+0.08)] } }) }
export function demoMarsTracks(): EphemerisTrack[] {
  const moons: EphemerisTrack[] = ['phobos','deimos'].map((target,index)=>({target,center:'mars',status:'demo',fetched_at:null,cache_age_seconds:null,error:null,vectors:Array.from({length:25},(_,i): EphemerisVector=>({epoch:new Date(Date.now()+i*2*3600000).toISOString(),x_km:(index?23463:9376)*Math.cos(i*Math.PI/12),y_km:(index?23463:9376)*Math.sin(i*Math.PI/12),z_km:0,vx_km_s:null,vy_km_s:null,vz_km_s:null}))}))
  return moons
}
export const DEMO_NEARBY_OBJECTS = [
  { id:'demo-vehicle',name:'Demo Ares transfer vehicle',x_km:demoSolarTracks().find(t=>t.target==='mars')!.vectors[0].x_km+180000,y_km:demoSolarTracks().find(t=>t.target==='mars')!.vectors[0].y_km+90000,z_km:0,color:'#f0ad58' },
  { id:'demo-object',name:'Uncatalogued demo object',x_km:demoSolarTracks().find(t=>t.target==='mars')!.vectors[0].x_km+350000,y_km:demoSolarTracks().find(t=>t.target==='mars')!.vectors[0].y_km-140000,z_km:0,color:'#c792ea' },
]
