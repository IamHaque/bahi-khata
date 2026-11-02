import { useState, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/app/Money";
import { ErrorState } from "@/components/app/ErrorState";
import { formatMoney } from "@/lib/format";
import { transactionsPath } from "@/lib/paths";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { useDailyActivity } from "../hooks";
import {
  bucketActivity,
  calculateNiceMax,
  formatCompactInr,
  resolveBucket,
  splitActivityPeriods,
  type ActivityBucket,
  type BucketType,
} from "../activity";

interface RangeOption {
  id: string;
  days: number;
  label: string;
  periodLabel: string;
  bucket: BucketType;
}

const RANGE_OPTIONS: RangeOption[] = [
  { id: "7", days: 7, label: "7 days", periodLabel: "7 days", bucket: "daily" },
  { id: "30", days: 30, label: "30 days", periodLabel: "30 days", bucket: "daily" },
  { id: "90", days: 90, label: "90 days", periodLabel: "90 days", bucket: "weekly" },
  { id: "12m", days: 365, label: "12 months", periodLabel: "12 months", bucket: "monthly" },
];

/**
 * Activity compares positive charges and payments on a shared zero-based scale.
 * Three summary comparison tiles, URL-synced range selector,
 * interactive readout with "View entries" date link, full keyboard navigation.
 */
export function TrendChart({ businessId }: { businessId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Range from URL (?activity=30 default)
  const activityParam = searchParams.get("activity");
  const selectedRange = useMemo(() => {
    if (!activityParam) return RANGE_OPTIONS[1]!; // 30 days default
    if (activityParam === "365") return RANGE_OPTIONS[3]!;
    const found = RANGE_OPTIONS.find((r) => r.id === activityParam);
    return found ?? RANGE_OPTIONS[1]!;
  }, [activityParam]);

  const setRange = useCallback(
    (option: RangeOption) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (option.id === "30") {
          next.delete("activity");
        } else {
          next.set("activity", option.id);
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // Read 2 * days to compute current and previous comparison periods
  const query = useDailyActivity(businessId, 2 * selectedRange.days);
  const rows = query.data;

  const { currentRows, summary } = useMemo(() => {
    if (!rows || rows.length === 0) {
      return {
        currentRows: [],
        summary: {
          currentCharged: 0,
          previousCharged: 0,
          chargedChange: "—",
          currentPaid: 0,
          previousPaid: 0,
          paidChange: "—",
          currentNet: 0,
          previousNet: 0,
          netChange: "—",
        },
      };
    }
    return splitActivityPeriods(rows, selectedRange.days, selectedRange.periodLabel);
  }, [rows, selectedRange.days, selectedRange.periodLabel]);

  const [chartWidth, setChartWidth] = useState(320);

  // Leave room for the axis, two 6px bars and the space between groups.
  const bucketType = useMemo(() => {
    const count = bucketActivity(currentRows, selectedRange.bucket).length;
    return resolveBucket(selectedRange.bucket, count, Math.max(1, chartWidth - 64) / 3);
  }, [selectedRange.bucket, currentRows, chartWidth]);

  const buckets: ActivityBucket[] = useMemo(() => {
    return bucketActivity(currentRows, bucketType);
  }, [currentRows, bucketType]);

  const isEmpty =
    buckets.length === 0 ||
    buckets.every((b) => b.charges === 0 && b.payments === 0);

  // Both series use the same positive scale; net remains in the summary.
  const niceMax = useMemo(() => {
    const maxVal = Math.max(
      ...buckets.map((b) => Math.max(b.charges, b.payments)),
      0,
    );
    return calculateNiceMax(maxVal);
  }, [buckets]);

  // Selected bucket for the readout line
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const activeBucket = useMemo(() => {
    if (activeIndex === null || activeIndex < 0 || activeIndex >= buckets.length) {
      return null;
    }
    return buckets[activeIndex] ?? null;
  }, [activeIndex, buckets]);

  // Keyboard navigation on chart container
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (buckets.length === 0) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev === null ? 0 : Math.min(buckets.length - 1, prev + 1),
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev === null ? buckets.length - 1 : Math.max(0, prev - 1),
        );
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(buckets.length - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setActiveIndex(null);
      }
    },
    [buckets.length],
  );

  const chartHeight = isDesktop ? 280 : 220;

  return (
    <Card
      className="min-w-0 p-4 sm:p-6"
      role="region"
      aria-label="Activity"
    >
      {/* Header with title and segmented range control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Activity
        </h3>

        {/* Range control: 7 days · 30 days · 90 days · 12 months */}
        <div
          role="group"
          aria-label="Chart range"
          className="inline-flex max-w-full flex-wrap rounded-lg border border-input p-0.5"
        >
          {RANGE_OPTIONS.map((option) => {
            const isSelected = selectedRange.id === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setRange(option);
                  setActiveIndex(null);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3",
                  isSelected
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {query.isPending && (
        <div
          role="status"
          aria-label="Loading activity"
          className="mt-6 h-72 animate-pulse rounded bg-muted"
        />
      )}

      {query.isError && (
        <div className="mt-4">
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "The activity could not be loaded."
            }
            onRetry={() => void query.refetch()}
          />
        </div>
      )}

      {rows !== undefined && !query.isError && (
        <>
          {/* Summary tiles (three: Charged, Paid, Net; stacked on phone) */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Charged */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-sm bg-receivable shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  Charged
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
                <Money amount={summary.currentCharged} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.chargedChange}
              </p>
            </div>

            {/* Paid */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-sm bg-credit shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  Paid
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
                <Money amount={summary.currentPaid} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.paidChange}
              </p>
            </div>

            {/* Net */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-sm bg-foreground shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  Net
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
                <Money amount={summary.currentNet} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.netChange}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {bucketType === "daily" ? "Daily" : bucketType === "weekly" ? "Weekly" : "Monthly"} totals · Charged and paid side by side · Net = charged − paid
          </p>

          {isEmpty ? (
            <div className="my-10 text-center text-sm text-muted-foreground">
              No charges or payments in this period
            </div>
          ) : (
            <>
              {/* Focusable chart area for keyboard + touch navigation */}
              <div
                role="group"
                tabIndex={0}
                aria-label="Activity chart, use left and right arrow keys"
                onKeyDown={handleKeyDown}
                className="mt-6 min-w-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
              >
                <ResponsiveContainer
                  width="100%"
                  height={chartHeight}
                  initialDimension={{ width: 320, height: chartHeight }}
                  onResize={(width) => {
                    setChartWidth(width);
                    setActiveIndex(null);
                  }}
                >
                  <BarChart
                    data={buckets}
                    margin={{ top: 12, right: 8, bottom: 0, left: -10 }}
                    accessibilityLayer={false}
                    barGap={2}
                    maxBarSize={24}
                    onClick={(state) => {
                      if (state?.activeTooltipIndex != null) {
                        setActiveIndex(Number(state.activeTooltipIndex));
                      }
                    }}
                    onMouseMove={(state) => {
                      if (state?.activeTooltipIndex != null) {
                        setActiveIndex(Number(state.activeTooltipIndex));
                      }
                    }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="2 5"
                    />
                    <XAxis
                      dataKey="key"
                      tickFormatter={(_, idx) => buckets[idx]?.label ?? ""}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      domain={[0, niceMax]}
                      ticks={[0, niceMax / 2, niceMax]}
                      tickFormatter={(val: number) => formatCompactInr(val)}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    />
                    {/* Heavier zero baseline */}
                    <ReferenceLine
                      y={0}
                      stroke="var(--foreground)"
                      strokeWidth={1.5}
                    />
                    {/* Highlighted active band */}
                    {activeBucket && (
                      <ReferenceArea
                        x1={activeBucket.key}
                        x2={activeBucket.key}
                        fill="var(--muted)"
                        fillOpacity={0.4}
                      />
                    )}
                    {/* Grouped positive amounts share a comparable baseline. */}
                    <Bar
                      dataKey="charges"
                      name="Charges"
                      fill="var(--receivable)"
                      radius={0}
                      isAnimationActive={false}
                    >
                      {buckets.map((b) => (
                        <Cell
                          key={`charges-${b.key}`}
                          fill="var(--receivable)"
                          fillOpacity={b.partial ? 0.6 : 1}
                        />
                      ))}
                    </Bar>
                    {/* Payment amounts are positive; the net is charged minus paid. */}
                    <Bar
                      dataKey="payments"
                      name="Payments"
                      fill="var(--credit)"
                      radius={0}
                      isAnimationActive={false}
                    >
                      {buckets.map((b) => (
                        <Cell
                          key={`payments-${b.key}`}
                          fill="var(--credit)"
                          fillOpacity={b.partial ? 0.6 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Readout line under the chart */}
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm"
                aria-live="polite"
              >
                {activeBucket ? (
                  <>
                    <p className="text-foreground">
                      <span className="font-semibold">{activeBucket.fullDateLabel}</span>
                      {" · "}
                      <span className="text-muted-foreground">Charged </span>
                      <span className="tabular-nums font-medium text-receivable">
                        {formatMoney(activeBucket.charges)}
                      </span>
                      {" · "}
                      <span className="text-muted-foreground">Paid </span>
                      <span className="tabular-nums font-medium text-credit">
                        {formatMoney(activeBucket.payments)}
                      </span>
                      {" · "}
                      <span className="text-muted-foreground">Net </span>
                      <span className="tabular-nums font-medium text-foreground">
                        {formatMoney(activeBucket.net)}
                      </span>
                    </p>
                    <Link
                      to={transactionsPath(businessId, {
                        from: activeBucket.startDate,
                        to: activeBucket.endDate,
                      })}
                      className="font-medium text-primary hover:underline text-xs"
                    >
                      View entries
                    </Link>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Hover, tap or use arrow keys on the chart to read values
                  </p>
                )}
              </div>
            </>
          )}

          {/* Small muted line under chart */}
          <p className="mt-2 text-xs text-muted-foreground">
            Archived customers are not included.
          </p>

          {/* role="img" summary sentence */}
          <p
            role="img"
            aria-label={`Activity summary for last ${selectedRange.periodLabel}: charged ${formatMoney(summary.currentCharged)}, paid ${formatMoney(summary.currentPaid)}, net ${formatMoney(summary.currentNet)}.`}
            className="sr-only"
          >
            Activity summary for last {selectedRange.periodLabel}: charged{" "}
            {formatMoney(summary.currentCharged)}, paid{" "}
            {formatMoney(summary.currentPaid)}, net{" "}
            {formatMoney(summary.currentNet)}.
          </p>

          {/* Screen reader table */}
          <div className="sr-only">
            <table>
              <caption>
                Activity: charges and payments for last {selectedRange.periodLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Charged</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Net</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">
                      {b.partial ? b.fullDateLabel : b.label}
                    </th>
                    <td>{formatMoney(b.charges)}</td>
                    <td>{formatMoney(b.payments)}</td>
                    <td>{formatMoney(b.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
