# GST & money rules (spec) — Seq #29

> **Authoritative.** Quote (#30), Invoice (#40), Xero/MYOB sync (#41), Excess (#42) and Payments all
> compute money against THIS document — never their own copy. GST is otherwise computed in three places
> and will drift. Build this before Quote and Invoice.
>
> Reference implementation: [`apps/api/src/money/money.ts`](../apps/api/src/money/money.ts) — GST
> primitives, merged (#5.1); and `apps/api/src/line-items/line-item.ts` — line + document totals, landing
> with #6.9. Both are covered by golden + property tests.

## 1. Representation

- **All money is integer cents.** Never floats, never `number` dollars. A dollar amount is `cents / 100`
  only at the display edge.
- Currency is **AUD**. Multi-currency is out of scope.
- GST rate is **10%** (Australia).

## 2. Tax codes (per line)

| Tax code   | Meaning                                  | GST |
| ---------- | ---------------------------------------- | --- |
| `GST`      | Standard-rated                           | 10% |
| `GST_FREE` | GST-free supply (e.g. some exports/food) | 0   |

Each line carries exactly one tax code. (Input-taxed and other ATO codes are out of scope until a card needs them.)

## 3. Tax treatment (inclusive vs exclusive)

A line's `unitPriceCents` is interpreted per its **treatment**:

- **`inclusive`** — the price already contains GST. For a `GST` line, `gst = round(amount / 11)`,
  `net = amount − gst`, `total = amount`.
- **`exclusive`** — GST is added on top. For a `GST` line, `gst = round(amount / 10)`,
  `net = amount`, `total = amount + gst`.
- For any `GST_FREE` line, `gst = 0` and `net = total = amount`, regardless of treatment.

where `amount = quantity × unitPriceCents`.

## 4. Rounding

- **Round half-up at the cent** (`floor(x + 0.5)`), applied to the **GST component**, then net/total are
  derived by subtraction/addition so they always reconcile. See `roundHalfUp` in `money.ts`.
- Round **per line**, not once at the end. This is what keeps OneStack totals equal to Xero to the cent
  (Xero rounds per line).

## 5. Invariants (must always hold)

1. **Per line:** `net + gst === total`.
2. **Per document:** `sum(line.net) + sum(line.gst) === sum(line.total)` — the document total is the sum
   of line totals; document GST is the sum of line GST. (Do NOT recompute GST on the document subtotal —
   that reintroduces rounding drift.)
3. **Payments:** `sum(payments.applied) ≤ document.total`. Over-payment is rejected (a credit/refund is a
   separate movement, not a negative payment on the invoice).
4. **Xero/MYOB:** `OneStack document total === accounting-system total`, to the cent, because both round
   per line with the same half-up rule.

## 6. Payment (separate entity)

Payments are **not** a field on the invoice — they are their own records so an invoice can be paid in
parts, by different payers (see #40.5 split billing), over time.

- **Payment:** `id, tenantId, invoiceId, payerId, amountCents, method, status, receivedAt`.
- **Statuses:** `pending → authorized → captured → settled`, plus `failed`, `refunded`,
  `partially_refunded`. (Richer than a boolean "paid" so reconciliation and refunds are representable.)
- An invoice's paid state is **derived**: `sum(captured/settled payments) vs total` → `unpaid` /
  `part_paid` / `paid`. Never stored as the source of truth.

## 7. Tax invoice — required fields (ATO)

A compliant **Tax Invoice** (total ≥ $82.50 incl. GST) must render:

- The words **"Tax Invoice"**.
- Seller **identity + ABN**.
- Invoice **date** and a unique **invoice number**.
- Buyer identity (for totals ≥ $1,000).
- For each line (or in summary): description, and enough to show the **GST amount**.
- The **total GST** and the **total payable**.

These fields are produced by the Invoice card (#40) using the document totals defined here.

## 8. Acceptance (verified where)

- `sum(lines) + GST === total` — **done**, property-tested in `line-item.test.ts` (#6.9).
- Half-up rounding, inclusive/exclusive, GST-free — **done**, golden-tested in `money.test.ts` (#5.1).
- `sum(payments) ≤ total` — enforced by the Payments/Invoice card (#40) against this rule.
- OneStack total === Xero total to the cent — verified by the Xero sync card (#41) against this rule.

## 9. Out of scope (here)

Discounts/pricing engine (separate card), input-taxed and other ATO codes, multi-currency, rounding
strategies other than half-up-per-line.
