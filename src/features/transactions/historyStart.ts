/**
 * S-72 — migration rollout timestamp or default label.
 * History is recorded from the day v3.2 was installed.
 * Set by the owner after rollout (see docs/MANUAL_STEPS.md).
 */
export let HISTORY_START_DATE: string | null = "2026-11-02T16:21:21.000Z";

export function setHistoryStartDate(date: string | null) {
  HISTORY_START_DATE = date;
}

export const HISTORY_START_LABEL =
  "History is recorded from the day v3.2 was installed";

export function isBeforeHistoryStart(
  dateStr: string | null | undefined,
): boolean {
  if (!dateStr || !HISTORY_START_DATE) return false;
  return Date.parse(dateStr) < Date.parse(HISTORY_START_DATE);
}
