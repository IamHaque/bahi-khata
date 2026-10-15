import { useParams } from "react-router-dom";

/**
 * The businessId from the URL (S-17): the single source of truth for
 * which business a page shows. Every data page under /b/:businessId
 * calls this and passes the result to its data hooks.
 *
 * Returns null only outside /b/:businessId (in the real app the route
 * structure guarantees the parameter; tests may render pages bare).
 */
export function useScopedBusinessId(): string | null {
  const { businessId } = useParams();
  return businessId ?? null;
}
