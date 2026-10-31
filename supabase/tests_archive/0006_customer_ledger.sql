-- S-31: customer_ledger() — the running-balance ledger.
--
-- Proves:
--   1. Rows come back newest first, each carrying balance_after: the
--      cumulative charge-minus-payment total in date order, computed
--      in NUMERIC by the database.
--   2. A voided row is returned (the UI shows it muted) but contributes
--      nothing to the running balance.
--   3. A complete outsider gets zero rows (security INVOKER: the
--      caller's RLS applies); anon cannot execute at all.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001, 0002, 0003, 0003b, 0004, 0005 and 0006 applied.
-- Any "TEST FAILED" exception means a regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002..0005)
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

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme; Asha has a charge of 5000, a payment
--    of 500, and a voided charge of 300.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '2 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', now() - interval '1 day', '11111111-1111-1111-1111-111111111111');

-- ------------------------------------------------------------
-- 3. Newest first; balance_after is the running total in date order,
--    with the voided charge contributing nothing.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_bigint(
  'every row is on the ledger (voided included)',
  (select count(*) from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')),
  3);

select pg_temp.expect_num(
  'newest first: the voided charge is row 1',
  (select amount from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 0),
  300);

select pg_temp.expect_num(
  'voided row carries the live running balance (its own 300 excluded)',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 0),
  4500);

select pg_temp.expect_num(
  'after the payment: 5000 - 500',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 1),
  4500);

select pg_temp.expect_num(
  'oldest row: the opening charge',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 2),
  5000);

-- ------------------------------------------------------------
-- 4. A complete outsider gets zero rows.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bigint(
  'outsider sees an empty ledger',
  (select count(*) from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')),
  0);

-- ------------------------------------------------------------
-- 5. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.customer_ledger(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
