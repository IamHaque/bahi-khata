import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FormProvider,
  useForm,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "./ConfirmDialog";

type FieldErrors = Record<string, string>;

interface EntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: z.ZodTypeAny;
  defaultValues: Record<string, unknown>;
  submitLabel: string;
  onSubmit: (
    values: Record<string, unknown>,
  ) => void | Promise<void> | { fieldErrors?: FieldErrors; message?: string };
  children: ReactNode;
}

export function EntityDialog({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  submitLabel,
  onSubmit,
  children,
}: EntityDialogProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema as z.ZodType<FieldValues, FieldValues>) as Resolver<FieldValues>,
    defaultValues: defaultValues as FieldValues,
    mode: "onTouched",
  });

  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      form.reset(defaultValuesRef.current);
      setSaving(false);
    }
    prevOpenRef.current = open;
  }, [open, form]);

  const requestClose = () => {
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const formErrors = form.formState.errors;
  const isDirty = form.formState.isDirty;
  const rootError = (formErrors.root?.message ?? undefined) as string | undefined;

  const body = (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setSaving(true);
          try {
            await onSubmit(values as Record<string, unknown>);
            onOpenChange(false);
          } catch (err) {
            const fieldErrors =
              typeof err === "object" && err !== null && "fieldErrors" in err
                ? (err as { fieldErrors?: FieldErrors }).fieldErrors
                : undefined;
            if (fieldErrors) {
              for (const [field, message] of Object.entries(fieldErrors)) {
                form.setError(field as never, { message });
              }
            } else {
              form.setError("root" as never, {
                message:
                  err instanceof Error
                    ? err.message
                    : "Something went wrong. Please try again.",
              });
            }
          } finally {
            setSaving(false);
          }
        })}
        className="space-y-4"
      >
        {description && <DialogDescription>{description}</DialogDescription>}
        {rootError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {rootError}
          </p>
        )}
        {children}
        {isMobile ? (
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : submitLabel}
            </Button>
          </SheetFooter>
        ) : (
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        )}
      </form>
    </FormProvider>
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={requestClose}>
          <SheetContent side="bottom" className="gap-0">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-4">{body}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={requestClose}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        description="You have unsaved changes. Discard them?"
        confirmLabel="Discard changes"
        onConfirm={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
