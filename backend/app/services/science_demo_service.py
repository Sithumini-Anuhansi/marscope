"""Explicitly illustrative demo records for unintegrated Mars science sources.

These fixtures are not NASA observations or model outputs. Keep them isolated
from hazard, risk, route, and scientific analysis services.
"""

from __future__ import annotations

from typing import Any

DEMO_RECORDS: list[dict[str, Any]] = [
    {
        "id": "mcd",
        "section": "atmosphere",
        "name": "Mars Climate Database",
        "mode": "DEMO ONLY — illustrative scenario",
        "sample": {"season_ls_deg": 90, "local_solar_time_hr": 14, "air_temperature_k": 218, "surface_pressure_pa": 720, "wind_speed_m_s": 5.2, "dust_scenario": "illustrative moderate-dust case"},
        "explanation": "Example-shaped fields only; not retrieved from MCD and not a forecast.",
        "source_url": "https://www-mars.lmd.jussieu.fr/mars/access",
    },
    {
        "id": "meda",
        "section": "atmosphere",
        "name": "MEDA — Perseverance site",
        "mode": "DEMO ONLY — illustrative measurement row",
        "sample": {"sol": 100, "local_time": "14:00 LMST", "air_temperature_k": 235, "pressure_pa": 730, "wind_speed_m_s": 3.1},
        "explanation": "Illustrative row only; it is not a MEDA measurement. Real archive index is available separately and contains product metadata, not these values.",
        "source_url": "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html",
    },
    {
        "id": "marci",
        "section": "environmental-hazards",
        "name": "MARCI — daily global context",
        "mode": "DEMO ONLY — illustrative map annotation",
        "sample": {"mars_sol": 1, "region": "demo tile", "annotation": "possible dust/cloud context", "image_preview": None},
        "explanation": "No MARCI image is embedded here; this is a UI example for dated global-map annotations, not an observed storm or cloud.",
        "source_url": "https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amars_mro_marci_dailyglobalmosaics_wang_2023&version=2.0",
    },
    {
        "id": "mcs",
        "section": "atmosphere",
        "name": "MCS — orbital atmosphere profile",
        "mode": "DEMO ONLY — illustrative profile row",
        "sample": {"altitude_km": 10, "temperature_k": 190, "dust_opacity": 0.25, "profile_time": "illustrative epoch"},
        "explanation": "Illustrative profile values only; not an MCS retrieval or surface-weather observation.",
        "source_url": "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/mcs.html",
    },
    {
        "id": "rad",
        "section": "environmental-hazards",
        "name": "RAD — Curiosity site radiation",
        "mode": "DEMO ONLY — illustrative instrument row",
        "sample": {"sol": 500, "dose_rate_unit": "µGy/day", "dose_rate": 180, "radiation_component": "illustrative mixed field"},
        "explanation": "Illustrative display values only; not RAD data and not a crew exposure estimate.",
        "source_url": "https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0%3ADATA",
    },
    {
        "id": "ai4mars",
        "section": "terrain",
        "name": "AI4MARS terrain labels",
        "mode": "DEMO ONLY — illustrative class summary",
        "sample": {"image_id": "DEMO-IMAGE-001", "classes": {"soil": 52, "bedrock": 23, "sand": 20, "big_rock": 5}, "unit": "illustrative percent of image pixels"},
        "explanation": "Illustrative segmentation summary only; no rover image or AI4MARS label mask is included or inferred.",
        "source_url": "https://catalog.data.gov/dataset/ai4mars-a-dataset-for-terrain-aware-autonomous-driving-on-mars",
    },
    {
        "id": "habitability-factors-demo",
        "section": "habitability",
        "name": "Habitability factor scenario H-01",
        "mode": "DEMO ONLY — synthetic factor values",
        "sample": {
            "site_label": "SIMULATED STUDY AREA — no Mars coordinate",
            "water_activity_proxy": {"value": 0.42, "unit": "illustrative unitless scale"},
            "temperature": {"value": 242, "unit": "K"},
            "pressure": {"value": 740, "unit": "Pa"},
            "radiation_dose": {"value": 0.19, "unit": "illustrative mGy/day"},
            "nutrient_availability_index": {"value": 0.68, "unit": "illustrative unitless scale"},
            "organic_compound_index": {"value": 0.31, "unit": "illustrative unitless scale"},
            "soil_ph": {"value": 7.6, "unit": "pH"},
            "perchlorate": {"value": 0.8, "unit": "illustrative wt %"},
            "chemical_energy_proxy": {"value": 0.54, "unit": "illustrative unitless scale"},
            "atmosphere": {"co2_mole_fraction": 0.953, "n2_mole_fraction": 0.027, "ar_mole_fraction": 0.016, "unit": "synthetic scenario fraction"},
            "demo_habitability_score_0_100": 72,
        },
        "explanation": "Every value and the demo score are synthetic UI fixtures. They are not measurements, sourced factors, or outputs of the habitability map; the production index remains unscored.",
        "source_url": "https://science.nasa.gov/solar-system/mars/",
    },
    {
        "id": "biosignature-categories-demo",
        "section": "biosignatures",
        "name": "Biosignature investigation scenarios B-01",
        "mode": "DEMO ONLY — synthetic candidate signals",
        "sample": {
            "site_label": "SIMULATED LAB SAMPLE — no Mars coordinate",
            "organic_molecule_pattern": {"status": "illustrative candidate; abiotic pathways not excluded"},
            "methane_observation": {"value": 4.1, "unit": "illustrative ppbv; synthetic"},
            "carbon_isotope_delta13c": {"value": -28, "unit": "illustrative per mil; synthetic"},
            "lipid_like_molecules": {"value": 12, "unit": "illustrative ng/g; synthetic"},
            "microfossil_like_structures": {"count": 2, "status": "synthetic visual candidates; unvalidated"},
            "stromatolite_like_texture": {"status": "synthetic pattern example; geological mimic possible"},
            "mineral_biosignature_context": {"status": "illustrative association only"},
            "chemical_disequilibrium": {"status": "synthetic example; no life inference"},
            "life_probability": None,
        },
        "explanation": "These synthetic examples exercise the biosignature UI. They are not Mars observations, detections, or a probability of life.",
        "source_url": "https://science.nasa.gov/astrobiology/",
    },
    {
        "id": "environmental-hazard-demo",
        "section": "environmental-hazards",
        "name": "Environmental hazard scenario E-01",
        "mode": "DEMO ONLY — synthetic conditions",
        "sample": {
            "site_label": "SIMULATED EVA TEST AREA — no Mars coordinate",
            "temperature": {"value": 208, "unit": "K; synthetic"},
            "pressure": {"value": 620, "unit": "Pa; synthetic"},
            "radiation_dose": {"value": 0.24, "unit": "illustrative mGy/day; synthetic"},
            "dust_opacity": {"value": 0.7, "unit": "illustrative tau; synthetic"},
            "perchlorate": {"value": 1.1, "unit": "illustrative wt %; synthetic"},
            "terrain_slope": {"value": 18, "unit": "degree; synthetic"},
            "demo_severity": "high — display example only",
        },
        "explanation": "Scenario values and severity are synthetic. They do not enter the hazard API, route planner, or actual location assessment.",
        "source_url": "https://science.nasa.gov/solar-system/mars/",
    },
    {
        "id": "settlement-suitability-demo",
        "section": "human-settlement",
        "name": "Human settlement scenario S-01",
        "mode": "DEMO ONLY — synthetic mission-planning scenario",
        "sample": {
            "site_label": "SIMULATED SETTLEMENT TEST AREA — no Mars coordinate",
            "buried_water_access_index": {"value": 0.55, "unit": "illustrative unitless scale"},
            "radiation_shielding_index": {"value": 0.63, "unit": "illustrative unitless scale"},
            "solar_energy_index": {"value": 0.72, "unit": "illustrative unitless scale"},
            "terrain_constructability_index": {"value": 0.48, "unit": "illustrative unitless scale"},
            "logistics_access_index": {"value": 0.39, "unit": "illustrative unitless scale"},
            "demo_suitability_score_0_100": 64,
        },
        "explanation": "This synthetic UI scenario is not a site survey, feasibility study, or operational suitability score. The real settlement layer remains unscored.",
        "source_url": "https://science.nasa.gov/solar-system/mars/",
    },
]


def get_science_demo() -> dict[str, Any]:
    """Return fixtures for interface demonstration, never for science calculations."""
    return {
        "mode": "DEMO ONLY — illustrative values; not NASA observations, measurements, or model output",
        "synthetic": True,
        "operational_use": False,
        "risk_route_hazard_inputs": False,
        "source_note": "Source links are references for the topic or dataset only; they are not the source of the synthetic values.",
        "items": [{**record, "synthetic": True, "operational_use": False} for record in DEMO_RECORDS],
    }
