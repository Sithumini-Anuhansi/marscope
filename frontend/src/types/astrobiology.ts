export interface AstrobiologyEvidenceFeature {
  id: string
  site: string
  coordinates: {
    latitude_deg: number
    longitude_deg: number
    latitude_type: 'planetocentric'
    longitude_direction: 'positive-east'
    spatial_scope: string
  }
  title: string
  summary: string
  evidence_type: string
  temporal_context: string
  source_url: string
  interpretation_limit: string
}

export interface AstrobiologyMapsResponse {
  scientific_status: string
  habitability: {
    title: string
    score_0_100: number | null
    score_status: string
    score_explanation: string
    factors: Array<{ id: string; label: string; status: string }>
    features: AstrobiologyEvidenceFeature[]
    temporal_warning: string
  }
  biosignatures: {
    title: string
    past_life: { status: string; features: AstrobiologyEvidenceFeature[]; assessment: string }
    present_life: { status: string; features: AstrobiologyEvidenceFeature[]; assessment: string }
  }
  human_settlement: {
    title: string
    score_0_100: number | null
    score_status: string
    score_explanation: string
    factors: Array<{ id: string; status: string }>
    features: AstrobiologyEvidenceFeature[]
    warning: string
  }
  separation_note: string
  source_note: string
}
