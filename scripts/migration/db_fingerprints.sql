-- DB fingerprint snapshot for parity validation.
-- Run with: psql -h 127.0.0.1 -U waterpermit_app -d waterpermit -f scripts/migration/db_fingerprints.sql

\pset format unaligned
\pset tuples_only on

select 'fingerprint_tables=' ||
  coalesce(md5(string_agg(tablename, ',' order by tablename)), 'none')
from pg_tables
where schemaname = 'public';

select 'fingerprint_functions=' ||
  coalesce(md5(string_agg(
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    ',' order by n.nspname, p.proname, p.oid
  )), 'none')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select 'fingerprint_triggers=' ||
  coalesce(md5(string_agg(
    event_object_table || ':' || trigger_name || ':' || event_manipulation || ':' || action_timing,
    ',' order by event_object_table, trigger_name, event_manipulation, action_timing
  )), 'none')
from information_schema.triggers
where trigger_schema = 'public';

select 'fingerprint_policies=' ||
  coalesce(md5(string_agg(
    schemaname || '.' || tablename || ':' || policyname || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
    ',' order by schemaname, tablename, policyname
  )), 'none')
from pg_policies
where schemaname = 'public';

select 'fingerprint_extensions=' ||
  coalesce(md5(string_agg(extname || ':' || extversion, ',' order by extname)), 'none')
from pg_extension;
