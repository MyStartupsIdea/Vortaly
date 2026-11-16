-- Site builder storage. Safe to run more than once.
--
-- This is the only database change the builder needs on top of the existing
-- schema. It adds one table and touches nothing else. The same statements are
-- part of supabase/schema.sql for fresh installs.
--
-- Apply in the Supabase SQL editor of the intended project.

create table if not exists sites (
  id            text primary key references salons(id) on delete cascade,
  draft         jsonb       not null,
  published     jsonb,
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);

-- Server-only: RLS on with no policy keeps the anon key out entirely.
alter table sites enable row level security;
