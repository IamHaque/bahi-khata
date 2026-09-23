import { describe, it, expect } from "vitest";
import { computeBalance } from "@/lib/balance";

describe("computeBalance", () => {
  it("returns 0 for empty transaction list", () => {
    expect(computeBalance([])).toBe(0);
  });

  it("sums charges only", () => {
    const txs = [
      { type: "charge" as const, amount: 100 },
      { type: "charge" as const, amount: 250 },
      { type: "charge" as const, amount: 50 },
    ];
    expect(computeBalance(txs)).toBe(400);
  });

  it("sums payments only", () => {
    const txs = [
      { type: "payment" as const, amount: 100 },
      { type: "payment" as const, amount: 200 },
    ];
    expect(computeBalance(txs)).toBe(-300);
  });

  it("computes net positive balance (customer owes us)", () => {
    const txs = [
      { type: "charge" as const, amount: 500 },
      { type: "payment" as const, amount: 200 },
    ];
    expect(computeBalance(txs)).toBe(300);
  });

  it("computes net negative balance (we owe customer)", () => {
    const txs = [
      { type: "charge" as const, amount: 100 },
      { type: "payment" as const, amount: 300 },
    ];
    expect(computeBalance(txs)).toBe(-200);
  });

  it("handles exactly settled (zero balance)", () => {
    const txs = [
      { type: "charge" as const, amount: 150 },
      { type: "payment" as const, amount: 150 },
    ];
    expect(computeBalance(txs)).toBe(0);
  });

  it("handles large amounts correctly", () => {
    const txs = [
      { type: "charge" as const, amount: 100000 },
      { type: "payment" as const, amount: 50000 },
      { type: "charge" as const, amount: 25000 },
    ];
    expect(computeBalance(txs)).toBe(75000);
  });

  it("handles fractional amounts", () => {
    const txs = [
      { type: "charge" as const, amount: 100.50 },
      { type: "payment" as const, amount: 50.25 },
    ];
    expect(computeBalance(txs)).toBeCloseTo(50.25);
  });
});
