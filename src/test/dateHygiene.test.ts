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

const scannedDirs = ["pages", "components"];

describe("date formatting hygiene", () => {
  it("components and pages use only lib/format for dates", () => {
    const offenders: string[] = [];
    for (const dir of scannedDirs) {
      for (const file of walk(path.resolve(__dirname, "..", dir))) {
        const content = readFileSync(file, "utf8");
        if (
          content.includes("toLocaleDateString(") ||
          content.includes("toLocaleTimeString(")
        ) {
          offenders.push(path.relative(path.resolve(__dirname, ".."), file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
