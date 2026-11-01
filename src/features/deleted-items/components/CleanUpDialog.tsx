import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { usePurgeDeletionLog, usePurgeDryRun } from "../hooks";

export interface CleanUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  onExportFirst: () => void;
}

const AGE_OPTIONS = [
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "6 months", value: "180" },
  { label: "1 year", value: "365" },
];

export function CleanUpDialog({
  open,
  onOpenChange,
  businessId,
  onExportFirst,
}: CleanUpDialogProps) {
  const [scope, setScope] = useState<"restored" | "all">("restored");
  const [ageDays, setAgeDays] = useState<string>("30");
  const [confirmation, setConfirmation] = useState("");

  const { data: preview, isPending: previewLoading } = usePurgeDryRun(
    businessId,
    ageDays,
    scope,
    open,
  );

  const purge = usePurgeDeletionLog(businessId);

  const unrestored = preview?.unrestored ?? 0;
  const requiresConfirmation = scope === "all" || unrestored > 0;
  const isConfirmed =
    !requiresConfirmation || confirmation.trim() === "PURGE";

  const entriesCount = preview?.entries_removed ?? 0;
  const canSubmit = isConfirmed && entriesCount > 0 && !purge.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const before = new Date(
      Date.now() - Number(ageDays) * 86400000,
    ).toISOString();

    purge.mutate(
      { before, scope },
      {
        onSuccess: (res) => {
          toast.success(
            `Cleaned up ${res.entries_removed} entries (${res.customers_removed} customers, ${res.transactions_removed} transactions, ${res.revisions_removed} revisions removed).`,
          );
          setConfirmation("");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Clean up deletion log</DialogTitle>
            <DialogDescription>
              Permanently remove deleted items older than the selected age. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Scope selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scope
            </Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="restored"
                  checked={scope === "restored"}
                  onChange={() => setScope("restored")}
                  className="accent-primary"
                />
                Items already restored
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="accent-primary"
                />
                All items
              </label>
            </div>
          </div>

          {/* Age selection */}
          <div className="space-y-2">
            <Label htmlFor="purge-age" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Age (minimum 30 days)
            </Label>
            <Select value={ageDays} onValueChange={(val) => val && setAgeDays(val)}>
              <SelectTrigger id="purge-age" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Live Preview */}
          <div
            className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {previewLoading ? (
              <span className="animate-pulse">Calculating entries to clean up…</span>
            ) : entriesCount === 0 ? (
              <span>No entries match this criteria.</span>
            ) : (
              <span>
                {`${entriesCount} entries: ${preview?.customers_removed ?? 0} customers, ${preview?.transactions_removed ?? 0} transactions; ${
                  unrestored > 0
                    ? `${unrestored} are not restored and cannot be brought back`
                    : "all were already restored"
                }`}
              </span>
            )}
          </div>

          {/* Typed confirmation when required */}
          {requiresConfirmation && entriesCount > 0 && (
            <div className="space-y-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <Label
                htmlFor="purge-confirmation"
                className="text-xs font-medium text-destructive"
              >
                Type PURGE to confirm permanent removal
              </Label>
              <Input
                id="purge-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="PURGE"
                className="h-8 text-xs font-mono"
                autoComplete="off"
              />
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportFirst}
            >
              Export first
            </Button>
            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={!canSubmit}
              >
                {purge.isPending ? "Cleaning up…" : "Clean up"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
