import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";

// S-37 — the dashboard's two reads beyond dashboard_summary: the
// trend chart's per-day aggregation (migration 0007's daily_activity
// RPC) and the recent-activity feed (a plain scoped PostgREST read,
// the same shape S-35's list uses: !inner customer join so archived
// customers' rows never appear, voided rows out, creator names
// resolved through one profiles lookup).

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

export interface DailyActivityRow {
  /** "YYYY-MM-DD" (a wall-clock date in the caller's timezone). */
  activity_date: string;
  charges: number;
  payments: number;
}

/**
 * S-37 — charges and payments per day for the trend chart, computed
 * SERVER-side by daily_activity: zero-filled for every day in the
 * window, voided rows out, edited rows in, archived customers out,
 * days cut in the caller's own timezone.
 */
export async function getDailyActivity(
  businessId: string,
  days: number,
): Promise<DailyActivityRow[]> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("daily_activity", {
      p_business_id: businessId,
      p_days: days,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (error) throw error;

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      activity_date: String(row.activity_date),
      charges: Number(row.charges ?? 0),
      payments: Number(row.payments ?? 0),
    }));
  });
}

export interface ActivityFeedItem {
  id: string;
  type: "charge" | "payment";
  amount: number;
  occurred_at: string;
  customer_id: string;
  customer_name: string;
  /** Null when the creator has since left (the "Former member" case). */
  creator_name: string | null;
}

/**
 * S-37 — the last 10 entries as feed material: the entry, its
 * customer (name + id for the link) and the creator's display name.
 * Voided rows are gone and archived customers never appear — the feed
 * mirrors the dashboard's figures, not the raw table.
 */
export async function getActivityFeed(
  businessId: string,
): Promise<ActivityFeedItem[]> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, type, amount, occurred_at, customer_id, customer:customers!inner(id, name), created_by",
      )
      .eq("business_id", businessId)
      .is("customers.archived_at", null)
      .neq("status", "voided")
      .order("occurred_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      type: "charge" | "payment";
      amount: number;
      occurred_at: string;
      customer_id: string;
      customer: { id: string; name: string };
      created_by: string;
    }>;

    // One profiles lookup for every creator on the page — the same
    // contract S-35's list uses: a person who has since left resolves
    // to nothing and the sentence says "Former member".
    const personIds = [
      ...new Set(rows.map((row) => row.created_by).filter(Boolean)),
    ];
    const names = new Map<string, string>();
    if (personIds.length > 0) {
      const { data: people, error: peopleError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", personIds);
      if (peopleError) throw peopleError;

      for (const profile of (people ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        names.set(profile.id, profile.full_name ?? profile.email ?? "");
      }
    }

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      occurred_at: row.occurred_at,
      customer_id: row.customer_id,
      customer_name: row.customer.name,
      creator_name: names.get(row.created_by) || null,
    }));
  });
}
