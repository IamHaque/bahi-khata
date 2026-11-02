-- Migration: 20261201000200_v32_ownership_transfer.sql
-- Story: S-74 (B-14) Ownership transfer
-- Owner-only, atomic handover of business ownership to another member.

-- 1. Audit log table
create table if not exists public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_user uuid references auth.users(id) on delete set null,
  to_user uuid references auth.users(id) on delete set null,
  transferred_at timestamptz not null default now()
);

create index if not exists ownership_transfers_business_id_idx
  on public.ownership_transfers (business_id);

alter table public.ownership_transfers enable row level security;

drop policy if exists "ownership_transfers_select" on public.ownership_transfers;
create policy "ownership_transfers_select"
  on public.ownership_transfers
  for select
  to authenticated
  using (public.is_member(business_id));

revoke insert, update, delete on public.ownership_transfers from anon, authenticated;
grant select on public.ownership_transfers to authenticated;

-- 2. Atomic transfer RPC
create or replace function public.transfer_ownership(
  p_business_id uuid,
  p_new_owner uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_target_role business_role;
  v_result jsonb;
begin
  -- Lock the business row for update
  select id, owner_id into v_biz
    from public.businesses
   where id = p_business_id
     for update;

  if not found then
    raise exception 'Business not found.' using errcode = 'P0002';
  end if;

  -- 1. Caller check
  if auth.uid() is null or auth.uid() <> v_biz.owner_id then
    raise exception 'Only the owner can transfer ownership.' using errcode = '42501';
  end if;

  -- 2. Self-transfer check
  if p_new_owner = auth.uid() then
    raise exception 'You are already the owner.' using errcode = '55000';
  end if;

  -- 3. Target is member of this business
  select role into v_target_role
    from public.business_members
   where business_id = p_business_id
     and user_id = p_new_owner;

  if not found then
    raise exception 'Choose a member of this business.' using errcode = '55000';
  end if;

  -- 4. Target already owns a business
  if exists (
    select 1
      from public.businesses
     where owner_id = p_new_owner
       and id <> p_business_id
  ) then
    raise exception 'This person already owns a business. A person can own only one.' using errcode = '55000';
  end if;

  -- In this order:
  -- 1. Demote caller to editor (avoids violating partial unique index on owner)
  update public.business_members
     set role = 'editor'
   where business_id = p_business_id
     and user_id = auth.uid();

  -- 2. Promote target to owner
  update public.business_members
     set role = 'owner'
   where business_id = p_business_id
     and user_id = p_new_owner;

  -- 3. Update businesses.owner_id
  update public.businesses
     set owner_id = p_new_owner
   where id = p_business_id;

  -- 4. Record audit entry
  insert into public.ownership_transfers (business_id, from_user, to_user)
  values (p_business_id, auth.uid(), p_new_owner);

  -- Return the new member rows as jsonb
  select jsonb_agg(to_jsonb(bm)) into v_result
    from public.business_members bm
   where bm.business_id = p_business_id
     and bm.user_id in (auth.uid(), p_new_owner);

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- 3. Update leave_business message to mention ownership transfer
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
    raise exception 'Owners cannot leave. Transfer ownership first, or delete the business.'
      using errcode = '42501';
  end if;

  delete from public.business_members
   where business_id = p_business_id
     and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.leave_business(uuid) from public, anon;
grant execute on function public.leave_business(uuid) to authenticated;
