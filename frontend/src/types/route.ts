export interface MarsRoutePoint {
  latitude_deg: number
  longitude_deg: number
  latitude_type: 'planetocentric'
  longitude_direction: 'positive-east'
}

export type RouteGeometry =
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'MultiLineString'; coordinates: [number, number][][] }

export interface RouteCandidate {
  route_id: string
  objective: string
  astronaut_id: string | null
  snapped_start: { longitude_deg: number; latitude_deg: number }
  snapped_destination: { longitude_deg: number; latitude_deg: number }
  geometry: RouteGeometry
  distance_km: number
  estimated_traversal_cost: string
  cost_value: number
  terrain_summary: {
    maximum_slope_deg: number
    mean_slope_deg: number
    maximum_roughness_m: number
    mean_roughness_m: number
  }
  encountered_hazards: Array<{ latitude_deg: number; longitude_deg: number; severity: string }>
  risk_summary: string
  waypoint_count: number
}

export interface RoutePlanResponse {
  route_request_id: string
  status: 'unavailable' | 'limited-assessment'
  recommended_route: RouteCandidate | null
  alternative_routes: RouteCandidate[]
  source: {
    dataset_id: string
    product_id: string
    processing_run: string
    source_period_utc: string[] | null
    cell_resolution_km: number
    quality: string
  } | null
  missing_information: string[]
  risk_summary: string
  travel_time: null
  assumptions: string[]
  policy_id?: string | null
}

export interface RoutePlannerStatus {
  status: string
  source: {
    dataset_id: string
    product_id: string
    cell_resolution_km: number
    processing_run: string
  } | null
  route_generation?: string
  hazards?: string
  warning?: string
  message?: string
}
