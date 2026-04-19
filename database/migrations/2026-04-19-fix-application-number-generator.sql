-- Fix generate_application_number() to skip non-numeric suffixes
-- A row like RWB-2026-TEST01 caused CAST("TEST01" AS INTEGER) to crash for all new applications.

CREATE OR REPLACE FUNCTION public.generate_application_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    year_prefix VARCHAR(4);
    counter INTEGER;
    new_number VARCHAR(50);
BEGIN
    IF NEW.application_number IS NULL THEN
        year_prefix := EXTRACT(YEAR FROM NOW())::VARCHAR;

        SELECT COALESCE(MAX(CAST(SUBSTRING(application_number FROM 10) AS INTEGER)), 0) + 1
        INTO counter
        FROM applications
        WHERE application_number LIKE 'RWB-' || year_prefix || '-%'
          AND SUBSTRING(application_number FROM 10) ~ '^[0-9]+$';

        new_number := 'RWB-' || year_prefix || '-' || LPAD(counter::VARCHAR, 6, '0');
        NEW.application_number := new_number;
    END IF;
    RETURN NEW;
END;
$function$;
