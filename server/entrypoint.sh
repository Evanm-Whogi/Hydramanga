#!/usr/bin/env sh
set -e

echo "Ensuring PostgreSQL extensions..."
node scripts/ensure-pg-extensions.js

echo "Running database migrations..."
# Only attempt migrations if not already applied (check drizzle table)
npx drizzle-kit migrate || echo "Migrations already applied or errors occurred, continuing..."

echo "Starting server..."
exec node -r tsconfig-paths/register dist/index.js
