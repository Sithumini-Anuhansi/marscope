CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS missions (id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS astronauts (
  id text PRIMARY KEY, mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  name text NOT NULL, role text NOT NULL,
  status text NOT NULL DEFAULT 'untracked' CHECK (status IN ('on-eva','in-habitat','rest','comms','stale','untracked'))
);
-- Mars 2000 positions use x=east-positive longitude, y=geodetic latitude, degrees. SRID 0 avoids assigning an Earth CRS.
CREATE TABLE IF NOT EXISTS astronaut_positions (
  id bigserial PRIMARY KEY, astronaut_id text NOT NULL REFERENCES astronauts(id) ON DELETE CASCADE,
  position geometry(Point, 0) NOT NULL,
  latitude_deg double precision NOT NULL CHECK (latitude_deg BETWEEN -90 AND 90),
  longitude_deg double precision NOT NULL CHECK (longitude_deg BETWEEN -180 AND 180),
  recorded_at timestamptz NOT NULL,
  CHECK (ST_X(position) = longitude_deg AND ST_Y(position) = latitude_deg)
);
CREATE INDEX IF NOT EXISTS astronaut_positions_astronaut_time_idx ON astronaut_positions (astronaut_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS astronaut_positions_gist_idx ON astronaut_positions USING gist (position);
INSERT INTO missions (id, name) VALUES ('ares-iv', 'Ares IV Surface Mission') ON CONFLICT (id) DO NOTHING;
INSERT INTO astronauts (id, mission_id, name, role) VALUES
  ('crew-01', 'ares-iv', 'Asha Raman', 'Commander'),
  ('crew-02', 'ares-iv', 'Mateo Silva', 'Science Officer'),
  ('crew-03', 'ares-iv', 'Nia Okafor', 'Engineer'),
  ('crew-04', 'ares-iv', 'Owen Park', 'Medical Officer')
ON CONFLICT (id) DO NOTHING;
