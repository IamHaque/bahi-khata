// Every path the app navigates to lives here. Components must import from
// this module instead of writing path strings (enforced by pathsHygiene test).
//
// Business data lives under /b/:businessId (S-17): every data link is
// generated from a businessId, and the URL is the single source of truth.
// The old v1 path constants are gone; the v1 URLs survive only as route
// patterns that redirect to the same page under the active business.

export const paths = {
  root: "/",
  login: "/login",
  businesses: "/businesses",
  onboardingBusiness: "/onboarding/business",
  uiGallery: "/__ui",

  // Business-scoped pages.
  business: (businessId: string) => `/b/${businessId}`,
  customers: (businessId: string) => `/b/${businessId}/customers`,
  customerDetail: (businessId: string, customerId: string) =>
    `/b/${businessId}/customers/${customerId}`,
  statement: (businessId: string, customerId: string) =>
    `/b/${businessId}/customers/${customerId}/statement`,
  importCustomers: (businessId: string) => `/b/${businessId}/customers/import`,
  transactions: (businessId: string) => `/b/${businessId}/transactions`,
  transactionDetail: (businessId: string, transactionId: string) =>
    `/b/${businessId}/transactions/${transactionId}`,
  // These routes ship with their stories (S-22, S-18) and stay hidden in
  // the navigation until then.
  members: (businessId: string) => `/b/${businessId}/members`,
  settings: (businessId: string) => `/b/${businessId}/settings`,
  // S-51 (v3): the owner's trash page for deleted transactions/customers.
  deletedItems: (businessId: string) => `/b/${businessId}/deleted`,
} as const;

// React Router route patterns (":param" placeholders) for <Route path=...>.
export const routePatterns = {
  root: paths.root,
  login: paths.login,
  businesses: paths.businesses,
  onboardingBusiness: paths.onboardingBusiness,
  uiGallery: paths.uiGallery,
  business: "/b/:businessId",
  customers: "/b/:businessId/customers",
  importCustomers: "/b/:businessId/customers/import",
  customerDetail: "/b/:businessId/customers/:customerId",
  statement: "/b/:businessId/customers/:customerId/statement",
  transactions: "/b/:businessId/transactions",
  transactionDetail: "/b/:businessId/transactions/:transactionId",
  members: "/b/:businessId/members",
  settings: "/b/:businessId/settings",
  deletedItems: "/b/:businessId/deleted",
  // v1 URLs (S-17): each redirects to the same page under the active
  // business.
  legacyCustomers: "/customers",
  legacyImport: "/customers/import",
  legacyCustomerDetail: "/customers/:customerId",
  legacyTransactions: "/transactions",
  legacyTransactionDetail: "/transactions/:transactionId",
} as const;

export function transactionsPath(
  businessId: string,
  params?: { range?: string },
): string {
  const search = params?.range ? `?range=${params.range}` : "";
  return `${paths.transactions(businessId)}${search}`;
}
