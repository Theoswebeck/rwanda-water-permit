-- =============================================================================
-- permit_registry: historical & imported water permits
-- Run this in the Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS permit_registry (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number         integer,
  permit_holder         text            NOT NULL,
  permit_number         text            NOT NULL UNIQUE,
  regime                text,           -- Authorization, Concession, etc.
  water_source          text,
  volume_or_area        text,           -- varied formats: "114 m3/day", "24 ha"
  method_of_water_taking text,
  authorized_activity   text,
  location              text,
  latitude              double precision,
  longitude             double precision,
  issuance_date         date,
  duration              text,           -- "15 years", "10 years"
  expiration_date       date,
  status                text            DEFAULT 'OPERATIONAL',
  contact               text,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now()
);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_permit_registry_permit_number ON permit_registry (permit_number);
CREATE INDEX IF NOT EXISTS idx_permit_registry_holder        ON permit_registry USING gin (to_tsvector('english', permit_holder));
CREATE INDEX IF NOT EXISTS idx_permit_registry_location      ON permit_registry USING gin (to_tsvector('english', coalesce(location, '')));
CREATE INDEX IF NOT EXISTS idx_permit_registry_status        ON permit_registry (status);
CREATE INDEX IF NOT EXISTS idx_permit_registry_regime        ON permit_registry (regime);
CREATE INDEX IF NOT EXISTS idx_permit_registry_issuance      ON permit_registry (issuance_date);
CREATE INDEX IF NOT EXISTS idx_permit_registry_expiration    ON permit_registry (expiration_date);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_permit_registry_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_permit_registry_updated_at ON permit_registry;
CREATE TRIGGER trg_permit_registry_updated_at
  BEFORE UPDATE ON permit_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_permit_registry_updated_at();

-- RLS: all authenticated users (staff) can read
ALTER TABLE permit_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permit_registry"
  ON permit_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert/update permit_registry"
  ON permit_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
