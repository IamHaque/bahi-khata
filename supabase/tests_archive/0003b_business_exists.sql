-- S-27: business_exists() — the lost-access probe.
--
-- Proves:
--   1. Any authenticated user learns whether a business row exists,
--      whether or not they are a member (member and outsider alike) —
--      this is the bit the client uses to tell "removed" from
--      "deleted".
--   2. A nonexistent id returns false (no error), so a deleted business
--      is distinguishable from a removed membership.
--   3. After the business row is deleted the probe returns false.
--   4. The function leaks nothing else and is not callable anonymously.
--
-- Run like the other test files: one transaction, rolled back; needs
-- migrations 0001, 0002, 0003b applied. Any "TEST FAILED" exception
-- means a regression.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002/0002b/0002c)
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

-- ------------------------------------------------------------
-- 2. Fixtures: Olivia owns Acme; Vic is a member; Zed is an outsider.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',    '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',    '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

-- ------------------------------------------------------------
-- 3. Members and outsiders both see existence: the owner, a member and
--    a complete outsider all get true; a missing id gives false.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_bool(
  'owner sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
select pg_temp.expect_bool(
  'member sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bool(
  'outsider sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);
select pg_temp.expect_bool(
  'missing id is false, not an error',
  public.business_exists('eeeeeeee-0000-0000-0000-000000000009'), false);

-- ------------------------------------------------------------
-- 4. The removed-member and deleted-business cases the S-27 guard
--    distinguishes: removal keeps the row (exists = true), deletion
--    removes it (exists = false).
-- ------------------------------------------------------------
select pg_temp.as_admin();
delete from public.business_members
 where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and user_id = '33333333-3333-3333-3333-333333333333';

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
select pg_temp.expect_bool(
  'after removal the business still exists (access lost, not deleted)',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_admin();
delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bool(
  'after deletion the business no longer exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), false);

-- ------------------------------------------------------------
-- 5. Nothing for anonymous callers: the function is not executable by
--    the anon role or the public role.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.business_exists('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

rollback;
