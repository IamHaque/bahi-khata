type BusinessScope = [string, string] | [];

function scope(businessId?: string): BusinessScope {
  return businessId ? ["business", businessId] : [];
}

export const customerKeys = {
  all: (businessId?: string) => [...scope(businessId), "customers"],
  list: (businessId?: string) => [...customerKeys.all(businessId), "list"],
  // The S-28 list view: server-side search/filter/sort/paging. Separate
  // key from `list` (the unfiltered picker feed) so the two never share
  // a cache entry with different query functions.
  pagedList: (businessId?: string) => [...customerKeys.all(businessId), "paged"],
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
  // S-35: the server-side transactions page — the detailed list
  // (paged, filtered) and the rollup (summarized periods + totals
  // footer). Separate keys because the two query different shapes.
  pagedList: (businessId?: string) => [
    ...transactionKeys.all(businessId),
    "paged",
  ],
  rollup: (businessId?: string) => [
    ...transactionKeys.all(businessId),
    "rollup",
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
  impact: (businessId: string) => ["businessImpact", businessId] as const,
  // Under the ["business", id] prefix, so deleting the business (S-19)
  // removes these caches with one prefix removal.
  members: (businessId: string) =>
    ["business", businessId, "members"] as const,
  invitations: (businessId: string) =>
    ["business", businessId, "invitations"] as const,
  // User-level: the invitations addressed to the signed-in user (S-24).
  myInvitations: () => ["myInvitations"] as const,
};

// S-37: the dashboard's own reads beyond dashboard_summary — the trend
// chart's per-day aggregation and the recent-activity feed.
export const dashboardKeys = {
  daily: (businessId: string, days: number) =>
    [...scope(businessId), "dashboard", "daily", days] as const,
  feed: (businessId: string) =>
    [...scope(businessId), "dashboard", "feed"] as const,
};
