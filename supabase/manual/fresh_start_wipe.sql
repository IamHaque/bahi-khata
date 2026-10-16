-- ============================================================
-- fresh_start_wipe.sql  (HUMAN STEP, run as postgres/service role)
--
-- Product-owner decision, 2026-10-15: BahiKhata starts from
-- scratch. This empties the two v1 data tables so the v2
-- migrations 0001..0008 can be applied in order to a clean
-- slate.
--
--   * deletes every row from public.transactions and
--     public.customers (transactions first — FK to customers)
--   * deliberately KEEPS auth.users: Google sign-in accounts
--     stay valid; the 0001 sign-up trigger and its one-time
--     backfill refill profiles on first v2 login
--   * prints before/after counts as notices
--   * safe to re-run: a second run deletes 0 rows
--
-- HOW TO RUN (SQL Editor):
--   1. Take a backup first (Dashboard → Database → Backups).
--   2. SQL Editor → paste this whole file → Run.
--   3. Success = notices show transactions=0, customers=0 and
--      auth.users UNCHANGED from the before-count.
--   4. Then apply migrations 0001..0008 in order
--      (docs/MANUAL_STEPS.md → "SYNC" section).
-- ============================================================

do $$
declare
  v_tx_before    bigint;
  v_cust_before  bigint;
  v_users_before bigint;
  v_tx_after     bigint;
  v_cust_after   bigint;
  v_users_after  bigint;
begin
  select count(*) into v_tx_before    from public.transactions;
  select count(*) into v_cust_before  from public.customers;
  select count(*) into v_users_before from auth.users;

  raise notice 'before: transactions=%, customers=%, auth.users=%',
    v_tx_before, v_cust_before, v_users_before;

  -- children before parents
  delete from public.transactions;
  delete from public.customers;

  select count(*) into v_tx_after    from public.transactions;
  select count(*) into v_cust_after  from public.customers;
  select count(*) into v_users_after from auth.users;

  raise notice 'after:  transactions=%, customers=%, auth.users=% (kept on purpose)',
    v_tx_after, v_cust_after, v_users_after;

  if v_tx_after <> 0 or v_cust_after <> 0 then
    raise exception 'WIPE FAILED: business tables are not empty (transactions=%, customers=%)',
      v_tx_after, v_cust_after;
  end if;

  if v_users_after <> v_users_before then
    raise exception 'auth.users changed during the wipe (before=%, after=%) — this script never touches accounts',
      v_users_before, v_users_after;
  end if;

  raise notice 'wipe complete: v1 business data removed, % auth account(s) kept',
    v_users_after;
end $$;
