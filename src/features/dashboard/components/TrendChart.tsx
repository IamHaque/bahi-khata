import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "@/components/app/ErrorState";
import { Button } from "@/components/ui/button";
import { formatDayMonth, formatMoney } from "@/lib/format";
import { useDailyActivity } from "../hooks";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

/**
 * The date-only strings arrive as "YYYY-MM-DD" wall-clock days (cut in
 * the caller's timezone by the RPC); parse them as LOCAL dates so the
 * axis never shifts a day in a negative-offset zone.
 */
function toLocalDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * S-37 — the trend chart: charges and payments per day, aggregated
 * SERVER-side by migration 0007's daily_activity RPC (zero-filled,
 * voided out, archived customers out, days cut in the caller's own
 * timezone). The chart renders with the semantic chart tokens
 * (--chart-1/2), carries a visible text summary and an equivalent
 * visually hidden data table, and the 7/30/90 selector re-reads per
 * window. Empty and failing states are this section's own.
 */
export function TrendChart({ businessId }: { businessId: string }) {
  const [days, setDays] = useState<Window>(7);
  const query = useDailyActivity(businessId, days);
  const rows = query.data;

  const totalCharged = (rows ?? []).reduce((sum, row) => sum + row.charges, 0);
  const totalPaid = (rows ?? []).reduce((sum, row) => sum + row.payments, 0);
  const isEmpty =
    rows !== undefined &&
    rows.every((row) => row.charges === 0 && row.payments === 0);

  return (
    <section
      aria-label="Charges and payments per day"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-medium text-foreground">Daily activity</h3>
        <div role="group" aria-label="Chart range" className="flex gap-1">
          {WINDOWS.map((option) => (
            <Button
              key={option}
              variant={days === option ? "default" : "ghost"}
              size="sm"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
            >
              {option} days
            </Button>
          ))}
        </div>
      </div>

      {query.isPending && (
        <div
          role="status"
          aria-label="Loading daily activity"
          className="mt-3 h-56 animate-pulse rounded bg-muted"
        />
      )}

      {query.isError && (
        <div className="mt-3">
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "The daily activity could not be loaded."
            }
            onRetry={() => void query.refetch()}
          />
        </div>
      )}

      {rows !== undefined && isEmpty && (
        <p className="mt-3 text-sm text-muted-foreground">
          No charges or payments in the last {days} days yet.
        </p>
      )}

      {rows !== undefined && !isEmpty && (
        <>
          {/* The text summary the accessibility scenario asks for. */}
          <p className="mt-3 text-sm text-muted-foreground">
            Last {days} days: charged {formatMoney(totalCharged)}, paid{" "}
            {formatMoney(totalPaid)}.
          </p>
          <div className="mt-2 overflow-x-auto">
            <BarChart
              width={720}
              height={240}
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="activity_date"
                tickFormatter={(day: string) => formatDayMonth(toLocalDate(day))}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={days > 30 ? 24 : 8}
              />
              <YAxis
                width={64}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
                }
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Bar
                dataKey="charges"
                name="Charges"
                fill="var(--chart-1)"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="payments"
                name="Payments"
                fill="var(--chart-2)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </div>
          {/* The same numbers, every day, for screen readers. */}
          <table className="sr-only">
            <caption>Daily charges and payments, last {days} days</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Charges</th>
                <th scope="col">Payments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.activity_date}>
                  <th scope="row">{row.activity_date}</th>
                  <td>{formatMoney(row.charges)}</td>
                  <td>{formatMoney(row.payments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
