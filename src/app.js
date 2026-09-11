import {store, PALETTE, DEFAULTS, DATA_VERSION, migrate} from './store.js';
import {UNITS, DISPLAY, GROUPS,
        unitPrice, num, fmt, eq, cleanNum, convertAmount} from './units.js';
import {paint, fillColor} from './color.js';

/* ============ state ============

   Two comparisons share one screen:
     retailers — one product across stores (the original)
     options   — brands of one product in the store you're standing in
   They keep separate lists and separate entries, and share the unit, since
   the unit describes the product in your hand, not where you are.

   The unit is chosen once for the whole round. That is what replaced the old
   per-row unit and its dimension lock: with one unit for every row, weight and
   volume cannot be mixed at all, rather than being mixed and then caught. */
let data = {
  version: DATA_VERSION,
  mode: 'options',
  unit: 'kg',
  retailers: [],
  values: {},          // retailer id -> {amount, price}
  options: [],
  optionValues: {}     // option id -> {amount, price}
};

const list = () => data.mode === 'options' ? data.options : data.retailers;
const vals = () => data.mode === 'options' ? data.optionValues : data.values;
const visible = () => list().filter(r => !r.hidden);
/* options are lettered by position, so an unnamed one still has an identity */
const labelOf = (r, i) => r.name.trim() ||
  (data.mode === 'options' ? String.fromCharCode(65 + i) : 'Untitled');

let lastWinnerId = null;
let lastWinnerUp = null;      /* the number the counter animates from */
let lastResult = null;        /* the previous session's winner, for the hint line */
let numAnim = null;
let sumText = '';
const rowEls = {};
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => Math.random().toString(36).slice(2,9);

const $rows = document.getElementById('rows');
const $units = document.getElementById('units');
const $legend = document.getElementById('legend');
const $sum = document.getElementById('sum');
const $clearAll = document.getElementById('clearAll');
const $manage = document.getElementById('manage');
const $manageBody = document.getElementById('manageBody');
const $addOption = document.getElementById('addOption');
const $hint = document.getElementById('hint');
const $tabs = document.querySelectorAll('.tabs button');

/* untitled retailers always sit at the end. Options are never reordered —
   their letters come from their position, so sorting would rename them. */
function normalizeOrder(){
  const titled = data.retailers.filter(r => r.name.trim());
  const untitled = data.retailers.filter(r => !r.name.trim());
  data.retailers = titled.concat(untitled);
}

/* ============ boot ============ */
(async function init(){
  const saved = await store.get('upc:v1');
  if(saved && Array.isArray(saved.retailers) && saved.retailers.length){
    migrate(saved);
    data = {...data, ...saved, version: DATA_VERSION};
  }else{
    data.retailers = DEFAULTS.map(d => ({id:uid(), ...d}));
  }
  if(!UNITS[data.unit]) data.unit = 'kg';
  if(data.mode !== 'retailers') data.mode = 'options';
  if(!Array.isArray(data.options) || !data.options.length){
    data.options = [0,1,2].map(i => ({id:uid(), name:'', color:PALETTE[i]}));
  }
  data.retailers.forEach(r => {
    if(typeof r.name !== 'string') r.name = '';
    r.hidden = !!r.hidden;
  });
  seedValues();

  normalizeOrder();
  lastResult = await store.get('upc:last');

  const t = await store.get('upc:theme');
  if(t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else document.documentElement.dataset.theme =
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  syncThemeColor();

  renderUnits(); renderMode(); buildManage();
})();

function seedValues(){
  data.retailers.forEach(r => { if(!data.values[r.id]) data.values[r.id] = {amount:'',price:''}; });
  data.options .forEach(r => { if(!data.optionValues[r.id]) data.optionValues[r.id] = {amount:'',price:''}; });
}
function save(){ store.set('upc:v1', data); }

/* The two <meta name=theme-color media=prefers-color-scheme> tags in
   index.html paint the status bar before this script runs, matched to the
   OS's own scheme. But Value's theme is a stored per-app preference that can
   disagree with the OS — toggle it manually, or open the app after the OS
   changed but before you did — and a status bar painted for the wrong theme
   turns invisible against dark content. Once the real theme is known, force
   both tags to it: only the one the browser is honouring matters, but there
   is no cheap way to ask which that is, so setting both is the whole fix. */
function syncThemeColor(){
  /* Installed (standalone) apps paint the status bar background from
     manifest.json's fixed theme_color for the whole life of the install —
     it never re-reads the live page, confirmed by it staying stable through
     a full reinstall. So the icon-contrast decision has to agree with that
     fixed value too, not the in-app toggle, or dark icons end up on a dark
     bar (or the reverse) whenever the toggle disagrees with the manifest.
     A normal browser tab has no such fixed background, so it keeps
     following the live theme as before. */
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const bg = standalone
    ? '#101412'   /* must match manifest.json's theme_color */
    : getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bg));
}

/* An installed standalone app is usually resumed by the OS rather than
   reloaded, so the boot-time sync above can miss a resume; re-run it on
   every return to the app. Also nudge the service worker to check for a
   new deploy right away instead of waiting on its own periodic check. */
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  syncThemeColor();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  }
});

/* ============ the unit, chosen once ============ */
function renderUnits(){
  $units.innerHTML = GROUPS.map(g =>
    `<div class="ugroup">${g.units.map(u =>
      `<button class="u" data-u="${u}" role="radio" aria-checked="${u === data.unit}"
        aria-label="${g.label} in ${UNITS[u].label}">${UNITS[u].label}</button>`
    ).join('')}</div>`
  ).join('');
  $units.querySelectorAll('.u').forEach(b => b.onclick = () => setUnit(b.dataset.u));
}
function setUnit(u){
  if(!UNITS[u] || u === data.unit) return;
  const from = data.unit;
  data.unit = u;
  /* the pack in your hand did not change size — carry the numbers across.
     Across dimensions there is nothing to carry, so they are left as typed. */
  if(UNITS[from].dim === UNITS[u].dim){
    [data.values, data.optionValues].forEach(map => {
      for(const id in map) map[id].amount = convertAmount(map[id].amount, from, u);
    });
  }
  renderUnits(); buildRows(); recompute(); save();
}
const perUnit = () => DISPLAY[UNITS[data.unit].dim].unit;

/* ============ modes ============ */
function renderMode(){
  $tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === data.mode)));
  const opt = data.mode === 'options';
  $addOption.hidden = !opt;
  $manage.hidden = opt;
  if(opt) $manage.open = false;
  buildRows(); recompute();
}
$tabs.forEach(b => b.onclick = () => {
  if(data.mode === b.dataset.mode) return;
  data.mode = b.dataset.mode;
  lastWinnerId = null; lastWinnerUp = null;
  closeEditor();
  renderMode(); save();
});

/* ============ rows ============ */
function buildRows(){
  closeEditor();
  $rows.innerHTML = '';
  for(const k in rowEls) delete rowEls[k];
  /* the amount column is the one that needs telling what it's counting in */
  $legend.children[1].textContent = 'Amount · ' + UNITS[data.unit].label;
  $legend.children[3].textContent = 'per ' + perUnit();

  visible().forEach((r, i) => {
    const v = vals()[r.id];
    const name = labelOf(r, i);
    const el = document.createElement('div');
    el.className = 'row';
    paint(el, r.color);
    el.innerHTML = `
      <div class="tag"></div>
      <input class="f-amount" type="text" inputmode="decimal" autocomplete="off"
             enterkeyhint="next" placeholder="0">
      <input class="f-price" type="text" inputmode="decimal" autocomplete="off"
             enterkeyhint="done" placeholder="0.00">
      <div class="out"><span class="num"></span><span class="rank"></span></div>
      <div class="verdict"><span class="big"></span><span class="per"></span><span class="say"></span></div>`;

    const tagEl    = el.querySelector('.tag');
    const amountEl = el.querySelector('.f-amount');
    const priceEl  = el.querySelector('.f-price');

    /* an option's tag is the way in to renaming, recolouring and removing it.
       A retailer's is a label — its roster lives in Manage. */
    if(data.mode === 'options'){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagbtn';
      b.textContent = name;
      b.setAttribute('aria-label', `Edit ${name}`);
      b.onclick = () => toggleEditor(r, el);
      tagEl.appendChild(b);
    }else{
      tagEl.textContent = name;
      tagEl.title = name;
      if(!r.name.trim()) tagEl.classList.add('untitled');
    }

    amountEl.value = v.amount;
    priceEl.value = v.price;
    amountEl.setAttribute('aria-label', `${name} amount in ${UNITS[data.unit].label}`);
    priceEl .setAttribute('aria-label', `${name} price`);

    bindNumeric(amountEl, val => { v.amount = val; onChange(); });
    bindNumeric(priceEl,  val => { v.price  = val; onChange(); });

    rowEls[r.id] = {el, tagEl, amountEl, priceEl,
                    numEl: el.querySelector('.num'),
                    rankEl: el.querySelector('.rank'),
                    bigEl: el.querySelector('.big'),
                    perEl: el.querySelector('.per'),
                    sayEl: el.querySelector('.say')};
    $rows.appendChild(el);
  });
}
function bindNumeric(el, commit){
  el.addEventListener('input', () => {
    const raw = el.value, pos = el.selectionStart;
    const clean = cleanNum(raw);
    if(clean !== raw){
      el.value = clean;
      const back = raw.length - clean.length;
      try{ el.setSelectionRange(Math.max(0,pos-back), Math.max(0,pos-back)); }catch(e){}
    }
    commit(clean);
  });
  /* enterkeyhint only changes the keyboard's label — it dismisses nothing
     on its own. Every keystroke already commits via the input listener
     above, so blurring on Enter loses nothing. */
  el.addEventListener('keydown', e => { if(e.key === 'Enter') el.blur(); });
}

function onChange(){ recompute(); save(); }

/* ============ core ============ */
function rowResult(r){
  const v = vals()[r.id];
  const up = unitPrice(num(v.amount), data.unit, num(v.price));
  return up === null ? {state:'incomplete'} : {state:'ok', up};
}

function recompute(){
  const results = visible().map((r, i) => ({r, i, ...rowResult(r)}));
  const inPlay = results.filter(x => x.state === 'ok').sort((a,b) => a.up - b.up);
  const best = inPlay[0] || null;

  results.forEach(x => {
    const ui = rowEls[x.r.id]; if(!ui) return;
    const win = !!best && x.r.id === best.r.id;
    ui.el.classList.toggle('filled', x.state === 'ok' && !win);
    ui.el.classList.toggle('win', win);
    ui.sayEl.textContent = '';
    ui.rankEl.textContent = '';

    if(x.state !== 'ok'){ ui.numEl.textContent = ''; return; }
    /* rank 1 needs no numeral — the row it's on is the loud one */
    const rank = inPlay.findIndex(y => y.r.id === x.r.id) + 1;
    if(rank > 1) ui.rankEl.textContent = String(rank);
    if(!win){
      const t = fmt(x.up);
      ui.numEl.textContent = t;
      ui.numEl.classList.toggle('long', t.length > 6);
    }
  });

  $clearAll.disabled = !Object.values(vals()).some(v => v.amount || v.price);
  renderWinner(inPlay, perUnit());
  syncSum();
}

/* counts the headline figure from the old value to the new one — the maths is
   what the app does, so it should visibly happen rather than just appear */
function countTo(el, from, to){
  if(numAnim) cancelAnimationFrame(numAnim);
  if(calm() || from === null || !isFinite(from) || from === to){
    el.textContent = fmt(to);
    return;
  }
  el.textContent = fmt(from);      /* paint the start value now, not on the first frame */
  const t0 = performance.now(), ms = 280;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);           /* ease out */
    el.textContent = fmt(from + (to - from) * e);
    if(k < 1) numAnim = requestAnimationFrame(step);
    else { numAnim = null; el.textContent = fmt(to); }
  };
  numAnim = requestAnimationFrame(step);
}

/* The result used to be a 160px card pinned above the list. It is now the
   winning row itself: same colour, same number, nowhere else for it to live.
   That is what buys back the height that made this app a scroller. */
function renderWinner(inPlay, unit){
  if(!inPlay.length){
    lastWinnerId = null; lastWinnerUp = null; sumText = '';
    /* the resting state carries the last thing you worked out, so opening the
       app cold shows something of yours rather than an empty box */
    $hint.textContent = lastResult && lastResult.name
      ? `Last time · ${lastResult.name} at ${lastResult.price} per ${lastResult.unit}`
      : 'Prices normalise to a litre, a kilo, or a piece.';
    return;
  }
  $hint.textContent = 'Prices normalise to a litre, a kilo, or a piece.';

  const best = inPlay[0], second = inPlay[1];
  const ui = rowEls[best.r.id];
  const name = labelOf(best.r, best.i);
  const v = vals()[best.r.id];
  const changed = !!lastWinnerId && lastWinnerId !== best.r.id;

  const bits = [];
  if(!second){
    bits.push('Only row filled — add another to compare');
  }else{
    const other = labelOf(second.r, second.i);
    if(eq(best.up, second.up)){
      bits.push(`Same price as ${esc(other)}`);
    }else{
      const pct = ((second.up - best.up) / second.up) * 100;
      bits.push(`<b>${pct.toFixed(pct < 10 ? 1 : 0)}%</b> cheaper than ${esc(other)}`);
      /* a percentage is abstract in an aisle; the money you keep on the pack in
         your hand, at the runner-up's rate, is the number you decide on */
      const packs = (num(v.amount) * UNITS[data.unit].to) / DISPLAY[UNITS[data.unit].dim].per;
      const saving = second.up * packs - num(v.price);
      /* money, not a unit price — fmt() opens out to three and four decimals
         below 1, which is right for a rate and wrong for what you keep */
      if(saving > 0 && isFinite(saving)) bits.push(`save ${saving.toFixed(2)}`);
    }
  }
  /* per kg is the right basis for comparing and a poor one for picturing a
     pack measured in grams, so show both — but never as a second headline */
  if(data.unit === 'g' || data.unit === 'ml'){
    bits.push(`${fmt(best.up / 10)} per 100 ${UNITS[data.unit].label}`);
  }

  ui.sayEl.innerHTML = bits.join(' <i>·</i> ');
  ui.perEl.textContent = 'per ' + unit;
  if(changed && !calm()){
    ui.el.classList.remove('flash');
    void ui.el.offsetWidth;           /* restart the animation on a re-render */
    ui.el.classList.add('flash');
  }
  countTo(ui.bigEl, lastWinnerUp, best.up);

  /* a short tick when the lead changes hands — in a noisy aisle you feel it
     before you read it */
  if(changed && !calm() && navigator.vibrate) try{ navigator.vibrate(12); }catch(e){}

  sumText = `<span class="dot" style="background:${esc(fillColor(best.r.color))}"></span>` +
            `<b>${esc(name)}</b> ${fmt(best.up)} / ${esc(unit)}` +
            (second && !eq(best.up, second.up)
              ? ` · ${(((second.up - best.up) / second.up) * 100).toFixed(0)}% cheaper` : '');
  lastWinnerId = best.r.id;
  lastWinnerUp = best.up;
  lastResult = {name, price: fmt(best.up), unit};
  store.set('upc:last', lastResult);
}
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ============ the fallback one-liner ============ */
/* Everything fits on one screen, so normally the winning row is in view and
   this never appears. It exists for the one case the redesign can't remove:
   a short phone with the keyboard up, typing into the last row. */
function syncSum(){
  const ui = lastWinnerId && rowEls[lastWinnerId];
  if(!ui || !sumText){ $sum.classList.remove('on'); $sum.innerHTML = ''; return; }
  /* measured against the unit strip, not the whole pinned block — #sum sits
     inside that block, so including it would make showing it move the very
     threshold that decides whether to show it */
  const head = $units.getBoundingClientRect().bottom;
  const r = ui.el.getBoundingClientRect();
  const off = r.bottom < head + 4 || r.top > (innerHeight - 8);
  if(off && $sum.innerHTML !== sumText) $sum.innerHTML = sumText;
  $sum.classList.toggle('on', off);
}
let sumTick = null;
const queueSum = () => {
  if(sumTick) return;
  sumTick = requestAnimationFrame(() => { sumTick = null; syncSum(); });
};
addEventListener('scroll', queueSum, {passive:true});
addEventListener('resize', queueSum);
if(window.visualViewport) visualViewport.addEventListener('resize', queueSum);

/* ============ the option editor ============ */
/* An option is a colour and a letter until you decide otherwise, so everything
   you might want to change about one lives behind its tag rather than costing
   width in the row. */
let editorFor = null;
function closeEditor(){
  const open = $rows.querySelector('.editor');
  if(open) open.remove();
  editorFor = null;
}
function toggleEditor(r, rowEl){
  if(editorFor === r.id){ closeEditor(); return; }
  closeEditor();
  editorFor = r.id;
  const ed = document.createElement('div');
  ed.className = 'editor';
  paint(ed, r.color);
  ed.innerHTML = `
    <input type="text" value="${esc(r.name)}" placeholder="Name (optional)" maxlength="24" aria-label="Option name">
    <div class="palette open">${PALETTE.map(c =>
      `<button style="background:${c}" data-c="${c}" aria-pressed="${c===r.color}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <div class="ed-actions">
      <button class="mini del" aria-label="Remove option">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 21V7h10v14Zm2-2h6V9H9ZM8 4h3l1-1h1l1 1h3v2H8Z"/></svg></button>
      <button class="done">Done</button>
    </div>`;
  const input = ed.querySelector('input');
  input.oninput = () => {
    r.name = input.value;
    const btn = rowEls[r.id] && rowEls[r.id].tagEl.querySelector('.tagbtn');
    if(btn) btn.textContent = labelOf(r, visible().indexOf(r));
    save(); recompute();
  };
  ed.querySelectorAll('.palette button').forEach(b => b.onclick = () => {
    r.color = b.dataset.c; save(); buildRows(); recompute();
  });
  ed.querySelector('.del').onclick = () => {
    const i = data.options.indexOf(r);
    if(i > -1) data.options.splice(i, 1);
    delete data.optionValues[r.id];
    if(!data.options.length) addOption();
    lastWinnerId = null; lastWinnerUp = null;
    save(); buildRows(); recompute();
  };
  ed.querySelector('.done').onclick = closeEditor;
  rowEl.after(ed);
  input.focus({preventScroll:true});
}
function addOption(){
  if(data.options.length >= 8) return false;
  const id = uid();
  data.options.push({id, name:'', color: PALETTE[data.options.length % PALETTE.length]});
  data.optionValues[id] = {amount:'', price:''};
  return true;
}
$addOption.onclick = () => {
  if(!addOption()) return;
  save(); buildRows(); recompute();
  const rows = $rows.querySelectorAll('.row');
  const last = rows[rows.length - 1];
  if(last) last.querySelector('.f-amount').focus();
};

/* ============ manage retailers ============ */
function buildManage(){
  $manageBody.innerHTML = '';
  data.retailers.forEach((r,i) => {
    const wrap = document.createElement('div');
    const eyeOn  = '<path d="M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>';
    const eyeOff = '<path d="M3.3 2.3 1.9 3.7l3 3C3.1 8.2 2 10.2 2 12c0 2.5 4 7 10 7 1.9 0 3.5-.45 4.9-1.15l3.4 3.4 1.4-1.4ZM12 17c-4.4 0-7.4-3.1-8-5 .35-1.1 1.1-2.3 2.3-3.3l2.2 2.2A4 4 0 0 0 13.1 16Zm0-10c4.4 0 7.4 3.1 8 5-.3.95-.9 2-1.9 2.9l-2.6-2.6A4 4 0 0 0 10.7 7.2Z"/>';
    wrap.className = 'mrow';
    wrap.innerHTML = `
      <div class="mr${r.hidden ? ' hidden' : ''}" style="--rc:${r.color}">
        <button class="swatch" aria-label="Change colour"></button>
        <input type="text" value="${esc(r.name)}" placeholder="Retailer name" aria-label="Retailer name" maxlength="24">
      </div>
      <div class="mr-actions">
        <button class="mini eye${r.hidden ? ' off' : ''}" aria-pressed="${!r.hidden}"
          aria-label="${r.hidden ? 'Show on main page' : 'Hide from main page'}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">${r.hidden ? eyeOff : eyeOn}</svg></button>
        <button class="mini up" aria-label="Move up"${i===0?' disabled':''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8l5 5H7Z"/></svg></button>
        <button class="mini down" aria-label="Move down"${i===data.retailers.length-1?' disabled':''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 16l-5-5h10Z"/></svg></button>
        <button class="mini del" aria-label="Remove retailer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 21V7h10v14Zm2-2h6V9H9ZM8 4h3l1-1h1l1 1h3v2H8Z"/></svg></button>
      </div>
      <div class="palette">${PALETTE.map(c =>
        `<button style="background:${c}" data-c="${c}" aria-pressed="${c===r.color}" aria-label="Colour ${c}"></button>`).join('')}</div>`;

    const pal = wrap.querySelector('.palette');
    wrap.querySelector('.swatch').onclick = () => pal.classList.toggle('open');
    pal.querySelectorAll('button').forEach(b => b.onclick = () => {
      r.color = b.dataset.c; save(); buildRows(); buildManage(); recompute();
    });
    wrap.querySelector('.eye').onclick = () => {
      r.hidden = !r.hidden;
      save(); buildRows(); buildManage(); recompute();
    };
    const nameInput = wrap.querySelector('input');
    nameInput.oninput = e => {
      const was = !!r.name.trim();
      r.name = e.target.value;
      /* only re-sort when it crosses the titled/untitled boundary, so
         the field doesn't lose focus mid-typing */
      if(was !== !!r.name.trim()){
        normalizeOrder(); save(); buildRows(); buildManage(); recompute();
        const again = $manageBody.querySelector(`input[data-id="${r.id}"]`);
        if(again){ again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        return;
      }
      save(); buildRows(); recompute();
    };
    nameInput.dataset.id = r.id;
    wrap.querySelector('.up').onclick = () => move(i,-1);
    wrap.querySelector('.down').onclick = () => move(i, 1);
    wrap.querySelector('.del').onclick = () => {
      data.retailers.splice(i,1); delete data.values[r.id];
      save(); buildRows(); buildManage(); recompute();
    };
    $manageBody.appendChild(wrap);
  });

  const add = document.createElement('button');
  add.className = 'add';
  add.textContent = 'Add retailer';
  add.onclick = () => {
    const id = uid();
    data.retailers.push({id, name:'', color:PALETTE[data.retailers.length % PALETTE.length], hidden:false});
    data.values[id] = {amount:'',price:''};
    normalizeOrder(); save(); buildRows(); buildManage(); recompute();
    const input = $manageBody.querySelector(`input[data-id="${id}"]`);
    if(input) input.focus();
  };
  $manageBody.appendChild(add);

  const reset = document.createElement('button');
  reset.className = 'add reset';
  reset.textContent = 'Reset to default retailers';
  let armed = false;
  reset.onclick = () => {
    if(!armed){
      armed = true;
      reset.textContent = 'Tap again to replace your list';
      reset.classList.add('armed');
      setTimeout(() => {
        if(!armed) return;
        armed = false; reset.textContent = 'Reset to default retailers'; reset.classList.remove('armed');
      }, 4000);
      return;
    }
    data.retailers = DEFAULTS.map(d => ({id:uid(), ...d, hidden:false}));
    data.values = {};
    seedValues();
    lastWinnerId = null; lastWinnerUp = null;
    save(); buildRows(); buildManage(); recompute();
  };
  $manageBody.appendChild(reset);
}
function move(i,d){
  const j = i + d;
  if(j < 0 || j >= data.retailers.length) return;
  [data.retailers[i], data.retailers[j]] = [data.retailers[j], data.retailers[i]];
  normalizeOrder();
  save(); buildRows(); buildManage(); recompute();
}

/* ============ chrome ============ */
/* clears the tab you're looking at — the other one is a different comparison,
   and there's no reason a Retailers round should wipe an Options round */
$clearAll.onclick = () => {
  const map = vals();
  for(const id in map) map[id] = {amount:'', price:''};
  lastWinnerId = null; lastWinnerUp = null;
  buildRows(); recompute(); save();
};
document.getElementById('theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('upc:theme', next);
  syncThemeColor();
  buildRows(); recompute();   /* brand colours are adjusted per theme */
};

/* ============ service worker ============ */
/* registered last so a failure here can never stop the app booting */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  const sw = navigator.serviceWorker;
  /* whether this page is already being served by a worker decides what a
     change of controller means: a first install, or a new version taking over */
  const wasControlled = !!sw.controller;
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if(!wasControlled || reloaded) return;   /* first install — nothing to refresh */
    reloaded = true;
    location.reload();                       /* a new build took over; show it */
  });
  addEventListener('load', () => sw.register('sw.js').catch(() => {}));
}
