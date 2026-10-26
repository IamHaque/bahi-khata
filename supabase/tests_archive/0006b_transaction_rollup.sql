-- S-35: transaction_rollup() — the summarized view and totals footer.
--
-- Proves:
--   1. Ungrouped (granularity NULL) returns ONE row whose figures are
--      the manual sum of every matching detail row: count, charges,
--      payments and net — voided rows excluded.
--   2. Day/week/month bucketing is exact (Monday-start weeks), newest
--      period first, and each period equals the manual sum of its
--      detail rows.
--   3. p_include_voided=true pulls voided rows back into the math.
--   4. Archived customers' transactions NEVER appear, however the
--      function is called (the scenario "Archived customers").
--   5. Every filter narrows: range [from, to), type, customer,
--      search over customer name/phone/note.
--   6. p_timezone cuts the buckets in the caller's own zone (a late
--      UTC evening is the next day in Asia/Dhaka).
--   7. A complete outsider gets zero rows (security INVOKER: the
--      caller's RLS applies); anon cannot execute at all.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001-0006b applied. Any "TEST FAILED" exception means a
-- regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002..0006)
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

create or replace function pg_temp.expect_day(p_what text, p_actual timestamp, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected::timestamp then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme with an active customer Asha and an
--    archived customer Bo; Zed owns ZedCo (the outsider's business).
--    Fixed timestamps keep every bucket deterministic.
--    Calendar: 2026-03-02, 2026-02-16 and 2026-03-30 are Mondays.
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
  -- March (week of Mon 2026-03-02)
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', null,                    '2026-03-05 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', 'paid by bKash',         '2026-03-06 12:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- Voided: out of every total unless explicitly included.
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', null,                   '2026-03-06 13:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- February (week of Mon 2026-02-16)
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   700, 'active', null,                    '2026-02-20 09:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- April (week of Mon 2026-03-30), edited.
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  200, 'edited', null,                   '2026-04-01 08:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- The archived customer's money: never on this page.
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'charge',   999, 'active', null,                    '2026-03-05 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- Another business's money: RLS's problem, not the filter's.
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'charge', 4444, 'active', null,                    '2026-03-05 10:00:00+00', '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 3. Totals for the whole filtered set (granularity NULL): one row,
--    the manual sum of the four matching detail rows.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_bigint(
  'ungrouped returns exactly one row',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  1);

select pg_temp.expect_bigint(
  'totals: entries = the 4 non-voided, non-archived rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  4);

select pg_temp.expect_num(
  'totals: charged = 5000 + 700 (manual sum)',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  5700);

select pg_temp.expect_num(
  'totals: paid = 500 + 200 (manual sum)',
  (select total_paid from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  700);

select pg_temp.expect_num(
  'totals: net = 5700 - 700 (manual sum)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  5000);

-- ------------------------------------------------------------
-- 4. Day grouping: 2026-04-01, 2026-03-06 (voided 300 gone), 03-05,
--    02-20 — newest period first.
-- ------------------------------------------------------------
select pg_temp.expect_bigint(
  'day: four buckets (the voided row does not add a fifth)',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')),
  4);

select pg_temp.expect_day(
  'day: newest bucket first',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 0),
  '2026-04-01');

select pg_temp.expect_num(
  'day: the payment-only day has zero charges',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 0),
  0);

select pg_temp.expect_num(
  'day: 2026-03-06 sums only the live payment (voided 300 excluded)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 1),
  -500);

select pg_temp.expect_num(
  'day: 2026-03-05 is the 5000 charge',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 2),
  5000);

-- ------------------------------------------------------------
-- 5. Week grouping (Monday-start): the two March rows share the week
--    of 2026-03-02 — each period equals the manual sum of its rows.
-- ------------------------------------------------------------
select pg_temp.expect_bigint(
  'week: three buckets',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')),
  3);

select pg_temp.expect_day(
  'week: newest week first (week of Mon 2026-03-30)',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 0),
  '2026-03-30');

select pg_temp.expect_bigint(
  'week: week of 2026-03-02 holds both March rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 1),
  2);

select pg_temp.expect_num(
  'week: week of 2026-03-02 net = 5000 - 500 (manual sum)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 1),
  4500);

-- ------------------------------------------------------------
-- 6. Month grouping and include_voided.
-- ------------------------------------------------------------
select pg_temp.expect_day(
  'month: newest month first (April)',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'month')
    limit 1 offset 0),
  '2026-04-01');

select pg_temp.expect_num(
  'include_voided: the 300 re-enters the totals',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_include_voided => true)),
  6000);

select pg_temp.expect_bigint(
  'include_voided: entries grows by the voided row (5) — still not the archived customer''s',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_include_voided => true)),
  5);

-- ------------------------------------------------------------
-- 7. Filters: type, customer, range, search.
-- ------------------------------------------------------------
select pg_temp.expect_num(
  'type=payment: net = -(500 + 200)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_type => 'payment')),
  -700);

select pg_temp.expect_bigint(
  'customer=Asha: the same four rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_customer_id => 'cccccccc-0000-0000-0000-000000000001')),
  4);

select pg_temp.expect_bigint(
  'customer=archived Bo: nothing at all, even asked directly',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_customer_id => 'cccccccc-0000-0000-0000-000000000002')),
  0);

select pg_temp.expect_bigint(
  'range [2026-03-01, 2026-04-01): the two March rows only',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to   => '2026-04-01 00:00:00+00')),
  2);

select pg_temp.expect_num(
  'search by customer name substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => 'verma')),
  5000);

select pg_temp.expect_num(
  'search by phone substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => '01711')),
  5000);

select pg_temp.expect_num(
  'search by note substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => 'bkash')),
  -500);

-- ------------------------------------------------------------
-- 8. Timezone: 2026-03-01 19:30 UTC is 2026-03-02 01:30 in Dhaka, so
--    the day bucket differs by the caller's zone.
-- ------------------------------------------------------------
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 42, 'active', '2026-03-01 19:30:00+00', '11111111-1111-1111-1111-111111111111');

select pg_temp.expect_day(
  'UTC buckets: the late charge sits on 2026-03-01',
  (select min(period_start) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to => '2026-03-02 00:00:00+00',
    p_granularity => 'day',
    p_timezone => 'UTC')),
  '2026-03-01');

select pg_temp.expect_day(
  'Dhaka buckets: the same charge lands on 2026-03-02',
  (select min(period_start) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to => '2026-03-03 00:00:00+00',
    p_granularity => 'day',
    p_timezone => 'Asia/Dhaka')),
  '2026-03-02');

-- ------------------------------------------------------------
-- 9. A complete outsider gets zero rows.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bigint(
  'outsider sees an empty rollup',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  0);

-- ------------------------------------------------------------
-- 10. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.transaction_rollup(
      'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
