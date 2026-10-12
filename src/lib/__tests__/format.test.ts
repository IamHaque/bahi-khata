import { describe, it, expect } from "vitest";
import { formatMoney, formatDate, formatTime, formatRelative } from "@/lib/format";

describe("formatMoney", () => {
  it("formats with rupee symbol, Indian grouping and two decimals", () => {
    expect(formatMoney(1234567.5)).toBe("₹12,34,567.50");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("₹0.00");
  });

  it("formats negative amounts with a minus sign", () => {
    expect(formatMoney(-500)).toBe("-₹500.00");
  });

  it("formats single digits", () => {
    expect(formatMoney(5)).toBe("₹5.00");
  });
});

describe("formatDate", () => {
  it("formats as en-IN day month year", () => {
    expect(formatDate("2026-01-15T00:00:00.000Z")).toBe("15 Jan 2026");
  });

  it("accepts a Date object", () => {
    const d = new Date(2026, 0, 15);
    expect(formatDate(d)).toBe("15 Jan 2026");
  });
});

describe("formatTime", () => {
  it("formats as en-IN hour:minute", () => {
    expect(formatTime(new Date(2026, 0, 15, 14, 5))).toMatch(/14:05|2:05/);
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for the current time", () => {
    expect(formatRelative(new Date())).toBe("just now");
  });

  it("describes minutes ago", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelative(d)).toBe("5 min ago");
  });

  it("describes hours ago", () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelative(d)).toBe("3 hr ago");
  });

  it("describes days ago", () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelative(d)).toBe("2 days ago");
  });

  it("falls back to formatDate for older dates", () => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(formatRelative(d)).toBe(formatDate(d));
  });
});
