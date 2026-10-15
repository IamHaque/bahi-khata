import type { ReactNode } from "react";
import { usePermissions } from "@/features/business/hooks";
import type { PermissionAction } from "@/lib/permissions";

interface CanProps {
  action: PermissionAction;
  /**
   * hide (default): nothing renders without the permission. disable:
   * the control renders dimmed, non-interactive, with the tooltip
   * "View-only access" — for affordances where a gap would confuse
   * (e.g. a row action menu). Forms and primary buttons should hide.
   */
  mode?: "hide" | "disable";
  children: ReactNode;
}

/**
 * Renders its children only when the current URL business's member may
 * perform the action (S-21, PRD 8: "every write action is wrapped in
 * Can; viewers never see a control that would fail"). The database
 * still refuses anything the UI gets wrong — this is experience, not
 * security.
 */
export function Can({ action, mode = "hide", children }: CanProps) {
  const { can } = usePermissions();

  if (can(action)) return <>{children}</>;
  if (mode === "hide") return null;

  return (
    <span
      title="View-only access"
      aria-disabled
      className="inline-flex cursor-not-allowed opacity-50 [&_button]:pointer-events-none [&_a]:pointer-events-none"
    >
      {children}
    </span>
  );
}
