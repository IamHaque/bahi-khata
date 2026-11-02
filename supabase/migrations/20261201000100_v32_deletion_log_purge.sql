-- ============================================================================
-- Migration: 20261201000100_v32_deletion_log_purge.sql
-- Purpose: S-73 — Deletion log export and purge (B-12)
--
-- Adds:
--   1. public.deletion_log_purges table: audit ledger of purges
--   2. purge_deletion_log(uuid, timestamptz, text, boolean) RPC (security definer, owner only)
--   3. export_deletion_log(uuid) RPC (security invoker, up to 5000 rows without snapshot)
--   4. RLS: owners can select deletion_log_purges; client writes revoked
--
-- Idempotent: safe to run multiple times.
-- Verification:
--   select count(*) from information_schema.tables where table_name = 'deletion_log_purges';
-- ============================================================================

create table if not exists public.deletion_log_purges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purged_by uuid references auth.users(id) on delete set null,
  purged_at timestamptz not null default now(),
  criteria jsonb not null default '{}'::jsonb,
  entries_removed integer not null default 0,
  customers_removed integer not null default 0,
  transactions_removed integer not null default 0,
  revisions_removed integer not null default 0
);

create index if not exists idx_deletion_log_purges_lookup
  on public.deletion_log_purges (business_id, purged_at desc);

-- RLS: owners only can select purges
alter table public.deletion_log_purges enable row level security;

drop policy if exists "deletion_log_purges_select" on public.deletion_log_purges;
create policy "deletion_log_purges_select"
  on public.deletion_log_purges
  for select
  to authenticated
  using (public.has_role(business_id, 'owner'));

-- Revoke client writes: rows are inserted exclusively by purge_deletion_log
revoke all on public.deletion_log_purges from anon, public;
grant select on public.deletion_log_purges to authenticated;
revoke insert, update, delete, truncate on public.deletion_log_purges from authenticated;

-- RPC: purge_deletion_log (security definer, owner only)
create or replace function public.purge_deletion_log(
  p_business_id uuid,
  p_before timestamptz,
  p_scope text,
  p_dry_run boolean default true
)
returns table (
  entries_removed integer,
  customers_removed integer,
  transactions_removed integer,
  revisions_removed integer,
  unrestored integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched_ids uuid[];
  v_entries integer := 0;
  v_customers integer := 0;
  v_transactions integer := 0;
  v_revisions integer := 0;
  v_unrestored integer := 0;
begin
  if not public.has_role(p_business_id, 'owner') then
    raise exception 'Only the owner can clean up the deletion log.' using errcode = '42501';
  end if;

  if p_scope not in ('restored', 'all') then
    raise exception 'Scope must be restored or all.' using errcode = '22023';
  end if;

  if p_before > now() - interval '30 days' then
    raise exception 'Clean-up date must be at least 30 days in the past.' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]),
         count(*)::integer,
         count(*) filter (where entity_type = 'customer')::integer,
         count(*) filter (where entity_type = 'transaction')::integer,
         count(*) filter (where restored_at is null)::integer
    into v_matched_ids, v_entries, v_customers, v_transactions, v_unrestored
    from public.deletion_log
   where business_id = p_business_id
     and deleted_at < p_before
     and (p_scope = 'all' or restored_at is not null);

  if p_dry_run then
    return query select v_entries, v_customers, v_transactions, 0, v_unrestored;
    return;
  end if;

  if v_entries > 0 then
    -- Delete transaction_revisions whose transaction_id appears only in purged snapshots
    -- and no longer exists in transactions or remaining deletion_log entries
    with purged_tx_ids as (
      select (snapshot->>'id')::uuid as tx_id
        from public.deletion_log
       where id = any(v_matched_ids) and entity_type = 'transaction' and snapshot ? 'id'
      union
      select (t->>'id')::uuid as tx_id
        from public.deletion_log d,
             jsonb_array_elements(d.snapshot->'transactions') t
       where d.id = any(v_matched_ids) and d.entity_type = 'customer' and d.snapshot ? 'transactions'
    )
    delete from public.transaction_revisions r
     where r.business_id = p_business_id
       and r.transaction_id in (select tx_id from purged_tx_ids where tx_id is not null)
       and not exists (select 1 from public.transactions t where t.id = r.transaction_id)
       and not exists (
         select 1 from public.deletion_log rem
          where rem.business_id = p_business_id
            and rem.id != all(v_matched_ids)
            and (
              (rem.entity_type = 'transaction' and (rem.snapshot->>'id')::uuid = r.transaction_id)
              or
              (rem.entity_type = 'customer' and exists (
                select 1 from jsonb_array_elements(rem.snapshot->'transactions') rt
                 where (rt->>'id')::uuid = r.transaction_id
              ))
            )
       );
    get diagnostics v_revisions = row_count;

    -- Delete matched deletion_log entries
    delete from public.deletion_log where id = any(v_matched_ids);

    -- Insert one deletion_log_purges row
    insert into public.deletion_log_purges (
      business_id,
      purged_by,
      purged_at,
      criteria,
      entries_removed,
      customers_removed,
      transactions_removed,
      revisions_removed
    ) values (
      p_business_id,
      auth.uid(),
      now(),
      jsonb_build_object('scope', p_scope, 'before', p_before),
      v_entries,
      v_customers,
      v_transactions,
      v_revisions
    );
  end if;

  return query select v_entries, v_customers, v_transactions, v_revisions, v_unrestored;
end;
$$;

revoke all on function public.purge_deletion_log(uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.purge_deletion_log(uuid, timestamptz, text, boolean) to authenticated;

-- RPC: export_deletion_log (security invoker, up to 5000 rows without snapshot)
create or replace function public.export_deletion_log(p_business_id uuid)
returns table (
  id uuid,
  entity_type text,
  label text,
  reason text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleter_name text,
  restored_at timestamptz,
  restored_by uuid,
  restorer_name text,
  amount numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    d.id,
    d.entity_type,
    d.label,
    d.reason,
    d.deleted_at,
    d.deleted_by,
    coalesce(dp.full_name, dp.email, 'Former member') as deleter_name,
    d.restored_at,
    d.restored_by,
    coalesce(rp.full_name, rp.email, 'Former member') as restorer_name,
    case
      when d.entity_type = 'transaction' then (d.summary->>'amount')::numeric
      else (d.summary->>'balance')::numeric
    end as amount
  from public.deletion_log d
  left join public.profiles dp on dp.id = d.deleted_by
  left join public.profiles rp on rp.id = d.restored_by
  where d.business_id = p_business_id
  order by d.deleted_at desc
  limit 5000;
$$;

revoke all on function public.export_deletion_log(uuid) from public, anon;
grant execute on function public.export_deletion_log(uuid) to authenticated;
