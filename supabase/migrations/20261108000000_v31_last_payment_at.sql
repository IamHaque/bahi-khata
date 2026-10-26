-- ============================================================================
-- BahiKhata v3.1 — customer_balances.last_payment_at   (story L-13, "Who to chase")
-- ============================================================================
-- Depends on: 20261101000000_v3_deletion_log_and_integrity.sql. Safe to re-run.
--
-- Adds the date of each customer's latest PAYMENT, so the dashboard can flag
-- balances where nothing has been paid for 30 days or more. Only active/edited
-- payments count (a voided payment is ignored). NULL = never paid.
--
-- The new column goes LAST. The dependent computed-relationship function must be
-- dropped before the view and recreated after it (it returns the view's row type).
-- ============================================================================

begin;

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
  c.archived_at,
  max(t.occurred_at) filter (where t.status in ('active', 'edited')) as last_activity_at,
  max(t.occurred_at) filter (where t.type = 'payment' and t.status in ('active', 'edited')) as last_payment_at
from public.customers c
left join public.transactions t
  on t.customer_id = c.id
 and t.business_id = c.business_id
where c.deleted_at is null
group by c.id;

create or replace function public.customer_balances(p_customer public.customers)
returns setof public.customer_balances
rows 1
language sql
stable
security invoker
set search_path = public
as $$
  select cb.id, cb.business_id, cb.balance, cb.archived_at, cb.last_activity_at, cb.last_payment_at
  from public.customer_balances cb
  where cb.id = p_customer.id;
$$;

revoke execute on function public.customer_balances(public.customers) from public, anon;
grant  execute on function public.customer_balances(public.customers) to authenticated;

notify pgrst, 'reload schema';

commit;
