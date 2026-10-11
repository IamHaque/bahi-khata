import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/lib/queryKeys";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  type CustomerInput,
} from "./api";
import type { Customer } from "@/types";

export function useCustomers() {
  return useQuery({
    queryKey: customerKeys.list(),
    queryFn: listCustomers,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all() });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CustomerInput>;
    }) => updateCustomer(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all() });
    },
  });
}

export type { Customer };
