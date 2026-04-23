#!/bin/bash
# Apply all numbered migrations in order. Safe to run repeatedly (idempotent).
set -euo pipefail

DB_URL="${POSTGRES_URL:-postgresql://postgres:postgres@localhost:5432/agentplatform}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

echo "Applying migrations from $MIGRATIONS_DIR to $DB_URL"

for migration in "$MIGRATIONS_DIR"/*.sql; do
    filename=$(basename "$migration")
    echo "  → $filename"
    psql "$DB_URL" -f "$migration" -v ON_ERROR_STOP=1 -q
done

echo "Migrations complete."
