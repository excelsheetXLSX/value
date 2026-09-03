# Value

A grocery unit-price comparator. Type an amount, a unit and a price for each
shop; it normalises everything to a litre, a kilo or a piece and tells you
which is cheapest. Manual entry only — no scraping, no accounts, no backend.

Static files, no build step, no dependencies.

## Run it locally

```
npm run serve
```

Then open http://localhost:8123. It has to be served over http, not opened as
a file — the app is ES modules and a service worker, and browsers block both
on `file://`.

## Tests

```
npm test
```

Covers the unit maths, the saved-data migrations, and the colour contrast
ratios in both themes. See `PLAN.md` for what each suite is protecting.

## Layout

```
index.html            markup only
src/styles.css        all styling, including the self-hosted font faces
src/units.js          UNITS, unitPrice, eq, num, fmt, cleanNum, GROUPS
src/store.js          storage shim, DEFAULTS, DATA_VERSION, MIGRATIONS
src/color.js          OKLCH maths, edgeColor, fillColor, paint
src/app.js            state, rendering, event wiring
sw.js                 precaches the whole shell; bump CACHE_VERSION to deploy
manifest.json         PWA install metadata
fonts/                self-hosted Manrope (latin subsets)
reference/            the original single-file prototype, frozen
test/
```

`CLAUDE.md` holds the invariants — read it before changing the maths, the
colour system, or the saved-data format.
