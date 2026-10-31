-- 0009: add the missing transactions.void_reason column.
--
-- Found on 2026-10-15 during the FIRST REAL EXECUTION of the v2
-- migration chain (docs/MANUAL_STEPS.md -> SYNC, step 3, file 7):
-- S-34's migration 0005 created restore_transaction(), whose body
-- sets void_reason = null; SQL test 0005 sets and reads the column in
-- four assertions; and src/features/transactions/api.ts writes it on
-- void (updateTransaction payload) and selects it for the detail
-- page. But no migration in 0001..0008 ever created the column —
-- unit tests mock the api layer and the responsive audit used
-- hand-built fixtures, so only a live database could surface the gap.
--
-- Plain nullable text, matching every consumer: the void sheet
-- validates <= 200 chars client-side (zod), SQL test 0005 inserts
-- ordinary strings, and no length CHECK is assumed anywhere.
--
-- Additive and idempotent (safe to re-run). A fresh project applying
-- 0001..0009 in order gets the column before any code path can
-- reference it. Migration 0005 stays untouched — it was already
-- applied to this project, and applied migrations are immutable
-- (log entry: docs/PROGRESS.md DEV-15).

alter table public.transactions
  add column if not exists void_reason text;
