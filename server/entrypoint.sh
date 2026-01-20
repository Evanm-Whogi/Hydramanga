#!/usr/bin/env sh
set -e

echo "Running database migrations..."
npx drizzle-kit migrate

echo "Installing Playwright browsers (with system dependencies already installed)..."
npx playwright install --with-deps chromium

echo "Starting server..."
exec node -r tsconfig-paths/register dist/index.js
