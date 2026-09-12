import { useAuth } from "@/contexts/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Total Receivable</p>
          <p className="text-4xl font-semibold tabular-nums text-receivable">
            ₹0
          </p>
          <p className="text-xs text-muted-foreground">
            Customers owe the business
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Total Credit</p>
          <p className="text-4xl font-semibold tabular-nums text-credit">
            ₹0
          </p>
          <p className="text-xs text-muted-foreground">
            Business owes customers
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
        Dashboard data will appear here once customers and transactions are
        added.
      </div>
    </div>
  );
}
