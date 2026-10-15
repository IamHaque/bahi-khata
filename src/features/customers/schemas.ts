import { z } from "zod";
import type { Customer } from "@/types";

/**
 * S-29 — the customer form's validation, shared by Add and Edit.
 *
 * The rules and messages carry over from the v1 dialog so nobody has to
 * relearn anything: Name 1–100 characters, a plausible phone (7–15
 * digits once spaces, dashes and parens are gone) and a plausible
 * email; empty optional fields are always valid. Tags travel through
 * the form as a comma-separated string (the shared TagsField edits one
 * input) and leave it as an array — split in the dialog's submit
 * handler — so the field and the schema agree on the value's shape.
 */

const PHONE = /^\+?\d{7,15}$/;

function plausiblePhone(value: string): boolean {
  return PHONE.test(value.replace(/[\s\-()]/g, ""));
}

function plausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Empty is fine; filled must pass the check. */
function optional(check: (value: string) => boolean, message: string) {
  return z.string().trim().refine((value) => value === "" || check(value), message);
}

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  phone: optional(plausiblePhone, "Please enter a valid phone number"),
  email: optional(plausibleEmail, "Please enter a valid email address"),
  address: z.string().trim(),
  alternate_contact_name: z.string().trim(),
  alternate_contact_phone: optional(
    plausiblePhone,
    "Please enter a valid phone number",
  ),
  tags: z.string().superRefine((raw, ctx) => {
    const tags = raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length > 10) {
      ctx.addIssue({ code: "custom", message: "Up to 10 tags" });
      return;
    }
    if (tags.some((tag) => tag.length > 24)) {
      ctx.addIssue({
        code: "custom",
        message: "Tags can be 24 characters or less",
      });
    }
  }),
  notes: z.string().trim(),
});

export type CustomerForm = z.infer<typeof customerSchema>;

/** Form state for Add (everything empty, or prefilled via defaultName) and Edit (the row's values). */
export function customerFormValues(
  customer?: Customer | null,
  defaultName?: string,
): Record<string, string> {
  return {
    name: customer?.name ?? defaultName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    alternate_contact_name: customer?.alternate_contact_name ?? "",
    alternate_contact_phone: customer?.alternate_contact_phone ?? "",
    tags: customer?.tags?.join(", ") ?? "",
    notes: customer?.notes ?? "",
  };
}

/** "wholesale, retail" → ["wholesale", "retail"]; nothing → undefined. */
export function splitTags(raw: string): string[] | undefined {
  const tags = raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}
