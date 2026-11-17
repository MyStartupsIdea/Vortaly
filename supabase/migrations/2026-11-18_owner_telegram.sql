-- Business owners sign in with Telegram. Safe to run more than once.
--
-- owner_links    which Telegram account owns which business
-- owner_invites  one-time links the platform operator sends to an owner;
--                only a SHA-256 of the code is stored (lib/owner/store.ts)
--
-- The same statements are part of supabase/schema.sql.
-- Apply in the Supabase SQL editor of the intended project.

create table if not exists owner_links (
  salon_id          text        not null references salons(id) on delete cascade,
  telegram_user_id  bigint      not null check (telegram_user_id > 0),
  created_at        timestamptz not null default now(),
  primary key (salon_id, telegram_user_id)
);

create index if not exists owner_links_telegram_idx on owner_links (telegram_user_id);

create table if not exists owner_invites (
  code_hash   text        primary key,
  salon_id    text        not null references salons(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     bigint
);

-- Server-only: RLS on with no policy keeps the anon key out entirely.
alter table owner_links enable row level security;
alter table owner_invites enable row level security;
