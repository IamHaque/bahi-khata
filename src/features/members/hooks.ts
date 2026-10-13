import { useQuery } from "@tanstack/react-query";
import { businessKeys } from "@/lib/queryKeys";
import { getBusinessInvitations, getMembers } from "./api";

// S-22: the members page reads who belongs to the URL business. Both
// queries are required-businessId per the S-20 contract.

export function useMembers(businessId: string) {
  return useQuery({
    queryKey: businessKeys.members(businessId),
    queryFn: () => getMembers(businessId),
    enabled: Boolean(businessId),
  });
}

/**
 * Pending invitations for the URL business (S-22). Owner-only in the
 * database (RLS) — non-owners get an empty list; the page hides the
 * section from them anyway via the permission matrix.
 */
export function useBusinessInvitations(businessId: string) {
  return useQuery({
    queryKey: businessKeys.invitations(businessId),
    queryFn: () => getBusinessInvitations(businessId),
    enabled: Boolean(businessId),
  });
}
