import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { paths } from "@/lib/paths";
import { businessExists, type BusinessSummary } from "@/features/business/api";
import { useMemberships } from "@/features/business/hooks";
import { buttonVariants } from "@/components/ui/button";
import { BusinessBootSkeleton } from "./BusinessBootSkeleton";
import { ShieldAlert } from "lucide-react";

/**
 * Guards every /b/:businessId route (S-17): the businessId must be one
 * of the user's memberships. An unknown business and a forbidden one
 * are the same page — the membership list is RLS-filtered, so a
 * business the user cannot read simply is not in it. Blocked children
 * never mount, so no data from that business is requested or shown.
 *
 * S-27 lost access: if the business was in the membership list when
 * this guard mounted and disappears from it while I am here (removed
 * by the owner, or the business deleted), the guard probes whether the
 * row still exists (RPC from migration 0003b — removed and deleted are
 * identical through RLS), purges the business's cached data, and sends
 * me where the scenario says: "You no longer have access to <name>" to
 * /businesses, or "This business no longer exists" to the landing
 * resolver. A business that was never in my list (a stale deep link)
 * keeps the original static page.
 */
export function BusinessGuard() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: memberships, isPending } = useMemberships();

  const current =
    memberships?.businesses.find((b) => b.id === businessId) ?? null;

  // Remember the last known membership so "never mine" (deep link) and
  // "access lost while viewing" (S-27) stay distinguishable.
  const lastSeenRef = useRef<BusinessSummary | null>(null);
  if (current) lastSeenRef.current = current;
  const handledRef = useRef(false);
  const [handling, setHandling] = useState(false);

  useEffect(() => {
    if (isPending || memberships === undefined) return;
    if (current !== null) return;
    const lastSeen = lastSeenRef.current;
    if (lastSeen === null || handledRef.current) return;

    // The membership vanished while I was here: lost access (S-27).
    handledRef.current = true;
    setHandling(true);
    let cancelled = false;

    void (async () => {
      // Removed (row exists) or deleted (row gone)? RLS cannot tell;
      // the existence probe can. If even that fails, fall back to the
      // access-lost path — the conservative, membership-shaped truth.
      let businessGone = false;
      try {
        businessGone = !(await businessExists(businessId ?? ""));
      } catch {
        businessGone = false;
      }
      if (cancelled) return;

      // Cached data for the business is purged (both cases).
      queryClient.removeQueries({ queryKey: ["business", businessId] });
      if (businessGone) {
        toast.error("This business no longer exists");
        navigate(paths.root);
      } else {
        toast.error(`You no longer have access to ${lastSeen.name}`);
        navigate(paths.businesses);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberships, isPending, current, businessId, navigate, queryClient]);

  // Defensive: the provider gate normally settles memberships before
  // any route renders; `handling` covers the probe round trip so the
  // denied page never flashes on the way out.
  if (isPending || handling) {
    return <BusinessBootSkeleton />;
  }

  const isMember = current !== null;
  if (!isMember) {
    return <BusinessAccessDenied />;
  }

  return <Outlet />;
}

function BusinessAccessDenied() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Business not found or you do not have access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been deleted, or you may not be a member.
        </p>
      </div>
      <Link to={paths.businesses} className={buttonVariants()}>
        Go to My businesses
      </Link>
    </div>
  );
}
