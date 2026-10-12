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

export function useTransaction(id: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id),
    queryFn: () => getTransactionById(id),
  });
}

export function useTransactions(options?: {
  dateRange?: { start: string; end: string } | null;
  typeFilter?: "all" | "charge" | "payment";
}) {
  return useQuery({
    queryKey: transactionKeys.list(),
    queryFn: () => getAllTransactions(options),
  });
}

export function useCustomerBalance(customerId: string) {
  return useQuery({
    queryKey: customerKeys.balance(customerId),
    queryFn: () => getCustomerBalance(customerId),
  });
}

export function useAllCustomerBalances() {
  return useQuery({
    queryKey: customerKeys.balances(),
    queryFn: getAllCustomerBalances,
  });
}

export function useDashboardSummary(businessId: string) {
  return useQuery({
    queryKey: transactionKeys.summary(businessId),
    queryFn: () => getDashboardSummary(businessId),
  });
}

export function useTodayActivity() {
  return useQuery({
    queryKey: transactionKeys.today(),
    queryFn: getTodayActivity,
  });
}

export function useTodayTransactions(limit = 5) {
  return useQuery({
    queryKey: transactionKeys.todayList(limit),
    queryFn: () => getTodayTransactions(limit),
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
