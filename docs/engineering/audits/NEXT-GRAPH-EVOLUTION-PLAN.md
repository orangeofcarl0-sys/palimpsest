# NEXT-GRAPH-EVOLUTION-PLAN（G2–G8 演进规划）

> 日期：2026-09-07 ｜ 母体：`audits/CURRENT-STATE-ASSESSMENT.md`（G0）+ G1 交付（PLMP-CANVAS-5，22 号规格）
> 性质：**规划文档，非冻结规格**——每阶段启动前仍须按 03 号 §9 走完整规格纪律（audit → design spec → acceptance → implementation → tests → e2e → docs registration）。
> 总原则（03 号 + 愿景文档 §24 禁止事项）：风险递增推进；每阶段 additive 优先；合同触点变更必须 schema bump + ACC-02 + 迁移 + fixture 再生三者齐备；IR 允许表达 ≠ 当前 runtime 必须执行；React Flow 类型永不做领域模型；LLM 永不进内核；Ordarium 永不做调度。

## 0. 依赖图

```text
G1 Canvas Integrity（已交付，PLMP-CANVAS-5）
 │
 ├─► G2 Stable Graph Identity ──► G3 AgentGraph IR v1 ──► G5 Runtime Subgraph v1 ──► G7 Unified Runtime Graph
 │            │                        │                                                    ▲
 │            └──► G4 GraphPatch ◄─────┘（Preset/Auto/Manual 统一为 patch 生成器）           │
 │                                                                                          │
 └─► G6 Ready-Set Scheduler ────────────────────────────────────────────────────────────────┘
                                              （G7 需要 G5 的 runtime identity 与 G6 的并发状态）

G8 Debugger Controls：依赖 G7（lineage/回放面）＋ G6（activation 级控制对象）；breakpoint 可在 G6 后独立先行。
```

硬依赖：G3 依赖 G2 的稳定 id（IR 没有 id 就只是又一层 title）；G4 依赖 G2/G3（patch 以 id 为操作对象）；G5 依赖 G3（Subgraph 是 IR 节点）＋G6（scope 内并发才有意义）；G7 依赖 G2/G3/G5/G6；G8 依赖 G6/G7。
可并行：G4 与 G5 无相互依赖；G6 与 G2–G4 完全正交（调度器不读画布）。

## 1. G2 — 稳定图身份（Stable Canvas Graph Identity）

**目标**：rename 不断边。`id = 图身份，title = 显示元数据`；canvas 内边改挂 `nodeId`，编译时经 id→title 表生成既有 title 依赖。

| 项 | 内容 |
|---|---|
| 改动面 | `CanvasNode` 增可选 `id`（或复用 key 语义升级为不可变 id）；`CanvasTaskPayload.dependsOn` → `dependsOnIds`（title 数组保留为编译输出）；画布连线/重命名/Inspector 全走 id |
| 合同触点 | CanvasDoc v1 → **v2 字段（加法式可选）**：v1 文档（无 id）加载时以 key 兜底生成 id——纯客户端升级，无服务端状态 |
| 加法/major | **加法**（Proposal/TaskSpec/事件零触碰；编译输出仍为 title 依赖） |
| 迁移风险 | 低。风险点＝localStorage/导入的双版本共存：解析器 permissive 读 v1/v2，写回统一 v2；21 号"重命名＝UNKNOWN_DEPENDENCY 诚实诊断"语义由编译器的 id→title 映射取代（诊断仅当 id 悬空） |
| 退出门 | ①v1 文档自动升级 round-trip 全绿；②rename 节点后 diff 无 added/removed 假阳性；③`canvasCompile` 输出与手写提案逐字节一致（既有 A02/A03 原样通过）；④事件/fixture 零变化 |

## 2. G3 — AgentGraph IR v1（renderer-neutral）

**目标**：与渲染器解耦的图中间表示；当前 runtime 能编译的子集先上，超集 fail-closed。

| 项 | 内容 |
|---|---|
| 形态 | `src/graph/`（新内核模块，不依赖 React/React Flow）：`GraphNode{ id, kind, label, payload }`、`GraphEdge{ id, source{node,port?}, target{node,port?}, kind }`、`GraphScope`（compound 容器）；kind 分层：**runtime-semantic**（agent/task/gate/subgraph）vs **advisory/authoring-only**（tool/router/memory/human/artifact）——后者只进 IR 与画布，编译器显式拒绝或降级，绝无"画了就假装能跑" |
| 合同触点 | 零事件触碰（IR 是 CanvasDoc 与 ProjectProposal 之间的新中间层）；`CanvasDoc`（v2）与 IR 互转；`IR → ProjectProposal` 编译器＝现 `canvasCompile` 的升级版 |
| 加法/major | **加法**（新模块 + 新校验器 `UNSUPPORTED_*` 诊断族；超集语义：cycle 存在且目标＝DAG runtime → `UNSUPPORTED_RUNTIME_CYCLE`，不静默 flatten） |
| 迁移风险 | 中低。风险点＝双编译路径漂移：以"IR→proposal 与 Doc→proposal 逐字节一致"为机器门；布局纯度断言（A09/A16）推广到 IR（semantic digest 布局不变） |
| 退出门 | ①IR↔Doc↔Proposal 三方 round-trip 等价；②每个 advisory kind 的编译行为有显式诊断断言；③术语隔离守门（IR JSON 人话面零 event_id）；④既有 273 测试原样绿 |

## 3. G4 — GraphPatch（AI 改图正式协议）

**目标**：Preset / 主代理自动架构 / 手搓编辑统一为 patch 生成器，杜绝"AI 直接换图"。

| 项 | 内容 |
|---|---|
| 形态 | `GraphPatch{ baseRevision, addNodes[], removeNodes[], updateNodes[], addEdges[], removeEdges[], updateEdges[], moveScope[] }`；三入口各自产出 patch：preset＝fragment→patch、auto architect＝LLM 输出 patch 候选（宿主侧生成，内核只校验）、manual＝doc diff→patch |
| 合同触点 | patch 应用走**既有**校验→diff 预览→declare 通道（18 号）；`/api/canvas/diff` 升级为 patch diff（+/-/~ 语义已有 UI 先例）；**零新事件类型**（声明仍落 PROJECT_REVISED） |
| 加法/major | **加法**（patch 是纯数据 + 纯函数 apply/validate；baseRevision 过期＝STALE 拒绝，复用 2.3 语义） |
| 迁移风险 | 中。风险点＝auto architect 输出不可信：patch 校验器必须 fail-closed（未知 id、悬空边、越权 scope 移动全拒）；主代理输出永不直接进 kernel（宿主中转校验） |
| 退出门 | ①三入口 → patch → apply → validate → declare 全链机器测试；②patch 应用确定性（同输入两次全等）；③malformed patch 全数拒绝的诊断表；④**顺手登记但不实现**：plan 新任务授权注册缺口（21 号 §7 冒烟实证——"声明即运行"最后一公里，宿主 `registerTask` 授权路径，独立小立项） |

## 4. G5 — Runtime Subgraph v1

**目标**：subflow 从 editorial（编译期展开）升级出 runtime 形态，旧行为原样保留。

| 项 | 内容 |
|---|---|
| 形态 | `Subgraph.mode = "editorial" | "runtime"`；v1 runtime 子图＝**runtime identity + input/output 边界 + 独立执行 scope** 三件（端口 policy/并发/retry/记忆后置）；runtime 子图编译不再 flatten，而是产出 scope 化任务组（阶段图/调度可见其边界） |
| 合同触点 | **major**：ProjectIR 任务需 scope 归属字段（TaskSpec 加法式可选 `scope_id`，SDS-4 例外纪律——缺省省略、digest 不变断言）；VIS 投影加 scope 分组（加法式节）；**阶段图/调度语义本阶段不动**（并发留给 G6） |
| 加法/major | **半 major**：事件零新类型，但投影与 IR 形状扩展；editorial 路径逐字节不变 |
| 迁移风险 | 高（本计划最大的语义跳变）：runtime 子图的 crash recovery/stale 语义必须先规格后代码；失败半途（子图部分完成）的状态归属要显式定义 |
| 退出门 | ①editorial 旧行为逐字节回归；②runtime 子图 attempt 的 lineage（子图 id ↔ attempt id）机器断言；③崩溃恢复场景（子图进行中重启）replay 通过；④UI 明示两种模式不混淆 |

## 5. G6 — Ready-Set Scheduler

**目标**：解除单 ACTIVE 锁存，fan_out/hierarchy/panel 预设获得真任务级并发；明确三种并行性（task/candidate/scope）不再混名。

| 项 | 内容 |
|---|---|
| 形态 | `decide()` 前置纯函数 `readySet(project state) → runnable[]`（依赖约束→角色槽→资源/并发上限→确定性排序）；每次 `decide()` 仍只提交**一个**事件（ready set ≠ 一次事务十个事件）；锁存语义改为策略而非硬编码（声明式阶段图扩展 concurrency 字段，缺省＝现行为） |
| 合同触点 | **major**：STAGE_GRAPH_DEFINED 载荷扩展（加法式可选 concurrency/policy 字段——需 schema bump + M6 + fixture v4 + ACC-02 全链）；调度事件（TASK_STARTED 等）本身零变化 |
| 加法/major | **major**（调度核心语义变更；replay fixture 再生属正式流程，禁止改旧 fixture 凑绿） |
| 迁移风险 | 高。风险点＝确定性与公平性的张力（排序规则必须全序且可复现）、crash/restart 一致性（ready set 重算幂等）、stale revision 处理（调度决策绑定 revision 已有，扩展到集合）；role slot 与 allocator（PLMP-ALC）交互需回归 ALC-A01–A11 |
| 退出门 | ①同一 ledger 状态两次 decide 全等（含并发候选）；②maxConcurrency=1 时行为与现调度逐字节一致（回归门）；③bounded 断言（激活数 ≤ 上限）；④暂停/恢复/崩溃三场景 replay；⑤预览面（preview）与 commit 逐字节一致（E1 纪律） |

## 6. G7 — Unified Runtime Graph（三投影一线）

**目标**：Definition/Runtime/Trace 共享 stable identity/lineage，一张图三种投影（愿景 §17/§28 的收口）。

| 项 | 内容 |
|---|---|
| 形态 | runtime 动态实体（Scout #17 等）先显示为 ephemeral node（`runtimeInstanceId/parentRuntimeId/origin/createdAt/status`，`definitionId?` 缺省）；`Promote to Definition` 走 GraphPatch + validate + declare（G4 通道），绝不直改 canonical；VIS 投影以 G2 id 串起 definition node ↔ runtime attempt ↔ trace spans |
| 合同触点 | 投影层加法（orchestrationGraph 扩展节）；ephemeral 节点**零新事件**（从既有 attempt/claim 事件派生）；若 attempt 增加 lineage 字段则为 SDS-4 加法式可选 |
| 加法/major | **加法**（身份串联，不改状态机） |
| 迁移风险 | 中。风险点＝ephemeral 节点滥用为第二真相：机器守门"ephemeral 只能由事件派生、无独立写路径"；术语隔离（人话标签）延伸到新投影 |
| 退出门 | ①同一 taskId 在三投影中 id/lineage 一致性断言；②ephemeral 派生纯函数确定性；③Promote-to-Definition 全程走 patch 通道的端到端测试；④VIS-A01–A07 原样绿 |

## 7. G8 — Debugger Controls

**目标**：IDE 式人工控制，每项独立定义安全语义（愿景 §21 七问逐项回答后再动工）。

| 项 | 内容 |
|---|---|
| 形态 | 分批小步：①breakpoint node/edge（调度 decide 前拦截——策略面，G6 后自然落点）→ ②retry/cancel activation（activation 级事件，进 ledger）→ ③fork run / replay from checkpoint（读侧派生 + 新 project 副本，绝不原地改史） |
| 合同触点 | 每个子项单独评估：是否改 canonical state／产生事件／revision-sensitive／需 evidence／需 host approval／crash-safe／触 Ordarium——七问全答才立项 |
| 加法/major | 逐子项判定；breakpoint 若实现为调度策略则加法，retry/cancel 是**新事件**（schema bump + fixture） |
| 迁移风险 | 高（直接写运行态）；禁令：不为 UI 好看加不可审计 mutation |
| 退出门 | 每子项：崩溃矩阵五点（durable 前/后、external 前/后、terminalize 前）测试 + Ordarium effect 语义回归 + 七问登记表 |

## 8. 推荐序列与节奏

```text
第 2 轮：G2 + G4 起步（正交、低风险、用户价值立现——rename 不断边 + AI 提案可视评审）
第 3 轮：G3（IR 收口，为 G5/G7 铺身份）
第 4 轮：G6（调度大项，独立规格 + fixture v4）
第 5 轮：G5 → G7（runtime 身份链收口）
第 6 轮：G8 分批（breakpoint 先行）
```

理由：G2/G4 纯客户端+提案面，为后续所有阶段提供 id 与 patch 基建；G6 与画布线正交可提前并行调研（调度策略纯函数可先行无合同原型）；G5 依赖 G3 的 IR 身份与 G6 的并发语义，放后风险最小。

## 9. 全程红线（继承 03/07/21/22 号）

事件 schema 变更三件套（bump+ACC-02+migration+fixture）缺一即缺陷；禁永久 shim（每阶段列 removal path）；禁 React Flow 类型进领域模型；禁 CanvasDoc 升格服务端真相；禁静默执行未声明循环语义；禁把 Tool/Human/Router 画出来即假装能跑；禁 LLM 进 kernel；禁 Ordarium 变调度器；deterministic/durable/evidence-governed 永远高于"漂亮画布"。
