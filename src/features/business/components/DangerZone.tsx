import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toAppError, type AppError } from "@/lib/AppError";
import { paths } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBusinessBackup } from "@/features/import-export/exports";
import { useExportRunner } from "@/features/import-export/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useBusinessImpact,
  useDeleteBusiness,
  useMemberships,
} from "@/features/business/hooks";

/**
 * Owner-only deletion (S-19), rendered by Settings. The dialog spells
 * out what the deletion takes with it, the Delete button stays disabled
 * until the exact business name is typed, and one delete removes the
 * business plus every customer, transaction, member and invitation
 * (schema-level cascade). Where the user lands afterwards depends on
 * what they still belong to.
 */
export function DangerZone({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<AppError | null>(null);

  const deleteBusiness = useDeleteBusiness(businessId);
  const { refetch: refetchMemberships } = useMemberships();
  const { data: impact } = useBusinessImpact(businessId, open);
  // S-39: the pre-delete copy — the same runner Settings uses.
  const { progress: exportProgress, run: runExport } = useExportRunner(
    (message) => toast.error(message),
  );

  const confirmed = confirmation === businessName;

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deleteBusiness.mutateAsync();
      toastSuccess("Business deleted");

      // Where next? Whatever memberships survive the deletion.
      const { data: memberships } = await refetchMemberships();
      const stillBelongsSomewhere = (memberships?.businesses.length ?? 0) > 0;
      navigate(
        stillBelongsSomewhere ? paths.businesses : paths.onboardingBusiness,
      );
    } catch (err) {
      // Nothing is removed: the dialog stays open and shows why.
      setDeleteError(toAppError(err));
    }
  };

  const close = () => {
    setOpen(false);
    setConfirmation("");
    setDeleteError(null);
  };

  return (
    <section
      aria-label="Danger zone"
      className="max-w-2xl rounded-lg border border-destructive/30 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            Danger zone
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleting {businessName} removes its customers, transactions,
            members and invitations permanently.
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete business
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {businessName}?</DialogTitle>
            <DialogDescription>
              This permanently removes:
            </DialogDescription>
          </DialogHeader>

          <ul className="grid grid-cols-2 gap-2 text-sm text-foreground">
            {impact ? (
              <>
                <li className="rounded-md bg-muted px-3 py-2">
                  {`${impact.customerCount} ${impact.customerCount === 1 ? "customer" : "customers"}`}
                </li>
                <li className="rounded-md bg-muted px-3 py-2">
                  {`${impact.transactionCount} ${impact.transactionCount === 1 ? "transaction" : "transactions"}`}
                </li>
                <li className="rounded-md bg-muted px-3 py-2">
                  {`${impact.memberCount} ${impact.memberCount === 1 ? "member" : "members"}`}
                </li>
                <li className="rounded-md bg-muted px-3 py-2">
                  {`${impact.invitationCount} pending ${impact.invitationCount === 1 ? "invitation" : "invitations"}`}
                </li>
              </>
            ) : (
              <li className="col-span-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">
                Counting what this business holds…
              </li>
            )}
          </ul>

          {/* S-39 (C-6): the last-chance backup, right where the delete
              happens — exporting is every member's right, no extra
              gate beyond opening this owner-only dialog. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Keep a copy of this data first.
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(exportProgress)}
              onClick={() =>
                void runExport((onProgress) =>
                  downloadBusinessBackup(businessId, onProgress),
                )
              }
            >
              <Download className="size-4" />
              {exportProgress
                ? `Preparing… ${exportProgress.done}/${exportProgress.total}`
                : "Download backup"}
            </Button>
          </div>

          <p className="text-sm font-medium text-destructive">
            This action cannot be undone.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirmation">
              Type {businessName} to confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={businessName}
              autoComplete="off"
            />
          </div>

          {deleteError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {deleteError.message}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!confirmed || deleteBusiness.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteBusiness.isPending && (
                <Loader2 className="animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
