import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { paths } from "@/lib/paths";

interface FirstRunCardProps {
  businessId: string;
  canAddCustomer: boolean;
  canAddTransaction: boolean;
  isOwner: boolean;
  onAddCustomer: () => void;
  onAddTransaction: () => void;
}

/**
 * S-36 first-run guidance: with zero customers the dashboard hands a
 * new business its opening moves instead of a wall of zeros. A step's
 * action renders only for a member who may take it — a Viewer reads
 * the guidance as plain text, an Editor gets steps 1 and 2 (the invite
 * step is the Owner's alone).
 */
export function FirstRunCard({
  businessId,
  canAddCustomer,
  canAddTransaction,
  isOwner,
  onAddCustomer,
  onAddTransaction,
}: FirstRunCardProps) {
  return (
    <section
      aria-label="Getting started"
      className="rounded-xl border border-border bg-card p-4"
    >
      <p className="text-sm font-medium text-foreground">Getting started</p>
      <ul className="mt-3 space-y-2">
        <li className="flex items-center gap-2">
          <StepNumber n={1} />
          {canAddCustomer ? (
            <Button variant="outline" size="sm" onClick={onAddCustomer}>
              Add your first customer
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Add your first customer
            </span>
          )}
        </li>
        <li className="flex items-center gap-2">
          <StepNumber n={2} />
          {canAddTransaction ? (
            <Button variant="outline" size="sm" onClick={onAddTransaction}>
              Record your first transaction
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Record your first transaction
            </span>
          )}
        </li>
        {isOwner && (
          <li className="flex items-center gap-2">
            <StepNumber n={3} />
            <Link
              to={paths.members(businessId)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Invite a teammate
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-foreground"
    >
      {n}
    </span>
  );
}
