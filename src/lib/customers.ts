import { supabase } from "@/lib/supabase";
import type { Customer } from "@/types";

export type CustomerInput = Pick<Customer, "name"> &
  Partial<
    Pick<
      Customer,
      | "phone"
      | "email"
      | "address"
      | "alternate_contact_name"
      | "alternate_contact_phone"
      | "tags"
      | "notes"
    >
  >;

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

export async function createCustomer(input: CustomerInput) {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      alternate_contact_name: input.alternate_contact_name ?? null,
      alternate_contact_phone: input.alternate_contact_phone ?? null,
      tags: input.tags ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
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
