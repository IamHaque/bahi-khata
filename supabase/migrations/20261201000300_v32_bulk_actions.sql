-- Migration: 20261201000300_v32_bulk_actions.sql
-- Story: S-75 (B-13) Bulk select and act on customers, transactions and deleted items.
-- Atomic batch operations capped at 100 items per call.

-- 1. bulk_set_customers_archived
create or replace function public.bulk_set_customers_archived(
  p_business_id uuid,
  p_ids uuid[],
  p_archived boolean
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
  v_expected int := 0;
begin
  if cardinality(p_ids) > 100 then
    raise exception 'Cannot act on more than 100 items at a time.' using errcode = '54000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  v_expected := (select count(distinct x) from unnest(p_ids) as x);

  foreach v_id in array p_ids loop
    if not exists (
      select 1 from public.customers
       where id = v_id and business_id = p_business_id
    ) then
      raise exception 'Customer not found or not in this business: %', v_id using errcode = 'P0002';
    end if;
  end loop;

  update public.customers
     set archived_at = case when p_archived then now() else null end,
         updated_at = now()
   where id = any(p_ids)
     and business_id = p_business_id;

  get diagnostics v_count = row_count;
  if v_count <> v_expected then
    raise exception 'You do not have permission to change these items.'
      using errcode = '42501';
  end if;

  return v_count;
end;
$$;

revoke execute on function public.bulk_set_customers_archived(uuid, uuid[], boolean) from public, anon;
grant execute on function public.bulk_set_customers_archived(uuid, uuid[], boolean) to authenticated;


-- 2. bulk_set_transactions_voided
create or replace function public.bulk_set_transactions_voided(
  p_business_id uuid,
  p_ids uuid[],
  p_voided boolean,
  p_reason text default null
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_tx_id uuid;
  v_cust_id uuid;
  v_status transaction_status;
  v_cust_archived boolean;
  v_count int := 0;
  v_expected int := 0;
begin
  if cardinality(p_ids) > 100 then
    raise exception 'Cannot act on more than 100 items at a time.' using errcode = '54000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  v_expected := (select count(distinct x) from unnest(p_ids) as x);

  if p_voided and p_reason is not null and char_length(p_reason) > 200 then
    raise exception 'Reason must be 200 characters or fewer.' using errcode = '22001';
  end if;

  foreach v_id in array p_ids loop
    select t.id, t.customer_id, t.status, (c.archived_at is not null)
      into v_tx_id, v_cust_id, v_status, v_cust_archived
      from public.transactions t
      join public.customers c on c.id = t.customer_id
     where t.id = v_id and t.business_id = p_business_id;

    if not found then
      raise exception 'Transaction not found or not in this business: %', v_id using errcode = 'P0002';
    end if;

    if p_voided and v_cust_archived then
      raise exception 'Cannot void transaction for archived customer: %', v_id using errcode = '55000';
    end if;
  end loop;

  if p_voided then
    update public.transactions
       set status = 'voided'::transaction_status,
           voided_at = now(),
           voided_by = (select auth.uid()),
           void_reason = nullif(btrim(p_reason), ''),
           updated_at = now()
     where id = any(p_ids)
       and business_id = p_business_id;
    get diagnostics v_count = row_count;
    if v_count <> v_expected then
      raise exception 'You do not have permission to change these items.'
        using errcode = '42501';
    end if;
    return v_count;
  else
    foreach v_id in array p_ids loop
      begin
        perform public.restore_transaction(v_id, p_business_id);
      exception
        when others then
          if not public.is_member_with_role(p_business_id, array['owner', 'editor']) then
            raise exception 'You do not have permission to change these items.' using errcode = '42501';
          end if;
          raise exception 'Could not restore transaction %: %', v_id, sqlerrm using errcode = sqlstate;
      end;
      v_count := v_count + 1;
    end loop;
    return v_count;
  end if;
end;
$$;

revoke execute on function public.bulk_set_transactions_voided(uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.bulk_set_transactions_voided(uuid, uuid[], boolean, text) to authenticated;


-- 3. bulk_delete_transactions
create or replace function public.bulk_delete_transactions(
  p_business_id uuid,
  p_ids uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_log_id uuid;
  v_log_ids uuid[] := array[]::uuid[];
begin
  if cardinality(p_ids) > 100 then
    raise exception 'Cannot act on more than 100 items at a time.' using errcode = '54000';
  end if;
  if not public.has_role(p_business_id, 'owner') then
    raise exception 'Only the owner can delete transactions.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('count', 0, 'log_ids', '[]'::jsonb);
  end if;

  foreach v_id in array p_ids loop
    v_log_id := public.delete_transaction(v_id, p_business_id, p_reason);
    v_log_ids := array_append(v_log_ids, v_log_id);
  end loop;

  return jsonb_build_object(
    'count', cardinality(v_log_ids),
    'log_ids', to_jsonb(v_log_ids)
  );
end;
$$;

revoke execute on function public.bulk_delete_transactions(uuid, uuid[], text) from public, anon;
grant execute on function public.bulk_delete_transactions(uuid, uuid[], text) to authenticated;


-- 4. bulk_delete_customers
create or replace function public.bulk_delete_customers(
  p_business_id uuid,
  p_ids uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_log_id uuid;
  v_log_ids uuid[] := array[]::uuid[];
  v_tx_count bigint := 0;
begin
  if cardinality(p_ids) > 100 then
    raise exception 'Cannot act on more than 100 items at a time.' using errcode = '54000';
  end if;
  if not public.has_role(p_business_id, 'owner') then
    raise exception 'Only the owner can delete customers.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('count', 0, 'transactions', 0, 'log_ids', '[]'::jsonb);
  end if;

  select count(*) into v_tx_count
    from public.transactions
   where customer_id = any(p_ids)
     and business_id = p_business_id;

  foreach v_id in array p_ids loop
    v_log_id := public.delete_customer_permanently(v_id, p_business_id);
    if p_reason is not null and btrim(p_reason) <> '' then
      update public.deletion_log
         set reason = btrim(p_reason)
       where id = v_log_id;
    end if;
    v_log_ids := array_append(v_log_ids, v_log_id);
  end loop;

  return jsonb_build_object(
    'count', cardinality(v_log_ids),
    'transactions', v_tx_count,
    'log_ids', to_jsonb(v_log_ids)
  );
end;
$$;

revoke execute on function public.bulk_delete_customers(uuid, uuid[], text) from public, anon;
grant execute on function public.bulk_delete_customers(uuid, uuid[], text) to authenticated;


-- 5. bulk_restore_deleted
create or replace function public.bulk_restore_deleted(
  p_log_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_res jsonb;
  v_count int := 0;
begin
  if cardinality(p_log_ids) > 100 then
    raise exception 'Cannot act on more than 100 items at a time.' using errcode = '54000';
  end if;
  if p_log_ids is null or cardinality(p_log_ids) = 0 then
    return jsonb_build_object('count', 0);
  end if;

  foreach v_id in array p_log_ids loop
    v_res := public.restore_deleted(v_id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count);
end;
$$;

revoke execute on function public.bulk_restore_deleted(uuid[]) from public, anon;
grant execute on function public.bulk_restore_deleted(uuid[]) to authenticated;
