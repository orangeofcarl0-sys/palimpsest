# CURRENT-STATE-ASSESSMENT（G0 基线审计，只读）

> 日期：2026-09-07 ｜ 基线：`main` @ `41e2077` ｜ 测试基线：46 文件 / 266 测试全绿（本地复跑证实）
> 性质：G0 只读审计产物——不修改生产代码；结论供 G1（Canvas Integrity）与后续 G2–G8 规划取用。
> 方法：通读 17/18/19/20/21 号规格与 `03-system-design-spec.md`；逐行审阅 `src/canvas/`（doc/compile/diff/layout/derive）、`src/architecture/proposal.ts`、`src/scheduler/scheduler.ts`、`src/serve.ts` 画布端点、`web/src/`（App/CanvasView/Panels/types/api）；风险点用临时 vitest 用例机器证实后即删（证据入下表）。

## 1. 当前已有能力（实测核实）

| 层 | 能力 | 落点 |
|---|---|---|
| 定义层 | CanvasDoc v1（Node-RED `z`/`g` 扁平契约变体，依赖词汇＝title） | `src/canvas/doc.ts` |
| 编译 | 编译期展开 → 既有 ProjectProposal → 共享六类诊断校验器 → start/plan 通道 | `src/canvas/compile.ts` + `src/architecture/proposal.ts` |
| 派生 | 字段级 diff（title 同一性）、五布局（只动坐标，A09 布局纯度）、卫星 attempt（CREATED/LEASED/RUNNING 开集）、Trace span | `src/canvas/diff.ts` `layout.ts` `derive.ts` |
| 呈现 | serve 五端点（token 门内纯派生零写入）+ React Flow 就地嵌套视口 + Inspector/diff 上墙/导入导出/localStorage | `src/serve.ts` + `web/src/` |
| 调度 | 声明式阶段图解释器（ACTIVE/VERIFYING 锁存、BLOCKED/READY 扫描、声明 guard）——单 ACTIVE 语义来自 H1 声明图（D-3），非硬编码 | `src/scheduler/scheduler.ts` |
| 治理 | worker report ≠ evidence；proposal→validate→declare 才是 canonical；stale 隔离；promotion 门禁；Ordarium effect 边界 | `src/state` `src/evidence` `src/effects` |

## 2. 合同冻结面（本轮不得触碰）

事件契约（34 事件类型 + M5 投影 + fixture v3 摘要链）、ProjectIR/TaskSpec 序列化、调度器 decide/commit 两段纪律、`suggested_skills` SDS-4 例外先例、Ordarium pin 1.2.0、`PLMP-CANVAS-1..4` 已交付语义。**解析器纪律**：`parseCanvasDoc` 是画布唯一权威校验门（serve 五端点全部先经它；web 面板是结构镜像、按 19 号规格独立构建链，不 import 内核）。

## 3. GUI 能表达 vs Runtime 能执行（错位清单，与愿景文档判定一致）

| # | 表达 | 实际 | 判定 |
|---|---|---|---|
| A | subflow 视觉封装 | 编辑期封装，编译 flatten，无 runtime identity/端口/policy | 属实，G5 前不得伪装 |
| B | 节点标题 | 同时充当依赖身份（title 依赖） | 属实，G2 引入稳定 id 解除 |
| C | 连线 | 压缩为 `dependsOn[]`，无类型边 | 属实，G3 IR 建 typed edge（先 IR 后激活） |
| D | fan_out 预设并行支路 | 调度器锁存阶段图 → 单 ACTIVE（并行仅 candidate attempts） | 属实，G6 ready-set 才是真并发 |
| E | research_loop 回路 | revision loop（plan 修订出新 DAG），非 graph cycle | 属实，UI 不得暗示 cyclic 执行 |

## 4. Canvas 正确性缺陷（G0 机器证实）

### 4.1 愿景文档点名的四项（全部证实）

| 项 | 缺陷 | 证据 |
|---|---|---|
| A | `z` owner 无类型校验：task/annotation 节点可被当作 owner，`parseCanvasDoc` 只查 key 存在 | 临时用例：task-owned task 解析通过 |
| B | self-parent（`A.z = A`）解析通过 | 同上 |
| C | `z` 链 ownership cycle（含任意深度 A→B→C→A）解析通过 | 同上 |
| D | group `g` 链无 self-parent/环检测 | 同上：G1↔G2 互指解析通过 |
| E | 可见性只查直接父：折叠祖先下的已展开孙 subflow 在根坐标泄漏渲染、成员泄漏、`visibleTasks` 边集合同样只查一层 | `web/src/CanvasView.tsx` `hiddenByCollapse`/`parentExpanded`/`visibleTasks` 三处均单层判定 |

### 4.2 本轮审计新发现（同等级）

| 项 | 缺陷 | 证据 |
|---|---|---|
| F | **布局深层断链**：`layout.ts` `descendantsByRoot` 只收集直接子代，`applyMove` 平移根 subflow 时深度 ≥2 的孙代不随迁——违反自身"whole descendant subtree translates"注释与 A09 精神 | 临时用例：compact 布局后 s1 Δ(-420,-420)、s2 随迁、孙成员 m Δ(0,0) |
| G | **环可达性（纵深防御缺口）**：面板 `onDropInto` 零校验地改写 `z`——当前 drop-into 仅对 task 生效（subflow 拖动只移动坐标，`docNode.type !== "task"` 提前返回），故 UI 今日不可直接拖出 z 环；但若 subflow 重挂载上线即成为环入口（环 → `descendantsAbs` 无限递归渲染崩溃）；z 环今天实际经 H 的导入/恢复路径进入 | 代码路径审查（`onNodeDragStop` 早退分支） |
| H | **导入旁路**：localStorage 恢复与 JSON 导入只查 `version===1 && Array.isArray(nodes)`，不经 `parseCanvasDoc`——畸形/成环文档可绕过权威校验进入渲染 | `web/src/App.tsx` 两处加载点 |
| I | **静默丢字段**：annotation 携带 `task`、task/annotation 携带 `text` 被解析器静默丢弃——round-trip 不保真，违背本模块"fail-closed、typo 必须响亮失败"声明 | 临时用例：annotation+task 解析后字段消失 |

### 4.3 处置分级

- **G1（本轮修复，纯客户端/画布层，零编排触碰）**：A–I 全部。A–D/I 为 `parseCanvasDoc` 加法式收紧（fail-closed 拒绝）；F 为 layout 传递子孙集修正；E/G/H 为面板层（祖先链可见性、drop 环守卫、加载守卫）。机器验收 CANVAS-A11–A17 + 真实浏览器深层嵌套冒烟。
- **G2+（后续阶段，见 NEXT-GRAPH-EVOLUTION-PLAN）**：稳定 id、typed edge IR、runtime subgraph、ready-set 调度。

## 5. 改动空间判定

**可 purely additive（G1 采此路）**：`src/canvas/` 解析器收紧与 layout 修正、`web/src/` 渲染/交互守卫、`test/canvas.test.ts` 新验收、文档与规格——不触碰 `src/schema` `src/state` `src/scheduler` `src/domain` `src/evidence` `src/architecture` 与 `fixtures/`。

**会触发 schema/event/parity migration 的（本轮禁止，G2+ 立项）**：GraphEdge 进事件或 ProjectIR（需 schema bump + M6 + fixture v4）；CanvasDoc 字段进 canonical 面（违背账本唯一真相红线，不得做）；调度语义变更（需阶段图合同修订 + replay 再生）。

**兼容性陈述**：G1 解析器收紧对**此前合法文档零扰动**（owner 类型、无环、字段纪律此前均为隐含合法面）；对此前"解析通过但语义畸形"的文档由静默接受改为显式拒绝（fail-closed 是修复对象本身）。事件、投影、digest、fixture、编译输出：零变化。
