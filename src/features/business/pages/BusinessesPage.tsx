import { useNavigate } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useMemberships } from "@/features/business/hooks";
import { useMyInvitations } from "@/features/members/hooks";
import { InvitationCard } from "@/features/members/components/InvitationCard";
import type { BusinessSummary } from "@/features/business/api";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ErrorState } from "@/components/app/ErrorState";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * One membership as a card (S-26): name, owner and my role, with an Open
 * button that lands on that business's dashboard.
 */
function BusinessCard({
  business,
  onOpen,
}: {
  business: BusinessSummary;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {business.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {business.isOwner
            ? "You own this business"
            : `Owned by ${business.ownerName ?? business.ownerEmail ?? "another member"}`}
        </p>
        <StatusBadge label={roleLabel(business.role)} />
      </div>
      <Button variant="outline" size="sm" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

/**
 * My businesses page (S-26, constraint C-2): three sections — My business
 * (the owned business, or a prominent Create your business card), Shared
 * with me (name, owner and my role per card) and Invitations (S-24).
 */
export function BusinessesPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useMemberships();
  const { data: invitations } = useMyInvitations();

  const businesses = data?.businesses ?? [];
  const owned = businesses.filter((b) => b.isOwner);
  const shared = businesses.filter((b) => !b.isOwner);

  const openBusiness = (id: string) => navigate(paths.business(id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My businesses"
        description="Businesses you own and share with you."
      />

      {isLoading ? (
        <div role="status" aria-label="Loading your businesses">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !data ? (
        <ErrorState
          message="Could not load your businesses. Try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <section aria-labelledby="my-business-heading" className="space-y-3">
            <h2
              id="my-business-heading"
              className="font-heading text-sm font-semibold text-foreground"
            >
              My business
            </h2>
            {owned.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {owned.map((business) => (
                  // S-41: min-w-0 keeps this grid item from forcing the
                  // track to its content's width on narrow screens.
                  <li key={business.id} className="min-w-0">
                    <BusinessCard
                      business={business}
                      onOpen={() => openBusiness(business.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-primary/40 bg-card px-6 py-10 text-center">
                <p className="text-base font-semibold text-foreground">
                  Create your business
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Start recording customers and transactions in your own
                  business.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => navigate(paths.onboardingBusiness)}
                >
                  <Plus className="size-4" /> Create business
                </Button>
              </div>
            )}
          </section>

          <section aria-labelledby="shared-heading" className="space-y-3">
            <h2
              id="shared-heading"
              className="font-heading text-sm font-semibold text-foreground"
            >
              Shared with me
            </h2>
            {shared.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {shared.map((business) => (
                  <li key={business.id} className="min-w-0">
                    <BusinessCard
                      business={business}
                      onOpen={() => openBusiness(business.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No businesses shared with you yet.
              </p>
            )}
          </section>

          <section aria-labelledby="invitations-heading" className="space-y-3">
            <h2
              id="invitations-heading"
              className="font-heading text-sm font-semibold text-foreground"
            >
              Invitations
            </h2>
            {(invitations?.length ?? 0) > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {invitations?.map((invitation) => (
                  <li key={invitation.id} className="min-w-0">
                    <InvitationCard invitation={invitation} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No pending invitations.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
