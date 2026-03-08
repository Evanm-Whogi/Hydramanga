# Node base image
FROM node:20-bookworm AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci

# Build TypeScript
COPY . .
RUN npm run build && npm run db:generate

# Cached Playwright browsers (only re-downloads when PLAYWRIGHT_VERSION changes)
# Uses BuildKit cache mount so repeat builds reuse the download (no 30min wait)
FROM node:20-bookworm AS playwright-browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/pw-browsers
ENV PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=300000
ENV DEBIAN_FRONTEND=noninteractive
ARG PLAYWRIGHT_VERSION=1.57.0
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install-deps
RUN --mount=type=cache,target=/var/cache/pw-browsers \
    mkdir -p /pw-browsers && \
    (cp -a /var/cache/pw-browsers/. /pw-browsers 2>/dev/null || true) && \
    npx -y playwright@${PLAYWRIGHT_VERSION} install chromium && \
    cp -a /pw-browsers/. /var/cache/pw-browsers

# Production runtime
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/pw-browsers

# Longer timeouts for Playwright browser download (large binaries)
ENV PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=300000
ENV DEBIAN_FRONTEND=noninteractive

# Install Playwright system dependencies (no browser yet)
RUN npx -y playwright@latest install-deps

# Install cloudflared for tunnel (pinned URL avoids redirect; retries and timeouts for flaky networks)
ARG CLOUDFLARED_VERSION=2024.11.0
RUN curl -L --fail --connect-timeout 30 --max-time 120 --retry 3 --retry-delay 5 \
    -o /usr/local/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64" && \
    chmod +x /usr/local/bin/cloudflared

# Only copy needed artifacts
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=base /app/src/db/migrations ./src/db/migrations
COPY --from=base /app/src/templates ./dist/templates
COPY ./entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Use cached Chromium from dedicated stage (no download on rebuild unless PLAYWRIGHT_VERSION changes)
COPY --from=playwright-browsers /pw-browsers /pw-browsers

# Note: cloudflared config will be mounted as a volume in docker-compose

EXPOSE 4000
CMD ["./entrypoint.sh"]
