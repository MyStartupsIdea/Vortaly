-- UzMini — beauty & barbershop MVP schema.
-- Apply in the Supabase SQL editor, or: supabase db push

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- salons ----
create table if not exists salons (
  id            text primary key,
  name          text not null,
  tagline_ru    text not null,
  tagline_uz    text not null,
  address_ru    text not null,
  address_uz    text not null,
  phone         text not null,
  rating        numeric(2,1) not null default 0,
  review_count  integer      not null default 0,
  open_from     time         not null default '09:00',
  open_to       time         not null default '21:00',
  created_at    timestamptz  not null default now()
);

-- -------------------------------------------------------------- services ----
create table if not exists services (
  id           text primary key,
  salon_id     text not null references salons(id) on delete cascade,
  service_group text not null check (service_group in ('hair','beard','color','nails','brows')),
  title_ru     text not null,
  title_uz     text not null,
  duration_min integer not null check (duration_min > 0),
  price_sum    integer not null check (price_sum >= 0),
  popular      boolean not null default false,
  is_active    boolean not null default true
);

create index if not exists services_salon_idx on services (salon_id) where is_active;

-- --------------------------------------------------------------- masters ----
create table if not exists masters (
  id           text primary key,
  salon_id     text not null references salons(id) on delete cascade,
  name         text not null,
  craft_ru     text not null,
  craft_uz     text not null,
  rating       numeric(2,1) not null default 0,
  review_count integer not null default 0,
  -- ISO weekdays the master works: 1 = Monday … 7 = Sunday.
  workdays     smallint[] not null default '{1,2,3,4,5}',
  shift_start  time not null default '10:00',
  shift_end    time not null default '20:00',
  tint         text not null default '#0E7C86',
  is_active    boolean not null default true
);

create index if not exists masters_salon_idx on masters (salon_id) where is_active;

-- Which master performs which service.
create table if not exists master_services (
  master_id  text not null references masters(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  primary key (master_id, service_id)
);

-- -------------------------------------------------------------- bookings ----
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  salon_id         text not null references salons(id) on delete cascade,
  master_id        text not null references masters(id) on delete restrict,
  service_ids      text[] not null check (array_length(service_ids, 1) > 0),
  booking_date     date not null,
  booking_time     time not null,
  duration_min     integer not null check (duration_min > 0),
  total_sum        integer not null check (total_sum >= 0),
  status           text not null default 'pending'
                     check (status in ('draft','pending','confirmed','paid','cancelled')),
  customer_name    text not null,
  customer_phone   text not null,
  telegram_user_id bigint,
  created_at       timestamptz not null default now()
);

create index if not exists bookings_master_day_idx
  on bookings (master_id, booking_date)
  where status <> 'cancelled';

create index if not exists bookings_customer_idx
  on bookings (telegram_user_id, booking_date desc);

-- One master cannot start two live appointments at the same minute.
create unique index if not exists bookings_no_double_booking
  on bookings (master_id, booking_date, booking_time)
  where status <> 'cancelled';

-- -------------------------------------------------------------- payments ----
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  provider         text not null check (provider in ('click','payme','cash')),
  amount_sum       integer not null check (amount_sum > 0),
  status           text not null default 'created'
                     check (status in ('created','pending','paid','failed','refunded')),
  -- Provider's own transaction id, for reconciliation.
  provider_txn_id  text,
  raw_callback     jsonb,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create index if not exists payments_booking_idx on payments (booking_id);
create unique index if not exists payments_provider_txn_idx
  on payments (provider, provider_txn_id)
  where provider_txn_id is not null;

-- ------------------------------------------------------- row level security --
-- The catalogue is public; bookings and payments are reachable only through
-- the server, which uses the secret key and bypasses these policies.
alter table salons   enable row level security;
alter table services enable row level security;
alter table masters  enable row level security;
alter table master_services enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;

drop policy if exists "catalogue is readable" on salons;
create policy "catalogue is readable" on salons for select using (true);

drop policy if exists "catalogue is readable" on services;
create policy "catalogue is readable" on services for select using (is_active);

drop policy if exists "catalogue is readable" on masters;
create policy "catalogue is readable" on masters for select using (is_active);

drop policy if exists "catalogue is readable" on master_services;
create policy "catalogue is readable" on master_services for select using (true);

-- No anon policies on bookings/payments: with RLS on and no policy, the anon
-- key cannot read or write them at all. Keep it that way.

-- --------------------------------------------------------------- seed data --
insert into salons (id, name, tagline_ru, tagline_uz, address_ru, address_uz, phone, rating, review_count)
values (
  'chinor-tashkent',
  'Chinor',
  'Салон и барбершоп на Буюк Ипак Йули',
  'Buyuk Ipak Yoʻlidagi salon va barbershop',
  'Ташкент, Мирзо-Улугбек, ул. Буюк Ипак Йули, 12',
  'Toshkent, Mirzo Ulugʻbek, Buyuk Ipak Yoʻli koʻchasi, 12',
  '998712001212',
  4.8,
  326
)
on conflict (id) do nothing;
