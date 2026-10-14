import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";
import type {
  Transaction,
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

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

export async function listTransactionsByCustomer(
  customerId: string,
  businessId: string,
): Promise<Transaction[]> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("occurred_at", { ascending: false });

    if (error) throw error;
    return data as Transaction[];
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

export async function updateTransactionStatus(
  id: string,
  status: "active" | "edited" | "voided",
  businessId: string,
): Promise<Transaction> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId)
      .select()
      .single();

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
    const { data, error } = await supabase
      .from("transactions")
      .update({
        ...input,
        status: "edited",
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

export async function getTodayActivity(businessId: string): Promise<{
  count: number;
  net: number;
}> {
  return guard(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("business_id", businessId)
      .eq("status", "active")
      .gte("occurred_at", today.toISOString())
      .lt("occurred_at", tomorrow.toISOString());

    if (error) throw error;

    const txs = data as Array<{ type: TransactionType; amount: number }>;
    const net = txs.reduce((sum, transaction) => {
      return transaction.type === "charge"
        ? sum + transaction.amount
        : sum - transaction.amount;
    }, 0);

    return { count: txs.length, net };
  });
}

export async function getAllTransactions(
  businessId: string,
  options?: {
    dateRange?: { start: string; end: string } | null;
    typeFilter?: "all" | "charge" | "payment";
  },
): Promise<TransactionWithCustomer[]> {
  return guard(async () => {
    let query = supabase
      .from("transactions")
      .select("*, customers(name, phone)")
      .eq("business_id", businessId)
      .in("status", ["active", "edited"]);

    if (options?.dateRange) {
      query = query
        .gte("occurred_at", options.dateRange.start)
        .lt("occurred_at", options.dateRange.end);
    }

    if (options?.typeFilter && options.typeFilter !== "all") {
      query = query.eq("type", options.typeFilter);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (
      data as Array<
        Transaction & { customers: { name: string; phone: string } | null }
      >
    ).map((tx) => ({
      ...tx,
      customer_name: tx.customers?.name ?? "Unknown",
      customer_phone: tx.customers?.phone ?? "",
    }));
  });
}

export async function getTransactionById(
  id: string,
  businessId: string,
): Promise<TransactionWithCustomer | null> {
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
    };
    return {
      ...tx,
      customer_name: tx.customers?.name ?? "Unknown",
      customer_phone: tx.customers?.phone ?? "",
    };
  });
}

export async function getTodayTransactions(
  businessId: string,
  limit = 5,
) {
  return guard(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, occurred_at, customer_id, customers(name)")
      .eq("business_id", businessId)
      .eq("status", "active")
      .gte("occurred_at", today.toISOString())
      .lt("occurred_at", tomorrow.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (
      data as unknown as Array<{
        id: string;
        type: TransactionType;
        amount: number;
        occurred_at: string;
        customer_id: string;
        customers: { name: string } | null;
      }>
    ).map((tx) => ({
      ...tx,
      customer_name: tx.customers?.name ?? "Unknown",
    }));
  });
}
