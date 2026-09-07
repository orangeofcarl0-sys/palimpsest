# G9-C–G 实施计划（下一批次）

- 日期：2026-09-07
- 前置：G9-A（30 号，`b321d06`）、G9-B（31 号，`e81c4c3`）与 **G9-B2（31 号闭合修订，输入/新鲜度/治理闭合；母体＝`G9-B2-CLOSURE-ASSESSMENT.md`）** 退出门均已通过；测试基线 56 文件 / 337 项全绿。
- G9-B2 交付（2026-09-07）：`baseGraphDigest`/`STALE_GRAPH_BASE` 草稿新鲜度锚、`agentGraphSemanticDigest`、`parseProjectProposal` 输入合同（四 first-party 边界）、patch 语法同构 + `EMPTY_UPDATE`/`NO_OP_OPERATION` no-op 裁决 + accepted⇒digest 必变不变量、`runtime.controls.holds[]` 治理投影、LEGACY 方案 C（M8 回填、NULL=stale）、SCHEMA-AUDIT tripwire。
- 本文件只做计划与裁决预留，不实现。各批次开工时仍以"审计 → 规格冻结 → 实现 → 回归 → 登记"的纪律推进；规格编号从 32 起顺延（已核对 main 无冲突）。

---

## G9-C — Canvas 语义保全（规格 32，PLMP-CANVAS-7）

**问题**（审计 F-E）：patch apply 经 `unloadToCanvasDoc` 重建整 doc——未传 positions 时坐标全落确定性网格、`groups: []` 清空视觉分组。自由画布的组织成果被顺手清零。

**设计裁决（先冻结再实现）**：

1. 正式建立**语义图 + 画布表现元数据**的逻辑分离：语义（node id / edge id / scope / kind / payload）与视觉（x/y、group、collapsed、viewport、selection）分离——落点是在 serve patch 端点把"已有节点的表现元数据"从旧 doc 摘出、按 node id 回贴到 unload 结果上，而不是改 CanvasDoc 形状。
2. 已有节点：preserve position + preserve group 归属；新增节点：确定性网格摆位（现网格算法保留为唯一缺省）；删除节点：其表现元数据（含 group.members 中的 id）同步移除。
3. moveScope 的位置语义必须**二选一并测试**：保留绝对坐标（推荐——语义操作零坐标纪律下最不惊讶）或确定性相对变换；不许两个都做一半。
4. group 是纯视觉对象：GraphPatch 不编辑 groups；除"节点删除时从 members 移除该 id"外不得变化（不得被 patch 顺手清空）。
5. `lift∘unload` 语义等价断言扩展到表现层（compile 纯度 + 坐标保持 + group 保持三断言并存）。

**验收**：`CANVAS-H01`（unchanged 节点坐标逐字节保持）、`CANVAS-H02`（visual groups 保持；删节点只从 members 摘除）、moveScope 位置语义断言、端点级断言（patch 应用后 doc 携带原坐标/分组）。

---

## G9-D — 稳定边身份 / CanvasDoc v3（规格 33，PLMP-CANVAS-8）

**问题**（审计 F-F）：边身份在 IR↔Canvas 往返中丢失（`pe7 → dependsOn → e1`）；GraphPatch 已支持 `removeEdges/updateEdges(id)` 而 canvas 无从保边 id；G9-B 的表达门只能做语义投影等价（31 号登记差异）。

**设计裁决（开工前先审计再定）**：

1. CanvasDoc **v3 单格式**：`edges: CanvasEdge[] {id, source, target, kind}` 成为 authoring truth；`task.dependsOn` 退役为编译输出（或由解析器拒绝）——**禁止两套边真相**（G2 v1→v2 同款纪律：响亮拒绝 v2 文档、无自动升级 shim、无双解析）。
2. v2→v3 迁移策略两案审计后裁决：一次性显式 converter（面板导入/localStorage 恢复路径）vs 直接拒绝（重画成本极低，画布本就是草稿）。裁决与理由必须登记于 33 号修订流水。
3. 短期只允许 `kind = "data"`（画布表达边界不变，31 号门继续有效）；id 稳定 ⇒ `lift(unload(g)) === g` 严格全等（含边 id）达成，G9-B 表达门升级为全等断言。
4. `patchFromFragment`/`canvasInsertFragment` 的边 id 生成纪律（去重扫描）随 v3 收敛到 doc 层。

**验收**：`EDGE-H01`（Canvas → IR → Canvas → IR 往返边 id 逐字节稳定）、PATCH removeEdges/updateEdges(id) 在画布路径端到端可用、31 号门的 UNREPRESENTABLE 语义不变。

---

## G9-E — 可执行架构预设（规格 34，PLMP-ARCH-4）

**问题**（审计 F-G）：preset 只产 ProjectProposal；GUI declare 缺省不传 stageGraph ⇒ `fan_out` 名义并发实为 ACTIVE concurrency=1 串行。拓扑像什么 ≠ 跑成什么。

**设计裁决**：

1. 正式区分 **Topology Preset** 与 **Executable Architecture Preset**；preset 返回 `ArchitectureBundle { proposal, executionPolicy?, stageGraph?, roleTable? }`（名称可再议，核心是"架构＝拓扑 + 执行治理"）。
2. 六 preset 逐个审计并钉死缺省执行语义（§9.3）：`pipeline`＝concurrency 1（合理）；`fan_out`＝任务级并发 >1（或 UI 明示 Topology only，不许模糊）；`hierarchy`＝research 兄弟并行 + 写作/编辑串行；`panel`＝**必须明确"并行任务"还是"单任务 + 候选 attempt"并测试加文档**（二者语义不同）；`verified_dag`＝按依赖就绪集自动并发；`research_loop`＝修订循环语义、不是 runtime 图环。
3. GUI declare 面随 Bundle 传递 stageGraph（`{proposal, stageGraph?}` 已是单形状通道，G6 已备）；缺省不传＝Topology only 且 UI 明示。

**验收**：`ARCH-H01`（fan_out 缺省可执行架构下两任务同时 ACTIVE）、`ARCH-H02`（pipeline 保持并发 1）、`ARCH-H03`（panel 的并行语义有测试有文档）；其余 preset 语义断言随规格冻结。

---

## G9-F — Parser 纪律 + 运行时性能（规格 35，PLMP-PARSE-1）

**问题**（审计 F-H①②③，已核验；scope 依 G9-B2 SCHEMA-AUDIT 矩阵重定）：

1. `parseStageGraphDefinition` 三层（根/stage/transition）都无未知字段白名单：`"concurency":8` 静默当缺省 1（PARSE-H01；tripwire 在册）。
2. canvas `parseTaskPayload` 不拒未知字段：`{"rol":"scout"}` 静默丢弃——与 ir.ts 同名 parser（有白名单）不一致（PARSE-H02）。统一规则：**author-authored JSON 永不静默丢字段**。
3. **models.ts 全族 13 个 canonical parser（parseProjectIr/parseTaskSpec/parseTaskEnvelope/parseAttemptReport/parseEvidenceAtom/parseNewEvent 等）"必填严/未知字段容"**——G9-B2 审计证实与文件头 fail-closed 声称不符，是最大缺口。涉及冻结 wire 合同/历史 fixture/前向兼容，必须逐合同独立裁决（白名单化或显式登记容留），严禁 `requireFields` 全局一刀切。
4. `/api/graph?cursor` 无快路径：未变化也全量 `buildOrchestrationGraph()`（WEB-H01）。`SELECT MAX(event_id)` 廉价先行，`cursor == currentCursor` 直接 `{changed:false, cursor}`；不引入 WebSocket/SSE。

**验收**：PARSE-H01/H02 + WEB-H01（未变 cursor 请求不建全图，可观测计数器断言）。

---

## G9-G — 浏览器 E2E（规格 36，PLMP-WEB-E2E-1）

**问题**：GUI 复杂度已超人工冒烟可靠覆盖面（G2–G8 每轮冒烟都抓到过真实缺陷：Handles、rename 断边、布局断链、drop 环守卫）。

**设计裁决**：引入 Playwright（或等价成熟框架）；覆盖清单按母体指令 §13：Canvas（加节点/连线/改名/删除/嵌套/三层/折叠展开/拖入拖出/分组/布局/导入导出）、GraphPatch（preview/apply/invalid/stale/坐标保持/分组保持/unsupported 拒绝）、Runtime（run/pause/resume/hold/release/卫星/trace）、Ready-Set（UI 驱动 concurrency=2 双任务同时 ACTIVE）。E2E 进 CI 纪律（headless、固定端口段、serve 生命周期托管）随规格冻结。

**验收**：`E2E-H01`（nested Canvas + patch + run + hold 全路径）及上列各面用例。

---

## P2 研究注记（本轮只记录，不立项）

1. **Runtime Subgraph 下一步（母体 §14）**：v1 实际是"runtime-addressable scope"，不是完整子运行时。未来独立规格讨论：scope concurrency / scope retry / scope local memory / scope lifecycle / scope input-output ports / scope-level observability。当前 UI 措辞不得过度承诺（G9-C 改面板时顺带核对）。
2. **Agent 与 Task 概念分离（母体 §15）**：现有 `kind:"agent"` 实为 task-bearing node。长远 Multi-Agent IDE 需要 `AgentDefinition`（model/role/instructions/tools/memory/policy）与 `TaskDefinition`（objective/dependencies/assignment policy）/`Attempt` 三层。definition_id（30 号）已为该拆分预留身份锚点；本轮不侵入核心 schema，仅作 research/design note。

## 明确非目标（不变，母体 §16）

Tool/Router/Memory/Human 运行时语义、消息总线、任意环调度、边断点、force route、fork、time-travel、手工 force retry、消息注入、分布式调度、多主机共识——全部建立在 G9 闭合之后。
