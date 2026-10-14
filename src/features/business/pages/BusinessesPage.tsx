import { useNavigate } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useMemberships } from "@/features/business/hooks";
import { useMyInvitations } from "@/features/members/hooks";
import { InvitationCard } from "@/features/members/components/InvitationCard";
import type { BusinessSummary } from "@/features/business/api";
import { PageHeader } from "@/components/app/PageHeader";
import { DataTable, type Column } from "@/components/app/DataTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Minimal My businesses page (S-16, constraint C-2): heading plus the
 * user's memberships with name, role and an Open button. S-24 adds the
 * Invitations section; S-26 completes the page (three sections).
 */
export function BusinessesPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useMemberships();
  const { data: invitations } = useMyInvitations();

  const businesses: BusinessSummary[] = data?.businesses ?? [];

  const columns: Column<BusinessSummary>[] = [
    {
      key: "name",
      header: "Business",
      render: (row) => (
        <span className="font-medium text-foreground">{row.name}</span>
      ),
      sortValue: (row) => row.name,
      sortable: true,
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <StatusBadge label={roleLabel(row.role)} />,
    },
    {
      key: "open",
      header: "",
      align: "right",
      // Business URLs exist now (S-17): any membership can be opened;
      // the guard + RLS enforce what you may see inside.
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(paths.business(row.id))}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My businesses"
        description="Businesses you own and share with you."
      />

      <DataTable<BusinessSummary>
        columns={columns}
        rows={businesses}
        getRowKey={(row) => row.id}
        loading={isLoading}
        error={data ? undefined : "Could not load your businesses. Try again."}
        onRetry={() => void refetch()}
        emptyState={
          <EmptyState
            title="No businesses yet"
            description="Create your business to start recording customers and transactions."
          >
            <Button onClick={() => navigate(paths.onboardingBusiness)}>
              <Plus />
              Create business
            </Button>
          </EmptyState>
        }
      />

      {/* Invitations addressed to me (S-24). S-26 restructures this page
          into My business / Shared with me / Invitations. */}
      {(invitations?.length ?? 0) > 0 && (
        <section aria-label="Invitations" className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Invitations
          </h2>
          <p className="text-sm text-muted-foreground">
            You were invited to these businesses. Accept to join, or decline.
          </p>
          <div className="space-y-3">
            {invitations?.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
