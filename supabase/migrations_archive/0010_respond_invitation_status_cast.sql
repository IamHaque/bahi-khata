-- 0010: fix respond_to_invitation's CASE-into-enum assignment.
--
-- Found on 2026-10-16 during the FIRST REAL EXECUTION of the test
-- suite (docs/MANUAL_STEPS.md -> SYNC, step 5): calling
-- respond_to_invitation raised
--   42804: column "status" is of type invitation_status but
--          expression is of type text
-- for the statement
--   set status = case when p_accept then 'accepted' else 'declined' end
-- because a CASE whose branches are all unknown literals resolves to
-- type text, and text does not assign to an enum column (a plain
-- `set status = 'accepted'` would coerce — only the CASE breaks it).
-- plpgsql type-checks statements at first EXECUTION, and this RPC had
-- never been called against a live database before the suite ran —
-- the same class of find as 0009's missing column (PROGRESS DEV-15),
-- logged here as DEV-22.
--
-- Identical body to migration 0002's function with the branches cast
-- to invitation_status — the pattern0005's restore_transaction
-- already uses. Additive and idempotent (create or replace), so a
-- fresh project applying 0002 then 0010 ends with the fixed body.
-- Migration 0002 stays untouched: it was already applied when the
-- bug surfaced, and applied migrations are immutable.

create or replace function public.respond_to_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns public.business_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.business_invitations;
begin
  select * into v_invite
    from public.business_invitations
   where id = p_invitation_id
     and email = lower((select auth.jwt() ->> 'email'))
     and status = 'pending'
   for update;

  if v_invite.id is null then
    raise exception 'This invitation is no longer available.'
      using errcode = '42501';
  end if;

  if p_accept then
    insert into public.business_members (business_id, user_id, role)
    values (v_invite.business_id, (select auth.uid()), v_invite.role)
    on conflict (business_id, user_id) do nothing;
  end if;

  update public.business_invitations
     set status = (case when p_accept then 'accepted' else 'declined' end)::public.invitation_status,
         responded_at = now()
   where id = v_invite.id
  returning * into v_invite;

  return v_invite;
end;
$$;
