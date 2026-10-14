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

export async function listCustomers(businessId: string): Promise<Customer[]> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Customer[];
  });
}

// ---------------------------------------------------------------------------
// S-28: the list view's server-side query
// ---------------------------------------------------------------------------

export type CustomerStatusFilter = "all" | "owes" | "credit" | "settled";
export type CustomerSortField = "name" | "balance" | "created";

export interface CustomerListParams {
  /** Case-insensitive match on name or phone; empty = no search. */
  search?: string;
  status?: CustomerStatusFilter;
  sort?: CustomerSortField;
  dir?: "asc" | "desc";
  /** 1-based page. */
  page?: number;
  pageSize?: number;
}

export interface CustomerListRow extends Customer {
  balance: number;
  /** Most recent transaction date, or null when the customer has none. */
  last_activity: string | null;
}

export interface CustomerListResult {
  items: CustomerListRow[];
  /** Customers matching search + filter — drives paging. */
  total: number;
  /** Every customer in the business — feeds the summary strip. */
  allTotal: number;
}

/**
 * Make a search term safe for PostgREST: LIKE wildcards are escaped so
 * the term matches literally, and the characters that would break the
 * `or=(...)` filter syntax are blanked out (a phone typed as "(0171)"
 * still matches, just without the parentheses).
 */
function escapeSearch(raw: string): string {
  return raw
    .replace(/[\\%_]/g, (ch) => `\\${ch}`)
    .replace(/[,()"]/g, " ");
}

interface CustomerListQueryRow extends Customer {
  customer_balances: { balance: number } | null;
  transactions: Array<{ occurred_at: string }> | null;
}

/**
 * One server-side query for the customers list (S-28): search, balance
 * filter, sort and paging are all applied by the database, with an exact
 * count for the pager. The balance comes from the same security-invoker
 * `customer_balances` view every other balance read uses (S-20) — joined
 * `!inner`, and the view includes every non-deleted customer (a left
 * join + coalesce), so nothing drops out. Last activity is the newest
 * `occurred_at` among the row's transactions, embedded for the page's
 * rows only.
 */
export async function queryCustomers(
  businessId: string,
  params: CustomerListParams = {},
): Promise<CustomerListResult> {
  return guard(async () => {
    const page = Math.max(1, Math.trunc(params.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(params.pageSize ?? 10));
    const search = (params.search ?? "").trim();
    const status = params.status ?? "all";
    const sort = params.sort ?? "name";
    const dir = params.dir ?? "asc";

    let query = supabase
      .from("customers")
      .select(
        "*, customer_balances!inner(balance), transactions(occurred_at)",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .is("deleted_at", null);

    if (search) {
      const pattern = escapeSearch(search);
      query = query.or(`name.ilike.%${pattern}%,phone.ilike.%${pattern}%`);
    }
    if (status === "owes") {
      query = query.gt("customer_balances.balance", 0);
    } else if (status === "credit") {
      query = query.lt("customer_balances.balance", 0);
    } else if (status === "settled") {
      query = query.eq("customer_balances.balance", 0);
    }

    const sortColumn =
      sort === "balance"
        ? "customer_balances.balance"
        : sort === "created"
          ? "created_at"
          : "name";
    query = query
      .order(sortColumn, { ascending: dir === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // The unfiltered customer count feeds the summary strip even while a
    // filter narrows the table.
    const [paged, all] = await Promise.all([
      query,
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .is("deleted_at", null),
    ]);
    if (paged.error) throw paged.error;
    if (all.error) throw all.error;

    const items: CustomerListRow[] = ((paged.data ?? []) as CustomerListQueryRow[]).map(
      (row) => {
        const { customer_balances, transactions, ...customer } = row;
        let lastActivity: string | null = null;
        for (const tx of transactions ?? []) {
          if (lastActivity === null || tx.occurred_at > lastActivity) {
            lastActivity = tx.occurred_at;
          }
        }
        return {
          ...customer,
          balance: customer_balances?.balance ?? 0,
          last_activity: lastActivity,
        };
      },
    );

    return {
      items,
      total: paged.count ?? 0,
      allTotal: all.count ?? 0,
    };
  });
}

export async function getCustomer(
  id: string,
  businessId: string,
): Promise<Customer> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .eq("business_id", businessId)
      .single();

    if (error) throw error;
    return data as Customer;
  });
}

export async function createCustomer(
  input: CustomerInput,
  businessId: string,
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
        business_id: businessId,
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
  businessId: string,
): Promise<Customer> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customers")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) throw error;
    return data as Customer;
  });
}
