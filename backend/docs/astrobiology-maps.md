# Habitability and biosignature research maps

`GET /api/v1/science/astrobiology/maps` serves independently controlled research products:

- `habitability.features` maps cited **past-environment** evidence in Jezero and Gale and a regional buried-ice resource record in Utopia Planitia.
- `biosignatures.past_life.features` maps an ancient-life sample investigation context in Jezero and unresolved organic-compound and methane observations in Gale.
- `biosignatures.present_life.features` is empty until validated current-life observations can be integrated. Its status explains that missing records do not imply life is absent.
- `human_settlement.features` contains resource-context records (currently regional buried-ice context for Utopia Planitia), separate from microbial habitability. Its score is also withheld and the factor list identifies missing mission inputs.

The Mars globe's existing **Terrain assessment (MOLA)** layer remains separate. It exposes descriptive terrain metrics; there is no validated hazard classification, nor an integrated temperature, radiation, toxic-salt, or current weather stack.

Map coordinates are regional context anchors. They are not exact sample locations, instrument footprints, deposit boundaries, present-day habitability measurements, or life detections. In particular, the Utopia pin is the named Utopia Planitia feature center, not the SHARAD ice-deposit footprint.

## Habitability score

`habitability.score_0_100` is deliberately `null` and `score_status` is `unscored-incomplete-inputs-and-no-validated-weighting`. The API lists ten requested factors and their integration state. Most are absent, and current evidence mixes qualitative, site-specific and ancient observations. There is no reviewed Mars habitability scoring scale or weighting scheme in the project. The system must not convert missing data into zero, normalize the demo records, or publish a numeric score until source datasets, temporal alignment, uncertainty, and a reviewed scoring method are available.

The map controls expose habitability, past-life investigation, present-life investigation, and settlement resource context independently. These products are separate from route risk and terrain-hazard outputs.

## Sources

- [NASA Perseverance science highlights](https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/) — Jezero ancient lake/delta environment, sample context, and potential preservation settings.
- [NASA Guide to Gale Crater](https://science.nasa.gov/wp-content/uploads/2024/03/32063_AGuideToGaleCrater-ts.pdf) — ancient lake/groundwater history and qualitative mineral/chemical context.
- [NASA's 2026 Curiosity organics study summary](https://science.nasa.gov/blogs/science-news/2026/02/06/nasa-study-non-biologic-processes-dont-fully-explain-mars-organics/) — organics observed in a Gale sample; origin remains unresolved.
- [NASA JPL methane discussion](https://www.jpl.nasa.gov/news/why-is-methane-seeping-on-mars-nasa-scientists-have-new-ideas/) — episodic Curiosity methane observations at Gale and possible geological explanations.
- [NASA SHARAD Utopia Planitia summary](https://science.nasa.gov/wp-content/uploads/2023/05/NuggetUtopiaWater20170127.pdf) — regional evidence for buried subsurface ice.

## Interpretation safeguards

Organic molecules, methane, sample targets, mineralogy, and ancient aqueous environments are not individually proof of life. The Gale organic summary reports that abiotic sources considered in a follow-up study did not fully account for the reported abundance; it also states that available rover data cannot determine whether the organics were biological. The map preserves that ambiguity and emits no life probability.
