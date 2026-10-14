import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { paths } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { useRespondToInvitation } from "../hooks";
import type { BusinessRole, MyInvitation } from "../api";

const roleTone: Record<BusinessRole, "receivable" | "neutral" | "muted"> = {
  owner: "receivable",
  editor: "neutral",
  viewer: "muted",
};

function roleLabel(role: BusinessRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * One invitation addressed to the signed-in user (S-24): business name,
 * inviter, the role they would get, and the two deliberate answers.
 * Accepting opens the business straight away; a stale invitation (the
 * owner revoked it, someone answered it, the business is gone) shows the
 * database's own message and the card leaves the list on refetch.
 */
export function InvitationCard({ invitation }: { invitation: MyInvitation }) {
  const navigate = useNavigate();
  const respond = useRespondToInvitation();
  const [acting, setActing] = useState(false);

  const handleRespond = async (accept: boolean) => {
    setActing(true);
    try {
      await respond.mutateAsync({ invitationId: invitation.id, accept });
      if (accept) {
        toastSuccess(`You joined ${invitation.businessName}`, {
          label: "Open business",
          onClick: () => navigate(paths.business(invitation.businessId)),
        });
      } else {
        toastSuccess("Invitation declined");
      }
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : accept
            ? "Could not accept the invitation. Try again."
            : "Could not decline the invitation. Try again.",
      );
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {invitation.businessName}
        </p>
        <p className="text-sm text-muted-foreground">
          {invitation.inviterName
            ? `Invited by ${invitation.inviterName}`
            : "You were invited to this business"}
        </p>
      </div>

      <StatusBadge
        label={roleLabel(invitation.role)}
        tone={roleTone[invitation.role]}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={acting}
          onClick={() => void handleRespond(true)}
        >
          <Check />
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={acting}
          onClick={() => void handleRespond(false)}
        >
          <X />
          Decline
        </Button>
      </div>
    </div>
  );
}
