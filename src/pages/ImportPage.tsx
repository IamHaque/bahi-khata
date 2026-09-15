import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  parseAndValidateCsv,
  groupByCustomer,
  type CsvRow,
  type ValidationError,
  type CustomerGroup,
} from "@/lib/csv-import";
import {
  listCustomers,
  createCustomer,
  type CustomerInput,
} from "@/lib/customers";
import { createTransactionsBatch } from "@/lib/transactions";

type ImportStep = "upload" | "preview" | "importing" | "success" | "error";

interface ImportResult {
  customersCreated: number;
  customersMatched: number;
  transactionsCreated: number;
}

export function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [validRows, setValidRows] = useState<CsvRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<ValidationError[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setInvalidRows([]);
    setValidRows([]);
    setGroups([]);

    if (!file.name.endsWith(".csv")) {
      setParseError("Please upload a CSV file");
      setStep("error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = parseAndValidateCsv(content);

      if (result.invalidRows.length > 0 && result.validRows.length === 0) {
        setInvalidRows(result.invalidRows);
        setStep("error");
        return;
      }

      setValidRows(result.validRows);
      setInvalidRows(result.invalidRows);
      setGroups(groupByCustomer(result.validRows));
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);

    try {
      const existingCustomers = await listCustomers();
      const existingMap = new Map(
        existingCustomers.map((c) => [
          c.phone
            ? `${c.name.toLowerCase()}|${c.phone}`
            : c.name.toLowerCase(),
          c,
        ]),
      );

      let customersCreated = 0;
      let customersMatched = 0;
      const customerIdMap = new Map<string, string>();

      for (const group of groups) {
        const key = group.customerPhone
          ? `${group.customerName.toLowerCase()}|${group.customerPhone}`
          : group.customerName.toLowerCase();

        const existing = existingMap.get(key);
        if (existing) {
          customerIdMap.set(key, existing.id);
          customersMatched++;
        } else {
          const input: CustomerInput = {
            name: group.customerName,
            phone: group.customerPhone || undefined,
          };
          const newCustomer = await createCustomer(input);
          customerIdMap.set(key, newCustomer.id);
          customersCreated++;
        }
      }

      const transactions = validRows.map((row) => {
        const key = row.customer_phone
          ? `${row.customer_name.toLowerCase()}|${row.customer_phone}`
          : row.customer_name.toLowerCase();
        const customerId = customerIdMap.get(key) ?? "";

        return {
          customer_id: customerId,
          type: row.type,
          amount: row.amount,
          occurred_at: row.date,
          note: row.note || undefined,
          source: "import" as const,
        };
      });

      await createTransactionsBatch(transactions);

      setImportResult({
        customersCreated,
        customersMatched,
        transactionsCreated: transactions.length,
      });
      setStep("success");
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Import failed. Please try again.",
      );
      setStep("error");
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setValidRows([]);
    setInvalidRows([]);
    setGroups([]);
    setParseError(null);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/customers")}
          className="mb-2 text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Customers
        </button>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Import from CSV
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV with one row per historical transaction to import your
          notebook data.
        </p>
      </div>

      {step === "upload" && (
        <div className="rounded-lg border-2 border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with columns:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              customer_name, type, amount, date
            </code>{" "}
            (required) and optionally{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              customer_phone, note
            </code>
          </p>
          <div className="mt-6">
            <label
              htmlFor="csv-upload"
              className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Choose CSV file
            </label>
            <input
              id="csv-upload"
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="sr-only"
              aria-label="Upload CSV file"
            />
          </div>
        </div>
      )}

      {step === "error" && (
        <div className="space-y-4">
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {parseError || "File contains errors"}
          </div>

          {invalidRows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Row</th>
                    <th className="px-3 py-2 text-left font-medium">Field</th>
                    <th className="px-3 py-2 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((err, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 tabular-nums">{err.rowNumber}</td>
                      <td className="px-3 py-2">{err.field}</td>
                      <td className="px-3 py-2 text-destructive">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {importError}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              Try Again
            </Button>
            {validRows.length > 0 && (
              <Button onClick={handleImport} disabled={importing}>
                {importing
                  ? "Importing..."
                  : `Import ${validRows.length} valid rows`}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
            <p>
              <strong>{validRows.length}</strong> valid transactions across{" "}
              <strong>{groups.length}</strong> customers
            </p>
            {invalidRows.length > 0 && (
              <p className="mt-1 text-destructive">
                {invalidRows.length} row(s) will be skipped due to errors
              </p>
            )}
          </div>

          <div className="max-h-96 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    Customer
                  </th>
                  <th className="px-3 py-2 text-left font-medium" scope="col">
                    Transactions
                  </th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">
                    Est. Balance
                  </th>
                  <th className="px-3 py-2 text-center font-medium" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, i) => {
                  const balance = group.transactions.reduce((sum, tx) => {
                    return tx.type === "charge"
                      ? sum + tx.amount
                      : sum - tx.amount;
                  }, 0);
                  const key = group.customerPhone
                    ? `${group.customerName.toLowerCase()}|${group.customerPhone}`
                    : group.customerName.toLowerCase();
                  const existingCustomers = validRows.length > 0 ? [] : [];
                  void existingCustomers;

                  return (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">{group.customerName}</p>
                        {group.customerPhone && (
                          <p className="text-xs text-muted-foreground">
                            {group.customerPhone}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {group.transactions.length}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span
                          className={
                            balance > 0
                              ? "text-receivable"
                              : balance < 0
                                ? "text-credit"
                                : ""
                          }
                        >
                          ₹{Math.abs(balance).toLocaleString("en-IN")}
                          {balance > 0 && " owed"}
                          {balance < 0 && " credit"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                        {key}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {invalidRows.length > 0 && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                {invalidRows.length} invalid row(s) (click to expand)
              </summary>
              <div className="max-h-48 overflow-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Row</th>
                      <th className="px-3 py-2 text-left font-medium">Field</th>
                      <th className="px-3 py-2 text-left font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidRows.map((err, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {err.rowNumber}
                        </td>
                        <td className="px-3 py-2">{err.field}</td>
                        <td className="px-3 py-2 text-destructive">
                          {err.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing
                ? "Importing..."
                : `Import ${validRows.length} transactions for ${groups.length} customers`}
            </Button>
          </div>
        </div>
      )}

      {step === "success" && importResult && (
        <div className="space-y-4">
          <div className="rounded-md bg-receivable/10 px-4 py-3 text-sm text-receivable">
            Import complete
          </div>

          <div className="rounded-md border border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Successfully imported
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
              {importResult.transactionsCreated} transactions
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              for {importResult.customersCreated} new customer
              {importResult.customersCreated !== 1 ? "s" : ""} and{" "}
              {importResult.customersMatched} existing customer
              {importResult.customersMatched !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              Import More
            </Button>
            <Button onClick={() => navigate("/customers")}>
              View Customers
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
