-- ============================================================
-- 0001_multi_business_schema.sql  (S-05)
-- Additive multi-business schema.
-- Expand phase: every new column is nullable, no old policy is
-- dropped, no existing query changes meaning. Enforcement
-- lands in 0003 (S-20).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enum types (idempotent, same style as the v1 baseline)
-- ------------------------------------------------------------

do $$ begin
  create type business_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- 2. profiles — mirror of auth.users for member lists/audit
-- ------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. businesses
-- ------------------------------------------------------------

create table if not exists businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users,
  name          text not null check (char_length(btrim(name)) between 2 and 80),
  business_type text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One owned business per user (D-01), enforced by the database.
create unique index if not exists businesses_one_per_owner
  on businesses (owner_id);

-- ------------------------------------------------------------
-- 4. business_members
-- ------------------------------------------------------------

create table if not exists business_members (
  business_id uuid not null references businesses on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        business_role not null,
  joined_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- An Owner row can never be changed or removed except by deleting
-- the business: at most one owner row per business.
create unique index if not exists one_owner_row_per_business
  on business_members (business_id) where role = 'owner';

-- ------------------------------------------------------------
-- 5. business_invitations
-- ------------------------------------------------------------

create table if not exists business_invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses on delete cascade,
  email        text not null check (email = lower(email)),
  role         business_role not null check (role in ('editor', 'viewer')),
  status       invitation_status not null default 'pending',
  invited_by   uuid not null references auth.users,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists one_pending_invite_per_email
  on business_invitations (business_id, email) where status = 'pending';

-- ------------------------------------------------------------
-- 6. Additive columns on existing tables (all nullable)
-- ------------------------------------------------------------

alter table customers
  add column if not exists business_id uuid references businesses on delete cascade,
  add column if not exists created_by  uuid references auth.users,
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references auth.users;

alter table transactions
  add column if not exists business_id  uuid references businesses on delete cascade,
  add column if not exists updated_by   uuid references auth.users,
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references auth.users;

create index if not exists customers_business_deleted_idx
  on customers (business_id, deleted_at);
create index if not exists transactions_business_occurred_idx
  on transactions (business_id, occurred_at desc);
create index if not exists transactions_business_customer_idx
  on transactions (business_id, customer_id);

-- ------------------------------------------------------------
-- 7. Integrity triggers
-- ------------------------------------------------------------

-- 7a. A transaction's business_id must match its customer's business_id.
--     Null business_id is allowed during the expand phase (until S-20).
create or replace function public.assert_transaction_business_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_business uuid;
begin
  if new.business_id is null then
    return new;
  end if;

  select business_id
    into v_customer_business
    from public.customers
   where id = new.customer_id;

  if v_customer_business is distinct from new.business_id then
    raise exception 'Transaction business (%) does not belong to the customer''s business (%)',
      new.business_id, v_customer_business
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_business_match on public.transactions;
create trigger transactions_business_match
  before insert or update on public.transactions
  for each row execute function public.assert_transaction_business_match();

-- 7b. Creating a business automatically adds the Owner membership row.
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists businesses_add_owner on public.businesses;
create trigger businesses_add_owner
  after insert on public.businesses
  for each row execute function public.add_owner_membership();

-- 7c. New auth users get a profiles row from their Google identity.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update
    set email       = excluded.email,
        full_name   = excluded.full_name,
        avatar_url  = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7d. One-time backfill of profiles for users who signed up before
--     the trigger existed. Safe to re-run.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Rollback (only safe before S-20; run inside a transaction)
-- ------------------------------------------------------------
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop trigger if exists businesses_add_owner on public.businesses;
-- drop function if exists public.add_owner_membership();
-- drop trigger if exists transactions_business_match on public.transactions;
-- drop function if exists public.assert_transaction_business_match();
-- drop index if exists public.transactions_business_customer_idx;
-- drop index if exists public.transactions_business_occurred_idx;
-- drop index if exists public.customers_business_deleted_idx;
-- alter table public.transactions
--   drop column if exists business_id,
--   drop column if exists updated_by,
--   drop column if exists voided_at,
--   drop column if exists voided_by;
-- alter table public.customers
--   drop column if exists business_id,
--   drop column if exists created_by,
--   drop column if exists deleted_at,
--   drop column if exists deleted_by;
-- drop table if exists public.business_invitations;
-- drop table if exists public.business_members;
-- drop table if exists public.businesses;
-- drop table if exists public.profiles;
-- drop type if exists public.invitation_status;
-- drop type if exists public.business_role;
