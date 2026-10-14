import { useSyncExternalStore } from "react";

/** The customer a sheet can arrive preselected with (null = ask first). */
export interface SheetCustomer {
  id: string;
  name: string;
}

interface TransactionSheetState {
  open: boolean;
  customer: SheetCustomer | null;
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
 * opening from anywhere shows the same sheet.
 *
 * A module store rather than context because the opener does not have
 * to be an ancestor of the sheet — the toast inside the customer form
 * dialog is nowhere near the Topbar's tree.
 */

let state: TransactionSheetState = {
  open: false,
  customer: null,
  trigger: null,
};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Open the sheet, optionally preselected with a customer. Calling it
 *  again while open simply swaps the customer (the form keeps whatever
 *  else was already typed). */
export function openTransactionSheet(customer?: SheetCustomer | null) {
  const active = document.activeElement;
  state = {
    open: true,
    customer: customer ?? null,
    trigger:
      active instanceof HTMLElement && active !== document.body ? active : null,
  };
  emit();
}

export function closeTransactionSheet() {
  // The trigger is kept so the sheet can hand focus back after closing.
  state = { ...state, open: false, customer: null };
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
