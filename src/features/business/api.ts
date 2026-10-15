import { supabase } from "@/lib/supabase";
import { AppError, toAppError } from "@/lib/AppError";

export type BusinessRole = "owner" | "editor" | "viewer";

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  business_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface BusinessInput {
  name: string;
  businessType?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

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

/**
 * Creates the user's business and their Owner membership in one step via
 * the `create_business` RPC (S-15). The database rejects a second owned
 * business with a permission error.
 */
export async function createBusiness(input: BusinessInput): Promise<Business> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("create_business", {
      p_name: input.name,
      p_business_type: input.businessType ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_address: input.address ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as Business;
  });
}

/** Everything that hangs off one business, for the delete dialog (S-19). */
export interface BusinessImpact {
  customerCount: number;
  transactionCount: number;
  memberCount: number;
  invitationCount: number;
}

/**
 * Counts what a deletion would take with it (S-19), so the confirmation
 * can spell out the impact. Owner-only in practice — the counts come
 * from the same tables the delete cascades over.
 */
export async function getBusinessImpact(
  businessId: string,
): Promise<BusinessImpact> {
  return guard(async () => {
    const countOf = async (
      table: "customers" | "transactions" | "business_members" | "business_invitations",
    ) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId);
      if (error) throw error;
      return count ?? 0;
    };

    const [customerCount, transactionCount, memberCount, invitationCount] =
      await Promise.all([
        countOf("customers"),
        countOf("transactions"),
        countOf("business_members"),
        countOf("business_invitations"),
      ]);

    return { customerCount, transactionCount, memberCount, invitationCount };
  });
}

/**
 * Deletes one business (S-19). The schema's `on delete cascade` foreign
 * keys remove every customer, transaction, member and invitation in the
 * same statement, so there are no orphans. Only the owner passes RLS;
 * for anyone else the delete matches zero rows, surfaced as forbidden.
 */
export async function deleteBusiness(businessId: string): Promise<void> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("businesses")
      .delete()
      .eq("id", businessId)
      .select("id");
    if (error) throw error;
    if ((data ?? []).length === 0) {
      throw new AppError(
        "forbidden",
        "You do not have permission to delete this business, or it no longer exists.",
      );
    }
  });
}

/**
 * Loads one business's full details (S-18). Members can read their
 * businesses; RLS filters the rest to null.
 */
export async function getBusiness(
  businessId: string,
): Promise<Business | null> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .maybeSingle();
    if (error) throw error;
    return (data as Business | null) ?? null;
  });
}

/**
 * The S-27 lost-access probe: does the business row still exist?
 * Removed (row exists, my membership does not) and deleted (no row)
 * look identical through RLS, and the scenarios require different
 * messages — this security-definer RPC (migration 0003b) answers the
 * one bit the client cannot see. A failure (e.g. the migration is not
 * applied) throws; the guard falls back to the access-lost message.
 */
export async function businessExists(businessId: string): Promise<boolean> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("business_exists", {
      p_business_id: businessId,
    });
    if (error) throw error;
    return Boolean(data);
  });
}

/**
 * Updates a business's details (S-18). Only the owner passes RLS: for
 * anyone else the update matches zero rows, which surfaces as a
 * forbidden AppError — the same page whether the business is gone or
 * the change was refused.
 */
export async function updateBusiness(
  businessId: string,
  input: BusinessInput,
): Promise<Business> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("businesses")
      .update({
        name: input.name,
        business_type: input.businessType ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      })
      .eq("id", businessId)
      .select("*");
    if (error) throw error;
    const row = ((data ?? []) as Business[])[0];
    if (!row) {
      throw new AppError(
        "forbidden",
        "You do not have permission to change this business, or it no longer exists.",
      );
    }
    return row;
  });
}
