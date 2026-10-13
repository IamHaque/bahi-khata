import { Navigate } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useActiveBusiness } from "@/contexts/BusinessContext";
import { useMemberships } from "@/features/business/hooks";
import { BusinessBootSkeleton } from "@/features/business/components/BusinessBootSkeleton";

/**
 * Decides where the signed-in user belongs when they open "/" (S-16):
 * their own business, My businesses, or onboarding. From S-17 the
 * destination is always a business URL — /b/:businessId — which is the
 * single source of truth for which business a page shows.
 */
export function LandingResolver() {
  const { status, business } = useActiveBusiness();
  const { data: memberships, isPending } = useMemberships();

  // No flicker: while the decision is being made, only the skeleton
  // shows — no intermediate page renders.
  if (status === "loading" || isPending) {
    return <BusinessBootSkeleton />;
  }

  if (status === "ready" && business) {
    return <Navigate to={paths.business(business.id)} replace />;
  }

  const memberElsewhere = (memberships?.businesses.length ?? 0) > 0;
  const invited = (memberships?.invitations.length ?? 0) > 0;
  if (memberElsewhere || invited) {
    return <Navigate to={paths.businesses} replace />;
  }
  return <Navigate to={paths.onboardingBusiness} replace />;
}
