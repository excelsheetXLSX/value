import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UNITS, DISPLAY, unitPrice, num, fmt, eq, cleanNum} from '../src/units.js';

/* ---------- conversions ---------- */

test('each unit converts to its display unit', () => {
  assert.equal(unitPrice(1.5, 'L', 12), 8);          // 12 / 1.5 L  = 8.00 per L
  assert.equal(unitPrice(500, 'g', 7.5), 15);        // 7.50 / .5 kg = 15.00 per kg
  assert.equal(unitPrice(750, 'ml', 6), 8);
  assert.equal(unitPrice(2, 'kg', 30), 15);
  assert.equal(unitPrice(6, 'pc', 9), 1.5);          // count has no rescale
});

test('equivalent inputs agree across units of the same dimension', () => {
  assert.equal(unitPrice(1000, 'ml', 5), unitPrice(1, 'L', 5));
  assert.equal(unitPrice(1000, 'g', 5), unitPrice(1, 'kg', 5));
});

test('every unit in UNITS has a display rule for its dimension', () => {
  for(const [key, u] of Object.entries(UNITS)){
    assert.ok(DISPLAY[u.dim], `${key} has dimension ${u.dim} with no DISPLAY entry`);
    assert.ok(u.to > 0, `${key} needs a positive base factor`);
  }
});

/* ---------- the float-drift case (CLAUDE.md §1) ---------- */

test('3 L @ 1.00 and 300 ml @ 0.10 are the same price, and === would disagree', () => {
  const a = unitPrice(3, 'L', 1.00);
  const b = unitPrice(300, 'ml', 0.10);
  assert.notEqual(a, b);                  // raw floats differ by ~5.6e-17
  assert.ok(Math.abs(a - b) < 1e-15);     // ...but only in the last bits
  assert.ok(eq(a, b), 'eq() must call these equal');
});

test('eq() still separates genuinely different prices', () => {
  assert.ok(!eq(8, 8.0001));
  assert.ok(!eq(5, 5.00001));
  assert.ok(eq(0, 0));
});

/* ---------- rejections ---------- */

test('rejects zero, negative, and missing amounts or prices', () => {
  assert.equal(unitPrice(0, 'L', 12), null);
  assert.equal(unitPrice(-1, 'L', 12), null);
  assert.equal(unitPrice(1, 'L', 0), null);
  assert.equal(unitPrice(1, 'L', -5), null);
  assert.equal(unitPrice(NaN, 'L', 12), null);
  assert.equal(unitPrice(1, 'L', NaN), null);
});

test('rejects unknown or empty units', () => {
  assert.equal(unitPrice(1, '', 12), null);
  assert.equal(unitPrice(1, 'dz', 12), null);     // dropped in the v3 migration
  assert.equal(unitPrice(1, 'oz', 12), null);
  assert.equal(unitPrice(1, undefined, 12), null);
});

/* ---------- percentage shown on the winner card ---------- */

const cheaperPct = (best, second) => ((second - best) / second) * 100;

test('percentage cheaper', () => {
  assert.equal(cheaperPct(8, 10), 20);
  assert.equal(cheaperPct(5, 8), 37.5);
  assert.equal(cheaperPct(10, 10), 0);
});

/* ---------- parsing and formatting ---------- */

test('num() accepts decimal commas and rejects anything else', () => {
  assert.equal(num('1.5'), 1.5);
  assert.equal(num('1,5'), 1.5);
  assert.equal(num('12'), 12);
  assert.ok(Number.isNaN(num('')));
  assert.ok(Number.isNaN(num('abc')));
  assert.ok(Number.isNaN(num('1.2.3')));
  assert.ok(Number.isNaN(num(undefined)));
});

test('fmt() adds decimals as the number gets smaller', () => {
  assert.equal(fmt(8), '8.00');
  assert.equal(fmt(0.5), '0.500');
  assert.equal(fmt(0.005), '0.0050');
});

test('cleanNum() survives paste, swipe-typing and a physical keyboard', () => {
  assert.equal(cleanNum('terew'), '');
  assert.equal(cleanNum('1,5'), '1.5');
  assert.equal(cleanNum('1.2.3'), '1.23');
  assert.equal(cleanNum('AED 12.50'), '12.50');
  assert.equal(cleanNum('-3'), '3');
  assert.equal(cleanNum('1e5'), '15');
  assert.equal(cleanNum('.'), '.');           // mid-typing "0." must survive
  assert.equal(cleanNum('12'), '12');
});

/* ---------- the dimension lock (CLAUDE.md §2) ---------- */

/* mirrors recompute(): the first completed row fixes the dimension,
   and only rows in that dimension are compared */
function inPlay(rows, seedId){
  const complete = rows
    .map(r => ({...r, up: unitPrice(r.amount, r.unit, r.price)}))
    .filter(r => r.up !== null)
    .map(r => ({...r, dim: UNITS[r.unit].dim}));
  if(!complete.length) return [];
  const seed = complete.find(r => r.id === seedId) || complete[0];
  return complete.filter(r => r.dim === seed.dim).sort((a, b) => a.up - b.up);
}

test('a mass row and a volume row never appear in the same comparison', () => {
  const rows = [
    {id: 'a', amount: 1,   unit: 'L',  price: 5},
    {id: 'b', amount: 500, unit: 'g',  price: 7.5},
    {id: 'c', amount: 2,   unit: 'L',  price: 8}
  ];
  const play = inPlay(rows);
  assert.deepEqual(play.map(r => r.id), ['c', 'a']);   // 4.00/L beats 5.00/L
  assert.ok(!play.some(r => r.dim === 'mass'));
});

test('the seed row decides which dimension wins the lock', () => {
  const rows = [
    {id: 'a', amount: 1,   unit: 'L', price: 5},
    {id: 'b', amount: 500, unit: 'g', price: 7.5}
  ];
  assert.deepEqual(inPlay(rows, 'b').map(r => r.id), ['b']);
  assert.deepEqual(inPlay(rows, 'a').map(r => r.id), ['a']);
});

test('count never mixes with weight or volume', () => {
  const rows = [
    {id: 'a', amount: 6, unit: 'pc', price: 9},
    {id: 'b', amount: 1, unit: 'kg', price: 9},
    {id: 'c', amount: 1, unit: 'L',  price: 9}
  ];
  assert.deepEqual(inPlay(rows).map(r => r.id), ['a']);
});
