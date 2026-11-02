import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { expectNoSeriousViolations } from "@/test/a11y";
import { TransactionHistory } from "../components/TransactionHistory";
import { EditedBadge } from "../components/EditedBadge";
import { setHistoryStartDate } from "../historyStart";
import * as api from "../api";
import type { TransactionRevision, TransactionDetail } from "../api";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

const mockTransaction: TransactionDetail = {
  id: "tx-123",
  customer_id: "cust-1",
  customer_name: "Asha Verma",
  customer_phone: "9876543210",
  type: "charge",
  amount: 1200,
  status: "active",
  occurred_at: "2026-10-15T10:00:00.000Z",
  created_at: "2026-10-15T10:00:00.000Z",
  updated_at: "2026-10-15T10:00:00.000Z",
  created_by: "user-1",
  creator_name: "Ollie Creator",
  source: "manual",
  note: null,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delay={0} closeDelay={0}>
          {ui}
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("TransactionHistory (S-72)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    setHistoryStartDate(null);
  });

  it("renders timeline for each action: edit, void, restore, plus initial record", async () => {
    const revisions: TransactionRevision[] = [
      {
        id: "rev-3",
        action: "restore",
        changes: {},
        reason: null,
        changed_at: "2026-12-02T12:00:00.000Z",
        changed_by: "user-2",
        actor_name: "Eli Editor",
      },
      {
        id: "rev-2",
        action: "void",
        changes: {},
        reason: "wrong entry",
        changed_at: "2026-12-02T11:00:00.000Z",
        changed_by: "user-2",
        actor_name: "Eli Editor",
      },
      {
        id: "rev-1",
        action: "edit",
        changes: {
          amount: { from: 1000, to: 1200 },
          note: { from: null, to: "added note" },
        },
        reason: null,
        changed_at: "2026-12-02T10:00:00.000Z",
        changed_by: "user-2",
        actor_name: "Eli Editor",
      },
    ];

    renderWithProviders(
      <TransactionHistory
        businessId="biz-1"
        transaction={mockTransaction}
        revisionsOverride={revisions}
      />,
    );

    // Initial item at the bottom
    expect(screen.getByText(/Recorded by/)).toBeTruthy();
    expect(screen.getByText("Ollie Creator")).toBeTruthy();

    // Revisions
    expect(screen.getByText("Restored")).toBeTruthy();
    expect(screen.getByText("Voided: wrong entry")).toBeTruthy();
    expect(screen.getByText(/Changed amount/)).toBeTruthy();
    expect(screen.getByText("Changed note")).toBeTruthy();
  });

  it("renders empty history message when no revisions exist", async () => {
    renderWithProviders(
      <TransactionHistory
        businessId="biz-1"
        transaction={mockTransaction}
        revisionsOverride={[]}
      />,
    );

    expect(screen.getByText("No changes recorded")).toBeTruthy();
  });

  it("renders error state with retry on fetch failure", async () => {
    vi.spyOn(api, "getTransactionHistory").mockRejectedValue(
      new Error("Network error loading revisions"),
    );

    renderWithProviders(
      <TransactionHistory
        businessId="biz-1"
        transaction={mockTransaction}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toBeTruthy();
    expect(screen.getByText("Network error loading revisions")).toBeTruthy();

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeTruthy();
  });

  it("passes axe accessibility tests", async () => {
    vi.useRealTimers();
    const revisions: TransactionRevision[] = [
      {
        id: "rev-1",
        action: "edit",
        changes: { amount: { from: 500, to: 600 } },
        reason: null,
        changed_at: "2026-12-02T10:00:00.000Z",
        changed_by: "user-2",
        actor_name: "Eli Editor",
      },
    ];

    const { container } = renderWithProviders(
      <TransactionHistory
        businessId="biz-1"
        transaction={mockTransaction}
        revisionsOverride={revisions}
      />,
    );

    await expectNoSeriousViolations(container);
  });
});

describe("EditedBadge (S-72)", () => {
  it("links to #history with businessId and transactionId", () => {
    renderWithProviders(
      <EditedBadge
        editorName="Eli"
        updatedAt="2026-12-05T10:00:00.000Z"
        businessId="biz-1"
        transactionId="tx-1"
      />,
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/b/biz-1/transactions/tx-1#history");
    expect(link.textContent).toContain("Edited");
    expect(link.textContent).toContain("Edited by Eli");
  });

  it("shows '(earlier changes were not recorded)' for edits before migration date", () => {
    setHistoryStartDate("2026-12-01T00:00:00.000Z");
    renderWithProviders(
      <EditedBadge
        editorName="Eli"
        updatedAt="2026-11-15T10:00:00.000Z"
        businessId="biz-1"
        transactionId="tx-1"
      />,
    );

    const badge = screen.getByText("Edited").closest("[title]");
    expect(badge?.textContent).toContain("(earlier changes were not recorded)");
    expect(badge?.getAttribute("title")).toBe(
      "Edited (earlier changes were not recorded)",
    );
  });
});
