import {test} from 'node:test';
import assert from 'node:assert/strict';
import {oklch, contrast, edgeColor, fillColor, DARK_CEILING} from '../src/color.js';
import {PALETTE, DEFAULTS} from '../src/store.js';

/* Colour is verified numerically, not by eye — several bugs in this project
   were only visible as ratios. (CLAUDE.md §4) */

const LIGHT_SURFACE = '#FFFFFF';
const DARK_SURFACE  = '#1A201D';
const ALL = [...new Set([...PALETTE, ...DEFAULTS.map(d => d.color)])];

const hue = hex => oklch(hex).h;
const hueShift = (a, b) => {
  const d = Math.abs(hue(a) - hue(b)) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
};

/* ---------- the edge outline ---------- */

test('every colour gets an edge that clears 3:1 in light mode', () => {
  for(const c of ALL){
    const edge = edgeColor(c, false);
    assert.ok(contrast(edge, LIGHT_SURFACE) >= 3,
      `${c} → ${edge} is only ${contrast(edge, LIGHT_SURFACE).toFixed(2)}:1 on white`);
  }
});

test('every colour gets an edge that clears 3:1 in dark mode', () => {
  for(const c of ALL){
    const edge = edgeColor(fillColor(c, true), true);
    assert.ok(contrast(edge, DARK_SURFACE) >= 3,
      `${c} → ${edge} is only ${contrast(edge, DARK_SURFACE).toFixed(2)}:1 on the dark surface`);
  }
});

test('an edge keeps the hue it came from — lightness moves, hue does not', () => {
  for(const c of ALL){
    assert.ok(hueShift(c, edgeColor(c, false)) < 0.12,
      `${c} shifted hue in light mode`);
    assert.ok(hueShift(c, edgeColor(c, true)) < 0.12,
      `${c} shifted hue in dark mode`);
  }
});

test('a colour that already clears 3:1 is returned untouched', () => {
  assert.equal(edgeColor('#004A97', false), '#004A97');   // Carrefour on white
  assert.equal(edgeColor('#4E3080', false), '#4E3080');   // ADCOOP on white
  assert.ok(contrast('#004A97', LIGHT_SURFACE) >= 3);
});

test('only the colours too close to the surface get an outline', () => {
  const outlinedLight = ALL.filter(c => edgeColor(c, false) !== c);
  const outlinedDark  = ALL.filter(c => edgeColor(c, true)  !== c);
  assert.ok(outlinedLight.includes('#FEEE00'), 'Noon needs an outline on white');
  assert.ok(outlinedLight.includes('#FF9900'), 'Amazon needs an outline on white');
  assert.ok(outlinedDark.includes('#004A97'),  'Carrefour needs an outline in dark');
  assert.ok(outlinedDark.includes('#4E3080'),  'ADCOOP needs an outline in dark');
});

/* ---------- the fill ---------- */

test('light mode keeps every brand colour exactly as the brand uses it', () => {
  for(const c of ALL) assert.equal(fillColor(c, false), c);
});

test('no dark-mode fill is brighter than the ceiling', () => {
  for(const c of ALL){
    const ratio = contrast(fillColor(c, true), DARK_SURFACE);
    assert.ok(ratio <= DARK_CEILING + 0.05,
      `${c} glares at ${ratio.toFixed(2)}:1 against the dark surface`);
  }
});

test('the dark ceiling only pulls down what is over it', () => {
  assert.equal(fillColor('#00A650', true), '#00A650');           // Lulu, ~5:1
  assert.notEqual(fillColor('#FEEE00', true), '#FEEE00');        // Noon, ~13.8:1
  assert.ok(contrast('#FEEE00', DARK_SURFACE) > DARK_CEILING);
});

test('capping brightness does not turn yellow olive', () => {
  /* 7:1 was tried first and killed the hue; 10.5 is where it survives */
  const capped = fillColor('#FEEE00', true);
  assert.ok(hueShift('#FEEE00', capped) < 0.10, 'the hue drifted');
  assert.ok(oklch(capped).C > 0.13, `chroma collapsed to ${oklch(capped).C.toFixed(3)}`);
});

/* ---------- bad input ---------- */

test('non-hex input passes straight through', () => {
  for(const bad of ['', 'red', 'var(--x)', '#FFF', '#12345', 'rgb(0,0,0)']){
    assert.equal(edgeColor(bad, false), bad);
    assert.equal(fillColor(bad, true), bad);
  }
});
