import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  queryCustomers,
  updateCustomer,
  type CustomerInput,
  type CustomerListParams,
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

/**
 * S-28 list view: search, filter, sort and paging live in the URL and
 * flow through as params. Params are part of the query key so back and
 * forward restore the exact cached view. `options.enabled` lets a
 * conditionally-visible consumer (the command palette) skip the fetch
 * until it is actually shown.
 */
export function useCustomerList(
  businessId: string,
  params: CustomerListParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...customerKeys.pagedList(businessId), params],
    queryFn: () => queryCustomers(businessId, params),
    enabled: businessId !== "" && (options?.enabled ?? true),
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
