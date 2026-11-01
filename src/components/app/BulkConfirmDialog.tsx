import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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

export interface BulkConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: string[];
  totalSummary?: string;
  recoveryNotice?: string;
  confirmLabel: string;
  tone?: "default" | "destructive";
  requireTypedConfirmation?: boolean;
  expectedConfirmation?: string;
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function BulkConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  totalSummary,
  recoveryNotice = "They go to Recently deleted. You can restore them from there.",
  confirmLabel,
  tone = "default",
  requireTypedConfirmation = false,
  expectedConfirmation,
  isPending = false,
  onConfirm,
}: BulkConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const visibleItems = items.slice(0, 5);
  const remainingCount = items.length - visibleItems.length;
  const isMatch = !requireTypedConfirmation || (expectedConfirmation && typed.trim() === expectedConfirmation.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {items.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">
                Selected {items.length} {items.length === 1 ? "item" : "items"}:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {visibleItems.map((item, idx) => (
                  <li key={idx} className="truncate">{item}</li>
                ))}
                {remainingCount > 0 && (
                  <li className="font-medium text-foreground">
                    and {remainingCount} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {totalSummary && (
            <p className="text-xs text-muted-foreground">{totalSummary}</p>
          )}

          {recoveryNotice && (
            <p className="text-xs text-muted-foreground">{recoveryNotice}</p>
          )}

          {requireTypedConfirmation && expectedConfirmation && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="bulk-confirm-input" className="text-sm">
                To confirm, type <span className="font-semibold text-foreground">{expectedConfirmation}</span>:
              </Label>
              <Input
                id="bulk-confirm-input"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={expectedConfirmation}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={!isMatch || isPending}
            onClick={() => void onConfirm()}
          >
            {isPending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
