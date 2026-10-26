import { AppError } from "@/lib/AppError";

/**
 * The permission matrix from PRD section 3 — the single source the UI
 * asks "may this role do this?" (S-21). The DATABASE remains the source
 * of truth (row-level security); this matrix only shapes what the UI
 * shows or enables. docs/UI-CONTRACT.md maps every action here to the
 * SQL test that proves the database agrees.
 */

export type PermissionRole = "owner" | "editor" | "viewer";

export const permissionActions = [
  "view",
  "export",
  "manageCustomers",
  "archiveCustomers",
  "deleteCustomer",
  "manageTransactions",
  "importTransactions",
  "manageBusiness",
  "manageMembers",
  "deleteBusiness",
  "leaveBusiness",
  // S-51 (v3 deletion flow): owner-only, matching the database's
  // delete_transaction()/restore_deleted() privileges.
  "deleteTransaction",
  "viewDeletedItems",
  "restoreDeleted",
] as const;

export type PermissionAction = (typeof permissionActions)[number];

export const permissionMatrix: Record<
  PermissionAction,
  Record<PermissionRole, boolean>
> = {
  // View business, customers, transactions, dashboard — everyone.
  view: { owner: true, editor: true, viewer: true },
  // Export CSV and print statements — everyone.
  export: { owner: true, editor: true, viewer: true },
  // Create and edit customers.
  manageCustomers: { owner: true, editor: true, viewer: false },
  // Archive and restore customers.
  archiveCustomers: { owner: true, editor: true, viewer: false },
  // Permanently delete a customer — owner only.
  deleteCustomer: { owner: true, editor: false, viewer: false },
  // Add, edit, void, restore transactions.
  manageTransactions: { owner: true, editor: true, viewer: false },
  // Import CSV history.
  importTransactions: { owner: true, editor: true, viewer: false },
  // Edit business details — owner only.
  manageBusiness: { owner: true, editor: false, viewer: false },
  // Invite, change role, remove members, revoke invitations — owner only.
  manageMembers: { owner: true, editor: false, viewer: false },
  // Delete business — owner only.
  deleteBusiness: { owner: true, editor: false, viewer: false },
  // Leave business — owner must delete instead.
  leaveBusiness: { owner: false, editor: true, viewer: true },
  // Void a transaction so it disappears from balances — owner only.
  deleteTransaction: { owner: true, editor: false, viewer: false },
  // Open the Recently deleted page — owner only.
  viewDeletedItems: { owner: true, editor: false, viewer: false },
  // Bring a deleted item back — owner only.
  restoreDeleted: { owner: true, editor: false, viewer: false },
};

/** Pure check: may `role` perform `action`? No role → no. */
export function can(
  role: PermissionRole | null | undefined,
  action: PermissionAction,
): boolean {
  if (!role) return false;
  return permissionMatrix[action][role];
}

/**
 * Guard for mutation paths (S-21: "blocked before the network"). A KNOWN
 * role that lacks the action fails fast with forbidden — the database
 * would refuse the same write anyway. An unknown role (memberships not
 * loaded) falls through to the database, which is the source of truth.
 */
export function assertCan(
  role: PermissionRole | null | undefined,
  action: PermissionAction,
): void {
  if (role && !can(role, action)) {
    throw new AppError("forbidden", "View-only access.");
  }
}
