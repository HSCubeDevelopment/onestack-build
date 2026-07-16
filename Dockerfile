# OneStack API — Cloud Run container. Monorepo-aware: installs the workspace, generates the Prisma
# client, compiles with tsc, and runs the built server. Connects out to Supabase (Sydney) at runtime.
FROM node:20-slim AS build
# Prisma engines need OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests first (better layer caching). Both workspace manifests are needed for `npm ci` to resolve.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Prisma schema is needed by apps/api's postinstall (`prisma generate`).
COPY apps/api/prisma apps/api/prisma
RUN npm ci

# API source, then build.
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npm run build

# ---- runtime image ----
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# Bring the installed deps (incl. generated Prisma client) and the compiled app.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
# Drop root. Nothing here writes to the image at runtime (Prisma's client is baked in at build, uploads
# go to Supabase Storage), so the app has no reason to run privileged. `node` is a uid 1000 user that
# ships with the base image. Cloud Run doesn't require root, and semgrep blocks the build without this.
USER node
# Cloud Run injects PORT (8080); main.ts reads process.env.PORT and binds 0.0.0.0.
CMD ["node", "dist/main.js"]
