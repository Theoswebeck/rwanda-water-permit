-- Support inspections of areas/operators that do not have a water permit.
--
-- These inspections intentionally do NOT create fake applications, permits, or
-- permit_registry rows. They live directly in public.inspections with:
--   application_id = null
--   owner_kind = 'manual_unpermitted'
--   owner_id = null

begin;

alter table public.inspections
  add column if not exists manual_inspection_subject text,
  add column if not exists manual_inspection_reason  text,
  add column if not exists manual_contact_name       text,
  add column if not exists manual_contact_phone      text,
  add column if not exists manual_site_notes         text;

alter table public.inspections
  drop constraint if exists inspections_owner_chk;

alter table public.inspections
  add constraint inspections_owner_chk
  check (
    (application_id is not null and owner_kind is null and owner_id is null)
    or (application_id is null and owner_kind = 'permit_registry' and owner_id is not null)
    or (application_id is null and owner_kind = 'manual_unpermitted' and owner_id is null)
  ) not valid;

alter table public.inspections validate constraint inspections_owner_chk;

commit;

select pg_notify('pgrst', 'reload schema');
