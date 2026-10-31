-- ------------------------------------------------------------
-- 0010 — computed relationship: customers → customer_balances.
--
-- Renaming the view's PK column (0009) was necessary but NOT
-- sufficient: PostgREST infers a view's foreign keys from its base
-- tables' FK COLUMNS (not PKs), and only when those FK columns are in
-- the view's top SELECT. Our aggregate view never exposes
-- `transactions.customer_id`, so the schema cache can never hold a
-- customers ↔ customer_balances relationship — the paged customer
-- list kept failing with PGRST200.
--
-- The documented workaround for views that can't be FK-inferred is a
-- computed relationship: a STABLE function taking the parent row.
-- `rows 1` labels it many-to-one (one balance object per customer,
-- keeping the embed's JSON-object shape), and the SQL body inlines
-- into a lateral join so the aggregate stays a single query.
--
-- SECURITY INVOKER matters: the view inside is security_invoker, so
-- the caller's RLS must keep applying (a definer function would
-- leak balances across businesses).
-- ------------------------------------------------------------

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

-- Make PostgREST re-read the schema now instead of waiting for its
-- next watch event — harmless on hosted Supabase (which reloads on
-- DDL anyway) and a help on local stacks.
notify pgrst, 'reload schema';
