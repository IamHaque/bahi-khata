import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys, importKeys, transactionKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  getImportCustomers,
  importHistory,
  type ImportPlan,
} from "./api";

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
