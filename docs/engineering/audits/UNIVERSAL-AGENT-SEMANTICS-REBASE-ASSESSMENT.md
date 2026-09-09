# Universal Agent Semantics Rebase 只读审计

- 日期：2026-09-09
- 审计基线：`main` = `350fc01`（G9-D 会话 1 已交付；指令给出的 e4f5fa6 基线已过时，以实际 main 为准），测试基线 58 文件 / 370 项全绿
- 理论输入：两份冻结理论规格**已在仓库内**（docs/ 根，首轮检索遗漏、经用户指正后读取）：
  - `docs/AgentGroup_Theory_v0_Literature_Aligned_Frozen_Spec.md`（**PLMP-AGT-0**，2980 行）：五对象（`Organization ≠ Holon ≠ RuntimeScope ≠ Coalition ≠ VisualGroup`）、四独立关系（organizational membership 可重叠 / execution ownership 层叠森林 / coalition participation 时间性 / visual membership）＋冻结规则"内核不得用单字段 groupId 无区别承载四关系"、形式化群对象 `G=(A,R,C,ρ,κ,F,N,Γ,∂,Π,X,S)`、四层语义栈（O/C/B/T）、变换演算（T0 观测重构/T1 精化/T2 行为变更＋contract breaking）、§35 与现 Palimpsest 映射（AgentGraph=Γ＋结构语法而非完整 Organization；RuntimeSubgraph v1＝runtime-addressable scope 而非完整 RuntimeScope/Holon；GraphPatch＝GroupTransform 先导但不得塞入全部群语义）、§36 未来 schema 分离（OrganizationDefinition/HolonDefinition/RuntimeScopeDefinition/CoalitionInstance/VisualGroup，禁止 polymorphic Group JSON）。
  - `docs/PLMP-PAG-0_Persistent_Agents_Campaigns_Durable_Institutions_v0.1.md`（**PLMP-PAG-0**，3188 行）：与 AGT-0 正交（§0.1）；`AgentEntity ≠ Activation ≠ Intervention`、dormant≠dead、wake≠replay、长期尝试＝epistemic intervention、战略 WAIT、`Campaign ≠ Project`（Project＝Campaign 经 CampaignCompiler 的可弃可重编译执行投影，Palimpsest＝short-horizon execution engine）、`Evidence History ≠ Current Belief State`、operational≠epistemic outcome、四张长程图 `G_prov/G_evid/G_epi/G_intent` 禁止无类型揉合、五平面（Identity/Intentional/Epistemic/Execution/Governance）＋平面分离不变量（reasoner output≠canonical epistemic state——与本库既有红线同构）、热/温/冷状态、Epoch 链、watcher/commitment、DurableHolon/DurableInstitution。
- 方法：只读审计 + 文档冻结；代码改动仅限 §31 允许的小接缝（见 §6）

---

## A. Agent 与 Task 的混淆点（逐字段追踪）

追踪链：`Canvas node → AgentGraph agent node → TaskProposal → TaskSpec → ProjectIR → runtime task`

### A.1 每一层的字段归属表

| 层 | 代码位置 | 字段 | 语义归属 |
|---|---|---|---|
| Canvas task 节点 | `src/canvas/doc.ts` CanvasNode/CanvasTaskPayload | key/type/title/x/y/z/mode | key=定义身份（G9-D）、z=组织归属、x/y/g=纯视觉 |
| | | task.writePaths / requiredArtifacts / gateId / role / suggestedSkills | **全是 Task 语义**（除 role 是赋派策略提示）——被错放在"agent"节点上 |
| AgentGraph agent 节点 | `src/graph/ir.ts:76-87` | id/kind:"agent"/label/scope/mode? | id=定义身份、scope=组织归属 |
| | | `task?: AgentTaskPayload`（writePaths/requiredArtifacts/gateId/role/suggestedSkills） | **节点名叫 agent，载荷全是 task**；AgentDefinition 的概念字段（instructions/modelPolicy/capabilities/tools/memoryBindings/contextPolicy）在 IR 中**零存在** |
| TaskProposal | `src/architecture/proposal.ts` | title/dependsOn/writePaths/requiredArtifacts/gateId/role/suggestedSkills/**definitionId**/scopeId | 唯一的 agent 侧字段是 `definitionId`（G9-A 血统锚）与 `scopeId`（G5 组织）；其余 task 语义 |
| TaskSpec | `src/schema/models.ts:241-300` | task_id/objective/depends_on/write_paths/required_artifacts/role/suggested_skills/scope_id/**definition_id** | 同上；task_id=运行时实体 id（≠definition_id 已分离），objective=任务目标 |
| ProjectIR | `src/schema/models.ts` buildProjectIr | goal/requirements/decisions/tasks/head_commit | **Architecture = ProjectIR**：没有独立的"系统定义"实体 |
| runtime task | `src/tools/graph.ts:33` GraphTask | taskId/objective/state/role/dependsOn/writePaths/requiredArtifacts/scopeId/definitionId/held/attempts | activation=task 上的 attempt；**没有 AgentActivation 概念**，没有动态 worker 实例（动态 spawn 不存在） |

### A.2 混淆的具体机制

1. **命名即混淆**：`AgentGraphNode.kind === "agent"` 的节点必须携带 `task`（`ir.ts:179` `agent node "${id}" needs node.task`）——一个 agent 定义**不存在**没有任务的形态。独 agent（§35 案例 A）今天无法表达。
2. **label 三重职责**：`compileAgentGraph`（`ir.ts:422-439`）把 `node.label` 同时用作 ①任务 objective/title ②提案依赖词汇（`duplicate agent label` 检查，`ir.ts:396-400`——title 是依赖命名空间的历史残留）③展示名。改名语义在 23 号（key 依赖）已修复，但 title 作为依赖词汇的耦合仍在（DIFF 升级见 G9-D 遗留 D7）。
3. **赋派只是字符串**：`role` 是唯一接近 AgentDefinition 的字段，但它 ①取值来自 genesis 角色表（PRE-A07）②只影响并发容量（`scheduler.ts:281-283` role slots）③不携带任何能力/模型/指令语义。`suggestedSkills` 是给 worker 的提示，不是 agent 能力声明。
4. **授权是项目级而非 agent 级**：`policy.authorize(project, task_id)`（`controller.ts:451`）用同一份 TaskPolicy（read_paths/allowed_commands/network）授权所有任务——所有"agent"共享一个执行安全边界，无法表达"工具 A 只给调研 agent"。
5. **无 Agent 激活实例**：attempt 是 task 的尝试，不是 agent 的激活；同一 task 的多次 attempt 复用同一（不存在的）agent 定义；动态 spawn（CAMEL worker）整个概念缺失。

## B. Architecture 与 Project 拓扑的混淆点

1. **Architecture 的全部载体就是 ProjectProposal**：六个 preset 的产物（`presets.ts:114-236`）、canvas 编译产物（`canvasCompile`→ProjectProposal）、declare 入参（`/api/proposal/declare {proposal, stageGraph?}`）——"架构"没有一个独立于某次 work 的实体。
2. **执行治理是 declare 时的可选挂件**：`StartProjectInput.stageGraph ?? DEFAULT_STAGE_GRAPH`（`controller.ts:419`）＋ genesis `declareRoleTable(DEFAULT_ROLE_SLOTS)`（`controller.ts:440-446`）＋独立 `declareRoleTable/declareStageGraph` 面（`controller.ts:341/379`）。stageGraph/roleTable 是 Project 的执行治理，不是 Architecture 的一部分——同一架构换一个 project 要重新声明（§35 案例 K 直接失败：架构不可复用于 100 个无关任务）。
3. **架构修订=计划修订**：`plan()`（`controller.ts:532-616`）产出 PROJECT_REVISED＝新 ProjectIR。改拓扑和改任务列表走同一条修订路，没有"架构未变、任务变了"的表达；typed invalidation（`#applyTypedInvalidation`）按 task 粒度失效，无法按架构单元失效。
4. **持久性维度不存在**：PAUSED/hold 是运行闸门；没有 session/持久 agent/campaign 概念（PAG-0 的四层连续性:ephemeral/session/persistent/campaign 全部缺失，只有 ephemeral 一种隐含形态）。
5. **presets 的 lineage 字段是仅有的"语义声明"**：`presets.ts:21-28` 用自由文本声明"拓扑 essence, not a clone"——方向正确但无机器可查的 fidelity/一致性责任。

## C. 现有原语的普适Runtime可用性矩阵

节点 kind（`ir.ts:20-30`，IR parse 全支持＝parseAgentGraphNode 接受全部九种）：

| kind | IR parse | Canvas 支持 | runtime 语义 | trace 语义 | governance |
|---|---|---|---|---|---|
| agent | ✅ | ✅（type:"task"） | ✅（唯一可执行：task/attempt） | ✅（GraphTask/attempts） | ✅（policy 授权、gate、hold） |
| subgraph | ✅ | ✅（type:"subflow"+mode:runtime） | ✅ 部分（G5 scopeId 归属/容量视图；无 scope 级调度） | ✅（scopeId 下发） | 部分（hold 是 task 级） |
| annotation | ✅ | ✅ | ❌（编译剔除） | ❌ | ❌ |
| gate | ✅ | ❌（canvas 语法只有 task/subflow/annotation，32 号 §2.3） | ❌（UNSUPPORTED_NODE_KIND） | ❌ | 间接（GATE_DEFINED+gate DSL 是**阶段转换守卫**，不是节点） |
| tool | ✅ | ❌ | ❌ | ❌ | ❌（31 号应用门拒其入 canvas） |
| router | ✅ | ❌ | ❌ | ❌ | ❌ |
| memory | ✅ | ❌ | ❌ | ❌ | ❌（context/ 目录是编译期装配，不是 memory 节点语义） |
| human | ✅ | ❌ | ❌ | ❌ | ❌ |
| artifact | ✅ | ❌ | ❌ | ❌ | 间接（requiredArtifacts 字段是 task 语义） |

边 kind（`ir.ts:43-53`，IR parse 九种全支持）：

| kind | IR parse | Canvas 支持 | runtime 语义 | trace/governance |
|---|---|---|---|---|
| data | ✅ | ✅（v3 唯一 kind） | ✅（DAG 依赖，RUNTIME_CYCLE/PARALLEL 拒环） | definitionId 血统 |
| control/message/handoff/delegation/evidence/validation/aggregation/retry | ✅ | ❌ | ❌（UNSUPPORTED_EDGE_KIND；capability 门拒） | ❌ |

**结论**：IR 已经是"渲染器无关、运行时无关"的 9×9 语法骨架（24 号设计决策的正确遗产）；缺的是**语义执行层**——九分之八的节点 kind 和九分之八的边 kind 是"可画不可跑"的占位（capability 门诚实拒绝，G3 决策）。这正是不需要推倒重写的原因：扩展点已经在语法里预留。

**已可复用的强资产**（普适 runtime 的地基，全部保留）：
- 事件账本 + 纯 `decide()`（`scheduler.ts:170-291`）＋幂等键＋确定性 actionKey——任何 orchestration policy 都需要的骨架；
- **声明式 stage graph + 声明式守卫**（H1 D-3）：`decide` 走 declared transitions/guards（`#declaredTransition/#guardsPass`）——"图决定哪条转换触发"已是策略化雏形，缺的只是把 stage 词表本身（BLOCKED/READY/ACTIVE/VERIFYING）也变成可替换策略；
- 声明式角色表容量门（`#activationCapacity`）＋PAUSED/hold 双层中断；
- attempt 生命周期 + PROMOTION_COMMITTED 证据驱动 SATISFIED（`#advanceVerifyingStage`）——"证据治理"是普适资产；
- Context Compiler（`src/context/`：compressor/manifest/distribution/requirement）——per-claim 结构化上下文装配（C2/17 号），§10"接收方看到什么"的雏形已存在，缺的是把"装配策略"从 claim 时一个调用变成架构上的显式语义轴。

## D. 调度器中硬编码的语义（分类）

**普适 runtime 原语**（应保留为 kernel）：
- 单决策单事件、纯 decide、幂等、账本投影重建（crash-safe）；
- PAUSED（全项目）/ hold（单实体）中断分层；
- attempt 生命周期与证据门（guard clause DSL 对 activeEvidenceViews 求值，fail-closed）；
- 声明式容量（角色表 slots、stage concurrency 读取）——**机制**普适。

**DAG 编排策略**（G10-C 应降级为 `ready_set_dag` 策略的内部细节）：
- `depends_on.every(SATISFIED)` 依赖满足解锁（`registerTask:120-124`、`decide:243-249`）——依赖=阻塞数据边的假设；
- BLOCKED→READY→ACTIVE→VERIFYING→SATISFIED 的 stage 词表与 latch 语义（ACTIVE/VERIFYING 占满即停 tick，`decide:215-233`）；
- batch/candidate 重试机制（attempt_limit/candidate_limit，`#activate/#advanceActiveStage`）；
- SATISFIED 唯一来源＝PROMOTION_COMMITTED（promotion-driven 验证）；TASK_FAILED 后回到 READY 的自动回退；
- 单 ProjectIR 修订流（`#project()` 单行读取，架构与工作同一实体）。

**判定**：`Scheduler == DAG` 的说法不完全准确——转换/守卫/容量已声明化；但 **stage 词表与依赖满足机制**仍内嵌在 decide 的扫描循环里，没有"策略选择器"。G10-C 的最小动作是把"扫描策略"参数化（ready_set_dag 为第一实现），而不是重写 decide 的骨架。

## E. Preset 的保真度审计（拓扑原型 ≠ 行为复刻）

六个 preset 全部是 **ProjectProposal 拓扑原型**（`presets.ts`），产出的每个"阶段"都是一个 task；全部缺失：agent 定义、通道语义、上下文投影、状态作用域、动态 spawn。

| preset | 看起来像 | 行为复刻缺口（不得夸大保真度） |
|---|---|---|
| pipeline | 顺序流水线 | 最接近 native（DAG 串行＋gate 即可）——但"agent 连续持有会话"语义无 |
| fan_out | orchestrator-workers | 拓扑✅；**缺省 ACTIVE 并发=1**（`scheduler.ts:316` taskCap ?? 1），需显式 declareStageGraph/concurrency 或角色表提额才真并行（G9-E 旧审计发现，未修） |
| hierarchy | manager→workers | 只是三段角色链；manager 无"持有控制权/调用子代理"运行时语义 |
| panel | 同题并行评审 | 拓扑✅；候选并发同样受缺省 1 限制；"合成"是普通下游任务，无 leader 协议 |
| verified_dag | 逐单元验证图 | 拓扑＋advisory gateId✅（门禁语义走既有 gate 通道——lineage 已诚实声明）；单元级"验证后才可依赖"要靠显式挂 gate |
| research_loop | Magentic ledger 循环 | **无运行时环**：回路由"核验 FAIL→主代理 plan() 修订"在编排层模拟（lineage 已声明）；循环不是 runtime 语义 |

**总结**：全部 six/六 presets＝`approximate` 级（§15 术语）；`lineage` 自由文本是现有唯一的诚实声明机制，无机器可查 fidelity 标签（§6 接缝处理）。

## F. 对 G9 现行路线的影响判定

1. **G9-D 会话 1 已交付**（32 号；稳定身份正是 G10-A Definition Graph 的前置——definition_id≠task_id 已分离、identity 单调家族已就位）。
2. **G9-C（表现保全）不受 rebase 影响**——纯 canvas 表现层，继续。
3. **G9-F（parser 纪律 + poll 快路径）不受影响**——author-authored JSON 永不静默丢字段是普适语义宿主的前提纪律。
4. **G9-G（Playwright E2E）不受影响**——语义缩放（§38）落地前，E2E 是唯一行为回归网。
5. **旧 G9-E（Executable ArchitectureBundle）→ DEFERRED / SUPERSEDED**：其"架构声明必须包含执行治理"的洞见**保留**，但其载体（Proposal+StageGraph+RoleTable 打包）把 Architecture 继续绑死在 Project 拓扑上——与 UA-INV-2（Architecture≠Work）冲突。实现移入 **G10-A 之后的 G10 轨道**（在 Agent/Task 分离后，执行治理随 AgentSystemDefinition 声明）。fan_out 缺省并发等可执行性发现并入 G10-A 验收。
6. **G9 完成路径确认为 D(余)→C→F→G → G10-A**（与指令 §40 预期一致，经代码复核成立：G10-A 需要 v3 稳定身份已具备；需要表现层不被身份迁移反复扰动（G9-C）；需要 E2E 网在语义改动前就位（G9-G 提前于 G10 更安全——G9-F/G 顺序维持））。

## G. 接缝处置（§31 范围内）

1. **PresetMeta 加法式 `fidelity: "topology_prototype"`**：机器可查的诚实标签（§31 明文示例），替换不了 lineage 自由文本、只与之并存；PRESETS/serve/web 镜像 + tripwire 同轮。
2. **ir.ts 头注释标注 conflation 计划**（`kind:"agent"` 现为 task-bearing node，G10-A 分离）——纯注释。
3. 不加实验性类型模块、不实现 G10-A、不动 AgentGraph/ProjectIR/Scheduler/CanvasDoc/events。

---

## 附录：知名系统语义覆盖矩阵（指令 §22）

判定词汇：`✅ 已原生` / `G10-x`＝计划原生原语（批次） / `策略`＝G10-C 编排策略 / `桥`＝ForeignRuntimeHolon（G10-E） / `✗`＝登记不支持。

| 系统 × 语义维 | ownership 模型 | agent 定义 | task 模型 | 上下文投影 | 共享状态 | 路由 | 并行 | 动态 spawn | 组嵌套 | 循环 | 持久化 | 人工干预 | 工具/效果 | trace |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OpenAI manager-as-tools | 集中（G10-B handoff 通道） | G10-A | 有界嵌套 invocation（G10-C manager 策略） | manager 裁剪投影（G10-B ContextPolicy） | ✗（默认无） | manager 决策（策略） | 受控嵌套并行（策略） | G10-D（有界激活） | Holon（G10-B） | ✗ | ephemeral✅/G11 | gate✅ | G10-A ToolDefinition | attempt✅ |
| OpenAI handoff | **所有权转移**（G10-B Channel.ownership=transfer——核心缺口） | G10-A | 对话轮次（G10-C handoff 策略） | 转移时配置投影（G10-B） | 会话态（G10-B SessionState） | 转移目标选择（策略） | ✗（串行会话） | ✗ | Holon（G10-B） | ✗ | ephemeral✅/G11 | gate✅ | G10-A | attempt✅ |
| LangChain subagents | 同 manager-as-tools | G10-A | 同上（策略） | 同上 | ✗ | 同上 | 同上 | 同上 | 同上 | ✗ | 同上 | gate✅ | 同上 | ✅ |
| LangChain router | 分布 | G10-A | 一次跳转（策略 router） | 输入透传（G10-B） | ✗ | **router 节点 kind 已在 IR**（G10-C 激活语义） | ✗ | ✗ | — | ✗ | 同上 | gate✅ | 同上 | ✅ |
| LangGraph custom state graph | 图内显式 | G10-A | 图节点执行（策略 ready_set_dag 超集） | state schema 投影（G10-B StateDefinition） | **typed state graph**（G10-B ScopeState） | 条件边（策略） | 节点并行（策略） | ✗ | subgraph=Holon（G10-B） | **环**（IR 合法；G10-D runtime 放开） | 同上 | interrupt=gate✅ | 桥（G10-E 可整图 Holon） | ✅ |
| CrewAI Crew | 角色分工（Organization，G10-B） | G10-A（role→AgentDefinition 绑定） | 任务列表（G10-A） | 角色上下文（G10-B） | ✗（crew 级仅汇总） | process 顺序/hierarchical（策略） | ✅（ready_set_dag） | ✗ | crew=Holon（G10-B） | ✗ | 同上 | gate✅ | G10-A | ✅ |
| CrewAI Flow | 事件驱动（G10-D runtime graph） | G10-A | flow state 转换 | state 读取（G10-B） | **Flow state**（G10-B SharedEnvironmentState） | @listen 条件（策略） | @start 并行（策略） | ✗ | — | 环（G10-D） | 同上 | gate✅ | 桥可选 | ✅ |
| MetaGPT SOP | 角色订阅上游（Organization+pubsub，G10-B） | G10-A（role=AgentDefinition） | SOP 阶段（策略 sop） | **role 只见声明上游消息**（G10-B filtered） | **共享 Environment**（G10-B SharedEnvironmentState——pubsub） | SOP 定序（策略 sop） | 角色并行（策略） | ✗ | — | ✗ | 同上 | gate✅ | G10-A | ✅ |
| CAMEL Workforce | planner/coordinator 分层（G10-C manager 策略） | G10-A | 动态分解任务（G10-D spawn） | 任务简报（G10-B） | workforce 级任务板（G10-B） | coordinator 指派（策略） | worker 并行（策略） | **动态创建/退场**（G10-D 核心） | **嵌套 workforce**（Holon，G10-B/D 核心） | 失败重试回路（策略） | 同上 | gate✅ | G10-A | ✅ |
| AutoGen/MS GroupChat | 群内平等＋selector 集中（策略 selector_group_chat） | G10-A | 发言轮次 | **全群共享会话史**（G10-B SessionState 共享读） | 会话史（G10-B） | selector 模型选下家（策略） | 发言串行 | ✗ | — | 轮次终止条件（策略） | 同上 | gate✅ | G10-A | ✅ |
| MS Concurrent | 无中心 | G10-A | 独立子任务 | 隔离（G10-B task-only） | ✗ | ✗（fan-out 静态） | **✅ 已原生**（ready_set_dag 并发；缺省=1 需声明提额——G9-E 旧发现随 G10-A 修） | ✗ | — | ✗ | 同上 | gate✅ | G10-A | ✅ |
| MS Handoff | 同 OpenAI handoff | G10-A | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 |
| Magentic | ledger 驱动（G10-C magentic 策略） | G10-A/orchestrator | ledger 项 | orchestrator 汇总投影（G10-B） | TaskLedger/ProgressLedger（G10-B ScopeState） | ledger 决定下一步（策略） | 可并行 lookup（策略） | ✗ | — | **自适性回路**（策略；知识账本的认知层在 G11 Epistemic Plane） | 同上 | gate✅ | G10-A | ✅ |
| Panel/debate | 临时平等（Coalition，G10-B） | G10-A | 同题多答 | 题面同发、答案互隔离（G10-B） | ✗（合成时汇聚） | 主持人/selector（策略） | 候选并行（策略；缺省 1 问题同上） | ✗ | — | 轮次辩论（策略） | 同上 | gate✅ | G10-A | ✅ |

矩阵结论（诚实登记）：

1. **已原生且复用**：静态并行（MS Concurrent）、人工干预（gate/hold）、attempt/trace、事件账本、声明式容量——普适底座成立。
2. **最大缺口**（G10-A/B 的正当性）：agent/task 定义分离、通道所有权（handoff）、上下文投影策略、typed state scopes、Organization/Holon schema——全部是语义轴缺失而非拓扑缺失。
3. **第二缺口**（G10-C/D）：编排策略参数化（selector/handoff/manager/sop/magentic）、动态 spawn、runtime 环。
4. **可桥接**（G10-E）：LangGraph/CrewAI Flow 整图 Holon——不需 native 化即可组合。
5. **长程认知**（Magentic ledger 的知识层、假设分支）：归 G11 Epistemic Plane，G10 不装。
6. 覆盖矩阵是**覆盖测试**，不是本体论来源（指令 §36）：Profiles ⊂ ExpressibleArchitectures；矩阵之外的自由架构仍是第一公民（UA-INV-14）。

## 附录 B：§35 产品级思想实验 A–L 的当前可达性

| 案例 | 现状 | 达标批次 |
|---|---|---|
| A 单独 agent | ✗（agent 节点必须带 task） | G10-A |
| B manager+5 子代理 | 拓扑近似 | G10-A+C |
| C handoff 会话 | ✗ | G10-B |
| D 扇出 20+综合 | 拓扑✅，缺省并发=1 需声明 | G10-A（治理随架构声明） |
| E MetaGPT SOP | ✗ | G10-B+C |
| F CAMEL 动态嵌套 workforce | ✗ | G10-B+D |
| G selector 群聊 | ✗ | G10-C |
| H Magentic 自适应账本 | 拓扑近似（plan 修订环） | G10-C（认知层 G11） |
| I 手搭环状消息拓扑 | IR 可画、capability 拒跑 | G10-D |
| J 外来 CrewAI/LangGraph 整体 | ✗ | G10-E 桥 |
| K 同架构跑 100 个任务 | ✗（架构=ProjectIR） | G10-A |
| L 同架构挂 2 年 campaign | ✗ | G11 |
