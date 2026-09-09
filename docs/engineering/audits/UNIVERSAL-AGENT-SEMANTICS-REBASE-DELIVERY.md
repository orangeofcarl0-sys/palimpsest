# Universal Agent Semantics Rebase 交付报告

- 日期：2026-09-09
- 代码基线：`main` = `350fc01`（G9-D 会话 1 后）；理论权威＝仓库内 PLMP-AGT-0 / PLMP-PAG-0（docs/ 根）
- 本轮产物：`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`（PLMP-UAS-0 宪章）、`audits/UNIVERSAL-AGENT-SEMANTICS-REBASE-ASSESSMENT.md`（A–E 实证＋覆盖矩阵＋A–L 差距表）、`audits/G10-G11-ROADMAP.md`、G9-C-G 计划 rebase、两个 §31 接缝（PresetMeta.fidelity、ir.ts 注释）
- 测试基线：**58/370 保持**（PRE-A01 循环内增 fidelity 断言，零新增测试项；既有 370 项原样绿）

## 十四问

**1. 当前最限制普适性的抽象是什么？**
`AgentGraph agent node ≈ TaskDefinition`＋`Architecture ≈ ProjectIR`（审计 §A/§B）。前者让 agent-side 语义（instructions/modelPolicy/tools/memory/context policy）无处安放、独 agent 不可表达；后者让架构不可脱离单次 work 复用（§35 案例 K/L 直接失败）。两者都在**语义所有权**层面，不在语法层面——所以 rebase 是重定位而非重写。

**2. Agent 与 Task 究竟在哪里混淆？**
五处（审计 §A.2 逐字段表）：①agent 节点必须带 task（`ir.ts:179`）；②`label` 三重职责（objective/依赖词汇/展示名）；③`role` 是唯一 agent 侧字段且仅影响并发容量（`scheduler.ts:281-283`）；④授权项目级共享（`policy.authorize(project, task_id)`）；⑤无 AgentActivation/动态 worker 实例概念。接缝注释已在 `ir.ts` 头标注。

**3. 哪些现有代码可保留？**
全部强内核保留（宪章 §20 迁移表）：AgentGraph IR 9×9 语法骨架（kind/edge kind 是预留的扩展位，G3 决策的正确遗产）、CanvasDoc v3＋稳定身份（G9-D 刚交付的 Definition Graph 底座）、GraphPatch 治理纪律（GroupTransform 先导，AGT-0 §35.5）、调度器骨架（decide/commit/幂等/hold/声明式容量）、gate DSL＋证据面＋promotion、Context Compiler（ContextPolicy 的装配机器）、plan/typed invalidation（short-horizon 投影）。**零删除**——本轮代码改动只有两个接缝。

**4. 什么属于 G9 完成？**
G9-D 会话 2（D6–D10：mutation 助手/identity-aware diff/anchor 端点/冒烟/交付报告）、G9-C（表现保全）、G9-F（parser 纪律＋poll 快路径）、G9-G（Playwright E2E）。这些都是身份/表现/解析/回归网层面的收尾，不与 rebase 语义冲突；E2E 网先于 G10-A 落地（审计 §F 确认顺序）。

**5. 旧 G9-E 是否被取代？**
**是，SUPERSEDED**（G9-C-G 计划已标注）。理由：其载体（Proposal+StageGraph+RoleTable 打包）仍把 Architecture 绑在 Project 拓扑上，违 UA-INV-2。**保留的洞见**："架构声明必须包含执行治理"→移入 G10-A 验收（执行治理随 AgentSystemDefinition 声明；fan_out 缺省并发随架构治理）。规格 34 释放给 G10-A。

**6. G10-A 究竟是什么？**
`AgentDefinition / TaskDefinition / Assignment / Activation` 四概念分离（`audits/G10-G11-ROADMAP.md`）：DefinitionGraph 获得 AgentDefinition（instructions/modelPolicy/capabilities/roles/tools/skills/bindings/contextPolicy——MUST NOT 含 dependsOn/writePaths/requiredArtifacts）；TaskDefinition 明确 TaskSpec 的语义所有权；Assignment 四形态（Task→Agent/Role/Group/动态 selector）；Activation 成为 attempt 的挂靠者。加法式经显式编译层，禁止静默双真相（与 G2/G9-D 同款纪律）。验收：独 agent 可声明执行、同定义多激活、按 agent 粒度授权、fan_out 并发治理随架构。

**7. 最小普适语义内核是什么？**
调度骨架（单决策单事件/纯 decide/幂等/PAUSED-hold 分层/attempt 生命周期＋证据门/声明式容量**机制**）＋ Definition/Runtime/Trace 三图分离＋五节点能力分层（agent/subgraph 可执行，gate/tool/router/memory/human/artifact 语法位待激活）＋边 kind 语法位＋Context Compiler 装配机器。其余全部是**策略**（orchestration/context/state/lifecycle/governance）与 **profile** 的组合空间（宪章 §12：小内核＋可扩展策略＋架构 profile）。

**8. Channel/Context/State 概念上如何表示？**
归属表（宪章 §8）：语义（message/handoff/data/…）＝边 kind 语法位；delivery/ownership/durability＝Channel 定义；contextTransfer＝Channel 引用 **ContextPolicy**（七档基准，Context Compiler 声明化）；投递/接收事实＝Trace Graph。State 按六作用域类型化（Activation/Session/RuntimeScope/SharedEnvironment/DurableAgent/Institution），StatePolicy 声明读写权与生命周期。两条硬规则：UA-INV-5（上下文暴露是显式语义）＋UA-INV-6（状态作用域是显式语义）。

**9. 外来 runtime 如何支持？**
ForeignRuntimeHolon（UA-INV-10）：`{adapter, input/output interface, lifecycle, trace adapter, state bridge}`，理论基础＝AGT-0 Holon（`H=(G,∂H,π_H)`，内部多重性→外部单一主体）。Palimpsest 仍治理边界/生命周期/trace/evidence/可行处效果；**禁止**为中心 kernel 添加框架特定分支。首个 bridged 目标（G10-E）：LangGraph 或 CrewAI 整图 Holon 过边界治理断言。

**10. 知名系统将如何行为学测试？**
ArchitectureProfile.conformanceSuite——覆盖矩阵（审计附录，14 系统×14 维）每格映射到 already-native/planned/policy/bridge/unsupported；首批四套合规义务已冻结（OpenAI handoff 五断言、manager-as-tools 四断言、MetaGPT SOP 三断言、CAMEL Workforce 四断言，宪章 §13）。矩阵是覆盖测试不是本体论来源（Profiles ⊂ ExpressibleArchitectures，UA-INV-14）。

**11. 自动架构生成如何约束？**
UA-INV-11：约束合成管线（需求→ArchitectureRequirements→候选→compile→capability check→估计→preview→ArchitecturePatch），LLM 永不直接覆写图；产物只走既有 GraphPatch 治理面；capability check 演进为声明式 RuntimeCapabilities（RequiredCapabilities ⊆ AvailableCapabilities），本轮不建插件框架。

**12. AGT/PAG 如何集成而不成为强制？**
两轴正交且皆可选（宪章 §19）：AGT-0 五对象/四关系进 G10-B/D schema，四关系禁止单字段承载，执行所有权层叠；GraphPatch 保持纯架构语义编辑，GroupTransform（T0/T1/T2）作为其扩展通道而非塞入。PAG-0 整层位于 G11：缺省路径保持 `architecture+work→run→done`（lifecycle=ephemeral），Campaign/CampaignCompiler/Epistemic Plane 只在显式进入 durable 模式后存在；Palimpsest 被 PAG-0 原文定位为 short-horizon execution engine（不需推翻）。PAG-0 §53 平面分离不变量与本库红线同构——保留即集成。

**13. 哪些明确不支持？**
宪章 §21＋§35 A–L 差距表逐项登记当前不可达案例（A/C/E/F/G/H/I/J/K/L 八项，达标批次已标注）；本轮不实现 G10-A（指令 §31）；G9-G 前不开 G10；G10-C 只做四策略小子集；G11 前零 PAG schema；永久非目标：每框架一 runtime、kernel 框架条件分支、强制持久化、分布式调度、多智能体大一统本体。

**14. 下一个应实现的确切 commit 是什么？**
**G9-D 会话 2（D6–D10）**——它已在 32 号规格内冻结（mutation 助手 MUT-INV-1、identity-aware diff、anchor 端点、Web 接线、冒烟、PROP-DECL-A01、交付报告），是唯一已在规格内、审计已备、无前置缺口的批次。其后的机械顺序：G9-C → G9-F → G9-G → **G10-A**（规格 34，Agent/Task/Assignment/Activation 分离）。

## 退出条件核验（指令 §40）

- 显式、内部一致路径：✅（宪章 §20 迁移表＋§22 路线图依赖图）
- 不丢弃证据/治理内核：✅（零删除，两接缝）
- 不把每个 Agent 变成 Task / 每个架构变成 ProjectProposal：✅（UA-INV-1/2 冻结；presets 降级 approximate）
- 不强制长程 Campaign 语义：✅（UA-INV-12，G11 可选层）
- 不为知名系统各造一个 runtime：✅（UA-INV-7/10，策略＋Holon）
- 下阶段从审计依赖图机械选定：✅（G9-D 会话 2 → … → G10-A）
