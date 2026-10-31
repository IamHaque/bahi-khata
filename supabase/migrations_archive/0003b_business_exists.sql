-- S-27: business_exists() — the lost-access probe.
--
-- Why this function exists: when a member is removed while viewing a
-- business, and when a business is deleted while a member is viewing it,
-- both manifest identically on the client — the business vanishes from
-- the RLS-filtered membership list (and every scoped query returns zero
-- rows). The S-27 scenarios require two different messages with two
-- different destinations:
--   removed  -> "You no longer have access to <name>" -> /businesses
--   deleted  -> "This business no longer exists"      -> the landing resolver
-- This security-definer function exposes exactly one bit — does the
-- business row exist — so the client can tell the two apart. It leaks
-- nothing else: business ids are random UUIDs (not enumerable), and no
-- name, member or financial field crosses the boundary. Members and
-- non-members alike get the same boolean; only the row's existence is
-- answered.
--
-- Numbered 0003b so it applies after 0003 (it needs only the 0001
-- tables) and before 0004; the app works without it — the client falls
-- back to the "access lost" message when the probe is unavailable.

create or replace function public.business_exists(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses where id = p_business_id
  );
$$;

-- Any signed-in user may probe existence (that is the point — the
-- caller is, by definition, no longer a member); nobody anonymous.
revoke execute on function public.business_exists(uuid) from public, anon;
grant execute on function public.business_exists(uuid) to authenticated;
