import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ImportPage } from "@/pages/ImportPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/customers/import" element={<ImportPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                </Route>
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
