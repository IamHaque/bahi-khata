-- S-35 — server-side transaction rollup for the Transactions page.
--
-- The summarized view (period, count, total charges, total payments,
-- net) and the totals footer ("everything matching, not only the
-- visible page") are figures the DATABASE computes: period grouping
-- via date_trunc in the caller's own timezone, the same filters the
-- detailed list uses, voided rows excluded unless asked for, and the
-- transactions of archived customers never included at all.
--
-- Numbered 0006b (not 0007) because PRD C-5 pins 0007/0008 to S-37 /
-- S-38; the letter suffix is the same insert-before-reserved-number
-- convention 0002b (S-24) and 0003b (S-27) already use.
--
-- Security INVOKER: the caller's row-level security scopes the read,
-- and p_business_id scopes the aggregation. Stable: it reads and
-- never writes.

create or replace function public.transaction_rollup(
  p_business_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_type text default null,          -- 'charge' | 'payment' | NULL = both
  p_customer_id uuid default null,
  p_search text default null,        -- customer name/phone or note (substring)
  p_include_voided boolean default false,
  p_granularity text default null,   -- 'day' | 'week' | 'month' | NULL = one row
  p_timezone text default 'UTC'      -- the browser's IANA zone: "today" means the user's today
)
returns table (
  -- Wall clock in p_timezone, NOT an instant: the client labels each
  -- bucket with the same local dates the grouping used.
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
  with filtered as (
    select t.type, t.amount, t.occurred_at, t.note
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    where t.business_id = p_business_id
      -- Scenario "Archived customers": their history leaves this page
      -- entirely (the customer detail page still shows it).
      and c.archived_at is null
      and (p_from is null or t.occurred_at >= p_from)
      -- Half-open [from, to): "this month" ends at the 1st of the
      -- next month, 00:00 exactly, which belongs to the next month.
      and (p_to is null or t.occurred_at < p_to)
      and (p_type is null or t.type::text = p_type)
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_include_voided or t.status <> 'voided')
      and (
        p_search is null
        or btrim(p_search) = ''
        or c.name ilike '%' || p_search || '%'
        or (c.phone is not null and c.phone ilike '%' || p_search || '%')
        or t.note ilike '%' || p_search || '%'
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
  -- Newest period first; the single ungrouped row (granularity NULL)
  -- sorts last but is alone anyway.
  order by bucket desc nulls last;
$$;

revoke execute
  on function public.transaction_rollup(uuid, timestamptz, timestamptz, text, uuid, text, boolean, text, text)
  from public, anon;

grant execute
  on function public.transaction_rollup(uuid, timestamptz, timestamptz, text, uuid, text, boolean, text, text)
  to authenticated;
