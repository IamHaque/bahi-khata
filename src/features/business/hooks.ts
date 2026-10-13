import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessKeys } from "@/lib/queryKeys";
import {
  assertCan,
  can,
  type PermissionAction,
  type PermissionRole,
} from "@/lib/permissions";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import {
  createBusiness,
  deleteBusiness,
  getBusiness,
  getBusinessImpact,
  getMemberships,
  updateBusiness,
  type BusinessInput,
} from "./api";

interface UseMembershipsOptions {
  enabled?: boolean;
}

/**
 * The single memberships query (S-14). Every consumer shares one cache
 * entry, so a session loads its businesses exactly once.
 */
export function useMemberships(options?: UseMembershipsOptions) {
  return useQuery({
    queryKey: businessKeys.memberships(),
    queryFn: getMemberships,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBusiness,
    onSuccess: () => {
      // The provider re-resolves the active business right away.
      queryClient.invalidateQueries({ queryKey: businessKeys.memberships() });
    },
  });
}

/** One business's full details (S-18). */
export function useBusiness(businessId: string) {
  return useQuery({
    queryKey: businessKeys.detail(businessId),
    queryFn: () => getBusiness(businessId),
    enabled: Boolean(businessId),
  });
}

/**
 * What the current URL business's member may do (S-21). The role comes
 * from the membership list for the business in the URL — the shared
 * version of the S-18 inline check. No business or no membership yet →
 * role null (the database refuses anything the UI cannot know about).
 */
export function usePermissions() {
  const businessId = useScopedBusinessId() ?? "";
  const { data: memberships } = useMemberships();
  const role: PermissionRole | null =
    businessId === ""
      ? null
      : (memberships?.businesses.find((b) => b.id === businessId)?.role ??
        null);

  return {
    businessId,
    role,
    can: (action: PermissionAction) => can(role, action),
    assertCan: (action: PermissionAction) => assertCan(role, action),
    isOwner: role === "owner",
  };
}

export function useUpdateBusiness(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (input: BusinessInput) => {
      // S-21: a known non-owner fails here, before the network.
      assertCan("manageBusiness");
      return updateBusiness(businessId, input);
    },
    onSuccess: (updated) => {
      // The page and the sidebar business name update immediately.
      queryClient.setQueryData(businessKeys.detail(businessId), updated);
      queryClient.invalidateQueries({ queryKey: businessKeys.memberships() });
    },
  });
}

/** The delete dialog's impact counts (S-19), fetched on demand. */
export function useBusinessImpact(businessId: string, enabled = true) {
  return useQuery({
    queryKey: businessKeys.impact(businessId),
    queryFn: () => getBusinessImpact(businessId),
    enabled: Boolean(businessId) && enabled,
  });
}

export function useDeleteBusiness(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: () => {
      // S-21: a known non-owner fails here, before the network.
      assertCan("deleteBusiness");
      return deleteBusiness(businessId);
    },
    onSuccess: () => {
      // Everything scoped to this business is gone; the active business
      // re-resolves and stale per-business caches are dropped.
      queryClient.removeQueries({
        queryKey: ["business", businessId],
      });
      queryClient.invalidateQueries({ queryKey: businessKeys.memberships() });
    },
  });
}
