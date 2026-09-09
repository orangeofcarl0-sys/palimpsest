# Universal Agent Semantics 架构宪章（PLMP-UAS-0）

- 日期：2026-09-09
- 性质：**架构 rebase 冻结文档**——冻结概念边界、不变量与迁移路径；不实现最终 schema（G10-A 起逐段落地）
- 母体审计：`audits/UNIVERSAL-AGENT-SEMANTICS-REBASE-ASSESSMENT.md`（A–E 逐字段实证）
- 理论输入（已冻结，权威）：`docs/AgentGroup_Theory_v0_Literature_Aligned_Frozen_Spec.md`（PLMP-AGT-0）、`docs/PLMP-PAG-0_Persistent_Agents_Campaigns_Durable_Institutions_v0.1.md`（PLMP-PAG-0）
- 代码基线：`main` = `350fc01`（G9-D 会话 1 后），58 文件 / 370 测试全绿

---

## 1. Product Vision

Palimpsest 的目标终态：

$$
\boxed{
\textbf{topology-free、graph-native、evidence-governed 的通用多智能体操作系统环境}
}
$$

用户可：手搭任意架构 / 选 profile / 从需求自动合成 / 自由增删重连嵌套 / 观察运行时 / 暂停干预调试重配 / 跑 ephemeral 与 durable 系统——并且**行为学复刻**知名框架语义，而非画相似拓扑图。

最终指南：Palimpsest 不是模板集合，不是"多了节点类型的 DAG workflow 引擎"，也不是专用的持久研究 agent 框架。它是：

$$
\boxed{
\text{agent 架构作为一等可编辑、可组合、可执行、可观察、可变换、可治理对象的通用语义宿主}
}
$$

## 2. Architecture ≠ Work ≠ Runtime ≠ Continuity

四个正交维度（指令 §1，审计 §A/B 实证当前实现把四者压成两个：Architecture≅ProjectIR，Runtime≅task/attempt，Continuity 仅隐含 ephemeral）：

| 维度 | 回答 | 当前载体 | 目标载体 |
|---|---|---|---|
| Architecture | 什么 agent 系统存在、如何协作 | ProjectProposal（task 拓扑）＋可选拖挂 stageGraph/roleTable | AgentSystemDefinition（§4） |
| Work | 这一次 run 要完成什么 | ProjectIR（架构与工作同体） | TaskGraph / Assignment 集合，可由 Architecture＋Work 独立装配 |
| Runtime | 现在哪些实体存在、什么在执行 | task state + attempt | Activation / RuntimeInstance Graph（§6） |
| Continuity | 什么跨 activation/run 持续 | 无（仅 ephemeral 隐含） | 可选 PAG-0 层（§19） |

## 3. AgentDefinition vs TaskDefinition（UA-INV-1）

当前（审计 §A）：`AgentGraph agent node ≈ TaskDefinition`——agent 节点必须携带 task（`ir.ts:179`），AgentDefinition 的概念字段（instructions/modelPolicy/capabilities/tools/memory/context policy）在 IR 中零存在，`role` 是唯一近似。

冻结的语义所有权（**不冻结字段语法**，G10-A 落地时定）：

- **AgentDefinition**：身份、instructions、modelPolicy、capabilities、roles、tools/skills、memory/state bindings、input/output contract、context/lifecycle policy、guardrails。**MUST NOT** 因本项目恰好用这些字段而包含 `dependsOn/writePaths/requiredArtifacts`（那是 TaskDefinition 的）。
- **TaskDefinition**：objective、inputs、expectedOutputs、constraints、requiredEvidence、dependencies、assignmentPolicy、resourceBudget。
- **Assignment**：Task→固定 Agent / Task→Role / Task→Group(Holon) / Task→动态 selector——四形态都得可表达。
- **Activation**：一个 AgentDefinition 可实例化多个 Activation（§6）；动态 worker **不得**自动变成持久 Definition（UA-INV-3/4）。

当前兼容纪律：不破坏既有 Project/Task runtime；加法式经显式编译层迁移，**禁止静默双真相**（与 G2 v1→v2、G9-D v2→v3 同款纪律）。

## 4. AgentSystemDefinition（概念目标，不立即实现）

```text
AgentSystemDefinition
├── DefinitionGraph            ← 手搭/导入/合成/编译 的自由图（今日 AgentGraph 的后继）
│   ├── AgentDefinition
│   ├── Group/HolonDefinition  ← AGT-0 §36 分离 schema
│   ├── ToolDefinition
│   ├── HumanDefinition
│   ├── StateDefinition
│   ├── ArtifactDefinition
│   └── 其他能力定义
├── Channels                   ← §8
├── OrchestrationPolicies      ← §11
├── ContextPolicies            ← §9
├── StatePolicies              ← §10
├── LifecyclePolicies          ← ephemeral 缺省；durable 可选（§19）
└── GovernancePolicies         ← 证据/门禁/审批（复用现有 gate DSL 血统）
```

冻结边界而非 schema：本轮不建这张表；G10 各批次把它逐段变成可执行合同。

## 5. Definition / Runtime / Trace 三图分离（UA-INV-3/4）

| 图 | 回答 | 当前对应 | 冻结规则 |
|---|---|---|---|
| Definition Graph | 声明了什么系统 | AgentGraph / ProjectIR.tasks | 身份 = G9-D 稳定身份家族；只经治理变更（GraphPatch/声明事件） |
| Runtime Instance Graph | 现在存在哪些激活/worker/组 | task rows + attempts（无实例图） | 动态 spawn **只入此图**；晋升为 Definition 必须过治理（G10-D） |
| Trace Graph | 实际发生了什么交互 | attempts timeline / trace 行 | 只追加；worker report ≠ evidence |

## 6. Activation / Runtime Instance

- `AgentDefinition → AgentActivation #1..#N`：激活是 agent 的运行实例，拥有独立的上下文投影与状态作用域；attempt 是激活的一次受治理执行（今日 attempt 直接挂在 task 上——G10-A 引入 AgentActivation 后 attempt 挂激活）。
- 动态 spawn 的 worker 是 Runtime Instance，不是新 Definition（UA-INV-4）；"晋升为定义"是显式治理动作。

## 7. 群体语义 = AGT-0 五对象（不合并）

冻结采纳 AGT-0 §3（全文档权威，此处只记执行裁决）：

- **VisualGroup**：纯表现（今日 CanvasGroup 语义不变）；不得自动产生 runtime 语义。
- **Organization**：组织关系（成员可重叠、roles/capabilities/goals/norms）——今日无载体。
- **Coalition**：任务驱动临时协作（panel/debate/ensemble）——今日 panel preset 是其拓扑影子。
- **RuntimeScope**：执行所有权边界（scheduler/state/retry/budget/lifecycle 所有权，层叠森林）——今日 RuntimeSubgraph v1＝"runtime-addressable scope"（AGT-0 §35.3 已裁定不得过度宣称）。
- **Holon**：内部多重性、外部单一主体（`H=(G,∂H,π_H)`）——ForeignRuntimeHolon（§15）与嵌套 workforce 的统一抽象。

四独立关系不得由单一 `groupId` 字段无区别承载（AGT-0 §4.5 冻结规则）；执行所有权必须层叠无歧义。

## 8. Channels（通信语义，非边标签）

边 kind（data/control/message/handoff/…九种）是**通道语义的语法位**；完整语义归属裁定（本轮冻结，不实现对象）：

| 语义 | 归属 | 理由 |
|---|---|---|
| semantics（message/handoff/data/…） | **边**（现有 kind 字段即语法位） | 拓扑局部性质 |
| delivery（p2p/broadcast/pubsub） | Channel 定义或 edge 细化 | 一对多结构性质 |
| contextTransfer（full/filtered/summary/schema/handles_only） | **Channel 定义引用 ContextPolicy**（§9） | 独立正交轴，逐边重复即爆炸 |
| ownership（retain/transfer/none） | Channel 定义 | handoff 的核心语义（UA-INV-5 相关：会话所有权转移） |
| durability（ephemeral/session/durable） | LifecyclePolicy（§10/§19） | 连续性维度，不属拓扑 |
| runtime 事件（投递/接收事实） | Trace Graph | 运行时事实 |

## 9. Context = 一等语义轴（UA-INV-5）

"接收方看到什么"必须是显式语义，不是拓扑的偶然后果。现有 Context Compiler（`src/context/`：compressor/manifest/distribution/requirement）是**装配机器**——G10-B 把它的装配策略升级为可声明的 ContextPolicy（枚举基准：full conversation / task-only isolated / selected history / summary / evidence handles / shared blackboard / none）。两个拓扑相同而上下文投影不同的系统是**不同的架构**。

## 10. State 按作用域类型化（UA-INV-6）

禁止一个泛型 `memory`。概念最小集（PAG-0 热温冷与记忆分类的长程形式在 G11 落地）：

```text
ActivationState（激活内）→ SessionState（会话）→ RuntimeScopeState（作用域共享）
→ SharedEnvironmentState（MetaGPT 式共享环境）→ DurableAgentState（持久 agent）
→ InstitutionState（机构）
```

StatePolicy 声明各作用域的读写权、生命周期与证据关系；复现 handoff 会话态 / CrewAI Flow 态 / 嵌套 Workforce 态依赖此轴。

## 11. Orchestration = 策略，不是 Scheduler 本体（UA-INV-7）

`Scheduler == DAG` 不准确（审计 §D）：转换/守卫/容量已声明化（H1 D-3）。冻结边界：**调度器成为策略宿主**——

```text
OrchestrationPolicy: ready_set_dag（现有语义整体降级为第一策略）
未来: sequential / concurrent / manager / router / handoff / round_robin
     / selector_group_chat / pubsub / sop / magentic / dynamic_workforce
     / campaign / custom
```

保留为普适 kernel 的（审计 §D 分类）：单决策单事件、纯 decide、幂等、PAUSED/hold 分层、attempt 生命周期＋证据门、声明式容量机制。降级为 ready_set_dag 内部细节的：depends_on 满足解锁、stage 词表 latch、batch/candidate 重试、promotion-driven SATISFIED。

## 12. 少核心原语规则

$$
\boxed{小语义内核 + 可扩展策略 + 架构 profile}
$$

禁止：一框架一节点 kind、一框架一调度器、kernel 内框架特定条件分支。普适性来自策略与 profile 的组合，不来自本体膨胀。

## 13. Architecture Profiles 与 Fidelity（UA-INV-8/9）

```ts
ArchitectureProfile { id; lineage; semanticRequirements; compiler; conformanceSuite; fidelity }
fidelity ∈ { native, bridged, approximate }
```

- **native**：Palimpsest 核心直接执行等价语义（Profile→System IR→Runtime）。
- **bridged**：外来 runtime 封装为 Holon 执行（§15）；Palimpsest 仍治理边界/生命周期/trace/evidence/效果。
- **approximate**：只表达主模式；**必须显式标注** approximate / not behaviorally equivalent（UA-INV-9）——今日六 preset 全部属此级（审计 §E），接缝已加 `fidelity` 机器标签。

Conformance（§23 指令义务，示例冻结为验收义务）：
- OpenAI handoff：A 初始持有→A 选 B→所有权转移 B→B 收到配置的上下文投影→后续用户可见输出来自 active owner。
- Manager-as-tools：manager 保持控制权；子代理调用是有界嵌套 invocation；结果返回 manager；子代理不成为会话所有者。
- MetaGPT 式 SOP：role 监听声明的上游消息/action；environment 承载共享发布；SOP 顺序被尊重。
- CAMEL Workforce 式：planner 分解；coordinator 指派；可动态创建 worker；嵌套 workforce 可表达。

## 14. 能力注册表（UA-INV-12 的边界面）

`agentGraphCapabilities()`（硬编码五诊断）→ 演进为声明式 RuntimeCapabilities（nodeKinds/channelSemantics/orchestrationPolicies/dynamicSpawn/cycles/durableState/handoff/pubsub/groupchat/…）；架构需求满足 `RequiredCapabilities ⊆ AvailableCapabilities`。本轮不建插件框架；G10-C 起以最小 seam 逐段参数化（第一个参数化点＝orchestration policy）。

## 15. ForeignRuntimeHolon（UA-INV-10）

外来系统（LangGraph 图 / CrewAI Crew / CAMEL Workforce / AutoGen team）整体封装为 Holon：`{adapter, input/output interface, lifecycle, trace adapter, state bridge}`。Palimpsest 治理边界、生命周期、trace、evidence、可行处效果；**不得**为支持外来语义向中心 kernel 添加框架特定分支。AGT-0 Holon 定义（内部多重性→外部单一主体）是其理论基础。

## 16. ArchitectureRequirements（非 canonical 需求词汇，不冻结大 schema）

```yaml
ownership: centralized | transferable | distributed
parallelism.desired: high
contextIsolation: strong
sharedState: none
dynamicSpawn: allowed
evidence: strict
persistence: ephemeral
humanApproval: final_only
costPriority: high
latencyPriority: medium
```

用途：证明自动架构合成可以走"需求→语义"而非"prompt→任意 JSON"。

## 17. Auto Architecture Synthesis（UA-INV-11）

```text
需求 → ArchitectureRequirements → 候选 profile/组合 → 候选架构
    → compile → capability check → 成本/延迟/证据估计 → preview → ArchitecturePatch
```

LLM **永不直接覆写图**；产物永远是 proposal/patch（复用 GraphPatch 治理面）。这是自动架构合成的约束化定义。

## 18. 架构代数（authoring sugar，非 canonical 限制）

`Seq / Par / Route / Manager / Handoff / GroupChat / Loop / MapReduce / Gate / Human / Holon / Persist(scope, lifecycle)`——每个构造编译进自由图/System IR；手搭任意图保持一等公民（UA-INV-14：Profiles ⊂ ExpressibleArchitectures，不等号方向不可逆——§36 指令：Palimpsest 必须能表达尚无框架命名过的架构）。

## 19. AGT / PAG 集成（正交，皆可选）

**AGT-0（结构正交轴）**：五对象/四关系进 Definition Graph 与 Runtime Instance Graph 的 schema（G10-B/D 落地）；GroupTransform 演算（T0/T1/T2）复用 GraphPatch 的治理纪律但**不塞进 GraphPatch**（AGT-0 §35.5）；`definition_id`（G9-A/G9-D 稳定身份）＝变换连续性的身份基础（AGT-0 §35.2）。

**PAG-0（连续性正交轴）**：缺省路径保持 `architecture + work → run → done`（lifecycle=ephemeral）；可选层（G11）在其上引入 PersistentAgent/Campaign/Commitment/Watcher/Epoch/Epistemic State。层级冻结：

```text
可选 Durable Institution（G11）
        │ Campaign
 CampaignCompiler（G11-E）
        ▼
Architecture + Work（G10 落地）
        ▼
Universal Runtime（G10-C）
```

现有 Palimpsest＝**short-horizon execution engine**（PAG-0 §0.10/§18 原文裁定）——不需要被推翻。PAG-0 §53 平面分离不变量与本库既有红线**同构**（reasoner output ≠ canonical epistemic state ≡ LLM opinion ≠ canonical project state；worker report ≠ evidence）——证据治理内核就是五平面的 Governance/Epistemic 雏形，这是保留而非重建的理由。

## 20. 从当前 Palimpsest 的迁移路径

| 现有资产 | 处置 |
|---|---|
| AgentGraph IR（9 节点×9 边语法） | **保留**＝Definition Graph 的语法骨架；G10-A 起 kind 语义逐段激活 |
| CanvasDoc v3 + 稳定身份家族 | **保留**＝Definition Graph 的编辑面与身份底座（G9-D 已交付） |
| GraphPatch（验证/预览/治理纪律） | **保留**＝架构变更的唯一治理通道（未来 GroupTransform 的先导，AGT-0 §35.5） |
| 调度器骨架（decide/commit/幂等/hold/容量） | **保留**＝策略宿主；stage 词表降级为 ready_set_dag 内部（G10-C） |
| gate DSL / 证据面 / promotion | **保留**＝Governance Plane 雏形 |
| Context Compiler | **保留**＝ContextPolicy 的装配机器（G10-B 声明化） |
| ProjectProposal / presets | 降级为 Work 词汇 + approximate 拓扑原型（fidelity 标签已加）；Architecture 载体由 G10-A 的 AgentSystemDefinition 接管 |
| ProjectIR 修订流（plan/typed invalidation） | **保留**为 short-horizon 执行投影；G11 中变为 CampaignCompiler 的输出 |

## 21. 明确非目标

本轮与 G10 全程禁止：每框架一 runtime、中心 kernel 的框架条件分支、强制一切 agent 持久化、多智能体理论大一统本体、把 AGT/PAG 语义提前塞进现有 JSON、Plugin 市场机制、分布式调度、AGI。G11 前不实现任何 PAG 长程对象。

## 22. 冻结不变量（UA-INV-1..14）

```text
UA-INV-1   AgentDefinition ≠ TaskDefinition
UA-INV-2   Architecture ≠ Work
UA-INV-3   Definition ≠ Activation
UA-INV-4   动态运行时实体不得自动改写 Definition Graph
UA-INV-5   上下文暴露是显式语义，不是拓扑的偶然后果
UA-INV-6   状态作用域是显式语义
UA-INV-7   调度器是编排策略，不是整个 runtime 的定义
UA-INV-8   架构 profile 声明 fidelity 与 lineage
UA-INV-9   approximate 复刻不得冒充 native 行为等价
UA-INV-10  外来 runtime 可封装为 Holon 而不污染语义内核
UA-INV-11  自动架构生成只产出 proposal/patch，不直接产 canonical 状态
UA-INV-12  持久性可选且正交
UA-INV-13  Ordarium 保持 effect authority，不做通用编排器
UA-INV-14  自由/手搭图保持强于 preset 库（Profiles ⊂ ExpressibleArchitectures）
```

另冻结 AGT-0/PAG-0 的既有不变量为引用约束：四群对象互不等价、单字段不承载四关系、执行所有权层叠、`Campaign ≠ Project`、`EvidenceHistory ≠ CurrentBeliefState`、平面分离六则（PAG-0 §53）。

## 23. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-09 | 初版冻结（PLMP-UAS-0，Universal Agent Semantics Rebase 轮）：22 节 + UA-INV-1..14；AGT-0/PAG-0 集成裁决（五对象/四关系/五平面/长程-短程分层采纳为引用约束；GraphPatch＝GroupTransform 先导不塞群语义；Palimpsest 定位 short-horizon execution engine）；旧 G9-E superseded（洞见"架构声明含执行治理"移 G10）；G10/G11 路线冻结（详见 `audits/G10-G11-ROADMAP.md`）。 |
