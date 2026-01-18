# Node base image
FROM node:20-bookworm AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci

# Build TypeScript
COPY . .
RUN npm run build

# Production runtime
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only copy needed artifacts
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
