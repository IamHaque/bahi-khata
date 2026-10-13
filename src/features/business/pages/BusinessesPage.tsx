import { useNavigate } from "react-router-dom";
import { paths } from "@/lib/paths";
import { useMemberships } from "@/features/business/hooks";
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
 * Invitations section; S-26 completes the page.
 */
export function BusinessesPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useMemberships();

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
      // Only the owned business can be opened — until business URLs
      // exist (S-17) a shared business has nowhere to open (DEV-10).
      render: (row) =>
        row.isOwner ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(paths.dashboard)}
          >
            Open
          </Button>
        ) : null,
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
    </div>
  );
}
