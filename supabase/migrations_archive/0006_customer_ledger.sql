-- S-31: customer_ledger() — the running-balance ledger.
--
-- Why a function: the ledger's "Balance after" column is a cumulative
-- sum in date order with voided rows left out of the math — the exact
-- figure the customer sees next to every entry. Computing it in the
-- browser would mean shipping every row just to add them up client
-- side and trusting float arithmetic on money; NUMERIC in the
-- database does it exactly, once, in one query.
--
-- Security INVOKER: the caller's RLS on transactions applies exactly
-- as for any other read (members of the business only) — a non-member
-- gets zero rows, not an error. The voided rows themselves are still
-- returned (the UI shows them muted) — they simply contribute
-- nothing to balance_after, so the running balance is the live one.

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

-- Members only; nothing anonymous.
revoke execute on function public.customer_ledger(uuid, uuid) from public, anon;
grant execute on function public.customer_ledger(uuid, uuid) to authenticated;
