import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customerKeys,
  dashboardKeys,
  transactionKeys,
} from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  createTransaction,
  createTransactionsBatch,
  getAllCustomerBalances,
  getCustomerBalance,
  getCustomerLedger,
  getDashboardSummary,
  getTransactionById,
  queryTransactions,
  restoreTransaction,
  transactionRollup,
  updateTransaction,
  voidTransaction,
} from "./api";
import type { TransactionListParams, TransactionRollupParams } from "./api";
import type { Transaction, TransactionWithCustomer } from "@/types";

// S-20 contract: every query and mutation carries a businessId. Omitting
// it is a TypeScript error, not a silent unscoped fallback.

// One invalidation rule for every money-changing mutation: the
// transaction caches (list, paged, rollup, ledger AND the dashboard
// summary key, which nests under transactionKeys.all), the customer
// caches (balances move with transactions) and the dashboard's own
// surfaces (trend chart + activity feed, keyed under dashboardKeys).
function useTransactionInvalidation(businessId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all(businessId) });
  };
}

// S-31 — the customer detail ledger: rows arrive newest first, each
// carrying its running balance from the customer_ledger RPC. The key
// stays transactionKeys.byCustomer, so every mutation's
// transactionKeys.all invalidation refetches it.
export function useCustomerLedger(customerId: string, businessId: string) {
  return useQuery({
    queryKey: transactionKeys.byCustomer(customerId, businessId),
    queryFn: () => getCustomerLedger(customerId, businessId),
    enabled: Boolean(customerId),
  });
}

export function useTransaction(id: string, businessId: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id, businessId),
    queryFn: () => getTransactionById(id, businessId),
  });
}

// S-35 — the transactions page's two reads: the paged detailed list
// and the rollup (summarized periods + the totals footer). Both carry
// their full filter set in the query key, and both keys live under
// transactionKeys.all, so every mutation's invalidation refetches
// them wherever the page is mounted.
export function useTransactionList(
  businessId: string,
  params: TransactionListParams,
) {
  return useQuery({
    queryKey: [...transactionKeys.pagedList(businessId), params],
    queryFn: () => queryTransactions(businessId, params),
    enabled: Boolean(businessId),
  });
}

export function useTransactionRollup(
  businessId: string,
  params: TransactionRollupParams,
) {
  return useQuery({
    queryKey: [...transactionKeys.rollup(businessId), params],
    queryFn: () => transactionRollup(businessId, params),
    enabled: Boolean(businessId),
  });
}

// Balances come from the security-invoker `customer_balances` view (S-20),
// so the caller's RLS applies — the same businessId scopes both the
// cached entry and the read itself (DEV-8 resolved).
export function useCustomerBalance(customerId: string, businessId: string) {
  return useQuery({
    queryKey: customerKeys.balance(customerId, businessId),
    queryFn: () => getCustomerBalance(customerId, businessId),
  });
}

export function useAllCustomerBalances(businessId: string) {
  return useQuery({
    queryKey: customerKeys.balances(businessId),
    queryFn: () => getAllCustomerBalances(businessId),
  });
}

export function useDashboardSummary(businessId: string) {
  return useQuery({
    queryKey: transactionKeys.summary(businessId),
    queryFn: () => getDashboardSummary(businessId),
    // No business in the URL (My businesses page) → no scoped read.
    enabled: Boolean(businessId),
  });
}

export function useCreateTransaction(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTransaction>[0]) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return createTransaction(input, businessId);
    },
    onSuccess: invalidate,
  });
}

export function useCreateTransactionsBatch(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (transactions: Parameters<typeof createTransactionsBatch>[0]) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return createTransactionsBatch(transactions, businessId);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Transaction, "type" | "amount" | "occurred_at" | "note">>;
    }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return updateTransaction(id, input, businessId);
    },
    onSuccess: invalidate,
  });
}

export function useVoidTransaction(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return voidTransaction(id, reason, businessId);
    },
    onSuccess: invalidate,
  });
}

export function useRestoreTransaction(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return restoreTransaction(id, businessId);
    },
    onSuccess: invalidate,
  });
}

export type { TransactionWithCustomer };
