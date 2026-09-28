// sudoku-lab 无头自检：从 sudoku.html 抽出引擎脚本，跑 selfTest(50)
const fs = require("fs");
const html = fs.readFileSync("sudoku.html", "utf-8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no script block"); process.exit(1); }
// 最小 DOM stub：只为了脚本顶层 const 能执行到 module.exports
const stub = { innerHTML: "", textContent: "", className: "", dataset: {}, children: [],
  appendChild() {}, classList: { toggle() {}, add() {} } };
globalThis.document = {
  getElementById: () => ({ ...stub, firstChild: null }),
  createElement: () => ({ ...stub }),
};
const mod = { exports: {} };
new Function("module", "exports", m[1])(mod, mod.exports);
const { selfTest, validGrid, generate, solveCount } = mod.exports;
const t0 = Date.now();
const r = selfTest(50);
console.log(`selfTest(50): pass=${r.pass} fail=${r.fail} ${Date.now() - t0}ms`);
// 附加不变量抽查
const { sol, puzzle, dug } = generate(52);
console.log(`单局抽查: 挖洞 ${dug} 格, 唯一解=${solveCount(puzzle.slice(), 2).count === 1}, 终盘有效=${validGrid(sol)}`);
const okAll = r.pass === 50 && !r.fail;
console.log(okAll ? "ALL GREEN ✅" : "RED ✗");
process.exit(okAll ? 0 : 1);
