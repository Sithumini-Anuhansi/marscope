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
