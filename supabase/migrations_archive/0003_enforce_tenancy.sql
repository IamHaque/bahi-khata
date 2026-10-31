-- ============================================================
-- 0003_enforce_tenancy.sql  (S-20)
--
-- DESTRUCTIVE — the contract phase of expand-then-contract:
--   * business_id becomes NOT NULL on customers and transactions
--   * the v1 broad policies are dropped (0002's membership policies
--     become the only rules)
--   * the unscoped v1 balance RPCs are dropped (the client reads the
--     security-invoker customer_balances view from 0002 instead;
--     those SECURITY DEFINER functions ignored the caller's business)
--
-- Refuses to apply while any row still has business_id IS NULL:
-- run supabase/manual/backfill_legacy_data.sql first, then re-apply.
--
-- DO NOT DEPLOY the v2 branch before this migration has been applied
-- (docs/MANUAL_STEPS.md, S-20).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Refuse dirty data — point the human at the backfill script
-- ------------------------------------------------------------
do $$
declare
  v_customers bigint;
  v_transactions bigint;
begin
  select count(*) into v_customers
    from public.customers where business_id is null;
  select count(*) into v_transactions
    from public.transactions where business_id is null;

  if v_customers > 0 or v_transactions > 0 then
    raise exception E'S-20 refuses to apply: % customers and % transactions still have business_id = NULL.\nRun supabase/manual/backfill_legacy_data.sql first (docs/MANUAL_STEPS.md, S-20 step 2), then re-apply this migration.',
      v_customers, v_transactions;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Mandatory tenancy
-- ------------------------------------------------------------
alter table public.customers
  alter column business_id set not null;
alter table public.transactions
  alter column business_id set not null;

-- ------------------------------------------------------------
-- 3. Drop the v1 broad policies — after this, 0002's membership
--    policies are the only rules (the S-06 SQL tests then pass
--    without their expand-phase workaround; the drops there are
--    `if exists` no-ops).
-- ------------------------------------------------------------
drop policy if exists "Authenticated users can manage customers"
  on public.customers;
drop policy if exists "Authenticated users can manage transactions"
  on public.transactions;

-- ------------------------------------------------------------
-- 4. Drop the unscoped v1 balance RPCs (DEV-8 resolved for good)
-- ------------------------------------------------------------
drop function if exists public.get_customer_balance(uuid);
drop function if exists public.get_all_customer_balances();

commit;
