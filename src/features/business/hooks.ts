import { useQuery } from "@tanstack/react-query";
import { businessKeys } from "@/lib/queryKeys";
import { getMemberships } from "./api";

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
