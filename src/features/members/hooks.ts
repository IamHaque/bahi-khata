import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  createInvitation,
  getBusinessInvitations,
  getMembers,
  revokeInvitation,
  type InvitationInput,
} from "./api";

// S-22/S-23: the members page reads who belongs to the URL business and
// (for the owner) what invitations are pending. All take a required
// businessId per the S-20 contract.

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

/** Send an invitation (S-23) — owner-only, blocked before the network. */
export function useCreateInvitation(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (input: InvitationInput) => {
      // S-21: a known non-owner fails here, before the network.
      assertCan("manageMembers");
      return createInvitation(businessId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: businessKeys.invitations(businessId),
      });
      // The impact counts in the delete dialog include invitations.
      queryClient.invalidateQueries({
        queryKey: businessKeys.impact(businessId),
      });
    },
  });
}

/** Revoke a pending invitation (S-23) — owner-only, blocked before the network. */
export function useRevokeInvitation(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (invitationId: string) => {
      // S-21: a known non-owner fails here, before the network.
      assertCan("manageMembers");
      return revokeInvitation(invitationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: businessKeys.invitations(businessId),
      });
      queryClient.invalidateQueries({
        queryKey: businessKeys.impact(businessId),
      });
    },
  });
}
