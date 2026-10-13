-- ============================================================
-- 0002_membership_rls.sql  (S-06)
-- Membership-based RLS, helper functions, RPCs and secure views.
-- Expand phase: the v1 broad policies stay in place (permissive
-- policies OR together), so these new policies only ADD access.
-- The old policies are dropped in 0003 (S-20).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helper functions (security definer, fixed search_path)
-- ------------------------------------------------------------

create or replace function public.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members
     where business_id = p_business_id
       and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_role(p_business_id uuid, p_minimum business_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members
     where business_id = p_business_id
       and user_id = (select auth.uid())
       and case p_minimum
             when 'viewer' then role in ('viewer', 'editor', 'owner')
             when 'editor' then role in ('editor', 'owner')
             when 'owner'  then role = 'owner'
           end
  );
$$;

-- ------------------------------------------------------------
-- 2. RLS on the new tables
-- ------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.businesses          enable row level security;
alter table public.business_members    enable row level security;
alter table public.business_invitations enable row level security;

-- profiles: readable by users who share a business with the profile owner
create policy "Co-members can read profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.business_members me
        join public.business_members other
          on other.business_id = me.business_id
       where me.user_id = (select auth.uid())
         and other.user_id = public.profiles.id
    )
  );

-- businesses: members can read; only the owner can update or delete;
-- insert only with owner_id = auth.uid()
create policy "Members can read businesses"
  on public.businesses
  for select
  to authenticated
  using (public.is_member(id));

create policy "Owners can update businesses"
  on public.businesses
  for update
  to authenticated
  using (public.has_role(id, 'owner'))
  with check (public.has_role(id, 'owner'));

create policy "Owners can delete businesses"
  on public.businesses
  for delete
  to authenticated
  using (public.has_role(id, 'owner'));

create policy "Users can create their own business"
  on public.businesses
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- business_members: co-members can read; all writes go through the
-- security-definer RPCs (change_member_role, remove_member,
-- respond_to_invitation, leave_business), so no write policies here.
create policy "Members can read business_members"
  on public.business_members
  for select
  to authenticated
  using (public.is_member(business_id));

-- business_invitations: the owner can read/insert/update/delete;
-- the invited person can read rows matching their JWT email
-- (case-insensitive; email is stored lowercased).
create policy "Owners can read invitations"
  on public.business_invitations
  for select
  to authenticated
  using (public.has_role(business_id, 'owner'));

create policy "Invitees can read their invitations"
  on public.business_invitations
  for select
  to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

create policy "Owners can insert invitations"
  on public.business_invitations
  for insert
  to authenticated
  with check (public.has_role(business_id, 'owner'));

create policy "Owners can update invitations"
  on public.business_invitations
  for update
  to authenticated
  using (public.has_role(business_id, 'owner'))
  with check (public.has_role(business_id, 'owner'));

create policy "Owners can delete invitations"
  on public.business_invitations
  for delete
  to authenticated
  using (public.has_role(business_id, 'owner'));

-- ------------------------------------------------------------
-- 3. Membership policies on customers and transactions
--    (additive: the v1 broad policies still OR in until S-20)
-- ------------------------------------------------------------

create policy "Members can read customers"
  on public.customers
  for select
  to authenticated
  using (public.is_member(business_id));

create policy "Editors can insert customers"
  on public.customers
  for insert
  to authenticated
  with check (public.has_role(business_id, 'editor'));

create policy "Editors can update customers"
  on public.customers
  for update
  to authenticated
  using (public.has_role(business_id, 'editor'))
  with check (public.has_role(business_id, 'editor'));

create policy "Owners can delete customers"
  on public.customers
  for delete
  to authenticated
  using (public.has_role(business_id, 'owner'));

create policy "Members can read transactions"
  on public.transactions
  for select
  to authenticated
  using (public.is_member(business_id));

create policy "Editors can insert transactions"
  on public.transactions
  for insert
  to authenticated
  with check (public.has_role(business_id, 'editor'));

create policy "Editors can update transactions"
  on public.transactions
  for update
  to authenticated
  using (public.has_role(business_id, 'editor'))
  with check (public.has_role(business_id, 'editor'));

-- ------------------------------------------------------------
-- 4. Secure views (security_invoker = true: the caller's RLS
--    applies to the underlying tables)
-- ------------------------------------------------------------

-- business_id is part of the view (S-20) so balance reads can be scoped
-- like every other query; the join also requires matching businesses so
-- a stray cross-business row can never leak into a balance.
create or replace view public.customer_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.business_id,
  coalesce(sum(
    case when t.type = 'charge' then t.amount else -t.amount end
  ) filter (where t.status in ('active', 'edited')), 0) as balance
from public.customers c
left join public.transactions t
  on t.customer_id = c.id
 and t.business_id = c.business_id
where c.deleted_at is null
group by c.id;

-- ------------------------------------------------------------
-- 5. RPCs (all security definer, all validating the caller)
-- ------------------------------------------------------------

-- 5a. Create a business. One per user (also enforced by the unique
--     index). The 0001 trigger adds the Owner membership row.
create or replace function public.create_business(
  p_name text,
  p_business_type text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
begin
  if exists (
    select 1 from public.businesses
     where owner_id = (select auth.uid())
  ) then
    raise exception 'You already own a business.'
      using errcode = '42501';
  end if;

  insert into public.businesses
    (owner_id, name, business_type, phone, email, address, notes)
  values
    ((select auth.uid()), p_name, p_business_type, p_phone, p_email, p_address, p_notes)
  returning * into v_business;

  return v_business;
end;
$$;

-- 5b. Accept or decline an invitation. Only the invited email may
--     respond, only pending invitations can be responded to, and
--     accepting twice (already a member) is treated as success.
create or replace function public.respond_to_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns public.business_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.business_invitations;
begin
  select * into v_invite
    from public.business_invitations
   where id = p_invitation_id
     and email = lower((select auth.jwt() ->> 'email'))
     and status = 'pending'
   for update;

  if v_invite.id is null then
    raise exception 'This invitation is no longer available.'
      using errcode = '42501';
  end if;

  if p_accept then
    insert into public.business_members (business_id, user_id, role)
    values (v_invite.business_id, (select auth.uid()), v_invite.role)
    on conflict (business_id, user_id) do nothing;
  end if;

  update public.business_invitations
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = v_invite.id
  returning * into v_invite;

  return v_invite;
end;
$$;

-- 5c. Leave a business. Owners cannot leave (they must delete the
--     business instead).
create or replace function public.leave_business(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.business_members
     where business_id = p_business_id
       and user_id = (select auth.uid())
       and role = 'owner'
  ) then
    raise exception 'Owners cannot leave. Delete the business instead.'
      using errcode = '42501';
  end if;

  delete from public.business_members
   where business_id = p_business_id
     and user_id = (select auth.uid());
end;
$$;

-- 5d. Change a member's role. Owner-only; the owner row is
--     protected; promoting to owner is not allowed (ownership
--     transfer is out of scope).
create or replace function public.change_member_role(
  p_business_id uuid,
  p_user_id uuid,
  p_new_role business_role
)
returns public.business_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.business_members;
begin
  if not public.has_role(p_business_id, 'owner') then
    raise exception 'Only the owner can change roles.'
      using errcode = '42501';
  end if;

  if p_new_role = 'owner' then
    raise exception 'Ownership cannot be transferred this way.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.business_members
     where business_id = p_business_id
       and user_id = p_user_id
       and role = 'owner'
  ) then
    raise exception 'The owner role cannot be changed.'
      using errcode = '42501';
  end if;

  update public.business_members
     set role = p_new_role
   where business_id = p_business_id
     and user_id = p_user_id
  returning * into v_member;

  if v_member.user_id is null then
    raise exception 'This person is not a member of the business.'
      using errcode = '42501';
  end if;

  return v_member;
end;
$$;

-- 5e. Remove a member. Owner-only; the owner row is protected.
create or replace function public.remove_member(
  p_business_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_business_id, 'owner') then
    raise exception 'Only the owner can remove members.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.business_members
     where business_id = p_business_id
       and user_id = p_user_id
       and role = 'owner'
  ) then
    raise exception 'The owner cannot be removed.'
      using errcode = '42501';
  end if;

  delete from public.business_members
   where business_id = p_business_id
     and user_id = p_user_id;
end;
$$;

-- 5f. Dashboard summary for one business. Members only. Excludes
--     voided transactions and archived customers (C-6).
create or replace function public.dashboard_summary(p_business_id uuid)
returns table (
  total_receivable numeric,
  total_credit numeric,
  open_accounts bigint,
  today_count bigint,
  today_net numeric,
  customer_count bigint,
  top_debtors jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.'
      using errcode = '42501';
  end if;

  return query
  with balances as (
    select c.id, c.name,
      coalesce(sum(
        case when t.type = 'charge' then t.amount else -t.amount end
      ) filter (where t.status in ('active', 'edited')), 0) as balance
    from public.customers c
    left join public.transactions t
      on t.customer_id = c.id
     and t.business_id = c.business_id
    where c.business_id = p_business_id
      and c.deleted_at is null
    group by c.id, c.name
  ),
  today as (
    select
      count(*) as cnt,
      coalesce(sum(
        case when t.type = 'charge' then t.amount else -t.amount end
      ) filter (where t.status in ('active', 'edited')), 0) as net
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    where t.business_id = p_business_id
      and c.deleted_at is null
      and t.status in ('active', 'edited')
      and t.occurred_at >= date_trunc('day', now())
      and t.occurred_at <  date_trunc('day', now()) + interval '1 day'
  )
  select
    coalesce(sum(balance) filter (where balance > 0), 0),
    coalesce(sum(abs(balance)) filter (where balance < 0), 0),
    count(*) filter (where balance <> 0),
    (select cnt from today),
    (select net from today),
    (select count(*) from balances),
    (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'balance', balance)
        order by balance desc
      ), '[]'::jsonb)
      from (
        select id, name, balance
        from balances
        where balance > 0
        order by balance desc
        limit 8
      ) d
    )
  from balances;
end;
$$;

-- ------------------------------------------------------------
-- Rollback (only safe before S-20; run inside a transaction)
-- ------------------------------------------------------------
-- drop function if exists public.dashboard_summary(uuid);
-- drop function if exists public.remove_member(uuid, uuid);
-- drop function if exists public.change_member_role(uuid, uuid, business_role);
-- drop function if exists public.leave_business(uuid);
-- drop function if exists public.respond_to_invitation(uuid, boolean);
-- drop function if exists public.create_business(text, text, text, text, text, text);
-- drop view if exists public.customer_balances;
-- drop policy "Editors can update transactions" on public.transactions;
-- drop policy "Editors can insert transactions" on public.transactions;
-- drop policy "Members can read transactions" on public.transactions;
-- drop policy "Owners can delete customers" on public.customers;
-- drop policy "Editors can update customers" on public.customers;
-- drop policy "Editors can insert customers" on public.customers;
-- drop policy "Members can read customers" on public.customers;
-- drop policy "Owners can delete invitations" on public.business_invitations;
-- drop policy "Owners can update invitations" on public.business_invitations;
-- drop policy "Owners can insert invitations" on public.business_invitations;
-- drop policy "Invitees can read their invitations" on public.business_invitations;
-- drop policy "Owners can read invitations" on public.business_invitations;
-- drop policy "Members can read business_members" on public.business_members;
-- drop policy "Users can create their own business" on public.businesses;
-- drop policy "Owners can delete businesses" on public.businesses;
-- drop policy "Owners can update businesses" on public.businesses;
-- drop policy "Members can read businesses" on public.businesses;
-- drop policy "Co-members can read profiles" on public.profiles;
-- alter table public.business_invitations disable row level security;
-- alter table public.business_members disable row level security;
-- alter table public.businesses disable row level security;
-- alter table public.profiles disable row level security;
-- drop function if exists public.has_role(uuid, business_role);
-- drop function if exists public.is_member(uuid);
