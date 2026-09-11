import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UNITS, DISPLAY, unitPrice, num, fmt, eq, cleanNum, convertAmount} from '../src/units.js';

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

/* ---------- one unit for every row (CLAUDE.md §2) ---------- */

/* The round's unit used to be per row, with a lock that let the first
   completed row fix the dimension and excluded the rest. The unit is now
   chosen once for the whole comparison, so weight and volume can't be mixed
   at all rather than being mixed and then caught. These tests hold the
   guarantee, not the mechanism that used to enforce it. */

/* mirrors recompute(): every row is priced in the one chosen unit */
function inPlay(rows, unit){
  return rows
    .map(r => ({...r, up: unitPrice(r.amount, unit, r.price)}))
    .filter(r => r.up !== null)
    .sort((a, b) => a.up - b.up);
}

test('every row in a comparison is priced in the same dimension', () => {
  const rows = [
    {id: 'a', amount: 1000, price: 5},
    {id: 'b', amount: 500,  price: 7.5},
    {id: 'c', amount: 2000, price: 8}
  ];
  for(const unit of Object.keys(UNITS)){
    const dims = new Set(inPlay(rows, unit).map(() => UNITS[unit].dim));
    assert.equal(dims.size, 1, `${unit} produced more than one dimension`);
  }
});

test('the chosen unit decides the whole comparison, not the first row', () => {
  const rows = [
    {id: 'a', amount: 1,   price: 5},
    {id: 'b', amount: 0.5, price: 7.5}
  ];
  /* same numbers, same ranking, whichever dimension is selected — because
     there is only ever one dimension in play */
  assert.deepEqual(inPlay(rows, 'L').map(r => r.id),  ['a', 'b']);
  assert.deepEqual(inPlay(rows, 'kg').map(r => r.id), ['a', 'b']);
  assert.equal(inPlay(rows, 'L')[0].up, inPlay(rows, 'kg')[0].up);
});

test('an unset unit prices nothing, so nothing can be compared', () => {
  const rows = [{id: 'a', amount: 1, price: 5}, {id: 'b', amount: 2, price: 8}];
  assert.deepEqual(inPlay(rows, ''), []);
  assert.deepEqual(inPlay(rows, 'dz'), []);
});

/* ---------- changing the unit carries the amounts with it ---------- */

/* The pack in your hand did not change size when you tapped kg, so 500 g has
   to become 0.5 kg. Across dimensions there is nothing to convert. */

test('amounts convert within a dimension', () => {
  assert.equal(convertAmount('500', 'g', 'kg'), '0.5');
  assert.equal(convertAmount('1.5', 'kg', 'g'), '1500');
  assert.equal(convertAmount('750', 'ml', 'L'), '0.75');
  assert.equal(convertAmount('2',   'L', 'ml'), '2000');
});

test('a converted amount still prices the same', () => {
  const before = unitPrice(500, 'g', 7.5);
  const after  = unitPrice(Number(convertAmount('500', 'g', 'kg')), 'kg', 7.5);
  assert.ok(eq(before, after), `${before} vs ${after}`);
});

test('the float tail is trimmed, not carried', () => {
  /* 1.1 * 1000 / 1 is 1100.0000000000002 in raw floats */
  assert.equal(convertAmount('1.1', 'kg', 'g'), '1100');
  assert.equal(convertAmount('0.3', 'kg', 'g'), '300');
});

test('across dimensions the number is left exactly as typed', () => {
  assert.equal(convertAmount('500', 'g', 'ml'), '500');
  assert.equal(convertAmount('2', 'L', 'pc'), '2');
  assert.equal(convertAmount('6', 'pc', 'kg'), '6');
});

test('nothing to convert stays nothing', () => {
  assert.equal(convertAmount('', 'g', 'kg'), '');
  assert.equal(convertAmount('.', 'g', 'kg'), '.');      // mid-typing
  assert.equal(convertAmount('1', 'g', 'g'), '1');
  assert.equal(convertAmount('1', 'zz', 'kg'), '1');     // unknown unit
});
