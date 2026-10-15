import { NavLink, useParams } from "react-router-dom";
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
  // S-38: the Import link is role-gated — hidden for viewers entirely.
  const { can } = usePermissions();
  const navItems = buildNavItems(businessId ?? null, {
    canImport: can("importTransactions"),
  });

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <BusinessSwitcher collapsed={collapsed} />

      <nav
        className="flex-1 space-y-1 px-2 py-2"
        aria-label="Main navigation"
      >
        {navItems
          .filter((item) => item.visible)
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors pointer-coarse:min-h-11",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent-wash hover:text-foreground",
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
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
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <Sidebar
          collapsed={false}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
