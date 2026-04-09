-- =============================================
-- Auto-derive map_geometry / map_status / map_purpose on every UPDATE to permit_registry
-- so the JS sync layer only needs to write lat/lng/status/activity.
-- =============================================

CREATE OR REPLACE FUNCTION public.sync_permit_registry_map_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Rebuild map_geometry whenever lat/lng are valid
  IF NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL
     AND NEW.latitude  BETWEEN -90  AND 90
     AND NEW.longitude BETWEEN -180 AND 180 THEN
    NEW.map_geometry = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;

  -- Derive map_status from status text
  NEW.map_status = CASE
    WHEN lower(trim(coalesce(NEW.status, ''))) IN ('expired')
      THEN 'expired'::permit_status
    WHEN lower(trim(coalesce(NEW.status, ''))) IN ('expiring_soon', 'expiring soon')
      THEN 'expiring_soon'::permit_status
    WHEN lower(trim(coalesce(NEW.status, ''))) IN ('suspended')
      THEN 'suspended'::permit_status
    WHEN lower(trim(coalesce(NEW.status, ''))) IN ('revoked')
      THEN 'revoked'::permit_status
    WHEN lower(trim(coalesce(NEW.status, ''))) IN ('active', 'operational', 'approved', 'valid')
      THEN 'active'::permit_status
    WHEN NEW.expiration_date IS NOT NULL AND NEW.expiration_date < current_date
      THEN 'expired'::permit_status
    ELSE COALESCE(NEW.map_status, 'active'::permit_status)
  END;

  -- Derive map_purpose from authorized_activity text
  NEW.map_purpose = CASE
    WHEN lower(NEW.authorized_activity) LIKE '%irrigation%'
      THEN 'irrigation'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%domestic%'
      THEN 'domestic'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%industrial%'
      THEN 'industrial'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%livestock%'
      THEN 'livestock'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%fish%' AND lower(NEW.authorized_activity) LIKE '%lake%'
      THEN 'fish_farming_lakes'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%fish%'
      THEN 'fish_farming_ponds'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%recreation%'
      THEN 'recreation_activities'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%electric%'
      OR lower(NEW.authorized_activity) LIKE '%hydro%'
      THEN 'electricity_generation'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%mining%'
      THEN 'mining'::water_purpose
    WHEN lower(NEW.authorized_activity) LIKE '%municipal%'
      THEN 'municipal_supply'::water_purpose
    ELSE COALESCE(NEW.map_purpose, 'other'::water_purpose)
  END;

  NEW.map_updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permit_registry_sync_map_fields ON public.permit_registry;
CREATE TRIGGER trg_permit_registry_sync_map_fields
  BEFORE UPDATE ON public.permit_registry
  FOR EACH ROW EXECUTE FUNCTION sync_permit_registry_map_fields();
