-- =====================================================
-- Inspection: add columns that the editor has been
-- writing to but that never had matching DB columns.
-- =====================================================
--
-- The inspection editor sends these fields on every save:
--   * fees_payment_details   (Section 10 — pending fees free-text)
--   * recommendation_details (Section 14 — recommendation free-text)
--
-- They were silently dropped by the client-side missing-column retry
-- helper, so the user typed paragraphs into them and never saw them
-- persist on refresh.
--
-- This migration is paired with three code changes:
--   * Hardened client retry: now hard-fails if a missing column has
--     non-empty content (no more silent loss).
--   * Server-side schema guard: /api/internal/query rejects unknown
--     columns up front instead of relying on Postgres errors.
--   * Single source-of-truth registry (lib/inspections/payload-columns.ts)
--     plus a `npm run audit:inspections-schema` drift detector.
--
-- Safe to re-run; safe with concurrent traffic.

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS fees_payment_details   text,
  ADD COLUMN IF NOT EXISTS recommendation_details text;

-- Reload PostgREST schema cache (Supabase). Harmless on self-hosted PG.
SELECT pg_notify('pgrst', 'reload schema');
