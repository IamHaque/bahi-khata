import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";

export type BusinessRole = "owner" | "editor" | "viewer";

export interface BusinessSummary {
  id: string;
  name: string;
  businessType: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  role: BusinessRole;
  isOwner: boolean;
}

export interface PendingInvitation {
  id: string;
  businessId: string;
  businessName: string | null;
  role: BusinessRole;
  createdAt: string;
}

export interface Memberships {
  businesses: BusinessSummary[];
  invitations: PendingInvitation[];
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * Loads everything the app needs to know about the signed-in user's
 * businesses in a single query (S-14): owned and member businesses with
 * role and owner name, plus pending invitations for the user's email.
 *
 * RLS does the filtering — the caller never passes a user id.
 */
export async function getMemberships(): Promise<Memberships> {
  return guard(async () => {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();
    if (userError) throw userError;
    const user = userData.user;
    if (!user) {
      return { businesses: [], invitations: [] };
    }

    // 1) membership rows + the businesses they point at, in one round trip
    const { data: memberRows, error: memberError } = await supabase
      .from("business_members")
      .select(
        "business_id, role, business:businesses(id, name, business_type, owner_id)",
      )
      .eq("user_id", user.id);
    if (memberError) throw memberError;

    interface MemberRow {
      business_id: string;
      role: BusinessRole;
      business: {
        id: string;
        name: string;
        business_type: string | null;
        owner_id: string;
      } | null;
    }

    const rows = (memberRows ?? []) as unknown as MemberRow[];
    const businesses = rows
      .map((row) => row.business)
      .filter((b): b is NonNullable<typeof b> => b !== null);
    const ownerIds = [...new Set(businesses.map((b) => b.owner_id))];

    // 2) owner display names, and the user's pending invitations, in parallel
    const [profilesResult, invitationsResult] = await Promise.all([
      ownerIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("business_invitations")
        .select("id, business_id, role, created_at")
        .eq("email", user.email?.toLowerCase() ?? "")
        .eq("status", "pending"),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (invitationsResult.error) throw invitationsResult.error;

    interface ProfileRow {
      id: string;
      email: string;
      full_name: string | null;
    }

    interface InvitationRow {
      id: string;
      business_id: string;
      role: BusinessRole;
      created_at: string;
    }

    const profileById = new Map(
      ((profilesResult.data ?? []) as unknown as ProfileRow[]).map((p) => [
        p.id,
        p,
      ]),
    );
    const businessNameById = new Map(
      businesses.map((b) => [b.id, b.name]),
    );

    const summaries: BusinessSummary[] = rows
      .filter((row) => row.business !== null)
      .map((row) => {
        const business = row.business!;
        const owner = profileById.get(business.owner_id);
        return {
          id: business.id,
          name: business.name,
          businessType: business.business_type,
          ownerId: business.owner_id,
          ownerName: owner?.full_name ?? owner?.email ?? null,
          ownerEmail: owner?.email ?? null,
          role: row.role,
          isOwner: row.role === "owner",
        };
      });

    const invitations: PendingInvitation[] = (
      (invitationsResult.data ?? []) as unknown as InvitationRow[]
    ).map((invite) => ({
      id: invite.id,
      businessId: invite.business_id,
      businessName: businessNameById.get(invite.business_id) ?? null,
      role: invite.role,
      createdAt: invite.created_at,
    }));

    return { businesses: summaries, invitations };
  });
}
