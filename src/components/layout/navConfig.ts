import {
  ArrowLeftRight,
  FileUp,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { paths } from "@/lib/paths";

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

// Navigation is configuration: one array with a visible predicate, built
// from the businessId in the URL (S-17) — the URL is the single source of
// truth. Without a businessId (e.g. My businesses for a user who belongs
// nowhere yet) there are no in-business links to show. S-38 adds the
// first ROLE-gated item: Import is hidden unless the caller may import
// (Owner/Editor) — `options.canImport` defaults to false so the bare
// call keeps the everyone-see's-five contract.
export function buildNavItems(
  businessId: string | null,
  options?: { canImport?: boolean },
): NavItem[] {
  const scoped = businessId !== null;
  return [
    {
      path: paths.business(businessId ?? ""),
      label: "Dashboard",
      icon: LayoutDashboard,
      visible: scoped,
    },
    {
      path: paths.customers(businessId ?? ""),
      label: "Customers",
      icon: Users,
      visible: scoped,
    },
    {
      path: paths.transactions(businessId ?? ""),
      label: "Transactions",
      icon: ArrowLeftRight,
      visible: scoped,
    },
    {
      path: paths.members(businessId ?? ""),
      label: "Members",
      icon: UserCog,
      visible: scoped,
    },
    {
      path: paths.importCustomers(businessId ?? ""),
      label: "Import",
      icon: FileUp,
      visible: scoped && (options?.canImport ?? false),
    },
    {
      path: paths.settings(businessId ?? ""),
      label: "Settings",
      icon: Settings,
      visible: scoped,
    },
  ];
}
