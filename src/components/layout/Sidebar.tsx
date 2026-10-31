import { Link, matchPath, useLocation, useParams } from "react-router-dom";
import { TallyMark } from "@/components/app/TallyMark";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { buildNavItems } from "./navConfig";
import { usePermissions } from "@/features/business/hooks";

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  // Business links come from the businessId in the URL (S-17).
  const { businessId } = useParams();
  const location = useLocation();
  // S-38: the Import link is role-gated — hidden for viewers entirely.
  // S-51: Recently deleted is Owner-only, the same mechanism.
  const { can } = usePermissions();
  const navItems = buildNavItems(businessId ?? null, {
    canImport: can("importTransactions"),
    canViewDeleted: can("viewDeletedItems"),
  });

  // Most-specific match wins. NavLink's default prefix matching lights
  // up Dashboard on every `/b/:id/*` page (and Customers alongside
  // Import), so the highlighted item is the visible one whose path is
  // the longest prefix of the current location — Customers still owns
  // its detail pages, but Import is Import alone.
  const activePath = navItems
    .filter((item) => item.visible)
    .filter((item) =>
      matchPath({ path: item.path, end: false }, location.pathname),
    )
    .reduce<string | null>(
      (best, item) => (best === null || item.path.length > best.length ? item.path : best),
      null,
    );

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar py-5 pl-3 text-sidebar-foreground",
        // L-05: the spine is 212px and borderless so the active tab
        // touches the main area; the collapsed rail keeps its 64px.
        collapsed ? "w-16 pl-0" : "w-[212px]",
      )}
    >
      {/* L-05: brand row - the tally mark and the product name. */}
      <div
        className={cn(
          "mb-2 flex items-center gap-3 pl-3",
          collapsed && "justify-center pl-0",
        )}
      >
        <TallyMark className="size-7 shrink-0 text-sidebar-foreground" />
        {!collapsed && (
          <span className="font-heading text-xl font-bold text-sidebar-foreground">
            BahiKhata
          </span>
        )}
      </div>
      <BusinessSwitcher collapsed={collapsed} />

      <nav
        className="flex-1 space-y-1 py-2"
        aria-label="Main navigation"
      >
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const active = activePath === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-l-sm px-3 py-2.5 transition-colors pointer-coarse:min-h-11",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-background font-semibold text-foreground"
                    : "font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground",
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[212px] p-0">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <Sidebar
          collapsed={false}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
