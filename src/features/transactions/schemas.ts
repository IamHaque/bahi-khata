import { z } from "zod";
import type { Transaction } from "@/types";

/**
 * S-32 — the add-transaction form's validation, shared by every entry
 * point (top bar, row menu, ledger, dashboard).
 *
 * The rules carry over from the v1 sheets so nobody relearns anything:
 * Amount required, above zero, at most 2 decimals; Date defaults to
 * today, may be back-dated and never runs into the future; the Time is
 * optional wall clock (empty = the start of that day); Note is
 * optional up to 500 characters; a customer must be chosen. MoneyField
 * hands the amount over as a number (or "" when empty), which is where
 * the "required" message comes from.
 */

/** Today as an ISO day in the USER's timezone, not the server's UTC day. */
function todayISO(): string {
  return localDay(new Date());
}

/** The ISO day ("2026-10-17") of an instant in the user's timezone. */
function localDay(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/** The wall-clock time ("14:05") of an instant in the user's timezone. */
function localTime(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  occurred_at_time: z
    .string()
    .refine((value) => value === "" || HHMM.test(value), {
      message: "Time must be HH:MM",
    }),
  note: z.string().max(500, "Note must be 500 characters or fewer"),
});

export type TransactionForm = z.infer<typeof transactionSchema>;

/**
 * Form state for a fresh sheet: today's date with the current time (an
 * entry recorded now lands at "now", not at midnight; clearing the
 * time falls back to the start of the day), a charge by default
 * (S-31 lets Add payment preselect the type instead), and the
 * preselected customer (when one came with the open request — the
 * picker-first flow starts empty).
 */
export function transactionFormValues(
  customerId?: string | null,
  presetType?: "charge" | "payment" | null,
): Record<string, unknown> {
  return {
    customer_id: customerId ?? "",
    type: presetType ?? "charge",
    amount: "",
    occurred_on: todayISO(),
    occurred_at_time: localTime(new Date()),
    note: "",
  };
}

/**
 * S-33 — the same form, prefilled from the stored entry. Date and time
 * arrive as the LOCAL pieces of the stored instant (so re-saving
 * without changes preserves the exact moment); the note is a nullable
 * column, empty in the form. Validation is shared with adding: the
 * identical schema runs over whatever came in.
 */
export function transactionEditFormValues(
  transaction: Pick<
    Transaction,
    "customer_id" | "type" | "amount" | "occurred_at" | "note"
  >,
): Record<string, unknown> {
  const when = new Date(transaction.occurred_at);
  return {
    customer_id: transaction.customer_id,
    type: transaction.type,
    amount: transaction.amount,
    occurred_on: localDay(when),
    occurred_at_time: localTime(when),
    note: transaction.note ?? "",
  };
}
