-- Admin-editable site content: guidelines PDF, user manual PDF and contact
-- details used to live in the source (header navItems, footer, /contact), so a
-- new guideline version meant a code change and a deploy. One key/value row per
-- item, read by /api/public/site-content and written by the admin Content tab.
create table if not exists site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
