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

export function useCustomers(businessId?: string) {
  return useQuery({
    queryKey: customerKeys.list(businessId),
    queryFn: () => listCustomers(businessId),
  });
}

export function useCustomer(id: string, businessId?: string) {
  return useQuery({
    queryKey: customerKeys.detail(id, businessId),
    queryFn: () => getCustomer(id, businessId),
  });
}

export function useCreateCustomer(businessId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input, businessId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    },
  });
}

export function useUpdateCustomer(businessId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CustomerInput>;
    }) => updateCustomer(id, input, businessId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    },
  });
}

export type { Customer };
