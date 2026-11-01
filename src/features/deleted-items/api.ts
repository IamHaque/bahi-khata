import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";

// v3 (S-52) — the deletion_log: every hard delete stores the removed
// row(s) so the owner can bring them back. The database enforces who
// may read or restore (RLS + the restore_deleted() privileges); this
// layer only shapes the data for the UI.

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

export type DeletedItemsFilter = "transaction" | "customer";

export interface DeletionLogEntry {
  id: string;
  business_id: string;
  entity_type: DeletedItemsFilter;
  entity_id: string;
  label: string;
  summary: Record<string, unknown>;
  reason: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  restored_at: string | null;
  restored_by: string | null;
  restored_by_name: string | null;
}

export interface ListDeletionLogOptions {
  entityType?: DeletedItemsFilter;
  /** "exclude" (default) hides restored rows; "include" shows them. */
  restored?: "exclude" | "include";
  limit?: number;
}

/**
 * The Recently deleted page's read. Scoped by business (S-20) and
 * RLS-filtered to the owner. `snapshot` (the full rows used by
 * restore_deleted) deliberately stays in the database — only the
 * display facts come back over the wire. Actor names are resolved in
 * one extra profiles lookup, exactly like the ledger's editor badge,
 * so no PostgREST embed is needed.
 */
export async function listDeletionLog(
  businessId: string,
  opts: ListDeletionLogOptions = {},
): Promise<DeletionLogEntry[]> {
  return guard(async () => {
    let query = supabase
      .from("deletion_log")
      .select(
        "id, business_id, entity_type, entity_id, label, summary, reason, deleted_by, deleted_at, restored_at, restored_by",
      )
      .eq("business_id", businessId);

    if (opts.entityType) {
      query = query.eq("entity_type", opts.entityType);
    }
    if (opts.restored !== "include") {
      query = query.is("restored_at", null);
    }
    if (opts.limit !== undefined) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query.order("deleted_at", {
      ascending: false,
    });
    if (error) throw error;

    const rows = (data ?? []) as Array<
      Omit<DeletionLogEntry, "deleted_by_name" | "restored_by_name">
    >;

    // One profiles lookup for every actor on the page (RLS shows
    // co-members; someone who has since left resolves to nothing and
    // the UI falls back to "Former member").
    const actorIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.deleted_by, row.restored_by])
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];
    if (actorIds.length === 0) {
      return rows.map((row) => ({
        ...row,
        deleted_by_name: null,
        restored_by_name: null,
      }));
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    if (profileError) throw profileError;

    const names = new Map(
      (
        (profileData ?? []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>
      ).map((profile) => [
        profile.id,
        profile.full_name ?? profile.email ?? null,
      ]),
    );
    return rows.map((row) => ({
      ...row,
      deleted_by_name: row.deleted_by
        ? (names.get(row.deleted_by) ?? null)
        : null,
      restored_by_name: row.restored_by
        ? (names.get(row.restored_by) ?? null)
        : null,
    }));
  });
}

/**
 * The Undo of the deletion flow: one atomic server-side operation that
 * brings the row(s) back (or fails with 55000 if the world has moved
 * on — an edited customer, a restored row, a duplicate). Returns the
 * database's jsonb report { status, restored, message } verbatim.
 */
export async function restoreDeleted(logId: string): Promise<{
  status: string;
  restored: number;
  message?: string;
}> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("restore_deleted", {
      p_log_id: logId,
    });
    if (error) throw error;
    return data as { status: string; restored: number; message?: string };
  });
}
export interface PurgeDeletionLogParams {
  businessId: string;
  before: string;
  scope: "restored" | "all";
  dryRun?: boolean;
}

export interface PurgeDeletionLogResult {
  entries_removed: number;
  customers_removed: number;
  transactions_removed: number;
  revisions_removed: number;
  unrestored: number;
}

export interface DeletionLogExportRow {
  id: string;
  entity_type: string;
  label: string;
  reason: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleter_name: string | null;
  restored_at: string | null;
  restored_by: string | null;
  restorer_name: string | null;
  amount: number | null;
}

export interface LastPurgeInfo {
  id: string;
  purged_at: string;
  purger_name: string;
  entries_removed: number;
}

/**
 * S-73 — purge or dry-run preview for cleaning up the deletion log.
 */
export async function purgeDeletionLog(
  params: PurgeDeletionLogParams,
): Promise<PurgeDeletionLogResult> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("purge_deletion_log", {
      p_business_id: params.businessId,
      p_before: params.before,
      p_scope: params.scope,
      p_dry_run: params.dryRun ?? false,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      entries_removed: Number(row?.entries_removed ?? 0),
      customers_removed: Number(row?.customers_removed ?? 0),
      transactions_removed: Number(row?.transactions_removed ?? 0),
      revisions_removed: Number(row?.revisions_removed ?? 0),
      unrestored: Number(row?.unrestored ?? 0),
    };
  });
}

/**
 * S-73 — exports up to 5000 deletion log entries without heavy snapshot.
 */
export async function exportDeletionLog(
  businessId: string,
): Promise<DeletionLogExportRow[]> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("export_deletion_log", {
      p_business_id: businessId,
    });
    if (error) throw error;
    return (data ?? []) as DeletionLogExportRow[];
  });
}

/**
 * S-73 — gets the most recent purge audit record for a business.
 */
export async function getLastPurge(
  businessId: string,
): Promise<LastPurgeInfo | null> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("deletion_log_purges")
      .select("id, purged_at, purged_by, entries_removed")
      .eq("business_id", businessId)
      .order("purged_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    const purge = data?.[0];
    if (!purge) return null;
    let purgerName = "Former member";
    if (purge.purged_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", purge.purged_by)
        .maybeSingle();
      if (profile) {
        purgerName = profile.full_name ?? profile.email ?? "Former member";
      }
    }

    return {
      id: purge.id,
      purged_at: purge.purged_at,
      purger_name: purgerName,
      entries_removed: purge.entries_removed,
    };
  });
}


/**
 * S-75: Bulk restore deleted items. Owner only. Max 100 per call.
 */
export async function bulkRestoreDeleted(logIds: string[]): Promise<number> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("bulk_restore_deleted", {
      p_log_ids: logIds,
    });
    if (error) throw error;
    const res = data as { count?: number } | number;
    return typeof res === "object" ? Number(res?.count ?? 0) : Number(res ?? 0);
  });
}
