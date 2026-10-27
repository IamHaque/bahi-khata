import { Link } from "react-router-dom";
import { LeaderRow } from "@/components/app/LeaderRow";
import { Money } from "@/components/app/Money";
import { TotalsRule } from "@/components/app/TotalsRule";
import { Card } from "@/components/ui/card";

interface PositionSheetProps {
  openAccounts: number;
  totalReceivable: number;
  totalCredit: number;
  todayCount: number;
  todayNet: number;
  /** Exactly the v2 "Today's activity" href (range=today). */
  todayHref: string;
}

/**
 * L-06 — where you stand: the two balances as leader rows, the net
 * position under a single and a double rule, and today's line whose
 * "Open today" link opens Transactions filtered to today — the same
 * href the old Today card used. Every figure comes straight from
 * dashboard_summary; the sheet computes nothing but the net.
 */
export function PositionSheet({
  openAccounts,
  totalReceivable,
  totalCredit,
  todayCount,
  todayNet,
  todayHref,
}: PositionSheetProps) {
  return (
    <Card className="p-6">
      <h2 className="font-heading text-xl font-bold">Where you stand</h2>

      <div className="mt-1" role="list">
        <LeaderRow
          size="lg"
          tone="receivable"
          label="Owed to you"
          sub={`${openAccounts} open ${openAccounts === 1 ? "account" : "accounts"}`}
          amount={totalReceivable}
        />
        <LeaderRow
          size="lg"
          tone="credit"
          label="You owe"
          sub="Business owes customers"
          amount={totalCredit}
        />
        <TotalsRule className="my-3">
          <LeaderRow size="lg" label="Net position" amount={totalReceivable - totalCredit} />
        </TotalsRule>
      </div>

      <p className="text-sm text-muted-foreground">
        Today: {todayCount} {todayCount === 1 ? "entry" : "entries"}, net{" "}
        <Money amount={todayNet} />.{" "}
        <Link
          to={todayHref}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Open today
        </Link>
      </p>
    </Card>
  );
}
