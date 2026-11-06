# syntax=docker/dockerfile:1
# MediFlow Production Multi-Stage Dockerfile (Phase 6.3 - A6.3)
# Based on official Next.js 16 standalone deployment guide

# ─── Stage 1: Dependencies ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Install build dependencies for native modules if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: Builder ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set dummy build environment to permit Next.js route analysis
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PHASE=phase-production-build
ENV DATABASE_URL=postgres://build:build@localhost:5432/mediflow_build

RUN npm run build

# ─── Stage 3: Production Runner ───────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create unprivileged system group and user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Set up writable directory for temporary uploads/cache
RUN mkdir -p /tmp/mediflow && chown -R nextjs:nodejs /tmp/mediflow

# Copy public assets and standalone server output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Container liveness healthcheck using native Node.js fetch (zero external curl/wget dependencies)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'fetch("http://localhost:3000/api/health").then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))'

CMD ["node", "server.js"]
