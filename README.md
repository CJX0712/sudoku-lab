# 数独实验室 · Sudoku Lab

一个**零依赖、离线可运行**的数独生成与求解工具。单文件 HTML，双击即用。
每一局谜题都由引擎保证**唯一解**——这不是口号，而是可以在浏览器内实时验证的不变量。

> 作者：晨星

## 快速开始

```bash
# 无需安装、无需构建、无需联网
打开 index.html
```

或用任意静态服务器：

```bash
python -m http.server 8000   # 然后访问 http://localhost:8000
```

## 功能

| 功能 | 说明 |
|------|------|
| 四档难度 | 简单 42 / 中等 34 / 困难 28 / 专家 24（明面数字下限） |
| 唯一解保证 | 每次挖洞后都做解计数校验，破坏唯一性就回填 |
| 实时冲突检测 | 同行/同列/同宫重复立即标红 |
| 提示一格 | 随机补一个空格，来自标准解 |
| 显示答案 | 一键填满标准解 |
| 校验 / 重置 | 当前局面体检；回落初始明面 |
| 键盘操作 | 点格子后 `1–9` 填数，`0`/`Backspace`/`Delete` 清除，方向键移动 |
| 引擎自检面板 | 浏览器内实时跑三条数学不变量，结果可视化 |

## 引擎 API

引擎是一段完全 **DOM-free** 的纯 JS，挂在 `globalThis.SUDOKU` 上，可直接在浏览器控制台或 Node 里调用：

```js
SUDOKU.generate(seed, 'hard')        // -> { puzzle, solution, clues, difficulty, seed }
SUDOKU.solve(grid, limit)            // -> { count, solution }   回溯求解
SUDOKU.countSolutions(grid, limit)   // -> Number                解计数（可设上限）
SUDOKU.isSolved(grid)                // -> Boolean               完整且合法
SUDOKU.validate(grid)                // -> Boolean               无冲突（允许空）
SUDOKU.conflictCells(grid)           // -> [index...]            精确定位冲突格
SUDOKU.generateFullSolution(rng)     // -> 一个随机的完整合法解
SUDOKU.mulberry32(seed)              // -> 确定性伪随机发生器
```

`grid` 为长度 81 的数组或 `Int8Array`，行优先，`0` 表示空格。

### 实现要点

- **位掩码 + MRV（最小剩余值）**：行/列/宫各用一个 9 位掩码记录已占数字，候选集为
  `~(row|col|box) & 0x3FE`；每步挑选候选数最少的空格，剪枝极快。
- **确定性**：所有随机性来自 `mulberry32(seed)`，同 seed 必然产出同一题。
- **挖洞保唯一**：从完整解出发随机顺序挖格，每挖一格用 `countSolutions(puzzle, 2) === 1`
  检验，一旦出现第二个解就回填。

## 验证

数学不变量全部通过 Node **无头验证**，不靠"看起来能跑"：

```bash
node _smoke.js     # 引擎不变量      -> _smoke.log   PASS 270 / 270
node _probe.js     # ASCII 人工核对  -> _probe.txt
node _uicheck.js   # UI 接线检查     -> _uicheck.log PASS 23 / 23
```

核心不变量：

| 不变量 | 含义 |
|--------|------|
| 完整解的每行/列/宫都是 1–9 排列 | 产物本身合法 |
| 谜题是标准解的子集 | 明面数字不会被改动 |
| `countSolutions(puzzle, 2) === 1` | **唯一解**，兑现核心承诺 |
| 重解结果与内置解逐格一致 | 两条独立路径交叉验证 |
| `solve → isSolved` 往返闭合成立 | 端到端自洽 |
| 同 seed 生成完全一致 | 确定性成立 |
| `conflictCells` 精确定位到重复格索引 | 冲突检测无误报漏报 |
| 明面数 ≥ 难度目标 | 难度分档真实生效 |

`_probe.js` 会把题面和解答以 ASCII 棋盘打印出来供人工核对——**全绿不等于正确**，
所以这一轮必须肉眼看一眼。

## 浏览器内自检

页面底部有一栏实时自检，每次生成新局都会重跑：

- ✅ 答案合法（每行/列/宫为 1–9 排列）
- ✅ 谜题唯一解（穷举计数 = 1）
- ✅ 谜题本身无冲突

## 文件结构

```
index.html      单文件成品（HTML + 内联 CSS + 引擎 script + UI script）
_smoke.js       引擎不变量测试（从 index.html 抽取引擎段，在 vm 中运行）
_probe.js       ASCII 棋盘输出
_uicheck.js     UI 接线测试（最小 DOM stub，模拟点击所有控件）
```

## License

MIT © 晨星
