export interface HazardMeasurement {
  value: number
  units: string
}

export interface HazardAssessment {
  assessment_id?: string
  category: string
  observation_kind: 'derived' | 'unavailable'
  severity: 'unclassified' | 'low' | 'moderate' | 'high' | 'critical'
  measurement?: HazardMeasurement
  methodology?: string
  source_dataset?: {
    dataset_id: string
    product_id: string
    source_period_utc: string[]
    resolution_km_per_cell: number
    quality: string
    uncertainty: string
  }
  classification?: {
    classification_status: string
    reason?: string
    policy_id?: string
  }
}

export interface HazardLocationResponse {
  assessment_status: 'limited-assessment' | 'insufficient-information'
  assessment_mode: string
  requested_location: {
    latitude_deg: number
    longitude_deg: number
    latitude_type: 'planetocentric'
  }
  sampled_cell?: {
    latitude_deg: number
    longitude_deg: number
    latitude_type: 'planetocentric'
    longitude_direction: 'positive-east'
    row: number
    column: number
  }
  processing_run?: string
  assessments: HazardAssessment[]
  hazard_features?: {
    type: 'FeatureCollection'
    features: unknown[]
  }
  unavailable_categories?: string[]
  message: string
}

export interface HazardServiceStatus {
  status: string
  available_categories: string[]
  unavailable_categories: string[]
  severity_policy: string
  processing_run: string | null
  message: string
}

export interface HazardRegionResponse {
  assessment_status: 'limited-assessment' | 'insufficient-information'
  assessment_mode?: string
  region?: {
    west_longitude_deg: number
    east_longitude_deg: number
    south_latitude_deg: number
    north_latitude_deg: number
    latitude_type: 'planetocentric'
    longitude_direction: 'positive-east'
  }
  processing_run?: string
  assessments: Array<{
    assessment_id?: string
    category: string
    observation_kind: 'derived' | 'unavailable'
    severity: HazardAssessment['severity']
    summary?: {
      minimum: number
      maximum: number
      mean: number
      elevation_range_m: number | null
      sample_count: number
      units: string
    }
    methodology?: string
    source_dataset?: HazardAssessment['source_dataset']
    data_quality?: string
    uncertainty?: string
    classification?: HazardAssessment['classification']
  }>
  unavailable_categories?: string[]
  message: string
}
