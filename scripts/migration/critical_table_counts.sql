-- Critical table row-count snapshot.
-- Run with: psql -h 127.0.0.1 -U waterpermit_app -d waterpermit -f scripts/migration/critical_table_counts.sql

\pset format unaligned
\pset tuples_only on
\pset fieldsep ','

with target_tables(table_name) as (
  values
    ('users'),
    ('applications'),
    ('permits'),
    ('inspections'),
    ('assessments'),
    ('reviews'),
    ('approvals'),
    ('payments'),
    ('water_use_reports'),
    ('workflow_history'),
    ('documents'),
    ('notifications'),
    ('transfer_requests'),
    ('portal_feedback'),
    ('email_verification_codes'),
    ('password_reset_tokens')
)
select
  t.table_name,
  case
    when to_regclass('public.' || t.table_name) is null then null::bigint
    else (
      xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.table_name), false, true, ''))
    )[1]::text::bigint
  end as row_count
from target_tables t
order by t.table_name;
