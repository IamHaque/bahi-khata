-- Server-side balance aggregation functions
-- STORY-033: Replace client-side reduction with Postgres RPC functions

-- Returns the balance for a single customer
create or replace function public.get_customer_balance(p_customer_id uuid)
returns numeric
language sql
stable
security definer
as $$
  select coalesce(sum(
    case when type = 'charge' then amount else -amount end
  ), 0)
  from public.transactions
  where customer_id = p_customer_id
    and status in ('active', 'edited');
$$;

-- Returns balances for all customers
create or replace function public.get_all_customer_balances()
returns table(customer_id uuid, balance numeric)
language sql
stable
security definer
as $$
  select
    t.customer_id,
    coalesce(sum(
      case when t.type = 'charge' then t.amount else -t.amount end
    ), 0) as balance
  from public.transactions t
  where t.status in ('active', 'edited')
  group by t.customer_id;
$$;
