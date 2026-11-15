export interface NamedMarsFeature {
  id: string
  name: string
  feature_type: string | null
  diameter_km: number | null
  latitude_deg: number
  longitude_deg: number
  approval: string
}

export interface NamedMarsFeaturesResponse {
  features: NamedMarsFeature[]
  count: number
  matches_in_view: number
  truncated: boolean
  source: {
    organization: string
    page: string
    dataset_url: string
    coordinate_system: string
    endorsement: string
  }
}
