import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/queryClient";
import { routePatterns } from "@/lib/paths";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ImportPage } from "@/pages/ImportPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Routes>
                <Route
                  path={routePatterns.login}
                  element={<LoginPage />}
                />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route
                      path={routePatterns.dashboard}
                      element={<DashboardPage />}
                    />
                    <Route
                      path={routePatterns.customers}
                      element={<CustomersPage />}
                    />
                    <Route
                      path={routePatterns.customerDetail}
                      element={<CustomerDetailPage />}
                    />
                    <Route
                      path={routePatterns.importCustomers}
                      element={<ImportPage />}
                    />
                    <Route
                      path={routePatterns.transactions}
                      element={<TransactionsPage />}
                    />
                    <Route
                      path={routePatterns.transactionDetail}
                      element={<TransactionDetailPage />}
                    />
                  </Route>
                </Route>
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
