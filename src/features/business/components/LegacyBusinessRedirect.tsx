import { Navigate, useParams, type Params } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useActiveBusiness } from "@/contexts/BusinessContext";

/**
 * Keeps v1 URLs working (S-17): /customers, /customers/:id, /transactions
 * and friends redirect to the same page under the active business. Until
 * S-26's switcher the active business is the user's own business; without
 * one, My businesses is where the user picks or creates a business.
 */
export function LegacyBusinessRedirect({
  to,
}: {
  to: (businessId: string, params: Params) => string;
}) {
  const params = useParams();
  const { business } = useActiveBusiness();

  if (!business) {
    return <Navigate to={paths.businesses} replace />;
  }
  return <Navigate to={to(business.id, params)} replace />;
}
