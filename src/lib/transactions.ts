import { supabase } from "@/lib/supabase";
import type { Transaction, TransactionType, TransactionWithCustomer } from "@/types";

export async function listTransactionsByCustomer(customerId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .order("occurred_at", { ascending: false });

  if (error) throw error;
  return data as Transaction[];
}

export async function createTransaction(input: {
  customer_id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
  note?: string;
  source?: "manual" | "import";
}) {
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
    })
    .select()
    .single();

  if (error) throw error;
  return data as Transaction;
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
) {
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
  }));

  const { data, error } = await supabase
    .from("transactions")
    .insert(rows)
    .select();

  if (error) throw error;
  return data as Transaction[];
}

export async function updateTransactionStatus(
  id: string,
  status: "active" | "edited" | "voided",
) {
  const { data, error } = await supabase
    .from("transactions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(
  id: string,
  input: Partial<Pick<Transaction, "type" | "amount" | "occurred_at" | "note">>,
) {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      ...input,
      status: "edited",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function getCustomerBalance(customerId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc("get_customer_balance", { p_customer_id: customerId });

  if (error) throw error;

  return Number(data ?? 0);
}

export async function getAllCustomerBalances(): Promise<
  Record<string, number>
> {
  const { data, error } = await supabase
    .rpc("get_all_customer_balances");

  if (error) throw error;

  const balances: Record<string, number> = {};
  for (const row of data as Array<{ customer_id: string; balance: number }>) {
    balances[row.customer_id] = row.balance;
  }

  return balances;
}

export async function getTodayActivity(): Promise<{
  count: number;
  net: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("status", "active")
    .gte("occurred_at", today.toISOString())
    .lt("occurred_at", tomorrow.toISOString());

  if (error) throw error;

  const txs = data as Array<{ type: TransactionType; amount: number }>;
  const net = txs.reduce((sum, tx) => {
    return tx.type === "charge" ? sum + tx.amount : sum - tx.amount;
  }, 0);

  return { count: txs.length, net };
}

export async function getAllTransactions(options?: {
  dateRange?: { start: string; end: string } | null;
  typeFilter?: "all" | "charge" | "payment";
}): Promise<TransactionWithCustomer[]> {
  let query = supabase
    .from("transactions")
    .select("*, customers(name, phone)")
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

  return (data as Array<Transaction & { customers: { name: string; phone: string } | null }>).map(
    (tx) => ({
      ...tx,
      customer_name: tx.customers?.name ?? "Unknown",
      customer_phone: tx.customers?.phone ?? "",
    }),
  );
}

export async function getTransactionById(id: string): Promise<TransactionWithCustomer | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, customers(name, phone)")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  const tx = data as Transaction & { customers: { name: string; phone: string } | null };
  return {
    ...tx,
    customer_name: tx.customers?.name ?? "Unknown",
    customer_phone: tx.customers?.phone ?? "",
  };
}

export async function getTodayTransactions(limit = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, occurred_at, customer_id, customers(name)")
    .eq("status", "active")
    .gte("occurred_at", today.toISOString())
    .lt("occurred_at", tomorrow.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data as unknown as Array<{
    id: string;
    type: TransactionType;
    amount: number;
    occurred_at: string;
    customer_id: string;
    customers: { name: string } | null;
  }>).map((tx) => ({
    ...tx,
    customer_name: tx.customers?.name ?? "Unknown",
  }));
}
