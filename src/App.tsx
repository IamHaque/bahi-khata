import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteFallback } from "@/components/app/RouteFallback";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/queryClient";
import { paths, routePatterns } from "@/lib/paths";
import { BusinessGuard } from "@/features/business/components/BusinessGuard";
import { LegacyBusinessRedirect } from "@/features/business/components/LegacyBusinessRedirect";

// S-48 - route-level code splitting. Every page loads on demand; the stable
// route chunk names (login, dashboard, ...) come from manualChunks in
// vite.config.ts, which maps each page module to its route name.
// (The PRD card says "12 pages"; grep shows 14 here - and RecentlyDeletedPage
// joins as a named chunk when S-56 lands it.)
const UiGallery = lazy(() =>
  import( "@/features/dev/UiGallery").then(
    (m) => ({ default: m.UiGallery }),
  ),
);
const LandingResolver = lazy(() =>
  import( "@/features/business/pages/LandingResolver").then(
    (m) => ({ default: m.LandingResolver }),
  ),
);
const BusinessesPage = lazy(() =>
  import( "@/features/business/pages/BusinessesPage").then(
    (m) => ({ default: m.BusinessesPage }),
  ),
);
const SettingsPage = lazy(() =>
  import( "@/features/business/pages/SettingsPage").then(
    (m) => ({ default: m.SettingsPage }),
  ),
);
const MembersPage = lazy(() =>
  import( "@/features/members/pages/MembersPage").then((m) => ({
    default: m.MembersPage,
  })),
);
const DeletedItemsPage = lazy(() =>
  import( "@/features/deleted-items/pages/DeletedItemsPage").then((m) => ({
    default: m.DeletedItemsPage,
  })),
);
const LoginPage = lazy(() =>
  import( "@/pages/Login").then((m) => ({
    default: m.LoginPage,
  })),
);
const CreateBusinessPage = lazy(() =>
  import( "@/features/business/pages/CreateBusinessPage").then(
    (m) => ({ default: m.CreateBusinessPage }),
  ),
);
const DashboardPage = lazy(() =>
  import( "@/features/dashboard/pages/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);
const CustomersPage = lazy(() =>
  import( "@/features/customers/pages/CustomersPage").then(
    (m) => ({ default: m.CustomersPage }),
  ),
);
const CustomerDetailPage = lazy(() =>
  import( "@/features/customers/pages/CustomerDetailPage").then(
    (m) => ({ default: m.CustomerDetailPage }),
  ),
);
const ImportPage = lazy(() =>
  import( "@/features/import-export/pages/ImportPage").then((m) => ({
    default: m.ImportPage,
  })),
);
const StatementPage = lazy(() =>
  import( "@/features/import-export/pages/StatementPage").then(
    (m) => ({ default: m.StatementPage }),
  ),
);
const TransactionsPage = lazy(() =>
  import( "@/features/transactions/pages/TransactionsPage").then(
    (m) => ({ default: m.TransactionsPage }),
  ),
);
const TransactionDetailPage = lazy(() =>
  import( "@/pages/TransactionDetailPage").then((m) => ({
    default: m.TransactionDetailPage,
  })),
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BusinessProvider>
            <BrowserRouter>
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                  <Route
                    path={routePatterns.login}
                    element={<LoginPage />}
                  />
                  {/* Dev-only component gallery; not registered in production builds */}
                  {import.meta.env.DEV && (
                    <Route
                      path={routePatterns.uiGallery}
                      element={<UiGallery />}
                    />
                  )}
                  <Route element={<ProtectedRoute />}>
                    {/* Onboarding sits outside the shell — no sidebar while setting up */}
                    <Route
                      path={routePatterns.onboardingBusiness}
                      element={<CreateBusinessPage />}
                    />
                    {/* v1 URLs (S-17): redirect to the same page under the
                        active business */}
                    <Route
                      path={routePatterns.legacyCustomers}
                      element={
                        <LegacyBusinessRedirect
                          to={(businessId) => paths.customers(businessId)}
                        />
                      }
                    />
                    <Route
                      path={routePatterns.legacyImport}
                      element={
                        <LegacyBusinessRedirect
                          to={(businessId) => paths.importCustomers(businessId)}
                        />
                      }
                    />
                    <Route
                      path={routePatterns.legacyCustomerDetail}
                      element={
                        <LegacyBusinessRedirect
                          to={(businessId, params) =>
                            paths.customerDetail(businessId, params.customerId ?? "")
                          }
                        />
                      }
                    />
                    <Route
                      path={routePatterns.legacyTransactions}
                      element={
                        <LegacyBusinessRedirect
                          to={(businessId) => paths.transactions(businessId)}
                        />
                      }
                    />
                    <Route
                      path={routePatterns.legacyTransactionDetail}
                      element={
                        <LegacyBusinessRedirect
                          to={(businessId, params) =>
                            paths.transactionDetail(
                              businessId,
                              params.transactionId ?? "",
                            )
                          }
                        />
                      }
                    />
                    {/* Landing resolver picks the destination; it never
                        renders the shell itself */}
                    <Route
                      path={routePatterns.root}
                      element={<LandingResolver />}
                    />
                    <Route element={<AppShell />}>
                      <Route
                        path={routePatterns.businesses}
                        element={<BusinessesPage />}
                      />
                      {/* Business data: /b/:businessId (S-17). The guard
                          blocks unknown or forbidden businesses before any
                          page (and any data call) mounts. */}
                      <Route
                        path={routePatterns.business}
                        element={<BusinessGuard />}
                      >
                        <Route index element={<DashboardPage />} />
                        <Route
                          path={routePatterns.customers}
                          element={<CustomersPage />}
                        />
                        <Route
                          path={routePatterns.importCustomers}
                          element={<ImportPage />}
                        />
                        <Route
                          path={routePatterns.customerDetail}
                          element={<CustomerDetailPage />}
                        />
                        <Route
                          path={routePatterns.statement}
                          element={<StatementPage />}
                        />
                        <Route
                          path={routePatterns.transactions}
                          element={<TransactionsPage />}
                        />
                        <Route
                          path={routePatterns.transactionDetail}
                          element={<TransactionDetailPage />}
                        />
                        <Route
                          path={routePatterns.members}
                          element={<MembersPage />}
                        />
                        <Route
                          path={routePatterns.settings}
                          element={<SettingsPage />}
                        />
                        {/* v3 (S-56): the owner's Recently deleted. The
                            page itself renders the no-access state for
                            a member who types the URL. */}
                        <Route
                          path={routePatterns.deletedItems}
                          element={<DeletedItemsPage />}
                        />
                      </Route>
                    </Route>
                  </Route>
                </Routes>
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </BusinessProvider>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
