import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletionLogKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  bulkRestoreDeleted,
  listDeletionLog,
  restoreDeleted,
  purgeDeletionLog,
  getLastPurge,
  type ListDeletionLogOptions,
  type PurgeDeletionLogParams,
} from "./api";

// v3 (S-52) — the owner's Recently deleted page. Reading is as
// sensitive as writing: the query only runs for a role that may
// (viewDeletedItems), and the database refuses anyone else regardless.

export function useDeletionLog(businessId: string, opts?: ListDeletionLogOptions) {
  const { can } = usePermissions();
  return useQuery({
    // The full option set travels in the key, so a filter change is a
    // fresh read and never a stale cache hit.
    queryKey: deletionLogKeys.list(businessId, JSON.stringify(opts ?? {})),
    queryFn: () => listDeletionLog(businessId, opts),
    enabled: can("viewDeletedItems"),
  });
}

export function useRestoreDeleted(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (logId: string) => {
      // S-21: a known non-owner fails here, before the network.
      assertCan("restoreDeleted");
      return restoreDeleted(logId);
    },
    // A restore can re-insert a customer and any number of
    // transactions, moving balances and the dashboard with them — one
    // business-wide invalidation covers every surface the restored row
    // can reappear on. onSettled: even a failed restore may have
    // changed what the page shows (a partial conflict), so refetch.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["business", businessId] });
    },
  });
}

/**
 * S-75: Bulk restore deleted items. Owner only. Max 100 per call.
 */
export function useBulkRestoreDeleted(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (logIds: string[]) => {
      assertCan("restoreDeleted");
      return bulkRestoreDeleted(logIds);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["business", businessId] });
      queryClient.invalidateQueries({ queryKey: deletionLogKeys.all(businessId) });
    },
  });
}

export function useLastPurge(businessId: string) {
  const { can } = usePermissions();
  return useQuery({
    queryKey: deletionLogKeys.lastPurge(businessId),
    queryFn: () => getLastPurge(businessId),
    enabled: can("viewDeletedItems"),
  });
}

export function usePurgeDryRun(
  businessId: string,
  ageDays: string | number,
  scope: "restored" | "all",
  enabled: boolean,
) {
  const { can } = usePermissions();
  return useQuery({
    queryKey: deletionLogKeys.dryRun(businessId, String(ageDays), scope),
    queryFn: () => {
      const before = new Date(
        Date.now() - Number(ageDays) * 86400000,
      ).toISOString();
      return purgeDeletionLog({
        businessId,
        before,
        scope,
        dryRun: true,
      });
    },
    enabled: enabled && can("purgeDeletionLog"),
  });
}

export function usePurgeDeletionLog(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (params: Omit<PurgeDeletionLogParams, "businessId">) => {
      assertCan("purgeDeletionLog");
      return purgeDeletionLog({
        ...params,
        businessId,
        dryRun: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deletionLogKeys.all(businessId) });
      queryClient.invalidateQueries({ queryKey: ["business", businessId] });
    },
  });
}
