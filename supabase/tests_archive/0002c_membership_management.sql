-- S-25: change role, remove member, leave business — the database half
-- of the membership-management scenarios. The RPCs live in migration
-- 0002; this file proves the guarantees the S-25 UI relies on.
--
-- Proves:
--   1. The owner changes a member's role (editor -> viewer -> editor).
--   2. Promoting anyone to owner is refused (ownership transfer is out
--      of scope) and the owner row cannot be removed — the "owner row
--      is protected" scenario, enforced in the database.
--   3. The owner removes a member: the membership row goes, the member
--      loses all access (reads return nothing, RPCs are denied), and
--      NOTHING they created disappears — customers and transactions
--      stay ("history stays readable").
--   4. A member leaves the business themselves: same loss of access,
--      scoped to their own membership row only.
--   5. After removal the creator's name still resolves from profiles
--      while the profile row exists; once the profile row is gone the
--      transaction remains and the join yields NULL — the UI renders
--      'Former member' for that case (display lands with S-35's
--      "Recorded by" column; this test pins the data contract).
--
-- Non-owner denial (editor cannot change roles or remove) is already
-- proven in 0002_rls_membership.sql section 6 — same RPCs, same 42501.
--
-- Run like 0002_rls_membership.sql: one transaction, rolled back; needs
-- migrations 20260913152312, 20260913170000, 0001 and 0002 applied.
-- Any "TEST FAILED" exception means a regression.

begin;

-- ------------------------------------------------------------
-- 0. Drop the v1 broad policies (same expand-phase workaround as
--    0002_rls_membership.sql; a no-op with `if exists` after S-20)
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage transactions" on public.transactions;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002/0002b)
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

create or replace function pg_temp.expect_eq(p_what text, p_actual int, p_expected int)
returns void
language plpgsql
as $$
begin
  if p_actual <> p_expected then
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
-- 2. Fixtures: Olivia owns Acme; Eli (editor) created a customer and
--    a transaction; Vic is a viewer; Zed is an outsider.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',     '{"full_name":"Eli"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

-- Eli records history for Acme.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

insert into public.customers (business_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'History Customer');

insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
values (
  (select id from public.customers where name = 'History Customer'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'charge', 75, now(),
  '22222222-2222-2222-2222-222222222222'
);

select pg_temp.as_admin();

-- ------------------------------------------------------------
-- 3. Owner changes a role; promotion to owner and touching the owner
--    row are refused ("owner row is protected")
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'viewer';
  perform pg_temp.expect_eq('Olivia changed Eli to viewer', v_count, 1);

  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'editor';
  perform pg_temp.expect_eq('Olivia changed Eli back to editor', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Nobody can be promoted to owner',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner'::business_role)$$
);

select pg_temp.expect_denied(
  'The owner row cannot be removed',
  $$select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111')$$
);

select pg_temp.expect_denied(
  'The owner cannot leave their own business',
  $$select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 4. Owner removes Eli: membership gone, access gone, history intact
-- ------------------------------------------------------------
select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s membership row is gone', v_count, 0);

  -- History stays readable: nothing Eli created was touched.
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and name = 'History Customer';
  perform pg_temp.expect_eq('Eli''s customer remains', v_count, 1);

  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s transaction remains', v_count, 1);
end;
$$;

-- Eli has lost access: reads return nothing and the RPCs refuse.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Removed Eli reads zero customers', v_count, 0);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Removed Eli reads zero transactions', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Removed Eli sees no memberships', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Removed Eli cannot call dashboard_summary',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

select pg_temp.expect_denied(
  'Removed Eli cannot re-add himself via change_member_role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role)$$
);

-- ------------------------------------------------------------
-- 5. Vic leaves the business himself
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members where user_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.expect_eq('Vic sees no memberships after leaving', v_count, 0);

  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Departed Vic reads zero customers', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Departed Vic cannot call dashboard_summary',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- Only Vic's own membership row went; the owner is untouched.
select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Only the owner remains a member', v_count, 1);
end;
$$;

-- ------------------------------------------------------------
-- 6. History contract: creator name resolves while the profile row
--    exists AND is readable; once removal (or a deleted profile) hides
--    it, the join yields NULL — the UI renders 'Former member' — and
--    the transaction itself never moves.
-- ------------------------------------------------------------
-- Right after the removal: remove_member deleted ONLY the membership
-- row. As postgres the profile is still there; under Olivia's
-- (authenticated) RLS the co-members policy no longer matches Eli, so
-- her join sees NULL — exactly the app-side situation that must render
-- 'Former member', never an error and never a missing transaction.
do $$
declare
  v_count int;
  v_name  text;
begin
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s transaction is still there for the owner', v_count, 1);
end;
$$;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_name text;
begin
  select p.full_name into v_name
    from public.transactions t
    join public.profiles p on p.id = t.created_by
   where t.created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('Removed member''s name is RLS-hidden (UI: Former member)', v_name, null);
end;
$$;

select pg_temp.as_admin();

do $$
declare
  v_name text;
begin
  -- Nothing was deleted: at the database level the row and name exist.
  select full_name into v_name from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('remove_member deleted nothing but the membership row', v_name, 'Eli');
end;
$$;

delete from public.profiles where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_count int;
  v_name  text;
begin
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Transaction survives the profile being gone', v_count, 1);

  select p.full_name into v_name
    from public.transactions t
    join public.profiles p on p.id = t.created_by
   where t.created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('Creator name is NULL once the profile is gone (UI: Former member)', v_name, null);
end;
$$;

rollback;
