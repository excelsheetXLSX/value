# Value — project context

A personal grocery unit-price comparator. Single-page PWA, used one-handed
while standing in a supermarket aisle. Manual entry only, no scraping, no
accounts, no backend.

Current state: working single-file prototype at `unit-price.html`
(HTML + CSS + vanilla JS, no build step, no dependencies).

## Non-negotiables

These were each decided deliberately, several after being got wrong once.
Don't "simplify" them away.

### 1. The maths is the product

`unitPrice(amount, unitKey, price)` normalises to a base unit and rescales to
a display unit. Every unit conversion goes through the `UNITS` table — never
inline a conversion factor.

| unit | dim | to base | display |
|------|--------|---------|---------|
| ml | volume | 1 | per L (×1000) |
| L | volume | 1000 | per L |
| g | mass | 1 | per kg (×1000) |
| kg | mass | 1000 | per kg |
| pc | count | 1 | per pc |

Rejects `amount <= 0`, `price <= 0`, and unknown units by returning `null`.
Rows returning `null` are incomplete and stay out of the comparison.

**Tie comparison must use the relative epsilon `eq()`, not `===`.**
3 L @ 1.00 and 300 ml @ 0.10 are the same unit price but differ by 5.6e-17 in
raw floats. Without the epsilon the app invents a winner that is
0.0000000000000006% cheaper.

### 2. Weight and volume can never be compared

Converting kg ↔ L requires the product's density, which varies per product
(water 1.0, olive oil ~0.92, honey ~1.42 kg/L). There is no correct answer
without it, and silently guessing one defeats the purpose of the tool.

The first completed row locks the dimension for the round. Rows in other
dimensions are visibly excluded and labelled, never silently dropped. The lock
releases when no completed row uses it, and on Clear all.

If a density opt-in is ever added ("treat 1 L as 1 kg for this round"), it must
be an explicit, labelled, per-round user choice — never a default or an
inference.

### 3. Saved data needs migrations

The retailer roster is user-editable and persisted, so `DEFAULTS` only ever
applies on a first run with empty storage. Changing `DEFAULTS` does nothing for
an existing user.

Any change to the shipped roster requires: bump `DATA_VERSION`, add a
`MIGRATIONS[n]` entry, done. Migrations run once, in order, then the version is
stamped forward. Currently at version 4 (v2 renamed Union Coop → ADCOOP,
v3 reordered + dropped the `dz` unit, v4 applied real brand colours).

Never re-run a migration against a later version — if the user deliberately
renames something back, the migration must not second-guess them.

### 4. The colour system has two variables, not one

- `--rc` — the **fill**. The retailer's true brand colour.
- `--rc-edge` — an **outline** only. Same hue, lightness moved in OKLCH until
  it clears 3:1 against the surface.

The earlier approach darkened the brand colour itself until it passed contrast.
That turned Noon's `#FEEE00` into a muddy gold, which is wrong — Noon's own
logo pairs full-strength yellow with near-black `#101628`. Fill stays exact;
the edge provides the visibility.

`edgeColor()` returns the input unchanged when it already clears 3:1, so most
colours get no outline at all — only Noon and Amazon in light mode, only
Carrefour and ADCOOP in dark.

Adjust lightness in **OKLCH, never by blending toward black/white in sRGB.**
sRGB blending desaturates and muddies.

`DARK_CEILING = 10.5` caps fill brightness in dark mode only. Raw yellow hits
13.8:1 against the dark surface where Lulu's green sits at 5.2:1, so one
retailer glares. 7:1 was tried first and turned yellow olive — 10.5 is where
the hue survives.

Brand colours (sampled from logos or brand guidelines):
`Lulu #00A650` (unverified — no official hex found, sample their logo if you
get one), `Carrefour #004A97` (Pantone 286 C), `Noon #FEEE00` (sampled),
`Amazon.ae #FF9900`, `ADCOOP #4E3080` (sampled).

### 5. Storage must work in two environments

`store` is a shim: uses the artifact `window.storage` API when present, falls
back to `localStorage` otherwise. Keep both paths — the prototype is viewed in
Claude artifacts, where `localStorage` is unavailable, and served standalone as
a PWA, where `window.storage` doesn't exist.

Keys: `upc:v1` (roster + values), `upc:theme`.

### 6. Input handling

`inputmode="decimal"` only *suggests* a keypad. It does not stop a physical
keyboard, a paste, or swipe-typing. Amount and price run through `cleanNum()` —
strips non-numeric, converts comma to decimal point, allows one point only.
Don't remove this in favour of `type="number"`; that adds spinners and behaves
inconsistently on mobile.

## Layout rules

- Rows are the roster. One row per visible retailer, always present, joins the
  comparison automatically once complete.
- Untitled retailers always sort last (`normalizeOrder()`). The re-sort fires
  only when a name crosses empty↔non-empty, otherwise the name field loses
  focus on every keystroke.
- Hidden retailers (eye toggle in Manage) render nowhere and are excluded from
  the maths entirely — they can't win and can't set the unit lock.
- Touch targets ≥ 48px. Unit chips are 58px.
- Font is Manrope 400–800, `font-variant-numeric: tabular-nums lining`.

## Style

Material structure, heavily rounded, light + dark. The winner card is the one
loud element and takes the winning retailer's colour; rows stay quiet so the
per-retailer colour coding does the identification work. Don't add a second
accent colour that competes with the retailer swatches.
