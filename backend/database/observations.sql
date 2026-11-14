CREATE TABLE IF NOT EXISTS mission_observations (
  id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  astronaut_id text NOT NULL REFERENCES astronauts(id),
  category text NOT NULL CHECK (category IN ('danger','shelter','water-ice','resource','discovery','obstacle','other')),
  description text NOT NULL,
  -- Mars 2000 degrees: x=east-positive longitude, y=geodetic latitude; SRID 0 avoids Earth CRS assumptions.
  position geometry(Point, 0) NOT NULL,
  latitude_deg double precision NOT NULL CHECK (latitude_deg BETWEEN -90 AND 90),
  longitude_deg double precision NOT NULL CHECK (longitude_deg BETWEEN -180 AND 180),
  submitted_at timestamptz NOT NULL,
  severity text,
  image_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','under-review','verified','rejected')),
  supporting_evidence text,
  CHECK (ST_X(position) = longitude_deg AND ST_Y(position) = latitude_deg)
);
CREATE INDEX IF NOT EXISTS mission_observations_mission_time_idx ON mission_observations (mission_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS mission_observations_category_idx ON mission_observations (mission_id, category);
CREATE INDEX IF NOT EXISTS mission_observations_astronaut_idx ON mission_observations (mission_id, astronaut_id);
CREATE INDEX IF NOT EXISTS mission_observations_position_idx ON mission_observations USING gist (position);

CREATE TABLE IF NOT EXISTS observation_audit (
  id bigserial PRIMARY KEY,
  observation_id text NOT NULL,
  mission_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  actor_id text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS observation_audit_mission_time_idx ON observation_audit (mission_id, occurred_at DESC);
