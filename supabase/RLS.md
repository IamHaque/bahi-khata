# Row-Level Security (RLS) Policies

> **Superseded (S-67).** This file described the **v1 single-business**
> policies ("any authenticated user can read every customer"). Those
> policies were dropped by S-20's contract phase; the app has been
> multi-business with membership-scoped RLS since v2, and v3.1 adds the
> deletion log, actor-stamping and new Owner-only functions.
>
> **The current RLS documentation lives in `docs/RLS.md`.** The proofs
> live in `supabase/tests/bahikhata_consolidated_tests.sql`.

The raw v1 SQL below is kept only as historical reference; it is no
longer what the database runs.

---

## Raw SQL (v1, historical)

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
