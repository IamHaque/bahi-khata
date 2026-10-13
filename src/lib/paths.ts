// Every path the app navigates to lives here. Components must import from
// this module instead of writing path strings (enforced by pathsHygiene test).

export const paths = {
  login: "/login",
  dashboard: "/",
  customers: "/customers",
  customerDetail: (id: string) => `/customers/${id}`,
  importCustomers: "/customers/import",
  transactions: "/transactions",
  transactionDetail: (id: string) => `/transactions/${id}`,
  members: "/members",
  settings: "/settings",
  uiGallery: "/__ui",
} as const;

// React Router route patterns (":id" placeholders) for <Route path=...>.
export const routePatterns = {
  login: paths.login,
  dashboard: paths.dashboard,
  customers: paths.customers,
  customerDetail: "/customers/:id",
  importCustomers: paths.importCustomers,
  transactions: paths.transactions,
  transactionDetail: "/transactions/:id",
  uiGallery: paths.uiGallery,
} as const;

export function transactionsPath(params?: { range?: string }): string {
  const search = params?.range ? `?range=${params.range}` : "";
  return `${paths.transactions}${search}`;
}
