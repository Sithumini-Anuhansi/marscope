"""Evidence-separated Mars habitability and biosignature research layers.

These curated records summarize cited mission findings. They are not a global
environmental raster, a life detector, or a validated habitability model.
"""
from __future__ import annotations

from typing import Any

FACTORS = [
    {"id": "water", "label": "Water availability", "status": "regional-evidence-only"},
    {"id": "temperature", "label": "Temperature", "status": "not-integrated"},
    {"id": "pressure", "label": "Pressure", "status": "not-integrated"},
    {"id": "radiation", "label": "Radiation", "status": "site-specific-source-catalogued-values-not-integrated"},
    {"id": "nutrients", "label": "Nutrients", "status": "qualitative-site-evidence-only"},
    {"id": "organic-compounds", "label": "Organic compounds", "status": "qualitative-site-evidence-only"},
    {"id": "soil-chemistry", "label": "Soil chemistry and toxicity", "status": "not-integrated"},
    {"id": "salinity", "label": "Salinity", "status": "not-integrated"},
    {"id": "energy", "label": "Chemical or solar energy", "status": "qualitative-site-evidence-only"},
    {"id": "atmosphere", "label": "Atmospheric composition and dynamics", "status": "not-integrated"},
]


def _record(record_id: str, site: str, latitude: float, longitude: float, title: str,
            summary: str, evidence_type: str, temporal_context: str, source_url: str,
            interpretation_limit: str) -> dict[str, Any]:
    return {
        "id": record_id, "site": site,
        "coordinates": {"latitude_deg": latitude, "longitude_deg": longitude,
                        "latitude_type": "planetocentric", "longitude_direction": "positive-east",
                        "spatial_scope": "regional-context-anchor; not the footprint of an individual measurement"},
        "title": title, "summary": summary, "evidence_type": evidence_type,
        "temporal_context": temporal_context, "source_url": source_url,
        "interpretation_limit": interpretation_limit,
    }


HABITABILITY_EVIDENCE = [
    _record("jezero-ancient-lake", "Jezero Crater", 18.4446, 77.4509,
            "Ancient lake and delta environment", "Perseverance observations support an ancient lake and delta; sampled sedimentary rocks record water interaction and are considered potentially habitable environments with preservation potential.",
            "past-environment-habitability", "ancient Mars", "https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/",
            "This is evidence about an ancient environment and sample targets, not present-day surface habitability or detected life."),
    _record("gale-ancient-water-chemistry", "Gale Crater", -4.5, 137.4,
            "Ancient water, minerals, nutrients, and organics", "Curiosity investigations describe persistent lake and groundwater episodes and minerals and chemical ingredients relevant to potential microbial habitability in ancient Gale.",
            "past-environment-habitability", "ancient Mars", "https://science.nasa.gov/wp-content/uploads/2024/03/32063_AGuideToGaleCrater-ts.pdf",
            "Qualitative regional mission synthesis; this record does not provide a local numeric temperature, pressure, salinity, radiation, or habitability score."),
    _record("utopia-subsurface-ice", "Utopia Planitia", 46.7363, 117.5168,
            "Orbital evidence for buried subsurface ice", "MRO SHARAD observations support an ice-rich subsurface deposit in Utopia Planitia, with a protective regolith cover described in the cited NASA summary.",
            "subsurface-water-resource-context", "modern orbital observation of buried ice", "https://science.nasa.gov/wp-content/uploads/2023/05/NuggetUtopiaWater20170127.pdf",
            "The map pin is the named regional feature center, not the deposit footprint, an accessible water source, or evidence of liquid surface water."),
]

PAST_LIFE_INVESTIGATIONS = [
    _record("jezero-sample-investigation", "Jezero Crater", 18.4446, 77.4509,
            "Ancient-life sample investigation", "Perseverance collected samples from ancient lake and delta deposits selected for future study of organic molecules and possible chemical or textural signs of ancient life.",
            "biosignature-investigation-context", "past-life investigation; returned-sample analysis not represented here", "https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/",
            "A promising preservation setting and collected sample are not a confirmed biosignature or life detection."),
    _record("gale-organic-compounds", "Gale Crater", -4.5, 137.4,
            "Curiosity organic-compound observation", "Curiosity reported decane, undecane, and dodecane in a Gale rock sample. A 2026 NASA-reported follow-up found that the abiotic sources it evaluated did not fully account for abundance, while stating that the data cannot establish whether life was present.",
            "organic-compound-candidate; origin-unresolved", "sample analyzed 2025; follow-up study reported 2026", "https://science.nasa.gov/blogs/science-news/2026/02/06/nasa-study-non-biologic-processes-dont-fully-explain-mars-organics/",
            "Organic compounds are not proof of life. This regional anchor is not the precise sample location, and the result is not a validated biosignature."),
    _record("gale-methane-investigation", "Gale Crater", -4.5, 137.4,
            "Curiosity methane observations", "Curiosity SAM has reported trace methane near the surface at Gale with temporal variability; the source remains unresolved and geological mechanisms are among the proposed explanations.",
            "methane-observation; origin-unresolved", "episodic rover observations; not a current reading", "https://www.jpl.nasa.gov/news/why-is-methane-seeping-on-mars-nasa-scientists-have-new-ideas/",
            "Methane has biological and geological sources. It is not evidence of life by itself, and the map pin is regional context rather than a methane footprint."),
]

SETTLEMENT_EVIDENCE = [
    _record("utopia-buried-ice-resource", "Utopia Planitia", 46.7363, 117.5168,
            "Buried ice resource context", "Orbital radar evidence indicates a broad subsurface ice-rich deposit that may be relevant to future resource studies.",
            "regional-resource-context", "historical orbital observation", "https://science.nasa.gov/wp-content/uploads/2023/05/NuggetUtopiaWater20170127.pdf",
            "The ice is buried, access and extraction are unassessed, and this regional pin is not a site-selection recommendation."),
]

SETTLEMENT_FACTORS = [
    {"id": "accessible-water", "status": "regional-buried-ice-evidence; access-unassessed"},
    {"id": "radiation", "status": "no-spatially-matched-radiation-stack"},
    {"id": "temperature-pressure", "status": "no-spatially-and-temporally-matched-surface-stack"},
    {"id": "dust-weather", "status": "no-current-local-environmental-stack"},
    {"id": "terrain", "status": "historical-coarse-MOLA-only; landing-mobility-not-assessed"},
    {"id": "soil-toxicity", "status": "not-integrated"},
    {"id": "energy-and-logistics", "status": "mission-specific-model-not-integrated"},
]


def get_astrobiology_maps() -> dict[str, Any]:
    return {
        "scientific_status": "evidence-maps-available; habitability-index-unscored",
        "habitability": {
            "title": "Potential habitability evidence map",
            "score_0_100": None,
            "score_status": "unscored-incomplete-inputs-and-no-validated-weighting",
            "score_explanation": "A numeric index is withheld because the listed factors are incomplete, time-mixed or qualitative, and no reviewed scoring thresholds and weights are configured.",
            "factors": FACTORS,
            "features": HABITABILITY_EVIDENCE,
            "temporal_warning": "Most evidence describes ancient environments. It does not indicate present surface habitability or human settlement safety.",
        },
        "biosignatures": {
            "title": "Biosignature investigation map",
            "past_life": {
                "status": "published-investigation-context",
                "features": PAST_LIFE_INVESTIGATIONS,
                "assessment": "These are observations and investigation targets with unresolved biological origin; none is classified as confirmed life evidence.",
            },
            "present_life": {
                "status": "no-integrated-current-life-detection-records",
                "features": [],
                "assessment": "No validated current-life biosignature observation dataset is connected. An empty layer means missing integrated records, not evidence that life is absent.",
            },
        },
        "human_settlement": {
            "title": "Human settlement resource and risk context",
            "score_0_100": None,
            "score_status": "unscored-incomplete-inputs-and-no-validated-weighting",
            "score_explanation": "No settlement suitability score is issued without local radiation, thermal, pressure, dust, toxicity, access, mobility, and mission-logistics models.",
            "factors": SETTLEMENT_FACTORS,
            "features": SETTLEMENT_EVIDENCE,
            "warning": "A resource indicator is not proof of accessible water or a safe settlement site.",
        },
        "separation_note": "Habitability describes environmental conditions; biosignature evidence concerns possible biological origin. A score or finding in one module is never inferred from the other.",
        "source_note": "Each feature links to its primary NASA source. Coordinates are regional reference anchors, never sample or instrument footprints unless explicitly stated.",
    }
