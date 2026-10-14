-- S-38 — atomic, business-scoped CSV import.
--
-- The v1 import inserted customers one-by-one and then batch-inserted
-- transactions from the browser: a mid-import failure left the new
-- customers behind with no transactions. This function replaces that
-- with ONE server-side call that either imports everything or nothing
-- (plpgsql runs as a single transaction; any raised exception rolls
-- the whole import back — new customers included).
--
-- Contract: the client validates the file and previews it (the v1
-- parser's rules stay in force), then sends only the resolved plan —
-- the NEW customers to create and the transactions to insert. Name +
-- phone matching is redone HERE against this business's customers
-- (existing ∪ just-created), so the commit cannot drift from the
-- preview's business scope: another business's "Asha Verma" never
-- matches, and a match on an ARCHIVED customer raises the same reason
-- the preview shows.
--
-- Every transaction is tagged source 'import' with its historical
-- occurred_at, created_by = the caller. Tenancy is enforced by the
-- caller's row-level security on the inserts themselves (security
-- INVOKER): importing into a business you are not a member of fails
-- outright and nothing persists. Role gating (Owner/Editor only) is
-- the client's, same as every other write path in the app.

create or replace function public.import_history(
  p_business_id uuid,
  p_customers jsonb,    -- [{"name": "...", "phone": "..."}] — the NEW customers
  p_transactions jsonb  -- [{"customer_name": "...", "customer_phone": "",
                         --   "type": "charge"|"payment", "amount": 500,
                         --   "occurred_at": "ISO", "note": null}]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer jsonb;
  v_tx jsonb;
  v_customer_id uuid;
  v_customers_created bigint := 0;
  v_transactions_created bigint := 0;
begin
  -- New customers first: the transaction rows resolve against
  -- (existing ∪ just-created) below.
  for v_customer in
    select * from jsonb_array_elements(coalesce(p_customers, '[]'::jsonb))
  loop
    insert into public.customers (business_id, name, phone, created_by)
    values (
      p_business_id,
      v_customer->>'name',
      nullif(v_customer->>'phone', ''),
      auth.uid()
    );
    v_customers_created := v_customers_created + 1;
  end loop;

  for v_tx in
    select * from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb))
  loop
    -- The same key the client previewed on: lower(name) + phone.
    select c.id into v_customer_id
    from public.customers c
    where c.business_id = p_business_id
      and c.deleted_at is null
      and lower(c.name) = lower(v_tx->>'customer_name')
      and coalesce(c.phone, '') = coalesce(v_tx->>'customer_phone', '')
    order by c.created_at
    limit 1;

    if v_customer_id is null then
      raise exception 'Import failed: no customer matched for "%"',
        v_tx->>'customer_name';
    end if;

    -- Defense in depth: the preview already filters archived matches
    -- out as row errors; if one slipped through (archived between
    -- preview and commit) the import still refuses, with the exact
    -- reason the PRD pins.
    if exists (
      select 1 from public.customers c
      where c.id = v_customer_id and c.archived_at is not null
    ) then
      raise exception 'Customer is archived. Restore them first.';
    end if;

    insert into public.transactions (
      business_id, customer_id, type, amount, occurred_at, note,
      source, status, created_by
    ) values (
      p_business_id,
      v_customer_id,
      (v_tx->>'type')::transaction_type,
      (v_tx->>'amount')::numeric,
      (v_tx->>'occurred_at')::timestamptz,
      nullif(v_tx->>'note', ''),
      'import'::transaction_source,
      'active'::transaction_status,
      auth.uid()
    );
    v_transactions_created := v_transactions_created + 1;
  end loop;

  return jsonb_build_object(
    'customers_created', v_customers_created,
    'transactions_created', v_transactions_created
  );
end;
$$;

revoke execute
  on function public.import_history(uuid, jsonb, jsonb)
  from public, anon;

grant execute
  on function public.import_history(uuid, jsonb, jsonb)
  to authenticated;
