/* Headless verification of the sudoku engine extracted from index.html.
   Run: node _smoke.js   -> writes _smoke.log */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error('engine script not found'); process.exit(1); }

const ctx = vm.createContext({ console });
vm.runInContext(m[1], ctx, { filename: 'engine.js' });
const SUDOKU = vm.runInContext('globalThis.SUDOKU', ctx);
if (!SUDOKU) { console.error('SUDOKU not exposed'); process.exit(1); }

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + extra : '')); }
}
function eqArr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function count(g) { let c = 0; for (let i = 0; i < 81; i++) if (g[i] !== 0) c++; return c; }

/* ---------- 1. empty grid basics ---------- */
const empty = new Array(81).fill(0);
ok(!SUDOKU.isSolved(empty), 'empty grid is NOT solved');
ok(SUDOKU.validate(empty), 'empty grid has no conflicts');
ok(SUDOKU.countSolutions(empty, 2) >= 2, 'empty grid has >=2 solutions',
   SUDOKU.countSolutions(empty, 2));

/* ---------- 2. full-solution generation validity & randomness ---------- */
const seen = new Set();
for (let s = 0; s < 40; s++) {
  const rng = SUDOKU.mulberry32(s + 1);
  const sol = SUDOKU.generateFullSolution(rng);
  ok(SUDOKU.isSolved(sol), 'full solution #' + s + ' is valid');
  ok(count(sol) === 81, 'full solution #' + s + ' has 81 filled');
  seen.add(JSON.stringify(sol));
}
ok(seen.size >= 38, 'solution generator produces distinct grids', seen.size);

/* two different seeds must differ (sanity: not hard-coded) */
const rA = SUDOKU.mulberry32(1), rB = SUDOKU.mulberry32(2);
ok(!eqArr(SUDOKU.generateFullSolution(rA), SUDOKU.generateFullSolution(rB)),
   'different seeds -> different solutions');

/* ---------- 3. conflict detection is exact ---------- */
const cg = new Array(81).fill(0);
cg[0] = 5; cg[1] = 5;              // row 0 duplicate at idx 0,1
cg[9] = 7; cg[18] = 7;             // col 0 duplicate at idx 9,18
cg[30] = 3; cg[40] = 3;            // box 3 duplicate (idx 30 r3c3, 40 r4c4)
const ccells = SUDOKU.conflictCells(cg);
ok(eqArr(ccells, [0, 1, 9, 18, 30, 40]), 'conflictCells exact match', JSON.stringify(ccells));
ok(!SUDOKU.validate(cg), 'conflicting grid invalid');
ok(SUDOKU.solve(cg, 1).count === 0, 'conflicting grid has no solution');
/* a valid-but-partial grid still validates */
const pg = new Array(81).fill(0);
pg[0] = 5; pg[40] = 3;
ok(SUDOKU.validate(pg), 'non-conflicting partial grid valid');
ok(SUDOKU.conflictCells(pg).length === 0, 'no conflicts reported');

/* ---------- 4. deterministic generation ---------- */
const g1 = SUDOKU.generate(12345, 'medium');
const g2 = SUDOKU.generate(12345, 'medium');
ok(eqArr(g1.puzzle, g2.puzzle), 'same seed -> same puzzle');
ok(eqArr(g1.solution, g2.solution), 'same seed -> same solution');
const h1 = SUDOKU.generate(12345, 'hard');
ok(!eqArr(g1.puzzle, h1.puzzle), 'same seed different difficulty -> different puzzle');

/* ---------- 5. the main invariant sweep ---------- */
const DIFFS = ['easy', 'medium', 'hard', 'expert'];
const TARGET = SUDOKU.DIFF;
const stats = [];
for (const d of DIFFS) {
  for (let s = 0; s < 4; s++) {
    const seed = 700 + s * 31 + DIFFS.indexOf(d);
    const r = SUDOKU.generate(seed, d);
    const tag = d + '#seed' + seed;

    /* (a) solution is a valid complete grid */
    ok(SUDOKU.isSolved(r.solution), tag + ' solution valid');

    /* (b) puzzle is a subset of the solution (no cell disagrees) */
    let subset = true;
    for (let i = 0; i < 81; i++) {
      if (r.puzzle[i] !== 0 && r.puzzle[i] !== r.solution[i]) subset = false;
    }
    ok(subset, tag + ' puzzle is subset of solution');

    /* (c) puzzle itself has no conflicts */
    ok(SUDOKU.validate(r.puzzle), tag + ' puzzle no conflicts');
    ok(SUDOKU.conflictCells(r.puzzle).length === 0, tag + ' puzzle conflict count 0');

    /* (d) UNIQUENESS — the headline guarantee */
    ok(SUDOKU.countSolutions(r.puzzle, 2) === 1, tag + ' puzzle has unique solution',
       SUDOKU.countSolutions(r.puzzle, 2));

    /* (e) ROUNDTRIP — independent re-solve reproduces the stored solution */
    const re = SUDOKU.solve(r.puzzle, 1);
    ok(re.count === 1 && eqArr(re.solution, r.solution), tag + ' re-solve == stored solution');
    ok(SUDOKU.isSolved(re.solution), tag + ' re-solved grid valid');

    /* (f) clue count obeys the difficulty budget */
    ok(count(r.puzzle) === r.clues, tag + ' reported clues match actual', r.clues);
    ok(r.clues >= TARGET[d], tag + ' clues >= target(' + TARGET[d] + ')', r.clues);
    ok(r.clues < 81, tag + ' at least one cell removed', r.clues);

    /* (g) completing the empty cells yields exactly the solution */
    const filled = re.solution;
    ok(eqArr(filled, r.solution), tag + ' completion consistent');

    stats.push(d + ' cl=' + r.clues);
  }
}

/* easy must leave strictly more clues than expert on average */
function avgclues(d) {
  let t = 0, n = 3;
  for (let s = 0; s < n; s++) t += SUDOKU.generate(31337 + s, d).clues;
  return t / n;
}
const avgE = avgclues('easy'), avgX = avgclues('expert');
ok(avgE > avgX, 'easy avg clues > expert avg clues', avgE + ' vs ' + avgX);

const summary =
  'PASS ' + pass + ' / ' + (pass + fail) + '\n' +
  (fail ? 'FAIL ' + fail + '\n' + fails.join('\n') : 'ALL GREEN') + '\n' +
  'clue samples: ' + stats.join(', ') + '\n';
fs.writeFileSync(path.join(__dirname, '_smoke.log'), summary);
console.log(summary.replace(/\n$/, ''));
process.exit(fail ? 1 : 0);
