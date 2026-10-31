-- ============================================================================
-- BahiKhata v3 — DELETE, RECOVERY AND INTEGRITY
-- ============================================================================
-- Depends on: 20261017000000_bahikhata_consolidated_schema.sql (applied first).
-- Safe to re-run (idempotent).
--
-- WHAT THIS ADDS
--   1. deletion_log            append-only snapshots of everything deleted
--   2. delete_transaction()    Owner-only hard delete of one transaction (NEW)
--   3. delete_customer_permanently()  now snapshots before deleting, returns the log id
--   4. restore_deleted()       Owner-only restore of a customer (+ its transactions) or a transaction
--   5. stamp triggers          created_by / updated_by / voided_by can no longer be forged
--   6. customer_balances       gains last_activity_at (voided entries excluded)
--   7. dashboard_summary()     gains p_timezone (fixes "today" for non-UTC users; closes B-09)
--   8. privileges              EXECUTE only for signed-in users, as in the baseline
--
-- SECTIONS
--   1. deletion_log table + RLS
--   2. Actor-stamping triggers
--   3. delete_transaction()
--   4. delete_customer_permanently() (snapshotting)
--   5. restore_deleted()
--   6. customer_balances view + computed relationship
--   7. dashboard_summary() with timezone
--   8. Function privileges
--   9. PostgREST schema reload
-- ============================================================================

begin;

-- ============================================================================
-- 1. DELETION LOG
-- ============================================================================
-- One row per deleted customer or transaction. `snapshot` holds the complete
-- rows so restore_deleted() can put them back exactly (same ids, same
-- created_by, same timestamps). The log is append-only for clients: there are
-- NO insert/update/delete policies, so only the SECURITY DEFINER functions
-- below can write to it. Only the business Owner can read it.
-- Deleting a business cascades and removes its log (the whole business is gone).

create table if not exists public.deletion_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses on delete cascade,
  entity_type  text not null check (entity_type in ('customer', 'transaction')),
  entity_id    uuid not null,
  label        text not null,                          -- e.g. 'Rahim Uddin' or 'Charge ₹500.00 · Rahim Uddin'
  summary      jsonb not null default '{}'::jsonb,     -- display-only facts (amount, type, customer_name, transaction_count, balance)
  snapshot     jsonb not null,                         -- full rows, used by restore_deleted()
  reason       text check (reason is null or char_length(reason) <= 200),
  deleted_by   uuid references auth.users on delete set null,
  deleted_at   timestamptz not null default now(),
  restored_at  timestamptz,
  restored_by  uuid references auth.users on delete set null
);

create index if not exists deletion_log_business_idx
  on public.deletion_log (business_id, deleted_at desc);

alter table public.deletion_log enable row level security;

drop policy if exists "Owners can read the deletion log" on public.deletion_log;
create policy "Owners can read the deletion log"
  on public.deletion_log for select to authenticated
  using (public.has_role(business_id, 'owner'));

-- Defense in depth: even though no write policy exists, remove the table
-- privileges clients never need.
revoke all on public.deletion_log from anon;
revoke insert, update, delete, truncate on public.deletion_log from authenticated;


-- ============================================================================
-- 2. ACTOR-STAMPING TRIGGERS
-- ============================================================================
-- Before: created_by / updated_by / voided_by were client-supplied, so an
-- editor could attribute an entry to the Owner. After: when a signed-in user
-- writes, the database stamps THEIR id. Trusted paths are unaffected:
--   * admin / service sessions (auth.uid() is null) keep whatever they supply
--   * restore_deleted() sets bahikhata.restoring = 'on' for its own
--     transaction so restored rows keep their ORIGINAL authors.

create or replace function public.stamp_transaction_actor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or current_setting('bahikhata.restoring', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;
  else
    new.created_by := old.created_by;                       -- authorship never changes
    -- A CONTENT edit is attributed to the caller whatever the client sent (an Owner
    -- editing an Editor's entry becomes the editor of record). A forged non-null
    -- updated_by is replaced too. Void/restore change neither, so they leave
    -- updated_by alone, which is what restore_transaction() relies on.
    if (new.customer_id, new.type, new.amount, new.occurred_at, new.note)
         is distinct from (old.customer_id, old.type, old.amount, old.occurred_at, old.note)
       or (new.updated_by is not null and new.updated_by is distinct from old.updated_by) then
      new.updated_by := v_uid;
    end if;
    if new.voided_by is not null and new.voided_by is distinct from old.voided_by then
      new.voided_by := v_uid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_stamp_actor on public.transactions;
create trigger transactions_stamp_actor
  before insert or update on public.transactions
  for each row execute function public.stamp_transaction_actor();

create or replace function public.stamp_customer_actor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or current_setting('bahikhata.restoring', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := v_uid;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_stamp_actor on public.customers;
create trigger customers_stamp_actor
  before insert or update on public.customers
  for each row execute function public.stamp_customer_actor();


-- ============================================================================
-- 3. delete_transaction()
-- ============================================================================
-- Owner-only. Editors keep Void (reversible, stays visible); Delete removes the
-- row from the ledger and keeps a snapshot in deletion_log. Returns the log id
-- so the UI can offer Undo (restore_deleted(log_id)).

create or replace function public.delete_transaction(
  p_transaction_id uuid,
  p_business_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions;
  v_customer_name text;
  v_log_id uuid;
begin
  if p_reason is not null and char_length(p_reason) > 200 then
    raise exception 'Reason must be 200 characters or fewer.' using errcode = '22001';
  end if;

  select * into v_tx
    from public.transactions
   where id = p_transaction_id
     and business_id = p_business_id
   for update;

  if v_tx.id is null then
    raise exception 'Transaction not found.' using errcode = 'P0002';
  end if;

  if not public.has_role(v_tx.business_id, 'owner') then
    raise exception 'Only the owner can delete a transaction.' using errcode = '42501';
  end if;

  select name into v_customer_name from public.customers where id = v_tx.customer_id;

  insert into public.deletion_log
    (business_id, entity_type, entity_id, label, summary, snapshot, reason, deleted_by)
  values (
    v_tx.business_id,
    'transaction',
    v_tx.id,
    initcap(v_tx.type::text) || ' ₹' || to_char(v_tx.amount, 'FM999999999990.00')
      || ' · ' || coalesce(v_customer_name, 'Unknown customer'),
    jsonb_build_object(
      'type', v_tx.type,
      'amount', v_tx.amount,
      'status', v_tx.status,
      'occurred_at', v_tx.occurred_at,
      'customer_id', v_tx.customer_id,
      'customer_name', v_customer_name
    ),
    to_jsonb(v_tx),
    nullif(btrim(p_reason), ''),
    (select auth.uid())
  )
  returning id into v_log_id;

  delete from public.transactions where id = v_tx.id;

  return v_log_id;
end;
$$;


-- ============================================================================
-- 4. delete_customer_permanently() — now with a snapshot
-- ============================================================================
-- Same name and arguments as before (the client keeps calling it), but it now
-- records the customer AND every transaction in deletion_log first, and returns
-- the log id (it used to return void, hence drop + create).

drop function if exists public.delete_customer_permanently(uuid, uuid);

create function public.delete_customer_permanently(
  p_customer_id uuid,
  p_business_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers;
  v_transactions jsonb;
  v_count bigint;
  v_balance numeric;
  v_log_id uuid;
begin
  select * into v_customer
    from public.customers
   where id = p_customer_id
   for update;

  if v_customer.id is null or v_customer.business_id <> p_business_id then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if not public.has_role(v_customer.business_id, 'owner') then
    raise exception 'Only the owner can delete a customer.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at, t.id), '[]'::jsonb),
         count(*),
         coalesce(sum(case when t.type = 'charge' then t.amount else -t.amount end)
                  filter (where t.status in ('active', 'edited')), 0)
    into v_transactions, v_count, v_balance
    from public.transactions t
   where t.customer_id = v_customer.id;

  insert into public.deletion_log
    (business_id, entity_type, entity_id, label, summary, snapshot, deleted_by)
  values (
    v_customer.business_id,
    'customer',
    v_customer.id,
    v_customer.name,
    jsonb_build_object('transaction_count', v_count, 'balance', v_balance, 'phone', v_customer.phone),
    jsonb_build_object('customer', to_jsonb(v_customer), 'transactions', v_transactions),
    (select auth.uid())
  )
  returning id into v_log_id;

  -- The transactions FK has no ON DELETE CASCADE, so both deletes are explicit.
  delete from public.transactions where customer_id = v_customer.id;
  delete from public.customers where id = v_customer.id;

  return v_log_id;
end;
$$;


-- ============================================================================
-- 5. restore_deleted()
-- ============================================================================
-- Owner-only. Re-inserts the snapshot rows with their original ids, authors and
-- timestamps. Error codes the client maps to messages:
--   P0002  log entry not found
--   42501  caller is not the owner
--   55000  already restored, or a transaction's customer is missing
--   23505  a row with that id already exists

create or replace function public.restore_deleted(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.deletion_log;
  v_restored bigint := 0;
begin
  select * into v_log from public.deletion_log where id = p_log_id for update;

  if v_log.id is null then
    raise exception 'Deleted item not found.' using errcode = 'P0002';
  end if;

  if not public.has_role(v_log.business_id, 'owner') then
    raise exception 'Only the owner can restore deleted items.' using errcode = '42501';
  end if;

  if v_log.restored_at is not null then
    raise exception 'This item was already restored.' using errcode = '55000';
  end if;

  -- Keep original authors/timestamps (see section 2).
  perform set_config('bahikhata.restoring', 'on', true);

  if v_log.entity_type = 'customer' then
    insert into public.customers
      select * from jsonb_populate_record(null::public.customers, v_log.snapshot -> 'customer');

    insert into public.transactions
      select * from jsonb_populate_recordset(null::public.transactions, v_log.snapshot -> 'transactions');
    get diagnostics v_restored = row_count;
  else
    if not exists (
      select 1 from public.customers
       where id = (v_log.snapshot ->> 'customer_id')::uuid
         and business_id = v_log.business_id
    ) then
      raise exception 'Restore the customer first.' using errcode = '55000';
    end if;

    insert into public.transactions
      select * from jsonb_populate_record(null::public.transactions, v_log.snapshot);
    v_restored := 1;
  end if;

  perform set_config('bahikhata.restoring', 'off', true);

  update public.deletion_log
     set restored_at = now(), restored_by = (select auth.uid())
   where id = v_log.id;

  return jsonb_build_object(
    'entity_type', v_log.entity_type,
    'entity_id', v_log.entity_id,
    'transactions_restored', v_restored
  );
end;
$$;


-- ============================================================================
-- 6. customer_balances: add last_activity_at
-- ============================================================================
-- The customer list used to embed EVERY transaction date per row just to find
-- the latest (backlog B-01), and that counted voided entries. The view now
-- exposes the latest active/edited entry. New column goes LAST; the dependent
-- computed-relationship function must be dropped first and recreated.

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
  max(t.occurred_at) filter (where t.status in ('active', 'edited')) as last_activity_at
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
  select cb.id, cb.business_id, cb.balance, cb.archived_at, cb.last_activity_at
  from public.customer_balances cb
  where cb.id = p_customer.id;
$$;


-- ============================================================================
-- 7. dashboard_summary() with timezone
-- ============================================================================
-- "Today" used to be cut in the database timezone (UTC), so a user in
-- Bangladesh saw a different "today" on the dashboard than on the
-- Transactions page (backlog B-09). The old one-argument function is dropped
-- so a call with only p_business_id resolves unambiguously to this one.

drop function if exists public.dashboard_summary(uuid);

create or replace function public.dashboard_summary(
  p_business_id uuid,
  p_timezone text default 'UTC'
)
returns table (
  total_receivable numeric,
  total_credit numeric,
  open_accounts bigint,
  today_count bigint,
  today_net numeric,
  customer_count bigint,
  top_debtors jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.'
      using errcode = '42501';
  end if;

  -- Start and end of the caller's local day, as instants.
  v_day_start := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;
  v_day_end   := (date_trunc('day', now() at time zone p_timezone) + interval '1 day') at time zone p_timezone;

  return query
  with balances as (
    select c.id, c.name,
      coalesce(sum(
        case when t.type = 'charge' then t.amount else -t.amount end
      ) filter (where t.status in ('active', 'edited')), 0) as balance
    from public.customers c
    left join public.transactions t
      on t.customer_id = c.id
     and t.business_id = c.business_id
    where c.business_id = p_business_id
      and c.deleted_at is null
      and c.archived_at is null
    group by c.id, c.name
  ),
  today as (
    select
      count(*) as cnt,
      coalesce(sum(
        case when t.type = 'charge' then t.amount else -t.amount end
      ) filter (where t.status in ('active', 'edited')), 0) as net
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    where t.business_id = p_business_id
      and c.deleted_at is null
      and c.archived_at is null
      and t.status in ('active', 'edited')
      and t.occurred_at >= v_day_start
      and t.occurred_at <  v_day_end
  )
  select
    coalesce(sum(balance) filter (where balance > 0), 0),
    coalesce(sum(abs(balance)) filter (where balance < 0), 0),
    count(*) filter (where balance <> 0),
    (select cnt from today),
    (select net from today),
    (select count(*) from balances),
    (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'balance', balance)
        order by balance desc
      ), '[]'::jsonb)
      from (
        select id, name, balance
        from balances
        where balance > 0
        order by balance desc
        limit 8
      ) d
    )
  from balances;
end;
$$;


-- ============================================================================
-- 8. FUNCTION PRIVILEGES (same policy as the baseline: no anon, no PUBLIC)
-- ============================================================================

revoke execute on function public.delete_transaction(uuid, uuid, text)           from public, anon;
revoke execute on function public.delete_customer_permanently(uuid, uuid)        from public, anon;
revoke execute on function public.restore_deleted(uuid)                          from public, anon;
revoke execute on function public.dashboard_summary(uuid, text)                  from public, anon;
revoke execute on function public.customer_balances(public.customers)            from public, anon;

grant execute on function public.delete_transaction(uuid, uuid, text)            to authenticated;
grant execute on function public.delete_customer_permanently(uuid, uuid)         to authenticated;
grant execute on function public.restore_deleted(uuid)                           to authenticated;
grant execute on function public.dashboard_summary(uuid, text)                   to authenticated;
grant execute on function public.customer_balances(public.customers)             to authenticated;

-- Trigger functions are never called directly.
revoke execute on function public.stamp_transaction_actor() from public, anon, authenticated;
revoke execute on function public.stamp_customer_actor()    from public, anon, authenticated;


-- ============================================================================
-- 9. POSTGREST SCHEMA RELOAD
-- ============================================================================
notify pgrst, 'reload schema';

commit;
