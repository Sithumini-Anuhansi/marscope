CREATE TABLE IF NOT EXISTS mission_resource_inventory (
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  astronaut_id text NOT NULL DEFAULT '',
  resource text NOT NULL CHECK(resource IN ('oxygen','water','food','power','fuel')),
  amount double precision NOT NULL CHECK(amount >= 0),
  reserve_amount double precision NOT NULL CHECK(reserve_amount >= 0 AND reserve_amount <= amount),
  unit text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(mission_id,astronaut_id,resource)
);
CREATE TABLE IF NOT EXISTS resource_consumption (
  id bigserial PRIMARY KEY,
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  astronaut_id text NOT NULL DEFAULT '',
  resource text NOT NULL CHECK(resource IN ('oxygen','water','food','power','fuel')),
  amount double precision NOT NULL CHECK(amount > 0),
  unit text NOT NULL,
  recorded_at timestamptz NOT NULL,
  actor_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS resource_consumption_history_idx ON resource_consumption(mission_id,astronaut_id,resource,recorded_at);
CREATE TABLE IF NOT EXISTS mission_equipment (
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  astronaut_id text NOT NULL DEFAULT '',
  equipment_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK(status IN ('operational','degraded','failed','unknown')),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(mission_id,astronaut_id,equipment_id)
);
CREATE TABLE IF NOT EXISTS mission_comms_status (
  mission_id text NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  astronaut_id text NOT NULL DEFAULT '',
  available boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(mission_id,astronaut_id)
);
CREATE TABLE IF NOT EXISTS resource_audit (
  id bigserial PRIMARY KEY,
  mission_id text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  detail jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);
