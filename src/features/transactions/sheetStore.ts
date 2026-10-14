import { useSyncExternalStore } from "react";
import type { Transaction } from "@/types";

/** The customer a sheet can arrive preselected with (null = ask first). */
export interface SheetCustomer {
  id: string;
  name: string;
}

interface TransactionSheetState {
  open: boolean;
  /**
   * S-32 add: record a new charge/payment. S-33 edit: correct
   * `transaction` in the very same sheet — the customer is fixed to
   * the row's and cannot change.
   */
  mode: "add" | "edit";
  customer: SheetCustomer | null;
  transaction: Transaction | null;
  /**
   * S-31 — the detail page offers two primary actions, Add charge and
   * Add payment: each opens the sheet with its type already selected.
   * Null falls back to charge (the v1 default).
   */
  presetType: "charge" | "payment" | null;
  /** The element that opened the sheet — focus returns to it on close
   *  (base-ui can't do this itself: the sheet opens programmatically,
   *  not from its own DialogTrigger). */
  trigger: HTMLElement | null;
}

/**
 * S-32 — one add-transaction sheet for every entry point (top bar,
 * customer row menu, the ledger, the "Customer added" toast action).
 * A tiny module store keeps the open state where any of them can reach
 * it; exactly one sheet instance subscribes (the Topbar renders it), so
 * opening from anywhere shows the same sheet. S-33 added edit mode:
 * the same instance, prefilled from the stored entry.
 *
 * A module store rather than context because the opener does not have
 * to be an ancestor of the sheet — the toast inside the customer form
 * dialog is nowhere near the Topbar's tree.
 */

let state: TransactionSheetState = {
  open: false,
  mode: "add",
  customer: null,
  transaction: null,
  presetType: null,
  trigger: null,
};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function triggerFromDom(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null;
}

/** Open the sheet, optionally preselected with a customer and a
 *  transaction type (S-31's Add charge / Add payment buttons). Calling
 *  it again while open simply swaps the customer (the form keeps
 *  whatever else was already typed). */
export function openTransactionSheet(
  customer?: SheetCustomer | null,
  presetType?: "charge" | "payment",
) {
  state = {
    open: true,
    mode: "add",
    customer: customer ?? null,
    transaction: null,
    presetType: presetType ?? null,
    trigger: triggerFromDom(),
  };
  emit();
}

/** S-33 — correct a stored entry in the same sheet. The customer comes
 *  along for display only; the form opens with the row's values. */
export function openTransactionEdit(
  transaction: Transaction,
  customer: SheetCustomer,
) {
  state = {
    open: true,
    mode: "edit",
    customer,
    transaction,
    presetType: null,
    trigger: triggerFromDom(),
  };
  emit();
}

export function closeTransactionSheet() {
  // The trigger is kept so the sheet can hand focus back after closing.
  state = {
    ...state,
    open: false,
    customer: null,
    transaction: null,
    presetType: null,
  };
  emit();
}

/** Current state — also the probe tests assert the toast action on. */
export function getTransactionSheetState(): TransactionSheetState {
  return state;
}

export function subscribeTransactionSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTransactionSheet(): TransactionSheetState {
  return useSyncExternalStore(
    subscribeTransactionSheet,
    getTransactionSheetState,
    getTransactionSheetState,
  );
}
