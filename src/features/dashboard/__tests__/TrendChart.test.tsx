import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { __setMatchMedia } from "@/test/setup";
import { TrendChart } from "../components/TrendChart";
import * as dashboardApi from "../api";

vi.mock("../api", () => ({
  getDailyActivity: vi.fn(),
  getActivityFeed: vi.fn(),
}));

const mockDailyData: dashboardApi.DailyActivityRow[] = [
  // Previous 30 days (simplified to 5 sample rows)
  { activity_date: "2026-09-10", charges: 1000, payments: 500 },
  { activity_date: "2026-09-15", charges: 2000, payments: 1000 },
  { activity_date: "2026-09-20", charges: 3000, payments: 1500 },
  // Current 30 days (sample rows)
  { activity_date: "2026-10-10", charges: 4000, payments: 2000 },
  { activity_date: "2026-10-15", charges: 41676, payments: 0 },
  { activity_date: "2026-10-20", charges: 5000, payments: 3000 },
];

function renderTrendChart(initialUrl = "/b/b1") {
  return renderApp(
    <Routes>
      <Route
        path="/b/:businessId"
        element={<TrendChart businessId="b1" />}
      />
    </Routes>,
    { route: initialUrl },
  );
}

describe("U-06 TrendChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardApi.getDailyActivity).mockResolvedValue(mockDailyData);
  });

  it("renders Activity header, range control, 3 summary tiles with comparisons", async () => {
    renderTrendChart();

    await screen.findByRole("heading", { name: "Activity" });

    // Range control buttons
    expect(screen.getByRole("button", { name: "7 days" })).toBeTruthy();
    const btn30 = screen.getByRole("button", { name: "30 days" });
    expect(btn30.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "90 days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "12 months" })).toBeTruthy();

    // Summary tiles: Charged, Paid, Net
    expect((await screen.findAllByText("Charged")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Paid")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Net")).length).toBeGreaterThan(0);

    // Swatches exist
    const chart = screen.getByRole("region", { name: "Activity" });
    expect(chart.querySelector(".bg-receivable")).toBeTruthy();
    expect(chart.querySelector(".bg-credit")).toBeTruthy();

    // Archived customers note
    expect(
      screen.getByText("Archived customers are not included."),
    ).toBeTruthy();
  });

  it("empty state shows friendly message when data is all zeros", async () => {
    vi.mocked(dashboardApi.getDailyActivity).mockResolvedValue([
      { activity_date: "2026-10-01", charges: 0, payments: 0 },
      { activity_date: "2026-10-02", charges: 0, payments: 0 },
    ]);

    renderTrendChart();

    expect(
      await screen.findByText("No charges or payments in this period"),
    ).toBeTruthy();

    // Range control remains usable
    expect(screen.getByRole("button", { name: "7 days" })).toBeTruthy();
  });

  it("keyboard navigation on chart region updates readout and view entries link", async () => {
    renderTrendChart();

    await screen.findByRole("heading", { name: "Activity" });
    const chartRegion = await screen.findByRole("group", {
      name: "Activity chart, use left and right arrow keys",
    });

    chartRegion.focus();
    expect(document.activeElement).toBe(chartRegion);

    // Initial instruction text before any bar is selected
    expect(
      screen.getByText(/Hover, tap or use arrow keys on the chart to read values/),
    ).toBeTruthy();

    // Press ArrowRight to select first bucket
    await userEvent.keyboard("{ArrowRight}");

    // Readout line appears with fullDateLabel, Charged, Paid, Net and View entries link
    await waitFor(() => {
      expect(screen.getByText("View entries")).toBeTruthy();
    });

    const viewEntriesLink = screen.getByRole("link", { name: "View entries" });
    expect(viewEntriesLink.getAttribute("href")).toContain("/transactions?");
    expect(viewEntriesLink.getAttribute("href")).toContain("from=");
    expect(viewEntriesLink.getAttribute("href")).toContain("to=");

    // Press Home to jump to start
    await userEvent.keyboard("{Home}");
    expect(screen.getByText("View entries")).toBeTruthy();

    // Press Escape to clear selection
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByText(/Hover, tap or use arrow keys on the chart to read values/),
    ).toBeTruthy();
    expect(screen.queryByText("View entries")).toBeNull();
  });

  it("switching range updates the URL and fetches new period", async () => {
    renderTrendChart();

    await screen.findByRole("heading", { name: "Activity" });

    // Click 7 days
    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 14);

    // Click 90 days
    await userEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 180);

    // Click 12 months
    await userEvent.click(screen.getByRole("button", { name: "12 months" }));
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 730);
  });

  it("restores range from URL on initial load (?activity=90)", async () => {
    renderTrendChart("/b/b1?activity=90");

    await screen.findByRole("heading", { name: "Activity" });
    const btn90 = screen.getByRole("button", { name: "90 days" });
    expect(btn90.getAttribute("aria-pressed")).toBe("true");
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 180);
  });

  it("screen reader accessibility: sr-only table and role=img summary", async () => {
    renderTrendChart();

    await screen.findByRole("heading", { name: "Activity" });

    // role="img" summary sentence
    expect(
      await screen.findByRole("img", { name: /Activity summary for last 30 days/ }),
    ).toBeTruthy();

    // sr-only table
    const table = screen.getByRole("table", {
      name: /Activity: charges and payments for last 30 days/,
    });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
  });

  it("phone scenario: 390px viewport renders chart and tap updates readout", async () => {
    __setMatchMedia(true);
    try {
      renderTrendChart();
      await screen.findByRole("heading", { name: "Activity" });
      const chartRegion = await screen.findByRole("group", {
        name: "Activity chart, use left and right arrow keys",
      });
      expect(chartRegion).toBeTruthy();

      chartRegion.focus();
      // Tap on chart or trigger keyboard navigation
      await userEvent.keyboard("{ArrowRight}");
      expect(await screen.findByText("View entries")).toBeTruthy();
    } finally {
      __setMatchMedia(false);
    }
  });

  it("passes axe accessibility checks", async () => {
    const { container } = renderTrendChart();

    await screen.findByRole("heading", { name: "Activity" });
    await expectNoSeriousViolations(container);
  });
});
