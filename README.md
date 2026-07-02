# OneStack

A composable, multi-tenant SaaS **platform** for Australian SMBs. Automotive panel-beating is the first
test vertical, not the product — one reusable core; each industry is a configuration **pack**, never a
fork.

- **Rules the team + the agent follow:** [`CLAUDE.md`](CLAUDE.md)
- **Architecture & engineering standards (canonical):** [`docs/architecture.md`](docs/architecture.md)
- **What to build next:** the Notion **Build Backlog → Ready queue** (`/next` picks the top card).

## Stack (locked)

TypeScript (strict) · NestJS API + workers on **Fly.io (Sydney)** · **Supabase (Sydney)** Postgres +
RLS + Auth + Storage · Prisma · Next.js on **Vercel (`syd1`)** · Playwright E2E · Stripe hosted
(deferred). Everything AU-region.

## Repo layout

```
apps/api    NestJS API + background workers  → Fly.io (fly.toml, Sydney)
apps/web    Next.js frontend                 → Vercel (vercel.json, syd1)
packages/   shared libraries (added as cards land)
docs/       architecture.md (canonical)
.github/    CI (the gate) + staging deploy
.claude/    /next and /handoff commands
```

> The apps are foundation stubs right now — the real NestJS/Next.js apps land in the **walking
> skeleton** card (#4), and the tenant-context wrapper (the most important code in the product) in
> cards #2 / #2.1.

## Local setup

```bash
nvm use            # Node 20 (see .nvmrc); Node >=18.18 works
npm install        # installs all workspaces
npm run typecheck  # strict TS across every workspace
npm test           # unit tests (Vitest)
npm run format     # Prettier check
cp .env.example .env   # then fill from the secret manager (never commit .env)
```

## CI / CD (the gate)

- **`.github/workflows/ci.yml`** runs format + typecheck + test on every PR and push to `main`.
- **`.github/workflows/deploy-staging.yml`** deploys to staging **after CI is green** on `main`.

### Human setup still required (card #1 hand-off — cannot be done from the agent)

1. Create the GitHub remote and push this repo.
2. **Branch protection on `main`:** require the `ci` check to pass + at least one review (Code Owners) +
   no direct pushes. _(This is acceptance criterion "CI blocks any change with failing tests".)_
3. Add repo/staging **secrets**: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `FLY_API_TOKEN`.
4. Create the **Vercel** project (region `syd1`), the **Fly** app (`primary_region = syd`), and the
   **Supabase** project (Sydney) — then staging auto-deploys from `main`.
