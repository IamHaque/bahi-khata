type BusinessScope = [string, string] | [];

function scope(businessId?: string): BusinessScope {
  return businessId ? ["business", businessId] : [];
}

export const customerKeys = {
  all: (businessId?: string) => [...scope(businessId), "customers"],
  list: (businessId?: string) => [...customerKeys.all(businessId), "list"],
  detail: (id: string, businessId?: string) => [
    ...customerKeys.all(businessId),
    id,
  ],
  balances: (businessId?: string) => [
    ...customerKeys.all(businessId),
    "balances",
  ],
  balance: (id: string, businessId?: string) => [
    ...customerKeys.balances(businessId),
    id,
  ],
};

export const transactionKeys = {
  all: (businessId?: string) => [...scope(businessId), "transactions"],
  list: (businessId?: string) => [
    ...transactionKeys.all(businessId),
    "list",
  ],
  detail: (id: string, businessId?: string) => [
    ...transactionKeys.all(businessId),
    id,
  ],
  byCustomer: (customerId: string, businessId?: string) => [
    ...transactionKeys.all(businessId),
    "customer",
    customerId,
  ],
  today: (businessId?: string) => [
    ...transactionKeys.all(businessId),
    "today",
  ],
  todayList: (limit: number, businessId?: string) => [
    ...transactionKeys.today(businessId),
    "list",
    limit,
  ],
  summary: (businessId: string) => [
    ...transactionKeys.all(businessId),
    "summary",
  ],
};

// User-level (not business-scoped): how the app discovers businesses.
export const businessKeys = {
  memberships: () => ["memberships"] as const,
  detail: (businessId: string) => ["businessDetail", businessId] as const,
};
