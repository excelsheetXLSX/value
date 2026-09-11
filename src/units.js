/* ============ units — verified math ============ */
const UNITS = {
  ml:{dim:'volume',to:1,   label:'ml'},
  L: {dim:'volume',to:1000,label:'L'},
  g: {dim:'mass',  to:1,   label:'g'},
  kg:{dim:'mass',  to:1000,label:'kg'},
  pc:{dim:'count', to:1,   label:'pc'}
};
const DISPLAY = {volume:{unit:'L',per:1000},mass:{unit:'kg',per:1000},count:{unit:'pc',per:1}};

function unitPrice(amount, unitKey, price){
  const u = UNITS[unitKey];
  if(!u) return null;
  const base = amount * u.to;
  if(!(base > 0) || !(price > 0)) return null;
  return (price / base) * DISPLAY[u.dim].per;
}
function num(s){
  if(typeof s !== 'string') return NaN;
  const t = s.replace(/,/g,'.').trim();
  if(!t || !/^\d*\.?\d*$/.test(t)) return NaN;
  return parseFloat(t);
}
function fmt(v){
  const d = v >= 1 ? 2 : (v >= 0.01 ? 3 : 4);
  return v.toFixed(d);
}
/* relative epsilon — raw floats drift ~1e-17 on equivalent inputs */
const eq = (a,b) => Math.abs(a-b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/* orders the unit strip. Weight first because groceries mostly are. */
const GROUPS = [
  {dim:'mass',   label:'Weight', units:['g','kg']},
  {dim:'volume', label:'Volume', units:['ml','L']},
  {dim:'count',  label:'Count',  units:['pc']}
];

/* inputmode only suggests a keypad — it does not stop a physical keyboard,
   a paste, or a swipe-typed word. Filter the value itself. */
function cleanNum(s){
  let v = s.replace(/,/g,'.').replace(/[^0-9.]/g,'');
  const i = v.indexOf('.');
  if(i !== -1) v = v.slice(0, i+1) + v.slice(i+1).replace(/\./g,'');
  return v;
}

/* The unit is chosen once for the whole round, so changing it has to carry the
   amounts already typed with it: 500 in grams is 0.5 in kilos, and the pack in
   your hand did not change size. Only within one dimension — g -> ml is not a
   conversion, it is a different question, so the numbers are left alone.
   toPrecision(12) drops the float tail: 500/1000 is exact, but 1.1 kg -> g
   would otherwise land on 1100.0000000000002. */
function convertAmount(str, from, to){
  if(from === to) return str;
  const a = UNITS[from], b = UNITS[to];
  if(!a || !b || a.dim !== b.dim) return str;
  const n = num(str);
  if(!isFinite(n)) return str;
  const v = parseFloat(((n * a.to) / b.to).toPrecision(12));
  return String(v);
}

export {UNITS, DISPLAY, GROUPS,
        unitPrice, num, fmt, eq, cleanNum, convertAmount};
