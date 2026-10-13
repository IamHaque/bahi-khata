import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys, transactionKeys } from "@/lib/queryKeys";
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

function useTransactionInvalidation(businessId?: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
  };
}

export function useCustomerTransactions(customerId: string, businessId?: string) {
  return useQuery({
    queryKey: transactionKeys.byCustomer(customerId, businessId),
    queryFn: () => listTransactionsByCustomer(customerId, businessId),
  });
}

export function useTransaction(id: string, businessId?: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id, businessId),
    queryFn: () => getTransactionById(id, businessId),
  });
}

export function useTransactions(
  options?: {
    dateRange?: { start: string; end: string } | null;
    typeFilter?: "all" | "charge" | "payment";
  },
  businessId?: string,
) {
  return useQuery({
    queryKey: transactionKeys.list(businessId),
    queryFn: () => getAllTransactions(options, businessId),
  });
}

// The balance RPCs take no business argument (DEV-8: unscoped v1 RPCs,
// replaced in S-20); the businessId here scopes the cache entry only, so
// two businesses never share cached balances.
export function useCustomerBalance(customerId: string, businessId?: string) {
  return useQuery({
    queryKey: customerKeys.balance(customerId, businessId),
    queryFn: () => getCustomerBalance(customerId),
  });
}

export function useAllCustomerBalances(businessId?: string) {
  return useQuery({
    queryKey: customerKeys.balances(businessId),
    queryFn: getAllCustomerBalances,
  });
}

export function useDashboardSummary(businessId: string) {
  return useQuery({
    queryKey: transactionKeys.summary(businessId),
    queryFn: () => getDashboardSummary(businessId),
  });
}

export function useTodayActivity(businessId?: string) {
  return useQuery({
    queryKey: transactionKeys.today(businessId),
    queryFn: () => getTodayActivity(businessId),
  });
}

export function useTodayTransactions(limit = 5, businessId?: string) {
  return useQuery({
    queryKey: transactionKeys.todayList(limit, businessId),
    queryFn: () => getTodayTransactions(limit, businessId),
  });
}

export function useCreateTransaction(businessId?: string) {
  const invalidate = useTransactionInvalidation(businessId);
  return useMutation({
    mutationFn: (input: Parameters<typeof createTransaction>[0]) =>
      createTransaction(input, businessId),
    onSuccess: invalidate,
  });
}

export function useCreateTransactionsBatch(businessId?: string) {
  const invalidate = useTransactionInvalidation(businessId);
  return useMutation({
    mutationFn: (transactions: Parameters<typeof createTransactionsBatch>[0]) =>
      createTransactionsBatch(transactions, businessId),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction(businessId?: string) {
  const invalidate = useTransactionInvalidation(businessId);
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Transaction, "type" | "amount" | "occurred_at" | "note">>;
    }) => updateTransaction(id, input, businessId),
    onSuccess: invalidate,
  });
}

export function useUpdateTransactionStatus(businessId?: string) {
  const invalidate = useTransactionInvalidation(businessId);
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "edited" | "voided";
    }) => updateTransactionStatus(id, status, businessId),
    onSuccess: invalidate,
  });
}

export type { TransactionWithCustomer };
