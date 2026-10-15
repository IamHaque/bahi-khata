import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { getAllCustomerBalances } from "@/features/transactions/api";
import { formatMoney } from "@/lib/format";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import {
  groupByCustomer,
  parseAndValidateCsv,
  type CsvRow,
  type ValidationError,
} from "@/lib/csv-import";
import { useImportCustomers, useImportHistory } from "../hooks";
import type { ImportCustomer } from "../api";

// S-38 — the CSV import, rebuilt on the business model: a four-step
// flow (Upload → Review → Import → Done) where the WHOLE file is
// validated before anything is written, the preview shows a
// per-customer summary and every invalid row with its number and
// reason, a partial import is an explicit choice, and the commit is
// ONE atomic RPC (migration 0008) — a failure imports nothing at all.
//
// All v1 import rules stay in force through the shared v1 parser
// (lib/csv-import.ts): whole-file validation, de-duplication by name
// plus phone, dates preserved as history, source = import.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 10_000;

const TEMPLATE_CSV = [
  "customer_name,customer_phone,type,amount,date,note",
  "Asha Verma,01711 111111,charge,1500,2024-01-15,Milk January",
  "Asha Verma,01711 111111,payment,500,2024-01-20,bKash",
].join("\n");

const STEP_LABELS = ["Upload", "Review", "Import", "Done"] as const;
type Step = "upload" | "review" | "importing" | "done";
const STEP_ORDER: Record<Step, number> = {
  upload: 0,
  review: 1,
  importing: 2,
  done: 3,
};

interface CustomerPreview {
  name: string;
  phone: string;
  transactions: number;
  /** Current balance (existing) plus this file's charges-minus-payments. */
  resultingBalance: number;
  existing: boolean;
}

interface Validation {
  validRows: CsvRow[];
  invalidRows: ValidationError[];
  customers: CustomerPreview[];
  newCustomers: Array<{ name: string; phone: string }>;
}

/** The same key the parser groups on and the RPC matches with. */
function matchKey(name: string, phone: string): string {
  return phone ? `${name.toLowerCase()}|${phone}` : name.toLowerCase();
}

export function ImportPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
  const customersQuery = useImportCustomers(businessId);
  const importMutation = useImportHistory(businessId);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function reset() {
    setStep("upload");
    setFileName(null);
    setFileError(null);
    setValidation(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bahikhata-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setFileError(null);
    setImportError(null);

    // Both limits are checked BEFORE the row parsing, as the PRD pins.
    if (file.size > MAX_FILE_BYTES) {
      setFileError(
        `File is too large. The limit is 5 MB (this file is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      );
      return;
    }

    const content = await file.text();
    const dataRows =
      content.split(/\r?\n/).filter((line) => line.trim() !== "").length - 1;
    if (dataRows > MAX_DATA_ROWS) {
      setFileError(
        `File has too many rows. The limit is ${MAX_DATA_ROWS.toLocaleString("en-IN")} rows (this file has ${dataRows.toLocaleString("en-IN")}).`,
      );
      return;
    }

    const parsed = parseAndValidateCsv(content);

    // The preview matches against the business's CURRENT customers and
    // balances — read both fresh, or refuse the preview entirely (an
    // unseen customer list would silently duplicate everyone).
    let existing: ImportCustomer[];
    let balances: Record<string, number>;
    try {
      const [customersData, balancesData] = await Promise.all([
        customersQuery.refetch(),
        getAllCustomerBalances(businessId),
      ]);
      if (customersData.error) throw customersData.error;
      existing = customersData.data ?? [];
      balances = balancesData;
    } catch {
      setFileError(
        "Could not read this business's current customers. Check the connection and try the file again.",
      );
      return;
    }

    const activeByKey = new Map<string, ImportCustomer>();
    const archivedKeys = new Set<string>();
    for (const customer of existing) {
      const key = matchKey(customer.name, customer.phone ?? "");
      if (customer.archived_at) archivedKeys.add(key);
      else if (!activeByKey.has(key)) activeByKey.set(key, customer);
    }

    // Matching stays inside this business (name + phone). A row whose
    // person is ARCHIVED is an error with the PRD's exact reason.
    const invalidRows: ValidationError[] = [...parsed.invalidRows];
    const remaining: CsvRow[] = [];
    for (const row of parsed.validRows) {
      const key = matchKey(row.customer_name, row.customer_phone);
      if (archivedKeys.has(key) && !activeByKey.has(key)) {
        invalidRows.push({
          rowNumber: row.rowNumber,
          field: "customer_name",
          message: "Customer is archived. Restore them first.",
        });
        continue;
      }
      remaining.push(row);
    }

    // De-duplication by name plus phone — the parser's grouping, then
    // per-customer counts and resulting balances for the preview.
    const groups = groupByCustomer(remaining);
    const customers: CustomerPreview[] = groups.map((group) => {
      const key = matchKey(group.customerName, group.customerPhone);
      const match = activeByKey.get(key);
      const delta = group.transactions.reduce(
        (sum, row) => sum + (row.type === "charge" ? row.amount : -row.amount),
        0,
      );
      return {
        name: group.customerName,
        phone: group.customerPhone,
        transactions: group.transactions.length,
        resultingBalance: match ? (balances[match.id] ?? 0) + delta : delta,
        existing: Boolean(match),
      };
    });

    setValidation({
      validRows: remaining,
      invalidRows,
      customers,
      newCustomers: groups
        .filter(
          (group) =>
            !activeByKey.has(
              matchKey(group.customerName, group.customerPhone),
            ),
        )
        .map((group) => ({
          name: group.customerName,
          phone: group.customerPhone,
        })),
    });
    setFileName(file.name);
    setStep("review");
  }

  async function runImport() {
    if (!validation || validation.validRows.length === 0) return;
    setImportError(null);
    setStep("importing");
    try {
      await importMutation.mutateAsync({
        customers: validation.newCustomers,
        transactions: validation.validRows.map((row) => ({
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          type: row.type,
          amount: row.amount,
          occurred_at: row.date,
          note: row.note,
        })),
      });
      setStep("done");
    } catch (err) {
      // The database rolled the WHOLE import back — nothing partial.
      setImportError(
        err instanceof Error ? err.message : "The import failed.",
      );
    }
  }

  // S-21: the viewer's page is the message itself — readable, with no
  // upload UI to reach and nothing to click.
  if (!can("importTransactions")) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <PageHeader title="Import" />
        <EmptyState
          title="Import needs Editor or Owner access"
          description="Your role can read this business but not change it. Ask an owner if you need to import history."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <PageHeader
        title="Import"
        description="Bring a notebook export into this business: one CSV of charges and payments, fully checked before anything is written."
      >
        <Button variant="outline" onClick={downloadTemplate}>
          Download template
        </Button>
      </PageHeader>

      <ol className="flex flex-wrap gap-4 text-sm" aria-label="Import steps">
        {STEP_LABELS.map((label, index) => {
          const current = STEP_ORDER[step] === index;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                current
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-xs",
                  current
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === "upload" && (
        <section className="rounded-xl border border-border bg-card p-6">
          <label
            htmlFor="import-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center hover:bg-accent-wash"
          >
            <Upload aria-hidden className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Choose a CSV file
            </span>
            <span className="text-xs text-muted-foreground">
              Headers: customer_name, customer_phone, type, amount, date,
              note. Up to 5 MB or {MAX_DATA_ROWS.toLocaleString("en-IN")}{" "}
              rows.
            </span>
          </label>
          <input
            id="import-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {fileError && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {fileError}
            </p>
          )}
        </section>
      )}

      {step === "review" && validation && (
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{fileName}</span>{" "}
              — {validation.validRows.length} valid transactions across{" "}
              {validation.customers.length} customers.
              {validation.invalidRows.length > 0 && (
                <>
                  {" "}
                  {validation.invalidRows.length} row(s) have errors and
                  will be skipped.
                </>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-medium text-foreground">
              Per-customer summary
            </h3>
            <table aria-label="Per-customer summary" className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Transactions
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Resulting balance
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {validation.customers.map((customer) => (
                  <tr
                    key={matchKey(customer.name, customer.phone)}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2">
                      <span className="font-medium text-foreground">
                        {customer.name}
                      </span>
                      {customer.phone && (
                        <span className="ml-2 text-muted-foreground">
                          {customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {customer.transactions}
                    </td>
                    <td
                      className={cn(
                        "py-2 font-medium",
                        customer.resultingBalance > 0
                          ? "text-receivable"
                          : customer.resultingBalance < 0
                            ? "text-credit"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(customer.resultingBalance)}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {customer.existing ? "Existing" : "New"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validation.invalidRows.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-card p-4">
              <h3 className="text-sm font-medium text-destructive">
                Rows with errors ({validation.invalidRows.length})
              </h3>
              <table aria-label="Rows with errors" className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 font-medium">
                      Row
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Field
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Problem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {validation.invalidRows.map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.field}-${row.message}`}
                    >
                      <td className="py-2 text-muted-foreground">
                        {row.rowNumber}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {row.field}
                      </td>
                      <td className="py-2">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {validation.validRows.length > 0 ? (
              <>
                <Button onClick={() => void runImport()}>
                  Import {validation.validRows.length} valid transactions
                </Button>
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Nothing to import — fix the rows above and upload the
                  file again.
                </p>
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {step === "importing" && (
        <section className="rounded-xl border border-border bg-card p-6 text-sm">
          {importError ? (
            <div className="space-y-4">
              <p role="alert" className="text-destructive">
                {importError} — nothing was imported; the whole file was
                rolled back.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => void runImport()}>Try again</Button>
                <Button
                  variant="outline"
                  onClick={() => setStep("review")}
                >
                  Back to review
                </Button>
              </div>
            </div>
          ) : (
            <p role="status">
              Importing {validation?.validRows.length ?? 0} transactions
              across {validation?.customers.length ?? 0} customers…
            </p>
          )}
        </section>
      )}

      {step === "done" && validation && importMutation.data && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            {validation.invalidRows.length > 0
              ? "Partial import complete"
              : "Import complete"}
          </h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              Imported {importMutation.data.transactions_created}{" "}
              transactions.
            </li>
            <li>
              Created {importMutation.data.customers_created} new
              customers.
            </li>
            {validation.invalidRows.length > 0 && (
              <li>
                {validation.invalidRows.length} row(s) were skipped due to
                errors.
              </li>
            )}
          </ul>
          <div className="flex gap-3">
            <Button onClick={reset}>Import another file</Button>
            <Button
              variant="outline"
              onClick={() => navigate(paths.customers(businessId))}
            >
              View customers
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
