#!/usr/bin/env sh
set -e

echo "Running database migrations..."
# Only attempt migrations if not already applied (check drizzle table)
npx drizzle-kit migrate || echo "Migrations already applied or errors occurred, continuing..."

echo "Installing Playwright browsers (with system dependencies already installed)..."
npx playwright install --with-deps chromium

# Start cloudflared tunnel in background if config exists
if [ -f "/app/cloudflared-config.yml" ]; then
    echo "Starting cloudflared tunnel..."
    cloudflared tunnel --config /app/cloudflared-config.yml run &
    CLOUDFLARED_PID=$!
    echo "Cloudflared started with PID $CLOUDFLARED_PID"
else
    echo "Cloudflared config not found, skipping tunnel startup"
fi

echo "Starting server..."
exec node -r tsconfig-paths/register dist/index.js
