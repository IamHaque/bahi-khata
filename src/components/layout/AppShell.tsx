import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { MobileDrawer, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const location = useLocation();
  const { businessId } = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change (covers browser back/forward)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const title = useMemo(() => {
    const pathname = location.pathname;
    if (pathname === paths.businesses) return "My businesses";
    if (!businessId) return "";
    if (pathname === paths.business(businessId)) return "Dashboard";
    if (pathname.startsWith(paths.customers(businessId))) return "Customers";
    if (pathname.startsWith(paths.transactions(businessId)))
      return "Transactions";
    if (pathname === paths.settings(businessId)) return "Settings";
    return "";
  }, [location.pathname, businessId]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — collapses to icon rail */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 transition-[width] duration-150 lg:block",
          collapsed ? "w-16" : "w-60",
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
          onToggleSidebar={() => setCollapsed((c) => !c)}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
