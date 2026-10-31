import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletionLogKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import { listDeletionLog, restoreDeleted, type ListDeletionLogOptions } from "./api";

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
