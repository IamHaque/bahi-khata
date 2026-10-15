import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  downloadBusinessBackup,
  exportCustomersCsv,
  exportTransactionsCsv,
} from "@/features/import-export/exports";
import { downloadCsv } from "@/features/import-export/csv";
import { queryCustomers } from "@/features/customers/api";
import { queryTransactions } from "@/features/transactions/api";
import type { CustomerListRow } from "@/features/customers/api";
import type { TransactionListRow } from "@/features/transactions/api";

// S-39 — every export downloads EXACTLY what the current filters match,
// never just the visible page: the reads page through the server in
// bounded chunks and report progress per page. The cell escaping is
// csv.test.ts's contract; here the exports are checked for paging,
// progress, filters and file naming.

vi.mock("@/features/customers/api", () => ({ queryCustomers: vi.fn() }));
vi.mock("@/features/transactions/api", () => ({ queryTransactions: vi.fn() }));
vi.mock("@/features/import-export/csv", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/import-export/csv")>();
  return { ...actual, downloadCsv: vi.fn() };
});

const PAGE = 500;

function customerRow(name: string): CustomerListRow {
  return {
    id: `c-${name}`,
    name,
    phone: null,
    balance: 100,
    last_activity: null,
    created_at: "2024-01-01T00:00:00.000Z",
  } as unknown as CustomerListRow;
}

function transactionRow(id: string, customerName: string): TransactionListRow {
  return {
    id,
    customer: { id: "c1", name: customerName, phone: null },
    type: "charge",
    amount: 100,
    occurred_at: "2024-01-15T00:00:00.000Z",
    note: null,
    status: "posted",
  } as unknown as TransactionListRow;
}

beforeEach(() => {
  vi.mocked(downloadCsv).mockClear();
});

describe("exportCustomersCsv (S-39)", () => {
  it("pages through the server until every matching row is fetched", async () => {
    vi.mocked(queryCustomers)
      .mockResolvedValueOnce({
        items: [customerRow("A"), customerRow("B")],
        total: 5,
        allTotal: 5,
      })
      .mockResolvedValueOnce({
        items: [customerRow("C"), customerRow("D")],
        total: 5,
        allTotal: 5,
      })
      .mockResolvedValueOnce({
        items: [customerRow("E")],
        total: 5,
        allTotal: 5,
      });

    const progress: Array<[number, number]> = [];
    await exportCustomersCsv(
      "b1",
      { search: "a", status: "all", sort: "name", dir: "asc" },
      (done, total) => progress.push([done, total]),
    );

    // Same filters every page — only the page number moves.
    const pages = vi.mocked(queryCustomers).mock.calls.map(([, params]) => params);
    expect(pages).toEqual([
      { search: "a", status: "all", sort: "name", dir: "asc", page: 1, pageSize: PAGE },
      { search: "a", status: "all", sort: "name", dir: "asc", page: 2, pageSize: PAGE },
      { search: "a", status: "all", sort: "name", dir: "asc", page: 3, pageSize: PAGE },
    ]);
    // Progress is reported per page.
    expect(progress).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);

    expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(1);
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toBe("customers.csv");
    // Header + all five customers, in fetch order.
    expect(csv.split("\n")).toHaveLength(6);
    expect(csv).toContain("A");
    expect(csv).toContain("E");
  });

  it("stops at an empty page even when a stale total claims more", async () => {
    vi.mocked(queryCustomers)
      .mockResolvedValueOnce({
        items: [customerRow("A")],
        total: 10,
        allTotal: 10,
      })
      .mockResolvedValueOnce({ items: [], total: 10, allTotal: 10 });

    await exportCustomersCsv("b1", {}, () => {});

    expect(queryCustomers).toHaveBeenCalledTimes(2);
    const [, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("downloads a header-only file when nothing matches", async () => {
    vi.mocked(queryCustomers).mockResolvedValueOnce({
      items: [],
      total: 0,
      allTotal: 0,
    });

    await exportCustomersCsv("b1", { search: "ghost" }, () => {});

    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toBe("customers.csv");
    expect(csv).toBe("name,phone,balance,last_activity,created");
  });

  it("pipes every cell through the safe-cell rule", async () => {
    vi.mocked(queryCustomers).mockResolvedValueOnce({
      items: [customerRow("=SUM(A1)")],
      total: 1,
      allTotal: 1,
    });

    await exportCustomersCsv("b1", {}, () => {});

    const [, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(csv).toContain("'=SUM(A1)");
  });
});

describe("exportTransactionsCsv (S-39)", () => {
  it("exports the filtered entries with their customer names", async () => {
    vi.mocked(queryTransactions)
      .mockResolvedValueOnce({
        rows: [transactionRow("t1", "Asha Verma"), transactionRow("t2", "Rahim")],
        total: 3,
      })
      .mockResolvedValueOnce({
        rows: [transactionRow("t3", "Asha Verma")],
        total: 3,
      });

    const filters = {
      range: { kind: "all" } as never,
      type: "all" as const,
      customerId: null,
      search: "",
      includeVoided: true,
      sort: "occurred_at" as const,
      dir: "desc" as const,
    };
    await exportTransactionsCsv("b1", filters, () => {});

    const pages = vi.mocked(queryTransactions).mock.calls.map(([, params]) => params);
    expect(pages[0]).toMatchObject({ page: 1, pageSize: PAGE, includeVoided: true });
    expect(pages[1]).toMatchObject({ page: 2, pageSize: PAGE });

    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toBe("transactions.csv");
    expect(csv.split("\n")[0]).toBe("date,type,customer,amount,note,status");
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).toContain("Asha Verma");
  });
});

describe("downloadBusinessBackup (S-39)", () => {
  it("produces customers.csv then transactions.csv for the whole business", async () => {
    vi.mocked(queryCustomers).mockResolvedValueOnce({
      items: [],
      total: 0,
      allTotal: 0,
    });
    vi.mocked(queryTransactions).mockResolvedValueOnce({ rows: [], total: 0 });

    await downloadBusinessBackup("b1", () => {});

    // Whole business: no filters, only the paging contract.
    expect(queryCustomers).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ page: 1, pageSize: PAGE }),
    );
    expect(queryTransactions).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ page: 1, pageSize: PAGE }),
    );
    expect(vi.mocked(downloadCsv).mock.calls.map((call) => call[0])).toEqual([
      "customers.csv",
      "transactions.csv",
    ]);
  });
});
