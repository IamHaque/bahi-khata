import { z } from "zod";
import type { Transaction } from "@/types";

/**
 * S-32 — the add-transaction form's validation, shared by every entry
 * point (top bar, row menu, ledger, dashboard).
 *
 * The rules carry over from the v1 sheets so nobody relearns anything:
 * Amount required, above zero, at most 2 decimals; Date defaults to
 * today, may be back-dated and never runs into the future; Note is
 * optional up to 500 characters; a customer must be chosen. MoneyField
 * hands the amount over as a number (or "" when empty), which is where
 * the "required" message comes from.
 */

function todayISO(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export const transactionSchema = z.object({
  customer_id: z.string().min(1, "Choose a customer"),
  type: z.enum(["charge", "payment"]),
  amount: z
    .number({ error: "Amount is required" })
    .refine((value) => value > 0, { message: "Amount must be above zero" })
    .refine(
      (value) =>
        Number.isFinite(value) &&
        Math.abs(Math.round(value * 100) - value * 100) < 1e-9,
      { message: "Amount can have at most 2 decimals" },
    ),
  occurred_on: z
    .string()
    .min(1, "Date is required")
    .refine((value) => value <= todayISO(), {
      message: "Date cannot be in the future",
    }),
  note: z.string().max(500, "Note must be 500 characters or fewer"),
});

export type TransactionForm = z.infer<typeof transactionSchema>;

/**
 * Form state for a fresh sheet: today's date, a charge, and the
 * preselected customer (when one came with the open request — the
 * picker-first flow starts empty).
 */
export function transactionFormValues(
  customerId?: string | null,
): Record<string, unknown> {
  return {
    customer_id: customerId ?? "",
    type: "charge",
    amount: "",
    occurred_on: todayISO(),
    note: "",
  };
}

/**
 * S-33 — the same form, prefilled from the stored entry. The date
 * arrives as the ISO day the entry happened; the note is a nullable
 * column, empty in the form. Validation is shared with adding: the
 * identical schema runs over whatever came in.
 */
export function transactionEditFormValues(
  transaction: Pick<
    Transaction,
    "customer_id" | "type" | "amount" | "occurred_at" | "note"
  >,
): Record<string, unknown> {
  return {
    customer_id: transaction.customer_id,
    type: transaction.type,
    amount: transaction.amount,
    occurred_on: transaction.occurred_at.split("T")[0] ?? "",
    note: transaction.note ?? "",
  };
}
