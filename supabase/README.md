# Supabase — BahiKhata

This directory contains the version-controlled database schema and security policies for BahiKhata.

## Structure

```
supabase/
├── migrations/                  # SQL migration files (run in order)
│   └── 20260913152312_remote_schema.sql
├── RLS.md                       # Row-Level Security policy documentation
└── README.md                    # This file
```

## Applying Migrations to a Fresh Supabase Project

1. Create a new Supabase project at https://supabase.com/dashboard
2. Go to the **SQL Editor** in the dashboard
3. Run each migration file in `migrations/` in filename order (they are timestamped)
4. The latest migration is: `20260913152312_remote_schema.sql`

Alternatively, if you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push    # applies pending migrations to the remote database
```

## Applying Migrations Locally (with Supabase CLI)

```bash
supabase start        # starts local Supabase instance via Docker
supabase db reset     # resets local DB and applies all migrations
```

## What the Schema Contains

- **`customers`** — Customer records (name, phone, email, address, tags, notes)
- **`transactions`** — Ledger entries linked to customers (charge/payment, amount, date, status)
- **Enums** — `transaction_type`, `transaction_status`, `transaction_source`
- **RLS** — Row-Level Security enabled on both tables; all authenticated users have full access

See `RLS.md` for security policy details.

## Adding New Migrations

When you make schema changes:

1. Use `supabase db diff` (requires Docker) or manually write the SQL
2. Save it to `migrations/<timestamp>_description.sql`
3. Commit the new file to git
4. Apply to your remote database via `supabase db push` or the SQL Editor
