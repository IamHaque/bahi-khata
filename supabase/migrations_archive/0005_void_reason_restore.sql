-- S-34: void with a reason, restore with the edit marker intact.
--
-- Why this migration exists:
--   1. The audit trail (FR-9a) needs the REASON a void happened, not
--      just the fact of it — additive, nullable column (voids without
--      a reason are legal; the sheet's reason field is optional).
--   2. Restore is the one operation an honest client cannot express:
--      the restored status depends on the row itself ("edited" if it
--      had been edited before voiding, otherwise "active"), which a
--      plain PostgREST update payload cannot compute. The rule lives
--      here, next to the data, so no future client can get it wrong.
--
-- Design note — the invariant that makes rule 2 possible: voiding
-- deliberately does NOT touch updated_by (it stamps voided_by and
-- void_reason instead). So updated_by still means "this row has been
-- content-edited at least once", and restore reads it. updateTransaction
-- additionally refuses to edit a voided row (see api.ts), so the two
-- markers can never fight.

create or replace function public.restore_transaction(
  p_transaction_id uuid,
  p_business_id uuid
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.transactions;
begin
  update public.transactions
  set
    status = case
      when updated_by is not null then 'edited'::transaction_status
      else 'active'::transaction_status
    end,
    void_reason = null,
    voided_at = null,
    voided_by = null,
    updated_at = now()
  where id = p_transaction_id
    and business_id = p_business_id
    and status = 'voided'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Void transaction not found.';
  end if;

  return v_row;
end;
$$;

-- Security invoker: the caller's RLS applies exactly as for any other
-- transactions update (members of the business only). Signed-in
-- members may execute; nobody anonymous.
revoke execute on function public.restore_transaction(uuid, uuid) from public, anon;
grant execute on function public.restore_transaction(uuid, uuid) to authenticated;
