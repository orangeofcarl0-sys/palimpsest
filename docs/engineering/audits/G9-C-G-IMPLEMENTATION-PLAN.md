# G9-C–G 实施计划（下一批次）

- 日期：2026-09-07
- 前置：G9-A（30 号，`b321d06`）、G9-B（31 号，`e81c4c3`）、G9-B2（31 号闭合修订，`1a8d688`）与 **G9-B3（31 号跨层闭合修订；母体＝`G9-B3-CROSS-LAYER-ASSESSMENT.md`、交付报告＝`G9-B3-DELIVERY-REPORT.md`）** 退出门均已通过；测试基线 57 文件 / 354 项全绿。
- **架构 rebase（2026-09-09，Universal Agent Semantics）**：PLMP-UAS-0 宪章与 `G10-G11-ROADMAP.md` 已冻结。剩余顺序重排为 **D(余)→C→F→G → G10-A0 → G10-A**；**旧 G9-E（Executable ArchitectureBundle）SUPERSEDED——不再按原样实现**（其"架构声明必须包含执行治理"的洞见移入 G10-A 验收：执行治理随 AgentSystemDefinition 声明；其旧载体把 Architecture 继续绑死在 Project 拓扑，违 UA-INV-2）。规格 34 释放给 G10-A。
- **当前活跃序列（2026-09-08 更新，唯一有效顺序）**：

```text
G9-D ✅ COMPLETE（规格 32，会话 1+2，2026-09-08）
  ↓
G9-C ✅ COMPLETE（规格 33，PLMP-CANVAS-8，2026-09-08）
  ↓
G9-F ✅ COMPLETE（规格 35，PLMP-PARSE-1，2026-09-10）
  ↓
G9-F2 ✅ COMPLETE（35 号 Closure Addendum，残差闭合，2026-09-10）
  ↓
G9-G（36 号）Playwright E2E    ← 当前位置
  ↓
G10-A0（纯文档预检，见 G10-G11-ROADMAP）→ G10-A（34 号）
```

- **批次顺序更新（G9-B3 §27 裁决；历史记录，E 位已 superseded）**：B3→**D→C**→E→F→G——G9-B2 的语义新鲜度 digest 包含 edge id，而 CanvasDoc v2 在 IR↔Canvas 往返中再生边 id（G9-B3 只做了响应完整性 bridge hotfix），因此 **G9-D（CanvasDoc v3 / 稳定边身份）从"功能增强"升级为新鲜度正确性依赖**，排在 G9-C（表现保全）之前。（历史含 E 位的表述以此处存档为准，活跃序列见上。）
- **G9-E 新增设计前置（G9-B3 §18/§19）**：ArchitectureRevision 必须是**原子治理动作**——`plan(topology)` + `declareStageGraph` + `declareRoleTable` 三次独立 durable append 之间存在崩溃窗口，会产生"新拓扑 + 旧执行治理"的半个修订。G9-E 开工前必须比较至少三案（A 单一复合事件 ARCHITECTURE_REVISED / B pending→activate 协议 / C EventStore 原子事件批）并裁决；本轮不实现 multi-event transaction（触及事件序/哈希链/幂等/游标/fault injection/replay，需独立设计）。
- **编号与顺序纠偏（G9-D §42，2026-09-08；历史记录）**：当时执行顺序 D→C→E→F→G 对应规格 **32＝G9-D（PLMP-CANVAS-7）**、**33＝G9-C（PLMP-CANVAS-8）**、34＝G9-E、35＝G9-F、36＝G9-G；原计划的 32＝C/33＝D 编号错位已在交付时纠正，无冲突覆盖（交付时 32 空闲）。E 位后经 UAS rebase SUPERSEDED（活跃序列见顶部）。
- G9-B2 交付（2026-09-07）：`baseGraphDigest`/`STALE_GRAPH_BASE` 草稿新鲜度锚、`agentGraphSemanticDigest`、`parseProjectProposal` 输入合同（四 first-party 边界）、patch 语法同构 + `EMPTY_UPDATE`/`NO_OP_OPERATION` no-op 裁决 + accepted⇒digest 必变不变量、`runtime.controls.holds[]` 治理投影、LEGACY 方案 C（M8 回填、NULL=stale）、SCHEMA-AUDIT tripwire。
- 本文件只做计划与裁决预留，不实现。各批次开工时仍以"审计 → 规格冻结 → 实现 → 回归 → 登记"的纪律推进；规格编号从 32 起顺延（已核对 main 无冲突）。

---

## G9-C — Canvas 语义保全（规格 33，PLMP-CANVAS-8）✅ **COMPLETE（2026-09-08；交付报告＝`G9-C-PRESENTATION-PRESERVATION-DELIVERY.md` 十八问）**

**问题**（审计 F-E）：patch apply 经 `unloadToCanvasDoc` 重建整 doc——未传 positions 时坐标全落确定性网格、`groups: []` 清空视觉分组。自由画布的组织成果被顺手清零。

**已交付（超出原计划留白处均已按 33 号规格冻结后落地）**：`src/canvas/presentation.ts` `reconcileCanvasPresentation(before, semanticResult)`（Option B 显式合并原语；所有权表：semanticResult 独占语义+identity，before 仅贡献存活 x/y+groups）＋ serve patch 端点委托；PRES-INV-1..6（存活不动/组逐字存活/删员仅清 members/新节点确定性避让/identity 不回卷/lift 严格相等＝digest 表现无关）；moveScope 绝对坐标冻结；新节点避让分配器（190×56+24 行优先网格＋owner 种子）；空组/嵌套组保留；验收 CANVAS-H01..H10＋PATCH-PRES-A01..A04（PRES-ID-A01）＋浏览器冒烟 12 步；测试基线 58/384 → **58/398**。

**设计裁决（先冻结再实现）**：

1. 正式建立**语义图 + 画布表现元数据**的逻辑分离：语义（node id / edge id / scope / kind / payload）与视觉（x/y、group、collapsed、viewport、selection）分离——落点是在 serve patch 端点把"已有节点的表现元数据"从旧 doc 摘出、按 node id 回贴到 unload 结果上，而不是改 CanvasDoc 形状。
2. 已有节点：preserve position + preserve group 归属；新增节点：确定性网格摆位（现网格算法保留为唯一缺省）；删除节点：其表现元数据（含 group.members 中的 id）同步移除。
3. moveScope 的位置语义必须**二选一并测试**：保留绝对坐标（推荐——语义操作零坐标纪律下最不惊讶）或确定性相对变换；不许两个都做一半。
4. group 是纯视觉对象：GraphPatch 不编辑 groups；除"节点删除时从 members 移除该 id"外不得变化（不得被 patch 顺手清空）。
5. `lift∘unload` 语义等价断言扩展到表现层（compile 纯度 + 坐标保持 + group 保持三断言并存）。

**验收**：`CANVAS-H01`（unchanged 节点坐标逐字节保持）、`CANVAS-H02`（visual groups 保持；删节点只从 members 摘除）、moveScope 位置语义断言、端点级断言（patch 应用后 doc 携带原坐标/分组）。

---

## G9-D — CanvasDoc v3 / 稳定图身份生命周期（规格 32，PLMP-CANVAS-7）✅ **COMPLETE——会话 2（D6–D10）已交付（2026-09-08）**

**问题**（审计 F-F）：边身份在 IR↔Canvas 往返中丢失（`pe7 → dependsOn → e1`）；GraphPatch 已支持 `removeEdges/updateEdges(id)` 而 canvas 无从保边 id；G9-B 的表达门只能做语义投影等价（31 号登记差异）。

**优先级升级（G9-B3 §27）**：本批次从"未来功能增强"升级为**新鲜度正确性依赖**——语义 digest 含边 id 而 v2 往返再生边 id；排在 G9-C 之前。

**已交付（会话 1＝D0–D5，规格 32；母体＝`G9-D-STABLE-GRAPH-IDENTITY-ASSESSMENT.md`）**：正式名称与范围升级为 Stable Graph Identity＝Node Identity + Edge Identity + Identity Lifecycle + Mutation Integrity；v3 单格式（edges[] 唯一边真相 + identity 单调家族）、显式 converter（节点 key 逐字保留红线）、IDENTITY_REUSE、kind 变更方案 B、UNSUPPORTED_PARALLEL_DATA_EDGE、B3 relift bridge 退役、lift∘unload 严格全等、web 镜像 v3；测试基线 57/354 → 58/370。

**已交付（会话 2＝D6–D10；交付报告＝`G9-D-SESSION-2-DELIVERY.md` 十六问）**：中心化 mutation 层 `src/canvas/mutate.ts`（MUT-INV-1 唯一入口＋web 全量镜像 `canvasMutate.ts`，结构变更零内联完整性逻辑）、identity-aware diff（definitionId 优先、title fallback 不串认领、changedFields 覆盖 §12 可代表字段含 suggestedSkills；gate 保持建议性不可 diff）、`/api/canvas/anchor`（单次观察、永不编译、FULL/PARTIAL/UNANCHORED）、EMPTY_GOAL 收敛修复（账本毒化实证）、浏览器冒烟 6 场景全过、UAS-D-INV-1..6 语义解释红线登记（Work 手搓文档澄清）、测试基线 58/370 → **58/384**。**下一批次＝G9-C（33 号）。**

**设计裁决（开工前先审计再定）**：

1. CanvasDoc **v3 单格式**：`edges: CanvasEdge[] {id, source, target, kind}` 成为 authoring truth；`task.dependsOn` 退役为编译输出（或由解析器拒绝）——**禁止两套边真相**（G2 v1→v2 同款纪律：响亮拒绝 v2 文档、无自动升级 shim、无双解析）。
2. ~~v2→v3 迁移策略两案审计后裁决~~ **已裁决（32 号 §2.5）**：显式 converter `upgradeCanvasV2ToV3`（唯一 v2 入口、非 dual parse、节点 key 逐字保留——v2 已可能对应 canonical definition_id，拒绝重画会丢 lineage）。
3. 短期只允许 `kind = "data"`（画布表达边界不变，31 号门继续有效）；id 稳定 ⇒ `lift(unload(g)) === g` 严格全等（含边 id）达成，G9-B 表达门升级为全等断言。
4. `patchFromFragment`/`canvasInsertFragment` 的边 id 生成纪律（去重扫描）随 v3 收敛到 doc 层。

**验收**：`EDGE-H01`（Canvas → IR → Canvas → IR 往返边 id 逐字节稳定）、PATCH removeEdges/updateEdges(id) 在画布路径端到端可用、31 号门的 UNREPRESENTABLE 语义不变。

---

## G9-E — ~~可执行架构预设~~ **SUPERSEDED（2026-09-09，不按原样实现）**

> **裁定**：旧 G9-E 假设 Architecture ≈ ProjectProposal + StageGraph + RoleTable，仍把架构绑死在任务/项目编排上，与 PLMP-UAS-0 **UA-INV-2（Architecture ≠ Work）** 冲突。**保留的洞见**：架构声明必须包含执行治理——移入 **G10-A**（AgentSystemDefinition 携带 Orchestration/Governance Policies；fan_out 缺省并发随架构声明）。实现载体与批次细节见 `audits/G10-G11-ROADMAP.md`；规格编号 34 释放给 G10-A。以下原计划存档：

### （存档）可执行架构预设（原规格 34，PLMP-ARCH-4）

**问题**（审计 F-G）：preset 只产 ProjectProposal；GUI declare 缺省不传 stageGraph ⇒ `fan_out` 名义并发实为 ACTIVE concurrency=1 串行。拓扑像什么 ≠ 跑成什么。

**设计裁决**：

1. 正式区分 **Topology Preset** 与 **Executable Architecture Preset**；preset 返回 `ArchitectureBundle { proposal, executionPolicy?, stageGraph?, roleTable? }`（名称可再议，核心是"架构＝拓扑 + 执行治理"）。
2. 六 preset 逐个审计并钉死缺省执行语义（§9.3）：`pipeline`＝concurrency 1（合理）；`fan_out`＝任务级并发 >1（或 UI 明示 Topology only，不许模糊）；`hierarchy`＝research 兄弟并行 + 写作/编辑串行；`panel`＝**必须明确"并行任务"还是"单任务 + 候选 attempt"并测试加文档**（二者语义不同）；`verified_dag`＝按依赖就绪集自动并发；`research_loop`＝修订循环语义、不是 runtime 图环。
3. GUI declare 面随 Bundle 传递 stageGraph（`{proposal, stageGraph?}` 已是单形状通道，G6 已备）；缺省不传＝Topology only 且 UI 明示。

**验收**：`ARCH-H01`（fan_out 缺省可执行架构下两任务同时 ACTIVE）、`ARCH-H02`（pipeline 保持并发 1）、`ARCH-H03`（panel 的并行语义有测试有文档）；其余 preset 语义断言随规格冻结。

---

## G9-F — Contract Discipline + View Freshness（规格 35，PLMP-PARSE-1）✅ **COMPLETE（2026-09-10；交付报告＝`G9-F-CONTRACT-VIEW-FRESHNESS-DELIVERY.md` 二十问；母体审计先行＝`G9-F-CONTRACT-VIEW-FRESHNESS-ASSESSMENT.md`）**

**原计划问题的最终核验**（机器探针，本批交付时逐条对账）：

1. `parseStageGraphDefinition` 三层（根/stage/transition）无未知键白名单——**已复现并修复**（PARSE-H01；含守卫信封）。
2. ~~canvas `parseTaskPayload` 不拒未知字段~~——**ALREADY CLOSED**（G9-D 会话 1 allowlist；探针实证后从活跃计划移除）。统一规则冻结：**author-authored JSON 永不静默丢字段**（PARSE-INV-1，扩及 GateDefinition/GateClause 信封与 preset 参数）。
3. models.ts 全族 canonical parser "必填严/未知字段容"——**已按 35 号逐合同显式闭合**（`rejectUnknownFields` 逐 parser/逐事件 case；三处显式开放映射登记例外；历史门两处调用点/声明集修正后 parity/replay 全绿；SCHEMA-AUDIT tripwire 反转钉住新态）。
4. ~~`/api/graph` 快路径按 `MAX(event_id)` 直接判~~——**审计否决该设计**（attribution 是图可见进程易变态且 `evaluateAttemptGate` 结算零事件追加；重启更使事件游标恒等失效）：改为 **EventCursor ≠ ViewCursor**（`v1:epoch:eventCursor:viewGeneration`，安全未变路径不建图，旧 `?cursor=` 保守兼容）＋ health 空态修复（ServiceHealth ≠ ProjectInitialized）。

**已交付**：验收＝PARSE-H01-A..D＋矩阵抽查＋WEB-H01-A..E（建图计数器断言）＋WEB-HEALTH-A01＋PRES-BELT ×2；测试基线 58/398 → **58/409**；浏览器冒烟 A/B/D 过（C 由 WEB-H01-C 覆盖）。**下一批＝G9-F2（后并入完成，见下）。**

---

## G9-F2 — 残差不变量闭合（规格 35 Closure Addendum，PLMP-PARSE-1）✅ **COMPLETE（2026-09-10；交付报告＝`G9-F2-RESIDUAL-INVARIANT-DELIVERY.md` 二十问；母体审计＝`G9-F2-RESIDUAL-INVARIANT-ASSESSMENT.md`，8/8 机器探针先行）**

**已交付**：VIEW-INV-5（attribution 归一化快照＋`parseAttemptAttribution`，claim 先校验后副作用）、epoch 升完整 128 位 UUID＋"密码学可忽略"诚实措辞、VIEW-INV-6（viewCursor 裁决支配 legacy cursor）、HEALTH-INV-2（health/declare 按项目隔离）、PARSE-INV-4（exists/count 内层闭包＋not 递归、where 保持开放）、WIRE-INV-3（GATE_DEFINED canonical 面 `parseCanonicalGateDefinition`＋STAGE_GRAPH_DEFINED 全语法在共享 durable 接缝提交前校验，拒绝零残写）、WIRE-INV-4（CANDIDATE_SELECTED 必填布尔精确解析）。验收电池：VIEW-RES-A01..A04＋VIEW-RES-C01＋HEALTH-RES-A01..A03＋PARSE-RES-A01..A05＋DURABLE-PARSE-A01..A05＋CANON-RES-A01..A05；测试基线 58/409 → **59/431**；kernel/web tsc、vite build 全绿；浏览器冒烟 A/B/D 过（C 由 HEALTH-RES-A02 HTTP 面覆盖）。**下一批＝G9-G。**

---

## G9-G — 浏览器 E2E（规格 36，PLMP-WEB-E2E-1）

**问题**：GUI 复杂度已超人工冒烟可靠覆盖面（G2–G8 每轮冒烟都抓到过真实缺陷：Handles、rename 断边、布局断链、drop 环守卫）。

**设计裁决**：引入 Playwright（或等价成熟框架）；覆盖清单按母体指令 §13：Canvas（加节点/连线/改名/删除/嵌套/三层/折叠展开/拖入拖出/分组/布局/导入导出）、GraphPatch（preview/apply/invalid/stale/坐标保持/分组保持/unsupported 拒绝）、Runtime（run/pause/resume/hold/release/卫星/trace）、Ready-Set（UI 驱动 concurrency=2 双任务同时 ACTIVE）。E2E 进 CI 纪律（headless、固定端口段、serve 生命周期托管）随规格冻结。**G9-F2 补记（§34）**：混合游标裁决、畸形 attribution HTTP 400、健康项目隔离已由 F2 内核电池钉死——E2E 只测用户可见行为（轮询稳定/暂停恢复/面板渲染），不重复低层不变量（§40）。

**验收**：`E2E-H01`（nested Canvas + patch + run + hold 全路径）及上列各面用例。

---

## P2 研究注记（本轮只记录，不立项）

1. **Runtime Subgraph 下一步（母体 §14）**：v1 实际是"runtime-addressable scope"，不是完整子运行时。未来独立规格讨论：scope concurrency / scope retry / scope local memory / scope lifecycle / scope input-output ports / scope-level observability。当前 UI 措辞不得过度承诺（G9-C 改面板时顺带核对）。
2. **Agent 与 Task 概念分离（母体 §15）**：现有 `kind:"agent"` 实为 task-bearing node。长远 Multi-Agent IDE 需要 `AgentDefinition`（model/role/instructions/tools/memory/policy）与 `TaskDefinition`（objective/dependencies/assignment policy）/`Attempt` 三层。definition_id（30 号）已为该拆分预留身份锚点；本轮不侵入核心 schema，仅作 research/design note。

## 明确非目标（不变，母体 §16）

Tool/Router/Memory/Human 运行时语义、消息总线、任意环调度、边断点、force route、fork、time-travel、手工 force retry、消息注入、分布式调度、多主机共识——全部建立在 G9 闭合之后。
