import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED = ["lib/format.ts", "components/app/Money.tsx"];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
describe("money formatting", () => {
  it("is done only by formatMoney and Money", () => {
    const bad = files("src")
      .filter((p) => !ALLOWED.some((a) => p.replace(/\\/g, "/").endsWith(a)))
      .filter((p) => /₹\$\{|toLocaleString\("en-IN"/.test(readFileSync(p, "utf8")) && !/MAX_DATA_ROWS/.test(readFileSync(p, "utf8")));
    expect(bad).toEqual([]);
  });
});
