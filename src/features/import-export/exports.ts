import {
  queryCustomers,
  type CustomerListParams,
  type CustomerListRow,
} from "@/features/customers/api";
import {
  queryTransactions,
  type TransactionListParams,
  type TransactionListRow,
} from "@/features/transactions/api";
import { downloadCsv, toCsv } from "./csv";

// S-39 — every export downloads EXACTLY what the current filters match,
// never just the visible page: the reads page through the server in
// bounded chunks (500 rows per request) and report progress per page,
// so a business with years of history exports without the browser ever
// holding a single unbounded response.

const PAGE_SIZE = 500;

export type ExportProgress = (done: number, total: number) => void;

/** The list page's filters, minus paging — the export re-runs them all. */
export type CustomerExportFilters = Pick<
  CustomerListParams,
  "search" | "status" | "sort" | "dir"
>;

export type TransactionExportFilters = Omit<
  TransactionListParams,
  "page" | "pageSize"
>;

export async function exportCustomersCsv(
  businessId: string,
  filters: CustomerExportFilters,
  onProgress: ExportProgress,
): Promise<void> {
  const items: CustomerListRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const result = await queryCustomers(businessId, {
      ...filters,
      page,
      pageSize: PAGE_SIZE,
    });
    total = result.total;
    items.push(...result.items);
    onProgress(items.length, total);
    // An empty page means the server has nothing more to give.
    if (result.items.length === 0) break;
    page += 1;
  }

  const csv = toCsv(
    ["name", "phone", "balance", "last_activity", "created"],
    items.map((customer) => [
      customer.name,
      customer.phone ?? "",
      customer.balance,
      customer.last_activity ?? "",
      customer.created_at,
    ]),
  );
  downloadCsv("customers.csv", csv);
}

export async function exportTransactionsCsv(
  businessId: string,
  filters: TransactionExportFilters,
  onProgress: ExportProgress,
): Promise<void> {
  const rows: TransactionListRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    const result = await queryTransactions(businessId, {
      ...filters,
      page,
      pageSize: PAGE_SIZE,
    });
    total = result.total;
    rows.push(...result.rows);
    onProgress(rows.length, total);
    if (result.rows.length === 0) break;
    page += 1;
  }

  const csv = toCsv(
    // The list read carries status (a voided row shows as voided) but
    // not the void reason — that lives in the detail read only.
    ["date", "type", "customer", "amount", "note", "status"],
    rows.map((row) => [
      row.occurred_at,
      row.type,
      row.customer.name,
      row.amount,
      row.note ?? "",
      row.status,
    ]),
  );
  downloadCsv("transactions.csv", csv);
}

/**
 * The Settings backup and the delete dialog's pre-delete copy: the two
 * files the PRD pins — customers.csv then transactions.csv — for the
 * WHOLE business (no filters), each paged through the server.
 */
export async function downloadBusinessBackup(
  businessId: string,
  onProgress: ExportProgress,
): Promise<void> {
  await exportCustomersCsv(businessId, {}, onProgress);
  await exportTransactionsCsv(businessId, {}, onProgress);
}
