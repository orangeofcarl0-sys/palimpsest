# G9-G — Real-Kernel Browser E2E Assessment（§3 审计先行）

基线：9d74e05，59 文件 / 431 测试全绿；kernel/web tsc、vite build 绿。CI 现状：**无**（仓库无 `.github/`）。

## 1. 历史浏览器/人工冒烟抓到过真 bug 的场景（必须转持久 E2E）

| 来源 | 场景 | 曾抓到的真缺陷 |
| --- | --- | --- |
| G2–G8 各轮 | 图面拖拽/连线/折叠/嵌套 | Handles 缺失导致 draft 边不挂载（G9-C 前夜）；rename 断边（32 号前）；布局断链；drop 环守卫 |
| G9-D 会话 2 | localStorage 恢复、身份证据、anchor→patch 链 | stale anchor 拒绝（STALE_GRAPH_BASE + DUPLICATE_NODE_ID）、EMPTY_GOAL |
| G9-C | 12 步表现保全冒烟 | 语义 patch 清坐标/清分组（reconcileCanvasPresentation 修复的动因） |
| G9-F | 空 serve UI 冒烟、暂停/恢复失效 | health 空态、viewCursor 失效链路 |
| G9-F2 | 冒烟 A/B/D | （确认无面板行为回归） |

## 2. 已被内核/API 测试充分覆盖、E2E **不**重复的

- 解析器严格性全套：PARSE-RES-A01..A05、DURABLE-PARSE-A01..A05、CANON-RES-A01..A05（含 GateClause.wheer、CANDIDATE_SELECTED 布尔、直接 EventStore.append 畸形）。
- 视图新鲜度机制：WEB-H01-A..E（建图计数器断言）、VIEW-RES-A01..A04/C01（attribution 别名）、VIEW-INV-6 混合游标、HEALTH-RES-A01..A03（项目隔离）。
- patch/presentation 内核：PATCH-PRES-A01..A04、CANVAS-H01..H10、PRES-BELT ×2、DIFF-ID/ANCHOR 电池。
- E2E 只测**用户可见组合**（指令 §25 冻结）。

## 3. 必须真 DOM/浏览器组合才能测对的

React Flow 渲染与交互（把手连线、拖拽、折叠隐藏链）、localStorage 恢复与 v2→v3 升级提示、导入/导出文件流（Playwright download/upload）、轮询收敛在 UI 上的可见稳定（无清屏抖动）、patch 预览/应用 UI 流、hold 挂起/放行 UI、卫星/Trace 显示、**并发=2 双任务同时 ACTIVE**（调度器可执行语义非画图）。

## 4. 目前缺稳定选择器的元素（本次补齐，presentation-only）

- 画布节点根元素（自定义 node view）→ `data-canvas-node-key`；分组盒 → `data-canvas-group-id`。
- 实时图任务节点 → `data-graph-node-key`；卫星 → `data-attempt-id`。
- 治理挂起面板行 → `data-hold-task-id`。
- 普通按钮/表单已有可访问名（暂停/恢复/单步/机械推进 ×20/进入/＋任务/＋子图/＋分组/删除此节点/校验提案/对照实时/GraphPatch/预览 Patch/应用到草稿/记录门禁证据/晋升/挂起（断点）/放行（清除断点）/卫星开/Trace关/手搓模式/导出/导入/布局 ▾；placeholder 写域/产物/建议门禁 id/技能提示）——不再撒 data-testid。

## 5. 最小真实内核 server fixture

**进程内**：`EventStore(mkdtemp/palimpsest.sqlite)` + `FakeGitPort` + `createPalimpsestEffects({databasePath: mkdtemp/ordarium.sqlite})` + `ProjectController` + `serveOrchestration({host:"127.0.0.1", port:0, token})`。每测试全新（§11），teardown 关 browser context → serve → effects → store → 删临时目录。导入**构建产物** `dist/src/*.js`（§12：e2e spec 由 Playwright 转译 TS，直接 import dist JS 避免第二套转译差异，并使"先 build 再 e2e"成为硬前提；`dist/web` 由 serve 的静态根自动就是真实 bundle）。若 dist 缺失，fixture 给出明确报错而非静默换栈。

## 6. 无生产测试后门的播种方式

Node 侧 setup 用内核/controller 公开方法（start/plan/declareStageGraph/declareRoleTable/declareGate/step/report/gate）建立拓扑/holds/attempt/并发=2——setup 不是受试对象（§15）；场景一旦开始，用户可见迁移走真实 UI/API。零 `/api/test/*`。

## 7. 浏览器矩阵

**仅 Chromium**（§9 冻结）：G9-G 的目的是确定性语义安全网，非兼容性。

## 8. CI 基础设施现状

不存在——本批创建首个 `.github/workflows/ci.yml`：**unit job**（Node 24 + pnpm 11，`pnpm install --frozen-lockfile` → `pnpm test` → `pnpm build:web`）与 **e2e job**（build ×2 → `playwright install --with-deps chromium` → `pnpm test:e2e`，Chromium only）。失败上传 `playwright-report/`、`test-results/`。

## 9. 失败工件

`trace=retain-on-failure`、`screenshot=only-on-failure`、`video=off`；Playwright 内建报告即够（§55），不自建日志框架。

## 10. G9 COMPLETE 的确切条件

unit 套件绿（≥432，含 CLI-PROJECT-A01）＋ web build 绿 ＋ Playwright 套件绿（boot-auth/canvas/graph-patch/runtime-debugger/ready-set + CLI 打包冒烟）＋ CI workflow 已提交 ＋ 规格 36/交付报告/roadmap（G9 COMPLETE）齐 ＋ 干净环境重跑（fresh build ×2 → 全套）通过。

## 附加事实核验

- 令牌注入键名核验：`web/src/api.ts` `TOKEN_KEY = "palimpsest-token"`——与指令 §17 的 localStorage 键**一致**，init script 直接注入。
- 轮询节奏：App 2s setInterval；pause/resume/step 走显式 refresh（§30 优先断言显式迁移）。
- CLI 固定 `projectId: "project"`（cli.ts）——兄弟项目场景只能由 Node 侧 setup 造（另一 projectId 的 controller start），CLI 子进程随后对同一 --db 走 `architect --declare`，这正是 §4 预检 bug 的复现路径。
- 三处 "is this project initialized?" 查询：`controller.serviceHealth`（F2 已修）、`serve.ts` declare started（F2 已修）、`cli.ts` architect --declare（**未修**）→ 达到集中阈值，收口为 `ProjectController#isProjectInitialized()`（read-side，无新持久概念）。
