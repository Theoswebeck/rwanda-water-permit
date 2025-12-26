-- STEP 1: Run this ALONE (single statement), then wait for success.
-- This must commit before any query can use the new enum value.

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'expired';




