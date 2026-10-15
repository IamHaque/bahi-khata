import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/lib/paths";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">
          Loading...
        </p>
      </div>
    );
  }

  if (!session) {
    // Remember where the user was headed so login can return them
    // there (S-16: deep link survives login).
    return (
      <Navigate
        to={paths.login}
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
          },
        }}
      />
    );
  }

  return <Outlet />;
}
