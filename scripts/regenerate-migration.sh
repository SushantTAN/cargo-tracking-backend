#!/usr/bin/env bash
# Regenerate the init migration from the current schema.
# Usage:  bash scripts/regenerate-migration.sh [migration_name]
#
# Writes ONLY SQL (stdout) into prisma/migrations/<name>/migration.sql.
# Stderr from the prisma CLI (config-loader messages etc.) is discarded
# so it never pollutes the SQL file and causes a syntax error on
# `prisma migrate deploy`.

set -euo pipefail

NAME="${1:-20260101000000_init}"
OUT_DIR="prisma/migrations/${NAME}"
OUT_FILE="${OUT_DIR}/migration.sql"

mkdir -p "$OUT_DIR"

# Wipe any previous content. We want ONLY valid SQL in this file.
: > "$OUT_FILE"

# stdout -> SQL file.  stderr (informational messages like "Loaded
# Prisma config...") -> /dev/null.
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script \
  >> "$OUT_FILE" 2>/dev/null

# Ensure migration_lock.toml exists.
if [ ! -f "prisma/migrations/migration_lock.toml" ]; then
  echo 'provider = "postgresql"' > prisma/migrations/migration_lock.toml
fi

echo "OK: wrote $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"
echo "First line: $(head -1 "$OUT_FILE")"
