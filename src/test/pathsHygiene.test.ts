import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const root = path.resolve(__dirname, "..");

const scannedFiles = [
  ...walk(path.join(root, "pages")),
  ...walk(path.join(root, "components")),
  path.join(root, "App.tsx"),
];

// A literal path string used as a link target, navigation argument, route
// path or href — e.g. to="/customers", navigate(`/transactions/${id}`),
// path="/login". Dynamic expressions such as to={paths.customers} pass.
const literalPath =
  /(\bto=|\bnavigate\(|\bpath=|\bhref=)\s*({\s*)?("|'|`)\/(?!\/)/;

describe("path hygiene", () => {
  it("no component hardcodes a path string — navigation goes through lib/paths", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const content = readFileSync(file, "utf8");
      if (literalPath.test(content)) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
