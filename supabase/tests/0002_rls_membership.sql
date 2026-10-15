-- ============================================================
-- 0002_rls_membership.sql  (S-06)
-- Proves the membership-based RLS from migration 0002.
--
-- Runs inside one rolled-back transaction. The v1 broad policies
-- are dropped first so the NEW policies are evaluated alone
-- (in the live database the old policies still OR in until S-20).
-- The drops are idempotent (`if exists`) so the script also passes
-- AFTER migration 0003, which removes the v1 policies for good.
--
-- Fixture: business 'Acme' owned by Olivia, Eli = Editor,
-- Vic = Viewer (a member from the start — an invitee, unlike a
-- member, correctly reads nothing; in section 8 Vic answers his
-- invitation anyway, taking the already-a-member path 0002b pins),
-- Zed = outsider. Business 'Beta' — owned by Bea,
-- a fifth fixture user, because D-01 (locked) allows at most one
-- OWNED business per user — exists so Eli can attempt a
-- cross-business transaction.
--
-- Run: Supabase SQL Editor (as postgres) or
--   psql "postgresql://postgres:postgres@localhost:5432/postgres" -f supabase/tests/0002_rls_membership.sql
-- Any "TEST FAILED" exception means a regression.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Drop the v1 broad policies (expand-phase workaround; a no-op
--    with `if exists` once S-20's migration 0003 has removed them)
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage transactions" on public.transactions;

-- ------------------------------------------------------------
-- 1. Test helpers (transaction-local)
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

-- ------------------------------------------------------------
-- 2. Fixtures
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',     '{"full_name":"Eli"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}'),
  ('55555555-5555-5555-5555-555555555555', 'bea@example.com',    '{"full_name":"Bea"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'Beta');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'editor');

insert into public.customers (business_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Customer One');

insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
values (
  (select id from public.customers where name = 'Customer One'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'charge', 500, now(),
  '11111111-1111-1111-1111-111111111111'
);

insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'viewer',
  '11111111-1111-1111-1111-111111111111'
);

-- ------------------------------------------------------------
-- 3. Assertion helpers
-- ------------------------------------------------------------
create or replace function pg_temp.expect_eq(p_what text, p_actual bigint, p_expected bigint)
returns void
language plpgsql
as $$
begin
  if p_actual <> p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_denied(p_what text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'TEST FAILED: % — statement was NOT rejected', p_what;
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      -- rejected as expected
      null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- 4. Members read, outsiders do not
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Olivia reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Olivia reads Acme transactions', v_count, 1);

  select count(*) into v_count from public.businesses;
  perform pg_temp.expect_eq('Olivia reads Acme business', v_count, 1);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Olivia reads Acme members', v_count, 3);

  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Olivia reads Acme invitations', v_count, 1);
end;
$$;

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Eli reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Eli reads Acme transactions', v_count, 1);
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Vic reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Vic reads Acme transactions', v_count, 1);
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Zed reads zero customers', v_count, 0);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Zed reads zero transactions', v_count, 0);

  select count(*) into v_count from public.businesses;
  perform pg_temp.expect_eq('Zed reads zero businesses', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Zed reads zero members', v_count, 0);

  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Zed reads zero invitations', v_count, 0);

  select count(*) into v_count from public.customer_balances;
  perform pg_temp.expect_eq('Zed reads zero balance-view rows', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 5. Viewer is read-only. Inserts raise 42501 (WITH CHECK on the
--    new row); row-scoped UPDATE/DELETE are filtered by RLS
--    instead — they match zero rows, which is why the assertions
--    below check that nothing changed rather than expecting an
--    error. Same semantics as tests 0004/0005.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select pg_temp.expect_denied(
  'Vic cannot insert a customer',
  $$insert into public.customers (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Nope')$$
);

do $$
declare
  v_count int;
begin
  update public.customers set name = 'Nope'
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Nope';
  perform pg_temp.expect_eq('Vic''s customer update changed zero rows', v_count, 0);
end;
$$;

do $$
declare
  v_count int;
begin
  delete from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Vic''s customer delete removed zero rows', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Vic cannot insert a transaction',
  $$insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
   values ((select id from public.customers where name = 'Customer One'), 'aaaaaaaa-0000-0000-0000-000000000001', 'charge', 10, now(), '33333333-3333-3333-3333-333333333333')$$
);

do $$
declare
  v_count int;
begin
  update public.transactions set amount = 1
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount = 1;
  perform pg_temp.expect_eq('Vic''s transaction update changed zero rows', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 6. Editor can write but not destroy
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  insert into public.customers (business_id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Customer Two');
  select count(*) into v_count from public.customers where name = 'Customer Two';
  perform pg_temp.expect_eq('Eli inserted a customer', v_count, 1);

  insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
  values ((select id from public.customers where name = 'Customer Two'),
          'aaaaaaaa-0000-0000-0000-000000000001', 'payment', 100, now(),
          '22222222-2222-2222-2222-222222222222');
  select count(*) into v_count from public.transactions where amount = 100;
  perform pg_temp.expect_eq('Eli inserted a transaction', v_count, 1);

  update public.customers set name = 'Customer Two Updated' where name = 'Customer Two';
  select count(*) into v_count from public.customers where name = 'Customer Two Updated';
  perform pg_temp.expect_eq('Eli updated a customer', v_count, 1);
end;
$$;

-- Cross-business transaction: Eli is an editor of Beta, but the
-- customer belongs to Acme — the 0001 match trigger must reject it.
select pg_temp.expect_denied(
  'Eli cannot move an Acme customer transaction into Beta',
  $$insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
   values ((select id from public.customers where name = 'Customer One'), 'bbbbbbbb-0000-0000-0000-000000000002', 'charge', 10, now(), '22222222-2222-2222-2222-222222222222')$$
);

do $$
declare
  v_count int;
begin
  delete from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Eli''s direct delete removed zero customers', v_count, 2);
end;
$$;

do $$
declare
  v_count int;
begin
  delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Eli''s business delete removed zero rows', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Eli cannot change a member role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'editor'::business_role)$$
);

select pg_temp.expect_denied(
  'Eli cannot remove a member',
  $$select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333')$$
);

do $$
declare
  v_count int;
begin
  update public.businesses set name = 'Hijacked'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses where name = 'Hijacked';
  perform pg_temp.expect_eq('Eli''s business update changed zero rows', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Eli cannot insert an invitation',
  $$insert into public.business_invitations (business_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001', 'forced@example.com', 'editor'::business_role, '22222222-2222-2222-2222-222222222222')$$
);

-- ------------------------------------------------------------
-- 7. Owner controls the business
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
  v_summary record;
begin
  update public.businesses set name = 'Acme Updated' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses where name = 'Acme Updated';
  perform pg_temp.expect_eq('Olivia updated the business', v_count, 1);

  select * into v_summary from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001');
  perform pg_temp.expect_eq('dashboard_summary open accounts', v_summary.open_accounts, 1);
  perform pg_temp.expect_eq('dashboard_summary today count', v_summary.today_count, 1);
  if v_summary.total_receivable <> 500 then
    raise exception 'TEST FAILED: dashboard_summary receivable — expected 500, got %', v_summary.total_receivable;
  end if;
  if v_summary.top_debtors is null or jsonb_array_length(v_summary.top_debtors) <> 1 then
    raise exception 'TEST FAILED: dashboard_summary top_debtors should have 1 entry';
  end if;

  select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'viewer';
  perform pg_temp.expect_eq('Olivia changed Eli to viewer', v_count, 1);

  select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role);
end;
$$;

select pg_temp.expect_denied(
  'Olivia cannot change her own owner role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'viewer'::business_role)$$
);

select pg_temp.expect_denied(
  'Olivia cannot leave her own business',
  $$select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 8. Invitations: visibility and responding
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'Vic@Example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Vic sees the invitation (case-insensitive email)', v_count, 1);
end;
$$;

do $$
declare
  v_invite public.business_invitations;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'vic@example.com'),
    true
  );
  if v_invite.status <> 'accepted' then
    raise exception 'TEST FAILED: invitation should be accepted, got %', v_invite.status;
  end if;
end;
$$;

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '33333333-3333-3333-3333-333333333333'
     and role = 'viewer';
  perform pg_temp.expect_eq('Vic is now a viewer member', v_count, 1);
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select pg_temp.expect_denied(
  'Vic cannot respond twice',
  $$select public.respond_to_invitation((select id from public.business_invitations where email = 'vic@example.com'), true)$$
);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Zed does not see the invitation', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Zed cannot accept Vic''s invitation',
  $$select public.respond_to_invitation((select id from public.business_invitations where email = 'vic@example.com'), true)$$
);

-- ------------------------------------------------------------
-- 9. Outsider cannot use dashboard_summary
-- ------------------------------------------------------------
select pg_temp.expect_denied(
  'Zed cannot call dashboard_summary for Acme',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 10. Owner cleanup: remove member, delete business (cascade)
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli was removed', v_count, 0);
end;
$$;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into v_count from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Olivia deleted the business', v_count, 0);

  select count(*) into v_count from public.business_members where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('members cascade-deleted', v_count, 0);

  select count(*) into v_count from public.customers where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('customers cascade-deleted', v_count, 0);

  select count(*) into v_count from public.transactions where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('transactions cascade-deleted', v_count, 0);

  select count(*) into v_count from public.business_invitations where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('invitations cascade-deleted', v_count, 0);
end;
$$;

rollback;

-- ============================================================
-- Note: transactions with NULL business_id are intentionally
-- not tested here. Before S-20's migration 0003 the v1 broad
-- policy allows them while the new policies are strict; after
-- 0003 no NULL business_id rows can exist (NOT NULL constraint),
-- so there is nothing left to test.
-- ============================================================
