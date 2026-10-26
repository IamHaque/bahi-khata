-- S-24: my_invitations() — the invitations addressed to the signed-in
-- user, with the display names the invitee cannot read themselves.
--
-- Why this function exists: an invitee is not yet a member, so row-level
-- security (correctly) hides `businesses` and `profiles` from them. The
-- S-24 scenario still requires listing each invitation with the business
-- name and the inviter. This security-definer function exposes exactly
-- those three display fields and nothing else — the caller passes no
-- arguments at all; the invitation set is selected by matching the
-- stored email against the caller's own JWT email, case-insensitively,
-- exactly like the "Invitees can read their invitations" policy and
-- respond_to_invitation in 0002.
--
-- Numbered 0002b so it applies right after 0002 (it needs only the 0001
-- tables and the 0002 schema) and before 0003's destructive step; the
-- app works with or without it (the invitation list is simply empty).

create or replace function public.my_invitations()
returns table (
  id            uuid,
  business_id   uuid,
  business_name text,
  inviter_name  text,
  role          public.business_role,
  created_at    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.business_id,
    b.name,
    coalesce(p.full_name, p.email),
    i.role,
    i.created_at
  from public.business_invitations i
  join public.businesses b on b.id = i.business_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = lower(auth.jwt() ->> 'email')
    and i.status = 'pending'
  order by i.created_at desc;
$$;
