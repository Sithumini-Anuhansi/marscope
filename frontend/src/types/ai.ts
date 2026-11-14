export interface AIServiceStatus {
  status: string
  components: {
    terrain_classifier: {
      status: string
      model_version: string | null
      classes: Record<string, string>
      message: string
    }
    environmental_feature_engine: { status: string; source: string }
    risk_synthesis: { status: string; safe_unsafe_output: boolean }
    supervised_risk_model: { status: string; validated_model_available: boolean; reasons: string[] }
    unsupervised_experiments: { status: string; results_are_operational: boolean }
  }
  limitations: string[]
}

export interface TerrainClassificationResponse {
  assessment_id?: string
  assessment_status: string
  reason?: string
  terrain_classes: Array<{
    class_id: number
    class_name: string
    pixel_fraction: number
    mean_uncalibrated_softmax: number | null
  }>
  dominant_terrain_class?: string
  mask_png_base64?: string
  model_version: string | null
  probability_calibrated?: boolean
  explanation?: string
  uncertainty?: string
  georeferencing?: string
}

export interface AIRiskSynthesisResponse {
  assessment_id: string
  assessment_status: string
  overall_assessment: string
  overall_assessment_reason: string
  environmental_indicators: Array<{
    category: string
    severity: string
    measurement?: { value: number; units: string }
    methodology?: string
    source_dataset?: { product_id: string; resolution_km_per_cell: number; quality: string }
    uncertainty?: string
    classification?: { classification_status: string; reason?: string }
  }>
  terrain_classification: { status: string; risk_label_mapping: string }
  contributing_factors: Array<{ category: string; kind: string; severity: string; reference?: string; rationale?: string }>
  data_sources: unknown[]
  uncertainty: string
  missing_information: string[]
  explanation: string
}
