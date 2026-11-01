export const CHASE_AFTER_DAYS = 30;

export function formatLastPaymentSub(lastPaymentAt: string | null | undefined): {
  sub: string;
  days: number | null;
} {
  if (!lastPaymentAt) {
    return { sub: "no payments yet", days: null };
  }
  const timestamp = Date.parse(lastPaymentAt);
  if (Number.isNaN(timestamp)) {
    return { sub: "no payments yet", days: null };
  }
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) {
    return { sub: "paid today", days: 0 };
  }
  if (days === 1) {
    return { sub: "paid yesterday", days: 1 };
  }
  return { sub: `last paid ${days} days ago`, days };
}
