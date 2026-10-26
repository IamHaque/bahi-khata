-- S-34: void with a reason, restore via restore_transaction().
--
-- Proves:
--   1. A viewer cannot void (their update matches zero rows); an
--      editor can — voiding is plain RLS on transactions, the reason
--      rides along in void_reason.
--   2. The invariant: voiding stamps voided_by/voided_at/void_reason
--      and NEVER touches updated_by — updated_by still means
--      "content-edited at least once", which is restore's input.
--   3. A voided row leaves the balance view and dashboard_summary;
--      restore brings it back.
--   4. restore_transaction() decides the restored status from the row:
--      "edited" if it had been edited before, otherwise "active" —
--      and clears the void's stamps.
--   5. Restoring a row that is not voided, restoring with a mismatched
--      business id, and an outsider's call all end in
--      'Void transaction not found.'; anon cannot execute at all.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001, 0002, 0003, 0003b, 0004 and 0005 applied. Any
-- "TEST FAILED" exception means a regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002/0002b/0002c/0003b/0004)
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

create or replace function pg_temp.expect_text(p_what text, p_actual text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- Overload to support transaction_status enum
create or replace function pg_temp.expect_text(p_what text, p_actual public.transaction_status, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual::text is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme; Evan is an editor, Vic a viewer and
--    Zed a complete outsider. Asha owes 4500 (charge 5000, payment
--    500). The charge had been EDITED before (updated_by set), the
--    payment never was.
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
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by, updated_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '1 day', '11111111-1111-1111-1111-111111111111', null);

-- ------------------------------------------------------------
-- 3. Baseline: Asha owes 4500.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_num(
  'baseline balance',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);

-- ------------------------------------------------------------
-- 4. Viewer cannot void: their update matches zero rows and the row
--    stays active.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
update public.transactions
   set status = 'voided', void_reason = 'viewer attempt', voided_at = now(), voided_by = '33333333-3333-3333-3333-333333333333'
 where id = 'dddddddd-0000-0000-0000-000000000002'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_text(
  'viewer void attempt left the payment active',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'active');

-- ------------------------------------------------------------
-- 5. Editor voids the payment with a reason (the exact payload the
--    client sends). The invariant: updated_by stays NULL — it still
--    means "content-edited at least once".
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.transactions
   set status = 'voided', void_reason = 'Duplicate entry', voided_at = now(), voided_by = '22222222-2222-2222-2222-222222222222', updated_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000002'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_text(
  'payment is voided with its reason',
  (select void_reason from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'Duplicate entry');
select pg_temp.expect_bool(
  'void stamps the voider',
  (select voided_by is not null from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);
select pg_temp.expect_bool(
  'the restore marker survives the void (updated_by untouched)',
  (select updated_by is null from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);

-- ------------------------------------------------------------
-- 6. The voided row leaves the math: balance and dashboard totals.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_num(
  'balance stops counting the voided payment',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  5000);
select pg_temp.expect_num(
  'dashboard receivable drops the voided payment',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  5000);

-- ------------------------------------------------------------
-- 7. Restore of the never-edited payment: back to active, stamps
--    cleared, math restored.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
select public.restore_transaction(
  'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_text(
  'never-edited row restores as active',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'active');
select pg_temp.expect_bool(
  'restore cleared the void stamps',
  (select void_reason is null and voided_at is null and voided_by is null
     from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);
select pg_temp.expect_num(
  'balance counts it again',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);

-- ------------------------------------------------------------
-- 8. Edited-before survives the round trip: the charge (updated_by
--    set) goes void and comes back EDITED, not plain active.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.transactions
   set status = 'voided', void_reason = 'Wrong customer', voided_at = now(), voided_by = '22222222-2222-2222-2222-222222222222', updated_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select public.restore_transaction(
  'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_text(
  'edited-before row restores as edited',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000001'),
  'edited');

-- ------------------------------------------------------------
-- 9. Refusals: not-voided, mismatched business, complete outsider.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
do $$
begin
  begin
    -- The payment is active again (step 7): nothing to restore.
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: restoring an active row was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'not-voided restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

do $$
begin
  begin
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000009');
    raise exception 'TEST FAILED: wrong business id was accepted';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'wrong-business restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
do $$
begin
  begin
    -- Security INVOKER: Zed's RLS matches zero rows, so the update
    -- finds nothing and the function refuses.
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: an outsider restored a row';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'outsider restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

-- ------------------------------------------------------------
-- 10. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
