import {
  ArrowLeftRight,
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

// Navigation is configuration: one array with a visible predicate.
// Members and Settings stay hidden until their stories ship (S-22, S-18).
export const navItems: NavItem[] = [
  {
    path: paths.dashboard,
    label: "Dashboard",
    icon: LayoutDashboard,
    visible: true,
  },
  {
    path: paths.customers,
    label: "Customers",
    icon: Users,
    visible: true,
  },
  {
    path: paths.transactions,
    label: "Transactions",
    icon: ArrowLeftRight,
    visible: true,
  },
  {
    path: paths.members,
    label: "Members",
    icon: UserCog,
    visible: false,
  },
  {
    path: paths.settings,
    label: "Settings",
    icon: Settings,
    visible: false,
  },
];
