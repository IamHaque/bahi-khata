import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys, transactionKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  createTransaction,
  createTransactionsBatch,
  getAllCustomerBalances,
  getAllTransactions,
  getCustomerBalance,
  getDashboardSummary,
  getTodayActivity,
  getTodayTransactions,
  getTransactionById,
  listTransactionsByCustomer,
  updateTransaction,
  updateTransactionStatus,
} from "./api";
import type { Transaction, TransactionWithCustomer } from "@/types";

// S-20 contract: every query and mutation carries a businessId. Omitting
// it is a TypeScript error, not a silent unscoped fallback.

function useTransactionInvalidation(businessId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
  };
}

export function useCustomerTransactions(customerId: string, businessId: string) {
  return useQuery({
    queryKey: transactionKeys.byCustomer(customerId, businessId),
    queryFn: () => listTransactionsByCustomer(customerId, businessId),
  });
}

export function useTransaction(id: string, businessId: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id, businessId),
    queryFn: () => getTransactionById(id, businessId),
  });
}

export function useTransactions(
  businessId: string,
  options?: {
    dateRange?: { start: string; end: string } | null;
    typeFilter?: "all" | "charge" | "payment";
  },
) {
  return useQuery({
    queryKey: transactionKeys.list(businessId),
    queryFn: () => getAllTransactions(businessId, options),
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
  });
}

export function useTodayActivity(businessId: string) {
  return useQuery({
    queryKey: transactionKeys.today(businessId),
    queryFn: () => getTodayActivity(businessId),
  });
}

export function useTodayTransactions(businessId: string, limit = 5) {
  return useQuery({
    queryKey: transactionKeys.todayList(limit, businessId),
    queryFn: () => getTodayTransactions(businessId, limit),
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

export function useUpdateTransactionStatus(businessId: string) {
  const invalidate = useTransactionInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "edited" | "voided";
    }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageTransactions");
      return updateTransactionStatus(id, status, businessId);
    },
    onSuccess: invalidate,
  });
}

export type { TransactionWithCustomer };
