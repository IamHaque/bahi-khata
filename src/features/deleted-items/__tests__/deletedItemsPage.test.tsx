import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { DeletedItemsPage } from "../pages/DeletedItemsPage";
import { formatRelative } from "@/lib/format";
import { AppError } from "@/lib/AppError";
import type { Memberships } from "@/features/business/api";
import type { DeletionLogEntry } from "../api";

// v3 (S-56) — the owner's Recently deleted page: newest-first log,
// per-row Restore with its own spinner, the database's message on a
// conflict, filters in the query string, and no access for anyone else.

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const deletedApi = vi.hoisted(() => ({
  listDeletionLog: vi.fn(),
  restoreDeleted: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
vi.mock("../api", () => deletedApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u1",
        ownerName: "Asha Verma",
        ownerEmail: "asha@example.com",
        role,
        isOwner: role === "owner",
      },
    ],
    invitations: [],
  };
}

const customerEntry: DeletionLogEntry = {
  id: "log-1",
  business_id: "b1",
  entity_type: "customer",
  entity_id: "c1",
  label: "Rahim Uddin",
  summary: { transaction_count: 3, balance: 45000 },
  reason: "duplicate",
  deleted_by: "u1",
  deleted_by_name: "Asha Verma",
  deleted_at: "2026-10-20T10:00:00+00:00",
  restored_at: null,
  restored_by: null,
  restored_by_name: null,
};

const transactionEntry: DeletionLogEntry = {
  id: "log-2",
  business_id: "b1",
  entity_type: "transaction",
  entity_id: "t1",
  label: "Charge ₹500.00 · Rahim Uddin",
  summary: { amount: 50000, type: "charge", customer_name: "Rahim Uddin" },
  reason: null,
  deleted_by: "u1",
  deleted_by_name: "Asha Verma",
  deleted_at: "2026-10-21T09:00:00+00:00",
  restored_at: null,
  restored_by: null,
  restored_by_name: null,
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderPage() {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/b/:businessId/deleted" element={<DeletedItemsPage />} />
      </Routes>
    </>,
    { session, route: "/b/b1/deleted" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  deletedApi.listDeletionLog.mockResolvedValue([]);
  deletedApi.restoreDeleted.mockResolvedValue({ status: "ok", restored: 1 });
});

describe("S-56 Recently deleted page", () => {
  it("shows what was deleted, newest first, with who deleted it, when, and why", async () => {
    deletedApi.listDeletionLog.mockResolvedValue([
      transactionEntry,
      customerEntry,
    ]);
    renderPage();

    // Wait for DATA, not the first table (the skeleton is a table too).
    await screen.findByText("Charge ₹500.00 · Rahim Uddin");
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // header first
    expect(rows).toHaveLength(2);
    // Newest first: the transaction (21 Oct) above the customer (20 Oct).
    expect(within(rows[0]!).getByText("Charge ₹500.00 · Rahim Uddin")).toBeTruthy();
    expect(within(rows[1]!).getByText("Rahim Uddin")).toBeTruthy();

    const customerRow = rows[1]!;
    within(customerRow).getByText("Customer");
    within(customerRow).getByText("Asha Verma");
    within(customerRow).getByText(formatRelative("2026-10-20T10:00:00+00:00"));
    within(customerRow).getByText("duplicate");
    // The customer row carries its secondary line.
    within(customerRow).getByText("3 transactions");
    within(customerRow).getByRole("button", { name: /Restore/ });
    // No reason on the transaction row → an em dash.
    within(rows[0]!).getByText("—");
  });

  it("Restore spins only that row's button, toasts the label, and the row leaves", async () => {
    deletedApi.listDeletionLog.mockResolvedValueOnce([customerEntry]);
    renderPage();
    await screen.findByText("Rahim Uddin");

    // A restore in flight: resolve it only when we say so.
    let finish: (value: unknown) => void = () => {};
    deletedApi.restoreDeleted.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const row = screen.getByText("Rahim Uddin").closest("tr")!;
    const button = within(row).getByRole("button", { name: /Restore/ });
    await userEvent.click(button);

    // Did the mutation start at all? (onMutate runs before mutationFn.)
    await waitFor(() =>
      expect(deletedApi.restoreDeleted).toHaveBeenCalledWith("log-1"),
    );
    // No jest-dom matchers in this repo — read the property directly.
    // Re-query inside waitFor: a re-render may have replaced the node.
    await waitFor(() => {
      const currentRow = screen.getByText("Rahim Uddin").closest("tr")!;
      const current = within(currentRow).getByRole("button", {
        name: /Restore/,
      }) as HTMLButtonElement;
      expect(current.disabled).toBe(true);
    });

    // The invalidation refetches the log; this time it comes back empty.
    deletedApi.listDeletionLog.mockResolvedValueOnce([]);
    finish({ status: "ok", restored: 4 });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Rahim Uddin restored"),
    );
    await waitFor(() => expect(screen.queryByText("Rahim Uddin")).toBeNull());
  });

  it("a transaction that needs its customer first shows the database's message and the row stays", async () => {
    deletedApi.listDeletionLog.mockResolvedValue([transactionEntry]);
    deletedApi.restoreDeleted.mockRejectedValue(
      new AppError("conflict", "Restore the customer first."),
    );
    renderPage();
    await screen.findByText("Charge ₹500.00 · Rahim Uddin");

    const row = screen.getByText("Charge ₹500.00 · Rahim Uddin").closest("tr")!;
    await userEvent.click(
      within(row).getByRole("button", { name: /Restore/ }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Restore the customer first."),
    );
    // The row is still there, button usable again.
    expect(
      (
        within(row).getByRole("button", { name: /Restore/ }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("hides restored rows unless Show restored is on, then shows them muted without a button", async () => {
    const restored: DeletionLogEntry = {
      ...customerEntry,
      restored_at: "2026-10-22T08:00:00+00:00",
      restored_by: "u2",
      restored_by_name: "Karim Editor",
    };
    deletedApi.listDeletionLog.mockImplementation(
      async (_businessId: string, opts?: { restored?: string }) =>
        opts?.restored === "include" ? [restored, transactionEntry] : [transactionEntry],
    );
    renderPage();
    await screen.findByText("Charge ₹500.00 · Rahim Uddin");
    // Default: excluded (the hook passed the default filter).
    await waitFor(() =>
      expect(deletedApi.listDeletionLog).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ restored: "exclude" }),
      ),
    );
    expect(screen.queryByText("Rahim Uddin")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show restored" }));

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain("restored=1"),
    );
    await waitFor(() =>
      expect(deletedApi.listDeletionLog).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ restored: "include" }),
      ),
    );
    const row = (await screen.findByText("Rahim Uddin")).closest("tr")!;
    within(row).getByText(
      `Restored ${formatRelative("2026-10-22T08:00:00+00:00")} by Karim Editor`,
    );
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("filters by type through the query string", async () => {
    deletedApi.listDeletionLog.mockResolvedValue([customerEntry]);
    renderPage();
    await screen.findByText("Rahim Uddin");

    await userEvent.click(screen.getByRole("tab", { name: "Customers" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain("type=customer"),
    );
    await waitFor(() =>
      expect(deletedApi.listDeletionLog).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ entityType: "customer" }),
      ),
    );

    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).not.toContain("type="),
    );
  });

  it("an Editor typing the URL sees the no-access state and no log is fetched", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    renderPage();

    await screen.findByText("You don't have access");
    screen.getByText("Only owners can see and restore deleted items.");
    expect(deletedApi.listDeletionLog).not.toHaveBeenCalled();
  });

  it("an empty log shows Nothing deleted with its explanation", async () => {
    renderPage();
    await screen.findByText("Nothing deleted");
    screen.getByText(
      "Deleted customers and transactions appear here so you can restore them.",
    );
  });

  it("says so plainly when 200 rows is the whole story", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...customerEntry,
      id: `log-${i}`,
      label: `Customer ${i}`,
    }));
    deletedApi.listDeletionLog.mockResolvedValue(many);
    renderPage();
    await screen.findByText("Customer 0");
    screen.getByText("Showing the 200 most recent.");
    // The request asked for exactly that cap.
    expect(deletedApi.listDeletionLog).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ limit: 200 }),
    );
  });

  it("passes axe in the empty state and with data", async () => {
    const first = renderPage();
    await screen.findByText("Nothing deleted");
    await expectNoSeriousViolations(first.container);
    first.unmount();

    deletedApi.listDeletionLog.mockResolvedValue([customerEntry, transactionEntry]);
    renderPage();
    await screen.findByText("Rahim Uddin");
    await expectNoSeriousViolations(screen.getByRole("table"));
  });
});
