# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile .

FROM node:24-slim AS base
ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# openssl must be present when `prisma generate` runs, or Prisma misdetects
# the engine target (openssl-1.1.x instead of 3.0.x); the runtime needs it too.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Prune the monorepo down to what "web" needs -----------------------------
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune web --docker

# --- Install dependencies (cached until a package.json/lockfile changes) -----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
# Scripts are skipped because prisma's postinstall needs the schema, which
# isn't in the pruned json output; generation happens in the builder stage.
RUN npm ci --ignore-scripts

# --- Build --------------------------------------------------------------------
FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
# The site key is inlined into the client bundle at build time.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Never queried during the build, but Prisma wants a value present.
ENV DATABASE_URL="file:/tmp/build.db"
# Run from apps/web: prisma is installed in the workspace's node_modules,
# not hoisted to the root.
RUN cd apps/web && npx prisma generate
RUN npx turbo run build --filter=web

# --- Standalone Prisma CLI for running migrations at container start ---------
FROM base AS prisma-cli
WORKDIR /prisma
RUN npm install prisma@6.19.3

# --- Runtime ------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data \
    && chown nextjs:nodejs /app/data

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL="file:/app/data/note.db"

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./prisma
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma/node_modules ./prisma-cli/node_modules
COPY --chown=nextjs:nodejs apps/web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
VOLUME /app/data

ENTRYPOINT ["./docker-entrypoint.sh"]
