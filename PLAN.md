# Plan

Read `CLAUDE.md` first — it holds the invariants. Work phases in order; each
phase should leave the app working.

**Status:** Phases 0-2 are done. Live at https://excelsheetxlsx.github.io/value/
(GitHub Pages, `main` branch). The app is called **Value**. Phase 3 is waiting
on real use in a store.

---

## Phase 0 — Set up the repo

The prototype is one file. Split it, since it's now ~700 lines and the CSS and
JS are both large enough to navigate badly inline.

```
index.html          markup + <link>s only
src/styles.css
src/color.js        oklch/contrast/fillColor/edgeColor/paint
src/units.js        UNITS, DISPLAY, GROUPS, unitPrice, eq, num, fmt
src/store.js        storage shim, DATA_VERSION, MIGRATIONS, migrate
src/app.js          state, render, event wiring
manifest.json
sw.js
fonts/              self-hosted Manrope woff2
```

Plain ES modules, no bundler. It's a single-page tool with no dependencies —
adding Vite buys nothing and costs a build step.

**Do this as a pure move.** No behaviour changes, no renames, no "while I'm
here" cleanups. Verify the app behaves identically before starting Phase 1.

## Phase 1 — Lock the maths behind tests

This is the core value of the tool and it currently has no regression net.

Add `test/units.test.js`, runnable with `node --test`, covering:

- each unit converts correctly (1.5 L @ 12 → 8.00/L; 500 g @ 7.50 → 15.00/kg)
- equivalent inputs agree: 1000 ml @ 5 === 1 L @ 5
- the float-drift case: 3 L @ 1.00 vs 300 ml @ 0.10 must compare **equal**
  via `eq()`, and would not via `===`
- rejects zero, negative, and unknown units
- percentage: best 8, second 10 → 20% cheaper
- lock behaviour: a mass row and a volume row never appear in the same
  `inPlay` list
- `cleanNum()`: `"terew"` → `""`, `"1,5"` → `"1.5"`, `"1.2.3"` → `"1.23"`

Also add `test/migrate.test.js`: a v1 roster with "Union Coop" and a custom
retailer migrates to v4 with ADCOOP recoloured, the shipped five in order, the
custom one after them, and any `dz` unit cleared.

## Phase 2 — Make it a real PWA

Currently it's a page, not an installable app.

1. `manifest.json` — name, short_name "Value", `display: standalone`,
   `orientation: portrait`, `start_url: "."`, theme_color matching the
   `<meta name="theme-color">` pair already in the head, background_color, and
   192/512 maskable icons.
2. `sw.js` — cache-first for the app shell (html, css, js, fonts). There is no
   network data, so caching is trivial: precache everything on install, serve
   from cache, bump a `CACHE_VERSION` const on deploy.
3. Self-host Manrope. The Google Fonts `<link>` fails offline, which defeats
   the point of a PWA used inside a supermarket with bad signal. Download the
   variable woff2, subset to latin, `font-display: swap`, and keep the
   `system-ui` fallback stack.
4. Test with the network disabled and installed to the home screen.

## Phase 3 — Field-test fixes

Do this after actually using it in a store a few times. Likely items:

- **Light-mode colour spread.** Noon's pale yellow and Carrefour's dark navy
  sit at 1.2:1 and 8.7:1 against white. The edge outline makes both visible but
  they don't feel equally weighted. Candidate fix: scale `--row-tint` inversely
  with the fill's contrast, so pale colours get a stronger background tint.
  Only do this if it actually bothers you in use.
- **Density opt-in.** An explicit per-round toggle to treat 1 L as 1 kg, for
  water and milk. Must be labelled and off by default. See CLAUDE.md §2.
- **Lulu's real hex.** `#00A650` is a guess. Sample their logo.
- **Reordering.** Currently ↑/↓ buttons in Manage. Drag-to-reorder is nicer but
  fiddly on touch; only switch if the buttons annoy you in practice.

## Phase 4 — Optional

Only if wanted. Each adds state, and the tool's virtue is that it's a
one-screen, one-shot utility.

- Remember the last comparison per product name
- Arabic / RTL — you're bilingual and it's a UAE grocery tool, so this may
  matter more than it looks. Note it affects the whole layout, not just
  strings: the accent bar moves to the right edge, the field grid mirrors.
- Export a comparison as an image to share

---

## Working notes

- Verify colour changes numerically, not by eye. Extract the functions and
  assert contrast ratios in both themes across the whole palette — several
  bugs in this project were caught that way and would not have been visible in
  a screenshot.
- Watch for duplicate CSS declarations when editing shorthand properties. A
  second `box-shadow` on `#sheet` silently killed the accent edge once; the
  later declaration wins and nothing errors.
- The prototype is the spec. When in doubt about intended behaviour, run
  `unit-price.html` and compare.
