# OneStack web (Next.js App Router) for Cloud Run. Build context is the repo ROOT (npm workspaces).
FROM node:20-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build ----
FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# `npm ci` runs the API workspace's postinstall (prisma generate), which needs the schema.
COPY apps/api/prisma apps/api/prisma
RUN npm ci
# Root tsconfig base, in case any workspace config resolves it during the Next build.
COPY tsconfig.base.json tsconfig.base.json
COPY apps/web apps/web
# next.config.mjs inlines ONESTACK_API_BASE at build time, so the deployed API URL must be known here.
ARG ONESTACK_API_BASE
ENV ONESTACK_API_BASE=$ONESTACK_API_BASE
RUN npm run build --workspace @onestack/web

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web
# Drop root (security gate: missing-user). `next start` may write to .next/cache, so hand that dir to
# the unprivileged `node` user; node_modules stays root-owned but world-readable, which is enough.
RUN chown -R node:node /app/apps/web
WORKDIR /app/apps/web
USER node
# The `start` script hardcodes -p 3000; Cloud Run needs the injected $PORT, so start next directly.
# npm ci hoists dependencies to the REPO ROOT node_modules, so the `next` binary lives at
# /app/node_modules/.bin/next — not apps/web/node_modules. Call the hoisted one explicitly.
CMD ["sh", "-c", "/app/node_modules/.bin/next start -p ${PORT:-8080}"]
