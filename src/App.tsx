import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/queryClient";
import { paths, routePatterns } from "@/lib/paths";
import { UiGallery } from "@/features/dev/UiGallery";
import { LandingResolver } from "@/features/business/pages/LandingResolver";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { BusinessGuard } from "@/features/business/components/BusinessGuard";
import { LegacyBusinessRedirect } from "@/features/business/components/LegacyBusinessRedirect";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { ImportPage } from "@/features/import-export/pages/ImportPage";
import { StatementPage } from "@/features/import-export/pages/StatementPage";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";
import { CreateBusinessPage } from "@/features/business/pages/CreateBusinessPage";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BusinessProvider>
            <BrowserRouter>
              <ErrorBoundary>
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
                      </Route>
                    </Route>
                  </Route>
                </Routes>
              </ErrorBoundary>
            </BrowserRouter>
          </BusinessProvider>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
