/* ============ units — verified math ============ */
const UNITS = {
  ml:{dim:'volume',to:1,   label:'ml'},
  L: {dim:'volume',to:1000,label:'L'},
  g: {dim:'mass',  to:1,   label:'g'},
  kg:{dim:'mass',  to:1000,label:'kg'},
  pc:{dim:'count', to:1,   label:'pc'}
};
const DISPLAY = {volume:{unit:'L',per:1000},mass:{unit:'kg',per:1000},count:{unit:'pc',per:1}};
const DIM_NAME = {volume:'volume',mass:'weight',count:'pieces'};
/* weight <-> volume needs the product's density, which we don't know,
   so the round is locked to whichever kind the first filled row used */
const LOCK_COPY = {
  mass:  'Comparing per kg — volume needs a density to convert',
  volume:'Comparing per L — weight needs a density to convert',
  count: 'Comparing per piece — weight and volume don’t apply'
};
const CANT = {
  mass:  'Needs a density to convert to kg',
  volume:'Needs a density to convert to L',
  count: 'Doesn’t convert to pieces'
};

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

export {UNITS, DISPLAY, DIM_NAME, LOCK_COPY, CANT, GROUPS,
        unitPrice, num, fmt, eq, cleanNum};
