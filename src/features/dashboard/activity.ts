import type { DailyActivityRow } from "./api";

export type BucketType = "daily" | "weekly" | "monthly";
export type ActivityRange = 7 | 30 | 90 | 365;

export interface ActivityBucket {
  key: string;
  label: string;
  fullDateLabel: string;
  startDate: string;
  endDate: string;
  charges: number;
  payments: number;
  net: number;
  /** Negative payment amount for diverging bar chart below zero */
  paymentsNegative: number;
  /** True when bucket time window is only partially inside the selected range */
  partial: boolean;
}

export interface ActivitySummary {
  currentCharged: number;
  previousCharged: number;
  chargedChange: string;
  currentPaid: number;
  previousPaid: number;
  paidChange: string;
  currentNet: number;
  previousNet: number;
  netChange: string;
}

/**
 * Parses "YYYY-MM-DD" as a local calendar date.
 */
export function toLocalDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const PAD = (n: number) => String(n).padStart(2, "0");

/**
 * Formats a number with compact Indian numbering units (k, L, Cr).
 * Spec: 0, 1k, 50k, 1L, 10L, 1Cr.
 */
export function formatCompactInr(value: number): string {
  if (value === 0) return "0";
  const isNegative = value < 0;
  const abs = Math.abs(value);

  let formatted: string;
  if (abs < 1000) {
    formatted = String(abs);
  } else if (abs < 100000) {
    // Thousands: 1k - 99k
    const v = abs / 1000;
    formatted = `${Number(v.toFixed(1)).toString()}k`;
  } else if (abs < 10000000) {
    // Lakhs: 1L - 99L
    const v = abs / 100000;
    formatted = `${Number(v.toFixed(1)).toString()}L`;
  } else {
    // Crores: 1Cr+
    const v = abs / 10000000;
    formatted = `${Number(v.toFixed(1)).toString()}Cr`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Calculates a round "nice" maximum for symmetric chart axes.
 */
export function calculateNiceMax(maxVal: number): number {
  if (maxVal <= 0) return 1000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const normalized = maxVal / magnitude;
  let niceMultiplier = 1;
  if (normalized <= 1) niceMultiplier = 1;
  else if (normalized <= 2) niceMultiplier = 2;
  else if (normalized <= 2.5) niceMultiplier = 2.5;
  else if (normalized <= 5) niceMultiplier = 5;
  else niceMultiplier = 10;

  return niceMultiplier * magnitude;
}

/**
 * Calculates percent change vs previous period:
 * "▲ 12% vs previous 30 days" or "—" when previous is zero.
 */
export function calculatePercentChange(
  current: number,
  previous: number,
  periodLabel: string,
): string {
  if (previous === 0) return "—";
  const diff = current - previous;
  const pct = Math.round((diff / Math.abs(previous)) * 100);
  if (pct > 0) return `▲ ${pct}% vs previous ${periodLabel}`;
  if (pct < 0) return `▼ ${Math.abs(pct)}% vs previous ${periodLabel}`;
  return `0% vs previous ${periodLabel}`;
}

/**
 * Splits 2 * days rows into current and previous periods and computes totals & comparison.
 */
export function splitActivityPeriods(
  rows: DailyActivityRow[],
  days: number,
  periodLabel: string,
): { currentRows: DailyActivityRow[]; summary: ActivitySummary } {
  const currentRows = rows.slice(-days);
  const previousRows = rows.slice(0, Math.max(0, rows.length - days));

  const currentCharged = currentRows.reduce((sum, r) => sum + r.charges, 0);
  const previousCharged = previousRows.reduce((sum, r) => sum + r.charges, 0);

  const currentPaid = currentRows.reduce((sum, r) => sum + r.payments, 0);
  const previousPaid = previousRows.reduce((sum, r) => sum + r.payments, 0);

  const currentNet = currentCharged - currentPaid;
  const previousNet = previousCharged - previousPaid;

  const summary: ActivitySummary = {
    currentCharged,
    previousCharged,
    chargedChange: calculatePercentChange(
      currentCharged,
      previousCharged,
      periodLabel,
    ),
    currentPaid,
    previousPaid,
    paidChange: calculatePercentChange(currentPaid, previousPaid, periodLabel),
    currentNet,
    previousNet,
    netChange: calculatePercentChange(currentNet, previousNet, periodLabel),
  };

  return { currentRows, summary };
}

/**
 * Auto-coarsening rule: bars must never be narrower than 6px.
 * If range/viewport would produce thinner bars, switch to the next coarser bucket.
 */
export function resolveBucket(
  requestedBucket: BucketType,
  itemCount: number,
  availableWidth?: number,
): BucketType {
  if (!availableWidth || availableWidth <= 0 || itemCount <= 0) {
    return requestedBucket;
  }
  const barWidth = availableWidth / itemCount;
  if (barWidth >= 6) {
    return requestedBucket;
  }
  if (requestedBucket === "daily") {
    const weeklyCount = Math.ceil(itemCount / 7);
    if (availableWidth / weeklyCount >= 6) {
      return "weekly";
    }
    return "monthly";
  }
  if (requestedBucket === "weekly") {
    return "monthly";
  }
  return "monthly";
}

function getMondayInfo(dateStr: string): {
  mondayStr: string;
  sundayStr: string;
  mondayDate: Date;
  sundayDate: Date;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday = 0, ..., Sunday = 6
  const monday = new Date(date);
  monday.setDate(date.getDate() - diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = `${monday.getFullYear()}-${PAD(monday.getMonth() + 1)}-${PAD(monday.getDate())}`;
  const sundayStr = `${sunday.getFullYear()}-${PAD(sunday.getMonth() + 1)}-${PAD(sunday.getDate())}`;
  return { mondayStr, sundayStr, mondayDate: monday, sundayDate: sunday };
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Pure function: groups DailyActivityRow[] by the specified bucket.
 * Returns ActivityBucket[] with key, label, fullDateLabel, startDate, endDate, charges, payments, net.
 */
export function bucketActivity(
  rows: DailyActivityRow[],
  bucket: BucketType,
): ActivityBucket[] {
  if (rows.length === 0) return [];

  const rangeStart = rows[0]!.activity_date;
  const rangeEnd = rows[rows.length - 1]!.activity_date;

  if (bucket === "daily") {
    return rows.map((row) => {
      const date = toLocalDate(row.activity_date);
      const weekday = WEEKDAY_NAMES[date.getDay()] ?? "";
      const day = date.getDate();
      const month = MONTH_NAMES_SHORT[date.getMonth()] ?? "";
      const label = `${day} ${month}`; // e.g. "17 Oct"
      const fullDateLabel = `${weekday} ${day} ${month}`; // e.g. "Wed 15 Oct"
      const net = row.charges - row.payments;

      return {
        key: row.activity_date,
        label,
        fullDateLabel,
        startDate: row.activity_date,
        endDate: row.activity_date,
        charges: row.charges,
        payments: row.payments,
        net,
        paymentsNegative: -row.payments,
        partial: false,
      };
    });
  }

  if (bucket === "weekly") {
    const map = new Map<
      string,
      {
        mondayDate: Date;
        sundayDate: Date;
        sundayStr: string;
        charges: number;
        payments: number;
      }
    >();

    for (const row of rows) {
      const { mondayStr, sundayStr, mondayDate, sundayDate } = getMondayInfo(
        row.activity_date,
      );
      const existing = map.get(mondayStr);
      if (existing) {
        existing.charges += row.charges;
        existing.payments += row.payments;
      } else {
        map.set(mondayStr, {
          mondayDate,
          sundayDate,
          sundayStr,
          charges: row.charges,
          payments: row.payments,
        });
      }
    }

    const entries = Array.from(map.entries());
    return entries.map(([mondayStr, data], idx) => {
      const day = data.mondayDate.getDate();
      const month = MONTH_NAMES_SHORT[data.mondayDate.getMonth()] ?? "";
      const label = `${day} ${month}`; // e.g. "13 Oct"
      const endDay = data.sundayDate.getDate();
      const endMonth = MONTH_NAMES_SHORT[data.sundayDate.getMonth()] ?? "";
      const net = data.charges - data.payments;

      const isFirst = idx === 0;
      const isLast = idx === entries.length - 1;
      const isFirstPartial = isFirst && rangeStart > mondayStr;
      const isLastPartial = isLast && rangeEnd < data.sundayStr;
      const partial = Boolean(isFirstPartial || isLastPartial);

      let fullDateLabel: string;
      if (isFirstPartial && isLastPartial) {
        const startD = toLocalDate(rangeStart);
        const endD = toLocalDate(rangeEnd);
        fullDateLabel = `Week of ${day} ${month} (from ${startD.getDate()} ${MONTH_NAMES_SHORT[startD.getMonth()]} to ${endD.getDate()} ${MONTH_NAMES_SHORT[endD.getMonth()]})`;
      } else if (isFirstPartial) {
        const startD = toLocalDate(rangeStart);
        fullDateLabel = `Week of ${day} ${month} (from ${startD.getDate()} ${MONTH_NAMES_SHORT[startD.getMonth()]})`;
      } else if (isLastPartial) {
        const endD = toLocalDate(rangeEnd);
        fullDateLabel = `Week of ${day} ${month} (to ${endD.getDate()} ${MONTH_NAMES_SHORT[endD.getMonth()]})`;
      } else {
        fullDateLabel = `${day} ${month} – ${endDay} ${endMonth}`;
      }

      return {
        key: mondayStr,
        label,
        fullDateLabel,
        startDate: mondayStr,
        endDate: data.sundayStr,
        charges: data.charges,
        payments: data.payments,
        net,
        paymentsNegative: -data.payments,
        partial,
      };
    });
  }

  // Monthly
  const map = new Map<
    string,
    {
      year: number;
      month: number;
      charges: number;
      payments: number;
    }
  >();

  for (const row of rows) {
    const [y, m] = row.activity_date.split("-").map(Number);
    const year = y ?? 1970;
    const month = m ?? 1;
    const key = `${year}-${PAD(month)}`;
    const existing = map.get(key);
    if (existing) {
      existing.charges += row.charges;
      existing.payments += row.payments;
    } else {
      map.set(key, {
        year,
        month,
        charges: row.charges,
        payments: row.payments,
      });
    }
  }

  const entries = Array.from(map.entries());
  return entries.map(([key, data], idx) => {
    const monthName = MONTH_NAMES_SHORT[data.month - 1] ?? "";
    const shortYear = String(data.year).slice(-2);
    const label = `${monthName} ${shortYear}`; // e.g. "Oct 26"

    // Last day of month
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const startDate = `${key}-01`;
    const endDate = `${key}-${PAD(lastDay)}`;
    const net = data.charges - data.payments;

    const isFirst = idx === 0;
    const isLast = idx === entries.length - 1;
    const isFirstPartial = isFirst && rangeStart > startDate;
    const isLastPartial = isLast && rangeEnd < endDate;
    const partial = Boolean(isFirstPartial || isLastPartial);

    let fullDateLabel: string;
    if (isFirstPartial && isLastPartial) {
      const startD = toLocalDate(rangeStart);
      fullDateLabel = `${monthName} ${data.year} (from ${startD.getDate()} ${monthName} so far)`;
    } else if (isFirstPartial) {
      const startD = toLocalDate(rangeStart);
      fullDateLabel = `${monthName} ${data.year} (from ${startD.getDate()} ${monthName})`;
    } else if (isLastPartial) {
      fullDateLabel = `${monthName} ${data.year} (so far)`;
    } else {
      fullDateLabel = `${monthName} ${data.year}`;
    }

    return {
      key,
      label,
      fullDateLabel,
      startDate,
      endDate,
      charges: data.charges,
      payments: data.payments,
      net,
      paymentsNegative: -data.payments,
      partial,
    };
  });
}
