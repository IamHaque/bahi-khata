-- ============================================================================
-- Migration: 20261201000000_v32_transaction_revisions.sql
-- Purpose: S-72 — Transaction revision history (B-08)
--
-- Adds:
--   1. public.transaction_revisions table: records edits, voids, and restores
--   2. record_transaction_revision() trigger on public.transactions
--   3. transaction_history(uuid) RPC returning revision timeline with actor profiles
--   4. RLS: business members can select; no client writes (trigger-only)
--
-- Idempotent: safe to run multiple times.
-- Verification:
--   select count(*) from information_schema.tables where table_name = 'transaction_revisions';
-- ============================================================================

create table if not exists public.transaction_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null,
  action text not null check (action in ('edit', 'void', 'restore')),
  changes jsonb not null default '{}'::jsonb,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_transaction_revisions_lookup
  on public.transaction_revisions (business_id, transaction_id, changed_at desc);

-- RLS: business members can read revision history for their business
alter table public.transaction_revisions enable row level security;

drop policy if exists "transaction_revisions_select" on public.transaction_revisions;
create policy "transaction_revisions_select"
  on public.transaction_revisions
  for select
  to authenticated
  using (public.is_member(business_id));

-- Revoke all client writes: rows are inserted exclusively by the trigger
revoke all on public.transaction_revisions from anon, public;
grant select on public.transaction_revisions to authenticated;
revoke insert, update, delete, truncate on public.transaction_revisions from authenticated;

-- Trigger function: records transaction revisions on update
create or replace function public.record_transaction_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_actor uuid;
begin
  -- Skip when restoring from deletion log
  if current_setting('bahikhata.restoring', true) = 'on' then
    return new;
  end if;

  -- Fallback actor order: auth.uid(), new.updated_by, new.voided_by
  v_actor := coalesce(auth.uid(), new.updated_by, new.voided_by);

  -- Case 1: Voiding a transaction (status transition to 'voided')
  if old.status is distinct from 'voided' and new.status = 'voided' then
    insert into public.transaction_revisions (
      business_id,
      transaction_id,
      action,
      changes,
      reason,
      changed_by,
      changed_at
    ) values (
      new.business_id,
      new.id,
      'void',
      '{}'::jsonb,
      new.void_reason,
      coalesce(auth.uid(), new.voided_by, new.updated_by),
      coalesce(new.voided_at, now())
    );
    return new;
  end if;

  -- Case 2: Restoring a voided transaction (status transition from 'voided')
  if old.status = 'voided' and new.status is distinct from 'voided' then
    insert into public.transaction_revisions (
      business_id,
      transaction_id,
      action,
      changes,
      reason,
      changed_by,
      changed_at
    ) values (
      new.business_id,
      new.id,
      'restore',
      '{}'::jsonb,
      null,
      v_actor,
      now()
    );
    return new;
  end if;

  -- Case 3: Content tuple update (customer_id, type, amount, occurred_at, note)
  if (old.customer_id, old.type, old.amount, old.occurred_at, old.note)
     is distinct from
     (new.customer_id, new.type, new.amount, new.occurred_at, new.note)
  then
    if old.customer_id is distinct from new.customer_id then
      v_changes := v_changes || jsonb_build_object('customer_id', jsonb_build_object('from', old.customer_id, 'to', new.customer_id));
    end if;
    if old.type is distinct from new.type then
      v_changes := v_changes || jsonb_build_object('type', jsonb_build_object('from', old.type, 'to', new.type));
    end if;
    if old.amount is distinct from new.amount then
      v_changes := v_changes || jsonb_build_object('amount', jsonb_build_object('from', old.amount, 'to', new.amount));
    end if;
    if old.occurred_at is distinct from new.occurred_at then
      v_changes := v_changes || jsonb_build_object('occurred_at', jsonb_build_object('from', old.occurred_at, 'to', new.occurred_at));
    end if;
    if old.note is distinct from new.note then
      v_changes := v_changes || jsonb_build_object('note', jsonb_build_object('from', old.note, 'to', new.note));
    end if;

    insert into public.transaction_revisions (
      business_id,
      transaction_id,
      action,
      changes,
      reason,
      changed_by,
      changed_at
    ) values (
      new.business_id,
      new.id,
      'edit',
      v_changes,
      null,
      v_actor,
      coalesce(new.updated_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tr_record_transaction_revision on public.transactions;
create trigger tr_record_transaction_revision
  after update on public.transactions
  for each row
  execute function public.record_transaction_revision();

-- RPC: returns transaction history timeline (security invoker to enforce RLS)
create or replace function public.transaction_history(p_transaction_id uuid)
returns table (
  id uuid,
  action text,
  changes jsonb,
  reason text,
  changed_at timestamptz,
  changed_by uuid,
  actor_name text
)
language sql
security invoker
set search_path = public
as $$
  select
    r.id,
    r.action,
    r.changes,
    r.reason,
    r.changed_at,
    r.changed_by,
    coalesce(p.full_name, p.email, 'Former member') as actor_name
  from public.transaction_revisions r
  left join public.profiles p on p.id = r.changed_by
  where r.transaction_id = p_transaction_id
  order by r.changed_at desc
  limit 200;
$$;

revoke all on function public.transaction_history(uuid) from public, anon;
grant execute on function public.transaction_history(uuid) to authenticated;

revoke all on function public.record_transaction_revision() from public, anon, authenticated;
