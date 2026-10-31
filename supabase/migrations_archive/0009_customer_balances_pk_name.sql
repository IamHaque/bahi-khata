-- ------------------------------------------------------------
-- 0009 — expose the customer_balances PK under its real name.
--
-- The view aliased `c.id as customer_id`; direct view reads (S-20's
-- balance lookups) now filter/select the column under the customers
-- PK's real name, `id`. NOTE: this alone does NOT make the view
-- embeddable from `customers` — PostgREST infers view FKs from base
-- table FK COLUMNS, which this aggregate view never exposes. The
-- embed comes from the computed relationship in 0010.
-- ------------------------------------------------------------

-- `create or replace view` cannot rename a column, so the old view
-- goes first and the corrected shape comes back immediately.
drop view if exists public.customer_balances;

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

-- Make PostgREST re-read the schema now instead of waiting for its
-- next watch event — harmless on hosted Supabase (which reloads on
-- DDL anyway) and a help on local stacks.
notify pgrst, 'reload schema';
