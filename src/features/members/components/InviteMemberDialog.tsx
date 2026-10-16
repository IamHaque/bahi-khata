import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { EntityDialog } from "@/components/app/EntityDialog";
import { TextField } from "@/components/app/fields/TextField";
import { SelectField } from "@/components/app/fields/SelectField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toAppError } from "@/lib/AppError";
import { toastSuccess } from "@/lib/toast";
import { useCreateInvitation } from "../hooks";
import {
  inviteRoleOptions,
  inviteSchema,
  type InviteForm,
} from "../schemas";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** Emails of current members, for the inline "already a member" check. */
  memberEmails: string[];
  /** Emails with a pending invitation, for the inline duplicate check. */
  pendingEmails: string[];
}

/** Thrown to surface an inline field error from onSubmit (EntityDialog contract). */
function fieldError(field: string, message: string): {
  fieldErrors: Record<string, string>;
} {
  return { fieldErrors: { [field]: message } };
}

/**
 * The owner invites someone by Google email (S-23). No email is sent —
 * the invitation appears in the app for that Google account after they
 * sign in, so the dialog offers a copyable app link instead. Invalid
 * inputs are refused inline: bad email format, your own email, an
 * existing member, or an address that already has a pending invite.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  businessId,
  memberEmails,
  pendingEmails,
}: InviteMemberDialogProps) {
  const { user } = useAuth();
  const createInvitation = useCreateInvitation(businessId);
  const [copied, setCopied] = useState(false);

  const appLink = typeof window === "undefined" ? "" : window.location.origin;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appLink);
      setCopied(true);
      toastSuccess("App link copied");
    } catch {
      toast.error("Could not copy the link. Copy it from the address bar.");
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    const { email, role } = values as unknown as InviteForm;

    if (email === (user?.email?.toLowerCase() ?? "")) {
      throw fieldError("email", "You are already the owner");
    }
    if (memberEmails.includes(email)) {
      throw fieldError("email", "This person is already a member");
    }
    if (pendingEmails.includes(email)) {
      throw fieldError("email", "An invitation is already pending");
    }

    try {
      const invitation = await createInvitation.mutateAsync({ email, role });
      toastSuccess(`Invitation created for ${invitation.email}`);
    } catch (err) {
      // The unique pending index is the backstop for the checks above;
      // anything else (RLS, network) shows as a root error.
      const appError = toAppError(err);
      if (appError.code === "validation") {
        throw fieldError("email", appError.message);
      }
      throw appError;
    }
  };

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite member"
      schema={inviteSchema}
      defaultValues={{ email: "", role: "viewer" }}
      submitLabel="Invite"
      onSubmit={handleSubmit}
    >
      <p className="text-sm text-muted-foreground">
        They will see the invitation after signing in with this Google
        account. No email is sent.
      </p>

      <TextField
        name="email"
        label="Google email"
        placeholder="vic@example.com"
        autoFocus
      />

      <SelectField
        name="role"
        label="Role"
        options={inviteRoleOptions.map((option) => ({
          value: option.value,
          label:
            option.value === "editor"
              ? "Editor — can record customers and transactions"
              : "Viewer — can only see the data",
        }))}
        // The closed trigger shows the short role; the one-line
        // descriptions live in the dropdown, where they help choosing.
        triggerLabels={Object.fromEntries(
          inviteRoleOptions.map((option) => [option.value, option.label]),
        )}
      />

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {appLink}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy app link"}
        </Button>
      </div>
    </EntityDialog>
  );
}
