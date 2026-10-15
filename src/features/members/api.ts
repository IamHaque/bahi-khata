import { supabase } from "@/lib/supabase";
import { AppError, toAppError } from "@/lib/AppError";
import type { BusinessRole } from "@/features/business/api";

export type { BusinessRole };

/** One member of a business, with their profile for display (S-22). */
export interface BusinessMember {
  userId: string;
  role: BusinessRole;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/** A pending invitation the owner may see and later manage (S-22/S-23). */
export interface BusinessInvitation {
  id: string;
  email: string;
  role: BusinessRole;
  createdAt: string;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * Everyone who belongs to one business, with their profile (S-22).
 * Any member may read the member list — row-level security filters
 * businesses the caller does not belong to; the caller never passes a
 * user id.
 */
export async function getMembers(
  businessId: string,
): Promise<BusinessMember[]> {
  return guard(async () => {
    const { data: rows, error } = await supabase
      .from("business_members")
      .select("user_id, role, joined_at")
      .eq("business_id", businessId);
    if (error) throw error;

    interface MemberRow {
      user_id: string;
      role: BusinessRole;
      joined_at: string;
    }

    const memberRows = (rows ?? []) as unknown as MemberRow[];
    if (memberRows.length === 0) return [];

    // profiles has no foreign key from business_members, so the profile
    // lookup is a second round trip (RLS: co-members can read profiles).
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in(
        "id",
        memberRows.map((row) => row.user_id),
      );
    if (profileError) throw profileError;

    interface ProfileRow {
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
    }

    const profileById = new Map(
      ((profileRows ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p]),
    );

    return memberRows.map((row) => {
      const profile = profileById.get(row.user_id);
      return {
        userId: row.user_id,
        role: row.role,
        joinedAt: row.joined_at,
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? "",
        avatarUrl: profile?.avatar_url ?? null,
      };
    });
  });
}

/**
 * One business's pending invitations (S-22). Row-level security makes
 * this owner-only (plus the invitee reading their own), so a non-owner
 * simply gets an empty list — the UI hides the section too.
 */
export async function getBusinessInvitations(
  businessId: string,
): Promise<BusinessInvitation[]> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("business_invitations")
      .select("id, email, role, created_at")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;

    interface InvitationRow {
      id: string;
      email: string;
      role: BusinessRole;
      created_at: string;
    }

    return ((data ?? []) as unknown as InvitationRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    }));
  });
}

export interface InvitationInput {
  email: string;
  role: "editor" | "viewer";
}

/**
 * Creates one pending invitation (S-23). Only the owner passes RLS.
 * The email is stored lowercased (the schema check requires it and the
 * invitee match is case-insensitive); the caller's own email, existing
 * members and already-invited emails are refused inline before the
 * network, and the database's unique pending index is the backstop —
 * a race there surfaces as "An invitation is already pending".
 */
export async function createInvitation(
  businessId: string,
  input: InvitationInput,
): Promise<BusinessInvitation> {
  return guard(async () => {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();
    if (userError) throw userError;
    const user = userData.user;
    if (!user) {
      throw new AppError("forbidden", "Sign in to invite someone.");
    }

    const { data, error } = await supabase
      .from("business_invitations")
      .insert({
        business_id: businessId,
        email: input.email.trim().toLowerCase(),
        role: input.role,
        invited_by: user.id,
      })
      .select("id, email, role, created_at")
      .single();
    if (error) {
      // one_pending_invite_per_email — someone beat you to it.
      if (error.code === "23505") {
        throw new AppError(
          "validation",
          "An invitation is already pending for this email.",
        );
      }
      throw error;
    }

    interface InvitationRow {
      id: string;
      email: string;
      role: BusinessRole;
      created_at: string;
    }

    const row = data as unknown as InvitationRow;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    };
  });
}

/**
 * Revokes one pending invitation (S-23): marked revoked (not deleted —
 * the audit trail stays), which removes it from the pending list. Only
 * the owner passes RLS; a zero-row update surfaces as forbidden.
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("business_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    if ((data ?? []).length === 0) {
      throw new AppError(
        "forbidden",
        "You do not have permission to revoke this invitation, or it no longer exists.",
      );
    }
  });
}

/** One invitation addressed to me (S-24), with display names joined in. */
export interface MyInvitation {
  id: string;
  businessId: string;
  businessName: string;
  inviterName: string | null;
  role: BusinessRole;
  createdAt: string;
}

/**
 * The pending invitations for the signed-in user (S-24). The database
 * matches on the caller's own JWT email (case-insensitively) inside a
 * security-definer function, because an invitee is not yet a member and
 * row-level security correctly hides businesses and profiles from them —
 * the caller passes no arguments at all.
 */
export async function getMyInvitations(): Promise<MyInvitation[]> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("my_invitations");
    if (error) throw error;

    interface InvitationRow {
      id: string;
      business_id: string;
      business_name: string;
      inviter_name: string | null;
      role: BusinessRole;
      created_at: string;
    }

    return ((data ?? []) as unknown as InvitationRow[]).map((row) => ({
      id: row.id,
      businessId: row.business_id,
      businessName: row.business_name,
      inviterName: row.inviter_name,
      role: row.role,
      createdAt: row.created_at,
    }));
  });
}

/**
 * Accepts or declines one invitation (S-24) via the 0002 RPC. Accepting
 * while already a member is a silent success (the insert is `on
 * conflict do nothing`); a revoked, answered or business-less invitation
 * raises "This invitation is no longer available." — that exact message
 * is kept (it is what the scenario asks the user to see), and the
 * caller's list is refetched so the card disappears.
 */
export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
): Promise<void> {
  return guard(async () => {
    const { error } = await supabase.rpc("respond_to_invitation", {
      p_invitation_id: invitationId,
      p_accept: accept,
    });
    if (error) {
      if (/no longer available/i.test(error.message ?? "")) {
        throw new AppError(
          "validation",
          "This invitation is no longer available.",
        );
      }
      throw error;
    }
  });
}

/**
 * Changes one member's role (S-25) via the 0002 RPC. Owner-only in the
 * database; promoting anyone to owner is refused there too (ownership
 * transfer is out of scope), so the UI only ever offers Editor/Viewer.
 */
export async function changeMemberRole(
  businessId: string,
  userId: string,
  newRole: BusinessRole,
): Promise<void> {
  return guard(async () => {
    const { error } = await supabase.rpc("change_member_role", {
      p_business_id: businessId,
      p_user_id: userId,
      p_new_role: newRole,
    });
    if (error) throw error;
  });
}

/**
 * Removes one member (S-25) via the 0002 RPC. Owner-only; the owner row
 * is protected in the database. Only the membership row goes — the
 * person's transactions and profile stay, so history remains readable
 * (their name resolves while their profile exists, and the UI falls
 * back to 'Former member' once it does not; SQL test 0002c).
 */
export async function removeMember(
  businessId: string,
  userId: string,
): Promise<void> {
  return guard(async () => {
    const { error } = await supabase.rpc("remove_member", {
      p_business_id: businessId,
      p_user_id: userId,
    });
    if (error) throw error;
  });
}

/**
 * Leaves a business (S-25) via the 0002 RPC — any member may leave
 * themselves; only their own membership row is deleted. Owners are
 * refused by the database with the scenario's exact sentence, which is
 * kept verbatim (the UI already shows it as a note instead of a
 * button, so this only covers races like a last-minute promotion).
 */
export async function leaveBusiness(businessId: string): Promise<void> {
  return guard(async () => {
    const { error } = await supabase.rpc("leave_business", {
      p_business_id: businessId,
    });
    if (error) {
      if (/Owners cannot leave/i.test(error.message ?? "")) {
        throw new AppError(
          "forbidden",
          "Owners cannot leave. Delete the business instead.",
        );
      }
      throw error;
    }
  });
}
