-- Hybrid AI allowance per site. Safe to run more than once.
--
-- One row per tenant: how many free AI actions it has used on the platform's
-- keys, and, once the owner pastes one, their own provider key encrypted with
-- AES-256-GCM under VORTALY_KEY_SECRET (lib/ai/access.ts). The plain key is
-- never stored. The same statements are part of supabase/schema.sql.
--
-- Apply in the Supabase SQL editor of the intended project.

create table if not exists site_ai (
  id            text primary key references salons(id) on delete cascade,
  free_used     integer     not null default 0 check (free_used >= 0),
  provider      text        check (provider in ('gemini', 'groq', 'openrouter')),
  key_cipher    text,
  key_hint      text,
  key_added_at  timestamptz,
  updated_at    timestamptz not null default now()
);

-- Server-only: RLS on with no policy keeps the anon key out entirely.
alter table site_ai enable row level security;
