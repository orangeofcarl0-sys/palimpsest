# G9-G 交付报告 — Real-Kernel Browser E2E + G9 Completion Gate（PLMP-WEB-E2E-1，36 号）

- 日期：2026-09-10
- 母体审计：`G9-G-BROWSER-E2E-ASSESSMENT.md`；规格：`36-browser-e2e-spec.md`
- 基线：9d74e05，59 文件 / 431 → 终态 **60 文件 / 433 vitest 全绿 + Playwright 21 用例全绿（连续两轮）**
- 预检热修：CLI `architect --declare` 兄弟项目 bug（§4-6）先行复现并修复

## 二十六问（§49）

**1. 浏览器 E2E 栈到底驱动了什么？**
Chromium（Playwright，headless）→ **构建产物 dist/web bundle** → 真实 `serveOrchestration`（HTTP，127.0.0.1:0 + Bearer）→ 真实 `ProjectController` → 真实 `EventStore`/SQLite → 真实投影/scheduler/graph/canvas 合同 → Ordarium effects 边界（FakeGitPort 唯一替身）。

**2. 哪些组件是真的？**
内核全部：事件账本、投影、调度器步进、视图游标/健康、画布 derive/patch/reconcile、控制面（pause/resume/next/run/gate/promote/hold）、CLI 打包路径（一条冒烟）。无 fake JSON API、无 MSW、无假 controller（§1 冻结）。

**3. 哪些外部副作用端口是确定性替身？**
仅 Git：`FakeGitPort`（`src/effects` 已声明的确定性测试端口，与 kernel 测试同源）。Ordarium effects 是真实 assembly（临时 ordarium.sqlite）。

**4. 主 fixture 为何进程内而非 CLI-only？**
确定性前置（多任务图/自定义 StageGraph/hold/attempt/并发=2）需要精确播种而不引入生产测试端点、几十个 CLI 子进程或 mock 服务（§32）。浏览器动作仍流经真实 HTTP/内核栈——依然是 E2E；CLI 路径由唯一一条打包冒烟独立覆盖。

**5. 每个测试都由全新 SQLite/临时状态隔离吗？**
是：每测试 mkdtemp → 新 palimpsest.sqlite + 新 ordarium.sqlite + 新 controller/effects/serve/browser context；teardown 关 serve→effects→store→删目录（§33）。localStorage 按 origin（每测试新端口）天然隔离。

**6. 端口是临时的吗？**
是——`port: 0`，OS 分配；无任何固定端口段（§10 冻结）。CLI 冒烟同样 `--port 0`。

**7. Bearer 令牌如何注入？**
init script 在任何页面脚本前写 `localStorage["palimpsest-token"]`（键名与 `web/src/api.ts` 核验一致）；仅 `E2E-AUTH-01` 走真登录（无令牌→锁定→错令牌仍锁定→对令牌进入），其余套件跳过登录仪式（§17）。

**8. 添加了哪些稳定选择器？**
presentation-only：`data-canvas-node-key`（画布节点）、`data-graph-node-key`+`data-graph-state`（实时任务节点）、`data-attempt-id`（卫星）、`data-hold-task-id`（治理挂起行）、`data-app-message`（消息行）；aria-label：画布布局/节点标题/画布目标/注记内容。普通按钮/表单用既有可访问名与 placeholder（§18/§41）。红线：属性值只暴露语义 id，DOM 不拥有身份（§19）。

**9. 哪些旧人工冒烟成了持久 E2E？**
G2-G8 的连线/嵌套/折叠/删除关联清理、G9-D 的 anchor→patch 链与 stale 拒绝、G9-C 的表现保全（坐标+分组）、G9-F 的空态/轮询/暂停恢复、G9-F2 的冒烟 A/B/D——全部入六套件（§5 矩阵）。旧的"拖出子图"冒烟缺口反而暴露了一个真 bug（见 Q24）。

**10. 哪些低层不变量被有意**不**复制？**
解析器严格性（PARSE-RES/DURABLE-PARSE/CANON-RES：wheer、CANDIDATE_SELECTED 布尔、畸形 append、attribution 别名）、视图新鲜度机制（WEB-H01 建图计数、VIEW-RES-C01 混合游标、HEALTH-RES 项目隔离）、patch 内核电池（PATCH-PRES/CANVAS-H/PRES-BELT）——内核已钉死，E2E 只测用户可见组合（§25）。

**11. boot/auth 套件覆盖什么？**
空服务诚实加载（未初始化消息恒定不抖动）、令牌门全流程、未变轮询不清屏、暂停/恢复在 UI 上收敛（E2E-BOOT-01/AUTH-01/POLL-01/POLL-02）。

**12. canvas 套件覆盖什么？**
加/改名/把手连线落 doc（含单调计数器）、删除连通+分组节点清理边与组籍且画布可用、拖入/拖出子图 z 归属、自动布局只动呈现不动语义（键/边/identity 不变）、导出 v3 回环 + v2 导入显式升级且旧键保留依赖折边（E2E-CANVAS-01..05）。

**13. GraphPatch 套件覆盖什么？**
预览先行+应用显式、非法拒绝诊断可见草稿不变、过期锚拒绝（STALE_GRAPH_BASE）且无应用入口、改名保键（update 非 remove+add）、语义 patch 逐字节保位+保组（doc x/y + DOM bbox 双证）、新节点避让不全局重排（E2E-PATCH-01..06）。

**14. runtime/debugger 套件覆盖什么？**
UI 单步驱动真状态迁移（READY→ACTIVE）+ 暂停/恢复往返、hold 挂起/放行同一语义任务（治理行+徽章+身份不变）、claim 过的 attempt 以卫星归位其任务（卫星开关不触运行时）、Trace 显隐不改运行时（E2E-RUNTIME-01/02、DEBUG-01、RUNTIME-03/04）。

**15. Ready-Set 证明了两任务同时 ACTIVE 吗？**
是（E2E-READY-SET-01）：并发=2 播种后经**真实 UI 单步**驱动（activation→attempt→fall-through activation→attempt），在同一可观测点断言 `task-a=ACTIVE ∧ task-b=ACTIVE` 且 `task-c=BLOCKED`；满闸后进一步单步无变化（与内核 SCHED-A02/A03 镜像）。

**16. CLI 打包冒烟通过了吗？**
通过（E2E-CLI-01）：`node dist/src/cli.js serve --db/--ops/--port 0/--token` 起动、打印句柄、health 200/ok=true、built web bundle 真被服务（`<div id="root">`）、进程终止（POSIX 干净退出；Windows 信号模拟按任意终止判定并已注释）。

**17. CLI `architect --declare` 兄弟项目 bug 复现并修复了吗？**
是。三处 "is this project initialized?" 查询达集中阈值（§5）：收口为 `ProjectController#isProjectInitialized()`（read-side，无新持久概念），serviceHealth（F2 已修）、serve declare（F2 已修）、**cli.ts（本批修复：原全局 `LIMIT 1`）** 三面同源。CLI-PROJECT-A01：真 CLI 子进程对"兄弟项目已占库"的共享 store `architect --declare` → 修复前 exit 1（走 plan 报 "project does not exist"，test-first 实证）→ 修复后 `PROJECT_CREATED`。冻结：SiblingProjectInitialized ⇏ CurrentProjectInitialized。

**18. 创建了哪些 CI job？**
`.github/workflows/ci.yml` 首个 CI：**unit**（Node 24 + pnpm 11，frozen lockfile → `pnpm test` → `pnpm build:web`）与 **e2e**（build ×2 → `playwright install --with-deps chromium` → `pnpm exec playwright test`，Chromium only），失败上传工件。

**19. 失败时保留哪些工件？**
`playwright-report/`（HTML 报告）+ `test-results/`（含 retain-on-failure trace 与 only-on-failure 截图），7 天，仅失败上传（§38/§55）；`video=off`。

**20. retries 是零吗？**
是（config + CI 冻结，E2E-INV-7）。本批唯一偶发（RUNTIME-03 一次）的根因是 seed 里 fire-and-forget 的 claim 与首帧轮询竞态——修为 `await controller.claim` 播种后**连续两轮 21/21**，未用重试掩盖。

**21. Vitest 最终计数？**
**60 文件 / 433 用例全绿**（59/431 → +2：`test/cli_project_scoping.test.ts` 的 helper 作用域断言 + CLI-PROJECT-A01）。无既有用例弱化或删除。

**22. Playwright 最终计数？**
**21 用例全绿**（boot-auth 4、canvas 5、graph-patch 6、runtime-debugger 4、ready-set 1、cli-smoke 1），连续两轮（含干净环境重跑）。

**23. 完全干净 checkout 能过两条 CI 等价路径吗？**
本地等效已验：`pnpm run clean` → fresh `pnpm build` + `pnpm build:web` → `pnpm test`（433 绿）→ `pnpm test:e2e`（pretest 钩子重建后 21 绿）→ kernel/web tsc 干净。CI 本体在推流后由 GitHub Actions 首跑验证（workflow 已随本批提交）。

**24. G9-G 抓到了产品 bug 吗？**
**两个，均已最小修复并记录**：
1. **拖出子图不可达（E2E-CANVAS-03 抓到）**：成员节点带 `extent: "parent"`，React Flow 把成员拖拽钳制在子图框内，成员中心在数学上永远出不了边界——App 里 `onDropInto(key, null)`（"已移出子图"）路径**拖拽不可达**（G9-D 冒烟从未真做过 UI 拖出，缺口遗留）。最小修复：去掉该钳制一行（作用域归属由 drop 检测裁决，own-owner 内释放仍保成员籍）；低层回归＝既有 CANVAS-MUT/moveScope 内核电池 + 本 E2E 即组合回归。
2. **E2E fixture 自身**：`void controller.claim` 竞态（Q20）——await 化。
预检热修（CLI 项目隔离）见 Q17。

**25. G9 现在正式 COMPLETE 了吗？**
**是**。G9-D（稳定 Work 身份）＋ G9-C（稳定 Work 呈现）＋ G9-F/F2（契约精确解释＋视图新鲜度）＋ G9-G（性质在真实浏览器组合中存活，CI 强制门）全部退出；roadmap 已落 `G9 COMPLETE` 分隔线，无指向任何 G9 后续实现阶段的箭头。

**26. 确切的下一批是什么？**
**G10-A0 — Semantic Entity / Identity / Binding Audit**：纯文档预检闸（零代码零 schema），逐项审计但不实现 roadmap 所列实体/身份/绑定问题。G9-G 未写任何一行 UAS 语义代码（§57）。

## 退出矩阵（§52）

BOOT/AUTH/POLL ✓（4）· CANVAS ✓（5）· GRAPHPATCH ✓（6）· RUNTIME/DEBUGGER ✓（4）· READY-SET ✓（1：并发=2 + 双 ACTIVE + C 阻塞）· PACKAGING ✓（1）。20 用例覆盖 24 项矩阵属性（§53 收敛）。
