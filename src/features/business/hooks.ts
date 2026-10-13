import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessKeys } from "@/lib/queryKeys";
import {
  createBusiness,
  getBusiness,
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
export function useBusiness(businessId?: string) {
  return useQuery({
    queryKey: businessKeys.detail(businessId ?? ""),
    queryFn: () => getBusiness(businessId ?? ""),
    enabled: Boolean(businessId),
  });
}

export function useUpdateBusiness(businessId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BusinessInput) => updateBusiness(businessId, input),
    onSuccess: (updated) => {
      // The page and the sidebar business name update immediately.
      queryClient.setQueryData(businessKeys.detail(businessId), updated);
      queryClient.invalidateQueries({ queryKey: businessKeys.memberships() });
    },
  });
}
