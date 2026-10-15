-- S-37 — server-side aggregation for the dashboard trend chart.
--
-- daily_activity(business, days) hands the chart one row per day for
-- the last N days (7, 30 or 90 — the selector's three steps), charges
-- and payments summed per day IN THE CALLER'S OWN TIMEZONE (the same
-- p_timezone convention migration 0006b's transaction_rollup uses, so
-- "today" is the user's today here too). Days without activity come
-- back as zero rows — the chart shows a continuous run of days and the
-- client never invents a bucket.
--
-- Same maths as dashboard_summary and transaction_rollup: voided rows
-- out, edited rows still in, transactions of archived customers out.
--
-- Security INVOKER: the caller's row-level security scopes the read
-- (a non-member's call simply returns all-zero days); p_business_id
-- scopes the aggregation. Stable: reads only.

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
    -- The window, cut in the caller's zone: [today - (days-1), today].
    -- greatest(p_days, 1) keeps a stray 0 or negative from producing
    -- an inverted series.
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
      -- Archived customers leave the cross-customer figures entirely
      -- (their history stays on their own detail page).
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

revoke execute
  on function public.daily_activity(uuid, int, text)
  from public, anon;

grant execute
  on function public.daily_activity(uuid, int, text)
  to authenticated;
