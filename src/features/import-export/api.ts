import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";

// S-38 — the import feature's two server calls: the customers the
// preview matches against (every customer of THIS business, archived
// included — an archived match is a row error, never a silent skip)
// and the ONE atomic import RPC (migration 0008) that either imports
// the whole file or nothing at all.

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

export interface ImportCustomer {
  id: string;
  name: string;
  phone: string | null;
  /** Non-null = archived: rows matching this person are errors. */
  archived_at: string | null;
}

/**
 * Every customer of the business for the import's name+phone matching.
 * Archived rows are included on purpose (their matches must be
 * reported, not imported); deleted rows are gone for good.
 */
export async function getImportCustomers(
  businessId: string,
): Promise<ImportCustomer[]> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, archived_at")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) throw error;

    return (data ?? []) as ImportCustomer[];
  });
}

export interface ImportTransaction {
  customer_name: string;
  customer_phone: string;
  type: "charge" | "payment";
  amount: number;
  /** ISO timestamp — the row's HISTORICAL date, preserved as-is. */
  occurred_at: string;
  note: string;
}

export interface ImportPlan {
  /** Only the NEW customers to create; matches are resolved server-side. */
  customers: Array<{ name: string; phone: string }>;
  transactions: ImportTransaction[];
}

export interface ImportResult {
  customers_created: number;
  transactions_created: number;
}

/**
 * S-38 — the whole file in one call: migration 0008's import_history
 * RPC re-does the name+phone matching inside this business and inserts
 * everything (or nothing — any error rolls the whole import back, the
 * new customers included).
 */
export async function importHistory(
  businessId: string,
  plan: ImportPlan,
): Promise<ImportResult> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("import_history", {
      p_business_id: businessId,
      p_customers: plan.customers,
      p_transactions: plan.transactions,
    });

    if (error) throw error;

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      customers_created: Number(row.customers_created ?? 0),
      transactions_created: Number(row.transactions_created ?? 0),
    };
  });
}
