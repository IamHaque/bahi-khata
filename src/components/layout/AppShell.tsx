import { useEffect, useMemo, useState } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";
import { routePatterns } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { MobileDrawer, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change (covers browser back/forward)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // L-05: the one page title, most specific route first. Every pattern
  // is matched with end:true so Import never reads as Customers and a
  // transaction detail never reads as Transactions.
  const title = useMemo(() => {
    const pathname = location.pathname;
    const is = (pattern: string) =>
      matchPath({ path: pattern, end: true }, pathname) !== null;
    if (is(routePatterns.importCustomers)) return "Import";
    if (is(routePatterns.statement)) return "Statement";
    if (is(routePatterns.customerDetail)) return "Customer";
    if (is(routePatterns.customers)) return "Customers";
    if (is(routePatterns.transactionDetail)) return "Transaction";
    if (is(routePatterns.transactions)) return "Transactions";
    if (is(routePatterns.deletedItems)) return "Recently deleted";
    if (is(routePatterns.members)) return "Members";
    if (is(routePatterns.settings)) return "Settings";
    if (is(routePatterns.business)) return "Dashboard";
    if (is(routePatterns.businesses)) return "My businesses";
    return "";
  }, [location.pathname]);

  // L-05: one primary Add transaction per screen. The Dashboard and the
  // transactions list already carry it in their PageHeader, so the top
  // bar stays out of their way there.
  const showAddTransaction = !(
    matchPath({ path: routePatterns.business, end: true }, location.pathname) ||
    matchPath({ path: routePatterns.transactions, end: true }, location.pathname)
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* S-40: keyboard users reach the page content without tabbing
          through the whole sidebar. */}
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      {/* Desktop sidebar — collapses to icon rail */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 transition-[width] duration-150 lg:block print:hidden",
          // L-05: the spine is 212px wide, so the active tab's edge is
          // the main area's edge.
          collapsed ? "w-16" : "w-[212px]",
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Mobile drawer — trigger lives in the Topbar */}
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          collapsed={collapsed}
          showAddTransaction={showAddTransaction}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-8 pb-[calc(2rem_+_env(safe-area-inset-bottom))] outline-none print:max-w-none print:px-0 print:py-0"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
