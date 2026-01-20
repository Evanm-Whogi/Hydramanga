# Multi-stage build for Next.js client
# 1) Install dependencies and build
FROM node:20-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci

FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Accept build arg for backend URL (baked into next.config at build time)
ARG BACKEND_INTERNAL_URL=http://localhost:4000
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2) Production image with minimal footprint
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js requires a non-root user when running standalone
RUN addgroup --system nextjs && adduser --system --ingroup nextjs nextjs

# Copy build artifacts as root, then fix ownership and writable cache dir
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Ensure .next cache (including images) is writable by runtime user
RUN mkdir -p /app/.next/cache/images && \
	chown -R nextjs:nextjs /app/.next /app/public /app/node_modules /app/package.json

# Drop privileges
USER nextjs

EXPOSE 3000
CMD ["npm", "run", "start"]
