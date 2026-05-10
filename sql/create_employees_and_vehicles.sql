-- =============================================================================
-- employees: employee management table
-- Run this in the Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text            NOT NULL,
  email                 text            NOT NULL UNIQUE,
  employee_type         text            NOT NULL, -- Driver, Mechanic, Dispatcher, Assistant Mechanic
  vehicle_id            uuid            REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees (email);
CREATE INDEX IF NOT EXISTS idx_employees_type ON employees (employee_type);
CREATE INDEX IF NOT EXISTS idx_employees_vehicle_id ON employees (vehicle_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employees_updated_at();

-- RLS policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage employees"
  ON employees FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- vehicles: vehicle management table
-- Run this in the Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  make                  text            NOT NULL,
  model                 text            NOT NULL,
  year                  integer         NOT NULL,
  license_plate         text            NOT NULL UNIQUE,
  status                text            NOT NULL DEFAULT 'active', -- active, inactive, maintenance
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles (license_plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_vehicles_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicles_updated_at();

-- RLS policies
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage vehicles"
  ON vehicles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);