-- Fix: prevent duplicate assessment_number under concurrency / after sequence reset
-- Run this in Supabase SQL editor.

-- 1) Ensure sequence exists
CREATE SEQUENCE IF NOT EXISTS assessment_number_seq START 1;

-- 2) Align sequence to current max numeric suffix so NEXTVAL doesn't collide
DO $$
DECLARE
  max_suffix BIGINT;
BEGIN
  SELECT COALESCE(
    MAX(
      NULLIF(REGEXP_REPLACE(assessment_number, '.*-(\d+)$', '\1'), '')::BIGINT
    ),
    0
  )
  INTO max_suffix
  FROM technical_assessments
  WHERE assessment_number ~ '.*-(\d+)$';

  -- setval(seq, value, is_called=true) => nextval returns value+1
  PERFORM setval('assessment_number_seq', max_suffix, true);
END
$$;

-- 3) Replace trigger function with sequence-backed generator
CREATE OR REPLACE FUNCTION generate_assessment_number()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_assessment_number ON technical_assessments;
CREATE TRIGGER trigger_generate_assessment_number
  BEFORE INSERT ON technical_assessments
  FOR EACH ROW
  WHEN (NEW.assessment_number IS NULL)
  EXECUTE FUNCTION generate_assessment_number();


