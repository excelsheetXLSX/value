# Value — project context

A personal grocery unit-price comparator. Single-page PWA, used one-handed
while standing in a supermarket aisle. Manual entry only, no scraping, no
accounts, no backend.

Current state: shipped as `index.html` + `src/*` (HTML + CSS + vanilla JS,
no build step, no dependencies). The original single-file prototype is kept
at `reference/unit-price.html`.

The screen is two tabs: **Options** (brands of one product in the store you are
standing in, the common job) and **Retailers** (one product across stores).
Same maths, different question; they keep separate lists and entries and share
the unit.

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
Rows returning `null` are incomplete and stay out of the comparison. The unit
argument is the round's single chosen unit, not a per-row one -- see section 2.

**Tie comparison must use the relative epsilon `eq()`, not `===`.**
3 L @ 1.00 and 300 ml @ 0.10 are the same unit price but differ by 5.6e-17 in
raw floats. Without the epsilon the app invents a winner that is
0.0000000000000006% cheaper.

### 2. Weight and volume can never be compared

Converting kg ↔ L requires the product's density, which varies per product
(water 1.0, olive oil ~0.92, honey ~1.42 kg/L). There is no correct answer
without it, and silently guessing one defeats the purpose of the tool.

**The unit is chosen once per round, in the strip under the tabs, and every row
uses it.** That is what enforces this rule now. It used to be enforced by a
dimension lock: each row had its own unit, the first completed row fixed the
dimension, and rows in other dimensions were excluded and labelled. One unit
for every row is strictly stronger -- there is no mixed state to detect, so
there is no lock, no exclusion state, and no per-row unit sheet.

Changing the unit carries the typed amounts with it *within* a dimension
(`convertAmount` in `src/units.js`): the pack in your hand did not change size
when you tapped kg, so 500 g becomes 0.5 kg. Across dimensions there is nothing
to convert, so the numbers are left exactly as typed.

If a density opt-in is ever added ("treat 1 L as 1 kg for this round"), it must
be an explicit, labelled, per-round user choice — never a default or an
inference.

### 3. Saved data needs migrations

The retailer roster is user-editable and persisted, so `DEFAULTS` only ever
applies on a first run with empty storage. Changing `DEFAULTS` does nothing for
an existing user.

Any change to the shipped roster requires: bump `DATA_VERSION`, add a
`MIGRATIONS[n]` entry, done. Migrations run once, in order, then the version is
stamped forward. Currently at version 5 (v2 renamed Union Coop → ADCOOP,
v3 reordered + dropped the `dz` unit, v4 applied real brand colours, v5 lifted
the per-row unit into one unit for the round and seeded the Options list).

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

**`--rc-edge` clears its ratio against the *surface*, so it is not a text
colour on a tint of itself.** Painting the winning row's big number in the
retailer's own edge colour measures 2.1-5.2:1 across the palette, because the
tinted background moves toward the text; `--muted` fails at every tint too
(3.5:1 at best). The winner row therefore uses plain `--on` for every piece of
text and holds its fill at 32%, which measures 6.6:1 in dark and 10.3:1 in
light on the worst colour in the palette. Brand identity there is carried by
the bar and the ring, where contrast is not a text problem.

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

Keys: `upc:v1`, `upc:theme`, `upc:last`. `upc:v1` holds the whole app state:
`{version, mode, unit, retailers, values, options, optionValues}`.

### 6. Input handling

A row holds two data points, amount and price. The unit is not one of them --
it is chosen once for the round (section 2).

`inputmode="decimal"` only *suggests* a keypad. It does not stop a physical
keyboard, a paste, or swipe-typing. Amount and price run through `cleanNum()` —
strips non-numeric, converts comma to decimal point, allows one point only.
Don't remove this in favour of `type="number"`; that adds spinners and behaves
inconsistently on mobile.

## Layout rules

The whole point of the current layout is that a full round fits on one phone
screen, so you never scroll between the thing you are typing into and the
answer. Anything that grows a row's height spends the budget that buys that.
Measured: 3 options and 5 retailers each fit inside 812px with the Manage
section still below the fold.

- **One line per row**: tag, amount, price, per-unit price. The four columns
  come from one `--cols` custom property shared by `.legend` and every `.row`,
  so they line up down the whole list. The 11px legend above the list carries
  the chosen unit, which is why the fields need no labels of their own.
- **The winning row is the result.** There is no result card. The winner takes
  a 32% tint of its colour, a thicker bar, a ring, and one extra line holding
  the big number and the verdict. Ranks 2+ show as a small numeral on their own
  rows — the order is readable in place, so rows are never reordered under you.
- `#sum` is a one-line fallback that appears only when the winning row has
  scrolled out from under the head. On a normal screen it never appears; it is
  there for a short phone with the keyboard up.
- Rows are the roster. One row per visible retailer, always present, joins the
  comparison automatically once complete.
- Options are lettered A, B, C by position and named only if you want to. Their
  tag opens the editor (rename, recolour, remove), so naming costs no width in
  the row. Options are never reordered — the letters come from position.
- Untitled retailers always sort last (`normalizeOrder()`). The re-sort fires
  only when a name crosses empty↔non-empty, otherwise the name field loses
  focus on every keystroke. This does not apply to options.
- Hidden retailers (eye toggle in Manage) render nowhere and are excluded from
  the maths entirely — they can't win.
- Touch targets ≥ 48px, except the unit chips and the row inputs at 44-46px,
  which is what lets the head and a row fit their budget.
- A per-unit price has no upper bound (2 ml at 18.00 is 9000.00 per litre), so
  the result column clips and steps its font down rather than running over the
  price field.
- Font is Manrope 400–800, `font-variant-numeric: tabular-nums lining`.

## Style

Material structure, heavily rounded, light + dark. The winning **row** is the
one loud element and takes the winning retailer's colour; the other rows stay
quiet so the per-retailer colour coding does the identification work. Don't add
a second accent colour that competes with the retailer swatches — `--primary`
marks the chosen unit and the dashed Add buttons, and nothing else.
