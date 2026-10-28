import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import { Monogram } from "@/components/app/Monogram";
import { Money } from "@/components/app/Money";
import { TotalsRule } from "@/components/app/TotalsRule";
import { RowActionsMenu, type RowActionItem } from "@/components/app/DataTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { Customer } from "@/types";

interface CustomerHeaderProps {
  customer: Customer;
  balance: number;
  /** The newest ledger entry's instant, or null when there is none. */
  lastActivityIso: string | null;
  /** The statement route for this customer (S-39: every role). */
  statementHref: string;
  /** Edit joins only for managers, and never on an archived customer. */
  canEdit: boolean;
  /** The hero's two primary actions: manageTransactions and not archived. */
  canWrite: boolean;
  menuItems: RowActionItem[];
  onBack: () => void;
  onEdit: () => void;
  onAddCharge: () => void;
  onAddPayment: () => void;
}

/**
 * L-07's header block, split out of the customer page: the identity
 * (monogram in the balance's tone, the name, the phone · last activity
 * line, the contacts), the page's actions under the name (Statement as
 * a link, Edit, the overflow menu) and, on the right, the TotalsRule
 * balance with the direction spelled out — Owes you / You owe /
 * Settled. The two primary actions sit beneath it, same shared sheet,
 * type already picked (S-31).
 */
export function CustomerHeader({
  customer,
  balance,
  lastActivityIso,
  statementHref,
  canEdit,
  canWrite,
  menuItems,
  onBack,
  onEdit,
  onAddCharge,
  onAddPayment,
}: CustomerHeaderProps) {
  const balanceRef = useRef<HTMLParagraphElement>(null);

  // S-40: a changed balance is announced, not just flashed.
  useEffect(() => {
    if (balanceRef.current) {
      balanceRef.current.classList.remove("balance-flash");
      void balanceRef.current.offsetWidth;
      balanceRef.current.classList.add("balance-flash");
    }
  }, [balance]);

  const tone = balance > 0 ? "receivable" : balance < 0 ? "credit" : "neutral";
  const balanceColor =
    balance > 0
      ? "text-receivable"
      : balance < 0
        ? "text-credit"
        : "text-muted-foreground";
  const direction =
    balance > 0 ? "Owes you" : balance < 0 ? "You owe" : "Settled";

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Monogram name={customer.name} tone={tone} size="lg" />
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Customers
          </button>
          <h2 className="font-display text-3xl font-bold">{customer.name}</h2>

          {/* The header line that replaces the old "Last activity"
              stat card: the phone and the relative last activity. */}
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="hover:text-foreground"
              >
                <Phone
                  className="mr-1 inline h-3.5 w-3.5"
                  aria-hidden="true"
                />
                {customer.phone}
              </a>
            )}
            {customer.phone ? " · " : ""}
            {lastActivityIso
              ? `last activity ${formatRelative(lastActivityIso)}`
              : "no activity yet"}
          </p>

          {customer.tags && customer.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {customer.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="mt-1 block text-sm text-muted-foreground hover:text-foreground"
            >
              <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {customer.email}
            </a>
          )}
          {customer.address && (
            <p className="mt-1 text-sm text-muted-foreground">
              <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {customer.address}
            </p>
          )}

          {/* S-41: the actions wrap under the name on narrow screens. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* S-39: every member — Viewers included — may open and
                print a statement; it is a link, not a button. */}
            <Link
              to={statementHref}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Statement
            </Link>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {menuItems.length > 0 && (
              <RowActionsMenu
                triggerLabel="Customer actions"
                items={menuItems}
              />
            )}
          </div>
        </div>
      </div>

      {/* The balance, direction first (the stat cards are gone: the
          ledger's totals row carries the figures, this line the day). */}
      <div className="flex flex-col items-end gap-3">
        <TotalsRule className="min-w-40 text-right">
          <p className="text-sm text-muted-foreground">{direction}</p>
          {/* S-40: a changed balance is announced, not just flashed. */}
          <p
            ref={balanceRef}
            role="status"
            className={`font-display text-4xl font-bold tabular-nums ${balanceColor}`}
          >
            <Money amount={Math.abs(balance)} />
          </p>
        </TotalsRule>

        {/* S-31: the two primary actions. Viewers and archived
            customers see none. */}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAddCharge}>Add charge</Button>
            <Button variant="outline" onClick={onAddPayment}>
              Add payment
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
