-- =============================================
-- Add map-facing fields to permit_registry
-- =============================================

ALTER TABLE public.permit_registry
  ADD COLUMN IF NOT EXISTS map_geometry geometry(Geometry, 4326),
  ADD COLUMN IF NOT EXISTS map_status permit_status,
  ADD COLUMN IF NOT EXISTS map_purpose water_purpose,
  ADD COLUMN IF NOT EXISTS map_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_permit_registry_map_geometry_gist
  ON public.permit_registry USING GIST (map_geometry);

CREATE INDEX IF NOT EXISTS idx_permit_registry_map_status
  ON public.permit_registry (map_status);

-- Backfill map fields for existing registry records.
UPDATE public.permit_registry pr
SET
  map_geometry = CASE
    WHEN pr.latitude IS NOT NULL
      AND pr.longitude IS NOT NULL
      AND pr.latitude BETWEEN -90 AND 90
      AND pr.longitude BETWEEN -180 AND 180
    THEN ST_SetSRID(ST_MakePoint(pr.longitude, pr.latitude), 4326)
    ELSE NULL
  END,
  map_status = CASE
    WHEN lower(trim(coalesce(pr.status, ''))) IN ('expired') THEN 'expired'::permit_status
    WHEN lower(trim(coalesce(pr.status, ''))) IN ('expiring_soon', 'expiring soon') THEN 'expiring_soon'::permit_status
    WHEN lower(trim(coalesce(pr.status, ''))) IN ('suspended') THEN 'suspended'::permit_status
    WHEN lower(trim(coalesce(pr.status, ''))) IN ('revoked') THEN 'revoked'::permit_status
    WHEN lower(trim(coalesce(pr.status, ''))) IN ('active', 'operational', 'approved', 'valid') THEN 'active'::permit_status
    WHEN pr.expiration_date IS NOT NULL AND pr.expiration_date < current_date THEN 'expired'::permit_status
    ELSE 'active'::permit_status
  END,
  map_purpose = 'other'::water_purpose,
  map_updated_at = now();
