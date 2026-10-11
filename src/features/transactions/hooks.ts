import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys, transactionKeys } from "@/lib/queryKeys";
import {
  createTransaction,
  createTransactionsBatch,
  getAllCustomerBalances,
  getAllTransactions,
  getCustomerBalance,
  getTodayActivity,
  getTodayTransactions,
  getTransactionById,
  listTransactionsByCustomer,
  updateTransaction,
  updateTransactionStatus,
} from "./api";
import type { Transaction, TransactionWithCustomer } from "@/types";

function useTransactionInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all() });
    queryClient.invalidateQueries({ queryKey: customerKeys.all() });
  };
}

export function useCustomerTransactions(customerId: string) {
  return useQuery({
    queryKey: transactionKeys.byCustomer(customerId),
    queryFn: () => listTransactionsByCustomer(customerId),
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

export function useCreateTransaction() {
  const invalidate = useTransactionInvalidation();
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: invalidate,
  });
}

export function useCreateTransactionsBatch() {
  const invalidate = useTransactionInvalidation();
  return useMutation({
    mutationFn: createTransactionsBatch,
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useTransactionInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Transaction, "type" | "amount" | "occurred_at" | "note">>;
    }) => updateTransaction(id, input),
    onSuccess: invalidate,
  });
}

export function useUpdateTransactionStatus() {
  const invalidate = useTransactionInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "edited" | "voided";
    }) => updateTransactionStatus(id, status),
    onSuccess: invalidate,
  });
}

export type { TransactionWithCustomer };
