import { supabase } from "@/lib/supabase";
import type { Customer } from "@/types";

export async function listCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data as Customer[];
}

export async function getCustomer(id: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Customer;
}

export type CustomerInput = Pick<Customer, "name"> &
  Partial<Pick<Customer, "phone" | "email" | "address" | "notes">>;

export async function createCustomer(input: CustomerInput) {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(
  id: string,
  input: Partial<Pick<Customer, "name" | "phone" | "email" | "address" | "notes">>,
) {
  const { data, error } = await supabase
    .from("customers")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}
