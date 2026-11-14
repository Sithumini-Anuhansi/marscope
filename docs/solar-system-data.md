# Solar System Explorer data notes

## Data sources and labels

| Source | Used for | Units / frame / epoch | Refresh and limits |
| --- | --- | --- | --- |
| [NASA/JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Geometric Cartesian position and velocity vectors for the Sun, planets, Phobos, Deimos, and the Earth/Sun Mars-system context | Positions km; velocities km/s; UT input/output epoch; vectors use the ECLIPTIC reference plane, ICRF reference system, and `VEC_CORR=NONE` (geometric, no light-time correction). Solar overview targets share Sun-center `500@10`; moon system targets share Mars-center `500@499`. | Requested on page entry or refresh. Five-minute in-process backend cache; failed upstream requests may return the last cached track marked stale. No claim of continuous real-time updates. A restart clears the in-memory cache. |
| [NASA/NSSDC Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/planet_table_per.html) | Approximate static planet reference values | Units are in each field name (km, kg, days, hours, m/s², °C). No ephemeris epoch applies. | Static values shipped with this application; they are not updated by Horizons. Values are approximate and depend on definitions (e.g. rotation convention or atmospheric temperature level). |
| [NASA Mars Moons](https://science.nasa.gov/mars/moons/) and [NASA Solar System Exploration](https://science.nasa.gov/solar-system/) | Descriptive and approximate Phobos/Deimos reference data | Approximate dimensions/orbit facts; no dynamic coordinate frame. | Static reference; see linked source. |
| [NASA Image and Video Library](https://images.nasa.gov/) | Optional external imagery search link for each moon | Individual image metadata and usage terms remain on NASA’s result page. | Images are not embedded or rehosted. The local 3D marker is illustrative, not a surface texture. |
| [NASA PDS Small Bodies Node](https://sbn.psi.edu/) | Documented as a potential archive for future small-body products | Product-specific; not currently queried by this feature. | No PDS dataset is represented as loaded by the current UI. |

## Horizons query contract

The backend submits `COMMAND`, `CENTER`, `EPHEM_TYPE=VECTORS`, `TLIST` or `START_TIME`/`STOP_TIME`/`STEP_SIZE`, `TIME_TYPE=UT`, `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=KM-S`, `VEC_TABLE=2`, and `VEC_CORR=NONE`. Horizons target identifiers are configured in `backend/app/services/astronomy_service.py`: Mercury 199, Venus 299, Earth 399, Mars 499, Jupiter 599, Saturn 699, Uranus 799, Neptune 899, Phobos 401, Deimos 402, Sun 10. Planetary overview and Mars moon vectors are never mixed across centers. The solar-system diagram uses one Sun-centered trajectory set; the Mars diagram uses one Mars-centered set. Earth and Sun in the Mars view are numeric Mars-centered context vectors and are intentionally not plotted at the moon-view scale.

API routes:

- `GET /api/v1/solar-system/bodies` and `/bodies/{body_id}` return static reference metadata.
- `GET /api/v1/solar-system/positions?target=...&center=sun|mars&epoch=...` returns an epoch vector; `targets=...` batches up to eight supported body IDs.
- `GET /api/v1/solar-system/positions?targets=...&center=sun&start_time=...&stop_time=...&step_size=15%20d` returns trajectory samples.
- `GET /api/v1/solar-system/mars-system?epoch=...` returns 48 hours of moon trajectories plus same-epoch Earth and Sun context vectors.
- `GET /api/v1/solar-system/moons` and `/moons/{moon_id}` return Phobos/Deimos reference information.

The 3D overview preserves vector distance ratios using 1 scene unit per 1,000,000 km. The Mars-system map uses 1 scene unit per 500 km and omits the Sun/Earth markers because their scale would make the moon orbits unreadable. Body symbols are enlarged and are not to scale in either view. Solar paths show one year of sampled ephemerides, so outer-planet curves are partial arcs. The Mars paths show a 48-hour window; chronological samples and velocity vectors retain direction information.

## Cache and failure behavior

The backend caches each Horizons track in process memory for five minutes and retains the most recent track per target, center, trajectory mode, and sample interval. Repeated current-window trajectory requests within a five-minute bucket reuse the cached vectors and keep their original epochs visible. On an upstream error it returns the prior data as `stale` with its original epoch and age; without a prior result it reports `unavailable` with an error and an empty vector list. The frontend always displays each returned status and sample epoch. A multi-process deployment should replace this local cache with a shared TTL cache (for example Redis) so workers have consistent freshness and fallback behavior.

## Demonstration

Start the FastAPI service and Vite frontend using the repository’s existing development instructions. Open **Solar System Explorer** from the app navigation. The first view queries a one-year Sun-centered set. Select Mars or choose **Enter Mars system** to request its moon orbits, then select Phobos or Deimos for their details and NASA image-search link. Use breadcrumbs to return to the Solar System, or **Open Mars Explorer** to continue surface exploration.

No simulated or randomly generated orbital coordinates are used. If no Horizons response or cache exists, the page states that ephemerides are unavailable. Static approximate facts remain independently labeled as references.
