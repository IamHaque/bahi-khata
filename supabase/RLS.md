# Row-Level Security (RLS) Policies

> **Status:** Verified against live database on 2026-09-13 via SQL Editor queries.

Both tables have RLS **enabled** with **PERMISSIVE** policies granting `ALL` operations to the `authenticated` role.

---

## `customers`

| Policy Name | Operations | Role | USING (read filter) | WITH CHECK (write filter) |
|---|---|---|---|---|
| `Authenticated users can manage customers` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `true` (no filter) | `true` (no filter) |

**Plain English:** Any authenticated user can read, create, edit, and delete any row in the `customers` table. There is no row-level filtering — every signed-in user sees and can modify every customer.

**Implication:** This is a single-business app (per Section 7 of the original PRD). If multiple businesses ever share one Supabase project, this policy would need to be scoped per business/team. For now it is intentionally wide-open for all authenticated users.

---

## `transactions`

| Policy Name | Operations | Role | USING (read filter) | WITH CHECK (write filter) |
|---|---|---|---|---|
| `Authenticated users can manage transactions` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `true` (no filter) | `true` (no filter) |

**Plain English:** Any authenticated user can read, create, edit, and delete any row in the `transactions` table. There is no row-level filtering — every signed-in user sees and can modify every transaction.

---

## Finding: No Gap Detected

Both tables follow the same single-business, all-authenticated-users-equal-access model described in Section 7 of the original PRD. No policies are broader than intended — there are no anonymous-access policies and no policies that bypass authentication.

**Not flagged as a gap** because the intent matches the design. If the app scope ever changes (multi-tenancy, role-based access), these policies will need tightening.

---

## Raw SQL (for reference)

```sql
-- Enable RLS
ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- customers policy
CREATE POLICY "Authenticated users can manage customers"
  ON customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- transactions policy
CREATE POLICY "Authenticated users can manage transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```
