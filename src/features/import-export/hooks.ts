import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys, importKeys, transactionKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  getImportCustomers,
  importHistory,
  type ImportPlan,
} from "./api";
import type { ExportProgress } from "./exports";

// S-20 contract: every query and mutation carries a businessId.

export function useImportCustomers(businessId: string) {
  return useQuery({
    queryKey: importKeys.customers(businessId),
    queryFn: () => getImportCustomers(businessId),
  });
}

export function useImportHistory(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (plan: ImportPlan) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("importTransactions");
      return importHistory(businessId, plan);
    },
    onSuccess: () => {
      // New customers and transactions exist now — refresh the lists,
      // the balance strips, the dashboard figures and the ledger.
      queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
      queryClient.invalidateQueries({
        queryKey: transactionKeys.all(businessId),
      });
    },
  });
}

export interface ExportProgressState {
  done: number;
  total: number;
}

/**
 * S-39 — one progress/error wrapper for every export path (the two
 * list pages, the Settings backup, the delete dialog's pre-delete
 * copy). Exports page through the server; the runner shows how far
 * they've got and surfaces a failure without unmounting anything.
 * No permission gate here: exporting is every member's right,
 * Viewers included (the permission matrix says so).
 */
export function useExportRunner(onError?: (message: string) => void) {
  const [progress, setProgress] = useState<ExportProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (task: (onProgress: ExportProgress) => Promise<void>) => {
      setError(null);
      setProgress({ done: 0, total: 0 });
      try {
        await task((done, total) => setProgress({ done, total }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "The export failed.";
        setError(message);
        onError?.(message);
      } finally {
        setProgress(null);
      }
    },
    [onError],
  );

  return { progress, error, run };
}
