-- ============================================================
-- backfill_legacy_data.sql  (S-20 — HUMAN STEP, run as postgres)
--
-- Attaches every legacy row (business_id IS NULL) to the legacy
-- owner's business:
--   * creates a business for that user if they own none
--     (the 0001 trigger adds the matching Owner membership row)
--   * assigns every NULL-business_id customer and transaction to it
--   * prints the counts it changed and what remains
--   * is safe to re-run: a second run changes nothing (0 rows)
--
-- HOW TO RUN:
--   1. Set v_owner_email in section 1 to the Google email of the
--      account that owns the existing data.
--   2. Run the whole file in one go (Supabase SQL Editor or psql),
--      as postgres. It runs in one transaction: any problem rolls
--      everything back.
--
-- NOTE: the 0001 trigger requires each transaction's business to
-- match its customer's business. This script updates customers
-- first, so ordinary legacy data always passes. If it ever fails
-- with "Transaction business does not belong to the customer's
-- business", some rows were already scoped by hand — fix those
-- rows, then re-run.
--
-- This is the only script that needs the legacy owner's email.
-- See docs/MANUAL_STEPS.md, S-20.
-- ============================================================

begin;

do $$
declare
  -- ============================================================
  -- 1. SET THIS before running: the Google email of the account
  --    that owns the existing (pre-multi-business) data.
  -- ============================================================
  v_placeholder constant text := 'PASTE-THE-LEGACY-OWNER-GOOGLE-EMAIL-HERE';
  v_owner_email text := 'PASTE-THE-LEGACY-OWNER-GOOGLE-EMAIL-HERE';

  v_user_id uuid;
  v_business_id uuid;
  v_business_created boolean := false;
  v_customers_backfilled bigint;
  v_transactions_backfilled bigint;
  v_customers_left bigint;
  v_transactions_left bigint;
begin
  if v_owner_email = v_placeholder or position('@' in v_owner_email) = 0 then
    raise exception 'Set the legacy owner Google email in section 1 of this script before running it (docs/MANUAL_STEPS.md, S-20 step 2).';
  end if;

  select id into v_user_id
    from auth.users
   where lower(email) = lower(v_owner_email);

  if v_user_id is null then
    raise exception 'No auth.users row found for % — check the email, and sign in once with it so the account exists.', v_owner_email;
  end if;

  select id into v_business_id
    from public.businesses
   where owner_id = v_user_id;

  if v_business_id is null then
    -- Direct insert: the businesses_add_owner trigger (0001) creates
    -- the Owner membership row. RLS is bypassed by running as postgres.
    insert into public.businesses (owner_id, name)
    values (v_user_id, 'My Business')
    returning id into v_business_id;
    v_business_created := true;
  end if;

  -- Customers first: the transactions_business_match trigger (0001)
  -- requires each transaction's business to equal its customer's.
  update public.customers
     set business_id = v_business_id
   where business_id is null;
  get diagnostics v_customers_backfilled = row_count;

  update public.transactions
     set business_id = v_business_id
   where business_id is null;
  get diagnostics v_transactions_backfilled = row_count;

  select count(*) into v_customers_left
    from public.customers where business_id is null;
  select count(*) into v_transactions_left
    from public.transactions where business_id is null;

  raise notice 'BACKFILL DONE: business_id=% (created=%), customers backfilled=%, transactions backfilled=%',
    v_business_id, v_business_created, v_customers_backfilled, v_transactions_backfilled;
  raise notice 'REMAINING NULL business_id rows: customers=%, transactions=% (both must be 0)',
    v_customers_left, v_transactions_left;

  if v_customers_left > 0 or v_transactions_left > 0 then
    raise exception 'Backfill incomplete — remaining NULL rows: customers=%, transactions=%.', v_customers_left, v_transactions_left;
  end if;
end $$;

commit;
