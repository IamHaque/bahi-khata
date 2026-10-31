import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { paths } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import {
  useMembers,
  useBusinessInvitations,
  useRevokeInvitation,
  useChangeMemberRole,
  useRemoveMember,
  useLeaveBusiness,
} from "../hooks";
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
 * only the Owner gets management controls (the Invite button, the
 * pending invitations section, and the per-row actions: change role
 * and remove — S-25). Any member may leave the business themselves
 * (S-25); Owners instead see the note that they must delete it.
 */
export function MembersPage() {
  const businessId = useScopedBusinessId() ?? "";
  const navigate = useNavigate();
  const { isOwner } = usePermissions();
  const {
    data: members,
    isLoading,
    error,
    refetch,
  } = useMembers(businessId);
  const { data: invitations } = useBusinessInvitations(businessId);
  const revokeInvitation = useRevokeInvitation(businessId);
  const changeRole = useChangeMemberRole(businessId);
  const removeMember = useRemoveMember(businessId);
  const leaveBusiness = useLeaveBusiness(businessId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<BusinessInvitation | null>(null);
  const [removing, setRemoving] = useState<BusinessMember | null>(null);
  const [leaving, setLeaving] = useState(false);

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

  const handleChangeRole = async (
    member: BusinessMember,
    newRole: BusinessRole,
  ) => {
    try {
      await changeRole.mutateAsync({ userId: member.userId, newRole });
      toastSuccess(
        `${displayName(member)} is now a ${roleLabel(newRole)}`,
      );
    } catch {
      toast.error("Could not change the role. Try again.");
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await removeMember.mutateAsync(removing.userId);
      toastSuccess(`${displayName(removing)} was removed`);
    } catch {
      toast.error("Could not remove the member. Try again.");
    }
  };

  const handleLeave = async () => {
    try {
      await leaveBusiness.mutateAsync();
      toastSuccess(`You left this business`);
      // The guard no longer admits me here; go back to the list.
      navigate(paths.businesses);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not leave the business. Try again.",
      );
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
          renderRowActions={
            // S-25: management actions are the owner's alone, and the
            // owner row itself is protected (no role change, no remove).
            isOwner
              ? (row) =>
                  row.role === "owner" ? null : (
                    <RowActionsMenu
                      items={[
                        ...(row.role === "editor"
                          ? [
                              {
                                label: "Change to Viewer",
                                onSelect: () =>
                                  void handleChangeRole(row, "viewer"),
                              },
                            ]
                          : [
                              {
                                label: "Change to Editor",
                                onSelect: () =>
                                  void handleChangeRole(row, "editor"),
                              },
                            ]),
                        {
                          label: "Remove",
                          variant: "destructive",
                          onSelect: () => setRemoving(row),
                        },
                      ]}
                      triggerLabel={`Actions for ${displayName(row)}`}
                    />
                  )
              : undefined
          }
        />
      )}

      {/* Leaving (S-25): the button for members, the scenario's exact
          note for owners — who must delete the business instead. */}
      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          Owners cannot leave. Delete the business instead.
        </p>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setLeaving(true)}
          >
            Leave business
          </Button>
        </div>
      )}

      {/* Pending invitations: owner-only, both by permission and by RLS */}
      {isOwner && (invitations?.length ?? 0) > 0 && (
        <section aria-label="Pending invitations" className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-foreground">
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

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoving(null);
        }}
        title={`Remove ${removing ? displayName(removing) : ""}?`}
        description="They will lose access to this business immediately. Transactions they recorded stay with the business."
        confirmLabel={
          removing ? `Remove ${displayName(removing)}` : "Remove"
        }
        onConfirm={() => void handleRemove()}
      />

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave this business?"
        description="You will lose access to this business's customers and transactions. You can be invited again later."
        confirmLabel="Leave business"
        onConfirm={() => void handleLeave()}
      />
    </div>
  );
}
