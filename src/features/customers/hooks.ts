import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customerKeys,
  dashboardKeys,
  transactionKeys,
} from "@/lib/queryKeys";
import { usePermissions } from "@/features/business/hooks";
import {
  countCustomerTransactions,
  createCustomer,
  deleteCustomerPermanently,
  getCustomer,
  listCustomers,
  queryCustomers,
  setCustomerArchived,
  updateCustomer,
  type CustomerInput,
  type CustomerListParams,
} from "./api";
import type { Customer } from "@/types";

// S-20 contract: every query and mutation carries a businessId. Omitting
// it is a TypeScript error, not a silent unscoped fallback.

// One invalidation rule for every customer-changing mutation: the
// customer caches (lists, detail, balances strip), the transaction
// caches (the summary's customer_count and top_debtors live under
// transactionKeys.all) and the dashboard's own surfaces (trend chart
// + activity feed, keyed under dashboardKeys).
function useCustomerInvalidation(businessId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: transactionKeys.all(businessId) });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all(businessId) });
  };
}

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
  const invalidate = useCustomerInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: (input: CustomerInput) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("manageCustomers");
      return createCustomer(input, businessId);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCustomer(businessId: string) {
  const invalidate = useCustomerInvalidation(businessId);
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
    onSuccess: invalidate,
  });
}

/**
 * S-30 — archive and restore are one mutation (the difference is a
 * timestamp or its absence). Both roles that may archive may restore;
 * a viewer fails on assertCan before the network. Success refreshes
 * every customer cache (lists, detail, the balances strip) plus the
 * transaction and dashboard caches — the summary's SQL excludes
 * archived customers, and so do the trend chart and activity feed.
 */
export function useSetCustomerArchived(businessId: string) {
  const invalidate = useCustomerInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => {
      // S-21: a known viewer fails here, before the network.
      assertCan("archiveCustomers");
      return setCustomerArchived(id, archived, businessId);
    },
    onSuccess: invalidate,
  });
}

/**
 * S-30 — the owner's atomic destroy. Keyed like the other customer
 * mutations; success also drops every transaction and dashboard
 * cache, because the customer's transactions are gone with them.
 */
export function useDeleteCustomerPermanently(businessId: string) {
  const invalidate = useCustomerInvalidation(businessId);
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => {
      // S-21: a non-owner fails here; the RPC refuses them again.
      assertCan("deleteCustomer");
      return deleteCustomerPermanently(id, businessId);
    },
    onSuccess: invalidate,
  });
}

/**
 * S-30 — exact transaction count for the confirm dialogs' copy
 * ("12 transactions are kept" / "all 12 transactions are removed").
 * The count shares the customer's cache family, so a customer mutation
 * refreshes it along with everything else.
 */
export function useCustomerTransactionCount(
  customerId: string,
  businessId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...customerKeys.detail(customerId, businessId), "txCount"],
    queryFn: () => countCustomerTransactions(customerId, businessId),
    enabled: enabled && customerId !== "",
  });
}

export type { Customer };
