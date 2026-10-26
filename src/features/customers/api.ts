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
      // S-30: every picker and the dashboard's customer feed read this —
      // archived customers step out of them; restore brings them back.
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Customer[];
  });
}

// ---------------------------------------------------------------------------
// S-28: the list view's server-side query
// ---------------------------------------------------------------------------

export type CustomerStatusFilter =
  | "all"
  | "owes"
  | "credit"
  | "settled"
  | "archived";
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
  /**
   * S-30: null/absent = active; a timestamp = archived (kept with all
   * history, out of every working set). Optional because rows arrive
   * from the server only after migration 0004 is applied.
   */
  archived_at?: string | null;
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
    if (status === "archived") {
      // S-30: the Archived filter is the one view that shows archived
      // rows — with their real balances (the view keeps them).
      query = query.not("archived_at", "is", null);
    } else {
      // Every other status is the working set: archived customers are
      // left out of lists, search and pickers alike.
      query = query.is("archived_at", null);
      if (status === "owes") {
        query = query.gt("customer_balances.balance", 0);
      } else if (status === "credit") {
        query = query.lt("customer_balances.balance", 0);
      } else if (status === "settled") {
        query = query.eq("customer_balances.balance", 0);
      }
    }

    const sortColumn =
      // To-one embedded columns use the documented parenthesized
      // order form — `order=customer_balances(balance)`.
      sort === "balance"
        ? "customer_balances(balance)"
        : sort === "created"
          ? "created_at"
          : "name";
    query = query
      .order(sortColumn, { ascending: dir === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // The unfiltered customer count feeds the summary strip even while a
    // filter narrows the table. It counts the working set: archived
    // customers are left out of every total (S-30).
    const [paged, all] = await Promise.all([
      query,
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .is("archived_at", null),
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

// ---------------------------------------------------------------------------
// S-30: archive, restore, count for the confirm copy, permanent delete
// ---------------------------------------------------------------------------

/**
 * Archive (archived = true) or restore (archived = false) one customer.
 * Plain RLS on customers: editors and owners can update, viewers match
 * zero rows. Nothing about the customer's transactions changes.
 */
export async function setCustomerArchived(
  id: string,
  archived: boolean,
  businessId: string,
): Promise<Customer> {
  return guard(async () => {
    const { data, error } = await supabase
      .from("customers")
      .update({
        archived_at: archived ? new Date().toISOString() : null,
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

/**
 * Exact transaction count for one customer — the confirm dialogs say
 * exactly how much history is kept (archive) or removed (delete).
 * Every status counts: history is history.
 */
export async function countCustomerTransactions(
  customerId: string,
  businessId: string,
): Promise<number> {
  return guard(async () => {
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("business_id", businessId);

    if (error) throw error;
    return count ?? 0;
  });
}

/**
 * The only operation that destroys history: owner-only on the server
 * (migration 0004's RPC), atomic across the customer and every one of
 * their transactions. businessId rides along per the S-20 contract and
 * is checked against the row inside the function. v3 (S-52): the RPC
 * returns the deletion_log id, so the UI can offer Undo — hand it to
 * restoreDeleted.
 */
export async function deleteCustomerPermanently(
  id: string,
  businessId: string,
): Promise<string> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("delete_customer_permanently", {
      p_customer_id: id,
      p_business_id: businessId,
    });

    if (error) throw error;
    return data as string;
  });
}
