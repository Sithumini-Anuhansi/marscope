import { API_BASE_URL } from './api'
export type ResourceKind = 'oxygen'|'water'|'food'|'power'|'fuel'
export interface ResourceRecord { mission_id:string; astronaut_id:string|null; resource:ResourceKind; amount:number; reserve_amount:number; unit:string; updated_at:string; days_remaining:number|null; rate_per_day:number|null; confidence:string; assumption:string; alert:'nominal'|'low'|'shortage' }
export interface ConsumptionRecord { astronaut_id:string|null; resource:ResourceKind; amount:number; unit:string; recorded_at:string }
export interface SurvivalSummary { mission_id:string; scope_astronaut_id:string|null; resources:ResourceRecord[]; equipment:{astronaut_id:string|null;equipment_id:string;name:string;status:string;updated_at:string}[]; communications:{astronaut_id:string|null;available:boolean;updated_at:string}[]; consumption_history:ConsumptionRecord[]; alerts:{astronaut_id:string|null;resource:ResourceKind;level:string;amount:number;reserve_amount:number}[];telemetry_status:'available'|'missing';updated_at:string|null }
const base=(mission:string)=>`${API_BASE_URL}/api/v1/missions/${mission}/resources`
const headers=(id:string,role:string,token:string)=>({'Content-Type':'application/json','X-Actor-ID':id,'X-Actor-Role':role,'X-Actor-Token':token})
async function request(path:string,method:string,body:unknown,actorId:string,role:string,token:string){const response=await fetch(path,{method,headers:headers(actorId,role,token),body:JSON.stringify(body)});if(!response.ok)throw new Error((await response.json()).detail??`Resource API returned HTTP ${response.status}`);return response.json() as Promise<SurvivalSummary>}
export async function getSurvivalSummary(mission:string):Promise<SurvivalSummary>{const response=await fetch(base(mission));if(!response.ok)throw new Error(`Resource API returned HTTP ${response.status}`);return response.json() as Promise<SurvivalSummary>}
export const putInventory=(mission:string,body:unknown,id:string,role:string,token:string)=>request(`${base(mission)}/inventory`,'PUT',body,id,role,token)
export const postConsumption=(mission:string,body:unknown,id:string,role:string,token:string)=>request(`${base(mission)}/consumption`,'POST',body,id,role,token)
export const putEquipment=(mission:string,body:unknown,id:string,role:string,token:string)=>request(`${base(mission)}/equipment`,'PUT',body,id,role,token)
export const putCommunications=(mission:string,body:unknown,id:string,role:string,token:string)=>request(`${base(mission)}/communications`,'PUT',body,id,role,token)
