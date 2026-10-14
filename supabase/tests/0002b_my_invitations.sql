-- S-24 (migration 0002b): my_invitations() — the invitee-facing view of
-- pending invitations, with business name and inviter name that RLS
-- correctly hides from non-members.
--
-- Proves:
--   1. The invitee sees exactly their own pending invitation, joined with
--      the business name and the inviter's display name.
--   2. Email matching is case-insensitive (JWT email vs stored email).
--   3. An outsider with no invitation sees nothing (no data leak).
--   4. Once answered (accepted or declined), the invitation leaves the
--      list — the stale-invitation case starts with an empty list here
--      and respond_to_invitation raising, as tested in 0002.
--
-- Run like 0002_rls_membership.sql: one transaction, rolled back; needs
-- migrations 20260913152312, 20260913170000, 0001 and 0002 applied.

begin;

-- ------------------------------------------------------------
-- 1. Helpers (transaction-local, same pattern as 0002)
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

-- ------------------------------------------------------------
-- 2. Fixtures
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'viewer',
  '11111111-1111-1111-1111-111111111111'
);

-- ------------------------------------------------------------
-- 3. The invitee sees their invitation with business and inviter names
--    (JWT email is mixed-case on purpose — matching must ignore case)
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'Vic@Example.com');

do $$
declare
  v_invite record;
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Vic sees exactly one invitation', v_count, 1);

  select * into v_invite from public.my_invitations() limit 1;
  perform pg_temp.expect_text('Business name is joined in', v_invite.business_name, 'Acme');
  perform pg_temp.expect_text('Inviter display name is joined in', v_invite.inviter_name, 'Olivia');
  perform pg_temp.expect_text('The invited role is preserved', v_invite.role::text, 'viewer');
end;
$$;

-- ------------------------------------------------------------
-- 4. An outsider sees nothing
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Zed sees zero invitations', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 5. Answering removes the invitation from the list (accept path);
--    a declined invitation also disappears. The list and the RPC agree.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

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

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Accepted invitation leaves the list', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Vic is now a member', v_count, 1);
end;
$$;

-- A declined invitation disappears the same way.
insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'zed@example.com', 'editor',
  '11111111-1111-1111-1111-111111111111'
);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_invite public.business_invitations;
  v_count int;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'zed@example.com'),
    false
  );
  if v_invite.status <> 'declined' then
    raise exception 'TEST FAILED: invitation should be declined, got %', v_invite.status;
  end if;

  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Declined invitation leaves the list', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Declining does not create a membership', v_count, 1);
end;
$$;

-- ------------------------------------------------------------
-- 6. Accepting while already a member is a success, not an error
--    (the S-24 "already a member" scenario: the insert is
--    `on conflict do nothing`, so a second accept just works)
-- ------------------------------------------------------------
insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'editor',
  '11111111-1111-1111-1111-111111111111'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

do $$
declare
  v_invite public.business_invitations;
  v_count int;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'vic@example.com'),
    true
  );
  if v_invite.status <> 'accepted' then
    raise exception 'TEST FAILED: re-accept should succeed, got %', v_invite.status;
  end if;

  -- No duplicate membership row appeared.
  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Re-accepting adds no duplicate membership', v_count, 1);
end;
$$;

select pg_temp.as_admin();

rollback;
