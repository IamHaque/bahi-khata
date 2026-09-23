import type { Transaction } from "@/types";

/**
 * Pure function: compute balance from an array of transactions.
 * Charges add to the balance (customer owes us), payments subtract.
 * Only "active" and "edited" transactions should be passed in —
 * callers must filter out "voided" rows before calling this.
 */
export function computeBalance(
  transactions: Array<Pick<Transaction, "type" | "amount">>,
): number {
  return transactions.reduce((balance, tx) => {
    return tx.type === "charge" ? balance + tx.amount : balance - tx.amount;
  }, 0);
}
