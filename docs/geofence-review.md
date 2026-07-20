# Geofenced check-in — senior review brief (card 53.1)

**Status: NOT REVIEWED. Written by the implementing agent, for a human reviewer.**

CLAUDE.md §7 puts GPS and PII behind human/senior review, and §6 says never self-merge. This document
does not satisfy that requirement — it exists so the review is quick and so nothing hides. The code it
describes is on `main`; a reviewer should read it with this in hand and either sign off or send it back.

Two open items block go-live. Neither is a coding task:

1. **The fence centre is a geocoded guess, not a survey.** See "Before go-live" below.
2. **This review.** An author cannot be their own second pair of eyes.

---

## What the feature does

A worker clocks on from their phone. The API takes their position, decides whether they were near the
workshop, and either allows the check-in or refuses it with a reason and an override path.

- `src/time-clock/geofence.ts` — pure decision logic. No DB, no Nest, no network.
- `src/time-clock/time-clock.service.ts` — applies the verdict, persists the entry.
- `prisma/sql/0047_time_entry_geofence.sql` — the columns.

## The two design decisions worth a reviewer's attention

### 1. Coordinates are never stored — only a distance and a verdict

`0047` deliberately has **no latitude/longitude columns.** A position arrives in the request body, is
turned into a distance in metres and one of four verdicts, and is then discarded. Nothing writes it
anywhere.

The reasoning: the shop's legitimate question is "was this person on site?", not "where is this
person?". A table of employee coordinates is a liability that nobody asked for, that grows forever, and
that will eventually be subpoenaed, breached, or used for something it was not collected for.

This is asserted rather than trusted — `test/time-clock-geofence.int.spec.ts` queries
`information_schema.columns` for any column matching `/lat|lon|coord|position/` and greps the actual
row JSON for the coordinate values.

**Reviewer, please confirm:** is a distance-in-metres still personal information under the Privacy Act
once it is attached to a named employee and a timestamp? I have treated it as retained-but-minimal. If
the answer is that it needs a retention period, that is a change I have not made.

### 2. A worker is never silently locked out

Outside the fence, or with no GPS at all, check-in is **refused with `canOverride: true`** — the worker
types a reason and clocks on anyway, and it lands in an owner-only review queue.

A dead GPS chip must not cost someone their shift. The override is the whole reason this is
acceptable to ship at all: without it, a hardware fault becomes an unpaid morning.

**Reviewer, please confirm:** the override queue at `GET /time-clock/overrides` is owner-only
(`403` for staff, asserted in the int spec) and tenant-isolated. If a worker's peers can read it, this
stops being attendance and becomes surveillance.

### The non-obvious correctness bug that was worth catching

Accuracy is checked **before** distance. A fix that reads "10 m from the workshop" with a reported
accuracy of ±400 m is not evidence of being on site — it is a coin flip presented as a measurement.
Verdicts: `inside` / `outside` / `inaccurate` / `unavailable`; the last two both refuse and both offer
override. `MAX_USABLE_ACCURACY_METRES = 200`.

Haversine, not a flat-earth approximation. At Melbourne's latitude a degree of longitude is ~79% of a
degree of latitude, so the flat version overstates east-west distance by ~26% — the difference between
inside and outside a 150 m fence. There is a test pinning this.

Also: `isValidCoords` rejects `0,0`. That is a zeroed struct, not a fix in the Atlantic.

---

## Before go-live: correct the fence centre

The defaults — `-37.6829, 145.0169` — were **geocoded from the street address.** They are a lookup of
where the postman goes, not a measurement of where the workshop is. A centre 50 m out puts the far end
of the yard outside the fence and refuses a worker standing at their own bench, every morning.

**What someone physically present needs to do**, once, taking about five minutes:

1. Stand in the workshop — ideally the spot furthest from where you think the centre is.
2. Read the coordinates off a phone (iPhone: Compass app. Android: Google Maps, long-press your dot).
3. Walk the boundary of where clocking on should be allowed and note the furthest point.
4. Set `WORKSHOP_LATITUDE`, `WORKSHOP_LONGITUDE` and a `WORKSHOP_RADIUS_METRES` that covers that
   furthest point plus ~30 m of GPS slack. Restart the API.

This is now a **config change, not a code change** — that was the actionable half of "correct the
coordinates", and it is done. Both coordinates must be set together (setting one alone is rejected;
pairing a new latitude with the default longitude would centre the fence in a paddock). Radius must be
20–5000 m. Invalid values fall back to the defaults **and print a warning at boot**, so a typo is loud
rather than mysterious. The API prints the active fence on every boot either way.

Documented in `.env.example`. Covered by `readWorkshopFromEnv` tests, including the `Number('') === 0`
trap that would otherwise put the fence off the coast of Africa.

## Not done

- **No per-tenant fence.** One fence, from the environment. A second shop needs a real
  `location` record — `checkGeofence` already takes a fence argument so the logic is ready, but the
  storage is not. Do not ship OneStack to a second site with this as-is.
- **No retention policy** on override reasons or distances. See the question above.
- **Nothing stops a worker from spoofing GPS.** Nothing can, from the client side. This is a
  reasonable-effort control against absent-minded clocking on from the couch, not an anti-fraud
  system, and it should not be described to the owner as one.

## Verification run

- `geofence.test.ts` — 22 unit tests, passing
- `time-clock-geofence.int.spec.ts` — 9 integration tests including the no-coordinates-stored
  assertion and cross-tenant isolation (requires a DB; skipped when `SUPABASE_CONFIGURED` is unset,
  which is currently the case in CI — **the RLS gate is not actually running there**)
- `tsc --noEmit` — 0 errors
