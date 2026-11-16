#!/usr/bin/env bash
# Applies every migration to a fresh database and runs constraint checks.
# Usage: DATABASE_ADMIN_URL=postgresql://postgres@localhost:5432/postgres scripts/test-db.sh
set -euo pipefail
ADMIN_URL="${DATABASE_ADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
DB="intelpro_migration_test_$$"
cd "$(dirname "$0")/.."

psql "$ADMIN_URL" -qc "CREATE DATABASE $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
TEST_URL="${ADMIN_URL%/*}/$DB"

for m in prisma/migrations/*/migration.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null
  echo "applied $m"
done
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f tests/db/constraints.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
echo "database checks passed"
