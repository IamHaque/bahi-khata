import { z } from "zod";

/**
 * The invite form (S-23). The email is trimmed and lowercased here so
 * the displayed and stored values always match (the schema check
 * requires lowercase and the invitee match is case-insensitive). The
 * extra rules (already the owner, already a member, already invited)
 * need data the schema cannot see — the dialog checks them inline
 * before the network.
 */
export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a valid email address")
    .email("Enter a valid email address"),
  role: z.enum(["editor", "viewer"]),
});

export type InviteForm = z.infer<typeof inviteSchema>;

export const inviteRoleOptions = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
] as const;
