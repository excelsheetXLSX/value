import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA_VERSION, DEFAULTS, MIGRATIONS, migrate} from '../src/store.js';

/* A saved roster is never rebuilt from DEFAULTS, so every change to the
   shipped list has to arrive through a migration. (CLAUDE.md §3) */

const v1Roster = () => ({
  version: 1,
  retailers: [
    {id: 'r1', name: 'Union Coop', color: '#7A3FA0'},
    {id: 'r2', name: 'Noon',       color: '#C9BC00'},
    {id: 'r3', name: 'Lulu',       color: '#0E9F4F'},
    {id: 'r4', name: 'Spinneys',   color: '#D8232A'},   // the user's own
    {id: 'r5', name: 'Carrefour',  color: '#1B4E9B'},
    {id: 'r6', name: 'Amazon.ae',  color: '#E08A00'}
  ],
  values: {
    r1: {amount: '12', unit: 'dz', price: '30'},        // dz was dropped in v3
    r3: {amount: '1',  unit: 'L',  price: '5'}
  }
});

test('a v1 roster lands on the shipped five, in order, custom names after', () => {
  const s = v1Roster();
  migrate(s);
  assert.deepEqual(
    s.retailers.map(r => r.name),
    ['Lulu', 'Carrefour', 'Noon', 'Amazon.ae', 'ADCOOP', 'Spinneys']
  );
});

test('Union Coop becomes ADCOOP and takes the real brand colour', () => {
  const s = v1Roster();
  migrate(s);
  const adcoop = s.retailers.find(r => r.name === 'ADCOOP');
  assert.ok(adcoop, 'Union Coop should have been renamed');
  assert.equal(adcoop.id, 'r1', 'it is the same retailer, not a new one');
  assert.equal(adcoop.color, '#4E3080');
});

test('v4 restores the exact brand colours on the shipped five', () => {
  const s = v1Roster();
  migrate(s);
  const byName = Object.fromEntries(s.retailers.map(r => [r.name, r.color]));
  assert.equal(byName['Lulu'], '#00A650');
  assert.equal(byName['Carrefour'], '#004A97');
  assert.equal(byName['Noon'], '#FEEE00');
  assert.equal(byName['Amazon.ae'], '#FF9900');
  assert.equal(byName['ADCOOP'], '#4E3080');
});

test("a retailer the user added keeps its own name and colour", () => {
  const s = v1Roster();
  migrate(s);
  const spinneys = s.retailers.find(r => r.id === 'r4');
  assert.equal(spinneys.name, 'Spinneys');
  assert.equal(spinneys.color, '#D8232A');
});

test('the dropped dz unit is cleared, other saved values are untouched', () => {
  const s = v1Roster();
  migrate(s);
  assert.equal(s.values.r1.unit, '');
  assert.equal(s.values.r1.amount, '12');   // only the unit is invalid
  assert.equal(s.values.r1.price, '30');
  assert.deepEqual(s.values.r3, {amount: '1', unit: 'L', price: '5'});
});

test('migrations are idempotent — running twice changes nothing', () => {
  const once = v1Roster();  migrate(once);
  const twice = v1Roster(); migrate(twice); migrate({...twice, version: DATA_VERSION});
  assert.deepEqual(twice, once);
});

test('a roster already at the current version is left alone', () => {
  /* the user deliberately renamed ADCOOP back — no migration may undo that */
  const s = {
    version: DATA_VERSION,
    retailers: [{id: 'r1', name: 'Union Coop', color: '#123456'}],
    values: {}
  };
  const before = structuredClone(s);
  migrate(s);
  assert.deepEqual(s, before);
});

test('starting from v3 only runs v4', () => {
  const s = {
    version: 3,
    retailers: [{id: 'r1', name: 'Noon', color: '#C9BC00'}, {id: 'r2', name: 'Zzz', color: '#111111'}],
    values: {r1: {amount: '', unit: 'dz', price: ''}}
  };
  migrate(s);
  assert.equal(s.retailers[0].color, '#FEEE00');       // v4 ran
  assert.deepEqual(s.retailers.map(r => r.name), ['Noon', 'Zzz']);
  assert.equal(s.values.r1.unit, 'dz', 'v3 must not re-run on a v3 roster');
});

test('every migration between 2 and DATA_VERSION exists', () => {
  for(let v = 2; v <= DATA_VERSION; v++){
    assert.equal(typeof MIGRATIONS[v], 'function', `MIGRATIONS[${v}] is missing`);
  }
  assert.equal(MIGRATIONS[DATA_VERSION + 1], undefined,
    'a migration exists past DATA_VERSION — bump the version');
});

test('DEFAULTS matches what the latest migration converges on', () => {
  const s = v1Roster();
  migrate(s);
  const shipped = s.retailers.slice(0, DEFAULTS.length);
  assert.deepEqual(
    shipped.map(r => ({name: r.name, color: r.color})),
    DEFAULTS.map(d => ({name: d.name, color: d.color}))
  );
});
