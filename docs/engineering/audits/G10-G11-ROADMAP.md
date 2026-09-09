# G10–G11 路线图（Universal Agent Semantics 落地计划）

- 日期：2026-09-09
- 冻结自：`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`（PLMP-UAS-0）＋母体审计（`UNIVERSAL-AGENT-SEMANTICS-REBASE-ASSESSMENT.md`）
- 理论约束：PLMP-AGT-0（结构正交轴）、PLMP-PAG-0（连续性正交轴）
- 纪律：每批次仍走"审计 → 规格冻结 → 实现 → 回归 → 登记"；**先收完 G9 再开 G10**；G10 不并行多批次实现；G11 在 G10 语义就绪前不开工

---

## G9 收尾（G10 前置，顺序确认自审计 §F）

```text
G9-D 会话 2（D6–D10）：mutation 助手 / identity-aware diff / anchor / 冒烟 / 交付报告   ✅ 2026-09-08 完成（G9-D COMPLETE，报告＝G9-D-SESSION-2-DELIVERY.md）
        ↓
G9-C（33 号）Canvas Presentation Preservation   ← 当前位置
        ↓
G9-F（35 号）Parser 纪律 + poll 快路径
        ↓
G9-G（36 号）Playwright E2E
        ↓
G10-A0（语义实体/身份/绑定审计——纯文档，见下注）→ G10-A
```

**旧 G9-E（34 号，Executable ArchitectureBundle）＝ DEFERRED / SUPERSEDED**：其"架构声明必须包含执行治理"的洞见保留并移入 G10-A（AgentSystemDefinition 携带 OrchestrationPolicies/GovernancePolicies——执行治理随架构走，随 G10-A 验收）；其旧载体（Proposal+StageGraph+RoleTable 打包）因把 Architecture 继续绑死在 Project 拓扑（违 UA-INV-2）而不再按原样实现。fan_out 缺省并发等可执行性发现并入 G10-A/G10-C 验收。规格编号 34 释放给 G10 轨道（见下）。

---

## G10 — Universal Agent Runtime（AGT-0 结构轴落地）

### G10-A0 — Semantic Entity / Identity / Binding Audit（纯文档预检闸，G9-G 与 G10-A 之间，零代码零 schema；2026-09-08 登记）

**性质**：documentation-only。G10-A0 必须逐一审计**但不实现**以下实体/身份/绑定问题，并以规格裁决收编（防既有标识符被未来语义"顺势接管"）：

```text
SystemGraph ≠ WorkGraph                       （架构资产图 vs 单次 Work 编排图，两个图种）
CanvasDoc v3 ＝ Work authoring canvas          （32 号 §5 已澄清；G10 只确认不推翻）
现行 definition_id ＝ Work/Task Definition 身份（REDLINE-UAS-D1；不是 AgentDefinitionId 预支）
未来 AgentDefinitionId ＝ 全新独立身份          （独立命名空间/lineage，非字段加宽）
ArchitectureDefinition ＝ 独立规范实体
WorkDefinition ＝ 独立规范实体
BindingDefinition / RunDefinition              （谁拥有 run 定义——不得散落 scheduler 内联量）
TaskGraphWork ⊂ WorkDefinition                 （现行 AgentGraph≈TaskGraphWork，是 Work 定义的子形态）
Attempt vs Activation                          （非一般父子；UAS-D-INV-5 冻结待审）
Invocation / Participation 关系
scoped orchestration：RuntimeScope → OrchestrationPolicyInstance
ExecutionPlan ＝ 派生的运行时编译目标
```

**A0 还须裁决的六个开放问题（§26）**：
- **A. Canvas 拆分**：未来是否 ArchitectureCanvas + WorkCanvas 双面（共享 renderer/layout/identity 基建、语义 schema 分离）？预期默认：是，除非 A0 找到更干净的等价物。
- **B. 类型化 patch 目标**：SystemPatch / WorkPatch / BindingPatch 是否架在共享类型化 patch 引擎上（现行 GraphPatch 治理纪律作底座）？
- **C. Invocation**：AgentActivation / Attempt / Invocation / Session 如何相交而不强造假父子关系？
- **D. 动态 agent 生成**：是否需要 AgentTemplate → EphemeralAgentSpec → Activation 的晋升前通道（晋升进规范 AgentDefinition 的治理门，呼应 G10-D）？
- **E. capability 词汇拆分**：Agent 能力（competence）/ 运行时语义特性（feature）/ 权限授予（authority grant）三分，不再一个词三用。
- **F. 工具/模型提供方**：逻辑需求（web_search、model policy）与具体提供方（DSH / OpenAI hosted tool / MCP / local）经 Binding 分离。

现行 `AgentGraph → WorkGraph` 的正式改名/适配/退役策略也由 A0 一并决定（32 号 §5：本轮只正术语，API 原样）。

### G10-A — Agent / Task / Assignment / Activation 分离（规格 34，PLMP-UAS-1）

- **目标**：`AgentDefinition / TaskDefinition / Assignment / Activation` 四概念分离（UA-INV-1/3），不破坏既有 Project/Task runtime；**加法式经显式编译层，禁止静默双真相**。
- **范围裁决**：DefinitionGraph 增加 AgentDefinition（instructions/modelPolicy/capabilities/roles/tools/skills/bindings/contextPolicy）；TaskDefinition 保留现有 TaskSpec 语义所有权并明确剥离 agent 侧字段；Assignment 四形态（Task→Agent/Role/Group/动态 selector）枚举化；Activation 成为 attempt 的挂靠者。IR 节点 kind `agent` 的语义从"task-bearing node"升级为真正的 agent 定义位。
- **验收**：单 agent 可独立声明执行（§35 案例 A）；同一定义多激活（案例 B 前半）；`policy.authorize` 可按 agent 粒度收窄（工具/写域边界）；fan_out 缺省并发治理随架构声明（旧 G9-E 洞见落地）。
- **前置**：G9-D/C/F/G 完成（身份/表现/解析纪律/E2E 网就位）。

### G10-B — Channel / Context / State 语义（规格 35→见下注，PLMP-UAS-2）

- **目标**：Channel（§8 归属表：边 kind＝语法位，delivery/ownership/durability 入 Channel 定义）、ContextPolicy（§9 七档枚举基准，Context Compiler 声明化）、StateDefinition/StatePolicy（§10 六作用域最小集）。
- **核心语义**：handoff 所有权转移（UA-INV-5 的载体——OpenAI/MS handoff 合规义务见宪章 §13）；Organization/Holon schema 分离（AGT-0 §36 五对象之一部分：Organization/HolonDefinition）。
- **验收**：handoff 合规五断言（A 持有→选 B→所有权转移→配置投影→输出归 active owner）；MetaGPT 式"role 只见声明上游"（filtered 投影）；两拓扑相同、投影不同的系统判为不同架构。

### G10-C — 策略驱动编排（PLMP-UAS-3）

- **目标**：调度器成为策略宿主（UA-INV-7）；`ready_set_dag` 降级为第一策略；首批新策略取**小子集**：`manager`（manager-as-tools）、`handoff`、`selector_group_chat`、`sequential`。
- **边界**：ready_set_dag 的 stage 词表/batch 重试/依赖满足机制作为该策略内部实现保留，不删；新策略复用 decide/commit/幂等/hold/证据门骨架（审计 §D 普适清单）。
- **验收**：同一 DefinitionGraph 可换策略执行并有行为断言区分（例：同一 5-agent 图在 ready_set_dag 下按依赖收敛、在 manager 下由 manager 串行驱动）。

### G10-D — 动态运行时图（PLMP-UAS-4）

- **目标**：spawn/despawn、runtime worker 实例、Runtime Instance Graph、runtime group、**晋升为 Definition 的治理门**（UA-INV-3/4）；runtime 环放开（IR 本就 cycle-capable，G3 预留）。
- **核心语义**：CAMEL Workforce（动态 worker + 嵌套 workforce＝Holon）、手搭环状消息拓扑（§35 案例 I）。
- **验收**：动态 spawn 的 worker 只存在于 Runtime Instance Graph；晋升需显式治理动作且 audit 可查。

### G10-E — Architecture Profiles + 兼容性实验室（PLMP-UAS-5）

- **目标**：ArchitectureProfile（id/lineage/semanticRequirements/compiler/conformanceSuite/fidelity 三级）；ForeignRuntimeHolon（adapter/IO interface/lifecycle/trace adapter/state bridge）；覆盖矩阵（审计附录）逐行转 conformance suite。
- **验收**：OpenAI handoff/manager-as-tools/MetaGPT SOP/CAMEL Workforce 四套合规套件（宪章 §13 义务）；approximate 标签机器可查（UA-INV-9）；一个外来系统（LangGraph 或 CrewAI）以 Holon 桥接通过边界治理断言（§35 案例 J）。

### G10-F — 自动架构合成（PLMP-UAS-6）

- **目标**：ArchitectureRequirements（§16 词汇）→ 候选 profile/组合 → compile → capability check（RuntimeCapabilities 注册表最小 seam）→ 成本/延迟/证据估计 → preview → ArchitecturePatch（UA-INV-11：LLM 永不直接覆写图）。
- **验收**：同一需求可复现地产出候选集并有 capability 裁决记录；patch 走既有 GraphPatch 治理面。

**G10 批次间编号**：G10-A＝规格 34（释放自旧 G9-E）；G10-B 及以后按工程 README 顺延（B≈35，后续实交时定，不预占）。

---

## G11 — PLMP-PAG-0 落地（连续性正交轴，全部可选）

前置：G10-A..E 完成；G11 **不得**使 ephemeral 缺省路径复杂化（UA-INV-12）。

| 批次 | 目标（PAG-0 章节） |
|---|---|
| G11-A | PersistentAgent / Identity kernel / Epoch / AgentEntity≠Activation（§5/6/8） |
| G11-B | Commitment / Campaign（§14/15/16：Campaign≠Project） |
| G11-C | Watchers / Dormancy / Sleep-Wake / Prospective Memory（§11–13） |
| G11-D | Epistemic Plane：Evidence History ≠ Belief、G_prov/G_evid/G_epi/G_intent 四图、Belief Revision、假设分支（§21–28） |
| G11-E | CampaignCompiler：LongHorizonState → ProjectIR/AgentGraph/执行策略（§56）；Project 变为可弃可重编译投影 |
| G11-F | DurableHolon / DurableInstitution（§48/49）；AGT×PAG 交点（§50） |

---

## 依赖与顺序总图

```text
G9-D ✅ → G9-C → G9-F → G9-G → G10-A0（文档）
                     ↓
   G10-A ──→ G10-B ──→ G10-C ──→ G10-D ──→ G10-E ──→ G10-F
     │          │                     │
     └──────────┴── AGT-0 schema 落地 ─┘
                     ↓
   G11-A..F（PAG-0，可选层，顺序内可按批次独立交付）
```

G10-A→B 强依赖（Channel/Context/State 需要 Agent/Task 分离后的定义面）；G10-C 依赖 A（策略作用于 Assignment）；G10-D 依赖 B（Holon/嵌套）；G10-E 依赖 C/D（合规套件要跑得起来）；G10-F 依赖 E（合成在 profile 空间搜索）。

## 明确非目标

见宪章 §21；另：本轮（rebase 轮）之后、G10-A 开工前**不**预写任何 G10 schema 代码；G9-G 之前不开 G10（E2E 网先行的顺序已由审计 §F 确认）。
