import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BusinessMember } from "@/features/members/api";
import { useTransferOwnership } from "@/features/members/hooks";
import { displayName } from "@/features/members/schemas";

export interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  businessName: string;
  target: BusinessMember | null;
}

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  businessId,
  businessName,
  target,
}: TransferOwnershipDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const transferMutation = useTransferOwnership(businessId);

  useEffect(() => {
    if (open) {
      setConfirmation("");
      setError(null);
    }
  }, [open]);

  if (!target) return null;

  const targetName = displayName(target);
  const isMatch = confirmation.trim() === businessName.trim();

  const handleTransfer = async () => {
    if (!isMatch) return;
    setError(null);
    try {
      await transferMutation.mutateAsync(target.userId);
      toastSuccess(`${targetName} is now the owner`);
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not transfer ownership. Try again.";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer ownership to {targetName}?</DialogTitle>
          <DialogDescription>
            This action immediately transfers full ownership of this business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
            <p className="font-medium text-foreground">Consequences:</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>You become an Editor.</li>
              <li>
                {targetName} can change roles, remove anyone, including you, and delete the business.
              </li>
              <li>You cannot undo this yourself.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-business-name" className="text-sm">
              To confirm, type the business name <span className="font-semibold text-foreground">{businessName}</span>:
            </Label>
            <Input
              id="transfer-business-name"
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={businessName}
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transferMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isMatch || transferMutation.isPending}
            onClick={() => void handleTransfer()}
          >
            {transferMutation.isPending && (
              <Loader2 className="animate-spin" />
            )}
            Transfer ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
