-- S-37: daily_activity() — the dashboard trend chart's aggregation.
--
-- Proves:
--   1. The function returns exactly p_days zero-filled rows, one per
--      day, oldest first — a business with no rows still gets its
--      run of days (all zero).
--   2. Each day's charges/payments equal the manual sum of that day's
--      detail rows: voided excluded, edited included, archived
--      customer's money never anywhere.
--   3. p_days selects the window length (7 / 30 / 90).
--   4. p_timezone cuts the days in the caller's own zone (a 19:30-UTC
--      entry is the next day in Asia/Dhaka).
--   5. A complete outsider gets all-zero days (security INVOKER: the
--      caller's RLS applies); anon cannot execute at all.
--
-- Fixtures are NOW-relative (the window is now()-based), so the day
-- buckets are asserted against now() itself. Run like the other test
-- files: one transaction, rolled back; needs migrations 0001-0007
-- applied. Any "TEST FAILED" exception means a regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002..0006b)
-- ------------------------------------------------------------
create or replace function pg_temp.as_user(p_sub text, p_email text default null)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'email', p_email)::text,
    true
  );
end;
$$;

create or replace function pg_temp.as_admin()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
end;
$$;

create or replace function pg_temp.expect_num(p_what text, p_actual numeric, p_expected numeric)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_bigint(p_what text, p_actual bigint, p_expected bigint)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_day(p_what text, p_actual date, p_expected date)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme with an active customer Asha and an
--    archived customer Bo; Zed owns ZedCo. Timestamps hang off
--    NOW() because the function's window is now()-relative.
--    today-2 carries the mixed day (charge + payment + voided +
--    archived), today-1 a lone charge, today the edited payment and
--    the late-evening charge used for the timezone check.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, phone, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01711 111111', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo Archer',  null,          now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'Zed Jr',     null,          null, '44444444-4444-4444-4444-444444444444');

insert into public.transactions (id, business_id, customer_id, type, amount, status, note, occurred_at, created_by) values
  -- today-2: the mixed day.
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '10 hours', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', 'paid by bKash', (date_trunc('day', now()) - interval '2 days') + interval '12 hours', '11111111-1111-1111-1111-111111111111'),
  -- Voided: out of the chart unless the client lies about it.
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', null,         (date_trunc('day', now()) - interval '2 days') + interval '13 hours', '11111111-1111-1111-1111-111111111111'),
  -- The archived customer's money: never on the chart.
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'charge',   999, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '14 hours', '11111111-1111-1111-1111-111111111111'),
  -- today-1: one charge.
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   700, 'active', null,         (date_trunc('day', now()) - interval '1 day') + interval '9 hours', '11111111-1111-1111-1111-111111111111'),
  -- today: an EDITED payment still counts.
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  200, 'edited', null,         (date_trunc('day', now()) + interval '8 hours'), '11111111-1111-1111-1111-111111111111'),
  -- today, 19:30 UTC: the timezone probe (unique amount).
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 12345, 'active', null,         (date_trunc('day', now()) + interval '19 hours 30 minutes'), '11111111-1111-1111-1111-111111111111'),
  -- Another business's money: RLS's problem, not the filter's.
  ('dddddddd-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'charge',  4444, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '10 hours', '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 3. Zero-filled run of days: exactly 7 rows, oldest first.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_bigint(
  'p_days=7 returns exactly 7 rows (zero-filled)',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  7);

select pg_temp.expect_day(
  'the first day is 6 days before today',
  (select min(activity_date) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  (now() - interval '6 days')::date);

select pg_temp.expect_day(
  'the last day is today (UTC)',
  (select max(activity_date) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  now()::date);

-- ------------------------------------------------------------
-- 4. Per-day maths: manual sums, voided out, archived out, edited in.
-- ------------------------------------------------------------
select pg_temp.expect_num(
  'today-2: charges = 5000 (voided 300 and archived 999 never count)',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '2 days')::date),
  5000);

select pg_temp.expect_num(
  'today-2: payments = 500',
  (select payments from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '2 days')::date),
  500);

select pg_temp.expect_num(
  'today-1: charges = 700, no payments',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '1 day')::date),
  700);

select pg_temp.expect_num(
  'today: the edited payment counts (200)',
  (select payments from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = now()::date),
  200);

select pg_temp.expect_num(
  'a quiet day is exactly zero, not null',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '5 days')::date),
  0);

select pg_temp.expect_num(
  'window totals: charges = 5000 + 700 + 12345 (manual sum)',
  (select sum(charges) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  18045);

select pg_temp.expect_num(
  'window totals: payments = 500 + 200 (manual sum)',
  (select sum(payments) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  700);

-- ------------------------------------------------------------
-- 5. p_days selects the window length.
-- ------------------------------------------------------------
select pg_temp.expect_bigint(
  'p_days=30 returns 30 rows',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 30, 'UTC')),
  30);

select pg_temp.expect_bigint(
  'p_days=90 returns 90 rows',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'UTC')),
  90);

-- ------------------------------------------------------------
-- 6. Timezone: 19:30 UTC today is 01:30 TOMORROW in Asia/Dhaka, so
--    the probe charge (12345) buckets one day later in the caller's
--    zone. p_days=90 keeps the window wide enough in both zones.
-- ------------------------------------------------------------
select pg_temp.expect_day(
  'UTC buckets the 19:30 probe on today',
  (select activity_date from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'UTC')
   where charges = 12345),
  now()::date);

select pg_temp.expect_day(
  'Dhaka buckets the same probe on tomorrow',
  (select activity_date from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'Asia/Dhaka')
   where charges = 12345),
  (now() + interval '1 day')::date);

-- ------------------------------------------------------------
-- 7. A complete outsider gets all-zero days (RLS scopes the read).
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

select pg_temp.expect_bigint(
  'outsider sees 7 zero-filled days with no activity at all',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where charges = 0 and payments = 0),
  7);

-- ------------------------------------------------------------
-- 8. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.daily_activity(
      'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
