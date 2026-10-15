import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { paths, routePatterns } from "@/lib/paths";
import { ImportPage } from "@/features/import-export/pages/ImportPage";
import type { Memberships } from "@/features/business/api";

// S-38 — the four-step CSV import: whole-file validation before
// anything is written, per-customer preview, invalid rows with number
// and reason, archived matches as errors, partial import as an explicit
// choice, one atomic RPC, and the viewer's access message.

const importApi = vi.hoisted(() => ({
  getImportCustomers: vi.fn(),
  importHistory: vi.fn(),
}));
const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({
  getAllCustomerBalances: vi.fn(),
}));

vi.mock("@/features/import-export/api", () => importApi);
vi.mock("@/features/business/api", () => businessApi);
vi.mock("@/features/transactions/api", () => transactionsApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const server = vi.hoisted(() => ({
  customers: [] as Array<{
    id: string;
    name: string;
    phone: string | null;
    archived_at: string | null;
  }>,
  balances: {} as Record<string, number>,
  result: { customers_created: 1, transactions_created: 2 },
  importError: null as Error | null,
}));

const session = {
  user: { email: "ollie@example.com" },
} as unknown as Session;

const HEADER = "customer_name,customer_phone,type,amount,date,note";

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u1",
        ownerName: "Ollie Owner",
        ownerEmail: "ollie@example.com",
        role,
        isOwner: role === "owner",
      },
    ],
    invitations: [],
  };
}

function renderPage(role: "owner" | "editor" | "viewer" = "owner") {
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor(role),
  );
  return renderApp(
    <Routes>
      <Route
        path={routePatterns.importCustomers}
        element={<ImportPage />}
      />
    </Routes>,
    { session, route: paths.importCustomers("b1") },
  );
}

// The AuthProvider gates the page behind its session check — wait for
// the upload input rather than assuming the page mounted synchronously.
async function fileInput(): Promise<HTMLInputElement> {
  return (await screen.findByLabelText(
    /Choose a CSV file/,
  )) as HTMLInputElement;
}

async function uploadLines(lines: string[], name = "history.csv") {
  await userEvent.upload(
    await fileInput(),
    new File([lines.join("\n")], name, { type: "text/csv" }),
  );
}

beforeEach(() => {
  server.customers = [
    {
      id: "c1",
      name: "Asha Verma",
      phone: "01711 111111",
      archived_at: null,
    },
    {
      id: "c2",
      name: "Bo Archer",
      phone: null,
      archived_at: "2026-01-01T00:00:00Z",
    },
  ];
  server.balances = { c1: 5000 };
  server.result = { customers_created: 1, transactions_created: 2 };
  server.importError = null;

  importApi.getImportCustomers.mockImplementation(async () => server.customers);
  importApi.importHistory.mockImplementation(async () => {
    if (server.importError) throw server.importError;
    return server.result;
  });
  transactionsApi.getAllCustomerBalances.mockImplementation(
    async () => server.balances,
  );
});

describe("ImportPage (S-38)", () => {
  it("offers a downloadable template with the expected headers", async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:test";
    });
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "Download template" }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect((await blob.text()).split("\n")[0]).toBe(HEADER);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("rejects files over 5 MB before parsing any rows", async () => {
    renderPage();
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });

    await userEvent.upload(await fileInput(), big);

    expect(
      await screen.findByText(/File is too large\. The limit is 5 MB/),
    ).toBeTruthy();
    // The file is never parsed and nothing is written.
    expect(importApi.importHistory).not.toHaveBeenCalled();
    expect(screen.queryByText("Per-customer summary")).toBeNull();
  });

  it("rejects files over 10,000 rows before parsing any rows", async () => {
    renderPage();
    const rows = new Array(10_001).fill("Asha,017,charge,100,2024-01-01,");

    await uploadLines([HEADER, ...rows]);

    expect(
      await screen.findByText(/File has too many rows\. The limit is/),
    ).toBeTruthy();
    // The file is never parsed and nothing is written.
    expect(importApi.importHistory).not.toHaveBeenCalled();
  });

  it("previews the file, then imports it in one scoped call (Owner)", async () => {
    renderPage();

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,1500,2024-01-15,Milk January",
      "Asha Verma,01711 111111,payment,500,2024-01-20,bKash",
      "New Person,018,charge,300,2024-02-01,",
    ]);

    // The whole file is validated before anything is written.
    expect(importApi.importHistory).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/3 valid transactions across 2 customers/),
    ).toBeTruthy();

    // Per-customer summary: de-duplicated by name plus phone (Asha's two
    // rows = one group of 2), resulting balance = current + the file's
    // delta for the existing customer, the delta for the new one.
    const summary = screen.getByRole("table", {
      name: "Per-customer summary",
    });
    expect(within(summary).getByText("Asha Verma")).toBeTruthy();
    expect(within(summary).getByText("₹6,000.00")).toBeTruthy(); // 5000 + 1000
    expect(within(summary).getByText("Existing")).toBeTruthy();
    expect(within(summary).getByText("New Person")).toBeTruthy();
    expect(within(summary).getByText("₹300.00")).toBeTruthy();
    expect(within(summary).getByText("New")).toBeTruthy();

    // The commit is one explicit choice with the count in its label.
    await userEvent.click(
      screen.getByRole("button", { name: "Import 3 valid transactions" }),
    );

    expect(importApi.importHistory).toHaveBeenCalledTimes(1);
    const [businessId, plan] = importApi.importHistory.mock.calls[0]! as [
      string,
      {
        customers: Array<{ name: string; phone: string }>;
        transactions: Array<Record<string, unknown>>;
      },
    ];
    expect(businessId).toBe("b1");
    // Only the NEW customer is sent; matches resolve server-side.
    expect(plan.customers).toEqual([{ name: "New Person", phone: "018" }]);
    expect(plan.transactions).toHaveLength(3);
    // Historical dates and notes preserved as-is.
    expect(plan.transactions[0]).toEqual({
      customer_name: "Asha Verma",
      customer_phone: "01711 111111",
      type: "charge",
      amount: 1500,
      occurred_at: new Date(2024, 0, 15).toISOString(),
      note: "Milk January",
    });

    // Done reports the RPC's own counts.
    expect(await screen.findByText("Import complete")).toBeTruthy();
    expect(screen.getByText("Imported 2 transactions.")).toBeTruthy();
    expect(screen.getByText("Created 1 new customers.")).toBeTruthy();
  });

  it("lists invalid rows with number and reason; partial import is an explicit choice", async () => {
    renderPage();

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,1500,2024-01-15,",
      ",017,charge,100,2024-01-01,", // row 3: no name
      "Rahim,,transfer,50,2024-01-02,", // row 4: bad type
    ]);

    expect(
      await screen.findByText(
        /1 valid transactions across 1 customers\. 2 row\(s\) have errors and will be skipped\./,
      ),
    ).toBeTruthy();

    const errors = screen.getByRole("table", { name: "Rows with errors" });
    const errorRows = within(errors).getAllByRole("row");
    expect(errorRows).toHaveLength(3); // header + the two bad rows
    expect(within(errors).getByText("3")).toBeTruthy();
    expect(
      within(errors).getByText("Customer name is required"),
    ).toBeTruthy();
    expect(within(errors).getByText("4")).toBeTruthy();
    expect(within(errors).getByText(/Invalid type "transfer"/)).toBeTruthy();

    // The choice says how many valid rows would go in.
    await userEvent.click(
      screen.getByRole("button", { name: "Import 1 valid transactions" }),
    );
    const [, plan] = importApi.importHistory.mock.calls[0]! as [
      string,
      { customers: unknown[]; transactions: unknown[] },
    ];
    expect(plan.transactions).toHaveLength(1);
    expect(plan.customers).toEqual([]); // Asha already exists

    // Partial import is reported as partial success.
    expect(await screen.findByText("Partial import complete")).toBeTruthy();
    expect(
      screen.getByText("2 row(s) were skipped due to errors."),
    ).toBeTruthy();
  });

  it("reports a row matching an archived customer with the pinned reason", async () => {
    renderPage();

    await uploadLines([
      HEADER,
      "Bo Archer,,charge,100,2024-01-01,",
      "Asha Verma,01711 111111,charge,100,2024-01-02,",
    ]);

    const errors = await screen.findByRole("table", {
      name: "Rows with errors",
    });
    expect(
      within(errors).getByText("Customer is archived. Restore them first."),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 valid transactions across 1 customers\. 1 row\(s\) have errors/),
    ).toBeTruthy();
    expect(importApi.importHistory).not.toHaveBeenCalled();
  });

  it("offers no import when every row is invalid", async () => {
    renderPage();

    await uploadLines([HEADER, "Rahim,,transfer,50,2024-01-02,"]);

    expect(
      await screen.findByText(
        "Nothing to import — fix the rows above and upload the file again.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Import \d+ valid transactions/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose another file" }),
    ).toBeTruthy();
  });

  it("a failed import rolls everything back and the retry can succeed", async () => {
    renderPage();
    server.importError = new Error(
      "Customer is archived. Restore them first.",
    );

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,100,2024-01-02,",
    ]);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Import 1 valid transactions",
      }),
    );

    expect(
      await screen.findByText(
        /Customer is archived\. Restore them first\. — nothing was imported; the whole file was rolled back\./,
      ),
    ).toBeTruthy();

    server.importError = null;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Import complete")).toBeTruthy();
  });

  it("refuses the preview when the business's customers cannot be read", async () => {
    renderPage();
    importApi.getImportCustomers.mockImplementation(async () => {
      throw new Error("connection lost");
    });

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,100,2024-01-02,",
    ]);

    expect(
      await screen.findByText(
        /Could not read this business's current customers/,
      ),
    ).toBeTruthy();
    expect(importApi.importHistory).not.toHaveBeenCalled();
  });

  it("shows only the access message for a viewer", async () => {
    renderPage("viewer");

    expect(
      await screen.findByText("Import needs Editor or Owner access"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Download template" }),
    ).toBeNull();
    expect(document.getElementById("import-file")).toBeNull();
    expect(screen.queryByText("Choose a CSV file")).toBeNull();
  });

  it("lets an Editor through the same flow", async () => {
    renderPage("editor");

    expect(
      await screen.findByRole("button", { name: "Download template" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("Import needs Editor or Owner access"),
    ).toBeNull();

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,100,2024-01-02,",
    ]);
    expect(
      await screen.findByText(/1 valid transactions across 1 customers\./),
    ).toBeTruthy();
  });

  it("the Done step starts another file from scratch", async () => {
    renderPage();

    await uploadLines([
      HEADER,
      "Asha Verma,01711 111111,charge,100,2024-01-02,",
    ]);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Import 1 valid transactions",
      }),
    );
    expect(await screen.findByText("Import complete")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Import another file" }),
    );
    expect(await screen.findByText("Choose a CSV file")).toBeTruthy();
  });
});
