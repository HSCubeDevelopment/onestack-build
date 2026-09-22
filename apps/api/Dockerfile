# OneStack API — deployable image for Railway / Render / Fly.
#
# Built from the REPO ROOT, not from apps/api:
#     docker build -f apps/api/Dockerfile .
# The API is one workspace of an npm monorepo, so the root package-lock.json is what makes an install
# reproducible. Building from apps/api alone resolves a different (and untested) dependency tree.
#
# Two stages so the shipped image carries no compiler and no dev dependencies.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /repo

# OpenSSL is a Prisma engine requirement on slim images; without it `prisma generate` emits a binary
# the runtime cannot load, and the failure only shows up on the first query.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Manifests first, so a dependency-free code change reuses the cached install layer.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma

# The API's postinstall runs `prisma generate`, which needs the schema — copied above.
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace @onestack/api

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma

# Production deps only. postinstall still regenerates the Prisma client against this image's OpenSSL.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/apps/api/dist apps/api/dist

# Not root. A container that never needs to write to its own filesystem has no reason to be able to.
USER node

# The platform injects PORT; main.ts reads it and binds 0.0.0.0.
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
