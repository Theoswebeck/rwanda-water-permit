-- 2026-05-07: Bulk application support
-- 1. users: flag for bulk applicants (e.g. WASAC GROUP LTD)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_bulk_applicant boolean NOT NULL DEFAULT false;

-- 2. applications: bulk flag + network rows JSONB array + district selection
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS is_bulk boolean NOT NULL DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS bulk_networks jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS bulk_district text;

-- 3. permits: parent/child relationship for bulk permits
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS parent_permit_id uuid REFERENCES public.permits(id);
ALTER TABLE public.permits ADD COLUMN IF NOT EXISTS network_sequence_index integer;

-- Index for fetching child permits by parent
CREATE INDEX IF NOT EXISTS idx_permits_parent_permit_id ON public.permits(parent_permit_id);
