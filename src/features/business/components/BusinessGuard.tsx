import { Link, Outlet, useParams } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useMemberships } from "@/features/business/hooks";
import { buttonVariants } from "@/components/ui/button";
import { BusinessBootSkeleton } from "./BusinessBootSkeleton";
import { ShieldAlert } from "lucide-react";

/**
 * Guards every /b/:businessId route (S-17): the businessId must be one
 * of the user's memberships. An unknown business and a forbidden one are
 * the same page — the membership list is RLS-filtered, so a business the
 * user cannot read simply is not in it. Blocked children never mount, so
 * no data from that business is requested or shown.
 */
export function BusinessGuard() {
  const { businessId } = useParams();
  const { data: memberships, isPending } = useMemberships();

  // Defensive: the provider gate normally settles memberships before
  // any route renders.
  if (isPending) {
    return <BusinessBootSkeleton />;
  }

  const isMember = memberships?.businesses.some((b) => b.id === businessId);
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
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
