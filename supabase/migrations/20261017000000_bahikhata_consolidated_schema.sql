-- ============================================================================
-- BahiKhata — CONSOLIDATED SCHEMA MIGRATION
-- ============================================================================
-- Replaces (squashes) all of the following, which can be archived:
--
--   20260913152312_remote_schema            v1 baseline: customers, transactions
--   20260913170000_add_balance_rpc_functions v1 balance RPCs (dropped again below)
--   0001_multi_business_schema              S-05  multi-business tables + triggers
--   0002_membership_rls                     S-06  RLS, helpers, RPCs, balance view
--   0002b_my_invitations                    S-24  my_invitations()
--   0003_enforce_tenancy                    S-20  NOT NULL tenancy, drop v1 policies
--   0003b_business_exists                   S-27  business_exists()
--   0004_customer_archive_delete            S-30  archive + permanent delete
--   0005_void_reason_restore                S-34  restore_transaction()
--   0006_customer_ledger                    S-31  customer_ledger()
--   0006b_transaction_rollup                S-35  transaction_rollup()
--   0007_daily_activity                     S-37  daily_activity()
--   0008_import_history                     S-38  import_history()
--   0009_void_reason_column                 transactions.void_reason
--   0009_customer_balances_pk_name          customer_balances.id
--   0010_respond_invitation_status_cast     enum cast fix
--   0010_customer_balances_computed_relationship  PostgREST embed
--
-- END STATE IS IDENTICAL to running the old chain in its intended order, plus
-- the clearly-labelled fixes listed next.
--
-- FIXES vs. the old chain
--   F1  Ordering. The old files sort wrongly by name: 0001..0010 run BEFORE
--       the 2026091x baseline files, so a fresh `supabase db reset` fails at
--       0001 ("relation customers does not exist"), and even if forced, the
--       v1 balance RPCs (SECURITY DEFINER, no tenancy check) would be
--       re-created AFTER 0003 dropped them. Here everything is in dependency
--       order and the v1 RPCs are never created.
--   F2  void_reason is created before restore_transaction() uses it (0005
--       referenced a column that only appeared in 0009).
--   F3  Duplicate version prefixes (two 0009_*, two 0010_*) are gone — the
--       CLI keys migration history on the numeric prefix.
--   F4  respond_to_invitation() ships with the enum-cast fix from the start.
--   F5  Hardening (section 14): EXECUTE revoked from `anon`/PUBLIC on every
--       function; business_id made immutable once set (an editor of two
--       businesses could previously move a customer across tenants and
--       strand its transactions); transaction_rollup's search now treats
--       % and _ literally instead of as wildcards.
--
-- HOW TO APPLY
--   * Fresh database:  supabase db reset   (only this file in /migrations).
--   * Existing database that already ran the old chain: do NOT re-run it as a
--     new migration. Mark it as applied instead (see README / chat notes):
--       supabase migration repair --status reverted <old versions...>
--       supabase migration repair --status applied  20261017000000
--     The file is also written to be safely re-runnable (idempotent), so
--     running it once by hand against the live DB is harmless.
--
-- SECTIONS
--    1. Enum types
--    2. Tables, catch-up columns, indexes, mandatory tenancy
--    3. Legacy cleanup (v1 policies and v1 balance RPCs)
--    4. RLS helper functions
--    5. Integrity triggers
--    6. Row-level security policies
--    7. Views (customer_balances + PostgREST computed relationship)
--    8. Membership / business RPCs
--    9. Customer lifecycle RPCs
--   10. Transaction RPCs (restore, ledger)
--   11. Reporting RPCs (dashboard, rollup, daily activity)
--   12. Import RPC
--   13. Function privileges (EXECUTE grants)
--   14. Hardening
--   15. PostgREST schema reload
-- ============================================================================

begin;

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
-- Wrapped in DO blocks because CREATE TYPE has no IF NOT EXISTS.

do $$ begin
  create type transaction_type   as enum ('charge', 'payment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_status as enum ('active', 'edited', 'voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_source as enum ('manual', 'import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type business_role      as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_status  as enum ('pending', 'accepted', 'declined', 'revoked');
exception when duplicate_object then null; end $$;


-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- 2a. profiles — mirror of auth.users for member lists / audit display.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 2b. businesses — the tenant. D-01: one OWNED business per user.
create table if not exists public.businesses (
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

create unique index if not exists businesses_one_per_owner
  on public.businesses (owner_id);

-- 2c. business_members — who belongs to which business, and as what.
create table if not exists public.business_members (
  business_id uuid not null references public.businesses on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        business_role not null,
  joined_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- At most one owner row per business: the owner row can never be changed or
-- removed except by deleting the business.
create unique index if not exists one_owner_row_per_business
  on public.business_members (business_id) where role = 'owner';

-- 2d. business_invitations
create table if not exists public.business_invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses on delete cascade,
  email        text not null check (email = lower(email)),
  role         business_role not null check (role in ('editor', 'viewer')),
  status       invitation_status not null default 'pending',
  invited_by   uuid not null references auth.users,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists one_pending_invite_per_email
  on public.business_invitations (business_id, email) where status = 'pending';

-- 2e. customers (v1 table + every column added since).
--     NOTE: transactions.customer_id has NO ON DELETE CASCADE — permanent
--     deletion goes through delete_customer_permanently() (section 9).
create table if not exists public.customers (
  id                       uuid not null default gen_random_uuid(),
  name                     text not null,
  phone                    text,
  email                    text,
  address                  text,
  alternate_contact_name   text,
  alternate_contact_phone  text,
  tags                     text[],
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  business_id              uuid not null references public.businesses on delete cascade,
  created_by               uuid references auth.users,
  deleted_at               timestamptz,
  deleted_by               uuid references auth.users,
  archived_at              timestamptz,        -- NULL = active (S-30)
  constraint customers_pkey primary key (id)
);

-- 2f. transactions (v1 table + every column added since).
create table if not exists public.transactions (
  id           uuid not null default gen_random_uuid(),
  customer_id  uuid not null,
  type         transaction_type   not null,
  amount       numeric            not null,
  occurred_at  timestamptz        not null,
  note         text,
  status       transaction_status not null default 'active',
  source       transaction_source not null default 'manual',
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  business_id  uuid not null references public.businesses on delete cascade,
  updated_by   uuid references auth.users,     -- set once content-edited; restore reads it
  voided_at    timestamptz,
  voided_by    uuid references auth.users,
  void_reason  text,                           -- F2: exists before restore_transaction()
  constraint transactions_pkey primary key (id),
  constraint transactions_customer_id_fkey
    foreign key (customer_id) references public.customers (id),
  constraint transactions_created_by_fkey
    foreign key (created_by) references auth.users (id)
);

-- 2g. Catch-up for databases that already hold the v1 tables or an
--     intermediate shape. Every statement is a no-op on a fresh database or
--     on one that already ran the full old chain.
alter table public.customers
  add column if not exists business_id  uuid references public.businesses on delete cascade,
  add column if not exists created_by   uuid references auth.users,
  add column if not exists deleted_at   timestamptz,
  add column if not exists deleted_by   uuid references auth.users,
  add column if not exists archived_at  timestamptz;

alter table public.transactions
  add column if not exists business_id  uuid references public.businesses on delete cascade,
  add column if not exists updated_by   uuid references auth.users,
  add column if not exists voided_at    timestamptz,
  add column if not exists voided_by    uuid references auth.users,
  add column if not exists void_reason  text;

-- 2h. Mandatory tenancy (was 0003 / S-20). Refuses to proceed while legacy
--     rows lack a business — run the manual backfill first, then re-apply.
do $$
declare
  v_customers    bigint;
  v_transactions bigint;
begin
  select count(*) into v_customers    from public.customers    where business_id is null;
  select count(*) into v_transactions from public.transactions where business_id is null;

  if v_customers > 0 or v_transactions > 0 then
    raise exception E'Consolidated migration refuses to apply: % customers and % transactions still have business_id = NULL.\nRun supabase/manual/backfill_legacy_data.sql first, then re-apply this migration.',
      v_customers, v_transactions;
  end if;
end $$;

alter table public.customers    alter column business_id set not null;
alter table public.transactions alter column business_id set not null;

-- 2i. Indexes
create index if not exists customers_business_deleted_idx
  on public.customers (business_id, deleted_at);
create index if not exists customers_business_archived_idx
  on public.customers (business_id, archived_at);
create index if not exists transactions_business_occurred_idx
  on public.transactions (business_id, occurred_at desc);
create index if not exists transactions_business_customer_idx
  on public.transactions (business_id, customer_id);


-- ============================================================================
-- 3. LEGACY CLEANUP (no-ops on a fresh database)
-- ============================================================================

-- The v1 "any signed-in user can do anything" policies. After this the
-- membership policies in section 6 are the only rules.
drop policy if exists "Authenticated users can manage customers"    on public.customers;
drop policy if exists "Authenticated users can manage transactions" on public.transactions;

-- The v1 balance RPCs ignored the caller's business (SECURITY DEFINER, no
-- tenancy check). Clients read the security-invoker customer_balances view.
drop function if exists public.get_customer_balance(uuid);
drop function if exists public.get_all_customer_balances();


-- ============================================================================
-- 4. RLS HELPER FUNCTIONS
-- ============================================================================
-- security definer + fixed search_path so policies can consult
-- business_members without recursing into its own RLS.

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


-- ============================================================================
-- 5. INTEGRITY TRIGGERS
-- ============================================================================

-- 5a. A transaction's business_id must match its customer's business_id.
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

-- 5b. Creating a business automatically adds the Owner membership row.
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

-- 5c. New auth users get a profiles row from their Google identity.
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

-- 5d. One-time backfill of profiles for users created before the trigger
--     existed. Safe to re-run.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
on conflict (id) do nothing;

-- 5e. (F5) business_id is immutable once set. Without this, a user who is an
--     editor of two businesses could UPDATE a customer's business_id and
--     strand its transactions in the original business — the 5a trigger only
--     guards transaction writes, not customer moves. NULL -> value is still
--     allowed so a legacy backfill keeps working.
create or replace function public.prevent_business_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.business_id is not null
     and new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed once set (table %).', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_business_id_immutable on public.customers;
create trigger customers_business_id_immutable
  before update of business_id on public.customers
  for each row execute function public.prevent_business_id_change();

drop trigger if exists transactions_business_id_immutable on public.transactions;
create trigger transactions_business_id_immutable
  before update of business_id on public.transactions
  for each row execute function public.prevent_business_id_change();


-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================
-- Policies are drop-then-create so this section can be re-run.

alter table public.profiles             enable row level security;
alter table public.businesses           enable row level security;
alter table public.business_members     enable row level security;
alter table public.business_invitations enable row level security;
alter table public.customers            enable row level security;
alter table public.transactions         enable row level security;

-- ---- profiles: readable by users who share a business with the profile owner
drop policy if exists "Co-members can read profiles" on public.profiles;
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

-- ---- businesses: members read; only the owner updates/deletes; insert only
--      with owner_id = auth.uid()
drop policy if exists "Members can read businesses" on public.businesses;
create policy "Members can read businesses"
  on public.businesses for select to authenticated
  using (public.is_member(id));

drop policy if exists "Owners can update businesses" on public.businesses;
create policy "Owners can update businesses"
  on public.businesses for update to authenticated
  using (public.has_role(id, 'owner'))
  with check (public.has_role(id, 'owner'));

drop policy if exists "Owners can delete businesses" on public.businesses;
create policy "Owners can delete businesses"
  on public.businesses for delete to authenticated
  using (public.has_role(id, 'owner'));

drop policy if exists "Users can create their own business" on public.businesses;
create policy "Users can create their own business"
  on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- ---- business_members: co-members read. ALL writes go through the
--      security-definer RPCs (section 8), so there are no write policies.
drop policy if exists "Members can read business_members" on public.business_members;
create policy "Members can read business_members"
  on public.business_members for select to authenticated
  using (public.is_member(business_id));

-- ---- business_invitations: owner manages; invitee reads their own
--      (case-insensitive JWT email match; emails are stored lowercase).
drop policy if exists "Owners can read invitations" on public.business_invitations;
create policy "Owners can read invitations"
  on public.business_invitations for select to authenticated
  using (public.has_role(business_id, 'owner'));

drop policy if exists "Invitees can read their invitations" on public.business_invitations;
create policy "Invitees can read their invitations"
  on public.business_invitations for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

drop policy if exists "Owners can insert invitations" on public.business_invitations;
create policy "Owners can insert invitations"
  on public.business_invitations for insert to authenticated
  with check (public.has_role(business_id, 'owner'));

drop policy if exists "Owners can update invitations" on public.business_invitations;
create policy "Owners can update invitations"
  on public.business_invitations for update to authenticated
  using (public.has_role(business_id, 'owner'))
  with check (public.has_role(business_id, 'owner'));

drop policy if exists "Owners can delete invitations" on public.business_invitations;
create policy "Owners can delete invitations"
  on public.business_invitations for delete to authenticated
  using (public.has_role(business_id, 'owner'));

-- ---- customers: members read, editors write, owners delete
drop policy if exists "Members can read customers" on public.customers;
create policy "Members can read customers"
  on public.customers for select to authenticated
  using (public.is_member(business_id));

drop policy if exists "Editors can insert customers" on public.customers;
create policy "Editors can insert customers"
  on public.customers for insert to authenticated
  with check (public.has_role(business_id, 'editor'));

drop policy if exists "Editors can update customers" on public.customers;
create policy "Editors can update customers"
  on public.customers for update to authenticated
  using (public.has_role(business_id, 'editor'))
  with check (public.has_role(business_id, 'editor'));

drop policy if exists "Owners can delete customers" on public.customers;
create policy "Owners can delete customers"
  on public.customers for delete to authenticated
  using (public.has_role(business_id, 'owner'));

-- ---- transactions: members read, editors write. No DELETE policy: history
--      is voided, never deleted (only delete_customer_permanently and the
--      business cascade remove rows).
drop policy if exists "Members can read transactions" on public.transactions;
create policy "Members can read transactions"
  on public.transactions for select to authenticated
  using (public.is_member(business_id));

drop policy if exists "Editors can insert transactions" on public.transactions;
create policy "Editors can insert transactions"
  on public.transactions for insert to authenticated
  with check (public.has_role(business_id, 'editor'));

drop policy if exists "Editors can update transactions" on public.transactions;
create policy "Editors can update transactions"
  on public.transactions for update to authenticated
  using (public.has_role(business_id, 'editor'))
  with check (public.has_role(business_id, 'editor'));


-- ============================================================================
-- 7. VIEWS
-- ============================================================================

-- 7a. customer_balances — security_invoker so the caller's RLS applies.
--     Final shape: (id, business_id, balance, archived_at). Archived rows are
--     kept (the Archived filter needs real balances); soft-deleted are not.
--     CREATE OR REPLACE VIEW cannot rename columns, hence drop + create; the
--     dependent computed-relationship function (7b) goes first.
drop function if exists public.customer_balances(public.customers);
drop view     if exists public.customer_balances;

create view public.customer_balances
with (security_invoker = true) as
select
  c.id,
  c.business_id,
  coalesce(sum(
    case when t.type = 'charge' then t.amount else -t.amount end
  ) filter (where t.status in ('active', 'edited')), 0) as balance,
  c.archived_at
from public.customers c
left join public.transactions t
  on t.customer_id = c.id
 and t.business_id = c.business_id
where c.deleted_at is null
group by c.id;

-- 7b. Computed relationship customers -> customer_balances.
--     PostgREST cannot infer an FK from an aggregate view, so the paged
--     customer list embeds balances through this function (`rows 1` keeps
--     the embed a JSON object). SECURITY INVOKER is essential: a definer
--     function would leak balances across businesses.
create or replace function public.customer_balances(p_customer public.customers)
returns setof public.customer_balances
rows 1
language sql
stable
security invoker
set search_path = public
as $$
  select cb.id, cb.business_id, cb.balance, cb.archived_at
  from public.customer_balances cb
  where cb.id = p_customer.id;
$$;


-- ============================================================================
-- 8. MEMBERSHIP / BUSINESS RPCs
-- ============================================================================

-- 8a. Create a business (one per user; the 5b trigger adds the Owner row).
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

-- 8b. Accept / decline an invitation. Only the invited email may respond,
--     only pending invitations, and accepting while already a member is a
--     success (on conflict do nothing).
--     F4: the CASE is cast to invitation_status — an all-literal CASE
--     resolves to text, which does not assign to an enum column (42804).
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
     set status = (case when p_accept then 'accepted' else 'declined' end)::public.invitation_status,
         responded_at = now()
   where id = v_invite.id
  returning * into v_invite;

  return v_invite;
end;
$$;

-- 8c. Leave a business. Owners cannot leave (they delete the business).
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

-- 8d. Change a member's role. Owner-only; the owner row is protected;
--     promoting to owner is not allowed (ownership transfer is out of scope).
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

-- 8e. Remove a member. Owner-only; the owner row is protected.
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

-- 8f. my_invitations() — the caller's pending invitations with the business
--     and inviter display names an invitee cannot read through RLS (they are
--     not a member yet). Takes no arguments: the set is selected by matching
--     the caller's own JWT email, exactly like respond_to_invitation.
create or replace function public.my_invitations()
returns table (
  id            uuid,
  business_id   uuid,
  business_name text,
  inviter_name  text,
  role          public.business_role,
  created_at    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.business_id,
    b.name,
    coalesce(p.full_name, p.email),
    i.role,
    i.created_at
  from public.business_invitations i
  join public.businesses b on b.id = i.business_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = lower(auth.jwt() ->> 'email')
    and i.status = 'pending'
  order by i.created_at desc;
$$;

-- 8g. business_exists() — the lost-access probe. Exposes exactly one bit
--     (does the row exist?) so the client can tell "you were removed" (row
--     still there) from "the business was deleted" (row gone). Ids are
--     random UUIDs, so this is not an enumeration vector.
create or replace function public.business_exists(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses where id = p_business_id
  );
$$;


-- ============================================================================
-- 9. CUSTOMER LIFECYCLE RPCs
-- ============================================================================
-- Archive / restore are plain UPDATEs of customers.archived_at under RLS.
-- Only permanent deletion destroys history, and it is one atomic,
-- owner-only RPC.

create or replace function public.delete_customer_permanently(
  p_customer_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
    from public.customers
   where id = p_customer_id;

  if v_business_id is null or v_business_id <> p_business_id then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if not public.has_role(v_business_id, 'owner') then
    raise exception 'Only the owner can delete a customer permanently.'
      using errcode = '42501';
  end if;

  -- The transactions FK has no ON DELETE CASCADE, so both deletes are
  -- explicit; inside one function they commit together or not at all.
  delete from public.transactions where customer_id = p_customer_id;
  delete from public.customers where id = p_customer_id;
end;
$$;


-- ============================================================================
-- 10. TRANSACTION RPCs
-- ============================================================================

-- 10a. restore_transaction() — restore a voided row. The target status
--      depends on the row itself ('edited' if updated_by is set, i.e. it was
--      content-edited before voiding; otherwise 'active'), which a plain
--      PostgREST update cannot express. Voiding deliberately does NOT touch
--      updated_by, which is what makes this rule possible.
--      SECURITY INVOKER: the caller's RLS applies as for any other update.
create or replace function public.restore_transaction(
  p_transaction_id uuid,
  p_business_id uuid
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.transactions;
begin
  update public.transactions
  set
    status = case
      when updated_by is not null then 'edited'::transaction_status
      else 'active'::transaction_status
    end,
    void_reason = null,
    voided_at = null,
    voided_by = null,
    updated_at = now()
  where id = p_transaction_id
    and business_id = p_business_id
    and status = 'voided'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Void transaction not found.';
  end if;

  return v_row;
end;
$$;

-- 10b. customer_ledger() — running-balance ledger, newest first. balance_after
--      is a cumulative NUMERIC sum in date order; voided rows are returned
--      (the UI mutes them) but contribute nothing. SECURITY INVOKER: a
--      non-member gets zero rows, not an error.
create or replace function public.customer_ledger(
  p_customer_id uuid,
  p_business_id uuid
)
returns table (
  id           uuid,
  customer_id  uuid,
  occurred_at  timestamptz,
  type         transaction_type,
  amount       numeric,
  note         text,
  status       transaction_status,
  source       transaction_source,
  created_by   uuid,
  created_at   timestamptz,
  updated_by   uuid,
  updated_at   timestamptz,
  balance_after numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    t.id,
    t.customer_id,
    t.occurred_at,
    t.type,
    t.amount,
    t.note,
    t.status,
    t.source,
    t.created_by,
    t.created_at,
    t.updated_by,
    t.updated_at,
    sum(
      case when t.type = 'charge' then t.amount else -t.amount end
    ) filter (where t.status in ('active', 'edited'))
      over (order by t.occurred_at asc, t.id asc) as balance_after
  from public.transactions t
  where t.customer_id = p_customer_id
    and t.business_id = p_business_id
  order by t.occurred_at desc, t.id desc;
$$;


-- ============================================================================
-- 11. REPORTING RPCs
-- ============================================================================
-- Shared rules across all three: voided rows are out, edited rows are in,
-- and archived customers' money never appears in cross-customer figures.

-- 11a. dashboard_summary() — members only. (Final version from S-30.)
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
      and c.archived_at is null
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
      and c.archived_at is null
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

-- 11b. transaction_rollup() — the Transactions page's summarized view and
--      totals footer. Buckets are cut in the caller's timezone and returned
--      as wall-clock timestamps; the range is half-open [from, to).
--      SECURITY INVOKER (RLS scopes the read), p_business_id scopes the
--      aggregation.
--      F5: the search term is LIKE-escaped, so "50%" or "_" match literally
--      instead of acting as wildcards.
create or replace function public.transaction_rollup(
  p_business_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_type text default null,          -- 'charge' | 'payment' | NULL = both
  p_customer_id uuid default null,
  p_search text default null,        -- customer name/phone or note (substring)
  p_include_voided boolean default false,
  p_granularity text default null,   -- 'day' | 'week' | 'month' | NULL = one row
  p_timezone text default 'UTC'      -- the browser's IANA zone
)
returns table (
  period_start timestamp,
  entries bigint,
  total_charged numeric,
  total_paid numeric,
  net numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  with params as (
    -- Escape the LIKE metacharacters (\ first, then % and _).
    select replace(replace(replace(coalesce(p_search, ''), '\', '\\'), '%', '\%'), '_', '\_') as pat
  ),
  filtered as (
    select t.type, t.amount, t.occurred_at, t.note
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    cross join params
    where t.business_id = p_business_id
      -- Archived customers' history leaves this page entirely.
      and c.archived_at is null
      and (p_from is null or t.occurred_at >= p_from)
      and (p_to is null or t.occurred_at < p_to)
      and (p_type is null or t.type::text = p_type)
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_include_voided or t.status <> 'voided')
      and (
        p_search is null
        or btrim(p_search) = ''
        or c.name ilike '%' || params.pat || '%'
        or (c.phone is not null and c.phone ilike '%' || params.pat || '%')
        or t.note ilike '%' || params.pat || '%'
      )
  ),
  bucketed as (
    select
      case
        when p_granularity = 'day'
          then date_trunc('day', occurred_at at time zone p_timezone)
        when p_granularity = 'week'
          then date_trunc('week', occurred_at at time zone p_timezone)
        when p_granularity = 'month'
          then date_trunc('month', occurred_at at time zone p_timezone)
      end as bucket,
      type,
      amount
    from filtered
  )
  select
    bucket as period_start,
    count(*)::bigint as entries,
    coalesce(sum(amount) filter (where type = 'charge'), 0) as total_charged,
    coalesce(sum(amount) filter (where type = 'payment'), 0) as total_paid,
    coalesce(
      sum(case when type = 'charge' then amount else -amount end),
      0
    ) as net
  from bucketed
  group by bucket
  -- Newest period first; the single ungrouped row (granularity NULL) is alone.
  order by bucket desc nulls last;
$$;

-- 11c. daily_activity() — one zero-filled row per day for the last N days in
--      the caller's timezone (the dashboard trend chart). SECURITY INVOKER.
create or replace function public.daily_activity(
  p_business_id uuid,
  p_days int,
  p_timezone text default 'UTC'
)
returns table (
  activity_date date,
  charges numeric,
  payments numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  with bounds as (
    -- Window [today - (days-1), today] cut in the caller's zone;
    -- greatest(p_days, 1) keeps a stray 0 or negative from inverting it.
    select
      ((now() at time zone p_timezone)::date
        - (greatest(p_days, 1) - 1))::timestamp as start_day,
      ((now() at time zone p_timezone)::date)::timestamp as end_day
  ),
  aggregated as (
    select
      (t.occurred_at at time zone p_timezone)::date as day,
      coalesce(sum(t.amount) filter (where t.type = 'charge'), 0) as charges,
      coalesce(sum(t.amount) filter (where t.type = 'payment'), 0) as payments
    from public.transactions t
    where t.business_id = p_business_id
      and t.status in ('active', 'edited')
      and t.occurred_at >= ((select start_day from bounds) at time zone p_timezone)
      and exists (
        select 1 from public.customers c
        where c.id = t.customer_id
          and c.archived_at is null
      )
    group by 1
  )
  select
    d.day::date as activity_date,
    coalesce(a.charges, 0) as charges,
    coalesce(a.payments, 0) as payments
  from generate_series(
    (select start_day from bounds),
    (select end_day from bounds),
    interval '1 day'
  ) d(day)
  left join aggregated a on a.day = d.day
  order by d.day;
$$;


-- ============================================================================
-- 12. IMPORT RPC
-- ============================================================================

-- import_history() — atomic, business-scoped CSV import: everything or
-- nothing (a raised exception rolls back new customers too). The client
-- sends the resolved plan (NEW customers + transactions); name+phone
-- matching is redone here against THIS business only. SECURITY INVOKER:
-- tenancy AND role gating are enforced by the caller's RLS on the inserts
-- (a viewer or outsider is refused outright and nothing persists).
create or replace function public.import_history(
  p_business_id uuid,
  p_customers jsonb,    -- [{"name": "...", "phone": "..."}] — the NEW customers
  p_transactions jsonb  -- [{"customer_name","customer_phone","type","amount","occurred_at","note"}]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer jsonb;
  v_tx jsonb;
  v_customer_id uuid;
  v_customers_created bigint := 0;
  v_transactions_created bigint := 0;
begin
  -- New customers first: transaction rows resolve against
  -- (existing ∪ just-created) below.
  for v_customer in
    select * from jsonb_array_elements(coalesce(p_customers, '[]'::jsonb))
  loop
    insert into public.customers (business_id, name, phone, created_by)
    values (
      p_business_id,
      v_customer->>'name',
      nullif(v_customer->>'phone', ''),
      auth.uid()
    );
    v_customers_created := v_customers_created + 1;
  end loop;

  for v_tx in
    select * from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb))
  loop
    -- The same key the client previewed on: lower(name) + phone.
    select c.id into v_customer_id
    from public.customers c
    where c.business_id = p_business_id
      and c.deleted_at is null
      and lower(c.name) = lower(v_tx->>'customer_name')
      and coalesce(c.phone, '') = coalesce(v_tx->>'customer_phone', '')
    order by c.created_at
    limit 1;

    if v_customer_id is null then
      raise exception 'Import failed: no customer matched for "%"',
        v_tx->>'customer_name';
    end if;

    -- Defense in depth: archived between preview and commit.
    if exists (
      select 1 from public.customers c
      where c.id = v_customer_id and c.archived_at is not null
    ) then
      raise exception 'Customer is archived. Restore them first.';
    end if;

    insert into public.transactions (
      business_id, customer_id, type, amount, occurred_at, note,
      source, status, created_by
    ) values (
      p_business_id,
      v_customer_id,
      (v_tx->>'type')::transaction_type,
      (v_tx->>'amount')::numeric,
      (v_tx->>'occurred_at')::timestamptz,
      nullif(v_tx->>'note', ''),
      'import'::transaction_source,
      'active'::transaction_status,
      auth.uid()
    );
    v_transactions_created := v_transactions_created + 1;
  end loop;

  return jsonb_build_object(
    'customers_created', v_customers_created,
    'transactions_created', v_transactions_created
  );
end;
$$;


-- ============================================================================
-- 13. FUNCTION PRIVILEGES
-- ============================================================================
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges also grant it to `anon`. Neither is wanted here: the app
-- is sign-in only. Everything is revoked from PUBLIC and anon, then granted
-- back to `authenticated` for the functions the client
-- actually calls. Supabase's default privileges already give the server-side role
-- EXECUTE on new functions, and the revokes below do not touch it. The list is explicit on purpose — a blanket
-- "all functions in schema public" would also touch any extension functions
-- installed in public.

-- 13a. Client-callable: RLS helpers (policies run as the caller), RPCs, and
--      the computed relationship.
revoke execute on function public.is_member(uuid)                                from public, anon;
revoke execute on function public.has_role(uuid, business_role)                  from public, anon;
revoke execute on function public.create_business(text, text, text, text, text, text) from public, anon;
revoke execute on function public.respond_to_invitation(uuid, boolean)           from public, anon;
revoke execute on function public.leave_business(uuid)                           from public, anon;
revoke execute on function public.change_member_role(uuid, uuid, business_role)  from public, anon;
revoke execute on function public.remove_member(uuid, uuid)                      from public, anon;
revoke execute on function public.my_invitations()                               from public, anon;
revoke execute on function public.business_exists(uuid)                          from public, anon;
revoke execute on function public.delete_customer_permanently(uuid, uuid)        from public, anon;
revoke execute on function public.restore_transaction(uuid, uuid)                from public, anon;
revoke execute on function public.customer_ledger(uuid, uuid)                    from public, anon;
revoke execute on function public.dashboard_summary(uuid)                        from public, anon;
revoke execute on function public.transaction_rollup(uuid, timestamptz, timestamptz, text, uuid, text, boolean, text, text) from public, anon;
revoke execute on function public.daily_activity(uuid, int, text)                from public, anon;
revoke execute on function public.import_history(uuid, jsonb, jsonb)             from public, anon;
revoke execute on function public.customer_balances(public.customers)            from public, anon;

grant execute on function public.is_member(uuid)                                to authenticated;
grant execute on function public.has_role(uuid, business_role)                  to authenticated;
grant execute on function public.create_business(text, text, text, text, text, text) to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean)           to authenticated;
grant execute on function public.leave_business(uuid)                           to authenticated;
grant execute on function public.change_member_role(uuid, uuid, business_role)  to authenticated;
grant execute on function public.remove_member(uuid, uuid)                      to authenticated;
grant execute on function public.my_invitations()                               to authenticated;
grant execute on function public.business_exists(uuid)                          to authenticated;
grant execute on function public.delete_customer_permanently(uuid, uuid)        to authenticated;
grant execute on function public.restore_transaction(uuid, uuid)                to authenticated;
grant execute on function public.customer_ledger(uuid, uuid)                    to authenticated;
grant execute on function public.dashboard_summary(uuid)                        to authenticated;
grant execute on function public.transaction_rollup(uuid, timestamptz, timestamptz, text, uuid, text, boolean, text, text) to authenticated;
grant execute on function public.daily_activity(uuid, int, text)                to authenticated;
grant execute on function public.import_history(uuid, jsonb, jsonb)            to authenticated;
grant execute on function public.customer_balances(public.customers)           to authenticated;

-- 13b. Trigger functions are never called directly. EXECUTE is only checked
--      when a trigger is CREATED, not when it fires, so nobody but the owner
--      (and the server-side role, through default privileges) needs it.
revoke execute on function public.assert_transaction_business_match() from public, anon, authenticated;
revoke execute on function public.add_owner_membership()              from public, anon, authenticated;
revoke execute on function public.handle_new_user()                   from public, anon, authenticated;
revoke execute on function public.prevent_business_id_change()        from public, anon, authenticated;


-- ============================================================================
-- 14. HARDENING NOTES
-- ============================================================================
-- The F5 items live next to the code they change so each reads in context:
--   * section 5e   business_id immutability triggers
--   * section 11b  LIKE-escaped search in transaction_rollup
--   * section 13   EXECUTE revoked from PUBLIC / anon
-- To drop any one of them, delete that block (and its test section).


-- ============================================================================
-- 15. POSTGREST SCHEMA RELOAD
-- ============================================================================
-- Re-read the schema cache now rather than waiting for the next DDL event
-- (harmless on hosted Supabase, helpful on local stacks).
notify pgrst, 'reload schema';

commit;
