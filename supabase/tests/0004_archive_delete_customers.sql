-- S-30: archive, restore and delete_customer_permanently().
--
-- Proves:
--   1. A viewer cannot archive (their update matches zero rows); an
--      editor can — archiving is plain RLS on customers.archived_at.
--   2. Archiving keeps every transaction, keeps the balance visible in
--      the customer_balances view (with archived_at exposed), and
--      drops the customer out of dashboard_summary totals.
--   3. Restore is the same update in reverse: the customer and totals
--      come back with all history.
--   4. delete_customer_permanently(): Owner succeeds and the customer
--      plus ALL their transactions are gone in one atomic operation
--      (the FK has no cascade — the function deletes both); Editor,
--      Viewer and a complete outsider are refused with 42501; a
--      mismatched business id is 'Customer not found'; anon cannot
--      execute the function at all.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001, 0002, 0003, 0003b and 0004 applied. Any
-- "TEST FAILED" exception means a regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002/0002b/0002c/0003b)
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

create or replace function pg_temp.expect_bool(p_what text, p_actual boolean, p_expected boolean)
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

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme; Evan is an editor, Vic a viewer and
--    Zed a complete outsider. Asha owes 4500 (charge 5000, payment
--    500, 2 transactions); Ravi is settled with none.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('22222222-2222-2222-2222-222222222222', 'evan@example.com',  '{"full_name":"Evan"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',   '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '1 day', '11111111-1111-1111-1111-111111111111');

-- ------------------------------------------------------------
-- 3. Baseline dashboard: 2 customers, Asha's 4500 receivable.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_bigint(
  'baseline customer_count',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  2);
select pg_temp.expect_num(
  'baseline total_receivable',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  4500);

-- ------------------------------------------------------------
-- 4. Viewer cannot archive: their update matches zero rows and the
--    column stays NULL. Editor can.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'viewer archive attempt left Asha active',
  (select archived_at is null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'editor archive set archived_at',
  (select archived_at is not null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

-- ------------------------------------------------------------
-- 5. Archive keeps the history: both transactions survive, and the
--    balance view still carries Asha's row with the balance AND the
--    archived_at flag (the Archived filter shows balances).
-- ------------------------------------------------------------
select pg_temp.expect_bigint(
  'archive kept every transaction',
  (select count(*) from public.transactions
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  2);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
select pg_temp.expect_num(
  'archived customer keeps its balance in the view',
  (select balance from public.customer_balances
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);
select pg_temp.expect_bool(
  'view exposes archived_at',
  (select archived_at is not null from public.customer_balances
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

-- ------------------------------------------------------------
-- 6. Dashboard totals exclude the archived customer (C-6): 1 customer
--    left, no receivable, no debtors. Ravi (settled) remains.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_bigint(
  'customer_count after archive',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  1);
select pg_temp.expect_num(
  'receivable after archive',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  0);
select pg_temp.expect_bool(
  'top debtors empty after archive',
  (select top_debtors = '[]'::jsonb from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  true);

-- ------------------------------------------------------------
-- 7. Restore is the same update in reverse: totals come back whole.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = null
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'restore cleared archived_at',
  (select archived_at is null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_bigint(
  'customer_count after restore',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  2);

-- Re-archive for the permanent-delete scenarios (the UI only offers
-- Delete permanently on an archived row).
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 8. Permanent delete: Editor, Viewer and outsider are refused with
--    42501 — only the owner destroys.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: editor was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: editor got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: viewer was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: viewer got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: outsider was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: outsider got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

-- A mismatched p_business_id is 'Customer not found' even for the
-- owner — the call cannot be aimed at another business's row.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000009');
    raise exception 'TEST FAILED: wrong business id was accepted';
  exception
    when no_data_found then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: wrong business id got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

-- ------------------------------------------------------------
-- 9. Owner succeeds: the customer AND every transaction are gone in
--    one atomic operation, and the bystander customer stays.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select public.delete_customer_permanently(
  'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_bigint(
  'customer row deleted',
  (select count(*) from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  0);
select pg_temp.expect_bigint(
  'its transactions deleted too (no cascade — the RPC does both)',
  (select count(*) from public.transactions
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  0);
select pg_temp.expect_bigint(
  'the bystander customer is untouched',
  (select count(*) from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000002'),
  1);

-- ------------------------------------------------------------
-- 10. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
