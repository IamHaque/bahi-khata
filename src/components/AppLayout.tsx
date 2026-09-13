import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { QuickAddTransactionSheet } from "@/components/QuickAddTransactionSheet";

export function AppLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // signOut errors are non-critical; Supabase clears the local session regardless
    }
  };

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/customers", label: "Customers" },
    { path: "/transactions", label: "Transactions" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            BahiKhata
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  location.pathname === item.path
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickAddOpen(true)}
              className="hidden sm:flex"
            >
              <Plus className="mr-1 size-4" />
              Add Transaction
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuickAddOpen(true)}
              className="sm:hidden"
              aria-label="Add Transaction"
            >
              <Plus className="size-4" />
            </Button>
            {user?.email && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>

      <QuickAddTransactionSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
