# Auto Tech — Design System (match the prototype exactly)

**Goal:** the app's UX, colour and look must match the prototype pixel-for-pixel in feel.
**Source of truth:** the prototype — `design/prototype.html` (live: https://autotech-demo.higgsfield.app).
**How:** prototype → tokens → component kit → build screens from the kit → screenshot-verify against the prototype.

---

## 1. Put the prototype in the repo
Commit `OneStack_Auto_Prototype.html` as **`design/prototype.html`** so Claude Code can open it and read exact CSS values (never eyeball the live site). Keep `theme.ts` next to your app theme.

## 2. Tokens are the contract (`theme.ts`)
Everything references tokens — **no raw hex or magic spacing in screens.** Values are in `theme.ts` (colours, status colours, role gradients, spacing 4/8/12/16/24, radii, type scale, shadows). A PR with a raw hex in a screen fails review.

## 3. Component kit (build once, from tokens)
Map each prototype element to one RN component in `kit.tsx`. Screens are assembled ONLY from these.

| Component | Prototype class | Spec (tokens) |
|---|---|---|
| `Card` | `.card` | bg `card`, radius `lg`/`xl`, padding `lg`, `shadow.card`, marginBottom `md` |
| `StatusPill` | `.pill` | bg = status colour, text white, `caption` bold, padding 4×9, radius `pill` |
| `RegoPlate` | `.rego` | bg `regoBg`, text `regoText`, monospace bold, padding 2×7, radius `sm` |
| `Button` (primary/ghost/dark) | `.btn`/`.ghost`/`.dark` | primary bg `accent` white; ghost bg white text `navy` border `line`; dark bg `navy`; radius 13, pad 13×16, bold 14 |
| `SegmentedControl` | `.seg` | track bg `well`, radius `md`; selected = white + `shadow.card` |
| `Chip` (selectable) | `.chip` | bg `well` text `navy` radius `pill`; selected → bg `accent` white |
| `Tile` / `KPITile` | `.tile`/`.kpi .card` | white card, number `type.kpi`, label `caption` colour `sub` |
| `Hero` | `.hero` | gradient `roleTheme[role]` (expo-linear-gradient), radius `lg`, height ~190, glow + car motif |
| `BottomSheet` | `.inspector` | bg `#0c1622`, rounded top, slide-up |
| `RadioListItem` | `.yopt`/`.radio` | row + radio circle (border `line`; selected fill `accent`) |
| `ListRow` / `AiLine` | `.list-item`/`.ailine` | row, `avatar`, dividers `line`, dot indicators = status colour |
| `Hintnote` | `.hintnote` | bg `#eef6ff` border `#cfe4fb` text `#2b5c86`, radius `md`, small |
| `ConfBadge` | `.conf` | hi/md/lo = conf* token pairs |

## 4. React-Native equivalents for web-only effects
The design language matches exactly; three effects need RN equivalents (web/Next.js can use the CSS directly):

- **CSS gradient** (`linear-gradient`) → `expo-linear-gradient` `<LinearGradient colors={[from,to]}>`.
- **backdrop-blur** (tab bar / inspector) → `expo-blur` `<BlurView>`.
- **box-shadow** → `shadow.card` tokens (iOS `shadow*` + Android `elevation`).
- **radial glow** (hero) → a soft, low-opacity circular View or a small gradient image; approximate.

## 5. The verification loop (this is what makes it "exactly the same")
Per screen, as a Definition-of-Done step:
1. Build the screen from the kit + tokens.
2. Run it in Expo; **take a screenshot**.
3. Open the **same screen in the prototype** (`design/prototype.html` / live link).
4. Compare side-by-side; adjust token usage until they match (spacing, weight, colour, radius).
5. (Optional but recommended) add a **screenshot snapshot test** (Storybook/Playwright) so future drift fails CI.

## 6. Reviewer checklist (PR gate)
- [ ] No raw hex / magic numbers in screens — everything via `theme.ts`.
- [ ] Components come from `kit.tsx` (no one-off styled views).
- [ ] Gradients/blur/shadow use the RN equivalents above.
- [ ] A **screenshot vs. the prototype** is attached to the PR and matches.
- [ ] Status colours, rego plate, pills, buttons render identically to the prototype.

## 7. Screens to match (from the prototype)
Owner home (operations-first: tiles + car-lifecycle pipeline + workshops + money-link) · Money page (finance-gated) · Job board + rego search · Job detail (claim-file readiness + timeline + add note/photo) · Photo→Quote (4-step) · In/Out (movement + return) · Tow (collect + 10-yard selector) · Timesheets · Time clock · Owner import · role homes (Floor/Office/Tow). Palette, radii and status colours are identical across all of them — that consistency is the whole point.
