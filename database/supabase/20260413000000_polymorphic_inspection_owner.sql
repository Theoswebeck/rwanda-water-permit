-- Polymorphic owner columns for inspection-on-legacy-permit flow.
--
-- Problem: inspections on legacy `permit_registry` rows used to force-insert a
-- fake `applications` row (a "stub") so they could satisfy the NOT NULL FK on
-- `inspections.application_id` and the implicit `documents.application_id`
-- expectation. Those stubs showed up in the admin "All Applications" view
-- as ghosts pinned on whichever staff member happened to open the inspection.
--
-- Fix: inspections and documents can now point to either an application OR a
-- permit_registry row via a polymorphic (owner_kind, owner_id) pair. The
-- existing `application_id` column stays for real applications. New inspection
-- records on legacy permits leave `application_id` NULL and set
-- `owner_kind = 'permit_registry'`, `owner_id = <permit_registry.id>`.
--
-- When the permit registry table is replaced, add a new owner_kind value
-- (e.g. 'new_registry') and migrate existing rows. No schema change needed at
-- that time.

begin;

-- inspections ------------------------------------------------------------
alter table public.inspections
  alter column application_id drop not null;

alter table public.inspections
  add column if not exists owner_kind text,
  add column if not exists owner_id   uuid;

create index if not exists inspections_owner_idx
  on public.inspections (owner_kind, owner_id)
  where owner_kind is not null;

-- Every inspection must be owned by *something*.
alter table public.inspections
  add constraint inspections_owner_chk
  check (
    application_id is not null
    or (owner_kind is not null and owner_id is not null)
  ) not valid;

alter table public.inspections validate constraint inspections_owner_chk;

-- documents --------------------------------------------------------------
-- documents.application_id is already nullable; it also already has permit_id
-- and assessment_id columns. We add owner_kind/owner_id to avoid introducing
-- a hard FK to permit_registry (which is being replaced).
alter table public.documents
  add column if not exists owner_kind text,
  add column if not exists owner_id   uuid;

create index if not exists documents_owner_idx
  on public.documents (owner_kind, owner_id)
  where owner_kind is not null;

commit;
