/* UI wiring check — runs the <script id="ui"> block against a minimal DOM stub.
   Catches missing element ids / null handlers / dead buttons that _smoke.js
   structurally cannot reach.  Run: node _uicheck.js  -> _uicheck.log */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mE = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const mU = html.match(/<script id="ui">([\s\S]*?)<\/script>/);
if (!mE || !mU) { console.error('scripts not found'); process.exit(1); }

/* ---- collect the id list actually present in the HTML ---- */
const htmlIds = new Set();
const re = /id="([^"]+)"/g;
let mm;
while ((mm = re.exec(html)) !== null) htmlIds.add(mm[1]);

let pass = 0, fail = 0;
const fails = [];
function ok(c, n, e) { if (c) pass++; else { fail++; fails.push(n + (e !== undefined ? ' :: ' + e : '')); } }

/* ---- minimal DOM ---- */
const missing = [];
const created = [];
function makeEl(tag, id) {
  const e = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    className: '', textContent: '', value: '',
    children: [], style: {}, _listeners: {}, _ctx: null,
    appendChild(c) { this.children.push(c); created.push(c); return c; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    getContext() { if (!this._ctx) this._ctx = makeCtx2d(); return this._ctx; },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    focus() {},
    click() { (this._listeners.click || []).forEach(f => f({})); },
    createTextNode() { return makeEl('text'); }
  };
  /* real <el> semantics: assigning innerHTML='' must CLEAR the child list,
     otherwise re-rendered panels accumulate children and the check lies. */
  let _html = '';
  Object.defineProperty(e, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = v; if (v === '') e.children.length = 0; },
    enumerable: true, configurable: true
  });
  return e;
}
function makeCtx2d() {
  return {
    _calls: [],
    fillRect() { this._calls.push('fillRect'); },
    clearRect() { this._calls.push('clearRect'); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    fillText() { this._calls.push('fillText'); }, save() {}, restore() {},
    translate() {}, scale() {}
  };
}

const registry = {};
const document = {
  _listeners: {},
  getElementById(id) {
    if (!htmlIds.has(id)) missing.push(id);
    if (!registry[id]) registry[id] = makeEl('div', id);
    return registry[id];
  },
  createElement(tag) { return makeEl(tag); },
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
  removeEventListener() {},
  body: makeEl('body'),
  head: makeEl('head')
};

/* <select id="diff"> must carry REAL option semantics before the UI reads .value.
   Note: go through getElementById so the element is registered first. */
const sel = document.getElementById('diff');
const optBlock = (html.match(/<select id="diff">([\s\S]*?)<\/select>/) || [null, ''])[1];
const opts = [];
const reOpt = /<option value="([^"]+)"([^>]*)>/g;
while ((mm = reOpt.exec(optBlock)) !== null) {
  opts.push({ value: mm[1], selected: /selected/.test(mm[2]) });
}
sel.options = opts;
sel.value = (opts.find(o => o.selected) || opts[0] || { value: 'medium' }).value;

const timers = [];
const ctx = vm.createContext({
  console, document,
  Date, Math, JSON, Object, Array, String, Number, Boolean, Error, Set, Map,
  Int8Array, Int32Array, Uint8Array, Float64Array, isFinite, parseInt, parseFloat,
  setInterval: (fn) => { timers.push(fn); return timers.length; },
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (fn) => { if (fn) fn(0); return 1; }
});
ctx.globalThis = ctx;

/* engine first, then UI, in the same realm */
vm.runInContext(mE[1], ctx, { filename: 'engine.js' });
let uiError = null;
try {
  vm.runInContext(mU[1], ctx, { filename: 'ui.js' });
} catch (e) { uiError = e; }

ok(!uiError, 'UI block executes without throwing', uiError && (uiError.message + '\n' + uiError.stack));
ok(missing.length === 0, 'every getElementById id exists in the HTML', missing.join(','));

function SU(ctx_) { return vm.runInContext('globalThis.SUDOKU', ctx_); }
function countNonZero(g) { let n = 0; for (let i = 0; i < 81; i++) if (g[i] !== 0) n++; return n; }

if (!uiError) {
  const S = SU(ctx);
  const st = ctx.globalThis.__SULAST;
  ok(!!st, 'UI exposed __SULAST state');
  ok(st && Array.isArray(st.board) && st.board.length === 81, 'board initialised to 81 cells');
  ok(st && st.puzzle && st.puzzle.length === 81, 'puzzle initialised');
  ok(st && st.solution && st.solution.length === 81, 'solution initialised');
  ok(st && Array.isArray(st.notes) && st.notes.length === 81, 'notes array initialised 81');
  ok(st && st.notes.every(s => s.size === 0), 'notes start empty');
  ok(st && Array.isArray(st.history), 'history array initialised');
  ok(st && S.isSolved(st.solution), 'generated solution is a valid grid');
  ok(st && countNonZero(st.puzzle) > 0, 'puzzle has clues', st && countNonZero(st.puzzle));

  const board = registry['board'];
  ok(board.children.length === 81, 'board rendered 81 cells', board.children.length);
  ok(registry['pad'].children.length === 10, 'pad rendered 9 digits + erase',
     registry['pad'].children.length);

  /* self-check panel populated by runChecks() inside newGame() */
  const checks = registry['checks'];
  ok(checks.children.length === 3, 'checks panel populated', checks.children.length);
  const ck = ctx.globalThis.__SUCHECKS;
  ok(Array.isArray(ck) && ck.length === 3, '__SUCHECKS exported');
  ok(ck && ck.every(c => c.pass === true), 'all inline self-checks pass',
     ck && JSON.stringify(ck.map(c => c.pass)));

  /* exercise the base controls once (no throw) */
  const click = (id) => {
    if (!registry[id]) { ok(false, 'missing control ' + id); return; }
    registry[id].click();
  };
  try {
    click('btnCheck'); click('btnHint'); click('btnReset');
    click('btnSolve'); click('btnNew'); click('btnCheck');
    ok(true, 'all base controls clickable without error');
  } catch (e) { ok(false, 'controls click without error', e.message); }

  ok(registry['checks'].children.length === 3, 'checks stay at 3 rows after clicks',
     registry['checks'].children.length);
  ok(/^\d+\/81$/.test(registry['sFill'].textContent), 'fill readout format',
     registry['sFill'].textContent);
  ok(/^\d+$/.test(registry['sClue'].textContent), 'clue readout numeric',
     registry['sClue'].textContent);
  ok(/^\d+$/.test(registry['sBad'].textContent), 'bad readout numeric',
     registry['sBad'].textContent);
  ok(/^\d+$/.test(registry['sBad'].textContent) &&
     Number(registry['sBad'].textContent) === 0, 'no conflicts after solve+new',
     registry['sBad'].textContent);

  /* difficulty select must drive a new game */
  try {
    sel.value = 'expert';
    registry['btnNew'].click();
    ok(true, 'difficulty switch + new game works');
  } catch (e) { ok(false, 'difficulty switch works', e.message); }

  /* a clicked pad digit must write into the selected empty cell */
  try {
    const pzb = registry['pad'].children[0];
    st.selected = -1;
    pzb.click();
    ok(true, 'pad digit click handled even with no selection');
    let target = -1;
    for (let i = 0; i < 81; i++) if (st.puzzle[i] === 0) { target = i; break; }
    if (target >= 0) {
      st.selected = target;
      pzb.click();
      ok(st.board[target] === 1, 'pad click writes digit into selected empty cell',
         st.board[target]);
    } else { ok(true, 'pad click writes digit (no empty cell, skipped)'); }
  } catch (e) { ok(false, 'pad interaction works', e.message); }

  /* NOTE MODE: toggle on/off, write then remove a candidate in an empty cell */
  try {
    st.selected = -1;
    registry['btnNote'].click();
    ok(st.noteMode === true, 'note mode toggled on');
    let ne = -1;
    for (let i = 0; i < 81; i++) if (st.puzzle[i] === 0 && st.board[i] === 0) { ne = i; break; }
    st.selected = ne;
    registry['pad'].children[0].click(); // digit 1
    ok(st.notes[ne].has(1) && st.board[ne] === 0, 'note digit written, cell still empty',
       st.notes[ne] && st.notes[ne].size);
    registry['pad'].children[0].click(); // toggle off
    ok(!st.notes[ne].has(1), 'note digit removed on second click');
    registry['btnNote'].click(); // off
    ok(st.noteMode === false, 'note mode toggled off');
  } catch (e) { ok(false, 'note mode works', e.message); }

  /* DIGIT INPUT + UNDO restores the cell */
  try {
    let nd = -1;
    for (let i = 0; i < 81; i++) if (st.puzzle[i] === 0 && st.board[i] === 0) { nd = i; break; }
    st.selected = nd;
    registry['pad'].children[0].click(); // digit 1
    ok(st.board[nd] === 1, 'digit written to empty cell', st.board[nd]);
    registry['btnUndo'].click();
    ok(st.board[nd] === 0, 'undo restored empty cell', st.board[nd]);
  } catch (e) { ok(false, 'undo works', e.message); }

  /* UNDO with empty history must not throw */
  try {
    st.history = [];
    registry['btnUndo'].click();
    ok(true, 'empty-history undo handled');
  } catch (e) { ok(false, 'empty-history undo safe', e.message); }
}

const summary =
  'PASS ' + pass + ' / ' + (pass + fail) + '\n' +
  (fail ? 'FAIL ' + fail + '\n' + fails.join('\n') : 'ALL GREEN') + '\n';
fs.writeFileSync(path.join(__dirname, '_uicheck.log'), summary);
console.log(summary.replace(/\n$/, ''));
process.exit(fail ? 1 : 0);
