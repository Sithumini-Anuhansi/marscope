export interface PlanetaryArchiveProduct {
  product_id: string | null
  dataset_id: string
  product_type: string
  observation_time?: string | null
  creation_time?: string | null
  center_latitude_deg?: number | null
  center_longitude_deg?: number | null
  minimum_latitude_deg?: number | null
  maximum_latitude_deg?: number | null
  western_longitude_deg?: number | null
  eastern_longitude_deg?: number | null
  map_scale_m_per_pixel?: number | null
  footprint_wkt?: string | null
  browse_url?: string | null
  product_url?: string | null
  product_url_label?: string | null
  product_url_kb?: string | null
  detail_url: string
}

export interface PlanetaryArchiveSource {
  id: string
  name: string
  status: 'products-found' | 'no-coverage' | 'source-error' | 'source-unreachable'
  dataset_id?: string
  product_type?: string
  data_kind?: string
  caveat?: string
  product_count: number
  products: PlanetaryArchiveProduct[]
  message?: string
  source_url: string
}

export interface PlanetaryArchiveResponse {
  provider: string
  provider_url: string
  query_location: {
    latitude_deg: number
    longitude_deg: number
    latitude_type: string
    longitude_direction: string
  }
  query_radius_km: number
  bounds: { west: number; east: number; south: number; north: number }
  query_time_utc: string
  cache_ttl_seconds: number
  items: PlanetaryArchiveSource[]
  limitations: string[]
}
