import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { AppShell } from "@/components/layout/AppShell";
import { EntityDialog } from "@/components/app/EntityDialog";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";
import type {
  CustomerListResult,
  CustomerListRow,
} from "@/features/customers/api";

// S-41 — responsive pass: the structural half of the evidence.
//
// scripts/responsive-audit.cjs measures REAL layout against the running
// dev server (scrollWidth vs. viewport, truncated ₹ amounts, per-route
// content markers) at 360/768/1024/1440. This suite pins the structural
// decisions behind those numbers in jsdom: breakpoint tokens on the
// shell, the table→card swap on narrow screens, sheets that slide in
// from an edge, safe-area padding, and a source scan that keeps fixed
// pixel widths at or below the 360px audit floor.

vi.setConfig({ testTimeout: 30000 });

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  createBusiness: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  businessExists: vi.fn(),
}));
const customersApi = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  queryCustomers: vi.fn(),
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
  deleteCustomerPermanently: vi.fn(),
  countCustomerTransactions: vi.fn(),
}));
const transactionsApi = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  getAllCustomerBalances: vi.fn(),
  queryTransactions: vi.fn(),
  transactionRollup: vi.fn(),
  getCustomerBalance: vi.fn(),
  getCustomerLedger: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
const importExportWriters = vi.hoisted(() => ({
  exportCustomersCsv: vi.fn(),
  exportTransactionsCsv: vi.fn(),
  downloadBusinessBackup: vi.fn(),
}));

// The full export surface of each module (see the axePages suite) —
// every name a rendered component may import resolves to a mock.
vi.mock("@/features/business/api", () => ({ ...businessApi }));
vi.mock("@/features/customers/api", () => ({ ...customersApi }));
vi.mock("@/features/transactions/api", () => ({ ...transactionsApi }));
vi.mock("@/features/import-export/exports", () => importExportWriters);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "viewer"): Memberships {
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

function listRow(overrides: Partial<CustomerListRow>): CustomerListRow {
  return {
    id: "c1",
    name: "Asha",
    phone: "01711 111111",
    email: null,
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: null,
    notes: null,
    created_at: "2026-01-05T00:00:00+00:00",
    updated_at: "2026-01-05T00:00:00+00:00",
    balance: 0,
    last_activity: null,
    archived_at: null,
    ...overrides,
  };
}

const twoCustomers: CustomerListRow[] = [
  listRow({ id: "c1", name: "Asha", balance: 500 }),
  listRow({
    id: "c2",
    name: "Rahim",
    phone: "01712 222222",
    balance: -200,
  }),
];

function result(): CustomerListResult {
  return { items: twoCustomers, total: 2, allTotal: 2 };
}

// The shell renders inside /b/:businessId (S-17) — same harness as
// appShell.test.tsx; no API mocks are needed for the shell itself.
function renderShell() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<AppShell />}>
        <Route index element={<div>page</div>} />
        <Route path="customers" element={<div>customers</div>} />
        <Route path="transactions" element={<div>transactions</div>} />
      </Route>
    </Routes>,
    { session, route: "/b/biz1" },
  );
}

/**
 * A real EntityDialog opened from a real trigger button — the harness
 * from focus.test.tsx, reused to pin the sheet side on narrow screens.
 */
function DialogHarness({ triggerLabel }: { triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title="Add Customer"
        schema={z.object({ name: z.string().min(1) })}
        defaultValues={{ name: "" }}
        submitLabel="Save customer"
        onSubmit={() => {}}
      >
        <input aria-label="Name" defaultValue="" />
      </EntityDialog>
    </>
  );
}

/** Every .ts/.tsx file under src except test files and __tests__ dirs. */
function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

beforeEach(() => {
  vi.clearAllMocks();
  __setMatchMedia(false);

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  customersApi.queryCustomers.mockImplementation(async () => result());
  transactionsApi.getAllCustomerBalances.mockImplementation(async () => ({
    c1: 500,
    c2: -200,
  }));
});

describe("S-41 responsive pass", () => {
  describe("navigation breakpoints", () => {
    it("the desktop sidebar is hidden below lg while the hamburger is lg:hidden", () => {
      const { container } = renderShell();

      // Desktop sidebar: display:none until the lg breakpoint, then a
      // block-level rail (S-41 — no sidebar can eat the 360px viewport).
      const aside = container.querySelector("aside");
      expect(aside).toBeTruthy();
      const asideTokens = (aside as HTMLElement).className.split(/\s+/);
      expect(asideTokens).toContain("hidden");
      expect(asideTokens).toContain("lg:block");

      // The hamburger exists only below lg; the desktop collapse
      // control is its exact mirror (hidden … lg:block).
      const hamburger = screen.getByRole("button", { name: "Open menu" });
      expect(hamburger.className.split(/\s+/)).toContain("lg:hidden");

      const collapse = screen.getByRole("button", {
        name: "Collapse sidebar",
      });
      const collapseTokens = collapse.className.split(/\s+/);
      expect(collapseTokens).toContain("hidden");
      expect(collapseTokens).toContain("lg:block");
    });

    it("the hamburger opens the navigation sheet from the left edge", async () => {
      renderShell();

      await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

      // The drawer is the shared Sheet primitive anchored left — the
      // mobile mirror of the sidebar (S-41).
      const drawer = await screen.findByRole("dialog");
      expect(drawer.getAttribute("data-slot")).toBe("sheet-content");
      expect(drawer.getAttribute("data-side")).toBe("left");
      expect(drawer.textContent).toContain("Navigation menu");
      expect(
        within(drawer).getByRole("navigation", { name: "Main navigation" }),
      ).toBeTruthy();
    });
  });

  it("narrow screens render customers as cards, not the shared table", async () => {
    // (max-width: …) matches → the DataTable swaps rows for cards.
    __setMatchMedia(true);
    try {
      renderApp(
        <Routes>
          <Route path={routePatterns.customers} element={<CustomersPage />} />
          <Route
            path={`${routePatterns.customers}/:customerId`}
            element={<div>customer detail</div>}
          />
        </Routes>,
        { session, route: paths.customers("b1") },
      );
      await screen.findByText("Everyone in this business");

      // Data arrives as a card: name, phone and the balance live as a
      // LeaderRow inside the card's own button — and no table headers
      // exist (L-08 dropped the badge for a tone amount).
      const phone = await screen.findByText("01711 111111");
      const cardButton = phone.closest("button");
      expect(cardButton).toBeTruthy();
      const card = within(cardButton as HTMLElement);
      expect(card.getByText("Asha")).toBeTruthy();
      expect(card.getByText("₹500.00").className).toContain("text-receivable");

      expect(screen.queryByRole("columnheader")).toBeNull();
      await waitFor(() =>
        expect(screen.getByText("Rahim")).toBeTruthy(),
      );
      expect(screen.queryByRole("columnheader")).toBeNull();
    } finally {
      __setMatchMedia(false);
    }
  });

  it("EntityDialog drops to a bottom sheet under (max-width: 767px)", async () => {
    __setMatchMedia(true);
    try {
      renderApp(<DialogHarness triggerLabel="Open add customer (sheet)" />, {
        session,
        route: "/b/biz1",
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Open add customer (sheet)" }),
      );

      const sheet = await screen.findByRole("dialog");
      expect(sheet.getAttribute("data-slot")).toBe("sheet-content");
      expect(sheet.getAttribute("data-side")).toBe("bottom");
    } finally {
      __setMatchMedia(false);
    }
  });

  it("the shell pads safe areas and index.html fits the visual viewport", async () => {
    const { container } = renderShell();
    await screen.findByRole("navigation", { name: "Main navigation" });

    // Live DOM: the top bar clears the notch, the main column clears
    // the home indicator (iOS gesture bars).
    const main = container.querySelector("#main-content");
    expect(main?.className ?? "").toContain("env(safe-area-inset-bottom)");
    const bar = container.querySelector("header > div");
    expect(bar?.className ?? "").toContain("env(safe-area-inset-top)");

    // index.html: the layout viewport is the device width and the
    // notches/home-indicator insets are reported (viewport-fit=cover).
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");
    expect(html).toContain("width=device-width");
    expect(html).toContain("viewport-fit=cover");
  });

  it("no fixed pixel width in src exceeds the 360px audit floor", () => {
    // Arbitrary bracket widths (w-[NNNpx], min-w-[NNNpx]) hard-code the
    // layout; anything above the audit's narrowest width (360) would
    // overflow a real phone. Spacing-scale tokens (w-64, min-w-36) and
    // caps (max-w-[…]) are deliberately out of scope.
    const auditFloor = 360;
    const srcRoot = path.resolve(__dirname, "..", "..");
    const fixedWidth = /(?<![\w-])(min-)?w-\[(\d+)px\]/g;
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(fixedWidth)) {
        if (Number(match[2]) > auditFloor) {
          offenders.push(
            `${path.relative(srcRoot, file)}: ${match[0]} > ${auditFloor}px`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
