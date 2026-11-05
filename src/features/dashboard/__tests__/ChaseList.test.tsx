import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expectNoSeriousViolations } from "@/test/a11y";
import { ChaseList } from "../components/ChaseList";
import { formatLastPaymentSub } from "../chase";
import { getLastPayments } from "../api";
import { supabase } from "@/lib/supabase";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("formatLastPaymentSub", () => {
  const fixedNow = new Date("2026-11-01T12:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles null / undefined / invalid timestamp as 'no payments yet'", () => {
    expect(formatLastPaymentSub(null)).toEqual({ sub: "no payments yet", days: null });
    expect(formatLastPaymentSub(undefined)).toEqual({ sub: "no payments yet", days: null });
    expect(formatLastPaymentSub("not-a-date")).toEqual({ sub: "no payments yet", days: null });
  });

  it("handles paid today (0 days)", () => {
    const today = new Date("2026-11-01T08:00:00Z").toISOString();
    expect(formatLastPaymentSub(today)).toEqual({ sub: "paid today", days: 0 });
  });

  it("handles paid yesterday (1 day)", () => {
    const yesterday = new Date("2026-10-31T08:00:00Z").toISOString();
    expect(formatLastPaymentSub(yesterday)).toEqual({ sub: "paid yesterday", days: 1 });
  });

  it("handles last paid N days ago", () => {
    const fortyOneDaysAgo = new Date(fixedNow - 41 * 86400000).toISOString();
    expect(formatLastPaymentSub(fortyOneDaysAgo)).toEqual({
      sub: "last paid 41 days ago",
      days: 41,
    });
  });
});

describe("ChaseList component (L-13 / U-07)", () => {
  const fixedNow = new Date("2026-11-01T12:00:00Z").getTime();
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderChaseList(props: React.ComponentProps<typeof ChaseList>) {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChaseList {...props} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("Scenario: Flag customers who have not paid for a month (41 days ago)", () => {
    const fortyOneDaysAgo = new Date(fixedNow - 41 * 86400000).toISOString();
    renderChaseList({
      businessId: "b1",
      customers: [{ id: "c1", name: "Mizanur Rahman", balance: 19531 }],
      lastPaymentsOverride: { c1: fortyOneDaysAgo },
    });

    expect(screen.getByText("Who to chase")).toBeTruthy();
    expect(screen.getByText("last paid 41 days ago")).toBeTruthy();
    expect(screen.getByText("40+ days")).toBeTruthy();
    expect(screen.getByText("₹19,531.00")).toBeTruthy();
  });

  it("keeps debtor balances visible on history failure and retries", async () => {
    vi.useRealTimers();
    const request = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error("Offline") })
      .mockResolvedValue({ data: [{ id: "c1", last_payment_at: null }], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ in: request }) } as unknown as ReturnType<typeof supabase.from>);
    renderChaseList({ businessId: "b1", customers: [{ id: "c1", name: "Debtor", balance: 500 }] });
    expect(await screen.findByText("Payment history unavailable")).toBeTruthy();
    expect(screen.getByText("₹500.00")).toBeTruthy();
    expect(screen.queryByText("no payments yet")).toBeNull();
    expect(screen.queryByText(/\+ days/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("no payments yet")).toBeTruthy();
  });

  it("does not report never paid while history is loading", () => {
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ in: () => new Promise(() => {}) }) } as unknown as ReturnType<typeof supabase.from>);
    renderChaseList({ businessId: "b1", customers: [{ id: "c1", name: "Debtor", balance: 500 }] });
    expect(screen.queryByText("no payments yet")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/\+ days/)).toBeNull();
  });

  it("Scenario: Recent payers are not flagged (paid yesterday)", () => {
    const yesterday = new Date("2026-10-31T12:00:00Z").toISOString();
    renderChaseList({
      businessId: "b1",
      customers: [{ id: "c2", name: "Fatema Begum", balance: 5000 }],
      lastPaymentsOverride: { c2: yesterday },
    });

    expect(screen.getByText("paid yesterday")).toBeTruthy();
    expect(screen.queryByText(/\+ days/)).toBeNull();
  });

  it("Scenario: Never paid shows 'no payments yet' and no flag", () => {
    renderChaseList({
      businessId: "b1",
      customers: [{ id: "c3", name: "New Client", balance: 3500 }],
      lastPaymentsOverride: { c3: null },
    });

    expect(screen.getByText("no payments yet")).toBeTruthy();
    expect(screen.queryByText(/\+ days/)).toBeNull();
  });

  it("Scenario: Largest first, at most five", () => {
    const debtors = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i + 1}`,
      name: `Debtor ${i + 1}`,
      balance: (8 - i) * 1000,
    }));

    renderChaseList({
      businessId: "b1",
      customers: debtors,
      lastPaymentsOverride: {},
    });

    const list = screen.getByRole("list", { name: "Who to chase" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[0]!).getByText("Debtor 1")).toBeTruthy();
    expect(within(items[4]!).getByText("Debtor 5")).toBeTruthy();
    expect(screen.queryByText("Debtor 6")).toBeNull();
  });

  it("renders 'See all customers who owe' link to Customers page with balance desc sort", () => {
    renderChaseList({
      businessId: "b1",
      customers: [{ id: "c1", name: "Debtor 1", balance: 1000 }],
      lastPaymentsOverride: {},
    });

    const link = screen.getByRole("link", { name: /see all customers who owe/i });
    expect(link.getAttribute("href")).toBe("/b/b1/customers?status=owes&sort=balance-desc");
  });

  it("renders empty state when there are no debtors", () => {
    renderChaseList({
      businessId: "b1",
      customers: [],
    });

    expect(screen.getByText("All settled — no outstanding balances.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("passes axe accessibility tests", async () => {
    vi.useRealTimers();
    const { container } = renderChaseList({
      businessId: "b1",
      customers: [{ id: "c1", name: "Mizanur Rahman", balance: 19531 }],
      lastPaymentsOverride: { c1: new Date(fixedNow - 41 * 86400000).toISOString() },
    });

    await expectNoSeriousViolations(container);
  });
});

describe("getLastPayments api function", () => {
  it("returns empty object when ids is empty without calling supabase", async () => {
    const res = await getLastPayments([]);
    expect(res).toEqual({});
  });

  it("queries customer_balances and maps rows", async () => {
    const selectMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          { id: "c1", last_payment_at: "2026-10-01T00:00:00Z" },
          { id: "c2", last_payment_at: null },
        ],
        error: null,
      }),
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: selectMock,
    } as unknown as ReturnType<typeof supabase.from>);

    const res = await getLastPayments(["c1", "c2"]);
    expect(res).toEqual({
      c1: "2026-10-01T00:00:00Z",
      c2: null,
    });
  });
});
