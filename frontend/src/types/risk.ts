export type RiskFeatureName =
  | 'terrain_slope'
  | 'surface_roughness'
  | 'elevation_variation'
  | 'temperature'
  | 'wind_speed'
  | 'dust_opacity'

export interface RiskFeatureInput {
  value: number
  units: string
  source_dataset: string
  source_product_id?: string
  observation_period_start: string
  observation_period_end: string
  resolution_km: number
}

export interface RiskAssessmentRequest {
  latitude_deg: number
  longitude_deg: number
  latitude_type: 'planetocentric'
  longitude_direction: 'positive-east'
  features: Partial<Record<RiskFeatureName, RiskFeatureInput>>
}

export interface RiskServiceStatus {
  status: string
  validated_model_available: boolean
  model_version: string | null
  model_artifacts_found: number
  rule_based_baseline: string
  available_input_features: string[]
  additional_possible_features: string[]
  active_model_features?: string[]
  score_available: boolean
  confidence_available: boolean
  reasons: string[]
  model_manifests_are_not_loaded: boolean
}

export interface RiskAssessmentResult {
  assessment_id: string
  assessment_status: 'unavailable' | 'rule-based-limited' | 'model-prediction-limited'
  location: {
    latitude_deg: number
    longitude_deg: number
    latitude_type: 'planetocentric'
    longitude_direction: 'positive-east'
  }
  method: string
  risk_classification: string
  classification_status: string
  risk_score: number | null
  risk_score_meaning: string | null
  score_unavailable_reason: string
  contributing_features: Array<{
    feature: string
    value: number
    units: string
    rule?: { comparison: string; threshold: number; units: string }
    reference?: string
    rationale?: string
  }>
  model_feature_importance?: Array<{
    feature: string
    mean_f1_drop: number
    std: number
  }>
  feature_inputs: Array<{
    feature: string
    value: number
    units: string
    source_dataset: string
    source_product_id: string | null
    observation_period_utc: string[]
    resolution_km: number
    input_status: string
    rule_classification: { severity?: string; classification_status: string }
  }>
  feature_location_status: string
  explanation: string
  model_version: string | null
  confidence: number | null
  uncertainty: string
  missing_inputs: string[]
  policy_id: string | null
  policy_reference: string | null
  survival_or_mission_success_probability: null
  persistence: string
}
