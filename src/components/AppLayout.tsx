import { useCallback, useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Plus, Sun, Moon, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { QuickAddTransactionSheet } from "@/components/QuickAddTransactionSheet";

export function AppLayout() {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // signOut errors are non-critical; Supabase clears the local session regardless
    }
  }, [signOut]);

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/customers", label: "Customers" },
    { path: "/transactions", label: "Transactions" },
  ];

  const isDark = theme === "dark";

  const handleNavClick = useCallback(
    (path: string) => {
      navigate(path);
      setDrawerOpen(false);
    },
    [navigate],
  );

  // Close drawer on route change (covers browser back/forward)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

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

          {/* Desktop nav — hidden below sm */}
          <nav className="hidden items-center gap-1 sm:flex">
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

          <div className="flex items-center gap-2">
            {/* Theme toggle — always visible */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="transition-opacity duration-150"
            >
              {isDark ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>

            {/* Add Transaction — desktop (label) / mobile (icon) */}
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

            {/* Desktop-only: email + sign out */}
            {user?.email && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-block"
            >
              Sign out
            </button>

            {/* Hamburger — mobile only */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(true)}
              className="sm:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="flex flex-col gap-1 pt-6">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNavClick(item.path)}
                className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-border pt-4">
            {user?.email && (
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                void handleSignOut();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>

      <QuickAddTransactionSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
