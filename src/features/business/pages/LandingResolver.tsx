import { Navigate } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useActiveBusiness } from "@/contexts/BusinessContext";
import { useMemberships } from "@/features/business/hooks";
import { BusinessBootSkeleton } from "@/features/business/components/BusinessBootSkeleton";
import { DashboardPage } from "@/pages/Dashboard";

/**
 * Decides where the signed-in user belongs when they open "/" (S-16):
 * their own business dashboard, My businesses, or onboarding. Until
 * business URLs exist (S-17), the dashboard stays at "/" itself, so
 * "ready" renders it in place instead of redirecting.
 */
export function LandingResolver() {
  const { status } = useActiveBusiness();
  const { data: memberships, isPending } = useMemberships();

  // No flicker: while the decision is being made, only the skeleton
  // shows — no intermediate page renders.
  if (status === "loading" || isPending) {
    return <BusinessBootSkeleton />;
  }

  if (status === "ready") {
    return <DashboardPage />;
  }

  const memberElsewhere = (memberships?.businesses.length ?? 0) > 0;
  const invited = (memberships?.invitations.length ?? 0) > 0;
  if (memberElsewhere || invited) {
    return <Navigate to={paths.businesses} replace />;
  }
  return <Navigate to={paths.onboardingBusiness} replace />;
}
