# Node base image
FROM node:20-bookworm AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci

# Build TypeScript
COPY . .
RUN npm run build && npm run db:generate

# Production runtime
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Playwright system dependencies
RUN npx -y playwright@latest install-deps

# Only copy needed artifacts
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=base /app/src/db/migrations ./src/db/migrations
COPY ./entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 4000
CMD ["./entrypoint.sh"]
