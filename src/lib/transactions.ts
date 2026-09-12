import { supabase } from "@/lib/supabase";
import type { Transaction, TransactionType } from "@/types";

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
    .from("transactions")
    .select("type, amount")
    .eq("customer_id", customerId)
    .in("status", ["active", "edited"]);

  if (error) throw error;

  return (data as Array<{ type: TransactionType; amount: number }>).reduce(
    (balance, tx) => {
      return tx.type === "charge" ? balance + tx.amount : balance - tx.amount;
    },
    0,
  );
}

export async function getAllCustomerBalances(): Promise<
  Record<string, number>
> {
  const { data, error } = await supabase
    .from("transactions")
    .select("customer_id, type, amount")
    .in("status", ["active", "edited"]);

  if (error) throw error;

  const balances: Record<string, number> = {};
  for (const tx of data as Array<{
    customer_id: string;
    type: TransactionType;
    amount: number;
  }>) {
    const current = balances[tx.customer_id] ?? 0;
    balances[tx.customer_id] =
      tx.type === "charge" ? current + tx.amount : current - tx.amount;
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
