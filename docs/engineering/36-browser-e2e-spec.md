# 浏览器 E2E 规格（PLMP-WEB-E2E-1，G9-G，36 号）

- 日期：2026-09-10
- 母体审计：`audits/G9-G-BROWSER-E2E-ASSESSMENT.md`（历史冒烟对账 + 选择器审计 + fixture 设计，先行）
- 立论：**G9 证明的性质必须在真实浏览器组合中存活**——Identity survives editing（D）、Presentation survives semantic editing（C）、Contracts interpreted exactly + ViewFreshness ≠ EventPosition（F/F2）。
- 交付报告：`audits/G9-G-BROWSER-E2E-DELIVERY.md`（二十六问）

## 1. 真实内核 fixture 架构（E2E-INV-1）

$$
Browser \rightarrow dist/web \rightarrow serveOrchestration \rightarrow ProjectController \rightarrow EventStore/SQLite \rightarrow projections \rightarrow Ordarium\ effects\ boundary\ (FakeGitPort)
$$

- **进程内真实内核**：`e2e/support/kernel.ts` 直接 import **构建产物** `dist/src/*.js`（EventStore / createPalimpsestEffects+FakeGitPort / ProjectController / serveOrchestration），`serveOrchestration({host:"127.0.0.1", port:0, token})`。§12 落地说明：e2e spec 由 Playwright 转译 TS，直接 import dist JS 是"不测第二套栈"的最小等价解——它同时把"先 build 再 e2e"变成硬前提（`pretest:e2e` 钩子 + global-setup 对 dist 缺失快速失败）。
- **零 mock**：Palimpsest 内核（controller/scheduler/投影/patch/画布合同）全真；唯一替身是已声明的确定性测试端口 FakeGitPort（外部副作用边界）。禁 fake JSON API / MSW / 假 controller / 独立浏览器状态机（§1）。
- **CLI 打包冒烟**（§31）：仅一条用例走 `node dist/src/cli.js serve --db --ops --port 0 --token` 子进程（built bin 解析、health、built web 静态、干净关闭）；主 fixture 仍进程内（§32：确定性前置 + 零生产测试端点 + 无子进程群）。
- **seed 即 setup**（§15）：Node 侧用公开 controller 方法（start/plan/declareRoleTable/declareStageGraph/step/claim）在浏览器动作前建立拓扑/hold/attempt/并发=2；场景一旦开始，用户可见迁移走真实 UI/API。**零** `/api/test/*` 生产后门（§14，E2E-INV-3）。

## 2. 隔离与端口（E2E-INV-2 / §10/§11/§34）

- 每测试：mkdtemp → 新 palimpsest.sqlite + 新 ordarium.sqlite + 新 controller + 新 effects + 新 serve + 新 browser context；teardown 逆序关 serve→effects→store→删临时目录（§33 硬性要求）。
- **临时端口冻结**：`port: 0` + `127.0.0.1`，用 OS 分配端口；**永不**依赖全局保留固定端口段（§10）。
- **无持久测试库**（§34）：`~/.dsh`、开发者 DSH_HOME、仓库内常驻 sqlite 一律禁止；全部文件在临时目录。
- localStorage 天然按 origin（每测试新端口）隔离，草稿 doc 不跨测试泄漏。

## 3. 令牌策略（§17）

`web/src/api.ts` 的键名核验为 `palimpsest-token`——init script 在任何页面脚本前注入；仅 `E2E-AUTH-01` 一个专项场景走真登录（无令牌→锁定→错误令牌仍锁定→正确令牌进入），其余套件不重复登录仪式。

## 4. 选择器纪律（§18/§19/§41）

- 普通交互用可访问名（暂停/恢复/单步/机械推进 ×20/进入/＋任务/＋子图/＋分组/删除此节点/校验提案/对照实时/GraphPatch/预览 Patch/应用到草稿/记录门禁证据/晋升/挂起（断点）/放行（清除断点）/卫星开/关/Trace开/关/手搓模式/导出/导入/画布布局/节点标题/画布目标）；表单用 placeholder。
- 本次新增 presentation-only 稳定属性：`data-canvas-node-key`（画布节点根 div）、`data-graph-node-key` + `data-graph-state`（实时任务节点）、`data-attempt-id`（卫星）、`data-hold-task-id`（治理挂起行）、`data-app-message`（消息行）、aria-label（画布布局/节点标题/画布目标/注记内容）。
- **红线（§19）**：`data-*` 选择器 ≠ 语义身份源——语义 id 只作为**属性值**暴露，DOM 不拥有身份；不得进入 CanvasDoc/AgentGraph/ProjectIR/digest/账本。
- 禁 nth-child / ReactFlow 类链 / 像素坐标身份 / SVG 遍历。

## 5. 套件矩阵（§21-§28/§52；§53 收敛为 21 用例）

```text
boot-auth.spec   E2E-BOOT-01 空服务诚实加载无抖动 · E2E-AUTH-01 令牌门 ·
                 E2E-POLL-01 未变轮询不清屏 · E2E-POLL-02 暂停/恢复收敛
canvas.spec      E2E-CANVAS-01 加/改名/连线落 doc · 02 删除连通+分组节点清理全部关联 ·
                 03 拖入/拖出子图 z 归属 · 04 布局只动呈现不动语义 ·
                 05 导出回环 + v2 导入显式升级键保留
graph-patch.spec E2E-PATCH-01 预览先行+显式应用 · 02 非法拒绝+草稿不变 ·
                 03 过期锚拒绝不静默 · 04 改名保键 · 05 语义 patch 保坐标+保组 ·
                 06 新节点避让不全局重排
runtime-debugger E2E-RUNTIME-01/02 暂停-单步-恢复真状态迁移 · E2E-DEBUG-01 hold 放行同任务 ·
                 RUNTIME-03 attempt 卫星归位+开关不触运行时 · RUNTIME-04 Trace 显隐不改运行时
ready-set.spec   E2E-READY-SET-01 并发=2：A∧B 同时 ACTIVE、C 保持 BLOCKED、满闸后续步无变化
cli-smoke.spec   E2E-CLI-01 built CLI 起停干净 + health + built web
```

断言优先 web-first（toBeVisible/toHaveAttribute/toContainText）+ 文本/语义属性/localStorage doc/DOM boundingBox；**不做**黄金截图套件（§20/§44）。断言主用户可见信号**不查 SQLite**（§42——Node 侧 setup 诊断除外）。

## 6. CI 拓扑（§35-§40，E2E-INV-6）

`.github/workflows/ci.yml` 双 job（Node 24 + pnpm 11）：

```text
unit: pnpm install --frozen-lockfile → pnpm test（build+vitest）→ pnpm build:web
e2e:  pnpm install --frozen-lockfile → pnpm build → pnpm build:web
      → pnpm exec playwright install --with-deps chromium
      → pnpm exec playwright test
      失败时上传 playwright-report/ + test-results/（7 天，成功不存）
```

- 浏览器矩阵冻结 **Chromium only**（§9）。
- **retries = 0**（E2E-INV-7）：偶发要修同步/fixture，不许重试掩盖；本批实例——`seed()` 曾 fire-and-forget claim，RUNNING 状态与首帧竞态致一次偶发，改为 await 播种后连续两轮 21/21。
- `pnpm test`（unit 门）**永不**要求已下载浏览器；两门分离（§7）。

## 7. 配置冻结（playwright.config.ts）

workers=1、fullyParallel=false、retries=0、trace=retain-on-failure、screenshot=only-on-failure、video=off、testDir=e2e（与 vitest `test/**` 不相交，§8）、timeout 60s / expect 10s、globalSetup 守卫 dist 存在性。

## 8. G9 完成判据（§54/§58）

unit 套件绿（本批 60 文件/433）＋ web build 绿 ＋ Playwright 套件绿（21 用例 × 连续两轮）＋ CLI 打包冒烟绿 ＋ CI workflow 已提交 ＋ 本规格/交付报告/roadmap（G9 COMPLETE）齐 ＋ 干净环境重跑（clean → fresh build ×2 → 全套）通过。此后 G9 关闭，下一批 **G10-A0**（纯文档）；不再有 G9-H。

## 9. 不变量汇总

```text
E2E-INV-1  主浏览器套件驱动真实 Palimpsest 内核，非 mock 编排后端
E2E-INV-2  每个浏览器测试与其他测试的持久/运行时状态隔离
E2E-INV-3  不存在生产测试专变端点
E2E-INV-4  语义身份/呈现/新鲜度回归在组合性失败处有持久浏览器覆盖
E2E-INV-5  Ready-Set 可执行并发至少一个浏览器/系统证明
E2E-INV-6  E2E 是强制 CI 门，非可选本地演示
E2E-INV-7  偶发成功不被重试掩盖
```

## 10. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-10 | 初版冻结（PLMP-WEB-E2E-1）：真实内核 fixture（dist/src+dist/web，FakeGitPort 唯一替身）、每测试全新临时库+临时端口、token init-script、presentation-only data-* 选择器红线、六套件 21 用例、CI 双 job、retries=0、G9 COMPLETE 判据。 |
