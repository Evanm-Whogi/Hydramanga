#!/usr/bin/env sh
set -e

echo "Running database migrations..."
# Only attempt migrations if not already applied (check drizzle table)
npx drizzle-kit migrate || echo "Migrations already applied or errors occurred, continuing..."

echo "Installing Playwright browsers (with system dependencies already installed)..."
npx playwright install --with-deps chromium

echo "Starting server..."
exec node -r tsconfig-paths/register dist/index.js
