-- Production schema (public), structure only — no data, no secrets. Used by scripts/dev-db.mjs
-- when the RWB server is unreachable. Refresh: pg_dump --schema-only -n public (see runbook §12.10).
-- RWB Water Permit — production schema (public), schema-only, no data
-- Source: 10.10.82.199 / waterpermit (PostgreSQL 14.23), dumped 2026-09-25 as rwb_it_readonly
--
-- PostgreSQL database dump
--


-- Dumped from database version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type AS ENUM (
    'individual',
    'company',
    'cooperative',
    'organization',
    'institution',
    'ngo_association'
);


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.application_status AS ENUM (
    'draft',
    'pending_payment',
    'submitted',
    'under_review',
    'pending_inspection',
    'approved',
    'rejected',
    'revision_required',
    'cancelled',
    'approved_pending_permit',
    'pending_final_approval',
    'pending_assessment',
    'expired',
    'pending_review',
    'pending_verification',
    'returned_to_assessment',
    'returned_to_review',
    'returned_to_verification',
    'terminated',
    'closed_incomplete'
);


--
-- Name: application_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.application_type AS ENUM (
    'domestic',
    'industrial',
    'agricultural',
    'commercial',
    'municipal',
    'mining_water_use',
    'transfer',
    'modification',
    'new',
    'renewal'
);


--
-- Name: assessment_result_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_result_enum AS ENUM (
    'passed',
    'failed',
    'conditional'
);


--
-- Name: assessment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_status_enum AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: assessment_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_type_enum AS ENUM (
    'initial',
    'follow_up',
    'annual',
    'complaint',
    'renewal'
);


--
-- Name: audit_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_entity_type AS ENUM (
    'user',
    'application',
    'permit',
    'inspection',
    'review',
    'assessment',
    'document',
    'payment',
    'system'
);


--
-- Name: audit_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_severity AS ENUM (
    'info',
    'warning',
    'critical'
);


--
-- Name: audit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_status AS ENUM (
    'success',
    'failed'
);


--
-- Name: delegatable_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delegatable_role AS ENUM (
    'reviewer',
    'verifier',
    'approver',
    'assessor',
    'inspector'
);


--
-- Name: delegation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delegation_status AS ENUM (
    'active',
    'revoked',
    'expired'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'payment_proof',
    'identification_doc',
    'land_ownership_doc',
    'technical_drawings',
    'environmental_impact_doc',
    'intake_discharge_map',
    'water_quality_report',
    'geological_survey',
    'business_license',
    'other',
    'land_access_doc',
    'renewal_request_letter',
    'transfer_application_letter',
    'signed_transfer_form',
    'registration_certificate',
    'existing_permit_copy',
    'certified_letter'
);


--
-- Name: id_document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.id_document_type AS ENUM (
    'national_id',
    'tin_number'
);


--
-- Name: id_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.id_type AS ENUM (
    'national_id',
    'tin'
);


--
-- Name: inspection_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inspection_result AS ENUM (
    'passed',
    'failed',
    'conditional'
);


--
-- Name: inspection_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inspection_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: inspection_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inspection_type AS ENUM (
    'initial',
    'follow_up',
    'annual',
    'complaint',
    'renewal'
);


--
-- Name: land_ownership_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.land_ownership_status AS ENUM (
    'own_all_land',
    'recorded_easement',
    'written_consent',
    'lease_agreement',
    'access_pending'
);


--
-- Name: payment_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_channel AS ENUM (
    'mtn_momo',
    'airtel_money',
    'visa',
    'mastercard',
    'amex',
    'bank_of_kigali',
    'equity_bank',
    'im_bank',
    'cogebanque',
    'other'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'mobile_money',
    'card',
    'bank_transfer',
    'ussd',
    'cash'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'refunded'
);


--
-- Name: permit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permit_status AS ENUM (
    'active',
    'expired',
    'expiring_soon',
    'suspended',
    'revoked'
);


--
-- Name: province_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.province_type AS ENUM (
    'Kigali',
    'Northern',
    'Southern',
    'Eastern',
    'Western'
);


--
-- Name: recommendation_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recommendation_type AS ENUM (
    'approve',
    'reject',
    'require_revision',
    'require_inspection'
);


--
-- Name: risk_assessment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_assessment AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: sla_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sla_status AS ENUM (
    'on_time',
    'due_soon',
    'overdue'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'applicant',
    'reviewer',
    'inspector',
    'admin',
    'approver',
    'assessor',
    'verifier'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'verified',
    'rejected'
);


--
-- Name: water_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.water_purpose AS ENUM (
    'domestic',
    'irrigation',
    'industrial',
    'livestock',
    'fish_farming_lakes',
    'fish_farming_ponds',
    'recreation_activities',
    'recreation',
    'electricity_generation',
    'mining',
    'municipal_supply',
    'other',
    'water_supply',
    'coffee_washing',
    'gaz_extraction',
    'construction_of_dam',
    'construction_of_infrastructures',
    'navigation',
    'port_construction',
    'other_concession'
);


--
-- Name: water_reliability; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.water_reliability AS ENUM (
    'always_available',
    'frequently_dry',
    'seasonal_dry'
);


--
-- Name: water_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.water_source_type AS ENUM (
    'borehole',
    'surface_water',
    'river',
    'groundwater',
    'lake',
    'spring',
    'other',
    'dam',
    'stream',
    'swamp',
    'reservoir',
    'wetland',
    'hydropower_source'
);


--
-- Name: webhook_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.webhook_event_type AS ENUM (
    'payment.initiated',
    'payment.processing',
    'payment.success',
    'payment.failed',
    'payment.cancelled',
    'payment.refunded'
);


--
-- Name: cleanup_expired_phone_verifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_phone_verifications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    -- Update expired verification codes in users table
    UPDATE users 
    SET 
        phone_verification_code = NULL,
        phone_verification_expires_at = NULL
    WHERE phone_verification_expires_at IS NOT NULL 
        AND phone_verification_expires_at < NOW();
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    -- Update expired verification logs
    UPDATE phone_verification_logs 
    SET status = 'expired'
    WHERE status = 'sent' 
        AND expires_at < NOW();
    
    RETURN cleaned_count;
END;
$$;


--
-- Name: copy_coordinates_to_permit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.copy_coordinates_to_permit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Copy coordinates from the associated application (any valid geometry type)
    UPDATE public.permits 
    SET coordinates = (
        SELECT coordinates 
        FROM public.applications 
        WHERE id = NEW.application_id
        AND coordinates IS NOT NULL
        AND ST_IsValid(coordinates)
    )
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$;


--
-- Name: create_email_verification_code(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_email_verification_code(p_email text, p_purpose text DEFAULT 'signup'::text, p_ttl_minutes integer DEFAULT 15) RETURNS TABLE(out_id uuid, out_email text, out_code text, out_purpose text, out_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Invalidate prior active codes for same email/purpose
  UPDATE public.email_verification_codes evc
     SET consumed_at = NOW(), updated_at = NOW()
   WHERE evc.email = LOWER(p_email)
     AND evc.purpose = p_purpose
     AND evc.consumed_at IS NULL;

  -- Generate 6-digit code
  v_code := LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');

  -- Return the inserted row
  RETURN QUERY
  INSERT INTO public.email_verification_codes(email, code, purpose, expires_at)
  VALUES (LOWER(p_email), v_code, p_purpose, NOW() + MAKE_INTERVAL(mins => p_ttl_minutes))
  RETURNING public.email_verification_codes.id,
            public.email_verification_codes.email,
            public.email_verification_codes.code,
            public.email_verification_codes.purpose,
            public.email_verification_codes.expires_at;
END;
$$;


--
-- Name: create_polygon_from_coordinates(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_polygon_from_coordinates(coord_array jsonb) RETURNS public.geometry
    LANGUAGE plpgsql
    AS $$
DECLARE
    wkt_string TEXT;
    coord_item JSONB;
    lat FLOAT;
    lng FLOAT;
    point_count INTEGER := 0;
    points_array TEXT[] := '{}';
BEGIN
    -- Validate input
    IF coord_array IS NULL OR jsonb_array_length(coord_array) = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Build array of coordinate pairs
    FOR coord_item IN SELECT value FROM jsonb_array_elements(coord_array)
    LOOP
        -- Extract and validate lat/lng
        lat := (coord_item->>'latitude')::FLOAT;
        lng := (coord_item->>'longitude')::FLOAT;
        
        -- Skip invalid coordinates
        IF lat IS NULL OR lng IS NULL OR 
           lat < -90 OR lat > 90 OR 
           lng < -180 OR lng > 180 THEN
            CONTINUE;
        END IF;
        
        -- Add point to array (PostGIS uses lng lat order)
        points_array := array_append(points_array, lng::TEXT || ' ' || lat::TEXT);
        point_count := point_count + 1;
    END LOOP;
    
    -- Need exactly 5 points for our polygon requirement
    IF point_count != 5 THEN
        RETURN NULL;
    END IF;
    
    -- Close the polygon by adding the first point at the end
    points_array := array_append(points_array, points_array[1]);
    
    -- Build WKT string
    wkt_string := 'POLYGON((' || array_to_string(points_array, ',') || '))';
    
    -- Return as PostGIS geometry with SRID 4326 (WGS84)
    RETURN ST_GeomFromText(wkt_string, 4326);
    
EXCEPTION WHEN OTHERS THEN
    -- Return NULL on any error
    RETURN NULL;
END;
$$;


--
-- Name: expire_ended_delegations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_ended_delegations() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE role_delegations
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date < NOW();
END;
$$;


--
-- Name: expire_old_applications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_applications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE applications a
    SET status = 'expired',
        updated_at = NOW()
    WHERE
      a.submitted_at IS NOT NULL
      AND COALESCE(a.expires_at, a.submitted_at + INTERVAL '6 months') <= NOW()
      AND a.status NOT IN ('approved', 'rejected', 'cancelled', 'expired')
      AND NOT EXISTS (
        SELECT 1 FROM permits p WHERE p.application_id = a.id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;


--
-- Name: generate_application_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_application_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
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
$_$;


--
-- Name: generate_assessment_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_assessment_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  year_suffix TEXT;
  seq_val BIGINT;
BEGIN
  IF NEW.assessment_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  seq_val := NEXTVAL('assessment_number_seq');
  NEW.assessment_number := 'TA-' || year_suffix || '-' || LPAD(seq_val::TEXT, 6, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_permit_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_permit_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_year INTEGER;
  counter      INTEGER;
BEGIN
  IF NEW.permit_number IS NULL THEN
    current_year := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Kigali')::INTEGER;

    INSERT INTO public.permit_number_counters (year, last_issued)
    VALUES (current_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_issued = permit_number_counters.last_issued + 1
    RETURNING last_issued INTO counter;

    IF counter IS NULL THEN
      RAISE EXCEPTION 'permit_number_counters: failed to obtain counter for year %', current_year;
    END IF;

    NEW.permit_number := LPAD(counter::TEXT, 4, '0') || '/RWB/' || current_year;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_verification_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_verification_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
END;
$$;


--
-- Name: get_active_delegations_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_delegations_for_user(user_uuid uuid) RETURNS TABLE(delegation_id uuid, delegator_id uuid, delegated_role public.delegatable_role, start_date timestamp with time zone, end_date timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- First, expire any ended delegations
    PERFORM expire_ended_delegations();
    
    RETURN QUERY
    SELECT 
        rd.id as delegation_id,
        rd.delegator_id,
        rd.delegated_role,
        rd.start_date,
        rd.end_date
    FROM role_delegations rd
    WHERE rd.delegate_id = user_uuid
      AND rd.status = 'active'
      AND rd.start_date <= NOW()
      AND (rd.end_date IS NULL OR rd.end_date > NOW());
END;
$$;


--
-- Name: get_approved_permit_polygons(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_approved_permit_polygons() RETURNS TABLE(permit_id uuid, permit_number character varying, project_title character varying, coordinates_geojson jsonb, status public.permit_status, issued_date date, expiry_date date)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.permit_number,
        a.project_title,
        ST_AsGeoJSON(p.coordinates)::JSONB as coordinates_geojson,
        p.status,
        p.issued_date,
        p.expiry_date
    FROM public.permits p
    JOIN public.applications a ON p.application_id = a.id
    WHERE p.coordinates IS NOT NULL
    AND ST_IsValid(p.coordinates)
    ORDER BY p.issued_date DESC;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    existing_user UUID;
BEGIN
    -- Check if user already exists
    SELECT id INTO existing_user FROM public.users WHERE id = NEW.id LIMIT 1;
    
    IF existing_user IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    -- Insert new user
    BEGIN
        INSERT INTO public.users (
            id, 
            email, 
            role, 
            status, 
            account_type,
            first_name,
            last_name,
            company_name,
            company_tin, 
            company_address,
            company_phone,
            applications_count, 
            reviews_count, 
            inspections_count,
            profile_completed,
            created_at, 
            updated_at
        ) VALUES (
            NEW.id, 
            NEW.email, 
            'applicant', 
            'active', 
            'individual',
            'User',
            'Profile',
            NULL,
            NULL,
            NULL,
            NULL,
            0, 
            0, 
            0,
            FALSE,
            NOW(), 
            NOW()
        );
    EXCEPTION
        WHEN unique_violation THEN
            NULL;
        WHEN OTHERS THEN
            RAISE LOG 'handle_new_user error: %', SQLERRM;
    END;
    
    RETURN NEW;
END;
$$;


--
-- Name: has_active_delegation(uuid, public.delegatable_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_active_delegation(user_uuid uuid, check_role public.delegatable_role) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    has_delegation BOOLEAN;
BEGIN
    -- First, expire any ended delegations
    PERFORM expire_ended_delegations();
    
    SELECT EXISTS (
        SELECT 1
        FROM role_delegations rd
        WHERE rd.delegate_id = user_uuid
          AND rd.delegated_role = check_role
          AND rd.status = 'active'
          AND rd.start_date <= NOW()
          AND (rd.end_date IS NULL OR rd.end_date > NOW())
    ) INTO has_delegation;
    
    RETURN has_delegation;
END;
$$;


--
-- Name: increment_quarterly_permits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_quarterly_permits() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_year INTEGER;
    current_quarter INTEGER;
    quarter_string VARCHAR(7);
BEGIN
    current_year := EXTRACT(year FROM NOW())::INTEGER;
    current_quarter := EXTRACT(quarter FROM NOW())::INTEGER;
    quarter_string := current_year || '-Q' || current_quarter;
    
    INSERT INTO quarterly_permit_stats (year, quarter_num, quarter, permits_issued)
    VALUES (
        current_year, 
        current_quarter,
        quarter_string,
        1
    )
    ON CONFLICT (year, quarter_num) 
    DO UPDATE SET 
        permits_issued = quarterly_permit_stats.permits_issued + 1,
        updated_at = NOW();
END;
$$;


--
-- Name: log_application_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_application_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.workflow_history (
      application_id,
      user_id,
      from_status,
      to_status,
      action,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      NULL::uuid,  -- May be NULL for service role operations
      OLD.status::text,
      NEW.status::text,
      'status_change',
      NULL,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: log_email_verification_attempt(uuid, text, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_email_verification_attempt(user_uuid uuid, user_email text, verification_type text DEFAULT 'signup'::text, user_ip inet DEFAULT NULL::inet, user_agent_string text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO email_verification_logs (
        user_id,
        email,
        verification_type,
        token_sent,
        sent_at,
        ip_address,
        user_agent
    )
    VALUES (
        user_uuid,
        user_email,
        verification_type,
        true,
        NOW(),
        user_ip,
        user_agent_string
    )
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;


--
-- Name: log_inspection_workflow_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_inspection_workflow_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) THEN
    INSERT INTO public.inspection_workflow_history (
      inspection_id,
      user_id,
      from_status,
      to_status,
      action,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      NULL,
      OLD.workflow_status,
      NEW.workflow_status,
      'status_change',
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: log_permit_change_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_permit_change_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  k TEXT;
  ignored_keys TEXT[] := ARRAY[
    'updated_at',
    'created_at',
    'modification_count',
    'last_modified_at',
    'last_modified_by'
  ];
  changed_fields TEXT[] := ARRAY[]::TEXT[];
  diff JSONB := '{}'::JSONB;
  event_type TEXT := 'update';
  actor UUID := NULL;
  changed_field_count INTEGER := 0;
BEGIN
  -- Compute diff of OLD vs NEW (excluding internal/denormalized fields)
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOR k IN
    SELECT jsonb_object_keys(new_json)
  LOOP
    IF k = ANY(ignored_keys) THEN
      CONTINUE;
    END IF;

    IF (old_json -> k) IS DISTINCT FROM (new_json -> k) THEN
      changed_fields := array_append(changed_fields, k);
      diff := diff || jsonb_build_object(
        k,
        jsonb_build_object('previous', old_json -> k, 'current', new_json -> k)
      );
    END IF;
  END LOOP;

  changed_field_count := COALESCE(array_length(changed_fields, 1), 0);
  IF changed_field_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Identify actor (best-effort)
  actor := NULL::uuid;

  -- Classify the change for UI
  IF array_length(changed_fields, 1) = 1 AND changed_fields[1] = 'permit_pdf_url' THEN
    event_type := 'document';
  ELSIF NEW.is_renewal IS TRUE AND (
    OLD.issued_date IS DISTINCT FROM NEW.issued_date OR
    OLD.expiry_date IS DISTINCT FROM NEW.expiry_date
  ) THEN
    event_type := 'renewal';
  ELSIF NEW.is_transfer IS TRUE AND (
    OLD.original_permit_id IS DISTINCT FROM NEW.original_permit_id OR
    OLD.transfer_reason IS DISTINCT FROM NEW.transfer_reason
  ) THEN
    event_type := 'transfer';
  ELSIF (
    OLD.water_source IS DISTINCT FROM NEW.water_source OR
    OLD.purpose IS DISTINCT FROM NEW.purpose OR
    OLD.water_allowance IS DISTINCT FROM NEW.water_allowance OR
    OLD.allowance_unit IS DISTINCT FROM NEW.allowance_unit OR
    OLD.conditions IS DISTINCT FROM NEW.conditions OR
    (OLD.is_modification IS DISTINCT FROM NEW.is_modification AND NEW.is_modification = TRUE)
  ) THEN
    event_type := 'modification';
  ELSE
    event_type := 'update';
  END IF;

  -- Maintain "modified" tag fields (only for real modifications)
  IF event_type = 'modification' THEN
    NEW.modification_count := COALESCE(OLD.modification_count, 0) + 1;
    NEW.last_modified_at := NOW();
    NEW.last_modified_by := actor;
  END IF;

  -- Insert history event
  INSERT INTO public.permit_change_events (
    permit_id,
    changed_at,
    changed_by,
    event_type,
    changed_fields,
    diff,
    summary
  ) VALUES (
    NEW.id,
    NOW(),
    actor,
    event_type,
    changed_fields,
    diff,
    CASE
      WHEN event_type = 'modification' THEN 'Permit modified'
      WHEN event_type = 'renewal' THEN 'Permit renewed'
      WHEN event_type = 'transfer' THEN 'Permit transfer update'
      WHEN event_type = 'document' THEN 'Permit document updated'
      ELSE 'Permit updated'
    END
  );

  RETURN NEW;
END;
$$;


--
-- Name: log_wur_workflow_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_wur_workflow_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) THEN
    INSERT INTO public.water_use_report_workflow_history (
      water_use_report_id,
      user_id,
      from_status,
      to_status,
      action,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      NULL,
      OLD.workflow_status,
      NEW.workflow_status,
      'status_change',
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_email_verification_success(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_email_verification_success(user_uuid uuid, log_uuid uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Update user verification status
    PERFORM update_user_email_verification(user_uuid, true);
    
    -- Update the specific log entry if provided
    IF log_uuid IS NOT NULL THEN
        UPDATE email_verification_logs 
        SET 
            token_verified = true,
            verified_at = NOW()
        WHERE id = log_uuid AND user_id = user_uuid;
    ELSE
        -- Update the most recent log entry for this user
        UPDATE email_verification_logs 
        SET 
            token_verified = true,
            verified_at = NOW()
        WHERE user_id = user_uuid 
        AND token_verified = false
        AND id = (
            SELECT id FROM email_verification_logs 
            WHERE user_id = user_uuid 
            AND token_verified = false
            ORDER BY sent_at DESC 
            LIMIT 1
        );
    END IF;
END;
$$;


--
-- Name: set_application_expires_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_application_expires_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL THEN
    -- Do not move the "first submission" expiry forward unless submitted_at itself is changed.
    NEW.expires_at := NEW.submitted_at + INTERVAL '6 months';
  ELSE
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: suspend_user(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suspend_user(user_id uuid, suspended_by_id uuid, reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE users 
    SET 
        status = 'suspended',
        suspended_at = NOW(),
        suspended_by = suspended_by_id,
        suspension_reason = reason,
        updated_at = NOW()
    WHERE id = user_id;
    
    RETURN FOUND;
END;
$$;


--
-- Name: unsuspend_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsuspend_user(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE users 
    SET 
        status = 'active',
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_reason = NULL,
        updated_at = NOW()
    WHERE id = user_id;
    
    RETURN FOUND;
END;
$$;


--
-- Name: update_permit_registry_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_permit_registry_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_permit_stats_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_permit_stats_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only increment when status changes to approved
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        PERFORM increment_quarterly_permits();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_role_delegation_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_role_delegation_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_technical_assessment_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_technical_assessment_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_transfer_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_transfer_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_user_activity_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_activity_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'applications' THEN
        UPDATE users 
        SET applications_count = (SELECT COUNT(*) FROM applications WHERE applicant_id = NEW.applicant_id)
        WHERE id = NEW.applicant_id;
    ELSIF TG_TABLE_NAME = 'reviews' THEN
        UPDATE users 
        SET reviews_count = (SELECT COUNT(*) FROM reviews WHERE reviewer_id = NEW.reviewer_id)
        WHERE id = NEW.reviewer_id;
    ELSIF TG_TABLE_NAME = 'inspections' THEN
        UPDATE users 
        SET inspections_count = (SELECT COUNT(*) FROM inspections WHERE inspector_id = NEW.inspector_id)
        WHERE id = NEW.inspector_id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_user_email_verification(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_email_verification(user_uuid uuid, is_verified boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE users 
    SET 
        email_verified = is_verified,
        email_verified_at = CASE 
            WHEN is_verified THEN NOW() 
            ELSE NULL 
        END,
        updated_at = NOW()
    WHERE id = user_uuid;
    
    -- Log the verification event
    INSERT INTO email_verification_logs (
        user_id,
        email,
        verification_type,
        token_verified,
        verified_at
    )
    SELECT 
        user_uuid,
        email,
        'manual',
        is_verified,
        CASE WHEN is_verified THEN NOW() ELSE NULL END
    FROM users 
    WHERE id = user_uuid;
END;
$$;


--
-- Name: validate_alternative_contact(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_alternative_contact(contact_json jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Allow NULL values
    IF contact_json IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Validate required fields exist and are strings
    RETURN (
        contact_json ? 'name' AND
        contact_json ? 'relationship' AND
        contact_json ? 'phone' AND
        jsonb_typeof(contact_json->'name') = 'string' AND
        jsonb_typeof(contact_json->'relationship') = 'string' AND
        jsonb_typeof(contact_json->'phone') = 'string'
    );
END;
$$;


--
-- Name: validate_landowners_array(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_landowners_array(landowners_json jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Allow NULL values
    IF landowners_json IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Must be an array
    IF jsonb_typeof(landowners_json) != 'array' THEN
        RETURN FALSE;
    END IF;
    
    -- Each element should have name and contact info
    RETURN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(landowners_json) AS elem
        WHERE NOT (
            elem ? 'name' AND
            elem ? 'contact' AND
            jsonb_typeof(elem->'name') = 'string' AND
            jsonb_typeof(elem->'contact') = 'string'
        )
    );
    
    RETURN TRUE;
END;
$$;


--
-- Name: validate_polygon_intersection(public.geometry, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_polygon_intersection(new_polygon public.geometry, application_id uuid DEFAULT NULL::uuid) RETURNS TABLE(has_intersection boolean, intersecting_permit_ids uuid[], intersection_details jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    intersection_found BOOLEAN := FALSE;
    permit_ids UUID[] := '{}';
    details JSONB := '[]'::JSONB;
    permit_record RECORD;
    intersection_geom GEOMETRY;
    intersection_area DOUBLE PRECISION;
    new_area DOUBLE PRECISION;
    permit_area DOUBLE PRECISION;
    overlap_percentage DOUBLE PRECISION;
BEGIN
    -- Skip validation if new_polygon is NULL
    IF new_polygon IS NULL THEN
        RETURN QUERY SELECT FALSE, '{}'::UUID[], '[]'::JSONB;
        RETURN;
    END IF;
    
    -- Calculate area of new polygon
    new_area := ST_Area(ST_Transform(new_polygon, 32736)); -- UTM Zone 36S for Rwanda
    
    -- Check against all active permits with coordinates
    FOR permit_record IN 
        SELECT p.id, p.permit_number, p.coordinates, a.project_title, a.applicant_id
        FROM public.permits p
        JOIN public.applications a ON p.application_id = a.id
        WHERE p.status = 'active' 
        AND p.coordinates IS NOT NULL
        AND ST_IsValid(p.coordinates)
        AND (application_id IS NULL OR p.application_id != application_id) -- Exclude self if updating
    LOOP
        -- Check if polygons intersect
        IF ST_Intersects(new_polygon, permit_record.coordinates) THEN
            intersection_found := TRUE;
            permit_ids := array_append(permit_ids, permit_record.id);
            
            -- Calculate intersection details
            intersection_geom := ST_Intersection(new_polygon, permit_record.coordinates);
            intersection_area := ST_Area(ST_Transform(intersection_geom, 32736));
            permit_area := ST_Area(ST_Transform(permit_record.coordinates, 32736));
            overlap_percentage := ROUND((intersection_area / LEAST(new_area, permit_area) * 100)::numeric, 2);
            
            -- Build intersection detail object
            details := details || jsonb_build_object(
                'permit_id', permit_record.id,
                'permit_number', permit_record.permit_number,
                'project_title', permit_record.project_title,
                'intersection_area_m2', ROUND(intersection_area::numeric, 2),
                'overlap_percentage', overlap_percentage,
                'intersection_type', CASE 
                    WHEN ST_Contains(new_polygon, permit_record.coordinates) THEN 'new_contains_existing'
                    WHEN ST_Contains(permit_record.coordinates, new_polygon) THEN 'existing_contains_new'
                    WHEN ST_Overlaps(new_polygon, permit_record.coordinates) THEN 'partial_overlap'
                    WHEN ST_Touches(new_polygon, permit_record.coordinates) THEN 'boundaries_touch'
                    ELSE 'general_intersection'
                END
            );
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT intersection_found, permit_ids, details;
END;
$$;


--
-- Name: validate_water_source_polygon(public.geometry); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_water_source_polygon(geom public.geometry) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF geom IS NULL THEN RETURN TRUE; END IF;

  IF ST_GeometryType(geom) = 'ST_Point' THEN RETURN TRUE; END IF;

  IF ST_GeometryType(geom) = 'ST_Polygon' THEN
    RETURN ST_NPoints(geom) >= 4; -- 3 distinct + closing point
  END IF;

  IF ST_GeometryType(geom) = 'ST_MultiPolygon' THEN
    RETURN (
      SELECT COALESCE(BOOL_AND(ST_NPoints(d.geom) >= 4), FALSE)
      FROM (SELECT (ST_Dump(geom)).geom) AS d
    );
  END IF;

  RETURN FALSE;
END;
$$;


--
-- Name: verify_email_code(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_email_code(p_email text, p_code text, p_purpose text DEFAULT 'signup'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_row public.email_verification_codes%ROWTYPE;
BEGIN
  SELECT *
    INTO v_row
    FROM public.email_verification_codes evc
   WHERE evc.email = LOWER(p_email)
     AND evc.purpose = p_purpose
     AND evc.consumed_at IS NULL
   ORDER BY evc.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_row.expires_at < NOW() OR v_row.attempts >= v_row.max_attempts THEN
    RETURN FALSE;
  END IF;

  UPDATE public.email_verification_codes
     SET attempts = attempts + 1,
         updated_at = NOW()
   WHERE id = v_row.id;

  IF v_row.code = p_code THEN
    UPDATE public.email_verification_codes
       SET consumed_at = NOW(),
           updated_at = NOW()
     WHERE id = v_row.id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_access_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    api_key_hash text,
    key_prefix text,
    scopes text[] NOT NULL,
    rate_limit_per_min integer DEFAULT 60 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    granted_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    total_requests bigint DEFAULT 0 NOT NULL,
    claim_token_hash text,
    claim_expires_at timestamp with time zone,
    claimed_at timestamp with time zone,
    CONSTRAINT api_access_grants_rate_limit_per_min_check CHECK (((rate_limit_per_min >= 1) AND (rate_limit_per_min <= 6000))),
    CONSTRAINT api_access_grants_scopes_check CHECK ((array_length(scopes, 1) >= 1)),
    CONSTRAINT api_access_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: api_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_access_logs (
    id bigint NOT NULL,
    grant_id uuid NOT NULL,
    endpoint text NOT NULL,
    status_code integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_access_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.api_access_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.api_access_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: api_access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_no text NOT NULL,
    institution_name text NOT NULL,
    institution_type text NOT NULL,
    tin text,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text,
    technical_email text NOT NULL,
    purpose text NOT NULL,
    requested_scopes text[] NOT NULL,
    requested_period_months integer NOT NULL,
    static_ip text,
    accepted_terms_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    review_notes text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_access_requests_institution_type_check CHECK ((institution_type = ANY (ARRAY['ministry'::text, 'district'::text, 'agency'::text, 'parastatal'::text, 'other'::text]))),
    CONSTRAINT api_access_requests_requested_period_months_check CHECK (((requested_period_months >= 1) AND (requested_period_months <= 60))),
    CONSTRAINT api_access_requests_requested_scopes_check CHECK ((array_length(requested_scopes, 1) >= 1)),
    CONSTRAINT api_access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    applicant_id uuid NOT NULL,
    application_number character varying(50),
    status public.application_status DEFAULT 'draft'::public.application_status NOT NULL,
    application_type public.application_type NOT NULL,
    water_source public.water_source_type NOT NULL,
    estimated_usage_volume numeric(15,2),
    usage_unit character varying(20),
    province public.province_type NOT NULL,
    district character varying(100) NOT NULL,
    sector character varying(100) NOT NULL,
    cell character varying(100) NOT NULL,
    village character varying(100),
    coordinates public.geometry(Geometry,4326),
    location_description text,
    project_title character varying(255) NOT NULL,
    project_description text,
    project_value numeric(15,2),
    water_taking_method character varying(255),
    water_measuring_method character varying(255),
    storage_facilities text,
    return_flow_description text,
    electricity_generation_capacity character varying(100),
    mining_operations_type character varying(255),
    water_diversion_details text,
    infrastructure_pipes text,
    infrastructure_pumps text,
    infrastructure_valves text,
    infrastructure_meters text,
    environmental_assessment text,
    mitigation_actions text,
    assigned_reviewer_id uuid,
    assigned_assessor_id uuid,
    assigned_approver_id uuid,
    sla_status public.sla_status DEFAULT 'on_time'::public.sla_status,
    due_date timestamp with time zone,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    inspected_at timestamp with time zone,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    revision_notes text,
    rejection_reason text,
    internal_notes text,
    water_body_name character varying(200),
    tributary_name character varying(200),
    catchment_name_level_1 character varying(200),
    catchment_name_level_2 character varying(200),
    water_reliability public.water_reliability,
    natural_discharge_volume_m3 numeric(15,3),
    max_daily_volume_m3 numeric(12,3),
    max_monthly_volume_m3 numeric(15,3),
    max_yearly_volume_m3 numeric(15,3),
    flow_rate_m3_per_second numeric(10,6),
    abstraction_facilities_description text,
    return_flow_location character varying(200),
    return_flow_volume_m3 numeric(12,3),
    proposed_duration_months integer,
    proposed_duration_years integer,
    pumping_hours_per_day numeric(4,2),
    proposed_facilities_description text,
    construction_type character varying(100),
    concession_area numeric(10,4),
    operational_overview text,
    owns_all_required_land boolean DEFAULT false,
    land_ownership_status public.land_ownership_status,
    affected_landowners jsonb,
    easement_details text,
    written_consent_details text,
    lease_agreement_details text,
    land_access_steps text,
    water_body_surface_area numeric(10,2),
    surface_area_unit character varying(20) DEFAULT 'hectares'::character varying,
    rejected_at timestamp with time zone,
    terms_presented_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    terms_status character varying(50),
    water_purpose public.water_purpose NOT NULL,
    rejection_reason_id uuid,
    custom_rejection_reason text,
    fish_lake_area_hectares numeric(10,2),
    fish_ponds_discard_water_quantity_m3_per_day numeric(10,2),
    recreation_details jsonb,
    quarter_issued integer,
    year_issued integer,
    assessed_at timestamp with time zone,
    intersection_validation_status character varying(50) DEFAULT 'pending'::character varying,
    intersecting_permits uuid[],
    intersection_details jsonb,
    intended_activities jsonb DEFAULT '[]'::jsonb,
    expires_at timestamp with time zone,
    assigned_verifier_id uuid,
    assessor_recommended_volume_m3 numeric,
    is_modification boolean DEFAULT false,
    modified_from_application_id uuid,
    modification_changes jsonb,
    is_renewal boolean DEFAULT false,
    renewed_from_permit_id uuid,
    completeness_confirmed_at timestamp with time zone,
    approval_conditions text,
    modification_reason text,
    payment_override_amount numeric(15,2) DEFAULT NULL::numeric,
    payment_waived boolean DEFAULT false NOT NULL,
    is_bulk boolean DEFAULT false NOT NULL,
    bulk_networks jsonb,
    bulk_district text,
    termination_reason text,
    terminated_at timestamp with time zone,
    resubmitted_at timestamp with time zone,
    CONSTRAINT chk_duration_logical CHECK ((((proposed_duration_months IS NULL) OR (proposed_duration_months > 0)) AND ((proposed_duration_years IS NULL) OR (proposed_duration_years > 0)) AND ((pumping_hours_per_day IS NULL) OR ((pumping_hours_per_day >= (0)::numeric) AND (pumping_hours_per_day <= (24)::numeric))))),
    CONSTRAINT chk_positive_volumes CHECK ((((max_daily_volume_m3 IS NULL) OR (max_daily_volume_m3 > (0)::numeric)) AND ((max_monthly_volume_m3 IS NULL) OR (max_monthly_volume_m3 > (0)::numeric)) AND ((max_yearly_volume_m3 IS NULL) OR (max_yearly_volume_m3 > (0)::numeric)) AND ((concession_area IS NULL) OR (concession_area > (0)::numeric)) AND ((flow_rate_m3_per_second IS NULL) OR (flow_rate_m3_per_second > (0)::numeric)))),
    CONSTRAINT chk_proposed_duration_years_range CHECK (((proposed_duration_years IS NULL) OR ((proposed_duration_years >= 1) AND (proposed_duration_years <= 15)))),
    CONSTRAINT chk_valid_landowners_array CHECK (public.validate_landowners_array(affected_landowners)),
    CONSTRAINT chk_valid_water_source_coordinates CHECK (public.validate_water_source_polygon(coordinates))
);


--
-- Name: COLUMN applications.modification_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.modification_reason IS 'Applicant-provided justification for why the permit modification is being requested.';


--
-- Name: COLUMN applications.payment_waived; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.payment_waived IS 'TRUE for applicants who paid offline before IremboPay was integrated. Bypasses the payment gate';


--
-- Name: COLUMN applications.termination_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.termination_reason IS 'Mandatory staff-provided reason when an application is terminated because the water use is exempted (no permit required).';


--
-- Name: COLUMN applications.terminated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.terminated_at IS 'When the application was terminated (exempted water use).';


--
-- Name: COLUMN applications.resubmitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.resubmitted_at IS 'Latest applicant resubmission after a return-for-revision. submitted_at keeps the original submission date (expiration window). Displays use COALESCE(resubmitted_at, submitted_at, created_at).';


--
-- Name: application_coordinates_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.application_coordinates_view AS
 SELECT applications.id,
    applications.application_number,
    applications.coordinates,
    public.st_geometrytype(applications.coordinates) AS geometry_type
   FROM public.applications
  WHERE (applications.coordinates IS NOT NULL);


--
-- Name: application_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    user_id uuid,
    rating integer,
    feedback_text text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT application_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: application_polygon_validation_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.application_polygon_validation_view AS
 SELECT a.id,
    a.application_number,
    a.project_title,
    a.status,
    a.coordinates,
    (public.st_asgeojson(a.coordinates))::jsonb AS coordinates_geojson,
    a.intersection_validation_status,
    a.intersecting_permits,
    a.intersection_details,
        CASE
            WHEN (a.coordinates IS NULL) THEN 'no_coordinates'::text
            WHEN (public.st_geometrytype(a.coordinates) <> 'ST_Polygon'::text) THEN 'invalid_geometry'::text
            WHEN ((a.intersection_validation_status)::text = 'valid'::text) THEN 'valid'::text
            WHEN ((a.intersection_validation_status)::text = 'invalid'::text) THEN 'invalid'::text
            ELSE 'pending_validation'::text
        END AS validation_summary
   FROM public.applications a
  WHERE (a.coordinates IS NOT NULL);


--
-- Name: approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    decision character varying(50) NOT NULL,
    decision_reason text,
    conditions jsonb,
    delegated_from uuid,
    delegation_reason text,
    approved_at timestamp with time zone DEFAULT now(),
    effective_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: approver_dashboard_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.approver_dashboard_stats AS
 SELECT ( SELECT count(*) AS count
           FROM public.applications) AS total_applications,
    ( SELECT count(*) AS count
           FROM public.applications
          WHERE (applications.status = 'pending_final_approval'::public.application_status)) AS pending_final_approval,
    ( SELECT count(*) AS count
           FROM public.applications
          WHERE (applications.status = 'approved'::public.application_status)) AS total_approved,
    ( SELECT count(*) AS count
           FROM public.applications
          WHERE (applications.status = 'rejected'::public.application_status)) AS total_rejected;


--
-- Name: assessment_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assessment_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    inspector_id uuid NOT NULL,
    assessment_number character varying(50),
    type public.assessment_type_enum NOT NULL,
    status public.assessment_status_enum DEFAULT 'scheduled'::public.assessment_status_enum NOT NULL,
    result public.assessment_result_enum,
    scheduled_date timestamp with time zone NOT NULL,
    completed_date timestamp with time zone,
    location_verified boolean,
    coordinates_verified boolean,
    site_plan_compliance boolean,
    location_notes text,
    water_source_verified boolean,
    extraction_method_verified boolean,
    infrastructure_condition character varying(100),
    technical_compliance boolean,
    technical_notes text,
    environmental_impact_assessed boolean,
    mitigation_measures_implemented boolean,
    environmental_compliance boolean,
    environmental_notes text,
    permit_conditions_met boolean,
    volume_limits_respected boolean,
    reporting_up_to_date boolean,
    fees_paid boolean,
    regulatory_compliance boolean,
    regulatory_notes text,
    photos_taken integer DEFAULT 0,
    samples_collected integer DEFAULT 0,
    gps_data jsonb,
    overall_score numeric(3,2),
    recommendations text,
    follow_up_required boolean DEFAULT false,
    follow_up_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    table_name character varying(100),
    record_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    request_id character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    severity public.audit_severity DEFAULT 'info'::public.audit_severity,
    status public.audit_status DEFAULT 'success'::public.audit_status,
    description text,
    entity_type public.audit_entity_type
);


--
-- Name: backup_applications_reject_20260825; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_applications_reject_20260825 (
    id uuid,
    applicant_id uuid,
    application_number character varying(50),
    status public.application_status,
    application_type public.application_type,
    water_source public.water_source_type,
    estimated_usage_volume numeric(15,2),
    usage_unit character varying(20),
    province public.province_type,
    district character varying(100),
    sector character varying(100),
    cell character varying(100),
    village character varying(100),
    coordinates public.geometry(Geometry,4326),
    location_description text,
    project_title character varying(255),
    project_description text,
    project_value numeric(15,2),
    water_taking_method character varying(255),
    water_measuring_method character varying(255),
    storage_facilities text,
    return_flow_description text,
    electricity_generation_capacity character varying(100),
    mining_operations_type character varying(255),
    water_diversion_details text,
    infrastructure_pipes text,
    infrastructure_pumps text,
    infrastructure_valves text,
    infrastructure_meters text,
    environmental_assessment text,
    mitigation_actions text,
    assigned_reviewer_id uuid,
    assigned_assessor_id uuid,
    assigned_approver_id uuid,
    sla_status public.sla_status,
    due_date timestamp with time zone,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    inspected_at timestamp with time zone,
    approved_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    revision_notes text,
    rejection_reason text,
    internal_notes text,
    water_body_name character varying(200),
    tributary_name character varying(200),
    catchment_name_level_1 character varying(200),
    catchment_name_level_2 character varying(200),
    water_reliability public.water_reliability,
    natural_discharge_volume_m3 numeric(15,3),
    max_daily_volume_m3 numeric(12,3),
    max_monthly_volume_m3 numeric(15,3),
    max_yearly_volume_m3 numeric(15,3),
    flow_rate_m3_per_second numeric(10,6),
    abstraction_facilities_description text,
    return_flow_location character varying(200),
    return_flow_volume_m3 numeric(12,3),
    proposed_duration_months integer,
    proposed_duration_years integer,
    pumping_hours_per_day numeric(4,2),
    proposed_facilities_description text,
    construction_type character varying(100),
    concession_area numeric(10,4),
    operational_overview text,
    owns_all_required_land boolean,
    land_ownership_status public.land_ownership_status,
    affected_landowners jsonb,
    easement_details text,
    written_consent_details text,
    lease_agreement_details text,
    land_access_steps text,
    water_body_surface_area numeric(10,2),
    surface_area_unit character varying(20),
    rejected_at timestamp with time zone,
    terms_presented_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    terms_status character varying(50),
    water_purpose public.water_purpose,
    rejection_reason_id uuid,
    custom_rejection_reason text,
    fish_lake_area_hectares numeric(10,2),
    fish_ponds_discard_water_quantity_m3_per_day numeric(10,2),
    recreation_details jsonb,
    quarter_issued integer,
    year_issued integer,
    assessed_at timestamp with time zone,
    intersection_validation_status character varying(50),
    intersecting_permits uuid[],
    intersection_details jsonb,
    intended_activities jsonb,
    expires_at timestamp with time zone,
    assigned_verifier_id uuid,
    assessor_recommended_volume_m3 numeric,
    is_modification boolean,
    modified_from_application_id uuid,
    modification_changes jsonb,
    is_renewal boolean,
    renewed_from_permit_id uuid,
    completeness_confirmed_at timestamp with time zone,
    approval_conditions text,
    modification_reason text,
    payment_override_amount numeric(15,2),
    payment_waived boolean,
    is_bulk boolean,
    bulk_networks jsonb,
    bulk_district text,
    termination_reason text,
    terminated_at timestamp with time zone,
    resubmitted_at timestamp with time zone
);


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    assessment_id uuid,
    sender_id uuid NOT NULL,
    recipient_id uuid,
    message_type character varying(50) NOT NULL,
    subject character varying(255),
    message text NOT NULL,
    is_internal boolean DEFAULT false,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    permit_id uuid,
    assessment_id uuid,
    name character varying(255) NOT NULL,
    type public.document_type NOT NULL,
    file_path character varying(500),
    file_size bigint,
    mime_type character varying(100),
    verification_status public.verification_status DEFAULT 'pending'::public.verification_status,
    verified_by uuid,
    verified_at timestamp with time zone,
    verification_notes text,
    is_required boolean DEFAULT true,
    uploaded_by uuid NOT NULL,
    upload_date timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_kind text,
    owner_id uuid
);


--
-- Name: email_verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code text NOT NULL,
    purpose text DEFAULT 'signup'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    verification_type text DEFAULT 'signup'::text NOT NULL,
    token_sent boolean DEFAULT false,
    token_verified boolean DEFAULT false,
    sent_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_verification_type CHECK ((verification_type = ANY (ARRAY['signup'::text, 'email_change'::text, 'manual'::text])))
);


--
-- Name: inspection_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspection_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    row_index integer,
    inspection_number text,
    permit_holder text,
    permit_number text,
    activity text,
    district text,
    compliance_status text,
    observation text,
    action text,
    inspection_date_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inspection_workflow_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspection_workflow_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    inspection_id uuid NOT NULL,
    user_id uuid,
    from_status character varying(50),
    to_status character varying(50) NOT NULL,
    action character varying(100) NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    inspector_id uuid NOT NULL,
    inspection_number character varying(50),
    type public.inspection_type NOT NULL,
    status public.inspection_status DEFAULT 'scheduled'::public.inspection_status NOT NULL,
    result public.inspection_result,
    scheduled_date timestamp with time zone NOT NULL,
    completed_date timestamp with time zone,
    location_verified boolean,
    coordinates_verified boolean,
    site_plan_compliance boolean,
    location_notes text,
    water_source_verified boolean,
    extraction_method_verified boolean,
    infrastructure_condition character varying(100),
    technical_compliance boolean,
    technical_notes text,
    environmental_impact_assessed boolean,
    mitigation_measures_implemented boolean,
    environmental_compliance boolean,
    environmental_notes text,
    permit_conditions_met boolean,
    volume_limits_respected boolean,
    reporting_up_to_date boolean,
    fees_paid boolean,
    regulatory_compliance boolean,
    regulatory_notes text,
    photos_taken integer DEFAULT 0,
    samples_collected integer DEFAULT 0,
    gps_data jsonb,
    overall_score numeric(3,2),
    recommendations text,
    follow_up_required boolean DEFAULT false,
    follow_up_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    inspection_template text,
    operator_name text,
    operator_id_tin text,
    operator_residence text,
    catchment_level1 text,
    catchment_level2 text,
    authorized_surface_area_ha numeric(15,2),
    actual_surface_area_ha numeric(15,2),
    authorized_concession_boundaries jsonb,
    actual_concession_boundaries jsonb,
    employment_gender_breakdown jsonb,
    ohs_gender_sensitive jsonb,
    review_status text,
    review_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    inspection_documents jsonb,
    activity_starting_date date,
    activity_type text,
    actual_abstraction_method text,
    allowed_quantity numeric(15,2),
    allowed_unit character varying(20),
    authorized_abstraction_method text,
    actual_quantity numeric(15,2),
    actual_unit character varying(20),
    measurement_device_type text,
    measurement_device_notes text,
    measurement_device_photo_taken boolean DEFAULT false,
    wastewater_system_type text,
    wastewater_system_effectiveness character varying(50),
    wastewater_system_photos_taken boolean DEFAULT false,
    wastewater_notes text,
    fees_payment_verified boolean,
    fees_payment_amount numeric(15,2),
    fees_payment_proof text,
    fees_outstanding_amount numeric(15,2),
    reports_submitted boolean,
    reports_submission_date date,
    reports_reference_number text,
    reports_proof text,
    water_use_conflicts text,
    conflict_severity character varying(50),
    catchment_protection_initiatives text,
    protection_photos_taken boolean DEFAULT false,
    general_conclusion text,
    compliance_status character varying(50),
    workflow_status text DEFAULT 'draft'::text,
    assigned_reviewer_id uuid,
    assigned_assessor_id uuid,
    assigned_verifier_id uuid,
    assigned_approver_id uuid,
    assessment_notes text,
    assessment_completed_at timestamp with time zone,
    verified_by uuid,
    verified_at timestamp with time zone,
    verification_notes text,
    approved_by uuid,
    approved_at timestamp with time zone,
    approval_notes text,
    rejection_reason text,
    internal_notes text,
    owner_kind text,
    owner_id uuid,
    locked_field_overrides jsonb,
    fees_payment_details text,
    recommendation_details text,
    project_latitude numeric,
    project_longitude numeric,
    manual_inspection_subject text,
    manual_inspection_reason text,
    manual_contact_name text,
    manual_contact_phone text,
    manual_site_notes text,
    CONSTRAINT inspections_inspection_template_chk CHECK ((inspection_template = ANY (ARRAY['authorization'::text, 'concession'::text]))),
    CONSTRAINT inspections_owner_chk CHECK ((((application_id IS NOT NULL) AND (owner_kind IS NULL) AND (owner_id IS NULL)) OR ((application_id IS NULL) AND (owner_kind = 'permit_registry'::text) AND (owner_id IS NOT NULL)) OR ((application_id IS NULL) AND (owner_kind = 'manual_unpermitted'::text) AND (owner_id IS NULL)))),
    CONSTRAINT inspections_review_status_chk CHECK ((review_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'changes_requested'::text]))),
    CONSTRAINT inspections_workflow_status_chk CHECK ((workflow_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_assessment'::text, 'under_assessment'::text, 'pending_review'::text, 'pending_verification'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'returned_to_assessment'::text, 'returned_to_review'::text, 'returned_to_verification'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    application_id uuid,
    assessment_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    email_sent boolean DEFAULT false,
    sms_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    application_id uuid NOT NULL,
    receipt_number character varying(100) NOT NULL,
    receipt_url text,
    file_path character varying(500),
    file_size integer,
    receipt_data jsonb,
    generated_at timestamp with time zone DEFAULT now(),
    emailed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    irembo_txn_id character varying(255),
    transaction_ref character varying(255),
    payment_method public.payment_method,
    payment_channel public.payment_channel,
    amount numeric(15,2) NOT NULL,
    currency character varying(3) DEFAULT 'RWF'::character varying NOT NULL,
    status public.payment_status NOT NULL,
    provider_response jsonb,
    provider_code character varying(50),
    provider_message text,
    initiated_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    applicant_id uuid NOT NULL,
    merchant_id uuid,
    amount numeric(15,2) DEFAULT 35000.00 NOT NULL,
    currency character varying(3) DEFAULT 'RWF'::character varying NOT NULL,
    description text,
    status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    payment_method public.payment_method,
    irembo_payment_ref character varying(255),
    irembo_request_id character varying(255),
    irembo_transaction_id character varying(255),
    payment_url text,
    customer_email character varying(255),
    customer_phone character varying(20),
    customer_name character varying(255),
    gateway_response jsonb,
    gateway_metadata jsonb,
    initiated_at timestamp with time zone DEFAULT now(),
    processing_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    purpose text DEFAULT 'application_fee'::text NOT NULL,
    water_use_report_id uuid,
    CONSTRAINT chk_positive_amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT chk_valid_currency CHECK (((currency)::text = ANY (ARRAY[('RWF'::character varying)::text, ('USD'::character varying)::text, ('EUR'::character varying)::text, ('GBP'::character varying)::text]))),
    CONSTRAINT payments_purpose_chk CHECK ((purpose = ANY (ARRAY['application_fee'::text, 'annual_report_fee'::text])))
);


--
-- Name: permit_change_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permit_change_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    event_type text NOT NULL,
    changed_fields text[] DEFAULT ARRAY[]::text[] NOT NULL,
    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_application_id uuid,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permit_change_events_event_type_check CHECK ((event_type = ANY (ARRAY['modification'::text, 'renewal'::text, 'transfer'::text, 'document'::text, 'update'::text])))
);


--
-- Name: permit_number_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permit_number_counters (
    year integer NOT NULL,
    last_issued integer DEFAULT 0 NOT NULL
);


--
-- Name: permit_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permit_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    serial_number integer,
    permit_holder text,
    permit_number text,
    regime text,
    water_source text,
    volume_or_area text,
    method_of_water_taking text,
    authorized_activity text,
    location text,
    latitude double precision,
    longitude double precision,
    issuance_date date,
    duration text,
    expiration_date date,
    status text DEFAULT 'OPERATIONAL'::text,
    contact text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    map_geometry public.geometry(Geometry,4326),
    map_status public.permit_status,
    map_purpose public.water_purpose,
    map_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_doc_path text,
    uploaded_doc_name text,
    uploaded_doc_mime_type text,
    uploaded_doc_uploaded_at timestamp with time zone,
    row_index integer,
    issuance_date_raw text,
    expiration_date_raw text,
    deleted_at timestamp with time zone,
    manually_edited_at timestamp with time zone
);


--
-- Name: permit_registry_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permit_registry_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_number text NOT NULL,
    doc_path text NOT NULL,
    doc_name text NOT NULL,
    doc_mime_type text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    permit_number character varying(50) NOT NULL,
    status public.permit_status DEFAULT 'active'::public.permit_status NOT NULL,
    water_source public.water_source_type NOT NULL,
    water_allowance numeric(15,2) NOT NULL,
    allowance_unit character varying(20) NOT NULL,
    issuing_authority character varying(255) DEFAULT 'Rwanda Water Board'::character varying NOT NULL,
    issued_date date NOT NULL,
    expiry_date date NOT NULL,
    conditions jsonb,
    original_permit_id uuid,
    is_renewal boolean DEFAULT false,
    is_transfer boolean DEFAULT false,
    transfer_reason text,
    monitoring_frequency character varying(100),
    reporting_requirements text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    water_body_surface_area numeric(10,2),
    surface_area_unit character varying(20) DEFAULT 'hectares'::character varying,
    permit_pdf_url character varying(500),
    purpose public.water_purpose NOT NULL,
    coordinates public.geometry(Geometry,4326),
    is_modification boolean DEFAULT false,
    modification_count integer DEFAULT 0 NOT NULL,
    last_modified_at timestamp with time zone,
    last_modified_by uuid,
    parent_permit_id uuid,
    network_sequence_index integer
);


--
-- Name: phone_verification_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.phone_verification_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: phone_verification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_verification_logs (
    id bigint DEFAULT nextval('public.phone_verification_logs_id_seq'::regclass) NOT NULL,
    phone_number character varying(20) NOT NULL,
    verification_code character varying(10) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 1,
    sent_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'sent'::character varying,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT phone_verification_logs_status_check CHECK (((status)::text = ANY (ARRAY[('sent'::character varying)::text, ('verified'::character varying)::text, ('expired'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: portal_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    application_id uuid,
    rating integer,
    feedback_text text,
    feedback_type character varying(50) DEFAULT 'terms_acceptance'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT portal_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: quarterly_permit_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quarterly_permit_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quarter character varying(7) NOT NULL,
    year integer NOT NULL,
    quarter_num integer NOT NULL,
    permits_issued integer DEFAULT 0,
    permits_renewed integer DEFAULT 0,
    permits_transferred integer DEFAULT 0,
    permits_revoked integer DEFAULT 0,
    permits_suspended integer DEFAULT 0,
    total_water_allocated numeric(15,2) DEFAULT 0,
    average_permit_duration_days integer DEFAULT 0,
    surface_water_permits integer DEFAULT 0,
    groundwater_permits integer DEFAULT 0,
    borehole_permits integer DEFAULT 0,
    river_permits integer DEFAULT 0,
    lake_permits integer DEFAULT 0,
    spring_permits integer DEFAULT 0,
    domestic_permits integer DEFAULT 0,
    industrial_permits integer DEFAULT 0,
    agricultural_permits integer DEFAULT 0,
    commercial_permits integer DEFAULT 0,
    municipal_permits integer DEFAULT 0,
    mining_permits integer DEFAULT 0,
    kigali_permits integer DEFAULT 0,
    northern_permits integer DEFAULT 0,
    southern_permits integer DEFAULT 0,
    eastern_permits integer DEFAULT 0,
    western_permits integer DEFAULT 0,
    average_processing_time_days integer DEFAULT 0,
    applications_approved integer DEFAULT 0,
    applications_rejected integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quarterly_permit_stats_quarter_num_check CHECK (((quarter_num >= 1) AND (quarter_num <= 4)))
);


--
-- Name: rejection_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rejection_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reason text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    review_stage character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    risk_assessment public.risk_assessment,
    recommendation public.recommendation_type,
    technical_review text,
    environmental_review text,
    compliance_review text,
    overall_comments text,
    assigned_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    due_date timestamp with time zone,
    quality_score numeric(3,2),
    processing_time_hours integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: role_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delegator_id uuid NOT NULL,
    delegate_id uuid NOT NULL,
    delegated_role public.delegatable_role NOT NULL,
    reason text,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    status public.delegation_status DEFAULT 'active'::public.delegation_status NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revocation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT different_users CHECK ((delegator_id <> delegate_id)),
    CONSTRAINT revocation_consistency CHECK ((((status = 'revoked'::public.delegation_status) AND (revoked_at IS NOT NULL)) OR ((status <> 'revoked'::public.delegation_status) AND (revoked_at IS NULL)))),
    CONSTRAINT valid_date_range CHECK (((end_date IS NULL) OR (end_date > start_date)))
);


--
-- Name: site_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_content (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(255) NOT NULL,
    value jsonb NOT NULL,
    description text,
    category character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: technical_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technical_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    assessor_id uuid NOT NULL,
    assessment_number text,
    document_verifications jsonb DEFAULT '{}'::jsonb,
    field_report_files text[] DEFAULT '{}'::text[],
    field_report_summary text,
    location_verified boolean DEFAULT false,
    water_source_accessible boolean DEFAULT false,
    environmental_impact_assessed boolean DEFAULT false,
    technical_feasibility_confirmed boolean DEFAULT false,
    infrastructure_adequate boolean DEFAULT false,
    inspector_name text,
    inspection_date date,
    recommendation text,
    explanation_text text,
    status text DEFAULT 'draft'::text,
    forwarded_at timestamp with time zone,
    revision_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assessment_report_data jsonb DEFAULT '{}'::jsonb,
    report_completed boolean DEFAULT false,
    CONSTRAINT technical_assessments_recommendation_check CHECK ((recommendation = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT technical_assessments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'forwarded_to_approver'::text, 'returned_for_revision'::text])))
);


--
-- Name: transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    original_permit_id uuid,
    transferor_user_id uuid NOT NULL,
    transferee_email text NOT NULL,
    transferee_phone text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transfer_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: TABLE transfer_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transfer_requests IS 'Transferee-facing transfer requests matched by email+phone; approved before terms acceptance.';


--
-- Name: COLUMN transfer_requests.application_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transfer_requests.application_id IS 'Transfer application created by transferor (applications.application_type=transfer).';


--
-- Name: COLUMN transfer_requests.original_permit_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transfer_requests.original_permit_id IS 'Original permit being transferred; new permit will reference this as original_permit_id.';


--
-- Name: COLUMN transfer_requests.transferee_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transfer_requests.transferee_email IS 'Lowercased email used to match transferee account login.';


--
-- Name: COLUMN transfer_requests.transferee_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transfer_requests.transferee_phone IS 'Normalized phone digits used to match transferee account login.';


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_notifications boolean DEFAULT true,
    sms_notifications boolean DEFAULT false,
    application_updates boolean DEFAULT true,
    inspection_reminders boolean DEFAULT true,
    system_announcements boolean DEFAULT true,
    theme character varying(20) DEFAULT 'light'::character varying,
    language character varying(10) DEFAULT 'en'::character varying,
    timezone character varying(50) DEFAULT 'Africa/Kigali'::character varying,
    dashboard_layout jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    role public.user_role DEFAULT 'applicant'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    account_type public.account_type NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    date_of_birth date,
    id_number character varying(50),
    company_name character varying(255),
    company_tin character varying(50),
    company_address text,
    company_phone character varying(20),
    province public.province_type,
    district character varying(100),
    sector character varying(100),
    cell character varying(100),
    village character varying(100),
    address text,
    applications_count integer DEFAULT 0,
    reviews_count integer DEFAULT 0,
    inspections_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone,
    profile_completed boolean DEFAULT false,
    po_box character varying(50),
    mobile_phone character varying(20),
    landline_phone character varying(20),
    business_certificate_number character varying(100),
    incorporation_certificate_number character varying(100),
    alternative_contact jsonb,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    suspension_reason text,
    id_type public.id_type DEFAULT 'national_id'::public.id_type NOT NULL,
    tin_number character varying(50),
    primary_id_type character varying(20) DEFAULT 'national_id'::character varying,
    document_type public.id_document_type DEFAULT 'national_id'::public.id_document_type,
    preferred_id_type character varying(20) DEFAULT 'national_id'::character varying,
    phone_verified boolean DEFAULT false,
    phone_verification_code character varying(10),
    phone_verification_expires_at timestamp with time zone,
    phone_verification_attempts integer DEFAULT 0,
    phone_verification_last_sent timestamp with time zone,
    email_verified boolean DEFAULT false,
    email_verified_at timestamp with time zone,
    email_verification_token text,
    email_verification_sent_at timestamp with time zone,
    must_change_password boolean DEFAULT false NOT NULL,
    account_confirmed boolean DEFAULT true NOT NULL,
    confirmed_at timestamp with time zone,
    password_hash text NOT NULL,
    is_bulk_applicant boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_individual_fields CHECK ((((account_type = 'individual'::public.account_type) AND (first_name IS NOT NULL) AND (last_name IS NOT NULL) AND (company_name IS NULL) AND (company_tin IS NULL) AND (company_address IS NULL) AND (company_phone IS NULL)) OR (account_type <> 'individual'::public.account_type))),
    CONSTRAINT chk_organizational_fields CHECK (((((account_type)::text = ANY (ARRAY['company'::text, 'cooperative'::text, 'organization'::text, 'institution'::text, 'ngo_association'::text])) AND (company_name IS NOT NULL) AND (company_tin IS NOT NULL) AND (company_address IS NOT NULL) AND (company_phone IS NOT NULL)) OR (account_type = 'individual'::public.account_type))),
    CONSTRAINT chk_phone_for_verification CHECK (((phone_verified = false) OR ((phone_verified = true) AND (phone IS NOT NULL)))),
    CONSTRAINT chk_valid_alternative_contact CHECK (public.validate_alternative_contact(alternative_contact))
);


--
-- Name: water_use_report_workflow_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.water_use_report_workflow_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    water_use_report_id uuid NOT NULL,
    user_id uuid,
    from_status character varying(50),
    to_status character varying(50) NOT NULL,
    action character varying(100) NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: water_use_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.water_use_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_id uuid,
    application_id uuid,
    applicant_id uuid NOT NULL,
    reporting_year integer NOT NULL,
    template text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    section3 jsonb,
    section3_quarterly jsonb,
    section4 jsonb,
    section5_monitoring jsonb,
    section5_incidents jsonb,
    section6_employment jsonb,
    section6_ohs jsonb,
    section7 jsonb,
    section8 jsonb,
    section9_declaration jsonb,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workflow_status text DEFAULT 'draft'::text,
    assigned_reviewer_id uuid,
    assigned_verifier_id uuid,
    assigned_approver_id uuid,
    assessment_notes text,
    assessment_completed_at timestamp with time zone,
    review_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    verification_notes text,
    verified_by uuid,
    verified_at timestamp with time zone,
    approval_notes text,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    internal_notes text,
    assigned_assessor_id uuid,
    CONSTRAINT water_use_reports_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_assessment'::text, 'pending_review'::text, 'pending_verification'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'returned_to_assessment'::text, 'returned_to_review'::text, 'returned_to_verification'::text]))),
    CONSTRAINT water_use_reports_template_chk CHECK ((template = ANY (ARRAY['abstraction'::text, 'concession'::text]))),
    CONSTRAINT water_use_reports_workflow_status_chk CHECK ((workflow_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_assessment'::text, 'pending_review'::text, 'pending_verification'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'returned_to_assessment'::text, 'returned_to_review'::text, 'returned_to_verification'::text])))
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    event_type public.webhook_event_type NOT NULL,
    event_id character varying(255),
    payload jsonb NOT NULL,
    headers jsonb,
    source_ip character varying(45),
    signature character varying(512),
    signature_valid boolean,
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    processing_error text,
    received_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    user_id uuid,
    from_status character varying(50),
    to_status character varying(50) NOT NULL,
    action character varying(100) NOT NULL,
    comment text,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_access_grants api_access_grants_api_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_grants
    ADD CONSTRAINT api_access_grants_api_key_hash_key UNIQUE (api_key_hash);


--
-- Name: api_access_grants api_access_grants_claim_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_grants
    ADD CONSTRAINT api_access_grants_claim_token_hash_key UNIQUE (claim_token_hash);


--
-- Name: api_access_grants api_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_grants
    ADD CONSTRAINT api_access_grants_pkey PRIMARY KEY (id);


--
-- Name: api_access_logs api_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_logs
    ADD CONSTRAINT api_access_logs_pkey PRIMARY KEY (id);


--
-- Name: api_access_requests api_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_requests
    ADD CONSTRAINT api_access_requests_pkey PRIMARY KEY (id);


--
-- Name: api_access_requests api_access_requests_reference_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_requests
    ADD CONSTRAINT api_access_requests_reference_no_key UNIQUE (reference_no);


--
-- Name: application_feedback application_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_feedback
    ADD CONSTRAINT application_feedback_pkey PRIMARY KEY (id);


--
-- Name: applications applications_application_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_application_number_key UNIQUE (application_number);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_verification_codes email_verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);


--
-- Name: email_verification_logs email_verification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_logs
    ADD CONSTRAINT email_verification_logs_pkey PRIMARY KEY (id);


--
-- Name: inspection_registry inspection_registry_inspection_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_registry
    ADD CONSTRAINT inspection_registry_inspection_number_key UNIQUE (inspection_number);


--
-- Name: inspection_registry inspection_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_registry
    ADD CONSTRAINT inspection_registry_pkey PRIMARY KEY (id);


--
-- Name: inspection_workflow_history inspection_workflow_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_workflow_history
    ADD CONSTRAINT inspection_workflow_history_pkey PRIMARY KEY (id);


--
-- Name: assessments inspections_inspection_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT inspections_inspection_number_key UNIQUE (assessment_number);


--
-- Name: inspections inspections_inspection_number_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_inspection_number_key1 UNIQUE (inspection_number);


--
-- Name: assessments inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);


--
-- Name: inspections inspections_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_pkey1 PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_receipts payment_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);


--
-- Name: payment_receipts payment_receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: payment_transactions payment_transactions_irembo_txn_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_irembo_txn_id_key UNIQUE (irembo_txn_id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payments payments_irembo_payment_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_irembo_payment_ref_key UNIQUE (irembo_payment_ref);


--
-- Name: payments payments_irembo_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_irembo_request_id_key UNIQUE (irembo_request_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: permit_change_events permit_change_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_change_events
    ADD CONSTRAINT permit_change_events_pkey PRIMARY KEY (id);


--
-- Name: permit_number_counters permit_number_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_number_counters
    ADD CONSTRAINT permit_number_counters_pkey PRIMARY KEY (year);


--
-- Name: permit_registry_documents permit_registry_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_registry_documents
    ADD CONSTRAINT permit_registry_documents_pkey PRIMARY KEY (id);


--
-- Name: permit_registry permit_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_registry
    ADD CONSTRAINT permit_registry_pkey PRIMARY KEY (id);


--
-- Name: permits permits_permit_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_permit_number_key UNIQUE (permit_number);


--
-- Name: permits permits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_pkey PRIMARY KEY (id);


--
-- Name: phone_verification_logs phone_verification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_verification_logs
    ADD CONSTRAINT phone_verification_logs_pkey PRIMARY KEY (id);


--
-- Name: portal_feedback portal_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_feedback
    ADD CONSTRAINT portal_feedback_pkey PRIMARY KEY (id);


--
-- Name: quarterly_permit_stats quarterly_permit_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_permit_stats
    ADD CONSTRAINT quarterly_permit_stats_pkey PRIMARY KEY (id);


--
-- Name: quarterly_permit_stats quarterly_permit_stats_year_quarter_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_permit_stats
    ADD CONSTRAINT quarterly_permit_stats_year_quarter_num_key UNIQUE (year, quarter_num);


--
-- Name: quarterly_permit_stats quarterly_permit_stats_year_quarter_num_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_permit_stats
    ADD CONSTRAINT quarterly_permit_stats_year_quarter_num_unique UNIQUE (year, quarter_num);


--
-- Name: rejection_reasons rejection_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rejection_reasons
    ADD CONSTRAINT rejection_reasons_pkey PRIMARY KEY (id);


--
-- Name: rejection_reasons rejection_reasons_reason_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rejection_reasons
    ADD CONSTRAINT rejection_reasons_reason_key UNIQUE (reason);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: role_delegations role_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_delegations
    ADD CONSTRAINT role_delegations_pkey PRIMARY KEY (id);


--
-- Name: site_content site_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_pkey PRIMARY KEY (key);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: technical_assessments technical_assessments_assessment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_assessments
    ADD CONSTRAINT technical_assessments_assessment_number_key UNIQUE (assessment_number);


--
-- Name: technical_assessments technical_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_assessments
    ADD CONSTRAINT technical_assessments_pkey PRIMARY KEY (id);


--
-- Name: transfer_requests transfer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_unique UNIQUE (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: water_use_report_workflow_history water_use_report_workflow_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_report_workflow_history
    ADD CONSTRAINT water_use_report_workflow_history_pkey PRIMARY KEY (id);


--
-- Name: water_use_reports water_use_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_pkey PRIMARY KEY (id);


--
-- Name: water_use_reports water_use_reports_unique_permit_year; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_unique_permit_year UNIQUE (permit_id, reporting_year);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: workflow_history workflow_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_history
    ADD CONSTRAINT workflow_history_pkey PRIMARY KEY (id);


--
-- Name: api_access_grants_key_prefix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_access_grants_key_prefix_idx ON public.api_access_grants USING btree (key_prefix);


--
-- Name: api_access_grants_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_access_grants_request_idx ON public.api_access_grants USING btree (request_id);


--
-- Name: api_access_logs_grant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_access_logs_grant_created_idx ON public.api_access_logs USING btree (grant_id, created_at DESC);


--
-- Name: documents_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_owner_idx ON public.documents USING btree (owner_kind, owner_id) WHERE (owner_kind IS NOT NULL);


--
-- Name: idx_applications_affected_landowners_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_affected_landowners_gin ON public.applications USING gin (affected_landowners);


--
-- Name: idx_applications_applicant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_applicant ON public.applications USING btree (applicant_id);


--
-- Name: idx_applications_assigned_inspector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_assigned_inspector ON public.applications USING btree (assigned_assessor_id);


--
-- Name: idx_applications_assigned_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_assigned_reviewer ON public.applications USING btree (assigned_reviewer_id);


--
-- Name: idx_applications_assigned_verifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_assigned_verifier ON public.applications USING btree (assigned_verifier_id);


--
-- Name: idx_applications_catchment_level_1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_catchment_level_1 ON public.applications USING btree (catchment_name_level_1);


--
-- Name: idx_applications_completeness_confirmed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_completeness_confirmed_at ON public.applications USING btree (completeness_confirmed_at) WHERE (completeness_confirmed_at IS NOT NULL);


--
-- Name: idx_applications_concession_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_concession_area ON public.applications USING btree (concession_area);


--
-- Name: idx_applications_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_coordinates ON public.applications USING gist (coordinates);


--
-- Name: idx_applications_coordinates_spatial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_coordinates_spatial ON public.applications USING gist (coordinates);


--
-- Name: idx_applications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_created_at ON public.applications USING btree (created_at);


--
-- Name: idx_applications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_expires_at ON public.applications USING btree (expires_at);


--
-- Name: idx_applications_intended_activities; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_intended_activities ON public.applications USING gin (intended_activities);


--
-- Name: idx_applications_intersection_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_intersection_status ON public.applications USING btree (intersection_validation_status);


--
-- Name: idx_applications_is_modification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_is_modification ON public.applications USING btree (is_modification) WHERE (is_modification = true);


--
-- Name: idx_applications_is_renewal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_is_renewal ON public.applications USING btree (is_renewal) WHERE (is_renewal = true);


--
-- Name: idx_applications_max_yearly_volume; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_max_yearly_volume ON public.applications USING btree (max_yearly_volume_m3);


--
-- Name: idx_applications_modified_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_modified_from ON public.applications USING btree (modified_from_application_id) WHERE (modified_from_application_id IS NOT NULL);


--
-- Name: idx_applications_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_number ON public.applications USING btree (application_number);


--
-- Name: idx_applications_owns_all_land; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_owns_all_land ON public.applications USING btree (owns_all_required_land);


--
-- Name: idx_applications_proposed_duration_years; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_proposed_duration_years ON public.applications USING btree (proposed_duration_years) WHERE (proposed_duration_years IS NOT NULL);


--
-- Name: idx_applications_quarter_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_quarter_year ON public.applications USING btree (year_issued, quarter_issued);


--
-- Name: idx_applications_renewed_from_permit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_renewed_from_permit ON public.applications USING btree (renewed_from_permit_id) WHERE (renewed_from_permit_id IS NOT NULL);


--
-- Name: idx_applications_sla_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_sla_status ON public.applications USING btree (sla_status);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- Name: idx_applications_status_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status_approved ON public.applications USING btree (status) WHERE (status = 'approved'::public.application_status);


--
-- Name: idx_applications_status_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status_pending ON public.applications USING btree (status) WHERE (status = ANY (ARRAY['submitted'::public.application_status, 'under_review'::public.application_status, 'pending_inspection'::public.application_status, 'pending_final_approval'::public.application_status]));


--
-- Name: idx_applications_status_rejected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status_rejected ON public.applications USING btree (status) WHERE (status = 'rejected'::public.application_status);


--
-- Name: idx_applications_status_terms; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status_terms ON public.applications USING btree (status, terms_status);


--
-- Name: idx_applications_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_submitted_at ON public.applications USING btree (submitted_at);


--
-- Name: idx_applications_terms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_terms_status ON public.applications USING btree (terms_status);


--
-- Name: idx_applications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_type ON public.applications USING btree (application_type);


--
-- Name: idx_applications_water_body_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_water_body_name ON public.applications USING btree (water_body_name);


--
-- Name: idx_applications_water_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_water_purpose ON public.applications USING btree (water_purpose);


--
-- Name: idx_applications_water_reliability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_water_reliability ON public.applications USING btree (water_reliability);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- Name: idx_audit_logs_filters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_filters ON public.audit_logs USING btree (created_at DESC, entity_type, severity, status);


--
-- Name: idx_audit_logs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_severity ON public.audit_logs USING btree (severity);


--
-- Name: idx_audit_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_status ON public.audit_logs USING btree (status);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_communications_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_application ON public.communications USING btree (application_id);


--
-- Name: idx_communications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_recipient ON public.communications USING btree (recipient_id);


--
-- Name: idx_communications_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_sender ON public.communications USING btree (sender_id);


--
-- Name: idx_documents_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_application ON public.documents USING btree (application_id);


--
-- Name: idx_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_type ON public.documents USING btree (type);


--
-- Name: idx_documents_verification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_verification_status ON public.documents USING btree (verification_status);


--
-- Name: idx_email_verification_codes_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_codes_email ON public.email_verification_codes USING btree (email);


--
-- Name: idx_email_verification_codes_email_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_codes_email_purpose ON public.email_verification_codes USING btree (email, purpose);


--
-- Name: idx_email_verification_codes_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_codes_exp ON public.email_verification_codes USING btree (expires_at);


--
-- Name: idx_email_verification_logs_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_logs_email ON public.email_verification_logs USING btree (email);


--
-- Name: idx_email_verification_logs_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_logs_sent_at ON public.email_verification_logs USING btree (sent_at);


--
-- Name: idx_email_verification_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_logs_user_id ON public.email_verification_logs USING btree (user_id);


--
-- Name: idx_inspection_registry_permit_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspection_registry_permit_number ON public.inspection_registry USING btree (lower(permit_number));


--
-- Name: idx_inspection_registry_row_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspection_registry_row_index ON public.inspection_registry USING btree (row_index);


--
-- Name: idx_inspections_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_application ON public.assessments USING btree (application_id);


--
-- Name: idx_inspections_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_application_id ON public.inspections USING btree (application_id);


--
-- Name: idx_inspections_assigned_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_assigned_approver ON public.inspections USING btree (assigned_approver_id);


--
-- Name: idx_inspections_assigned_assessor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_assigned_assessor ON public.inspections USING btree (assigned_assessor_id);


--
-- Name: idx_inspections_assigned_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_assigned_reviewer ON public.inspections USING btree (assigned_reviewer_id);


--
-- Name: idx_inspections_assigned_verifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_assigned_verifier ON public.inspections USING btree (assigned_verifier_id);


--
-- Name: idx_inspections_compliance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_compliance_status ON public.inspections USING btree (compliance_status);


--
-- Name: idx_inspections_documents_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_documents_gin ON public.inspections USING gin (inspection_documents);


--
-- Name: idx_inspections_fees_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_fees_verified ON public.inspections USING btree (fees_payment_verified);


--
-- Name: idx_inspections_inspector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_inspector ON public.assessments USING btree (inspector_id);


--
-- Name: idx_inspections_inspector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_inspector_id ON public.inspections USING btree (inspector_id);


--
-- Name: idx_inspections_operator_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_operator_name ON public.inspections USING btree (operator_name);


--
-- Name: idx_inspections_reports_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_reports_submitted ON public.inspections USING btree (reports_submitted);


--
-- Name: idx_inspections_review_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_review_status ON public.inspections USING btree (review_status);


--
-- Name: idx_inspections_reviewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_reviewed_at ON public.inspections USING btree (reviewed_at);


--
-- Name: idx_inspections_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_scheduled_date ON public.assessments USING btree (scheduled_date);


--
-- Name: idx_inspections_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_status ON public.assessments USING btree (status);


--
-- Name: idx_inspections_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_template ON public.inspections USING btree (inspection_template);


--
-- Name: idx_inspections_workflow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_workflow_status ON public.inspections USING btree (workflow_status);


--
-- Name: idx_iwh_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iwh_created_at ON public.inspection_workflow_history USING btree (created_at);


--
-- Name: idx_iwh_inspection_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iwh_inspection_id ON public.inspection_workflow_history USING btree (inspection_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_password_reset_tokens_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_email ON public.password_reset_tokens USING btree (email);


--
-- Name: idx_password_reset_tokens_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_exp ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: idx_payment_txn_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_txn_created_at ON public.payment_transactions USING btree (created_at DESC);


--
-- Name: idx_payment_txn_irembo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_txn_irembo_id ON public.payment_transactions USING btree (irembo_txn_id);


--
-- Name: idx_payment_txn_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_txn_payment_id ON public.payment_transactions USING btree (payment_id);


--
-- Name: idx_payment_txn_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_txn_status ON public.payment_transactions USING btree (status);


--
-- Name: idx_payments_applicant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_applicant_id ON public.payments USING btree (applicant_id);


--
-- Name: idx_payments_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_application_id ON public.payments USING btree (application_id);


--
-- Name: idx_payments_application_id_nullable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_application_id_nullable ON public.payments USING btree (application_id) WHERE (application_id IS NOT NULL);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);


--
-- Name: idx_payments_irembo_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_irembo_ref ON public.payments USING btree (irembo_payment_ref);


--
-- Name: idx_payments_irembo_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_irembo_request ON public.payments USING btree (irembo_request_id);


--
-- Name: idx_payments_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_purpose ON public.payments USING btree (purpose);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_water_use_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_water_use_report_id ON public.payments USING btree (water_use_report_id);


--
-- Name: idx_permit_change_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_change_events_event_type ON public.permit_change_events USING btree (event_type);


--
-- Name: idx_permit_change_events_permit_id_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_change_events_permit_id_changed_at ON public.permit_change_events USING btree (permit_id, changed_at DESC);


--
-- Name: idx_permit_registry_documents_permit_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_documents_permit_number ON public.permit_registry_documents USING btree (permit_number);


--
-- Name: idx_permit_registry_expiration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_expiration ON public.permit_registry USING btree (expiration_date);


--
-- Name: idx_permit_registry_holder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_holder ON public.permit_registry USING gin (to_tsvector('english'::regconfig, permit_holder));


--
-- Name: idx_permit_registry_issuance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_issuance ON public.permit_registry USING btree (issuance_date);


--
-- Name: idx_permit_registry_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_location ON public.permit_registry USING gin (to_tsvector('english'::regconfig, COALESCE(location, ''::text)));


--
-- Name: idx_permit_registry_map_geometry_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_map_geometry_gist ON public.permit_registry USING gist (map_geometry);


--
-- Name: idx_permit_registry_map_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_map_status ON public.permit_registry USING btree (map_status);


--
-- Name: idx_permit_registry_permit_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_permit_number ON public.permit_registry USING btree (permit_number);


--
-- Name: idx_permit_registry_regime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_regime ON public.permit_registry USING btree (regime);


--
-- Name: idx_permit_registry_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permit_registry_status ON public.permit_registry USING btree (status);


--
-- Name: idx_permits_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_application ON public.permits USING btree (application_id);


--
-- Name: idx_permits_coordinates_spatial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_coordinates_spatial ON public.permits USING gist (coordinates);


--
-- Name: idx_permits_expiry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_expiry_date ON public.permits USING btree (expiry_date);


--
-- Name: idx_permits_is_modification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_is_modification ON public.permits USING btree (is_modification) WHERE (is_modification = true);


--
-- Name: idx_permits_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_number ON public.permits USING btree (permit_number);


--
-- Name: idx_permits_parent_permit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_parent_permit_id ON public.permits USING btree (parent_permit_id);


--
-- Name: idx_permits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permits_status ON public.permits USING btree (status);


--
-- Name: idx_phone_verification_logs_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_verification_logs_expires_at ON public.phone_verification_logs USING btree (expires_at);


--
-- Name: idx_phone_verification_logs_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_verification_logs_phone_number ON public.phone_verification_logs USING btree (phone_number);


--
-- Name: idx_phone_verification_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_verification_logs_status ON public.phone_verification_logs USING btree (status);


--
-- Name: idx_portal_feedback_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_feedback_application_id ON public.portal_feedback USING btree (application_id);


--
-- Name: idx_portal_feedback_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_feedback_created_at ON public.portal_feedback USING btree (created_at);


--
-- Name: idx_portal_feedback_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_feedback_user_id ON public.portal_feedback USING btree (user_id);


--
-- Name: idx_quarterly_permit_stats_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quarterly_permit_stats_created_at ON public.quarterly_permit_stats USING btree (created_at);


--
-- Name: idx_quarterly_permit_stats_quarter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quarterly_permit_stats_quarter ON public.quarterly_permit_stats USING btree (quarter);


--
-- Name: idx_quarterly_permit_stats_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quarterly_permit_stats_year ON public.quarterly_permit_stats USING btree (year, quarter_num);


--
-- Name: idx_receipt_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_application_id ON public.payment_receipts USING btree (application_id);


--
-- Name: idx_receipt_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_number ON public.payment_receipts USING btree (receipt_number);


--
-- Name: idx_receipt_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_payment_id ON public.payment_receipts USING btree (payment_id);


--
-- Name: idx_reviews_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_application ON public.reviews USING btree (application_id);


--
-- Name: idx_reviews_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_reviewer ON public.reviews USING btree (reviewer_id);


--
-- Name: idx_reviews_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);


--
-- Name: idx_role_delegations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_active ON public.role_delegations USING btree (status, start_date, end_date) WHERE (status = 'active'::public.delegation_status);


--
-- Name: idx_role_delegations_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_dates ON public.role_delegations USING btree (start_date, end_date);


--
-- Name: idx_role_delegations_delegate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_delegate ON public.role_delegations USING btree (delegate_id);


--
-- Name: idx_role_delegations_delegator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_delegator ON public.role_delegations USING btree (delegator_id);


--
-- Name: idx_role_delegations_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_role ON public.role_delegations USING btree (delegated_role);


--
-- Name: idx_role_delegations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_delegations_status ON public.role_delegations USING btree (status);


--
-- Name: idx_technical_assessments_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_assessments_application_id ON public.technical_assessments USING btree (application_id);


--
-- Name: idx_technical_assessments_assessor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_assessments_assessor_id ON public.technical_assessments USING btree (assessor_id);


--
-- Name: idx_technical_assessments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_assessments_created_at ON public.technical_assessments USING btree (created_at DESC);


--
-- Name: idx_technical_assessments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_assessments_status ON public.technical_assessments USING btree (status);


--
-- Name: idx_transfer_requests_application_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transfer_requests_application_id_unique ON public.transfer_requests USING btree (application_id);


--
-- Name: idx_transfer_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_requests_created_at ON public.transfer_requests USING btree (created_at DESC);


--
-- Name: idx_transfer_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_requests_status ON public.transfer_requests USING btree (status);


--
-- Name: idx_transfer_requests_transferee_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_requests_transferee_email ON public.transfer_requests USING btree (lower(transferee_email));


--
-- Name: idx_transfer_requests_transferee_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_requests_transferee_phone ON public.transfer_requests USING btree (transferee_phone);


--
-- Name: idx_users_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_account_type ON public.users USING btree (account_type);


--
-- Name: idx_users_alternative_contact_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_alternative_contact_gin ON public.users USING gin (alternative_contact);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_email_verification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_verification ON public.users USING btree (email_verified, email_verification_sent_at);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_role_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role_staff ON public.users USING btree (role) WHERE (role <> 'applicant'::public.user_role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_status_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status_suspended ON public.users USING btree (status) WHERE (status = 'suspended'::public.user_status);


--
-- Name: idx_users_tin_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tin_number ON public.users USING btree (tin_number);


--
-- Name: idx_water_use_reports_applicant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_water_use_reports_applicant_id ON public.water_use_reports USING btree (applicant_id);


--
-- Name: idx_water_use_reports_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_water_use_reports_application_id ON public.water_use_reports USING btree (application_id);


--
-- Name: idx_water_use_reports_permit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_water_use_reports_permit_id ON public.water_use_reports USING btree (permit_id);


--
-- Name: idx_water_use_reports_reporting_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_water_use_reports_reporting_year ON public.water_use_reports USING btree (reporting_year);


--
-- Name: idx_webhook_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_event_type ON public.webhook_logs USING btree (event_type);


--
-- Name: idx_webhook_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_payment_id ON public.webhook_logs USING btree (payment_id);


--
-- Name: idx_webhook_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_processed ON public.webhook_logs USING btree (processed);


--
-- Name: idx_webhook_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_received_at ON public.webhook_logs USING btree (received_at DESC);


--
-- Name: idx_workflow_history_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_history_application ON public.workflow_history USING btree (application_id);


--
-- Name: idx_workflow_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_history_created_at ON public.workflow_history USING btree (created_at);


--
-- Name: idx_wur_assigned_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wur_assigned_approver ON public.water_use_reports USING btree (assigned_approver_id);


--
-- Name: idx_wur_assigned_assessor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wur_assigned_assessor ON public.water_use_reports USING btree (assigned_assessor_id);


--
-- Name: idx_wur_assigned_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wur_assigned_reviewer ON public.water_use_reports USING btree (assigned_reviewer_id);


--
-- Name: idx_wur_assigned_verifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wur_assigned_verifier ON public.water_use_reports USING btree (assigned_verifier_id);


--
-- Name: idx_wur_workflow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wur_workflow_status ON public.water_use_reports USING btree (workflow_status);


--
-- Name: idx_wurwh_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wurwh_created_at ON public.water_use_report_workflow_history USING btree (created_at);


--
-- Name: idx_wurwh_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wurwh_report_id ON public.water_use_report_workflow_history USING btree (water_use_report_id);


--
-- Name: inspections_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_owner_idx ON public.inspections USING btree (owner_kind, owner_id) WHERE (owner_kind IS NOT NULL);


--
-- Name: notifications_unique_application_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_unique_application_submitted ON public.notifications USING btree (application_id, title) WHERE ((title)::text = 'Application Submitted'::text);


--
-- Name: permit_registry_live_rows_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permit_registry_live_rows_idx ON public.permit_registry USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: water_use_reports_unique_app_year_when_manual; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX water_use_reports_unique_app_year_when_manual ON public.water_use_reports USING btree (application_id, reporting_year) WHERE (permit_id IS NULL);


--
-- Name: permits copy_coordinates_on_permit_creation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER copy_coordinates_on_permit_creation AFTER INSERT ON public.permits FOR EACH ROW EXECUTE FUNCTION public.copy_coordinates_to_permit();


--
-- Name: applications permit_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER permit_stats_trigger AFTER UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_permit_stats_trigger();


--
-- Name: inspections trg_inspection_workflow_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inspection_workflow_status_change AFTER UPDATE OF workflow_status ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.log_inspection_workflow_status_change();


--
-- Name: permit_registry trg_permit_registry_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_permit_registry_updated_at BEFORE UPDATE ON public.permit_registry FOR EACH ROW EXECUTE FUNCTION public.update_permit_registry_updated_at();


--
-- Name: applications trg_set_application_expires_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_application_expires_at BEFORE INSERT OR UPDATE OF submitted_at ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_application_expires_at();


--
-- Name: water_use_reports trg_wur_workflow_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wur_workflow_status_change AFTER UPDATE OF workflow_status ON public.water_use_reports FOR EACH ROW EXECUTE FUNCTION public.log_wur_workflow_status_change();


--
-- Name: applications trigger_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: communications trigger_communications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_communications_updated_at BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents trigger_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applications trigger_generate_application_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_application_number BEFORE INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.generate_application_number();


--
-- Name: technical_assessments trigger_generate_assessment_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_assessment_number BEFORE INSERT ON public.technical_assessments FOR EACH ROW WHEN ((new.assessment_number IS NULL)) EXECUTE FUNCTION public.generate_assessment_number();


--
-- Name: permits trigger_generate_permit_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_permit_number BEFORE INSERT ON public.permits FOR EACH ROW EXECUTE FUNCTION public.generate_permit_number();


--
-- Name: assessments trigger_inspections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_inspections_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applications trigger_log_application_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_application_status_change AFTER UPDATE OF status ON public.applications FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.log_application_status_change();


--
-- Name: permits trigger_log_permit_change_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_permit_change_event BEFORE UPDATE ON public.permits FOR EACH ROW EXECUTE FUNCTION public.log_permit_change_event();


--
-- Name: notifications trigger_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: permits trigger_permits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_permits_updated_at BEFORE UPDATE ON public.permits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: portal_feedback trigger_portal_feedback_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_portal_feedback_updated_at BEFORE UPDATE ON public.portal_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quarterly_permit_stats trigger_quarterly_permit_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_quarterly_permit_stats_updated_at BEFORE UPDATE ON public.quarterly_permit_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reviews trigger_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applications trigger_update_application_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_application_count AFTER INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_user_activity_counts();


--
-- Name: assessments trigger_update_inspection_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_inspection_count AFTER INSERT ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_user_activity_counts();


--
-- Name: reviews trigger_update_review_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_review_count AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_user_activity_counts();


--
-- Name: role_delegations trigger_update_role_delegation_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_role_delegation_updated_at BEFORE UPDATE ON public.role_delegations FOR EACH ROW EXECUTE FUNCTION public.update_role_delegation_updated_at();


--
-- Name: technical_assessments trigger_update_technical_assessment_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_technical_assessment_timestamp BEFORE UPDATE ON public.technical_assessments FOR EACH ROW EXECUTE FUNCTION public.update_technical_assessment_timestamp();


--
-- Name: transfer_requests trigger_update_transfer_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_transfer_requests_updated_at BEFORE UPDATE ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.update_transfer_requests_updated_at();


--
-- Name: users trigger_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_receipts update_payment_receipts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_receipts_updated_at BEFORE UPDATE ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_transactions update_payment_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: api_access_grants api_access_grants_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_grants
    ADD CONSTRAINT api_access_grants_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.api_access_requests(id);


--
-- Name: api_access_logs api_access_logs_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_access_logs
    ADD CONSTRAINT api_access_logs_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.api_access_grants(id);


--
-- Name: application_feedback application_feedback_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_feedback
    ADD CONSTRAINT application_feedback_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_feedback application_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_feedback
    ADD CONSTRAINT application_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: applications applications_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: applications applications_assigned_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_assigned_approver_id_fkey FOREIGN KEY (assigned_approver_id) REFERENCES public.users(id);


--
-- Name: applications applications_assigned_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_assigned_inspector_id_fkey FOREIGN KEY (assigned_assessor_id) REFERENCES public.users(id);


--
-- Name: applications applications_assigned_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES public.users(id);


--
-- Name: applications applications_assigned_verifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_assigned_verifier_id_fkey FOREIGN KEY (assigned_verifier_id) REFERENCES public.users(id);


--
-- Name: applications applications_modified_from_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_modified_from_application_id_fkey FOREIGN KEY (modified_from_application_id) REFERENCES public.applications(id);


--
-- Name: applications applications_rejection_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_rejection_reason_id_fkey FOREIGN KEY (rejection_reason_id) REFERENCES public.rejection_reasons(id);


--
-- Name: applications applications_renewed_from_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_renewed_from_permit_id_fkey FOREIGN KEY (renewed_from_permit_id) REFERENCES public.permits(id);


--
-- Name: approvals approvals_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.users(id);


--
-- Name: approvals approvals_delegated_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_delegated_from_fkey FOREIGN KEY (delegated_from) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: communications communications_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: communications communications_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_inspection_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: communications communications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: communications communications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: documents documents_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: documents documents_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_inspection_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: documents documents_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.permits(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: documents documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: email_verification_logs email_verification_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_logs
    ADD CONSTRAINT email_verification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inspection_workflow_history inspection_workflow_history_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_workflow_history
    ADD CONSTRAINT inspection_workflow_history_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE CASCADE;


--
-- Name: inspection_workflow_history inspection_workflow_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_workflow_history
    ADD CONSTRAINT inspection_workflow_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: assessments inspections_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT inspections_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: inspections inspections_application_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_application_id_fkey1 FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: inspections inspections_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: inspections inspections_assigned_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_assigned_approver_id_fkey FOREIGN KEY (assigned_approver_id) REFERENCES public.users(id);


--
-- Name: inspections inspections_assigned_assessor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_assigned_assessor_id_fkey FOREIGN KEY (assigned_assessor_id) REFERENCES public.users(id);


--
-- Name: inspections inspections_assigned_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES public.users(id);


--
-- Name: inspections inspections_assigned_verifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_assigned_verifier_id_fkey FOREIGN KEY (assigned_verifier_id) REFERENCES public.users(id);


--
-- Name: assessments inspections_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT inspections_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.users(id);


--
-- Name: inspections inspections_inspector_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_inspector_id_fkey1 FOREIGN KEY (inspector_id) REFERENCES public.users(id);


--
-- Name: inspections inspections_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: inspections inspections_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_inspection_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_receipts payment_receipts_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: payment_receipts payment_receipts_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payments payments_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payments payments_water_use_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_water_use_report_id_fkey FOREIGN KEY (water_use_report_id) REFERENCES public.water_use_reports(id) ON DELETE SET NULL;


--
-- Name: permit_change_events permit_change_events_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_change_events
    ADD CONSTRAINT permit_change_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: permit_change_events permit_change_events_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_change_events
    ADD CONSTRAINT permit_change_events_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.permits(id) ON DELETE CASCADE;


--
-- Name: permit_change_events permit_change_events_source_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permit_change_events
    ADD CONSTRAINT permit_change_events_source_application_id_fkey FOREIGN KEY (source_application_id) REFERENCES public.applications(id);


--
-- Name: permits permits_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: permits permits_last_modified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES public.users(id);


--
-- Name: permits permits_original_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_original_permit_id_fkey FOREIGN KEY (original_permit_id) REFERENCES public.permits(id);


--
-- Name: permits permits_parent_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_parent_permit_id_fkey FOREIGN KEY (parent_permit_id) REFERENCES public.permits(id);


--
-- Name: phone_verification_logs phone_verification_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_verification_logs
    ADD CONSTRAINT phone_verification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: portal_feedback portal_feedback_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_feedback
    ADD CONSTRAINT portal_feedback_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: portal_feedback portal_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_feedback
    ADD CONSTRAINT portal_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- Name: role_delegations role_delegations_delegate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_delegations
    ADD CONSTRAINT role_delegations_delegate_id_fkey FOREIGN KEY (delegate_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_delegations role_delegations_delegator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_delegations
    ADD CONSTRAINT role_delegations_delegator_id_fkey FOREIGN KEY (delegator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_delegations role_delegations_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_delegations
    ADD CONSTRAINT role_delegations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: technical_assessments technical_assessments_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_assessments
    ADD CONSTRAINT technical_assessments_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: technical_assessments technical_assessments_assessor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_assessments
    ADD CONSTRAINT technical_assessments_assessor_id_fkey FOREIGN KEY (assessor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transfer_requests transfer_requests_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: transfer_requests transfer_requests_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transfer_requests transfer_requests_original_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_original_permit_id_fkey FOREIGN KEY (original_permit_id) REFERENCES public.permits(id) ON DELETE RESTRICT;


--
-- Name: transfer_requests transfer_requests_transferor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_transferor_user_id_fkey FOREIGN KEY (transferor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.users(id);


--
-- Name: water_use_report_workflow_history water_use_report_workflow_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_report_workflow_history
    ADD CONSTRAINT water_use_report_workflow_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: water_use_report_workflow_history water_use_report_workflow_history_water_use_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_report_workflow_history
    ADD CONSTRAINT water_use_report_workflow_history_water_use_report_id_fkey FOREIGN KEY (water_use_report_id) REFERENCES public.water_use_reports(id) ON DELETE CASCADE;


--
-- Name: water_use_reports water_use_reports_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: water_use_reports water_use_reports_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: water_use_reports water_use_reports_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_assigned_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_assigned_approver_id_fkey FOREIGN KEY (assigned_approver_id) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_assigned_assessor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_assigned_assessor_id_fkey FOREIGN KEY (assigned_assessor_id) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_assigned_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_assigned_verifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_assigned_verifier_id_fkey FOREIGN KEY (assigned_verifier_id) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.permits(id) ON DELETE CASCADE;


--
-- Name: water_use_reports water_use_reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: water_use_reports water_use_reports_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_use_reports
    ADD CONSTRAINT water_use_reports_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: webhook_logs webhook_logs_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: workflow_history workflow_history_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_history
    ADD CONSTRAINT workflow_history_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: workflow_history workflow_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_history
    ADD CONSTRAINT workflow_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


