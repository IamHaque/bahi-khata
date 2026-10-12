import { supabase } from "@/lib/supabase";
import { toAppError } from "@/lib/AppError";
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

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

export async function listCustomers(businessId?: string): Promise<Customer[]> {
  return guard(async () => {
    let query = supabase.from("customers").select("*");

    // TODO(S-20): businessId becomes required
    if (businessId) {
      query = query.eq("business_id", businessId);
    }

    const { data, error } = await query.order("name", { ascending: true });

    if (error) throw error;
    return data as Customer[];
  });
}

export async function getCustomer(
  id: string,
  businessId?: string,
): Promise<Customer> {
  return guard(async () => {
    let query = supabase.from("customers").select("*").eq("id", id);

    // TODO(S-20): businessId becomes required
    if (businessId) {
      query = query.eq("business_id", businessId);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    return data as Customer;
  });
}

export async function createCustomer(
  input: CustomerInput,
  businessId?: string,
): Promise<Customer> {
  return guard(async () => {
    const { data: userResult } = await supabase.auth.getUser();

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
        // TODO(S-20): businessId becomes required
        business_id: businessId ?? null,
        created_by: userResult.user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Customer;
  });
}

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInput>,
  businessId?: string,
): Promise<Customer> {
  return guard(async () => {
    let query = supabase
      .from("customers")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // TODO(S-20): businessId becomes required
    if (businessId) {
      query = query.eq("business_id", businessId);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    return data as Customer;
  });
}
