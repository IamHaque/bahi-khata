import type { TransactionType } from "@/types";

export interface CsvRow {
  customer_name: string;
  customer_phone: string;
  type: TransactionType;
  amount: number;
  date: string;
  note: string;
  rowNumber: number;
}

export interface ValidationError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface CustomerGroup {
  customerName: string;
  customerPhone: string;
  transactions: CsvRow[];
  willCreate: boolean;
}

const REQUIRED_HEADERS = ["customer_name", "type", "amount", "date"];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function validateAmount(value: string): number | null {
  const cleaned = value.replace(/[₹,\s]/g, "");
  const num = Number(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

function validateDate(value: string): Date | null {
  const trimmed = value.trim();

  // Parse YYYY-MM-DD as local date, not UTC, to avoid timezone shifting
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date: Date;
  if (match) {
    const [, year, month, day] = match;
    date = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    date = new Date(trimmed);
  }

  if (isNaN(date.getTime())) return null;
  if (date > new Date()) return null;
  return date;
}

function validateType(value: string): TransactionType | null {
  const lower = value.toLowerCase().trim();
  if (lower === "charge") return "charge";
  if (lower === "payment") return "payment";
  return null;
}

export function parseAndValidateCsv(csvContent: string): {
  validRows: CsvRow[];
  invalidRows: ValidationError[];
  headers: string[];
} {
  const lines = csvContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      validRows: [],
      invalidRows: [{ rowNumber: 0, field: "file", message: "File is empty" }],
      headers: [],
    };
  }

  const headerLine = lines[0] ?? "";
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().trim());

  const missingRequired = REQUIRED_HEADERS.filter(
    (h) => !headers.includes(h),
  );
  if (missingRequired.length > 0) {
    return {
      validRows: [],
      invalidRows: [
        {
          rowNumber: 0,
          field: "headers",
          message: `Missing required columns: ${missingRequired.join(", ")}`,
        },
      ],
      headers,
    };
  }

  const validRows: CsvRow[] = [];
  const invalidRows: ValidationError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = parseCsvLine(lines[i] ?? "");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j] ?? ""] = values[j] ?? "";
    }

    const customerName = row.customer_name?.trim() ?? "";
    if (!customerName) {
      invalidRows.push({
        rowNumber: rowNum,
        field: "customer_name",
        message: "Customer name is required",
      });
      continue;
    }

    const type = validateType(row.type ?? "");
    if (!type) {
      invalidRows.push({
        rowNumber: rowNum,
        field: "type",
        message: `Invalid type "${row.type}". Must be "charge" or "payment"`,
      });
      continue;
    }

    const amount = validateAmount(row.amount ?? "");
    if (amount === null) {
      invalidRows.push({
        rowNumber: rowNum,
        field: "amount",
        message: `Invalid amount "${row.amount}". Must be a positive number`,
      });
      continue;
    }

    const date = validateDate(row.date ?? "");
    if (!date) {
      invalidRows.push({
        rowNumber: rowNum,
        field: "date",
        message: `Invalid date "${row.date}". Must be a valid date not in the future`,
      });
      continue;
    }

    validRows.push({
      customer_name: customerName,
      customer_phone: row.customer_phone?.trim() ?? "",
      type,
      amount,
      date: date.toISOString(),
      note: row.note?.trim() ?? "",
      rowNumber: rowNum,
    });
  }

  return { validRows, invalidRows, headers };
}

export function groupByCustomer(rows: CsvRow[]): CustomerGroup[] {
  const groups = new Map<string, CustomerGroup>();

  for (const row of rows) {
    const key = row.customer_phone
      ? `${row.customer_name.toLowerCase()}|${row.customer_phone}`
      : row.customer_name.toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, {
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        transactions: [],
        willCreate: false,
      });
    }
    groups.get(key)?.transactions.push(row);
  }

  return Array.from(groups.values());
}
