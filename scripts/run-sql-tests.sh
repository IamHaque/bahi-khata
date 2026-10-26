#!/usr/bin/env bash
# Runs every migration, then the SQL test suite, against a SCRATCH Postgres database.
# Usage:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bash scripts/run-sql-tests.sh
# NEVER point this at a real Supabase project: it installs a stub `auth` schema and roles.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a scratch Postgres database}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "==> installing the Supabase stub"
"${PSQL[@]}" -f supabase/tests/ci/supabase_stub.sql

echo "==> applying migrations in filename order"
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "    $f"
  "${PSQL[@]}" -f "$f" >/dev/null
done

echo "==> running the SQL test suite (any failure stops here)"
if out=$("${PSQL[@]}" -o /dev/null -f supabase/tests/bahikhata_consolidated_tests.sql 2>&1); then
  echo "$out" | sed 's/^psql:[^ ]* //' | grep -E "NOTICE" || true
  echo "==> SQL tests passed"
else
  echo "$out"
  echo "==> SQL tests FAILED"
  exit 1
fi
