-- ============================================================================
-- BahiKhata — CONSOLIDATED TEST SUITE (RLS, integrity and RPC behaviour)
-- ============================================================================
-- Replaces the ten per-migration files in supabase/tests/:
--   0002_rls_membership, 0002b_my_invitations, 0002c_membership_management,
--   0003b_business_exists, 0004_archive_delete_customers, 0005_void_restore,
--   0006_customer_ledger, 0006b_transaction_rollup, 0007_daily_activity,
--   0008_import_history
-- and adds NEW sections (01, 02, 13, 14 for v2 behaviour that had no test; 15-18 for v3).
--
-- PREREQUISITE: ALL THREE migrations applied, in order, to a SCRATCH database (never production):
--   20261017000000_bahikhata_consolidated_schema.sql, then
--   20261101000000_v3_deletion_log_and_integrity.sql, then
--   20261108000000_v31_last_payment_at.sql
--
-- HOW IT WORKS
--   * ONE transaction, rolled back at the end — nothing is ever committed.
--   * PART A defines the shared helpers once (they live in pg_temp).
--   * Each SECTION runs inside its own SAVEPOINT and ends with ROLLBACK TO
--     SAVEPOINT, so every section starts from an empty database and may reuse
--     the same fixture UUIDs without colliding with any other section. The
--     assertions inside each migrated section are the original ones, unchanged.
--   * Any failure raises "TEST FAILED: <what> — expected X, got Y" and stops.
--   * Success prints one NOTICE per section and a final result row.
--
-- HOW TO RUN
--   psql (recommended — stops at the first failure, output is just the NOTICEs):
--     psql "postgresql://postgres:postgres@localhost:54322/postgres" \
--          -q -o /dev/null -v ON_ERROR_STOP=1 \
--          -f supabase/tests/bahikhata_consolidated_tests.sql
--   (-o /dev/null hides the per-assertion result rows; NOTICEs and errors still print.)
--   Supabase SQL Editor (scratch project): paste the whole file and run. It
--   connects as `postgres`, which is all the fixtures need.
--
-- SECTIONS
--   01  Schema contract                       NEW
--   02  Foundation triggers/constraints       NEW  (0001, create_business)
--   03  Membership RLS                        was 0002_rls_membership
--   04  my_invitations()                      was 0002b_my_invitations
--   05  Membership management                 was 0002c_membership_management
--   06  business_exists()                     was 0003b_business_exists
--   07  Archive / restore / permanent delete  was 0004_archive_delete_customers
--   08  Void / restore_transaction()          was 0005_void_restore
--   09  customer_ledger()                     was 0006_customer_ledger
--   10  transaction_rollup()                  was 0006b_transaction_rollup (+ NEW)
--   11  daily_activity()                      was 0007_daily_activity
--   12  import_history()                      was 0008_import_history
--   13  customer_balances + embed function    NEW  (0009, 0010)
--   14  Hardening                             NEW  (F5)
--   15  delete_transaction + deletion log     NEW  (v3)
--   16  Delete customer + restore deleted     NEW  (v3)
--   17  Actor stamping                        NEW  (v3)
--   18  last_activity_at + dashboard tz       NEW  (v3)
--   19  last_payment_at (Who to chase)        NEW  (v3.1)
--
-- CONVENTIONS
--   * Fixture users are fake UUIDs with @example.com emails; no secrets.
--   * When a migration changes behaviour, update its section in the same change.
--   * Add a new feature's tests as a new SECTION below (savepoint + rollback to).
-- ============================================================================

begin;

-- ============================================================================
-- PART A — SHARED HELPERS (defined once; transaction-local in pg_temp)
-- ============================================================================
-- The ten original files each re-declared their own copy of these. They are
-- unified here. Two deliberate tightenings vs. the originals:
--   * expect_eq / expect_num / ... use IS DISTINCT FROM, so a NULL actual value
--     now FAILS instead of silently passing (the old expect_eq used <>, which
--     is NULL — i.e. "no error" — when either side is NULL).
--   * expect_sqlstate() asserts the exact SQLSTATE, so a negative test can no
--     longer pass because of an unrelated typo or error.

-- ---- identity switching -----------------------------------------------------
-- as_user: act as an authenticated Supabase user (RLS sees auth.uid()/jwt email).
create or replace function pg_temp.as_user(p_sub text, p_email text default null)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'email', p_email)::text,
    true
  );
end;
$$;

-- as_admin: back to the connecting superuser (bypasses RLS; for fixtures/inspection).
create or replace function pg_temp.as_admin()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
end;
$$;

-- ---- progress marker --------------------------------------------------------
create or replace function pg_temp.section(p_name text)
returns void
language plpgsql
as $$
begin
  raise notice '--- %', p_name;
end;
$$;

-- ---- equality assertions ----------------------------------------------------
create or replace function pg_temp.expect_eq(p_what text, p_actual bigint, p_expected bigint)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_num(p_what text, p_actual numeric, p_expected numeric)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_text(p_what text, p_actual text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.expect_bool(p_what text, p_actual boolean, p_expected boolean)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- expect_period: a rollup bucket (wall-clock timestamp) against 'YYYY-MM-DD'.
create or replace function pg_temp.expect_period(p_what text, p_actual timestamp, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected::timestamp then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- expect_date: a daily_activity day against a date.
create or replace function pg_temp.expect_date(p_what text, p_actual date, p_expected date)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % — expected %, got %', p_what, p_expected, p_actual;
  end if;
end;
$$;

-- ---- negative assertions ----------------------------------------------------
-- expect_denied: the statement must raise SOME error (original helper, kept for
-- the verbatim RLS tests).
create or replace function pg_temp.expect_denied(p_what text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'TEST FAILED: % — statement was NOT rejected', p_what;
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      -- rejected as expected
      null;
  end;
end;
$$;

-- expect_sqlstate: the statement must raise exactly this SQLSTATE (NEW).
create or replace function pg_temp.expect_sqlstate(p_what text, p_sql text, p_state text)
returns void
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
    v_state := null;
  exception
    when others then
      v_state := sqlstate;
  end;

  if v_state is null then
    raise exception 'TEST FAILED: % — statement was NOT rejected', p_what;
  end if;
  if v_state <> p_state then
    raise exception 'TEST FAILED: % — expected SQLSTATE %, got %', p_what, p_state, v_state;
  end if;
end;
$$;

-- expect_anon_denied: run the statement as the `anon` role; it must fail with
-- 42501 (insufficient_privilege) (NEW).
create or replace function pg_temp.expect_anon_denied(p_what text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    perform set_config('role', 'anon', true);
    execute p_sql;
    v_state := null;
  exception
    when others then
      v_state := sqlstate;
  end;
  execute 'reset role';   -- leave no anon state behind, whatever happened above

  if v_state is null then
    raise exception 'TEST FAILED: % — anonymous caller was allowed', p_what;
  end if;
  if v_state <> '42501' then
    raise exception 'TEST FAILED: % — expected 42501 for anon, got %', p_what, v_state;
  end if;
end;
$$;

-- ============================================================================
-- SECTION 01 — Schema contract
--   Source: NEW — no original file (covers the end state of migrations 0001-0010)
--
--   Pins the shape of the schema the app and PostgREST rely on: RLS on every table,
--   exactly the 19 intended policies (all TO authenticated), v1 policies and v1 balance
--   RPCs gone, NOT NULL tenancy, the columns later migrations depend on, enum labels,
--   rule-enforcing indexes, and search_path pinned on every SECURITY DEFINER function.
-- ============================================================================
savepoint s01;
select pg_temp.section('01 Schema contract');

-- (NEW) Nothing here existed as a test before: these assertions pin the
-- SHAPE of the schema that the app and PostgREST depend on, so a future edit
-- that silently changes it fails loudly. All checks run as admin (catalog reads).

select pg_temp.as_admin();

do $$
declare
  v bigint;
  v_txt text;
begin
  -- RLS is switched on for every table (a table without RLS is world-readable
  -- to any role with a grant).
  select count(*) into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and c.relname in ('profiles','businesses','business_members',
                       'business_invitations','customers','transactions','deletion_log');
  perform pg_temp.expect_eq('RLS enabled on all 7 tables', v, 7);

  -- The v1 "any signed-in user" policies are gone for good (S-20).
  select count(*) into v from pg_policies
   where schemaname = 'public'
     and policyname in ('Authenticated users can manage customers',
                        'Authenticated users can manage transactions');
  perform pg_temp.expect_eq('v1 broad policies are gone', v, 0);

  -- Exactly the 19 intended policies exist, and every one is scoped to the
  -- `authenticated` role only — no stray anon/public policy.
  select count(*) into v from pg_policies where schemaname = 'public';
  perform pg_temp.expect_eq('exactly 19 policies exist', v, 19);

  select count(*) into v from pg_policies
   where schemaname = 'public' and roles <> '{authenticated}'::name[];
  perform pg_temp.expect_eq('every policy is TO authenticated only', v, 0);

  -- The deletion log is written only by SECURITY DEFINER functions: signed-in users
  -- hold no write privileges on it, and anon holds none at all.
  perform pg_temp.expect_bool('authenticated cannot INSERT into deletion_log', has_table_privilege('authenticated', 'public.deletion_log', 'insert'), false);
  perform pg_temp.expect_bool('authenticated cannot UPDATE deletion_log', has_table_privilege('authenticated', 'public.deletion_log', 'update'), false);
  perform pg_temp.expect_bool('authenticated cannot DELETE from deletion_log', has_table_privilege('authenticated', 'public.deletion_log', 'delete'), false);
  perform pg_temp.expect_bool('anon cannot SELECT deletion_log', has_table_privilege('anon', 'public.deletion_log', 'select'), false);

  -- The unscoped v1 balance RPCs must not exist (they ignored tenancy).
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_customer_balance', 'get_all_customer_balances');
  perform pg_temp.expect_eq('v1 balance RPCs are gone', v, 0);

  -- Mandatory tenancy: business_id is NOT NULL on both data tables.
  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name in ('customers', 'transactions')
     and column_name = 'business_id' and is_nullable = 'NO';
  perform pg_temp.expect_eq('business_id is NOT NULL on customers + transactions', v, 2);

  -- Columns later migrations relied on actually exist (0005 once used
  -- void_reason before any migration created it).
  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name = 'transactions'
     and column_name in ('void_reason', 'voided_at', 'voided_by', 'updated_by');
  perform pg_temp.expect_eq('transactions void/audit columns exist', v, 4);

  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name = 'customers'
     and column_name in ('archived_at', 'deleted_at', 'deleted_by', 'created_by');
  perform pg_temp.expect_eq('customers archive/audit columns exist', v, 4);

  -- delete_customer_permanently() deletes transactions explicitly BECAUSE the
  -- FK is NO ACTION ('a'). If someone adds a cascade, the RPC's comment and
  -- the atomicity story change — make that a conscious decision.
  select confdeltype::text into v_txt from pg_constraint
   where conname = 'transactions_customer_id_fkey';
  perform pg_temp.expect_text('transactions -> customers FK is NO ACTION', v_txt, 'a');

  -- Enum labels the client hard-codes.
  perform pg_temp.expect_text('business_role labels',
    array_to_string(enum_range(null::public.business_role), ','), 'owner,editor,viewer');
  perform pg_temp.expect_text('transaction_status labels',
    array_to_string(enum_range(null::public.transaction_status), ','), 'active,edited,voided');
  perform pg_temp.expect_text('transaction_type labels',
    array_to_string(enum_range(null::public.transaction_type), ','), 'charge,payment');
  perform pg_temp.expect_text('transaction_source labels',
    array_to_string(enum_range(null::public.transaction_source), ','), 'manual,import');
  perform pg_temp.expect_text('invitation_status labels',
    array_to_string(enum_range(null::public.invitation_status), ','), 'pending,accepted,declined,revoked');

  -- The partial/unique indexes that enforce business rules in the database.
  select count(*) into v from pg_indexes
   where schemaname = 'public'
     and indexname in ('businesses_one_per_owner', 'one_owner_row_per_business',
                       'one_pending_invite_per_email');
  perform pg_temp.expect_eq('the 3 rule-enforcing unique indexes exist', v, 3);

  -- Every SECURITY DEFINER function pins its search_path (otherwise a caller
  -- could shadow public objects). Extension-owned functions are excluded.
  select count(*) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not coalesce(p.proconfig::text[] @> array['search_path=public'], false);
  perform pg_temp.expect_eq('every SECURITY DEFINER function pins search_path', v, 0);
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s01;   -- discard this section's fixtures
release savepoint s01;

-- ============================================================================
-- SECTION 02 — Foundation: triggers, constraints, create_business()
--   Source: NEW — exercises migration 0001 (S-05) and create_business() from 0002 directly
--
--   handle_new_user() mirrors auth.users into profiles (full_name/name and
--   avatar_url/picture fallbacks); add_owner_membership() makes the owner row; the
--   database itself refuses a second owned business, short/blank names, a second owner
--   row, uppercase invitation emails, owner invitations and duplicate pending invites;
--   create_business() works once per user and is refused the second time.
-- ============================================================================
savepoint s02;
select pg_temp.section('02 Foundation: triggers, constraints, create_business()');

-- (NEW) Migration 0001's triggers and database-enforced rules had only been
-- exercised indirectly. This section tests them head-on, plus create_business().

-- Fixtures: three users (as admin, so the on_auth_user_created trigger fires).
select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com',
     '{"full_name":"Olivia Owner","name":"Ignored Google Name","avatar_url":"https://example.com/o.png"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',
     '{"name":"Eli From Google","picture":"https://example.com/e.png"}'),
  ('33333333-3333-3333-3333-333333333333', 'zed@example.com', '{}');

-- ---- 2.1 handle_new_user(): a profiles row appears for every auth user -----
do $$
declare
  v_row public.profiles;
begin
  select * into v_row from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.expect_text('profile mirrors the email', v_row.email, 'olivia@example.com');
  perform pg_temp.expect_text('full_name wins over name', v_row.full_name, 'Olivia Owner');
  perform pg_temp.expect_text('avatar_url is mirrored', v_row.avatar_url, 'https://example.com/o.png');

  select * into v_row from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('name is the fallback for full_name', v_row.full_name, 'Eli From Google');
  perform pg_temp.expect_text('picture is the fallback for avatar_url', v_row.avatar_url, 'https://example.com/e.png');

  select * into v_row from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.expect_text('empty metadata gives a NULL name', v_row.full_name, null);
end;
$$;

-- ---- 2.2 add_owner_membership(): creating a business adds the owner row ----
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

select pg_temp.expect_eq(
  'a new business gets exactly one member row',
  (select count(*) from public.business_members
    where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1);
select pg_temp.expect_text(
  'and that row is the owner',
  (select role::text from public.business_members
    where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111'), 'owner');

-- ---- 2.3 Rules enforced by the database itself ----------------------------
select pg_temp.expect_sqlstate(
  'D-01: a second owned business for the same user is refused',
  $$insert into public.businesses (owner_id, name) values ('11111111-1111-1111-1111-111111111111', 'Second')$$,
  '23505');

select pg_temp.expect_sqlstate(
  'business name shorter than 2 characters is refused',
  $$insert into public.businesses (owner_id, name) values ('22222222-2222-2222-2222-222222222222', 'A')$$,
  '23514');

select pg_temp.expect_sqlstate(
  'business name is trimmed before the length check',
  $$insert into public.businesses (owner_id, name) values ('22222222-2222-2222-2222-222222222222', ' A ')$$,
  '23514');

select pg_temp.expect_sqlstate(
  'a second owner row for the same business is refused',
  $$insert into public.business_members (business_id, user_id, role) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner')$$,
  '23505');

select pg_temp.expect_sqlstate(
  'invitation emails must be stored lowercase',
  $$insert into public.business_invitations (business_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Mixed@Example.com', 'viewer', '11111111-1111-1111-1111-111111111111')$$,
  '23514');

select pg_temp.expect_sqlstate(
  'an invitation cannot grant the owner role',
  $$insert into public.business_invitations (business_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x@example.com', 'owner', '11111111-1111-1111-1111-111111111111')$$,
  '23514');

insert into public.business_invitations (business_id, email, role, invited_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'eli@example.com', 'editor', '11111111-1111-1111-1111-111111111111');

select pg_temp.expect_sqlstate(
  'only one PENDING invitation per email per business',
  $$insert into public.business_invitations (business_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001', 'eli@example.com', 'viewer', '11111111-1111-1111-1111-111111111111')$$,
  '23505');

-- Once the first invitation is answered, a fresh pending one is allowed again.
update public.business_invitations set status = 'declined'
 where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' and email = 'eli@example.com';
insert into public.business_invitations (business_id, email, role, invited_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'eli@example.com', 'viewer', '11111111-1111-1111-1111-111111111111');

select pg_temp.expect_eq(
  'a new pending invitation is allowed after the old one was answered',
  (select count(*) from public.business_invitations
    where email = 'eli@example.com' and status = 'pending'), 1);

-- ---- 2.4 create_business() RPC --------------------------------------------
-- Zed has no business yet. The RPC (not a direct insert) is how the app makes one.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'zed@example.com');

do $$
declare
  v_business public.businesses;
begin
  v_business := public.create_business('ZedCo', 'retail', '0123', 'z@example.com', 'Dhaka', 'notes');
  perform pg_temp.expect_text('create_business returns the new row', v_business.name, 'ZedCo');
  perform pg_temp.expect_text('the caller is the owner', v_business.owner_id::text, '33333333-3333-3333-3333-333333333333');
  perform pg_temp.expect_text('optional fields are stored', v_business.business_type, 'retail');
end;
$$;

-- The trigger ran inside the RPC as the `authenticated` caller: Zed is now an
-- owner member and can read his own business under RLS.
select pg_temp.expect_text(
  'Zed is an owner member of the business he just created',
  (select role::text from public.business_members where user_id = '33333333-3333-3333-3333-333333333333'),
  'owner');
select pg_temp.expect_eq(
  'Zed can read his new business under RLS',
  (select count(*) from public.businesses where name = 'ZedCo'), 1);

select pg_temp.expect_sqlstate(
  'a second create_business() call is refused',
  $$select public.create_business('Another')$$,
  '42501');

select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s02;   -- discard this section's fixtures
release savepoint s02;

-- ============================================================================
-- SECTION 03 — Membership RLS (read/write by role, invitations, dashboard)
--   Source: tests/0002_rls_membership.sql (S-06) — migration 0002
--
--   Members read / outsiders do not; Viewer is read-only (inserts raise 42501, row-scoped
--   UPDATE/DELETE match zero rows); Editor writes but cannot destroy; Owner controls the
--   business and role changes; invitation visibility (case-insensitive email) and
--   respond_to_invitation(); outsiders cannot use dashboard_summary(); deleting a business
--   cascades. Includes the cross-business transaction rejection from the 0001 trigger.
--   Fixture: Acme owned by Olivia (Eli = editor, Vic = viewer, Zed = outsider); Beta owned
--   by Bea, where Eli is also an editor (D-01: at most one OWNED business per user).
--   (The old section-0 "drop the v1 policies" workaround is gone: they no longer exist.)
-- ============================================================================
savepoint s03;
select pg_temp.section('03 Membership RLS (read/write by role, invitations, dashboard)');

-- ------------------------------------------------------------
-- 03.1 Fixtures
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',     '{"full_name":"Eli"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}'),
  ('55555555-5555-5555-5555-555555555555', 'bea@example.com',    '{"full_name":"Bea"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'Beta');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'editor');

insert into public.customers (business_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Customer One');

insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
values (
  (select id from public.customers where name = 'Customer One'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'charge', 500, now(),
  '11111111-1111-1111-1111-111111111111'
);

insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'viewer',
  '11111111-1111-1111-1111-111111111111'
);

-- ------------------------------------------------------------
-- 03.2 Members read, outsiders do not
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Olivia reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Olivia reads Acme transactions', v_count, 1);

  select count(*) into v_count from public.businesses;
  perform pg_temp.expect_eq('Olivia reads Acme business', v_count, 1);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Olivia reads Acme members', v_count, 3);

  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Olivia reads Acme invitations', v_count, 1);
end;
$$;

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Eli reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Eli reads Acme transactions', v_count, 1);
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Vic reads Acme customers', v_count, 1);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Vic reads Acme transactions', v_count, 1);
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Zed reads zero customers', v_count, 0);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Zed reads zero transactions', v_count, 0);

  select count(*) into v_count from public.businesses;
  perform pg_temp.expect_eq('Zed reads zero businesses', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Zed reads zero members', v_count, 0);

  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Zed reads zero invitations', v_count, 0);

  select count(*) into v_count from public.customer_balances;
  perform pg_temp.expect_eq('Zed reads zero balance-view rows', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 03.3 Viewer is read-only. Inserts raise 42501 (WITH CHECK on the
--    new row); row-scoped UPDATE/DELETE are filtered by RLS
--    instead — they match zero rows, which is why the assertions
--    below check that nothing changed rather than expecting an
--    error. Same semantics as tests 0004/0005.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select pg_temp.expect_denied(
  'Vic cannot insert a customer',
  $$insert into public.customers (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Nope')$$
);

do $$
declare
  v_count int;
begin
  update public.customers set name = 'Nope'
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Nope';
  perform pg_temp.expect_eq('Vic''s customer update changed zero rows', v_count, 0);
end;
$$;

do $$
declare
  v_count int;
begin
  delete from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Vic''s customer delete removed zero rows', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Vic cannot insert a transaction',
  $$insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
   values ((select id from public.customers where name = 'Customer One'), 'aaaaaaaa-0000-0000-0000-000000000001', 'charge', 10, now(), '33333333-3333-3333-3333-333333333333')$$
);

do $$
declare
  v_count int;
begin
  update public.transactions set amount = 1
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount = 1;
  perform pg_temp.expect_eq('Vic''s transaction update changed zero rows', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 03.4 Editor can write but not destroy
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  insert into public.customers (business_id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Customer Two');
  select count(*) into v_count from public.customers where name = 'Customer Two';
  perform pg_temp.expect_eq('Eli inserted a customer', v_count, 1);

  insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
  values ((select id from public.customers where name = 'Customer Two'),
          'aaaaaaaa-0000-0000-0000-000000000001', 'payment', 100, now(),
          '22222222-2222-2222-2222-222222222222');
  select count(*) into v_count from public.transactions where amount = 100;
  perform pg_temp.expect_eq('Eli inserted a transaction', v_count, 1);

  update public.customers set name = 'Customer Two Updated' where name = 'Customer Two';
  select count(*) into v_count from public.customers where name = 'Customer Two Updated';
  perform pg_temp.expect_eq('Eli updated a customer', v_count, 1);
end;
$$;

-- Cross-business transaction: Eli is an editor of Beta, but the
-- customer belongs to Acme — the 0001 match trigger must reject it.
select pg_temp.expect_denied(
  'Eli cannot move an Acme customer transaction into Beta',
  $$insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
   values ((select id from public.customers where name = 'Customer One'), 'bbbbbbbb-0000-0000-0000-000000000002', 'charge', 10, now(), '22222222-2222-2222-2222-222222222222')$$
);

do $$
declare
  v_count int;
begin
  delete from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Eli''s direct delete removed zero customers', v_count, 2);
end;
$$;

do $$
declare
  v_count int;
begin
  delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Eli''s business delete removed zero rows', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Eli cannot change a member role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'editor'::business_role)$$
);

select pg_temp.expect_denied(
  'Eli cannot remove a member',
  $$select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333')$$
);

do $$
declare
  v_count int;
begin
  update public.businesses set name = 'Hijacked'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses where name = 'Hijacked';
  perform pg_temp.expect_eq('Eli''s business update changed zero rows', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Eli cannot insert an invitation',
  $$insert into public.business_invitations (business_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001', 'forced@example.com', 'editor'::business_role, '22222222-2222-2222-2222-222222222222')$$
);

-- ------------------------------------------------------------
-- 03.5 Owner controls the business
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
  v_summary record;
begin
  update public.businesses set name = 'Acme Updated' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v_count from public.businesses where name = 'Acme Updated';
  perform pg_temp.expect_eq('Olivia updated the business', v_count, 1);

  select * into v_summary from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001');
  perform pg_temp.expect_eq('dashboard_summary open accounts — unsettled in BOTH directions (a paid-ahead -100 is open; only 0 is closed)', v_summary.open_accounts, 2);
  perform pg_temp.expect_eq('dashboard_summary today count — the fixture charge AND Eli''s section-6 payment', v_summary.today_count, 2);
  if v_summary.total_receivable <> 500 then
    raise exception 'TEST FAILED: dashboard_summary receivable — expected 500, got %', v_summary.total_receivable;
  end if;
  if v_summary.top_debtors is null or jsonb_array_length(v_summary.top_debtors) <> 1 then
    raise exception 'TEST FAILED: dashboard_summary top_debtors should have 1 entry';
  end if;

  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'viewer';
  perform pg_temp.expect_eq('Olivia changed Eli to viewer', v_count, 1);

  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role);
end;
$$;

select pg_temp.expect_denied(
  'Olivia cannot change her own owner role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'viewer'::business_role)$$
);

select pg_temp.expect_denied(
  'Olivia cannot leave her own business',
  $$select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 03.6 Invitations: visibility and responding
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'Vic@Example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Vic sees the invitation (case-insensitive email)', v_count, 1);
end;
$$;

do $$
declare
  v_invite public.business_invitations;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'vic@example.com'),
    true
  );
  if v_invite.status <> 'accepted' then
    raise exception 'TEST FAILED: invitation should be accepted, got %', v_invite.status;
  end if;
end;
$$;

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '33333333-3333-3333-3333-333333333333'
     and role = 'viewer';
  perform pg_temp.expect_eq('Vic is now a viewer member', v_count, 1);
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select pg_temp.expect_denied(
  'Vic cannot respond twice',
  $$select public.respond_to_invitation((select id from public.business_invitations where email = 'vic@example.com'), true)$$
);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_invitations;
  perform pg_temp.expect_eq('Zed does not see the invitation', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Zed cannot accept Vic''s invitation',
  $$select public.respond_to_invitation((select id from public.business_invitations where email = 'vic@example.com'), true)$$
);

-- ------------------------------------------------------------
-- 03.7 Outsider cannot use dashboard_summary
-- ------------------------------------------------------------
select pg_temp.expect_denied(
  'Zed cannot call dashboard_summary for Acme',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 03.8 Owner cleanup: remove member, delete business (cascade)
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli was removed', v_count, 0);
end;
$$;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into v_count from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Olivia deleted the business', v_count, 0);

  select count(*) into v_count from public.business_members where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('members cascade-deleted', v_count, 0);

  select count(*) into v_count from public.customers where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('customers cascade-deleted', v_count, 0);

  select count(*) into v_count from public.transactions where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('transactions cascade-deleted', v_count, 0);

  select count(*) into v_count from public.business_invitations where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('invitations cascade-deleted', v_count, 0);
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s03;   -- discard this section's fixtures
release savepoint s03;

-- ============================================================================
-- SECTION 04 — my_invitations()
--   Source: tests/0002b_my_invitations.sql (S-24) — migration 0002b
--
--   The invitee sees exactly their own pending invitation joined with business and
--   inviter names (case-insensitive JWT email); an outsider sees nothing; answered
--   invitations (accepted or declined) leave the list; accepting while already a member
--   succeeds without a duplicate membership row.
-- ============================================================================
savepoint s04;
select pg_temp.section('04 my_invitations()');

-- ------------------------------------------------------------
-- 04.1 Fixtures
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'viewer',
  '11111111-1111-1111-1111-111111111111'
);

-- ------------------------------------------------------------
-- 04.2 The invitee sees their invitation with business and inviter names
--    (JWT email is mixed-case on purpose — matching must ignore case)
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'Vic@Example.com');

do $$
declare
  v_invite record;
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Vic sees exactly one invitation', v_count, 1);

  select * into v_invite from public.my_invitations() limit 1;
  perform pg_temp.expect_text('Business name is joined in', v_invite.business_name, 'Acme');
  perform pg_temp.expect_text('Inviter display name is joined in', v_invite.inviter_name, 'Olivia');
  perform pg_temp.expect_text('The invited role is preserved', v_invite.role::text, 'viewer');
end;
$$;

-- ------------------------------------------------------------
-- 04.3 An outsider sees nothing
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Zed sees zero invitations', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 04.4 Answering removes the invitation from the list (accept path);
--    a declined invitation also disappears. The list and the RPC agree.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

do $$
declare
  v_invite public.business_invitations;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'vic@example.com'),
    true
  );
  if v_invite.status <> 'accepted' then
    raise exception 'TEST FAILED: invitation should be accepted, got %', v_invite.status;
  end if;
end;
$$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Accepted invitation leaves the list', v_count, 0);

  select count(*) into v_count from public.business_members
   where user_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.expect_eq('Vic is now a member', v_count, 1);
end;
$$;

-- A declined invitation disappears the same way. The INSERT is
-- owner-only under RLS, so the fixture sets it up with admin eyes
-- (Vic — still the active user from the accept above — is only a
-- viewer member and would be refused).
select pg_temp.as_admin();

insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'zed@example.com', 'editor',
  '11111111-1111-1111-1111-111111111111'
);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
declare
  v_invite public.business_invitations;
  v_count int;
begin
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations where email = 'zed@example.com'),
    false
  );
  if v_invite.status <> 'declined' then
    raise exception 'TEST FAILED: invitation should be declined, got %', v_invite.status;
  end if;

  select count(*) into v_count from public.my_invitations();
  perform pg_temp.expect_eq('Declined invitation leaves the list', v_count, 0);

end;
$$;

-- The membership check needs admin eyes: as Zed (a non-member) RLS
-- shows zero member rows, which would prove nothing. Scoped to Zed,
-- the assertion is exact: declining must leave no membership row
-- behind (an unscoped admin count would also see Olivia's
-- trigger-created owner row and Vic's accepted membership). The next
-- section's invitation INSERT is owner-only, so it stays admin too.
select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where user_id = '44444444-4444-4444-4444-444444444444';
  perform pg_temp.expect_eq('Declining does not create a membership', v_count, 0);
end;
$$;

-- ------------------------------------------------------------
-- 04.5 Accepting while already a member is a success, not an error
--    (the S-24 "already a member" scenario: the insert is
--    `on conflict do nothing`, so a second accept just works)
-- ------------------------------------------------------------
insert into public.business_invitations (business_id, email, role, invited_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'vic@example.com', 'editor',
  '11111111-1111-1111-1111-111111111111'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

do $$
declare
  v_invite public.business_invitations;
  v_count int;
begin
  -- Both of Vic's invitations are visible to Vic under the invitee
  -- policy (it does not filter by status), so the subquery must pin
  -- the pending one — otherwise the scalar subquery returns two rows
  -- and the accept would target the wrong invitation.
  select * into v_invite from public.respond_to_invitation(
    (select id from public.business_invitations
      where email = 'vic@example.com' and status = 'pending'),
    true
  );
  if v_invite.status <> 'accepted' then
    raise exception 'TEST FAILED: re-accept should succeed, got %', v_invite.status;
  end if;

  -- No duplicate membership row appeared.
  select count(*) into v_count from public.business_members
   where user_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.expect_eq('Re-accepting adds no duplicate membership', v_count, 1);
end;
$$;

select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s04;   -- discard this section's fixtures
release savepoint s04;

-- ============================================================================
-- SECTION 05 — Membership management (change role / remove / leave)
--   Source: tests/0002c_membership_management.sql (S-25) — RPCs from migration 0002
--
--   Owner changes roles; promotion to owner and touching/removing the owner row are
--   refused; a removed member loses all access while their customers and transactions
--   stay; a member can leave; creator name resolves while the profile row is readable and
--   degrades to NULL ("Former member") once it is not — the transaction never moves.
-- ============================================================================
savepoint s05;
select pg_temp.section('05 Membership management (change role / remove / leave)');

-- ------------------------------------------------------------
-- 05.1 Fixtures: Olivia owns Acme; Eli (editor) created a customer and
--    a transaction; Vic is a viewer; Zed is an outsider.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',     '{"full_name":"Eli"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',     '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',     '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

-- Eli records history for Acme.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

insert into public.customers (business_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'History Customer');

insert into public.transactions (customer_id, business_id, type, amount, occurred_at, created_by)
values (
  (select id from public.customers where name = 'History Customer'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'charge', 75, now(),
  '22222222-2222-2222-2222-222222222222'
);

select pg_temp.as_admin();

-- ------------------------------------------------------------
-- 05.2 Owner changes a role; promotion to owner and touching the owner
--    row are refused ("owner row is protected")
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_count int;
begin
  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'viewer';
  perform pg_temp.expect_eq('Olivia changed Eli to viewer', v_count, 1);

  perform public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role);
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'editor';
  perform pg_temp.expect_eq('Olivia changed Eli back to editor', v_count, 1);
end;
$$;

select pg_temp.expect_denied(
  'Nobody can be promoted to owner',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner'::business_role)$$
);

select pg_temp.expect_denied(
  'The owner row cannot be removed',
  $$select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111')$$
);

select pg_temp.expect_denied(
  'The owner cannot leave their own business',
  $$select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- ------------------------------------------------------------
-- 05.3 Owner removes Eli: membership gone, access gone, history intact
-- ------------------------------------------------------------
select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s membership row is gone', v_count, 0);

  -- History stays readable: nothing Eli created was touched.
  select count(*) into v_count from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and name = 'History Customer';
  perform pg_temp.expect_eq('Eli''s customer remains', v_count, 1);

  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s transaction remains', v_count, 1);
end;
$$;

-- Eli has lost access: reads return nothing and the RPCs refuse.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Removed Eli reads zero customers', v_count, 0);

  select count(*) into v_count from public.transactions;
  perform pg_temp.expect_eq('Removed Eli reads zero transactions', v_count, 0);

  select count(*) into v_count from public.business_members;
  perform pg_temp.expect_eq('Removed Eli sees no memberships', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Removed Eli cannot call dashboard_summary',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

select pg_temp.expect_denied(
  'Removed Eli cannot re-add himself via change_member_role',
  $$select public.change_member_role('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'::business_role)$$
);

-- ------------------------------------------------------------
-- 05.4 Vic leaves the business himself
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');

select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members where user_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.expect_eq('Vic sees no memberships after leaving', v_count, 0);

  select count(*) into v_count from public.customers;
  perform pg_temp.expect_eq('Departed Vic reads zero customers', v_count, 0);
end;
$$;

select pg_temp.expect_denied(
  'Departed Vic cannot call dashboard_summary',
  $$select public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$
);

-- Only Vic's own membership row went; the owner is untouched.
select pg_temp.as_admin();

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.business_members
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq('Only the owner remains a member', v_count, 1);
end;
$$;

-- ------------------------------------------------------------
-- 05.5 History contract: creator name resolves while the profile row
--    exists AND is readable; once removal (or a deleted profile) hides
--    it, the join yields NULL — the UI renders 'Former member' — and
--    the transaction itself never moves.
-- ------------------------------------------------------------
-- Right after the removal: remove_member deleted ONLY the membership
-- row. As postgres the profile is still there; under Olivia's
-- (authenticated) RLS the co-members policy no longer matches Eli, so
-- her join sees NULL — exactly the app-side situation that must render
-- 'Former member', never an error and never a missing transaction.
do $$
declare
  v_count int;
  v_name  text;
begin
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Eli''s transaction is still there for the owner', v_count, 1);
end;
$$;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

do $$
declare
  v_name text;
begin
  select p.full_name into v_name
    from public.transactions t
    join public.profiles p on p.id = t.created_by
   where t.created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('Removed member''s name is RLS-hidden (UI: Former member)', v_name, null);
end;
$$;

select pg_temp.as_admin();

do $$
declare
  v_name text;
begin
  -- Nothing was deleted: at the database level the row and name exist.
  select full_name into v_name from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('remove_member deleted nothing but the membership row', v_name, 'Eli');
end;
$$;

delete from public.profiles where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_count int;
  v_name  text;
begin
  select count(*) into v_count from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_eq('Transaction survives the profile being gone', v_count, 1);

  select p.full_name into v_name
    from public.transactions t
    join public.profiles p on p.id = t.created_by
   where t.created_by = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect_text('Creator name is NULL once the profile is gone (UI: Former member)', v_name, null);
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s05;   -- discard this section's fixtures
release savepoint s05;

-- ============================================================================
-- SECTION 06 — business_exists() — the lost-access probe
--   Source: tests/0003b_business_exists.sql (S-27) — migration 0003b
--
--   Owner, member and outsider all learn whether a business row exists; a missing id is
--   false, not an error; removal keeps the row (true) and deletion removes it (false);
--   anon cannot execute the function.
-- ============================================================================
savepoint s06;
select pg_temp.section('06 business_exists() — the lost-access probe');

-- ------------------------------------------------------------
-- 06.1 Fixtures: Olivia owns Acme; Vic is a member; Zed is an outsider.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',    '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',    '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

-- ------------------------------------------------------------
-- 06.2 Members and outsiders both see existence: the owner, a member and
--    a complete outsider all get true; a missing id gives false.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_bool(
  'owner sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
select pg_temp.expect_bool(
  'member sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bool(
  'outsider sees Acme exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);
select pg_temp.expect_bool(
  'missing id is false, not an error',
  public.business_exists('eeeeeeee-0000-0000-0000-000000000009'), false);

-- ------------------------------------------------------------
-- 06.3 The removed-member and deleted-business cases the S-27 guard
--    distinguishes: removal keeps the row (exists = true), deletion
--    removes it (exists = false).
-- ------------------------------------------------------------
select pg_temp.as_admin();
delete from public.business_members
 where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and user_id = '33333333-3333-3333-3333-333333333333';

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
select pg_temp.expect_bool(
  'after removal the business still exists (access lost, not deleted)',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), true);

select pg_temp.as_admin();
delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_bool(
  'after deletion the business no longer exists',
  public.business_exists('aaaaaaaa-0000-0000-0000-000000000001'), false);

-- ------------------------------------------------------------
-- 06.4 Nothing for anonymous callers: the function is not executable by
--    the anon role or the public role.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.business_exists('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s06;   -- discard this section's fixtures
release savepoint s06;

-- ============================================================================
-- SECTION 07 — Archive, restore and permanent delete of customers
--   Source: tests/0004_archive_delete_customers.sql (S-30) — migration 0004
--
--   Viewer archive = 0 rows changed, Editor archive works; archiving keeps every
--   transaction and the balance (view exposes archived_at); dashboard_summary drops the
--   archived customer and restore brings it back; delete_customer_permanently():
--   Editor/Viewer/outsider get 42501, mismatched business is not-found, Owner deletes the
--   customer AND all transactions atomically (the FK has no cascade); anon cannot execute.
-- ============================================================================
savepoint s07;
select pg_temp.section('07 Archive, restore and permanent delete of customers');

-- ------------------------------------------------------------
-- 07.1 Fixtures: Ollie owns Acme; Evan is an editor, Vic a viewer and
--    Zed a complete outsider. Asha owes 4500 (charge 5000, payment
--    500, 2 transactions); Ravi is settled with none.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('22222222-2222-2222-2222-222222222222', 'evan@example.com',  '{"full_name":"Evan"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',   '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '1 day', '11111111-1111-1111-1111-111111111111');

-- ------------------------------------------------------------
-- 07.2 Baseline dashboard: 2 customers, Asha's 4500 receivable.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_eq(
  'baseline customer_count',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  2);
select pg_temp.expect_num(
  'baseline total_receivable',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  4500);

-- ------------------------------------------------------------
-- 07.3 Viewer cannot archive: their update matches zero rows and the
--    column stays NULL. Editor can.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'viewer archive attempt left Asha active',
  (select archived_at is null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'editor archive set archived_at',
  (select archived_at is not null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

-- ------------------------------------------------------------
-- 07.4 Archive keeps the history: both transactions survive, and the
--    balance view still carries Asha's row with the balance AND the
--    archived_at flag (the Archived filter shows balances).
-- ------------------------------------------------------------
select pg_temp.expect_eq(
  'archive kept every transaction',
  (select count(*) from public.transactions
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  2);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
select pg_temp.expect_num(
  'archived customer keeps its balance in the view',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);
select pg_temp.expect_bool(
  'view exposes archived_at',
  (select archived_at is not null from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

-- ------------------------------------------------------------
-- 07.5 Dashboard totals exclude the archived customer (C-6): 1 customer
--    left, no receivable, no debtors. Ravi (settled) remains.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_eq(
  'customer_count after archive',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  1);
select pg_temp.expect_num(
  'receivable after archive',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  0);
select pg_temp.expect_bool(
  'top debtors empty after archive',
  (select top_debtors = '[]'::jsonb from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  true);

-- ------------------------------------------------------------
-- 07.6 Restore is the same update in reverse: totals come back whole.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = null
 where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_bool(
  'restore cleared archived_at',
  (select archived_at is null from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  true);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_eq(
  'customer_count after restore',
  (select customer_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  2);

-- Re-archive for the permanent-delete scenarios (the UI only offers
-- Delete permanently on an archived row).
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.customers
   set archived_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 07.7 Permanent delete: Editor, Viewer and outsider are refused with
--    42501 — only the owner destroys.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: editor was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: editor got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: viewer was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: viewer got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: outsider was allowed to delete permanently';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: outsider got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

-- A mismatched p_business_id is 'Customer not found' even for the
-- owner — the call cannot be aimed at another business's row.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
do $$
begin
  begin
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000009');
    raise exception 'TEST FAILED: wrong business id was accepted';
  exception
    when no_data_found then null;
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise exception 'TEST FAILED: wrong business id got % (%)', sqlstate, sqlerrm;
  end;
end;
$$;

-- ------------------------------------------------------------
-- 07.8 Owner succeeds: the customer AND every transaction are gone in
--    one atomic operation, and the bystander customer stays.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select public.delete_customer_permanently(
  'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_eq(
  'customer row deleted',
  (select count(*) from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  0);
select pg_temp.expect_eq(
  'its transactions deleted too (no cascade — the RPC does both)',
  (select count(*) from public.transactions
    where customer_id = 'cccccccc-0000-0000-0000-000000000001'),
  0);
select pg_temp.expect_eq(
  'the bystander customer is untouched',
  (select count(*) from public.customers
    where id = 'cccccccc-0000-0000-0000-000000000002'),
  1);

-- ------------------------------------------------------------
-- 07.9 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.delete_customer_permanently(
      'cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s07;   -- discard this section's fixtures
release savepoint s07;

-- ============================================================================
-- SECTION 08 — Void with reason / restore_transaction()
--   Source: tests/0005_void_restore.sql (S-34) — migration 0005 (+ void_reason column)
--
--   Viewer void = 0 rows, Editor void stamps voided_by/void_reason and never touches
--   updated_by; a voided row leaves the balance and dashboard; restore returns
--   "edited" if the row was edited before, else "active", and clears the stamps; refusals
--   (not voided, wrong business, outsider) all read "Void transaction not found.";
--   anon cannot execute.
-- ============================================================================
savepoint s08;
select pg_temp.section('08 Void with reason / restore_transaction()');

-- ------------------------------------------------------------
-- 08.1 Fixtures: Ollie owns Acme; Evan is an editor, Vic a viewer and
--    Zed a complete outsider. Asha owes 4500 (charge 5000, payment
--    500). The charge had been EDITED before (updated_by set), the
--    payment never was.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('22222222-2222-2222-2222-222222222222', 'evan@example.com',  '{"full_name":"Evan"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',   '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by, updated_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '1 day', '11111111-1111-1111-1111-111111111111', null);

-- ------------------------------------------------------------
-- 08.2 Baseline: Asha owes 4500.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_num(
  'baseline balance',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);

-- ------------------------------------------------------------
-- 08.3 Viewer cannot void: their update matches zero rows and the row
--    stays active.
-- ------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
update public.transactions
   set status = 'voided', void_reason = 'viewer attempt', voided_at = now(), voided_by = '33333333-3333-3333-3333-333333333333'
 where id = 'dddddddd-0000-0000-0000-000000000002'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_text(
  'viewer void attempt left the payment active',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'active');

-- ------------------------------------------------------------
-- 08.4 Editor voids the payment with a reason (the exact payload the
--    client sends). The invariant: updated_by stays NULL — it still
--    means "content-edited at least once".
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.transactions
   set status = 'voided', void_reason = 'Duplicate entry', voided_at = now(), voided_by = '22222222-2222-2222-2222-222222222222', updated_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000002'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.as_admin();
select pg_temp.expect_text(
  'payment is voided with its reason',
  (select void_reason from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'Duplicate entry');
select pg_temp.expect_bool(
  'void stamps the voider',
  (select voided_by is not null from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);
select pg_temp.expect_bool(
  'the restore marker survives the void (updated_by untouched)',
  (select updated_by is null from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);

-- ------------------------------------------------------------
-- 08.5 The voided row leaves the math: balance and dashboard totals.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_num(
  'balance stops counting the voided payment',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  5000);
select pg_temp.expect_num(
  'dashboard receivable drops the voided payment',
  (select total_receivable from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')),
  5000);

-- ------------------------------------------------------------
-- 08.6 Restore of the never-edited payment: back to active, stamps
--    cleared, math restored.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
select public.restore_transaction(
  'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_text(
  'never-edited row restores as active',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  'active');
select pg_temp.expect_bool(
  'restore cleared the void stamps',
  (select void_reason is null and voided_at is null and voided_by is null
     from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000002'),
  true);
select pg_temp.expect_num(
  'balance counts it again',
  (select balance from public.customer_balances
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);

-- ------------------------------------------------------------
-- 08.7 Edited-before survives the round trip: the charge (updated_by
--    set) goes void and comes back EDITED, not plain active.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
update public.transactions
   set status = 'voided', void_reason = 'Wrong customer', voided_at = now(), voided_by = '22222222-2222-2222-2222-222222222222', updated_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001'
   and business_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select public.restore_transaction(
  'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.as_admin();
select pg_temp.expect_text(
  'edited-before row restores as edited',
  (select status::text from public.transactions
    where id = 'dddddddd-0000-0000-0000-000000000001'),
  'edited');

-- ------------------------------------------------------------
-- 08.8 Refusals: not-voided, mismatched business, complete outsider.
-- ------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'evan@example.com');
do $$
begin
  begin
    -- The payment is active again (step 7): nothing to restore.
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: restoring an active row was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'not-voided restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

do $$
begin
  begin
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000009');
    raise exception 'TEST FAILED: wrong business id was accepted';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'wrong-business restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
do $$
begin
  begin
    -- Security INVOKER: Zed's RLS matches zero rows, so the update
    -- finds nothing and the function refuses.
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: an outsider restored a row';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      perform pg_temp.expect_text(
        'outsider restore reason',
        sqlerrm,
        'Void transaction not found.');
  end;
end;
$$;

-- ------------------------------------------------------------
-- 08.9 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.restore_transaction(
      'dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s08;   -- discard this section's fixtures
release savepoint s08;

-- ============================================================================
-- SECTION 09 — customer_ledger() — running balance
--   Source: tests/0006_customer_ledger.sql (S-31) — migration 0006
--
--   Newest first; balance_after is the cumulative charge-minus-payment total in date
--   order (NUMERIC, computed by the database); voided rows are returned but contribute
--   nothing; an outsider gets zero rows (SECURITY INVOKER); anon cannot execute.
-- ============================================================================
savepoint s09;
select pg_temp.section('09 customer_ledger() — running balance');

-- ------------------------------------------------------------
-- 09.1 Fixtures: Ollie owns Acme; Asha has a charge of 5000, a payment
--    of 500, and a voided charge of 300.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '2 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', now() - interval '1 day', '11111111-1111-1111-1111-111111111111');

-- ------------------------------------------------------------
-- 09.2 Newest first; balance_after is the running total in date order,
--    with the voided charge contributing nothing.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_eq(
  'every row is on the ledger (voided included)',
  (select count(*) from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')),
  3);

select pg_temp.expect_num(
  'newest first: the voided charge is row 1',
  (select amount from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 0),
  300);

select pg_temp.expect_num(
  'voided row carries the live running balance (its own 300 excluded)',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 0),
  4500);

select pg_temp.expect_num(
  'after the payment: 5000 - 500',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 1),
  4500);

select pg_temp.expect_num(
  'oldest row: the opening charge',
  (select balance_after from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')
    limit 1 offset 2),
  5000);

-- ------------------------------------------------------------
-- 09.3 A complete outsider gets zero rows.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_eq(
  'outsider sees an empty ledger',
  (select count(*) from public.customer_ledger(
    'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')),
  0);

-- ------------------------------------------------------------
-- 09.4 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.customer_ledger(
      'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s09;   -- discard this section's fixtures
release savepoint s09;

-- ============================================================================
-- SECTION 10 — transaction_rollup() — summarized view and totals
--   Source: tests/0006b_transaction_rollup.sql (S-35) — migration 0006b  (+ NEW LIKE-escape block)
--
--   Ungrouped = ONE row equal to the manual sum; day/week (Monday-start)/month buckets are
--   exact, newest first; include_voided pulls voided rows back; archived customers NEVER
--   appear; every filter narrows (range [from,to), type, customer, search over name/phone/
--   note); p_timezone cuts buckets in the caller's zone; outsider gets zero rows; anon
--   cannot execute. NEW: % _ and \ in the search term are matched literally.
-- ============================================================================
savepoint s10;
select pg_temp.section('10 transaction_rollup() — summarized view and totals');

-- ------------------------------------------------------------
-- 10.1 Fixtures: Ollie owns Acme with an active customer Asha and an
--    archived customer Bo; Zed owns ZedCo (the outsider's business).
--    Fixed timestamps keep every bucket deterministic.
--    Calendar: 2026-03-02, 2026-02-16 and 2026-03-30 are Mondays.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, phone, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01711 111111', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo Archer',  null,          now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'Zed Jr',     null,          null, '44444444-4444-4444-4444-444444444444');

insert into public.transactions (id, business_id, customer_id, type, amount, status, note, occurred_at, created_by) values
  -- March (week of Mon 2026-03-02)
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', null,                    '2026-03-05 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', 'paid by bKash',         '2026-03-06 12:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- Voided: out of every total unless explicitly included.
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', null,                   '2026-03-06 13:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- February (week of Mon 2026-02-16)
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   700, 'active', null,                    '2026-02-20 09:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- April (week of Mon 2026-03-30), edited.
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  200, 'edited', null,                   '2026-04-01 08:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- The archived customer's money: never on this page.
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'charge',   999, 'active', null,                    '2026-03-05 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  -- Another business's money: RLS's problem, not the filter's.
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'charge', 4444, 'active', null,                    '2026-03-05 10:00:00+00', '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 10.2 Totals for the whole filtered set (granularity NULL): one row,
--    the manual sum of the four matching detail rows.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_eq(
  'ungrouped returns exactly one row',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  1);

select pg_temp.expect_eq(
  'totals: entries = the 4 non-voided, non-archived rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  4);

select pg_temp.expect_num(
  'totals: charged = 5000 + 700 (manual sum)',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  5700);

select pg_temp.expect_num(
  'totals: paid = 500 + 200 (manual sum)',
  (select total_paid from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  700);

select pg_temp.expect_num(
  'totals: net = 5700 - 700 (manual sum)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  5000);

-- ------------------------------------------------------------
-- 10.3 Day grouping: 2026-04-01, 2026-03-06 (voided 300 gone), 03-05,
--    02-20 — newest period first.
-- ------------------------------------------------------------
select pg_temp.expect_eq(
  'day: four buckets (the voided row does not add a fifth)',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')),
  4);

select pg_temp.expect_period(
  'day: newest bucket first',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 0),
  '2026-04-01');

select pg_temp.expect_num(
  'day: the payment-only day has zero charges',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 0),
  0);

select pg_temp.expect_num(
  'day: 2026-03-06 sums only the live payment (voided 300 excluded)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 1),
  -500);

select pg_temp.expect_num(
  'day: 2026-03-05 is the 5000 charge',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'day')
    limit 1 offset 2),
  5000);

-- ------------------------------------------------------------
-- 10.4 Week grouping (Monday-start): the two March rows share the week
--    of 2026-03-02 — each period equals the manual sum of its rows.
-- ------------------------------------------------------------
select pg_temp.expect_eq(
  'week: three buckets',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')),
  3);

select pg_temp.expect_period(
  'week: newest week first (week of Mon 2026-03-30)',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 0),
  '2026-03-30');

select pg_temp.expect_eq(
  'week: week of 2026-03-02 holds both March rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 1),
  2);

select pg_temp.expect_num(
  'week: week of 2026-03-02 net = 5000 - 500 (manual sum)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'week')
    limit 1 offset 1),
  4500);

-- ------------------------------------------------------------
-- 10.5 Month grouping and include_voided.
-- ------------------------------------------------------------
select pg_temp.expect_period(
  'month: newest month first (April)',
  (select period_start from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_granularity => 'month')
    limit 1 offset 0),
  '2026-04-01');

select pg_temp.expect_num(
  'include_voided: the 300 re-enters the totals',
  (select total_charged from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_include_voided => true)),
  6000);

select pg_temp.expect_eq(
  'include_voided: entries grows by the voided row (5) — still not the archived customer''s',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_include_voided => true)),
  5);

-- ------------------------------------------------------------
-- 10.6 Filters: type, customer, range, search.
-- ------------------------------------------------------------
select pg_temp.expect_num(
  'type=payment: net = -(500 + 200)',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_type => 'payment')),
  -700);

select pg_temp.expect_eq(
  'customer=Asha: the same four rows',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_customer_id => 'cccccccc-0000-0000-0000-000000000001')),
  4);

select pg_temp.expect_eq(
  'customer=archived Bo: nothing at all, even asked directly',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_customer_id => 'cccccccc-0000-0000-0000-000000000002')),
  0);

select pg_temp.expect_eq(
  'range [2026-03-01, 2026-04-01): the two March rows only',
  (select entries from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to   => '2026-04-01 00:00:00+00')),
  2);

select pg_temp.expect_num(
  'search by customer name substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => 'verma')),
  5000);

select pg_temp.expect_num(
  'search by phone substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => '01711')),
  5000);

select pg_temp.expect_num(
  'search by note substring',
  (select net from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001', p_search => 'bkash')),
  -500);

-- ------------------------------------------------------------
-- 10.7 Timezone: 2026-03-01 19:30 UTC is 2026-03-02 01:30 in Dhaka, so
--    the day bucket differs by the caller's zone.
-- ------------------------------------------------------------
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 42, 'active', '2026-03-01 19:30:00+00', '11111111-1111-1111-1111-111111111111');

select pg_temp.expect_period(
  'UTC buckets: the late charge sits on 2026-03-01',
  (select min(period_start) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to => '2026-03-02 00:00:00+00',
    p_granularity => 'day',
    p_timezone => 'UTC')),
  '2026-03-01');

select pg_temp.expect_period(
  'Dhaka buckets: the same charge lands on 2026-03-02',
  (select min(period_start) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001',
    p_from => '2026-03-01 00:00:00+00',
    p_to => '2026-03-03 00:00:00+00',
    p_granularity => 'day',
    p_timezone => 'Asia/Dhaka')),
  '2026-03-02');

-- ------------------------------------------------------------
-- 10.8 A complete outsider gets zero rows.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_eq(
  'outsider sees an empty rollup',
  (select count(*) from public.transaction_rollup(
    'aaaaaaaa-0000-0000-0000-000000000001')),
  0);

-- ------------------------------------------------------------
-- 10.9 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.transaction_rollup(
      'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

-- ---- 10.N (NEW) LIKE metacharacters in the search term are literal ---------
-- Hardening F5. Before, "%" and "_" in p_search acted as wildcards, so searching
-- for "50%" matched any note containing "50", and "_" matched every row. These
-- rows carry literal %, _ and \ so each search must hit exactly one of them.
select pg_temp.as_admin();

insert into public.transactions (id, business_id, customer_id, type, amount, status, note, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 11, 'active', '50% off',     '2026-05-01 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 12, 'active', 'a_b',         '2026-05-01 11:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 13, 'active', 'axb',         '2026-05-01 12:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 14, 'active', 'back\slash',   '2026-05-01 13:00:00+00', '11111111-1111-1111-1111-111111111111');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_eq(
  'search "%" matches only the note with a literal percent sign',
  (select entries from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => '%')),
  1);

select pg_temp.expect_eq(
  'search "50%" matches only "50% off"',
  (select entries from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => '50%')),
  1);

select pg_temp.expect_eq(
  'search "_" matches only the note with a literal underscore',
  (select entries from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => '_')),
  1);

select pg_temp.expect_num(
  'search "a_b" matches "a_b" but NOT "axb" (underscore is not a wildcard)',
  (select net from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => 'a_b')),
  12);

select pg_temp.expect_eq(
  'search with a backslash matches the literal backslash',
  (select entries from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => 'k\s')),
  1);

select pg_temp.expect_eq(
  'a blank search still means "no search filter" (all 9 live rows)',
  (select entries from public.transaction_rollup('aaaaaaaa-0000-0000-0000-000000000001', p_search => '   ')),
  9);

select pg_temp.as_admin();
rollback to savepoint s10;   -- discard this section's fixtures
release savepoint s10;

-- ============================================================================
-- SECTION 11 — daily_activity() — dashboard trend chart
--   Source: tests/0007_daily_activity.sql (S-37) — migration 0007
--
--   Exactly p_days zero-filled rows, oldest first; per-day sums are manual sums (voided
--   out, edited in, archived customer out); p_days = 7/30/90; p_timezone cuts days in the
--   caller's zone; outsider gets all-zero days; anon cannot execute. Fixtures hang off
--   now(), so the session timezone is pinned to UTC for this section.
-- ============================================================================
savepoint s11;
select pg_temp.section('11 daily_activity() — dashboard trend chart');
set local timezone = 'UTC';

-- ------------------------------------------------------------
-- 11.1 Fixtures: Ollie owns Acme with an active customer Asha and an
--    archived customer Bo; Zed owns ZedCo. Timestamps hang off
--    NOW() because the function's window is now()-relative.
--    today-2 carries the mixed day (charge + payment + voided +
--    archived), today-1 a lone charge, today the edited payment and
--    today-5 the evening charge used for the timezone check.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, phone, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01711 111111', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo Archer',  null,          now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'Zed Jr',     null,          null, '44444444-4444-4444-4444-444444444444');

insert into public.transactions (id, business_id, customer_id, type, amount, status, note, occurred_at, created_by) values
  -- today-2: the mixed day.
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '10 hours', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', 'paid by bKash', (date_trunc('day', now()) - interval '2 days') + interval '12 hours', '11111111-1111-1111-1111-111111111111'),
  -- Voided: out of the chart unless the client lies about it.
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', null,         (date_trunc('day', now()) - interval '2 days') + interval '13 hours', '11111111-1111-1111-1111-111111111111'),
  -- The archived customer's money: never on the chart.
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'charge',   999, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '14 hours', '11111111-1111-1111-1111-111111111111'),
  -- today-1: one charge.
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   700, 'active', null,         (date_trunc('day', now()) - interval '1 day') + interval '9 hours', '11111111-1111-1111-1111-111111111111'),
  -- today: an EDITED payment still counts.
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  200, 'edited', null,         (date_trunc('day', now()) + interval '8 hours'), '11111111-1111-1111-1111-111111111111'),
  -- today-5, 19:30 UTC: the timezone probe (unique amount).
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 12345, 'active', null,         (date_trunc('day', now()) - interval '5 days' + interval '19 hours 30 minutes'), '11111111-1111-1111-1111-111111111111'),
  -- Another business's money: RLS's problem, not the filter's.
  ('dddddddd-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'charge',  4444, 'active', null,         (date_trunc('day', now()) - interval '2 days') + interval '10 hours', '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 11.2 Zero-filled run of days: exactly 7 rows, oldest first.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_eq(
  'p_days=7 returns exactly 7 rows (zero-filled)',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  7);

select pg_temp.expect_date(
  'the first day is 6 days before today',
  (select min(activity_date) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  (now() - interval '6 days')::date);

select pg_temp.expect_date(
  'the last day is today (UTC)',
  (select max(activity_date) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  now()::date);

-- ------------------------------------------------------------
-- 11.3 Per-day maths: manual sums, voided out, archived out, edited in.
-- ------------------------------------------------------------
select pg_temp.expect_num(
  'today-2: charges = 5000 (voided 300 and archived 999 never count)',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '2 days')::date),
  5000);

select pg_temp.expect_num(
  'today-2: payments = 500',
  (select payments from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '2 days')::date),
  500);

select pg_temp.expect_num(
  'today-1: charges = 700, no payments',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '1 day')::date),
  700);

select pg_temp.expect_num(
  'today: the edited payment counts (200)',
  (select payments from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = now()::date),
  200);

select pg_temp.expect_num(
  'a quiet day is exactly zero, not null',
  (select charges from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where activity_date = (now() - interval '4 days')::date),
  0);

select pg_temp.expect_num(
  'window totals: charges = 5000 + 700 + 12345 (manual sum)',
  (select sum(charges) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  18045);

select pg_temp.expect_num(
  'window totals: payments = 500 + 200 (manual sum)',
  (select sum(payments) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')),
  700);

-- ------------------------------------------------------------
-- 11.4 p_days selects the window length.
-- ------------------------------------------------------------
select pg_temp.expect_eq(
  'p_days=30 returns 30 rows',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 30, 'UTC')),
  30);

select pg_temp.expect_eq(
  'p_days=90 returns 90 rows',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'UTC')),
  90);

-- ------------------------------------------------------------
-- 11.5 Timezone: 19:30 UTC on day-5 is 01:30 on day-4 in Asia/Dhaka,
--    so the probe charge (12345) buckets one day later in Dhaka.
-- ------------------------------------------------------------
select pg_temp.expect_date(
  'UTC buckets the 19:30 probe on day-5',
  (select activity_date from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'UTC')
   where charges = 12345),
  (now() - interval '5 days')::date);

select pg_temp.expect_date(
  'Dhaka buckets the same probe on day-4',
  (select activity_date from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 90, 'Asia/Dhaka')
   where charges = 12345),
  (now() - interval '4 days')::date);

-- ------------------------------------------------------------
-- 11.6 A complete outsider gets all-zero days (RLS scopes the read).
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

select pg_temp.expect_eq(
  'outsider sees 7 zero-filled days with no activity at all',
  (select count(*) from public.daily_activity(
    'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC')
   where charges = 0 and payments = 0),
  7);

-- ------------------------------------------------------------
-- 11.7 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
select pg_temp.as_admin();
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.daily_activity(
      'aaaaaaaa-0000-0000-0000-000000000001', 7, 'UTC');
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s11;   -- discard this section's fixtures
release savepoint s11;

-- ============================================================================
-- SECTION 12 — import_history() — atomic CSV import
--   Source: tests/0008_import_history.sql (S-38) — migration 0008
--
--   Happy path creates new customers + transactions tagged source=import with their
--   historical dates and created_by = caller; matching is name+phone and stays inside THIS
--   business; an archived match raises "Customer is archived. Restore them first."; any
--   failure rolls back EVERYTHING (new customers included); an outsider cannot import;
--   anon cannot execute.
-- ============================================================================
savepoint s12;
select pg_temp.section('12 import_history() — atomic CSV import');

-- ------------------------------------------------------------
-- 12.1 Fixtures: Ollie owns Acme (two same-named customers differing
--    by phone, plus archived Bo); Zed owns ZedCo with his own
--    "Ghost" — another business's customer that must never match an
--    Acme import.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, phone, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01711 111111', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Verma', '01911 222222', null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo Archer',  null,          now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', 'Ghost',      '0777',        null, '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- 12.2 Happy path: one new customer + two transactions (one matched by
--    phone-specific name+phone, one on the just-created customer).
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_num(
  'happy path reports 1 new customer and 2 transactions',
  (public.import_history(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '[{"name":"Newcomer","phone":"018"}]'::jsonb,
    '[
      {"customer_name":"Asha Verma","customer_phone":"01911 222222","type":"payment","amount":200,"occurred_at":"2024-01-10T10:00:00Z","note":"old diary"},
      {"customer_name":"Newcomer","customer_phone":"018","type":"charge","amount":500,"occurred_at":"2024-01-15T09:00:00Z","note":""}
    ]'::jsonb)->>'transactions_created')::numeric,
  2);

select pg_temp.as_admin();

select pg_temp.expect_eq(
  'the new customer landed in Acme with the caller as creator',
  (select count(*) from public.customers
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and name = 'Newcomer' and phone = '018'
     and created_by = '11111111-1111-1111-1111-111111111111'
     and archived_at is null),
  1);

select pg_temp.expect_eq(
  'phone-specific match: the payment landed on Asha/01911, not Asha/01711',
  (select count(*) from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and customer_id = 'cccccccc-0000-0000-0000-000000000002'
     and type = 'payment' and amount = 200),
  1);

select pg_temp.expect_eq(
  'every imported row is tagged source=import, status=active, with its historical date and note',
  (select count(*) from public.transactions
   where business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and source = 'import' and status = 'active'
     and created_by = '11111111-1111-1111-1111-111111111111'
     and occurred_at in ('2024-01-10T10:00:00Z'::timestamptz, '2024-01-15T09:00:00Z'::timestamptz)
     and (note = 'old diary' or note is null)),
  2);

-- ------------------------------------------------------------
-- 12.3 Matching stays inside the business: ZedCo's "Ghost" never
--    matches an Acme import, and the failed import rolls back the
--    new customer created in the SAME call.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Ghost2","phone":"0778"}]'::jsonb,
      '[{"customer_name":"Ghost","customer_phone":"0777","type":"charge","amount":10,"occurred_at":"2024-02-01T00:00:00Z","note":null}]'::jsonb);
    raise exception 'TEST FAILED: another business''s customer was matched';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      if sqlerrm not like 'Import failed: no customer matched for "Ghost"' then
        raise exception 'TEST FAILED: unexpected reason: %', sqlerrm;
      end if;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_eq(
  'the unmatched import rolled back completely: Ghost2 was not created',
  (select count(*) from public.customers where name = 'Ghost2'),
  0);

-- ------------------------------------------------------------
-- 12.4 Archived match: the PRD's exact reason, and the new customer in
--    the same call still rolls back.
-- ------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Ghost3","phone":"0779"}]'::jsonb,
      '[{"customer_name":"Bo Archer","customer_phone":"","type":"charge","amount":10,"occurred_at":"2024-03-01T00:00:00Z","note":null}]'::jsonb);
    raise exception 'TEST FAILED: an archived customer was importable';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      if sqlerrm not like 'Customer is archived. Restore them first.' then
        raise exception 'TEST FAILED: unexpected reason: %', sqlerrm;
      end if;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_eq(
  'the archived-match import rolled back completely: Ghost3 was not created',
  (select count(*) from public.customers where name = 'Ghost3'),
  0);

select pg_temp.expect_eq(
  'and no transaction was added for the archived customer',
  (select count(*) from public.transactions
   where customer_id = 'cccccccc-0000-0000-0000-000000000003'),
  0);

-- ------------------------------------------------------------
-- 12.5 An outsider cannot import into Acme (RLS on the inserts), and
--    nothing persists.
-- ------------------------------------------------------------
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');

do $$
begin
  begin
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Intruder","phone":""}]'::jsonb,
      '[]'::jsonb);
    raise exception 'TEST FAILED: an outsider imported into another business';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();

select pg_temp.expect_eq(
  'the outsider''s import persisted nothing',
  (select count(*) from public.customers where name = 'Intruder'),
  0);

-- ------------------------------------------------------------
-- 12.6 Nothing for anonymous callers: not executable by anon.
-- ------------------------------------------------------------
do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform public.import_history(
      'aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb, '[]'::jsonb);
    raise exception 'TEST FAILED: anonymous caller was allowed';
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      null;
  end;
end;
$$;

select pg_temp.as_admin();
rollback to savepoint s12;   -- discard this section's fixtures
release savepoint s12;

-- ============================================================================
-- SECTION 13 — customer_balances view and customers -> balances relationship
--   Source: NEW — covers migrations 0009 (view shape) and 0010 (computed relationship)
--
--   View columns are (id, business_id, balance, archived_at, last_activity_at); voided rows excluded; a
--   customer with no transactions is 0; archived customers stay with their balance;
--   soft-deleted customers drop out; RLS scopes it. The PostgREST embed function is
--   SECURITY INVOKER, ROWS 1, and cross-tenant safe.
-- ============================================================================
savepoint s13;
select pg_temp.section('13 customer_balances view and customers -> balances relationship');

-- (NEW) Migrations 0009/0010 changed customer_balances' shape and added the
-- customers -> customer_balances computed relationship the paged customer
-- list embeds. Neither had a test. Both are security-invoker, so the caller's
-- RLS must keep scoping every balance.
--
-- Fixtures: Ollie owns Acme: Asha (charge 5000, payment 500, voided charge
-- 300 -> balance 4500), Ravi (no transactions -> 0), Bo (archived, charge 999).
-- Zed owns ZedCo with Zed Jr (charge 4444).

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ollie@example.com', '{"full_name":"Ollie"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',   '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'ZedCo');

insert into public.customers (id, business_id, name, archived_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha',   null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi',   null, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bo',     now(), '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', 'Zed Jr', null, '44444444-4444-4444-4444-444444444444');

insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '2 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', now() - interval '1 day',  '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'charge',   999, 'active', now() - interval '1 day',  '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000004', 'charge',  4444, 'active', now() - interval '1 day',  '44444444-4444-4444-4444-444444444444');

-- ---- 13.1 The view: shape, math and scoping --------------------------------
select pg_temp.expect_text(
  'view columns, in order (id is the PK under its real name)',
  (select string_agg(column_name, ',' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_balances'),
  'id,business_id,balance,archived_at,last_activity_at,last_payment_at');

select pg_temp.expect_bool(
  'the view is security_invoker (callers keep their own RLS)',
  (select coalesce('security_invoker=true' = any (reloptions), false)
     from pg_class where oid = 'public.customer_balances'::regclass),
  true);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');

select pg_temp.expect_num(
  'voided charge is excluded from the balance',
  (select balance from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);
select pg_temp.expect_num(
  'a customer with no transactions has balance 0, not NULL',
  (select balance from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000002'),
  0);
select pg_temp.expect_num(
  'archived customers stay in the view with their real balance',
  (select balance from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000003'),
  999);
select pg_temp.expect_bool(
  'and archived_at is exposed',
  (select archived_at is not null from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000003'),
  true);
select pg_temp.expect_eq(
  'Ollie sees only Acme''s 3 balance rows (ZedCo is RLS-hidden)',
  (select count(*) from public.customer_balances), 3);

-- Soft-deleted customers (deleted_at) drop out of the view entirely.
select pg_temp.as_admin();
update public.customers set deleted_at = now() where id = 'cccccccc-0000-0000-0000-000000000002';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'ollie@example.com');
select pg_temp.expect_eq(
  'a soft-deleted customer leaves the view',
  (select count(*) from public.customer_balances), 2);

-- ---- 13.2 The computed relationship customers -> customer_balances ----------
-- This is what PostgREST calls for  customers?select=*,customer_balances(*) .
select pg_temp.expect_num(
  'computed relationship returns the customer''s balance',
  (select cb.balance
     from public.customers c, lateral public.customer_balances(c) cb
    where c.id = 'cccccccc-0000-0000-0000-000000000001'),
  4500);
select pg_temp.expect_eq(
  'computed relationship yields exactly one row per customer (rows 1 / to-one embed)',
  (select count(*)
     from public.customers c, lateral public.customer_balances(c) cb
    where c.id = 'cccccccc-0000-0000-0000-000000000001'),
  1);

select pg_temp.expect_bool(
  'the relationship function is SECURITY INVOKER (a definer would leak balances)',
  (select not prosecdef from pg_proc
    where oid = 'public.customer_balances(public.customers)'::regprocedure),
  true);
select pg_temp.expect_eq(
  'and is declared ROWS 1',
  (select prorows::bigint from pg_proc
    where oid = 'public.customer_balances(public.customers)'::regprocedure),
  1);

-- Cross-tenant: Zed's embed returns only Zed's own customer and balance.
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_eq(
  'Zed''s embed covers only his own customer',
  (select count(*) from public.customers c, lateral public.customer_balances(c) cb), 1);
select pg_temp.expect_num(
  'and carries only his own balance',
  (select cb.balance from public.customers c, lateral public.customer_balances(c) cb), 4444);

select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s13;   -- discard this section's fixtures
release savepoint s13;

-- ============================================================================
-- SECTION 14 — Hardening: function privileges and business_id immutability
--   Source: NEW — covers the F5 hardening in the consolidated migration
--
--   No function is executable by anon/PUBLIC, yet `authenticated` can still call all 19
--   client-facing functions and cannot call the 6 trigger functions; an editor of two
--   businesses can no longer move a customer/transaction across tenants (23514), while
--   ordinary updates and no-op business_id updates still work.
-- ============================================================================
savepoint s14;
select pg_temp.section('14 Hardening: function privileges and business_id immutability');

-- (NEW) Tests for the F5 hardening in the consolidated migration:
--   14.1 EXECUTE is not granted to anon/PUBLIC on any function
--   14.2 ...but `authenticated` can still call everything the client uses
--   14.3 business_id is immutable once set (closes the cross-tenant move)
--   14.4 (LIKE-escape of transaction_rollup's search is tested in section 10)

select pg_temp.as_admin();

-- ---- 14.1 / 14.2 Privilege matrix ------------------------------------------
do $$
declare
  v bigint;
  v_sig text;
begin
  -- No function we created is executable by anon or PUBLIC. (Extension-owned
  -- functions are excluded so this stays valid if an extension lives in public.)
  select count(*) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute');
  perform pg_temp.expect_eq('anon can execute NO public function', v, 0);

  -- Every function the app calls is still executable by authenticated.
  foreach v_sig in array array[
    'public.is_member(uuid)',
    'public.has_role(uuid, public.business_role)',
    'public.create_business(text, text, text, text, text, text)',
    'public.respond_to_invitation(uuid, boolean)',
    'public.leave_business(uuid)',
    'public.change_member_role(uuid, uuid, public.business_role)',
    'public.remove_member(uuid, uuid)',
    'public.my_invitations()',
    'public.business_exists(uuid)',
    'public.delete_customer_permanently(uuid, uuid)',
    'public.restore_transaction(uuid, uuid)',
    'public.customer_ledger(uuid, uuid)',
    'public.dashboard_summary(uuid, text)',
    'public.delete_transaction(uuid, uuid, text)',
    'public.restore_deleted(uuid)',
    'public.transaction_rollup(uuid, timestamptz, timestamptz, text, uuid, text, boolean, text, text)',
    'public.daily_activity(uuid, integer, text)',
    'public.import_history(uuid, jsonb, jsonb)',
    'public.customer_balances(public.customers)'
  ] loop
    perform pg_temp.expect_bool(
      'authenticated can execute ' || v_sig,
      has_function_privilege('authenticated', to_regprocedure(v_sig), 'execute'),
      true);
  end loop;

  -- Trigger functions are never called directly: nobody but the owner needs them.
  foreach v_sig in array array[
    'public.assert_transaction_business_match()',
    'public.add_owner_membership()',
    'public.handle_new_user()',
    'public.prevent_business_id_change()',
    'public.stamp_transaction_actor()',
    'public.stamp_customer_actor()'
  ] loop
    perform pg_temp.expect_bool(
      'authenticated cannot execute trigger function ' || v_sig,
      has_function_privilege('authenticated', to_regprocedure(v_sig), 'execute'),
      false);
  end loop;
end;
$$;

-- Behavioural check as the real anon role: a sample of the former holes.
select pg_temp.as_admin();
select pg_temp.expect_anon_denied('anon: is_member',
  $$select public.is_member('aaaaaaaa-0000-0000-0000-000000000001')$$);
select pg_temp.expect_anon_denied('anon: has_role',
  $$select public.has_role('aaaaaaaa-0000-0000-0000-000000000001', 'owner')$$);
select pg_temp.expect_anon_denied('anon: create_business',
  $$select public.create_business('Anon Inc')$$);
select pg_temp.expect_anon_denied('anon: my_invitations',
  $$select * from public.my_invitations()$$);
select pg_temp.expect_anon_denied('anon: dashboard_summary',
  $$select * from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001')$$);
select pg_temp.expect_anon_denied('anon: respond_to_invitation',
  $$select public.respond_to_invitation('aaaaaaaa-0000-0000-0000-000000000001', true)$$);
select pg_temp.expect_anon_denied('anon: leave_business',
  $$select public.leave_business('aaaaaaaa-0000-0000-0000-000000000001')$$);

-- ---- 14.3 business_id is immutable ----------------------------------------
-- Fixture: Eli is an EDITOR of both Acme and Beta — the only user who could
-- pass both RLS checks when re-homing a row. Asha lives in Acme with a charge.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',    '{"full_name":"Eli"}'),
  ('55555555-5555-5555-5555-555555555555', 'bea@example.com',    '{"full_name":"Bea"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'Beta');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'editor');

insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

insert into public.transactions (id, business_id, customer_id, type, amount, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 100, now(), '11111111-1111-1111-1111-111111111111');

select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

select pg_temp.expect_sqlstate(
  'Eli cannot re-home a customer into the other business he edits',
  $$update public.customers set business_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '23514');

select pg_temp.expect_sqlstate(
  'Eli cannot re-home a transaction either',
  $$update public.transactions set business_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '23514');

select pg_temp.as_admin();
select pg_temp.expect_text(
  'the customer is still in Acme',
  (select business_id::text from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_text(
  'and its transaction is still in the same business as its customer',
  (select business_id::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000001');

-- Not a blanket freeze: re-stating the same value, and ordinary edits, still work.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
update public.customers set business_id = business_id, name = 'Asha Renamed'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select pg_temp.expect_text(
  'an update that leaves business_id unchanged is allowed',
  (select name from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'),
  'Asha Renamed');

select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s14;   -- discard this section's fixtures
release savepoint s14;

-- ============================================================================
-- SECTION 15 — delete_transaction() and the deletion log
--   Source: NEW in v3 — migration 20261101000000_v3_deletion_log_and_integrity.sql
--
--   Only the Owner can delete a transaction (Editor/Viewer/outsider get 42501, a wrong business
--   reads as not found, a reason over 200 characters is refused); the balance recalculates; voided
--   rows can be deleted too; the log records label, reason, who, and a full snapshot; only the
--   Owner can read the log, and nobody can write, update or delete it directly; anon is refused.
-- ============================================================================
savepoint s15;
select pg_temp.section('15 delete_transaction() and the deletion log');

-- (NEW in v3) delete_transaction() and the deletion_log. Owner-only hard delete,
-- snapshot kept, log readable only by the Owner and writable only by the functions.
-- Fixtures: Acme owned by Olivia (Eli = editor, Vic = viewer); Beta owned by Zed.

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',    '{"full_name":"Eli"}'),
  ('33333333-3333-3333-3333-333333333333', 'vic@example.com',    '{"full_name":"Vic"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',    '{"full_name":"Zed"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Beta');
insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');
insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '2 days', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', now() - interval '1 day',  '11111111-1111-1111-1111-111111111111');

-- ---- 15.1 Non-owners cannot delete ----------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
select pg_temp.expect_sqlstate('Editor cannot delete a transaction (Void is theirs)',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$, '42501');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'vic@example.com');
select pg_temp.expect_sqlstate('Viewer cannot delete a transaction',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$, '42501');
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_sqlstate('An outsider cannot delete another business''s transaction',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$, '42501');
select pg_temp.expect_sqlstate('A wrong business id reads as not found',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'P0002');
select pg_temp.as_admin();
select pg_temp.expect_eq('nothing was deleted by the refused attempts',
  (select count(*) from public.transactions), 3);

-- ---- 15.2 The Owner deletes; the ledger recalculates ------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_sqlstate('a reason over 200 characters is refused',
  format($$select public.delete_transaction('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', %L)$$, repeat('x', 201)), '22001');
select pg_temp.expect_sqlstate('an unknown transaction is not found',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-0000000000ff', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'P0002');

select public.delete_transaction('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Entered twice');

select pg_temp.expect_eq('the payment is gone',
  (select count(*) from public.transactions where id = 'dddddddd-0000-0000-0000-000000000002'), 0);
select pg_temp.expect_num('the balance no longer includes the deleted payment (5000 charge only)',
  (select balance from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'), 5000);

-- A voided transaction can be deleted too.
select public.delete_transaction('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_eq('the voided charge is gone as well',
  (select count(*) from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), 1);

-- ---- 15.3 What the log recorded ---------------------------------------------
select pg_temp.expect_eq('the Owner reads both log entries',
  (select count(*) from public.deletion_log), 2);
select pg_temp.expect_text('label reads "Payment ₹500.00 · Asha"',
  (select label from public.deletion_log where entity_id = 'dddddddd-0000-0000-0000-000000000002'), 'Payment ₹500.00 · Asha');
select pg_temp.expect_text('the reason is stored',
  (select reason from public.deletion_log where entity_id = 'dddddddd-0000-0000-0000-000000000002'), 'Entered twice');
select pg_temp.expect_text('deleted_by is the caller',
  (select deleted_by::text from public.deletion_log where entity_id = 'dddddddd-0000-0000-0000-000000000002'), '11111111-1111-1111-1111-111111111111');
select pg_temp.expect_text('the snapshot carries the full row (its id)',
  (select snapshot ->> 'id' from public.deletion_log where entity_id = 'dddddddd-0000-0000-0000-000000000002'), 'dddddddd-0000-0000-0000-000000000002');
select pg_temp.expect_text('the summary carries the customer name for display',
  (select summary ->> 'customer_name' from public.deletion_log where entity_id = 'dddddddd-0000-0000-0000-000000000002'), 'Asha');

-- ---- 15.4 Who can read or write the log -------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
select pg_temp.expect_eq('an Editor sees an empty log (RLS)', (select count(*) from public.deletion_log), 0);
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_eq('an outsider sees an empty log', (select count(*) from public.deletion_log), 0);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_sqlstate('even the Owner cannot insert into the log directly',
  $$insert into public.deletion_log (business_id, entity_type, entity_id, label, snapshot) values ('aaaaaaaa-0000-0000-0000-000000000001', 'transaction', gen_random_uuid(), 'forged', '{}')$$, '42501');
select pg_temp.expect_sqlstate('nor update it',
  $$update public.deletion_log set label = 'tampered'$$, '42501');
select pg_temp.expect_sqlstate('nor delete from it',
  $$delete from public.deletion_log$$, '42501');

select pg_temp.as_admin();
select pg_temp.expect_anon_denied('anon: delete_transaction',
  $$select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$);
select pg_temp.expect_anon_denied('anon: read the deletion log',
  $$select count(*) from public.deletion_log$$);

select pg_temp.as_admin();
rollback to savepoint s15;   -- discard this section's fixtures
release savepoint s15;

-- ============================================================================
-- SECTION 16 — Delete a customer and restore deleted items
--   Source: NEW in v3 — delete_customer_permanently() snapshot + restore_deleted()
--
--   Deleting a customer snapshots it and all its transactions first (count, balance); restore is
--   Owner-only and brings back the SAME ids, authors, timestamps and archive state; double restore
--   is refused; a transaction cannot be restored before its customer; an id collision is reported.
-- ============================================================================
savepoint s16;
select pg_temp.section('16 Delete a customer and restore deleted items');

-- (NEW in v3) delete_customer_permanently() now snapshots, and restore_deleted()
-- puts customers (with all their transactions) and single transactions back
-- exactly: same ids, same authors, same timestamps, same archive state.
-- Fixtures: Acme owned by Olivia (Eli = editor); Asha (archived) has 3 transactions
-- written by ELI so attribution can be checked; Ravi has none. Zed owns Beta.

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',    '{"full_name":"Eli"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',    '{"full_name":"Zed"}');
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Beta');
insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor');
insert into public.customers (id, business_id, name, created_by, archived_at) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '22222222-2222-2222-2222-222222222222', now()),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', '11111111-1111-1111-1111-111111111111', null);
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', now() - interval '3 days', '22222222-2222-2222-2222-222222222222', '2026-01-01 10:00:00+00'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', now() - interval '2 days', '22222222-2222-2222-2222-222222222222', '2026-01-02 10:00:00+00'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', now() - interval '1 day',  '22222222-2222-2222-2222-222222222222', '2026-01-03 10:00:00+00');

-- Scratch tables for log ids (created as admin so the grants are allowed).
create temp table pg_temp.t16 (log_id uuid);
create temp table pg_temp.t16b (tx_log uuid, cust_log uuid);
create temp table pg_temp.t16c (log_id uuid);
grant all on pg_temp.t16, pg_temp.t16b, pg_temp.t16c to authenticated;

-- ---- 16.1 Delete a customer: everything is snapshotted first ---------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
select pg_temp.expect_sqlstate('an Editor cannot delete a customer',
  $$select public.delete_customer_permanently('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$, '42501');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_sqlstate('a mismatched business reads as not found',
  $$select public.delete_customer_permanently('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'P0002');

insert into pg_temp.t16 select public.delete_customer_permanently('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.expect_eq('the customer is gone', (select count(*) from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'), 0);
select pg_temp.expect_eq('and so are its 3 transactions', (select count(*) from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), 0);
select pg_temp.expect_text('log label is the customer name', (select label from public.deletion_log where id = (select log_id from pg_temp.t16)), 'Asha');
select pg_temp.expect_text('log records 3 transactions', (select summary ->> 'transaction_count' from public.deletion_log where id = (select log_id from pg_temp.t16)), '3');
select pg_temp.expect_num('log records the balance at deletion (voided excluded)', (select (summary ->> 'balance')::numeric from public.deletion_log where id = (select log_id from pg_temp.t16)), 4500);
select pg_temp.expect_eq('snapshot holds all 3 transactions', (select jsonb_array_length(snapshot -> 'transactions') from public.deletion_log where id = (select log_id from pg_temp.t16)), 3);

-- ---- 16.2 Restore: who may, and exactly what comes back ----------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
select pg_temp.expect_sqlstate('an Editor cannot restore',
  $$select public.restore_deleted((select log_id from pg_temp.t16))$$, '42501');
select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_sqlstate('an outsider cannot restore',
  $$select public.restore_deleted((select log_id from pg_temp.t16))$$, '42501');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_sqlstate('an unknown log id is not found',
  $$select public.restore_deleted(gen_random_uuid())$$, 'P0002');

select pg_temp.expect_text('restore reports 3 transactions restored',
  (select (public.restore_deleted((select log_id from pg_temp.t16))) ->> 'transactions_restored'), '3');

select pg_temp.expect_eq('the customer is back with its original id', (select count(*) from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'), 1);
select pg_temp.expect_eq('all 3 transactions are back with their original ids', (select count(*) from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), 3);
select pg_temp.expect_text('authorship survives: the transactions are still Eli''s, not the Owner''s',
  (select string_agg(distinct created_by::text, ',') from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), '22222222-2222-2222-2222-222222222222');
select pg_temp.expect_text('the customer''s author survives too',
  (select created_by::text from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'), '22222222-2222-2222-2222-222222222222');
select pg_temp.expect_text('original created_at survives',
  (select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'), '2026-01-01');
select pg_temp.expect_bool('archive state survives', (select archived_at is not null from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'), true);
select pg_temp.expect_num('the balance is exactly as before', (select balance from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'), 4500);
select pg_temp.expect_bool('the log entry is marked restored by the Owner',
  (select restored_at is not null and restored_by = '11111111-1111-1111-1111-111111111111' from public.deletion_log where id = (select log_id from pg_temp.t16)), true);
select pg_temp.expect_sqlstate('restoring twice is refused',
  $$select public.restore_deleted((select log_id from pg_temp.t16))$$, '55000');

-- ---- 16.3 Restoring a single transaction ------------------------------------
-- Delete one transaction, then its customer: the transaction cannot come back
-- until the customer does.
insert into pg_temp.t16b (tx_log) select public.delete_transaction('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
update pg_temp.t16b set cust_log = public.delete_customer_permanently('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.expect_sqlstate('a transaction cannot be restored while its customer is deleted',
  $$select public.restore_deleted((select tx_log from pg_temp.t16b))$$, '55000');

select public.restore_deleted((select cust_log from pg_temp.t16b));
select pg_temp.expect_eq('restoring the customer brings back only what existed when it was deleted (2 transactions)',
  (select count(*) from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), 2);

select public.restore_deleted((select tx_log from pg_temp.t16b));
select pg_temp.expect_eq('now the single transaction restores (3 again)',
  (select count(*) from public.transactions where customer_id = 'cccccccc-0000-0000-0000-000000000001'), 3);
select pg_temp.expect_text('and keeps Eli as its author',
  (select created_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000002'), '22222222-2222-2222-2222-222222222222');

-- An id collision is reported, not swallowed.
insert into pg_temp.t16c select public.delete_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.as_admin();
insert into public.transactions (id, business_id, customer_id, type, amount, occurred_at, created_by)
values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 1, now(), '11111111-1111-1111-1111-111111111111');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_sqlstate('restoring onto an existing id is a conflict',
  $$select public.restore_deleted((select log_id from pg_temp.t16c))$$, '23505');
select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s16;   -- discard this section's fixtures
release savepoint s16;

-- ============================================================================
-- SECTION 17 — Actor stamping (audit integrity)
--   Source: NEW in v3 — stamp_transaction_actor() / stamp_customer_actor()
--
--   A forged created_by / updated_by / voided_by is replaced by the signed-in user; created_by cannot
--   be rewritten; restore_transaction still clears voided_by; the Owner editing an Editor's entry is
--   recorded as the Owner; admin sessions and imports behave as before.
-- ============================================================================
savepoint s17;
select pg_temp.section('17 Actor stamping (audit integrity)');

-- (NEW in v3) Actor stamping: created_by / updated_by / voided_by are written by
-- the database from the signed-in user, so an Editor can no longer attribute an
-- entry to the Owner. Admin sessions (fixtures, migrations) are unaffected.
-- Fixtures: Acme owned by Olivia, Eli = editor; customer Asha.

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('22222222-2222-2222-2222-222222222222', 'eli@example.com',    '{"full_name":"Eli"}');
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');
insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor');
insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111');

-- Admin sessions keep what they supply (this is how every fixture works).
select pg_temp.expect_text('admin insert keeps the supplied created_by',
  (select created_by::text from public.customers where id = 'cccccccc-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111');

-- ---- 17.1 Inserts -------------------------------------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');

insert into public.transactions (id, business_id, customer_id, type, amount, occurred_at, created_by)
values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', 100, now(),
        '11111111-1111-1111-1111-111111111111');   -- forged: claims the Owner wrote it
select pg_temp.expect_text('a forged created_by on a transaction is replaced by the caller',
  (select created_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222');

insert into public.customers (id, business_id, name, created_by)
values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', '11111111-1111-1111-1111-111111111111');
select pg_temp.expect_text('a forged created_by on a customer is replaced by the caller',
  (select created_by::text from public.customers where id = 'cccccccc-0000-0000-0000-000000000002'),
  '22222222-2222-2222-2222-222222222222');

-- ---- 17.2 Updates ---------------------------------------------------------------
update public.transactions
   set note = 'edited', status = 'edited',
       updated_by = '11111111-1111-1111-1111-111111111111',      -- forged
       created_by = '11111111-1111-1111-1111-111111111111'       -- authorship is immutable
 where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.expect_text('a forged updated_by is replaced by the caller',
  (select updated_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222');
select pg_temp.expect_text('created_by cannot be rewritten by an update',
  (select created_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222');

update public.transactions
   set status = 'voided', voided_at = now(), void_reason = 'test',
       voided_by = '11111111-1111-1111-1111-111111111111'        -- forged
 where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.expect_text('a forged voided_by is replaced by the caller',
  (select voided_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222');

-- Restore must still be able to CLEAR voided_by (null is never "stamped").
select public.restore_transaction('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_bool('restore clears voided_by',
  (select voided_by is null from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'), true);
select pg_temp.expect_text('and returns an edited row to "edited" (updated_by is set)',
  (select status::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'), 'edited');

-- ---- 17.3 The Owner editing someone else's entry is recorded as the Owner ------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
update public.transactions set note = 'owner touched it', updated_by = '22222222-2222-2222-2222-222222222222'
 where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.expect_text('the Owner''s edit is attributed to the Owner, not to the previous author',
  (select updated_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111');
select pg_temp.expect_text('while the original author stays Eli',
  (select created_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222');


-- The strongest case: the client sends NOTHING for updated_by on a content edit.
update public.transactions set amount = 120 where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.expect_text('a content edit without updated_by is still attributed to the caller',
  (select updated_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111');

-- Voiding is not a content edit: it must not touch updated_by.
update public.transactions set status = 'voided', voided_at = now(), voided_by = null where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.expect_text('voiding leaves updated_by alone',
  (select updated_by::text from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111');
update public.transactions set status = 'edited', voided_at = null, voided_by = null where id = 'dddddddd-0000-0000-0000-000000000001';

-- import_history() already writes created_by = the caller; stamping agrees.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'eli@example.com');
select public.import_history('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb,
  '[{"customer_name":"Asha","customer_phone":"","type":"charge","amount":10,"occurred_at":"2026-02-01T00:00:00Z","note":""}]'::jsonb);
select pg_temp.expect_text('imported rows are authored by the importer',
  (select string_agg(distinct created_by::text, ',') from public.transactions where source = 'import'),
  '22222222-2222-2222-2222-222222222222');
select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s17;   -- discard this section's fixtures
release savepoint s17;

-- ============================================================================
-- SECTION 18 — last_activity_at and timezone-aware dashboard
--   Source: NEW in v3 — customer_balances.last_activity_at, dashboard_summary(uuid, text)
--
--   last_activity_at ignores voided entries and is NULL with no entries; "today" is cut in the
--   caller's timezone (Asia/Dhaka, America/Los_Angeles, UTC default); exactly one function
--   exists (no ambiguous overload); an unknown timezone is rejected with 22023.
-- ============================================================================
savepoint s18;
select pg_temp.section('18 last_activity_at and timezone-aware dashboard');

-- (NEW in v3) customer_balances.last_activity_at and dashboard_summary(p_business_id, p_timezone).
-- Fixtures: Acme owned by Olivia; Asha has a charge 3 days ago, a payment 2 days ago
-- and a VOIDED charge 1 day ago; Ravi has no transactions.

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}');
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme');
insert into public.customers (id, business_id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ravi', '11111111-1111-1111-1111-111111111111');
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', date_trunc('second', now() - interval '3 days'), '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', date_trunc('second', now() - interval '2 days'), '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   300, 'voided', date_trunc('second', now() - interval '1 day'),  '11111111-1111-1111-1111-111111111111');

-- ---- 18.1 last_activity_at -------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_bool('last_activity_at is the latest ACTIVE entry (the 2-day-old payment), not the voided one',
  (select last_activity_at = (select occurred_at from public.transactions where id = 'dddddddd-0000-0000-0000-000000000002')
     from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'), true);
select pg_temp.expect_bool('a customer with no transactions has a NULL last_activity_at',
  (select last_activity_at is null from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000002'), true);
select pg_temp.expect_bool('the computed relationship exposes it too',
  (select cb.last_activity_at is not null
     from public.customers c, lateral public.customer_balances(c) cb where c.id = 'cccccccc-0000-0000-0000-000000000001'), true);

-- ---- 18.2 dashboard_summary(p_business_id, p_timezone) ------------------------------
select pg_temp.as_admin();
select pg_temp.expect_eq('exactly one dashboard_summary exists (no ambiguous overload)',
  (select count(*) from pg_proc where proname = 'dashboard_summary' and pronamespace = 'public'::regnamespace), 1);
delete from public.transactions;

-- For each zone, one entry 1 minute AFTER its local midnight (today there) and one
-- 1 minute BEFORE it (yesterday there). The test is true whatever time it is run.
insert into public.transactions (business_id, customer_id, type, amount, occurred_at, created_by)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', v.amount,
       (date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka') + v.shift,
       '11111111-1111-1111-1111-111111111111'
from (values (100, interval '1 minute'), (10, interval '-1 minute')) as v(amount, shift);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_eq('Asia/Dhaka: exactly one entry is "today"',
  (select today_count from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001', 'Asia/Dhaka')), 1);
select pg_temp.expect_num('Asia/Dhaka: today''s net is the +1 minute entry only',
  (select today_net from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001', 'Asia/Dhaka')), 100);

select pg_temp.as_admin();
delete from public.transactions;
insert into public.transactions (business_id, customer_id, type, amount, occurred_at, created_by)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', v.amount,
       (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') + v.shift,
       '11111111-1111-1111-1111-111111111111'
from (values (1000, interval '1 minute'), (7, interval '-1 minute')) as v(amount, shift);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_num('America/Los_Angeles: today''s net is the +1 minute entry only',
  (select today_net from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001', 'America/Los_Angeles')), 1000);

-- Calling with ONE argument still works and means UTC (existing clients).
select pg_temp.as_admin();
delete from public.transactions;
insert into public.transactions (business_id, customer_id, type, amount, occurred_at, created_by)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge', v.amount,
       (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + v.shift,
       '11111111-1111-1111-1111-111111111111'
from (values (50, interval '1 minute'), (9, interval '-1 minute')) as v(amount, shift);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');
select pg_temp.expect_num('one-argument call = UTC day',
  (select today_net from public.dashboard_summary(p_business_id => 'aaaaaaaa-0000-0000-0000-000000000001')), 50);

select pg_temp.expect_sqlstate('an unknown timezone is rejected (the client falls back to UTC)',
  $$select * from public.dashboard_summary('aaaaaaaa-0000-0000-0000-000000000001', 'Mars/Base')$$, '22023');
select pg_temp.as_admin();

select pg_temp.as_admin();
rollback to savepoint s18;   -- discard this section's fixtures
release savepoint s18;

-- ============================================================================
-- SECTION 19 — last_payment_at (Who to chase)
--   Source: NEW in v3.1 — migration 20261108000000_v31_last_payment_at.sql
--
--   last_payment_at is the newest ACTIVE or EDITED payment: a voided payment is ignored, a customer who only
--   ever had charges has NULL, a newer charge does not replace it, archived customers still report it; the
--   view keeps its column order (new column last), the computed relationship exposes it, and RLS scopes it.
-- ============================================================================
savepoint s19;
select pg_temp.section('19 last_payment_at (Who to chase)');

-- (NEW in v3.1) customer_balances.last_payment_at, the basis of "Who to chase".
-- Fixtures: Acme owned by Olivia. Mizanur: charge 50 days ago, payment 41 days ago, a VOIDED payment
-- 2 days ago, a charge yesterday. Nadia: only charges. Zara: a payment 3 days ago and a newer charge.
-- Zed owns Beta (RLS check).

select pg_temp.as_admin();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'olivia@example.com', '{"full_name":"Olivia"}'),
  ('44444444-4444-4444-4444-444444444444', 'zed@example.com',    '{"full_name":"Zed"}');
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Beta');
insert into public.customers (id, business_id, name, created_by, archived_at) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mizanur', '11111111-1111-1111-1111-111111111111', null),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nadia',   '11111111-1111-1111-1111-111111111111', null),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Zara',    '11111111-1111-1111-1111-111111111111', now()),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', 'Zed Jr',  '44444444-4444-4444-4444-444444444444', null);
insert into public.transactions (id, business_id, customer_id, type, amount, status, occurred_at, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',  5000, 'active', date_trunc('second', now() - interval '50 days'), '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  500, 'active', date_trunc('second', now() - interval '41 days'), '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'payment',  900, 'voided', date_trunc('second', now() - interval '2 days'),  '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'charge',   100, 'active', date_trunc('second', now() - interval '1 day'),   '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'charge',   700, 'active', date_trunc('second', now() - interval '10 days'), '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'payment',  200, 'edited', date_trunc('second', now() - interval '3 days'),  '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'charge',   300, 'active', date_trunc('second', now() - interval '1 day'),   '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000004', 'payment',   50, 'active', date_trunc('second', now() - interval '5 days'),  '44444444-4444-4444-4444-444444444444');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'olivia@example.com');

-- ---- 19.1 What counts as the last payment ---------------------------------------------
select pg_temp.expect_bool('a voided payment is ignored: last_payment_at is the 41-day-old active payment',
  (select last_payment_at = (select occurred_at from public.transactions where id = 'dddddddd-0000-0000-0000-000000000002')
     from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'), true);
select pg_temp.expect_eq('so the days since the last payment is 41',
  (select round(extract(epoch from (now() - last_payment_at)) / 86400)::bigint
     from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000001'), 41);
select pg_temp.expect_bool('a customer who only ever had charges has a NULL last_payment_at',
  (select last_payment_at is null from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000002'), true);
select pg_temp.expect_bool('an edited payment counts, and a newer charge does not replace it',
  (select last_payment_at = (select occurred_at from public.transactions where id = 'dddddddd-0000-0000-0000-000000000006')
     from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000003'), true);
select pg_temp.expect_bool('last_activity_at is still the newest active entry, which differs from last_payment_at',
  (select last_activity_at > last_payment_at from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000003'), true);
select pg_temp.expect_bool('an archived customer still reports it (the dashboard filters archived itself)',
  (select archived_at is not null and last_payment_at is not null from public.customer_balances where id = 'cccccccc-0000-0000-0000-000000000003'), true);

-- ---- 19.2 The columns, the embed and the scoping -----------------------------------------
select pg_temp.expect_text('view columns in order, with the new column last',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_balances'),
  'id,business_id,balance,archived_at,last_activity_at,last_payment_at');
select pg_temp.expect_bool('the computed relationship exposes it',
  (select cb.last_payment_at is not null
     from public.customers c, lateral public.customer_balances(c) cb where c.id = 'cccccccc-0000-0000-0000-000000000001'), true);
select pg_temp.expect_eq('Olivia sees only Acme''s three customers',
  (select count(*) from public.customer_balances), 3);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'zed@example.com');
select pg_temp.expect_eq('Zed sees only his own customer''s row',
  (select count(*) from public.customer_balances), 1);

select pg_temp.as_admin();
select pg_temp.expect_anon_denied('anon: the relationship function',
  $$select * from public.customer_balances(null::public.customers)$$);

select pg_temp.as_admin();
rollback to savepoint s19;   -- discard this section's fixtures
release savepoint s19;

-- ============================================================================
-- RESULT
-- ============================================================================
-- Reached only if every assertion above passed (any failure aborts the script).
do $$ begin raise notice 'ALL 19 TEST SECTIONS PASSED'; end $$;
select 'ALL 19 TEST SECTIONS PASSED' as result;

rollback;   -- nothing was ever committed
