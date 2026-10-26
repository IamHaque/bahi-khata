import { describe, it, expect } from "vitest";
import {
  permissionActions,
  permissionMatrix,
  can,
  assertCan,
  type PermissionAction,
  type PermissionRole,
} from "@/lib/permissions";
import { AppError } from "@/lib/AppError";

/**
 * S-21 "One matrix": the unit test that asserts every action for
 * Owner, Editor and Viewer — the table from PRD section 3, verbatim.
 */
const prdSection3: Record<PermissionAction, Record<PermissionRole, boolean>> = {
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
  // S-51 (v3): void a transaction so it disappears from balances — owner.
  deleteTransaction: { owner: true, editor: false, viewer: false },
  // S-51: open the Recently deleted page — owner only.
  viewDeletedItems: { owner: true, editor: false, viewer: false },
  // S-51: bring a deleted item back — owner only.
  restoreDeleted: { owner: true, editor: false, viewer: false },
};

const roles: PermissionRole[] = ["owner", "editor", "viewer"];

describe("S-21 permission matrix (PRD section 3)", () => {
  it("covers exactly the actions the PRD names", () => {
    expect(Object.keys(permissionMatrix).sort()).toEqual(
      [...permissionActions].sort(),
    );
  });

  for (const action of permissionActions) {
    for (const role of roles) {
      const expected = prdSection3[action][role];
      it(`${role} ${expected ? "may" : "may NOT"} ${action}`, () => {
        expect(can(role, action)).toBe(expected);
        expect(permissionMatrix[action][role]).toBe(expected);
      });
    }
  }
});

describe("S-21 can()", () => {
  it("is false without a role (no membership, not loaded yet)", () => {
    expect(can(null, "view")).toBe(false);
    expect(can(undefined, "manageCustomers")).toBe(false);
  });
});

describe("S-21 assertCan()", () => {
  it("passes a role that has the action", () => {
    expect(() => assertCan("editor", "manageTransactions")).not.toThrow();
    expect(() => assertCan("owner", "deleteBusiness")).not.toThrow();
  });

  it("fails a known role that lacks the action with forbidden", () => {
    try {
      assertCan("viewer", "manageCustomers");
      throw new Error("expected assertCan to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("forbidden");
    }
    expect(() => assertCan("editor", "deleteCustomer")).toThrow(AppError);
  });

  it("lets an unknown role through — the database is the source of truth", () => {
    expect(() => assertCan(null, "manageBusiness")).not.toThrow();
    expect(() => assertCan(undefined, "deleteBusiness")).not.toThrow();
  });
});
