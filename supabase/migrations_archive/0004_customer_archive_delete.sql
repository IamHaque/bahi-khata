-- S-30: archive, restore and permanently delete customers.
--
-- Additive (expand contract): `archived_at` arrives. NULL = active,
-- which is what every existing row means today, so nothing becomes
-- required and no old policy drops. Archiving keeps every transaction —
-- the customer simply steps out of the working sets (lists, pickers,
-- dashboard totals). Permanent delete is the only operation that
-- destroys history, and it lives in one owner-only atomic RPC.

-- ------------------------------------------------------------
-- 1. The column. NULL = active (the v1 meaning of every row).
-- ------------------------------------------------------------
alter table public.customers
  add column if not exists archived_at timestamptz;

-- The two list queries (active and archived filters) slice by
-- business + archived state.
create index if not exists customers_business_archived_idx
  on public.customers (business_id, archived_at);

-- ------------------------------------------------------------
-- 2. The balance view exposes archived_at so scoped reads can filter
--    without a second join. CREATE OR REPLACE may only append columns,
--    which is exactly what happens here (archived_at lands after
--    balance). The view keeps archived rows: the Archived filter and
--    the archive warning both need real balances for them.
-- ------------------------------------------------------------
create or replace view public.customer_balances
with (security_invoker = true) as
select
  c.id as customer_id,
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

-- ------------------------------------------------------------
-- 3. dashboard_summary finally does what its 0002 comment promises
--    ("excludes ... archived customers (C-6)"): the column exists now,
--    so both CTEs filter it. Same signature — callers unchanged.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. Permanent delete: owner-only, one atomic operation. The
--    transactions FK has no ON DELETE CASCADE (remote schema), so the
--    transactions go explicitly — inside one plpgsql function both
--    deletes commit together or not at all. p_business_id is checked
--    against the row so the call honours the S-20 tenancy contract
--    (every mutation carries its business), even though the role check
--    is the real gate.
-- ------------------------------------------------------------
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

  delete from public.transactions where customer_id = p_customer_id;
  delete from public.customers where id = p_customer_id;
end;
$$;

revoke execute on function public.delete_customer_permanently(uuid, uuid)
  from public, anon;
grant execute on function public.delete_customer_permanently(uuid, uuid)
  to authenticated;

-- ------------------------------------------------------------
-- Rollback (only safe before S-30 code runs; inside a transaction)
-- ------------------------------------------------------------
-- drop function if exists public.delete_customer_permanently(uuid, uuid);
-- drop view if exists public.customer_balances;      -- then restore 0002's
-- drop index if exists customers_business_archived_idx;
-- alter table public.customers drop column if exists archived_at;
