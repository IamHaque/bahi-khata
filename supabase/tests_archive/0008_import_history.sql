-- S-38: import_history() — the atomic, business-scoped CSV import.
--
-- Proves:
--   1. The happy path: one call creates the new customers AND their
--      transactions, tagged source 'import' with their HISTORICAL
--      dates, created_by = the caller, and reports both counts.
--   2. Name+phone matching stays inside THIS business and is
--      phone-specific: another business's same-named customer never
--      matches; within the business, "Asha Verma / 01911" picks the
--      01911 row, not the 01711 one.
--   3. A row matching an ARCHIVED customer raises the exact reason the
--      PRD pins — "Customer is archived. Restore them first."
--   4. Atomicity: any failure (archived match, unmatched customer,
--      outsider's RLS violation) rolls back the WHOLE import — the
--      new customers created earlier in the same call included. No
--      partial data, ever.
--   5. Anon cannot execute at all.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001-0008 applied. Any "TEST FAILED" exception means a
-- regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002..0007)
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

-- ------------------------------------------------------------
-- 2. Fixtures: Ollie owns Acme (two same-named customers differing
--    by phone, plus archived Bo); Zed owns ZedCo with his own
--    "Ghost" — another business's customer that must never match an
--    Acme import.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, phone, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01711 111111', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01911 222222', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo Archer',  null,          now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', 'Ghost',      '0777',        null, '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 3. Happy path: one new customer + two transactions (one matched by
--    phone-specific name+phone, one on the just-created customer).
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_num(
  'happy path reports 1 new customer and 2 transactions',
  (public.import_history(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '[{"name":"Newcomer","phone":"018"}]'::jsonb,
    '[
      {"customer_name":"Asha Verma","customer_phone":"01911 222222","type":"payment","amount":200,"occurred_at":"2024-01-10T10:00:00Z","note":"old diary"},
      {"customer_name":"Newcomer","customer_phone":"018","type":"charge","amount":500,"occurred_at":"2024-01-15T09:00:00Z","note":""}
    ]'::jsonb)->>'transactions_created')::numeric,
  2);

select pg_temp.as_admin();

select pg_temp.expect_bigint(
  'the new customer landed in Acme with the caller as creator',
  (select count(*) from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and name = 'Newcomer' and phone = '018'
     and created_by = '11111111-1111-1111-1111-111111111111'
     and archived_at is null),
  1);

select pg_temp.expect_bigint(
  'phone-specific match: the payment landed on Asha/01911, not Asha/01711',
  (select count(*) from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and customer_id = 'cccccccc-0000-0000-0000-000000000002'
     and type = 'payment' and amount = 200),
  1);

select pg_temp.expect_bigint(
  'every imported row is tagged source=import, status=active, with its historical date and note',
  (select count(*) from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and source = 'import' and status = 'active'
     and created_by = '11111111-1111-1111-1111-111111111111'
     and occurred_at in ('2024-01-10T10:00:00Z'::timestamptz, '2024-01-15T09:00:00Z'::timestamptz)
     and (note = 'old diary' or note is null)),
  2);

-- ------------------------------------------------------------
-- 4. Matching stays inside the business: ZedCo's "Ghost" never
--    matches an Acme import, and the failed import rolls back the
--    new customer created in the SAME call.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Ghost2","phone":"0778"}]'::jsonb,
      '[{"customer_name":"Ghost","customer_phone":"0777","type":"charge","amount":10,"occurred_at":"2024-02-01T00:00:00Z","note":null}]'::jsonb);
    raise exception 'TEST FAILED: another business''s customer was matched';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      if sqlerrm not like 'Import failed: no customer matched for "Ghost"' then
        raise exception 'TEST FAILED: unexpected reason: %', sqlerrm;
      end if;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_bigint(
  'the unmatched import rolled back completely: Ghost2 was not created',
  (select count(*) from public.customers where name = 'Ghost2'),
  0);

-- ------------------------------------------------------------
-- 5. Archived match: the PRD's exact reason, and the new customer in
--    the same call still rolls back.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Ghost3","phone":"0779"}]'::jsonb,
      '[{"customer_name":"Bo Archer","customer_phone":"","type":"charge","amount":10,"occurred_at":"2024-03-01T00:00:00Z","note":null}]'::jsonb);
    raise exception 'TEST FAILED: an archived customer was importable';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      if sqlerrm not like 'Customer is archived. Restore them first.' then
        raise exception 'TEST FAILED: unexpected reason: %', sqlerrm;
      end if;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_bigint(
  'the archived-match import rolled back completely: Ghost3 was not created',
  (select count(*) from public.customers where name = 'Ghost3'),
  0);

select pg_temp.expect_bigint(
  'and no transaction was added for the archived customer',
  (select count(*) from public.transactions
   where customer_id = 'cccccccc-0000-0000-0000-000000000003'),
  0);

-- ------------------------------------------------------------
-- 6. An outsider cannot import into Acme (RLS on the inserts), and
--    nothing persists.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Intruder","phone":""}]'::jsonb,
      '[]'::jsonb);
    raise exception 'TEST FAILED: an outsider imported into another business';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_bigint(
  'the outsider''s import persisted nothing',
  (select count(*) from public.customers where name = 'Intruder'),
  0);

-- ------------------------------------------------------------
-- 7. Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb, '[]'::jsonb);
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
