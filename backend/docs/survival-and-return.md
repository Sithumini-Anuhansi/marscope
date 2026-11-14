# Survival resources and return feasibility

## Resource telemetry

The survival API is mission scoped:

- `GET /api/v1/missions/{mission_id}/resources` returns mission and astronaut inventory, equipment state, communications, reserve alerts, and timestamped consumption.
- `PUT /api/v1/missions/{mission_id}/resources/inventory` records measured available amount, protected reserve, unit, owner, and observation time.
- `POST /api/v1/missions/{mission_id}/resources/consumption` records a positive consumption amount and deducts it from that inventory. Units must match and consumption cannot exceed available stock.
- `PUT /api/v1/missions/{mission_id}/resources/equipment` and `/communications` record status with timestamps.
- Mission control can read `/api/v1/missions/{mission_id}/resources/audit/events`.

Writes require `X-Actor-ID`, `X-Actor-Role`, and `X-Actor-Token`; tokens are configured in `MARSCOPE_ACTOR_TOKENS` as a JSON object mapping opaque secret tokens to actor IDs and `crew` or `mission-control` roles. Crew may update their own astronaut records. Mission control may update mission-wide records. Configure secrets outside source control and use TLS.

Apply `database/crew_tracking.sql`, then `database/survival_resources.sql`, and set `DATABASE_URL` to persist telemetry and audit events in PostgreSQL. Without a database, the API uses process memory; data is lost when the process restarts.

Low-resource status is a configurable reserve comparison: `shortage` at or below the protected reserve, `low` at or below 125% of that reserve, and `nominal` above it. These are operational flags, not certified life-support limits. Reserve thresholds must be supplied by mission operators; the service does not set physiological limits.

Endurance is estimated only after at least two measured consumption events span a positive interval. Each event after the first is treated as use since the previous timestamp. The reported rate is the summed event amount divided by elapsed time. Usable inventory is current amount minus protected reserve. The projection assumes this measured average continues, with no resupply or contingency changes. Confidence is labeled low for fewer than four observations and moderate for four or more. It is not a statistical uncertainty interval. With missing or insufficient telemetry, endurance remains unavailable; no fixed human consumption assumptions are used.

The UI's demonstration values are local, synthetic training data and are prominently labeled. They are never submitted to the API.

## Return feasibility

`POST /api/v1/missions/{mission_id}/return-assessments` accepts one to five named scenarios. Each scenario may supply return duration, available mission time, crew availability, route status, environmental risk, equipment readiness, and return-vehicle readiness. Resource inventory and measured endurance are read from the survival module. If equipment readiness is omitted, recorded equipment status is considered when available.

The service reports `feasible-under-stated-assumptions`, `feasible-with-constraints`, `high-risk`, `not-feasible-with-available-resources`, or `insufficient-information`, with factors, constraints, missing inputs, and limitations. Missing mission oxygen, water, food, or power telemetry is called out. A supplied return duration is compared only with measured resource endurance and any supplied time constraint. A supplied infeasible route, unavailable crew or vehicle, or insufficient resource endurance is a negative constraint.

Route, crew availability, environmental risk, vehicle readiness, and schedule are operator-supplied assertions. This module does not derive route safety from the route planner, establish crew readiness from location alone, or model ascent, propulsion, orbital mechanics, rendezvous, or Earth return. “Feasible” means only that supplied checks passed under stated assumptions; it is not a go/no-go recommendation, certified safety case, or trajectory result.
