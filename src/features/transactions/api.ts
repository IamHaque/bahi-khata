import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";
import type {
  Transaction,
  TransactionStatus,
  TransactionSource,
  TransactionType,
  TransactionWithCustomer,
} from "@/types";

export interface DashboardTopDebtor {
  id: string;
  name: string;
  balance: number;
}

export interface DashboardSummary {
  total_receivable: number;
  total_credit: number;
  open_accounts: number;
  today_count: number;
  today_net: number;
  customer_count: number;
  top_debtors: DashboardTopDebtor[];
}

/**
 * S-33 — a ledger row with the audit data the Edited badge needs.
 * `updated_by` is a real column (migration 0001) that the v1 base
 * type never grew; `updated_by_name` is resolved here against
 * profiles.
 */
export interface TransactionWithEditor extends Transaction {
  updated_by?: string | null;
  updated_by_name?: string | null;
}

/**
 * S-34 — a ledger row with everything the void/restore story reads:
 * the void's reason and its audit stamps (columns from migration 0001,
 * the reason from 0005).
 */
export interface TransactionWithAudit extends TransactionWithEditor {
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * S-31 — one row of the customer detail ledger: the entry plus the
 * balance as of after it. `balance_after` is computed by the
 * `customer_ledger` RPC (migration 0006): the cumulative
 * charge-minus-payment total in date order with voided rows
 * contributing nothing — NUMERIC arithmetic in the database, never in
 * the browser. `updated_by`/`updated_by_name` feed the S-33 Edited
 * badge; voided rows come back too (the UI shows them muted).
 */
export interface CustomerLedgerRow {
  id: string;
  customer_id: string;
  occurred_at: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  /** The badge's "on <date>" — the row's own audit stamp. */
  updated_at: string;
  updated_by_name: string | null;
  balance_after: number;
}

/**
 * S-31 — the customer detail ledger. Security INVOKER on the server:
 * the caller's RLS scopes the read, and the business id scopes the
 * cached entry (S-20 contract).
 */
export async function getCustomerLedger(
  customerId: string,
  businessId: string,
): Promise<CustomerLedgerRow[]> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("customer_ledger", {
      p_customer_id: customerId,
      p_business_id: businessId,
    });

    if (error) throw error;

    const rows = (data ?? []) as Array<
      Omit<CustomerLedgerRow, "updated_by_name">
    >;

    // Resolve the last editor for the badge in one extra query — there
    // is no transactions→profiles foreign key to embed through
    // (updated_by points at auth.users). Profiles RLS shows
    // co-members; an editor who has since left resolves to nothing and
    // the badge falls back to "Former member".
    const editorIds = [
      ...new Set(
        rows
          .map((row) => row.updated_by)
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];
    if (editorIds.length === 0) {
      return rows.map((row) => ({ ...row, updated_by_name: null }));
    }

    const { data: editorData, error: editorError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", editorIds);
    if (editorError) throw editorError;

    const names = new Map(
      (
        (editorData ?? []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>
      ).map((profile) => [profile.id, profile.full_name ?? profile.email ?? null]),
    );
    return rows.map((row) => ({
      ...row,
      updated_by_name: row.updated_by
        ? (names.get(row.updated_by) ?? null)
        : null,
    }));
  });
}

export async function createTransaction(
  input: {
    customer_id: string;
    type: TransactionType;
    amount: number;
    occurred_at: string;
    note?: string;
    source?: "manual" | "import";
  },
  businessId: string,
): Promise<Transaction> {
  return guard(async () => {
    const { data: userResult } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        customer_id: input.customer_id,
        type: input.type,
        amount: input.amount,
        occurred_at: input.occurred_at,
        note: input.note ?? null,
        source: input.source ?? "manual",
        status: "active",
        created_by: userResult.user?.id ?? "",
        business_id: businessId,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Transaction;
  });
}

export async function createTransactionsBatch(
  transactions: Array<{
    customer_id: string;
    type: TransactionType;
    amount: number;
    occurred_at: string;
    note?: string;
    source?: "manual" | "import";
  }>,
  businessId: string,
): Promise<Transaction[]> {
  return guard(async () => {
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id ?? "";

    const rows = transactions.map((t) => ({
      customer_id: t.customer_id,
      type: t.type,
      amount: t.amount,
      occurred_at: t.occurred_at,
      note: t.note ?? null,
      source: t.source ?? "manual",
      status: "active" as const,
      created_by: userId,
      business_id: businessId,
    }));

    const { data, error } = await supabase
      .from("transactions")
      .insert(rows)
      .select();

    if (error) throw error;
    return data as Transaction[];
  });
}

/**
 * S-34 — void instead of erase: the row stays, marked with who voided
 * it, when, and why. `updated_by` is deliberately untouched — it still
 * means "content-edited at least once", which is how restore decides
 * between "edited" and "active" (migration 0005). Balance views and
 * dashboard_summary already exclude voided rows.
 */
export async function voidTransaction(
  id: string,
  reason: string | null,
  businessId: string,
): Promise<Transaction> {
  return guard(async () => {
    const { data: userResult } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("transactions")
      .update({
        status: "voided",
        void_reason: reason,
        voided_at: new Date().toISOString(),
        voided_by: userResult.user?.id ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throw error;
    return data as Transaction;
  });
}

/**
 * S-34 — bring a voided row back. The restored status is the row's to
 * decide ("edited" if it had been edited before, otherwise "active"),
 * so this goes through the security-invoker RPC from migration 0005
 * rather than a payload the client would have to guess.
 */
export async function restoreTransaction(
  id: string,
  businessId: string,
): Promise<Transaction> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("restore_transaction", {
      p_transaction_id: id,
      p_business_id: businessId,
    });

    if (error) throw error;
    return data as Transaction;
  });
}

export async function updateTransaction(
  id: string,
  input: Partial<Pick<Transaction, "type" | "amount" | "occurred_at" | "note">>,
  businessId: string,
): Promise<Transaction> {
  return guard(async () => {
    // S-33: stamp who edited — the Edited badge reads it back with
    // updated_at. Provenance fields (source, created_by, customer_id,
    // business_id) are not in the payload and can never change here.
    const { data: userResult } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("transactions")
      .update({
        ...input,
        status: "edited",
        updated_at: new Date().toISOString(),
        updated_by: userResult.user?.id ?? "",
      })
      .eq("id", id)
      .eq("business_id", businessId)
      // S-34: a voided row can only come back through restore — an
      // edit can never silently un-void it.
      .neq("status", "voided")
      .select()
      .single();

    if (error) throw error;
    return data as Transaction;
  });
}

/**
 * A customer's net balance (charge minus payment), scoped to the business
 * (S-20). Reads the security-invoker `customer_balances` view, so the
 * caller's RLS applies: a non-member sees no row and gets 0.
 */
export async function getCustomerBalance(
  customerId: string,
  businessId: string,
): Promise<number> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customer_balances")
      .select("balance")
      .eq("customer_id", customerId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throw error;
    return Number(data?.balance ?? 0);
  });
}

/**
 * Every customer's balance in one business (S-20), from the same scoped
 * view. The old `get_all_customer_balances` RPC was unscoped (DEV-8): it
 * returned balances across every business, which breaks tenancy.
 */
export async function getAllCustomerBalances(
  businessId: string,
): Promise<Record<string, number>> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customer_balances")
      .select("customer_id, balance")
      .eq("business_id", businessId)
      // S-30 (documented touch-zone stretch): archived customers are
      // left out of totals — the customers-page strip and the dashboard
      // compute "Owes you / You owe" straight from this feed. The view
      // still carries archived rows (the Archived filter needs their
      // balances), so the exclusion belongs here, at the totals' source.
      .is("archived_at", null);

    if (error) throw error;

    const balances: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{
      customer_id: string;
      balance: number;
    }>) {
      balances[row.customer_id] = row.balance;
    }

    return balances;
  });
}

export async function getDashboardSummary(
  businessId: string,
): Promise<DashboardSummary> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("dashboard_summary", {
      p_business_id: businessId,
    });

    if (error) throw error;

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      total_receivable: Number(row.total_receivable ?? 0),
      total_credit: Number(row.total_credit ?? 0),
      open_accounts: Number(row.open_accounts ?? 0),
      today_count: Number(row.today_count ?? 0),
      today_net: Number(row.today_net ?? 0),
      customer_count: Number(row.customer_count ?? 0),
      top_debtors: (row.top_debtors as DashboardTopDebtor[] | null) ?? [],
    };
  });
}

/**
 * S-35 — one row of the transactions page's detailed view: the stored
 * entry, the linked customer (name + phone — the linked column and
 * half of the search) and the resolved names of the creator and last
 * editor. Everything (filter, sort, page) is decided SERVER-side; the
 * customer join is `!inner` so the archived-customer exclusion can
 * ride on it.
 */
export interface TransactionListRow extends Transaction {
  customer: { id: string; name: string; phone: string | null };
  /** The S-35 "Recorded by" label; null renders "Former member". */
  created_by_name?: string | null;
  /** The S-33 Edited badge's editor; null renders "Former member". */
  updated_by_name?: string | null;
}

export interface TransactionListParams {
  /** Half-open [start, end) instants; null = unbounded on that side. */
  range?: { start: string; end: string } | null;
  type?: "all" | "charge" | "payment";
  customerId?: string | null;
  /** Substring over customer name, customer phone and the note. */
  search?: string;
  includeVoided?: boolean;
  /** "occurred_at" (default) or "amount". */
  sort?: string;
  dir?: "asc" | "desc";
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface TransactionListResult {
  rows: TransactionListRow[];
  /** Every row matching the filter, not just this page. */
  total: number;
}

export async function queryTransactions(
  businessId: string,
  params: TransactionListParams,
): Promise<TransactionListResult> {
  return guard(async () => {
    const ascending = params.dir === "asc";
    const column = params.sort === "amount" ? "amount" : "occurred_at";

    let query = supabase
      .from("transactions")
      // Inner join: feeds the linked customer column AND lets one
      // filter drop archived customers' rows entirely (the scenario
      // "Archived customers") — their history lives on their own
      // detail page, not in the cross-customer feed.
      .select("*, customer:customers!inner(id, name, phone)", {
        count: "exact",
      })
      .eq("business_id", businessId)
      .is("customers.archived_at", null)
      .order(column, { ascending })
      // A deterministic tiebreak keeps paging stable across requests.
      .order("id", { ascending });

    if (params.range) {
      query = query
        .gte("occurred_at", params.range.start)
        .lt("occurred_at", params.range.end);
    }
    if (params.type === "charge" || params.type === "payment") {
      query = query.eq("type", params.type);
    }
    if (params.customerId) {
      query = query.eq("customer_id", params.customerId);
    }
    if (!params.includeVoided) {
      query = query.neq("status", "voided");
    }
    const search = params.search?.trim();
    if (search) {
      // One OR across the customer columns and the note: the embedded
      // paths filter the transaction through the !inner join.
      query = query.or(
        `customers.name.ilike.%${search}%,customers.phone.ilike.%${search}%,note.ilike.%${search}%`,
      );
    }

    const from = (params.page - 1) * params.pageSize;
    query = query.range(from, from + params.pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Array<
      Transaction & {
        customer: { id: string; name: string; phone: string | null };
        updated_by?: string | null;
      }
    >;

    // One profiles lookup feeds both names the row can show (the
    // creator's "Recorded by" and the S-33 badge's editor). Profiles
    // RLS shows co-members; a person who has since left resolves to
    // nothing → "Former member" (the S-25/0002c data contract).
    const personIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.created_by, row.updated_by ?? null])
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];
    if (personIds.length === 0) {
      return {
        rows: rows.map((row) => ({
          ...row,
          created_by_name: null,
          updated_by_name: null,
        })),
        total: count ?? 0,
      };
    }

    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", personIds);
    if (peopleError) throw peopleError;

    const names = new Map(
      (
        (people ?? []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>
      ).map((profile) => [profile.id, profile.full_name ?? profile.email ?? null]),
    );
    return {
      rows: rows.map((row) => ({
        ...row,
        created_by_name: row.created_by
          ? (names.get(row.created_by) ?? null)
          : null,
        updated_by_name: row.updated_by
          ? (names.get(row.updated_by) ?? null)
          : null,
      })),
      total: count ?? 0,
    };
  });
}

/**
 * S-35 — the summarized view and the totals footer, computed by
 * migration 0006b's `transaction_rollup` RPC: the same filters as the
 * detailed list, voided rows out unless asked for, archived customers
 * always out, periods cut in the CALLER'S timezone (so "today" is the
 * user's today) and handed back as wall-clock dates the client labels
 * with its normal local formatters. `granularity: null` returns one
 * row — the totals for everything matching, not only the page.
 */
export interface TransactionRollupParams {
  range?: { start: string; end: string } | null;
  type?: "all" | "charge" | "payment";
  customerId?: string | null;
  search?: string;
  includeVoided?: boolean;
  /** "day" | "week" | "month" | null (one row for the whole set). */
  granularity?: "day" | "week" | "month" | null;
}

export interface TransactionRollupRow {
  /** Wall clock ("2026-10-12T00:00:00") in the caller's timezone. */
  period_start: string | null;
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

export async function transactionRollup(
  businessId: string,
  params: TransactionRollupParams = {},
): Promise<TransactionRollupRow[]> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("transaction_rollup", {
      p_business_id: businessId,
      p_from: params.range?.start ?? null,
      p_to: params.range?.end ?? null,
      p_type:
        params.type === "charge" || params.type === "payment"
          ? params.type
          : null,
      p_customer_id: params.customerId ?? null,
      p_search: params.search?.trim() || null,
      p_include_voided: params.includeVoided ?? false,
      p_granularity: params.granularity ?? null,
      p_timezone: currentTimeZone(),
    });

    if (error) throw error;

    return (
      (data ?? []) as Array<{
        period_start: string | null;
        entries: number;
        total_charged: number;
        total_paid: number;
        net: number;
      }>
    ).map((row) => ({
      period_start: row.period_start,
      entries: Number(row.entries),
      total_charged: Number(row.total_charged),
      total_paid: Number(row.total_paid),
      net: Number(row.net),
    }));
  });
}

/** The browser's IANA zone — passed so SQL buckets periods the same
 *  way the client's date formatters label them. */
function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export async function getTransactionById(
  id: string,
  businessId: string,
): Promise<
  (TransactionWithCustomer & Pick<TransactionWithAudit, "void_reason">) | null
> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*, customers(name, phone)")
      .eq("id", id)
      .eq("business_id", businessId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    const tx = data as Transaction & {
      customers: { name: string; phone: string } | null;
      void_reason: string | null;
    };
    return {
      ...tx,
      customer_name: tx.customers?.name ?? "Unknown",
      customer_phone: tx.customers?.phone ?? "",
    };
  });
}
