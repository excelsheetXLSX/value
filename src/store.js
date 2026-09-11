/* ============ storage: artifact API, falls back to localStorage ============ */
const store = {
  async get(k){
    try{ if(window.storage){ const r = await window.storage.get(k,false); return r ? JSON.parse(r.value) : null; } }catch(e){}
    try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; }
  },
  async set(k,v){
    try{ if(window.storage){ await window.storage.set(k, JSON.stringify(v), false); return; } }catch(e){}
    try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
  }
};

/* ============ shipped roster + saved-data versioning ============ */
const PALETTE = ['#004A97','#00A650','#FEEE00','#FF9900','#4E3080','#D8232A','#12A5A5','#D65D9A','#00A3E0','#7CB518'];
const DEFAULTS = [
  {name:'Lulu',      color:'#00A650'},
  {name:'Carrefour', color:'#004A97'},
  {name:'Noon',      color:'#FEEE00'},
  {name:'Amazon.ae', color:'#FF9900'},
  {name:'ADCOOP',    color:'#4E3080'}
];

const DATA_VERSION = 5;
/* saved rosters aren't rebuilt from DEFAULTS, so changes to the shipped
   list need a migration keyed to the version that introduced them */
const MIGRATIONS = {
  2: s => s.retailers.forEach(r => {
    if(r.name === 'Union Coop'){ r.name = 'ADCOOP'; r.color = '#4E3080'; }
  }),
  3: s => {
    /* reorder the shipped retailers, leaving any the user added after them */
    const want = ['Lulu','Carrefour','Noon','Amazon.ae','ADCOOP'];
    const rank = r => { const i = want.indexOf(r.name.trim()); return i === -1 ? want.length : i; };
    s.retailers.sort((a,b) => rank(a) - rank(b));
    /* 'dozen' no longer exists — drop it rather than leave a dangling unit */
    for(const id in (s.values||{})) if(s.values[id].unit === 'dz') s.values[id].unit = '';
  },
  4: s => {
    /* real brand colours, sampled from logos or brand guidelines */
    const brand = {Lulu:'#00A650', Carrefour:'#004A97', Noon:'#FEEE00',
                   'Amazon.ae':'#FF9900', ADCOOP:'#4E3080'};
    s.retailers.forEach(r => { const c = brand[r.name.trim()]; if(c) r.color = c; });
  },
  5: s => {
    /* The unit used to be per row, with a dimension lock stopping the rows
       from disagreeing. It is now chosen once for the whole round, which makes
       disagreement impossible rather than merely detected. Keep whichever unit
       the user had actually picked — the rows it belonged to keep their
       amounts and prices untouched. */
    const seen = Object.values(s.values || {}).map(v => v && v.unit).filter(Boolean);
    s.unit = seen[0] || 'kg';
    for(const id in (s.values || {})) delete s.values[id].unit;
    /* the second comparison: brands of one product in one store */
    s.mode = 'options';
    s.options = [0,1,2].map(i => ({id: oid(), name:'', color: PALETTE[i]}));
    s.optionValues = {};
  }
};
/* migrations run outside the app too (node --test), so they can't lean on
   anything the page provides */
const oid = () => Math.random().toString(36).slice(2,9);
function migrate(saved){
  const from = saved.version || 1;
  for(let v = from + 1; v <= DATA_VERSION; v++) if(MIGRATIONS[v]) MIGRATIONS[v](saved);
}

export {store, PALETTE, DEFAULTS, DATA_VERSION, MIGRATIONS, migrate};
