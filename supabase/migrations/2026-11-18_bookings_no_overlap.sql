-- No two live bookings of one master may overlap in time.
--
-- The existing unique index (bookings_no_double_booking) only refuses an
-- identical start minute, so a 60-minute booking at 11:00 and another at 11:30
-- with the same master could both be stored when two customers book at the
-- same moment. This exclusion constraint refuses any overlap atomically, in
-- the database, so no race between two requests can get past it. The API
-- reports the refusal (SQLSTATE 23P01) as 409 slot_taken, like the old index.
--
-- Before applying, check that no overlaps exist already (the constraint cannot
-- be created while they do):
--
--   select a.id, b.id
--   from bookings a join bookings b
--     on a.master_id = b.master_id and a.id < b.id
--    and a.status <> 'cancelled' and b.status <> 'cancelled'
--    and tsrange(a.booking_date + a.booking_time,
--                a.booking_date + a.booking_time + a.duration_min * interval '1 minute')
--     && tsrange(b.booking_date + b.booking_time,
--                b.booking_date + b.booking_time + b.duration_min * interval '1 minute');
--
-- Safe to run more than once. The same statements are part of supabase/schema.sql.

-- `=` on text inside a GiST exclusion constraint needs btree_gist.
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
    alter table bookings
      add constraint bookings_no_overlap
      exclude using gist (
        master_id with =,
        tsrange(
          booking_date + booking_time,
          booking_date + booking_time + duration_min * interval '1 minute',
          '[)'
        ) with &&
      )
      where (status <> 'cancelled');
  end if;
end $$;
