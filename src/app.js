import {store, PALETTE, DEFAULTS, DATA_VERSION, migrate} from './store.js';
import {UNITS, DISPLAY, DIM_NAME, LOCK_COPY, CANT, GROUPS,
        unitPrice, num, fmt, eq, cleanNum} from './units.js';
import {paint} from './color.js';

/* untitled retailers always sit at the end */
function normalizeOrder(){
  const titled = retailers.filter(r => r.name.trim());
  const untitled = retailers.filter(r => !r.name.trim());
  retailers = titled.concat(untitled);
}
const visible = () => retailers.filter(r => !r.hidden);
let retailers = [];
let values = {};          // id -> {amount, unit, price}
let lockDim = null;
let lastWinnerId = null;
const rowEls = {};

const $rows = document.getElementById('rows');
const $winner = document.getElementById('winner');
const $lock = document.getElementById('lock');
const $lockText = document.getElementById('lockText');
const $clearAll = document.getElementById('clearAll');
const $manageBody = document.getElementById('manageBody');
const uid = () => Math.random().toString(36).slice(2,9);

/* ============ boot ============ */
(async function init(){
  const saved = await store.get('upc:v1');
  if(saved && Array.isArray(saved.retailers) && saved.retailers.length){
    migrate(saved);
    retailers = saved.retailers;
    values = saved.values || {};
  }else{
    retailers = DEFAULTS.map(d => ({id:uid(), ...d}));
  }
  retailers.forEach(r => {
    if(!values[r.id]) values[r.id] = {amount:'',unit:'',price:''};
    if(typeof r.name !== 'string') r.name = '';
    r.hidden = !!r.hidden;
  });
  normalizeOrder();

  const t = await store.get('upc:theme');
  if(t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else document.documentElement.dataset.theme =
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  buildRows(); buildManage(); recompute();
})();

function save(){ store.set('upc:v1', {version:DATA_VERSION, retailers, values}); }

/* ============ rows ============ */

function setUnitLabel(btn, unit){
  btn.textContent = unit ? UNITS[unit].label : 'Select';
  btn.classList.toggle('empty', !unit);
}

let sheetRow = null;
const $sheet = document.getElementById('sheet');
const $scrim = document.getElementById('scrim');
const $sheetGroups = document.getElementById('sheetGroups');
const $sheetTitle = document.getElementById('sheetTitle');

function openSheet(r){
  sheetRow = r;
  $sheetTitle.textContent = r.name.trim() || 'Untitled';
  paint($sheet, r.color);
  renderSheet();
  $sheet.classList.add('open');
  $scrim.classList.add('open');
  const first = $sheetGroups.querySelector('.chip:not([disabled])');
  if(first) first.focus({preventScroll:true});
}
function closeSheet(){
  $sheet.classList.remove('open');
  $scrim.classList.remove('open');
  const ui = sheetRow && rowEls[sheetRow.id];
  if(ui) ui.unitEl.focus({preventScroll:true});
  sheetRow = null;
}
function renderSheet(){
  const cur = values[sheetRow.id].unit;
  $sheetGroups.innerHTML = GROUPS.map(g => {
    const off = lockDim && lockDim !== g.dim;
    return `<div class="ugroup${off ? ' off' : ''}">
      <h3>${g.label}</h3>
      <div class="chips${g.units.length === 1 ? ' single' : ''}">${g.units.map(u =>
        `<button class="chip" data-u="${u}" aria-pressed="${u===cur}"${off ? ' disabled' : ''}>${UNITS[u].label}</button>`
      ).join('')}</div>
      ${off ? `<p class="why">${CANT[lockDim]}</p>` : ''}
    </div>`;
  }).join('');
  $sheetGroups.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    if(!sheetRow) return;              /* sheet already closing — ignore stray taps */
    values[sheetRow.id].unit = b.dataset.u;
    const ui = rowEls[sheetRow.id];
    if(ui) setUnitLabel(ui.unitEl, b.dataset.u);
    const id = sheetRow.id;
    closeSheet();
    onChange(id);
  });
}
document.getElementById('sheetClear').onclick = () => {
  if(!sheetRow) return;
  values[sheetRow.id].unit = '';
  const ui = rowEls[sheetRow.id];
  if(ui) setUnitLabel(ui.unitEl, '');
  closeSheet();
  onChange(null);
};
$scrim.onclick = closeSheet;
document.addEventListener('keydown', e => { if(e.key === 'Escape' && sheetRow) closeSheet(); });

function buildRows(){
  $rows.innerHTML = '';
  for(const k in rowEls) delete rowEls[k];
  visible().forEach(r => {
    const v = values[r.id];
    const el = document.createElement('div');
    el.className = 'row';
    paint(el, r.color);
    el.innerHTML = `
      <div class="row-top">
        <span class="row-name"></span>
        <span class="row-calc"></span>
        <button class="row-clear" aria-label="Clear this row">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3Z"/></svg>
        </button>
      </div>
      <div class="fields">
        <div class="field"><label>Amount</label>
          <input class="f-amount" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"></div>
        <div class="field"><label>Unit</label>
          <button class="unit-btn f-unit" type="button" aria-haspopup="dialog"></button></div>
        <div class="field price"><label>Price</label>
          <input class="f-price" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"></div>
      </div>`;
    const nameEl  = el.querySelector('.row-name');
    const calcEl  = el.querySelector('.row-calc');
    const amountEl= el.querySelector('.f-amount');
    const unitEl  = el.querySelector('.f-unit');
    const priceEl = el.querySelector('.f-price');
    const clearEl = el.querySelector('.row-clear');

    setRowName(nameEl, r);
    amountEl.value = v.amount;
    priceEl.value = v.price;
    setUnitLabel(unitEl, v.unit);

    bindNumeric(amountEl, val => { v.amount = val; onChange(r.id); });
    bindNumeric(priceEl,  val => { v.price  = val; onChange(r.id); });
    unitEl  .addEventListener('click', () => openSheet(r));
    clearEl .addEventListener('click', () => {
      v.amount = ''; v.unit = ''; v.price = '';
      amountEl.value = ''; priceEl.value = ''; setUnitLabel(unitEl, '');
      onChange(null);
    });

    rowEls[r.id] = {el, nameEl, calcEl, unitEl, clearEl};
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
}

function setRowName(el, r){
  const n = r.name.trim();
  if(n){ el.textContent = n; }
  else { el.innerHTML = '<span class="untitled">Untitled</span>'; }
}

function onChange(changedId){ recompute(changedId); save(); }

/* ============ core ============ */
function rowResult(r){
  const v = values[r.id];
  const a = num(v.amount), p = num(v.price);
  const up = unitPrice(a, v.unit, p);
  if(up === null) return {state:'incomplete'};
  const dim = UNITS[v.unit].dim;
  return {state:'ok', up, dim};
}

function recompute(changedId){
  const results = visible().map(r => ({r, ...rowResult(r)}));
  const complete = results.filter(x => x.state === 'ok');

  /* lock: first completed row fixes the dimension for the round */
  if(lockDim && !complete.some(x => x.dim === lockDim)) lockDim = null;
  if(!lockDim && complete.length){
    const seed = complete.find(x => x.r.id === changedId) || complete[0];
    lockDim = seed.dim;
  }

  const inPlay = complete.filter(x => x.dim === lockDim).sort((a,b) => a.up - b.up);
  const best = inPlay[0] || null;

  results.forEach(x => {
    const ui = rowEls[x.r.id]; if(!ui) return;
    const v = values[x.r.id];
    const dirty = !!(v.amount || v.unit || v.price);
    ui.clearEl.disabled = !dirty;
    setUnitLabel(ui.unitEl, v.unit);

    if(x.state === 'ok' && x.dim !== lockDim){
      ui.el.classList.add('excluded');
      ui.el.classList.remove('filled');
      ui.calcEl.className = 'row-note';
      ui.calcEl.textContent = `not ${DIM_NAME[lockDim]}`;
    }else if(x.state === 'ok'){
      ui.el.classList.remove('excluded');
      ui.el.classList.add('filled');
      ui.calcEl.className = 'row-calc' + (best && x.r.id === best.r.id ? ' best' : '');
      ui.calcEl.textContent = `${fmt(x.up)} / ${DISPLAY[x.dim].unit}`;
    }else{
      ui.el.classList.remove('excluded','filled');
      ui.calcEl.className = 'row-calc';
      ui.calcEl.textContent = '';
    }
  });

  if(lockDim && inPlay.length){
    $lock.classList.add('on');
    $lockText.textContent = LOCK_COPY[lockDim];
  }else $lock.classList.remove('on');

  $clearAll.disabled = !retailers.some(r => {
    const v = values[r.id]; return v.amount || v.unit || v.price;
  });

  renderWinner(inPlay);
}

function renderWinner(inPlay){
  if(!inPlay.length){
    $winner.className = '';
    $winner.style.removeProperty('--rc');
    $winner.innerHTML = '<div class="w-empty">Fill in a row to start comparing.</div>';
    lastWinnerId = null;
    return;
  }
  const best = inPlay[0], second = inPlay[1];
  const unit = DISPLAY[best.dim].unit;
  const v = values[best.r.id];

  /* Per kg is the right basis for comparing, but it's a poor number to picture
     when the pack in your hand is measured in grams. Show both, and only when
     the amount was actually entered small. */
  const alt = (v.unit === 'g' || v.unit === 'ml')
    ? `<div class="w-alt">${fmt(best.up / 10)} per 100 ${v.unit}</div>`
    : '';

  let sub, extra = '';
  if(!second){
    sub = 'Only one row filled. Add another to compare.';
  }else{
    const other = esc(second.r.name.trim() || 'Untitled');
    if(eq(best.up, second.up)){
      sub = `Same price as <b>${other}</b>.`;
    }else{
      const pct = ((second.up - best.up) / second.up) * 100;
      sub = `<b>${pct.toFixed(pct < 10 ? 1 : 0)}%</b> cheaper than <b>${other}</b>`;
    }
    const bits = [];
    /* a percentage is abstract in an aisle; what you actually keep is the
       difference on the pack you're holding, at the runner-up's rate */
    const packs = (num(v.amount) * UNITS[v.unit].to) / DISPLAY[best.dim].per;
    const saving = second.up * packs - num(v.price);
    if(saving > 0 && isFinite(saving)){
      bits.push(`saves <b>${fmt(saving)}</b> on this ${v.amount} ${UNITS[v.unit].label}`);
    }
    if(inPlay.length > 2) bits.push(`cheapest of ${inPlay.length}`);
    if(bits.length){
      const line = bits.join(' · ');
      extra = `<div class="w-extra">${line[0].toUpperCase() + line.slice(1)}</div>`;
    }
  }
  paint($winner, best.r.color);
  $winner.className = 'live' + (lastWinnerId && lastWinnerId !== best.r.id ? ' flash' : '');
  $winner.innerHTML =
    `<div class="w-name">${esc(best.r.name.trim() || 'Untitled')}</div>
     <div class="w-price"><span class="w-num">${fmt(best.up)}</span><span class="w-unit">per ${unit}</span></div>
     ${alt}
     <div class="w-sub">${sub}</div>
     ${extra}`;
  lastWinnerId = best.r.id;
}
function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ============ manage retailers ============ */
function buildManage(){
  $manageBody.innerHTML = '';
  retailers.forEach((r,i) => {
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
        <button class="mini down" aria-label="Move down"${i===retailers.length-1?' disabled':''}>
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
      if(rowEls[r.id]) setRowName(rowEls[r.id].nameEl, r);
      /* only re-sort when it crosses the titled/untitled boundary, so
         the field doesn't lose focus mid-typing */
      if(was !== !!r.name.trim()){
        normalizeOrder(); save(); buildRows(); buildManage(); recompute();
        const again = $manageBody.querySelector(`input[data-id="${r.id}"]`);
        if(again){ again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        return;
      }
      save(); recompute();
    };
    nameInput.dataset.id = r.id;
    wrap.querySelector('.up').onclick = () => move(i,-1);
    wrap.querySelector('.down').onclick = () => move(i, 1);
    wrap.querySelector('.del').onclick = () => {
      retailers.splice(i,1); delete values[r.id];
      save(); buildRows(); buildManage(); recompute();
    };
    $manageBody.appendChild(wrap);
  });

  const add = document.createElement('button');
  add.className = 'add';
  add.textContent = 'Add retailer';
  add.onclick = () => {
    const id = uid();
    retailers.push({id, name:'', color:PALETTE[retailers.length % PALETTE.length], hidden:false});
    values[id] = {amount:'',unit:'',price:''};
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
    retailers = DEFAULTS.map(d => ({id:uid(), ...d, hidden:false}));
    values = {};
    retailers.forEach(r => values[r.id] = {amount:'',unit:'',price:''});
    lockDim = null; lastWinnerId = null;
    save(); buildRows(); buildManage(); recompute();
  };
  $manageBody.appendChild(reset);
}
function move(i,d){
  const j = i + d;
  if(j < 0 || j >= retailers.length) return;
  [retailers[i], retailers[j]] = [retailers[j], retailers[i]];
  normalizeOrder();
  save(); buildRows(); buildManage(); recompute();
}

/* ============ chrome ============ */
$clearAll.onclick = () => {
  retailers.forEach(r => values[r.id] = {amount:'',unit:'',price:''});
  lockDim = null; lastWinnerId = null;
  buildRows(); recompute(); save();
};
document.getElementById('theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('upc:theme', next);
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
