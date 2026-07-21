# OneStack API (NestJS + Prisma) for Cloud Run. Build context is the repo ROOT (npm workspaces).
# Two stages: install+build with dev deps, then a lean runtime layer.
FROM node:20-slim AS base
# Prisma's query engine needs openssl at both generate and run time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build ----
FROM base AS build
# Copy the lockfile + every workspace manifest first, so `npm ci` layer-caches across source edits.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# The API's postinstall runs `prisma generate`, which needs the schema present before `npm ci`.
COPY apps/api/prisma apps/api/prisma
RUN npm ci
# The API's tsconfig.json extends the repo-root tsconfig.base.json — without it tsc can't resolve the
# base compiler options and the build fails (TS5083 + spurious type errors).
COPY tsconfig.base.json tsconfig.base.json
# Now the API source, and compile tsc -> dist.
COPY apps/api apps/api
RUN npm run build --workspace @onestack/api

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Bring the installed node_modules (incl. the generated Prisma client) and the built API.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
# main.ts listens on process.env.PORT (Cloud Run injects PORT=8080).
CMD ["node", "dist/main.js"]
