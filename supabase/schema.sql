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

-- ------------------------------------------------------ salon owners ----
-- Invite-only owner / manager accounts for each salon.
--
-- Rows are created only by the platform operator (or a migration).
-- Public registration is not implemented; a user becomes a salon owner only
-- after the operator links their Supabase Auth uid to a salon_id.
--
-- Roles are scoped to a single salon. Currently supported:
--   owner     — full salon access and can manage owner/manager access
--   manager   — can read salon data and update booking status
--
-- Future: if you need per-salon admins with fewer privileges, add a separate
-- "admin_roles" or expand the enum above — do not expand this table per salon.

create table if not exists salon_owners (
  id           uuid primary key default gen_random_uuid(),
  uid          uuid not null references auth.users(id) on delete cascade,
  salon_id     text not null references salons(id) on delete cascade,
  role         text not null default 'owner'
    check (role in ('owner', 'manager')),
  created_at   timestamptz not null default now(),
  unique (uid, salon_id)
);

create index if not exists salon_owners_uid_idx on salon_owners (uid);

drop policy if exists "owners read own rows" on salon_owners;
create policy "owners read own rows" on salon_owners for select
  using (auth.uid() = uid);

drop policy if exists "platform owners only" on salon_owners;
-- Allow the platform operator / service role to maintain this table.
-- Authenticated non-platform users should not be able to insert arbitrary
-- owner rows; inserts are intentionally not granted to anon/auth by default.
-- If you want a self-serve invite flow later, add a separate owner-only
-- insert/update policy here rather than opening it to everyone.

-- ------------------------------------------------------ owner + booking RLS ----
-- These policies are intentionally written as server-side safeguards only.
-- The application server still validates tenant access before calling the DB,
-- so these policies are a last line of defense rather than the primary
-- authorization layer.

drop policy if exists "owners read own salon bookings" on bookings;
create policy "owners read own salon bookings" on bookings for select
  using (
    salon_id in (
      select salon_id from salon_owners
      where uid = auth.uid()
    )
  );

drop policy if exists "owners update own salon booking status" on bookings;
create policy "owners update own salon booking status" on bookings for update
  using (
    salon_id in (
      select salon_id from salon_owners
      where uid = auth.uid()
    )
  )
  with check (
    salon_id in (
      select salon_id from salon_owners
      where uid = auth.uid()
    )
  );

-- Optional: if you later need owners to manage services/masters for their
-- salon, add analogous policies here instead of opening the catalogue tables
-- to arbitrary authenticated users.

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

-- ---------------------------------------------------------------- services (Chinor) ----
-- Source: lib/data/salon.ts — `services`.
-- `popular` mirrors the local catalogue; `is_active` defaults to true.

insert into services (id, salon_id, service_group, title_ru, title_uz, duration_min, price_sum, popular)
values
  ('haircut-women',  'chinor-tashkent', 'hair',  'Женская стрижка',         'Ayollar sochini kesish',        60,  120000, true),
  ('haircut-men',    'chinor-tashkent', 'hair',  'Мужская стрижка',         'Erkaklar sochini kesish',       45,   80000, true),
  ('haircut-kids',   'chinor-tashkent', 'hair',  'Детская стрижка',         'Bolalar sochini kesish',        30,   60000, false),
  ('styling',        'chinor-tashkent', 'hair',  'Укладка',                 'Soch turmagi',                  45,  100000, false),
  ('beard-trim',     'chinor-tashkent', 'beard', 'Коррекция бороды',        'Soqol olish va shakllantirish', 30,   50000, true),
  ('shave-razor',    'chinor-tashkent', 'beard', 'Бритьё опасной бритвой',  'Ustara bilan soqol olish',     30,   70000, false),
  ('color-single',   'chinor-tashkent', 'color', 'Окрашивание в один тон',  'Bir tonda boʻyash',           120,  350000, false),
  ('color-highlights','chinor-tashkent','color', 'Мелирование',             'Melirlash',                   150,  480000, false),
  ('manicure',       'chinor-tashkent', 'nails', 'Маникюр с покрытием',     'Lak bilan manikyur',           90,  150000, true),
  ('pedicure',       'chinor-tashkent', 'nails', 'Педикюр',                'Pedikyur',                     90,  180000, false),
  ('brows',          'chinor-tashkent', 'brows', 'Коррекция и окрашивание бровей','Qosh korreksiyasi va boʻyash', 40,   90000, false),
  ('lashes',         'chinor-tashkent', 'brows', 'Ламинирование ресниц',    'Kipriklarni laminatsiya qilish',75,  220000, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- masters (Chinor) ----
-- Source: lib/data/salon.ts — `masters`.
-- `workdays` is stored as a Postgres `smallint[]`. The application uses
-- ISO weekday numbers: 1 = Monday … 7 = Sunday.

insert into masters (id, salon_id, name, craft_ru, craft_uz, rating, review_count, workdays, shift_start, shift_end, tint)
values
  ('aziza',  'chinor-tashkent', 'Азиза',  'Стилист-колорист',                  'Stilist-kolorist',                 4.9, 148, '{1,2,3,4,5}'::smallint[],  '10:00', '19:00', '#0E7C86'),
  ('dilnoza','chinor-tashkent', 'Дилноза','Мастер ногтевого сервиса',          'Manikyur ustasi',                  4.8,  96, '{1,3,5,6}'::smallint[],     '09:00', '18:00', '#B2322B'),
  ('rustam', 'chinor-tashkent', 'Рустам', 'Барбер',                            'Barber',                          5.0, 211, '{1,2,3,4,5,6}'::smallint[], '10:00', '21:00', '#1F4B45'),
  ('jasur',  'chinor-tashkent', 'Жасур',  'Барбер, стрижка машинкой',          'Barber, mashinka bilan kesish',   4.7,  74, '{2,4,6,7}'::smallint[],     '11:00', '20:00', '#8A6A1F')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- master_services (Chinor) ----
-- Source: lib/data/salon.ts — each master's `serviceIds`.

insert into master_services (master_id, service_id)
values
  -- aziza: stylist / colorist
  ('aziza',  'haircut-women'),
  ('aziza',  'haircut-kids'),
  ('aziza',  'styling'),
  ('aziza',  'color-single'),
  ('aziza',  'color-highlights'),

  -- dilnoza: nail / brows / lashes
  ('dilnoza', 'manicure'),
  ('dilnoza', 'pedicure'),
  ('dilnoza', 'brows'),
  ('dilnoza', 'lashes'),

  -- rustam: barber
  ('rustam', 'haircut-men'),
  ('rustam', 'haircut-kids'),
  ('rustam', 'beard-trim'),
  ('rustam', 'shave-razor'),

  -- jasur: barber (machine cut)
  ('jasur',  'haircut-men'),
  ('jasur',  'haircut-kids'),
  ('jasur',  'beard-trim')
on conflict do nothing;
