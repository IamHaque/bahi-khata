import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import {
  DataTable,
  RowActionsMenu,
  type Column,
} from "@/components/app/DataTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Avatar } from "@/components/app/Avatar";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { toastSuccess } from "@/lib/toast";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import { useMembers, useBusinessInvitations, useRevokeInvitation } from "../hooks";
import { InviteMemberDialog } from "../components/InviteMemberDialog";
import type {
  BusinessInvitation,
  BusinessMember,
  BusinessRole,
} from "../api";

const roleTone: Record<BusinessRole, "receivable" | "neutral" | "muted"> = {
  owner: "receivable",
  editor: "neutral",
  viewer: "muted",
};

function roleLabel(role: BusinessRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Display name: full name when the profile has one, else the email. */
function displayName(member: BusinessMember): string {
  return member.fullName || member.email;
}

/**
 * Who belongs to this business (S-22). Any member can see the list;
 * only the Owner gets management controls (the Invite button and the
 * pending invitations section) — S-23 wires the button to the invite
 * dialog, S-25 adds row actions (change role, remove).
 */
export function MembersPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { isOwner } = usePermissions();
  const {
    data: members,
    isLoading,
    error,
    refetch,
  } = useMembers(businessId);
  const { data: invitations } = useBusinessInvitations(businessId);
  const revokeInvitation = useRevokeInvitation(businessId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<BusinessInvitation | null>(null);

  // Owner first, then everyone else by joined date (stable, matches the
  // PRD's "Owner is listed first").
  const sorted = useMemo(() => {
    const rows = members ?? [];
    return [...rows].sort((a, b) => {
      if (a.role === "owner" && b.role !== "owner") return -1;
      if (a.role !== "owner" && b.role === "owner") return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [members]);

  const columns: Column<BusinessMember>[] = [
    {
      key: "member",
      header: "Member",
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={displayName(row)} src={row.avatarUrl} size="sm" />
          <span className="font-medium text-foreground">
            {displayName(row)}
          </span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="text-muted-foreground">{row.email}</span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <StatusBadge label={roleLabel(row.role)} tone={roleTone[row.role]} />
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (row) => (
        <span className="text-muted-foreground">
          {formatDate(row.joinedAt)}
        </span>
      ),
    },
  ];

  const inviteColumns: Column<BusinessInvitation>[] = [
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="font-medium text-foreground">{row.email}</span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <StatusBadge label={roleLabel(row.role)} tone={roleTone[row.role]} />
      ),
    },
    {
      key: "invited",
      header: "Invited",
      render: (row) => (
        <span className="text-muted-foreground">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  // The owner always has a membership row, so "nobody else has joined"
  // means the list holds exactly the owner (S-22's only-owner state).
  const isSoleOwner =
    isOwner && sorted.length === 1 && sorted[0]?.role === "owner";

  // Only the owner reaches the invite button (S-23 opens the dialog);
  // everyone else never sees the control at all. In the sole-owner state
  // the EmptyState carries the button, so the header stays bare.
  const inviteButton = isOwner && (
    <Button type="button" onClick={() => setInviteOpen(true)}>
      <UserPlus />
      Invite
    </Button>
  );

  const handleRevoke = async () => {
    if (!revoking) return;
    try {
      await revokeInvitation.mutateAsync(revoking.id);
      toastSuccess(`Invitation to ${revoking.email} revoked`);
    } catch {
      toast.error("Could not revoke the invitation. Try again.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Who can see and change this business's data."
      >
        {isSoleOwner ? null : inviteButton}
      </PageHeader>

      {isSoleOwner ? (
        <EmptyState
          title="Invite someone to share this business"
          description="Members can see customers and transactions; Editors can also record them."
        >
          {inviteButton}
        </EmptyState>
      ) : (
        <DataTable<BusinessMember>
          columns={columns}
          rows={sorted}
          getRowKey={(row) => row.userId}
          loading={isLoading}
          error={error ? "Could not load members. Try again." : null}
          onRetry={() => void refetch()}
        />
      )}

      {/* Pending invitations: owner-only, both by permission and by RLS */}
      {isOwner && (invitations?.length ?? 0) > 0 && (
        <section aria-label="Pending invitations" className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Pending invitations
          </h3>
          <p className="text-sm text-muted-foreground">
            They will see the invitation after signing in with the invited
            Google account. No email is sent.
          </p>
          <DataTable<BusinessInvitation>
            columns={inviteColumns}
            rows={invitations ?? []}
            getRowKey={(row) => row.id}
            renderRowActions={(row) => (
              <RowActionsMenu
                items={[
                  {
                    label: "Revoke",
                    variant: "destructive",
                    onSelect: () => setRevoking(row),
                  },
                ]}
                triggerLabel={`Actions for ${row.email}`}
              />
            )}
          />
        </section>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        businessId={businessId}
        memberEmails={(members ?? []).map((m) => m.email.toLowerCase())}
        pendingEmails={(invitations ?? []).map((i) => i.email.toLowerCase())}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRevoking(null);
        }}
        title={`Revoke the invitation to ${revoking?.email ?? ""}?`}
        description="They will no longer be able to join with this invitation. You can invite them again later."
        confirmLabel="Revoke"
        onConfirm={() => void handleRevoke()}
      />
    </div>
  );
}
