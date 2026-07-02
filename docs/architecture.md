# OneStack — Architecture & Engineering Standards (canonical)

> This is the single source of truth for engineering decisions. Mirrored from the Notion "Rules &
> Architecture" page at repo creation (Foundation card #1). **The repo is now canonical — edit here;**
> the Notion page links back to this file.

## Stack (locked, Jul 2026 — do not substitute without asking)

- **Language:** TypeScript everywhere (strict).
- **Backend / API + workers:** NestJS on **Fly.io (Sydney)** (or Railway/Render at an AU region).
- **Database:** PostgreSQL + Row-Level Security via **Supabase (Sydney region)**. ORM: **Prisma**.
- **Auth:** **Supabase Auth** (managed) — NEVER hand-roll auth.
- **Jobs:** Supabase Queues (pgmq) / pg-boss on the worker host (no Redis).
- **Web:** **Next.js** on **Vercel (`syd1`)**. Mobile (React Native/Expo) is Phase 3–4.
- **Storage:** Supabase Storage.
- **E2E:** **Playwright** (primary regression firewall). Unit: Vitest.
- **Payments:** Stripe hosted — **DEFERRED to the final phase**.
- **CI / source:** GitHub + GitHub Actions.
- **Data residency:** everything AU-region. Map every subprocessor's region (APP 8).

> ⚠️ Background workers + the transactional-outbox relay run on the API/worker host (Fly/Railway/Render),
> **never on Vercel serverless.** Supabase's pooler makes the `set_config(…, true)`-in-a-transaction
> tenant pattern mandatory.

## System architecture

- A **modular monolith** — one deployable app, strict internal modules. Extract a service later only if
  one part needs different scaling.
- **Layers:** Experience (web + mobile) → API (NestJS) → domain modules → core/platform (tenancy, auth,
  event bus, notifications, audit, feature-flags) → data (Postgres, object storage).
- **Communication rule:** modules talk only via the shared core (the Contact record) and **domain
  events** — never by importing another module's files or reading its tables.

## Multi-tenancy (the most important pattern — OFF-LIMITS without senior review)

- Every tenant-owned table has a **tenantId** column.
- Set the tenant with `SELECT set_config('app.current_tenant_id', $tenantId, true)` **inside a
  transaction** (`true` = LOCAL), and run ALL of that request's queries on that same transaction client.
  **NEVER** a plain session `SET` — it leaks to the next request under connection pooling.
- The app connects as a **non-owner, NOSUPERUSER, non-BYPASSRLS** role.
- Every tenant table: `ENABLE` + `FORCE ROW LEVEL SECURITY` + a `FOR ALL` policy with a `WITH CHECK`.
- **Background jobs carry tenantId in the payload and set the same context** before any query.
- ONE central tenant-context wrapper/repository; forbid raw DB access elsewhere; a CI check flags any
  bypass. Every feature ships a tenant-isolation test (read AND write both fail across tenants).

## Data model conventions

- Every table: id (UUID), tenantId, createdAt, updatedAt; soft-delete (deletedAt) for customer-facing
  records.
- Money stored as integer minor units (cents), never floats; always store currency (AUD). GST 10%.
- Explicit FKs + indexes; **tenantId is the LEADING column** of composite indexes.
- Per-vertical custom fields in a **JSONB** column + a per-tenant field-definition table.
- Migrations additive by default; dropping/renaming columns is off-limits without review.

## API conventions

- REST, versioned under `/api/v1`. No breaking change without a version bump.
- Validate every input with DTOs; reject unknown fields. Consistent response + error shape.
- Pagination/filtering/sorting on list endpoints from the start. Every endpoint tenant-scoped +
  permission-checked.

## Core vs Packs (the platform model)

- **THE RULE: the core never contains a vertical noun.** If a physio, a salon and a lawyer wouldn't all
  recognise the word, it's a pack — not core.
- Abstract core: Tenant, Contact, Work Item, Subject, Line Item, Quote, Invoice, Payment, Price Book
  Item, Resource, Booking, Message, Document, Custom Field Definition, Workflow Definition/State/
  Transition, Terminology Map, Pack/Pack Install, Accounting Connection, Feature Flags, Audit Log.
- A pack extends core via 8 declared extension points only (entities/subjects, custom fields,
  statuses/workflows, events, documents, UI slots, integrations, terminology). Packs depend on core;
  **the core NEVER imports a pack.** The Pack Contract validator rejects any manifest that touches core
  tables.

## Testing (the gate — no green tests, no merge)

- Unit (Vitest), **tenant-isolation (mandatory, every feature)**, integration (API + Prisma test DB),
  contract tests (Zod) on core events + pack manifests, money golden tests, **Playwright** E2E for every
  core flow and every pack.
- A cross-pack Playwright regression suite runs on every PR (the multi-vertical firewall).
- Human-authored GOLDEN acceptance E2E per card (the independent oracle Sidh signs off by watching one
  trace). Mutation testing (Stryker) on money/workflow/RLS/outbox.
- CI blocks the merge on any failure; a human still reviews the PR and clicks through staging.

## Security & Australian compliance

- TLS in transit + encryption at rest; secrets in a vault, never in code. Input validation, rate
  limiting, dependency scanning.
- Privacy Act 1988 / APPs (data in Australia); Spam Act 2003 (transactional vs marketing consent,
  opt-out checked at send time). Immutable audit log; backups with tested restore; soft-deletes.

## Environments & delivery

- **dev → staging → production.** Staging mirrors production and is where humans verify.
- GitHub Actions runs tests + security scan on every change; only green + reviewed merges; deploy behind
  feature flags.
- **Branch protection: no direct pushes to `main`; PR + passing checks + human approval.**
- Monitoring: error tracking, uptime checks, alerts.

## Senior review checkpoints (tied to artifacts, not dates)

1. Tenant-context wrapper + RLS pattern — **before any feature**.
2. Outbox / idempotent-consumer reference.
3. Pack Contract + workflow-engine interface design + CI schema-diff gate.
4. Payments — **before go-live**. Plus a pre-launch security review before real customer data.

> Any change to multi-tenant isolation, auth, payments, PII handling, the workflow engine, or the Pack
> Contract is **Tier-1** and requires synchronous human/senior review.
