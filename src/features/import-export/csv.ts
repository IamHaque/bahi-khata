// S-39 — CSV writing for every export path: the safe-cell rule the PRD
// pins (a cell beginning =, +, - or @ is prefixed so no spreadsheet
// executes it on open) and one download helper the list pages, the
// Settings backup and the delete dialog all share.

/** A leading =, +, - or @ marks a cell as a would-be formula. */
const FORMULA_PREFIX = /^[=+\-@]/;

export function escapeCsvCell(value: string | number): string {
  let text = String(value);
  // Spreadsheet formula injection: prefix first, THEN quote — the
  // apostrophe must survive inside the quotes.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
