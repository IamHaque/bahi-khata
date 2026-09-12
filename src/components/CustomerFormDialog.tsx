import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Customer } from "@/types";

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    alternate_contact_name?: string;
    alternate_contact_phone?: string;
    tags?: string[];
    notes?: string;
  }) => Promise<void>;
  initialData?: Customer;
  mode: "add" | "edit";
}

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  alternate_contact_phone?: string;
}

function validateName(name: string): string | undefined {
  if (!name.trim()) return "Name is required";
  if (name.trim().length > 100) return "Name must be 100 characters or less";
  return undefined;
}

function validatePhone(phone: string): string | undefined {
  if (!phone.trim()) return undefined;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return "Please enter a valid phone number";
  return undefined;
}

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address";
  return undefined;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  mode,
}: CustomerFormDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialData?.name ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [altName, setAltName] = useState(initialData?.alternate_contact_name ?? "");
  const [altPhone, setAltPhone] = useState(initialData?.alternate_contact_phone ?? "");
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.join(", ") ?? "",
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? "");
      setPhone(initialData?.phone ?? "");
      setEmail(initialData?.email ?? "");
      setAddress(initialData?.address ?? "");
      setAltName(initialData?.alternate_contact_name ?? "");
      setAltPhone(initialData?.alternate_contact_phone ?? "");
      setTagsInput(initialData?.tags?.join(", ") ?? "");
      setNotes(initialData?.notes ?? "");
      setErrors({});
      setSaveError(null);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameError = validateName(name);
    const phoneError = validatePhone(phone);
    const emailError = validateEmail(email);
    const altPhoneError = validatePhone(altPhone);

    if (nameError || phoneError || emailError || altPhoneError) {
      setErrors({
        name: nameError,
        phone: phoneError,
        email: emailError,
        alternate_contact_phone: altPhoneError,
      });
      if (nameError) nameRef.current?.focus();
      return;
    }

    setErrors({});
    setSaving(true);
    setSaveError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        alternate_contact_name: altName.trim() || undefined,
        alternate_contact_phone: altPhone.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save. Please try again.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Customer" : "Edit Customer"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {saveError && (
            <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="customer-name">Name *</Label>
            <Input
              id="customer-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              maxLength={100}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-phone">Phone number</Label>
            <Input
              id="customer-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "phone-error" : undefined}
            />
            {errors.phone && (
              <p id="phone-error" className="text-sm text-destructive" role="alert">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-address">Address</Label>
            <Input
              id="customer-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
            />
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Additional details
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-alt-name">Alternate contact name</Label>
                <Input
                  id="customer-alt-name"
                  value={altName}
                  onChange={(e) => setAltName(e.target.value)}
                  placeholder="Contact person name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-alt-phone">Alternate contact phone</Label>
                <Input
                  id="customer-alt-phone"
                  type="tel"
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  aria-invalid={!!errors.alternate_contact_phone}
                  aria-describedby={
                    errors.alternate_contact_phone ? "alt-phone-error" : undefined
                  }
                />
                {errors.alternate_contact_phone && (
                  <p id="alt-phone-error" className="text-sm text-destructive" role="alert">
                    {errors.alternate_contact_phone}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-tags">Tags</Label>
                <Input
                  id="customer-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="wholesale, regular (comma-separated)"
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple tags with commas
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-notes">Notes</Label>
            <Input
              id="customer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : mode === "add" ? "Add Customer" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
