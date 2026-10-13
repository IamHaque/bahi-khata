import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  type CustomerInput,
} from "./api";
import type { Customer } from "@/types";

// S-20 contract: every query and mutation carries a businessId. Omitting
// it is a TypeScript error, not a silent unscoped fallback.

export function useCustomers(businessId: string) {
  return useQuery({
    queryKey: customerKeys.list(businessId),
    queryFn: () => listCustomers(businessId),
  });
}

export function useCustomer(id: string, businessId: string) {
  return useQuery({
    queryKey: customerKeys.detail(id, businessId),
    queryFn: () => getCustomer(id, businessId),
  });
}

export function useCreateCustomer(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (input: CustomerInput) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageCustomers");
      return createCustomer(input, businessId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    },
  });
}

export function useUpdateCustomer(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CustomerInput>;
    }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageCustomers");
      return updateCustomer(id, input, businessId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    },
  });
}

export type { Customer };
