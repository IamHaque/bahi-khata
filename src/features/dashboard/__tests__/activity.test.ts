import { describe, it, expect } from "vitest";
import {
  formatCompactInr,
  calculateNiceMax,
  calculatePercentChange,
  splitActivityPeriods,
  resolveBucket,
  bucketActivity,
} from "../activity";
import type { DailyActivityRow } from "../api";

describe("activity helpers", () => {
  describe("formatCompactInr", () => {
    it("formats 0 as '0'", () => {
      expect(formatCompactInr(0)).toBe("0");
    });

    it("formats small numbers as plain numbers", () => {
      expect(formatCompactInr(450)).toBe("450");
      expect(formatCompactInr(999)).toBe("999");
    });

    it("formats thousands with 'k'", () => {
      expect(formatCompactInr(1000)).toBe("1k");
      expect(formatCompactInr(50000)).toBe("50k");
      expect(formatCompactInr(1500)).toBe("1.5k");
      expect(formatCompactInr(99000)).toBe("99k");
    });

    it("formats lakhs with 'L'", () => {
      expect(formatCompactInr(100000)).toBe("1L");
      expect(formatCompactInr(1000000)).toBe("10L");
      expect(formatCompactInr(150000)).toBe("1.5L");
      expect(formatCompactInr(5000000)).toBe("50L");
    });

    it("formats crores with 'Cr'", () => {
      expect(formatCompactInr(10000000)).toBe("1Cr");
      expect(formatCompactInr(25000000)).toBe("2.5Cr");
      expect(formatCompactInr(100000000)).toBe("10Cr");
    });

    it("handles negative values symmetrically", () => {
      expect(formatCompactInr(-1000)).toBe("-1k");
      expect(formatCompactInr(-50000)).toBe("-50k");
      expect(formatCompactInr(-100000)).toBe("-1L");
    });
  });

  describe("calculateNiceMax", () => {
    it("returns nice symmetric limits", () => {
      expect(calculateNiceMax(800)).toBe(1000);
      expect(calculateNiceMax(1500)).toBe(2000);
      expect(calculateNiceMax(2300)).toBe(2500);
      expect(calculateNiceMax(4800)).toBe(5000);
      expect(calculateNiceMax(7200)).toBe(10000);
    });
  });

  describe("calculatePercentChange", () => {
    it("returns '—' when previous is zero", () => {
      expect(calculatePercentChange(100, 0, "30 days")).toBe("—");
      expect(calculatePercentChange(0, 0, "7 days")).toBe("—");
    });

    it("computes positive percent change with ▲", () => {
      expect(calculatePercentChange(112, 100, "30 days")).toBe(
        "▲ 12% vs previous 30 days",
      );
      expect(calculatePercentChange(200, 100, "7 days")).toBe(
        "▲ 100% vs previous 7 days",
      );
    });

    it("computes negative percent change with ▼", () => {
      expect(calculatePercentChange(88, 100, "30 days")).toBe(
        "▼ 12% vs previous 30 days",
      );
      expect(calculatePercentChange(50, 100, "90 days")).toBe(
        "▼ 50% vs previous 90 days",
      );
    });

    it("computes 0% change", () => {
      expect(calculatePercentChange(100, 100, "12 months")).toBe(
        "0% vs previous 12 months",
      );
    });
  });

  describe("splitActivityPeriods", () => {
    it("splits rows into current and previous halves", () => {
      const rows: DailyActivityRow[] = [
        // previous period (3 days)
        { activity_date: "2026-10-01", charges: 100, payments: 50 },
        { activity_date: "2026-10-02", charges: 200, payments: 100 },
        { activity_date: "2026-10-03", charges: 300, payments: 150 },
        // current period (3 days)
        { activity_date: "2026-10-04", charges: 400, payments: 200 },
        { activity_date: "2026-10-05", charges: 500, payments: 250 },
        { activity_date: "2026-10-06", charges: 600, payments: 300 },
      ];

      const { currentRows, summary } = splitActivityPeriods(rows, 3, "3 days");
      expect(currentRows).toHaveLength(3);
      expect(currentRows[0]?.activity_date).toBe("2026-10-04");

      expect(summary.currentCharged).toBe(1500);
      expect(summary.previousCharged).toBe(600);
      expect(summary.chargedChange).toBe("▲ 150% vs previous 3 days");

      expect(summary.currentPaid).toBe(750);
      expect(summary.previousPaid).toBe(300);
      expect(summary.paidChange).toBe("▲ 150% vs previous 3 days");

      expect(summary.currentNet).toBe(750);
      expect(summary.previousNet).toBe(300);
      expect(summary.netChange).toBe("▲ 150% vs previous 3 days");
    });
  });

  describe("auto-coarsening (resolveBucket)", () => {
    it("retains requested bucket when bar width >= 6px", () => {
      expect(resolveBucket("daily", 30, 600)).toBe("daily");
      expect(resolveBucket("daily", 7, 300)).toBe("daily");
    });

    it("coarsens daily to weekly when daily bar width < 6px", () => {
      // 90 items in 300px width = 3.33px (< 6px). 90 / 7 = 13 items -> 300 / 13 = 23px (>= 6px)
      expect(resolveBucket("daily", 90, 300)).toBe("weekly");
    });

    it("coarsens to monthly when weekly bar width < 6px", () => {
      // 365 items in 150px width -> weekly (53 items) = 2.8px (< 6px) -> monthly (12 items) = 12.5px (>= 6px)
      expect(resolveBucket("daily", 365, 150)).toBe("monthly");
      expect(resolveBucket("weekly", 52, 150)).toBe("monthly");
    });
  });

  describe("bucketActivity", () => {
    const dailyRows: DailyActivityRow[] = [
      { activity_date: "2026-10-12", charges: 1000, payments: 400 },
      { activity_date: "2026-10-13", charges: 500, payments: 200 },
      { activity_date: "2026-10-14", charges: 0, payments: 0 },
      { activity_date: "2026-10-15", charges: 2000, payments: 500 },
      { activity_date: "2026-10-16", charges: 300, payments: 100 },
      { activity_date: "2026-10-17", charges: 1500, payments: 800 },
      { activity_date: "2026-10-18", charges: 200, payments: 100 },
      // Next week
      { activity_date: "2026-10-19", charges: 800, payments: 300 },
    ];

    it("groups by daily with 17 Oct label and Wed 15 Oct full label", () => {
      const buckets = bucketActivity(dailyRows, "daily");
      expect(buckets).toHaveLength(8);

      const day1 = buckets[0];
      expect(day1?.key).toBe("2026-10-12");
      expect(day1?.label).toBe("12 Oct");
      expect(day1?.fullDateLabel).toBe("Mon 12 Oct");
      expect(day1?.charges).toBe(1000);
      expect(day1?.payments).toBe(400);
      expect(day1?.net).toBe(600);
      expect(day1?.paymentsNegative).toBe(-400);

      const wed = buckets.find((b) => b.key === "2026-10-15");
      expect(wed?.fullDateLabel).toBe("Thu 15 Oct");
    });

    it("groups by weekly with Monday start and 13 Oct label", () => {
      const buckets = bucketActivity(dailyRows, "weekly");
      expect(buckets).toHaveLength(2);

      const week1 = buckets[0];
      // 2026-10-12 was a Monday
      expect(week1?.key).toBe("2026-10-12");
      expect(week1?.label).toBe("12 Oct");
      expect(week1?.charges).toBe(5500); // 1000+500+0+2000+300+1500+200
      expect(week1?.payments).toBe(2100);
      expect(week1?.net).toBe(3400);
      expect(week1?.paymentsNegative).toBe(-2100);
      expect(week1?.startDate).toBe("2026-10-12");
      expect(week1?.endDate).toBe("2026-10-18");

      const week2 = buckets[1];
      expect(week2?.key).toBe("2026-10-19");
      expect(week2?.charges).toBe(800);
    });

    it("groups by monthly with Oct 26 label format", () => {
      const multiMonthRows: DailyActivityRow[] = [
        { activity_date: "2026-09-28", charges: 500, payments: 100 },
        { activity_date: "2026-10-01", charges: 1000, payments: 200 },
        { activity_date: "2026-10-15", charges: 2000, payments: 300 },
        { activity_date: "2026-11-01", charges: 800, payments: 150 },
      ];

      const buckets = bucketActivity(multiMonthRows, "monthly");
      expect(buckets).toHaveLength(3);

      expect(buckets[0]?.label).toBe("Sep 26");
      expect(buckets[0]?.charges).toBe(500);
      expect(buckets[0]?.startDate).toBe("2026-09-01");
      expect(buckets[0]?.endDate).toBe("2026-09-30");

      expect(buckets[1]?.label).toBe("Oct 26");
      expect(buckets[1]?.charges).toBe(3000);
      expect(buckets[1]?.payments).toBe(500);
      expect(buckets[1]?.startDate).toBe("2026-10-01");
      expect(buckets[1]?.endDate).toBe("2026-10-31");

      expect(buckets[2]?.label).toBe("Nov 26");
    });

    it("marks partial weekly and monthly buckets with descriptive fullDateLabels", () => {
      // 2026-10-15 is Thursday (mid-week), 2026-10-21 is Wednesday (next week)
      const partialWeeklyRows: DailyActivityRow[] = [
        { activity_date: "2026-10-15", charges: 500, payments: 100 },
        { activity_date: "2026-10-21", charges: 800, payments: 200 },
      ];
      const weeklyBuckets = bucketActivity(partialWeeklyRows, "weekly");
      expect(weeklyBuckets).toHaveLength(2);
      expect(weeklyBuckets[0]?.partial).toBe(true);
      expect(weeklyBuckets[0]?.fullDateLabel).toBe("Week of 12 Oct (from 15 Oct)");
      expect(weeklyBuckets[1]?.partial).toBe(true);
      expect(weeklyBuckets[1]?.fullDateLabel).toBe("Week of 19 Oct (to 21 Oct)");

      // Monthly: starts mid-Oct, ends mid-Nov
      const partialMonthlyRows: DailyActivityRow[] = [
        { activity_date: "2026-10-17", charges: 1000, payments: 200 },
        { activity_date: "2026-11-15", charges: 1200, payments: 300 },
      ];
      const monthlyBuckets = bucketActivity(partialMonthlyRows, "monthly");
      expect(monthlyBuckets).toHaveLength(2);
      expect(monthlyBuckets[0]?.partial).toBe(true);
      expect(monthlyBuckets[0]?.fullDateLabel).toBe("Oct 2026 (from 17 Oct)");
      expect(monthlyBuckets[1]?.partial).toBe(true);
      expect(monthlyBuckets[1]?.fullDateLabel).toBe("Nov 2026 (so far)");

      // Daily: never partial
      const dailyBuckets = bucketActivity(partialMonthlyRows, "daily");
      expect(dailyBuckets.every((b) => b.partial === false)).toBe(true);
    });
  });
});
