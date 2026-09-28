/* ASCII inspection probe — dump generated puzzles + solutions so correctness can
   be EYEBALLED, not just asserted green.  Run: node _probe.js -> _probe.txt */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mE = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx = vm.createContext({ console });
vm.runInContext(mE[1], ctx, { filename: 'engine.js' });
const SUDOKU = vm.runInContext('globalThis.SUDOKU', ctx);

function render(g, title) {
  let out = '\n' + title + '\n';
  out += '+-------+-------+-------+\n';
  for (let r = 0; r < 9; r++) {
    let line = '| ';
    for (let c = 0; c < 9; c++) {
      const v = g[r * 9 + c] | 0;
      line += (v === 0 ? '.' : String(v)) + ' ';
      if (c === 2 || c === 5) line += '| ';
    }
    line += '|\n';
    out += line;
    if (r === 2 || r === 5) out += '+-------+-------+-------+\n';
  }
  out += '+-------+-------+-------+\n';
  return out;
}

function rowDigits(g, u) {
  const s = [];
  for (let k = 0; k < 9; k++) s.push(g[u * 9 + k]);
  return s.slice().sort((a, b) => a - b).join(',');
}
function colDigits(g, u) {
  const s = [];
  for (let k = 0; k < 9; k++) s.push(g[k * 9 + u]);
  return s.slice().sort((a, b) => a - b).join(',');
}
function boxDigits(g, u) {
  const s = [];
  for (let k = 0; k < 9; k++) {
    const r = ((u / 3) | 0) * 3 + ((k / 3) | 0);
    const c = (u % 3) * 3 + (k % 3);
    s.push(g[r * 9 + c]);
  }
  return s.slice().sort((a, b) => a - b).join(',');
}
const CANON = '1,2,3,4,5,6,7,8,9';

let out = '=== Sudoku Lab probe ===\n';

for (const d of ['easy', 'hard']) {
  const r = SUDOKU.generate(20260929, d);
  out += '\n########## ' + d + ' (clues=' + r.clues + ') ##########';
  out += render(r.puzzle, '--- PUZZLE ---');
  out += render(r.solution, '--- SOLUTION (independent re-solve) ---');
  const re = SUDOKU.solve(r.puzzle, 1);
  let same = JSON.stringify(re.solution) === JSON.stringify(r.solution);
  out += 're-solve identical to stored solution: ' + same + '\n';

  const rowsOK = [], colsOK = [], boxesOK = [];
  for (let u = 0; u < 9; u++) {
    rowsOK.push(rowDigits(r.solution, u) === CANON);
    colsOK.push(colDigits(r.solution, u) === CANON);
    boxesOK.push(boxDigits(r.solution, u) === CANON);
  }
  out += 'rows are 1-9 permutations : ' + rowsOK.every(Boolean) +
         '  (fails: ' + rowsOK.filter(x => !x).length + ')\n';
  out += 'cols are 1-9 permutations : ' + colsOK.every(Boolean) +
         '  (fails: ' + colsOK.filter(x => !x).length + ')\n';
  out += 'boxes are 1-9 permutations: ' + boxesOK.every(Boolean) +
         '  (fails: ' + boxesOK.filter(x => !x).length + ')\n';

  /* restore-propagation: solution must agree with every given clue */
  let agree = 0, disagree = 0;
  for (let i = 0; i < 81; i++) {
    if (r.puzzle[i] !== 0) {
      if (r.puzzle[i] === r.solution[i]) agree++; else disagree++;
    }
  }
  out += 'clues preserved by solution: agree=' + agree + ' disagree=' + disagree + '\n';
  let n = SUDOKU.countSolutions(r.puzzle, 3);
  out += 'solution count (cap 3)     : ' + n + (n === 1 ? '  <- UNIQUE ok' : '  <- NOT UNIQUE!') + '\n';
}

/* small MC sweep: how often does the uniqueness guarantee hold */
let uniq = 0, tot = 0, minClues = 81, maxClues = 0;
for (const d of ['easy', 'medium', 'hard', 'expert']) {
  for (let s = 0; s < 3; s++) {
    const r = SUDOKU.generate(500 + s * 7, d);
    tot++;
    if (SUDOKU.countSolutions(r.puzzle, 2) === 1) uniq++;
    minClues = Math.min(minClues, r.clues);
    maxClues = Math.max(maxClues, r.clues);
  }
}
out += '\n=== sweep ===\n';
out += 'puzzles=' + tot + ' unique=' + uniq + ' clue range=' + minClues + '..' + maxClues + '\n';

/* determinism snapshot */
const a = SUDOKU.generate(999, 'medium'), b = SUDOKU.generate(999, 'medium');
out += 'determinism (same seed revisitted): ' +
       (JSON.stringify(a.puzzle) === JSON.stringify(b.puzzle) ? 'IDENTICAL' : 'DIFFERS') + '\n';

fs.writeFileSync(path.join(__dirname, '_probe.txt'), out);
console.log(out.split('\n').slice(-4).join('\n'));
