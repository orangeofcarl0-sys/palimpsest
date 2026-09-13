# Palimpsest Organization Dynamics
## 从多 Agent 编排到动态 AI 组织：现状基线、动力学模型与后续路线

**文档状态**：Design Synthesis / Architecture Baseline v0.1  
**日期**：2026-09-14  
**Palimpsest 基线**：`main @ fc900879c850e14aa6977225790747c314896ce9`  
**Ordarium 基线**：`main @ 073409b418a637fc48e2e311b6fa330e7eff7281` / `ordarium-v1.3.1`  
**适用范围**：Palimpsest 后 G10-GC3 架构演化；重点固定 Organization Dynamics、RuntimeScope/Holon、联邦多主 Agent、动态组织形成与自重构方向。  
**非目标**：本文不冻结新的 TypeScript schema，不取代 `PLMP-UAS-1`、`PLMP-BIND-1`、`PLMP-AGT-0`、`PLMP-PAG-0`，也不把 DSH 的具体 wake/resume 机制升级为 Palimpsest 本体语义。

---

# 0. 核心结论

Palimpsest 不应继续被理解为“更自由的多 Agent 工作流编排器”。

它更准确的长期目标是：

> **一个用于构建、运行和演化长期 AI 人力组织的系统。**

其核心对象不是“一个任务被拆成多少 Agent”，而是大量长期或临时的认知人力点位，如何因为真实的信息、资源、责任、证据和接口依赖，从下而上形成协作、联合、组织、Holon 和 Institution。

传统 Multi-Agent 的典型因果链是：

```text
Task
  ↓
Planner
  ↓
Decomposition
  ↓
Agent A / Agent B / Agent C
```

Palimpsest 的目标应反转为：

```text
Persistent / Ephemeral Cognitive Loci
            ↓
         Local Work
            ↓
    Real Dependency Emerges
            ↓
       Collaboration
            ↓
 Coalition / Federation / Organization
            ↓
      Holon / Institution
```

因此：

```text
Agents exist before collaborations.
Collaborations emerge from real dependencies.
Hierarchy is often an interface artifact, not an ontological fact.
```

“主 Agent”也不应被视为全局权力根，而应主要理解为：

```text
HumanAttentionEndpoint
```

即当前用户所聚焦的认知入口。用户一次通常只能高带宽管理一个 Agent，这会自然形成一个“形式上的主 Agent”，但它不因此获得全局 planner、authority root 或 manager 身份。

---

# 1. 当前项目事实基线

## 1.1 Palimpsest 已经完成的核心语义

截至 `fc900879`，Palimpsest 已经不再只是 WorkGraph 系统。

当前已经存在并经过多轮 closure 的主要语义层包括：

| 领域 | 当前状态 | 代表实现 |
|---|---|---|
| Work / Project / Task / Attempt | 成熟 | EventStore、Scheduler、ProjectController |
| WorkGraph / Canvas / GraphPatch | 成熟 | `src/graph/`、`src/canvas/` |
| UAS | `PLMP-UAS-1` FROZEN | Architecture / Work / Runtime / Continuity 四维 |
| Architecture identity | 已实现最小骨架 | `ArchitectureDefinition`、`AgentDefinition` |
| Binding | 已实现 frozen core | `BindingDefinition`、BindingResolution |
| RunDefinition | 已实现 | Architecture + Work + Binding + RunConfiguration |
| Runtime identity | 已实现 | Activation、RuntimeAttachment、RuntimeCarrierPort |
| Persistent continuity | 已实现最小内核 | PersistentPoint |
| Participation | 已实现 | Invocation / Participation |
| Federation | 已实现高层 service | PeerRef、ContactNeed、Message、Wake、Ack |
| Commitment / Handoff | 已实现 | explicit acceptance + atomic transition |
| Coalition | 已实现 | derived CoalitionSnapshot |
| Organization | 已实现 | immutable revision + roles/norms/interactions |
| Organization transformations | 已实现 | REVISE / SPLIT / MERGE + proof obligations |
| Institution | 已实现 | Charter、ContinuationAuthority、Epoch lineage |
| Campaign / PAG | 已完成 production closure | Campaign、Belief、Watcher、WAIT、Wake、Reconciliation |
| CampaignCompiler | 已实现 | compiled candidate + unified admission |
| Effect safety | 由 Ordarium 提供 | Safe Actions / admission / receipts |

G10-GC3 已经冻结当前 Campaign/Wake production baseline，并完成：

```text
CompiledCampaignAction
→ strict parse
→ freshness
→ unified admission
→ exact admitted action
→ Wake completion
```

Project 与 WAIT 两个 arm 均已闭合。

因此当前 Palimpsest 的问题不再是“有没有语义积木”，而是：

> **这些积木是否已经形成一个能够自然生长和运行的 AI 组织系统。**

答案仍然是否定的。

---

## 1.2 当前真正未闭合的部分

现状最明显的特征是：

```text
Core Sophistication  >>  Product / Operational Closure
```

具体表现为：

| 能力 | 内核 | 纵向产品闭环 |
|---|---:|---:|
| Federation | 高 | 中 |
| PersistentPoint | 高 | 中 |
| Organization | 高 | 中 |
| Institution | 高 | 中 |
| Campaign | 高 | 中 |
| RuntimeScope / Holon | 未完成 | 未完成 |
| Dynamic Organization | 未完成 | 未完成 |
| Agent-facing federation tools | service 已有 | 不完整 |
| Living boundary state / 类 Spec | 语义基础已有 | 未实现 |
| MultiGraph UI | Work 图成熟 | 新语义层明显落后 |
| Danus-like reasoning cell | 可拼装 | 非一等 primitive |
| Organization diagnostics | 未实现 | 未实现 |
| Organization refactoring loop | transformation 已有 | 缺 diagnosis → proposal |

因此后续主线不应继续简单增加 ontology breadth，而应该进入：

```text
Static Semantic Entities
        ↓
Dynamic Organization Semantics
        ↓
Operational Closure
```

---

## 1.3 Federation 已经比表面上完整得多

当前 `FederationService` 已经拥有：

```text
declareContactNeed
findCandidates
requestContact
sendMessage
wakePeer
acknowledge
offerCommitment
acceptCommitment
rejectCommitment
releaseCommitment
offerHandoff
acceptHandoff
beginParticipation
endParticipation
thread
inbox
manpowerPoint
coalition
coalitionSnapshot
```

这说明联邦多主 Agent 的“社会语义”已经基本存在。

但这些能力还没有充分进入：

```text
DSH tool surface
Web / GUI
default runtime adapters
persistent main-agent experience
```

所以当前缺口更接近“器官已经存在，但没有组成一个可工作的身体”。

---

## 1.4 `ManpowerPointView` 已经接近 AI 人力点位，但仍是派生视图

当前 `ManpowerPointView` 组合：

```text
PeerRef
+ optional continuity
+ advertisement
+ active commitments
+ active participations
+ inbox
```

这个方向是正确的。

不应再新建一个 canonical `ManpowerPointId`。

更合理的原则是：

```text
AI manpower point = derived operational view
```

其中：

- `PeerRef`：协作身份；
- `PersistentPoint`：长期 continuity locus；
- `RuntimeAgent / Session`：当前承载者；
- commitments / participations / inbox：当前组织关系和活动。

也就是说：

```text
PersistentPoint ≠ PeerRef ≠ RuntimeAgent
```

但三者在产品层可以共同构成一个长期 AI 人力点位。

---

## 1.5 Ordarium 已经具备下一阶段需要的底层观测原语

Ordarium `v1.3.1` 已正式提供经过加固的 `StateChangeFeed`：

```text
revisioned management state
        ↓
global monotonic cursor
        ↓
restart-stable incremental observation
```

并提供：

- future cursor fail-closed；
- bounded page size；
- SQLite crash-durable / local-multi-process；
- filter-independent cursor；
- no agent semantics；
- no federation semantics；
- no consumer-offset ownership。

这正符合长期边界：

```text
Ordarium guarantees mechanics.
Palimpsest interprets meaning.
```

当前 Palimpsest 仍 pin Ordarium 1.2.0，因此这是明确的实现 delta，但不构成 Organization Dynamics 的核心理论问题。

---

# 2. Palimpsest 的三类 Multi-Agent 必须正式分离

未来所有设计都应该避免把“多 Agent”当作单一概念。

## 2.1 Persistent Federated Peers

代表：

```text
Palimpsest/Main
Ordarium/Main
Research/Main
Hardware/Main
```

特点：

- 长期存在；
- 不同 workspace；
- 不同历史；
- 不同局部目标；
- 不同权限；
- 不同 commitments；
- 真实信息不对称；
- peer-to-peer；
- 协作需求运行时产生。

这是最接近“真正多主体”的层级。

其动力学主要是：

```text
Need
→ Contact
→ Negotiation
→ Commitment
→ Boundary State
→ Long-lived Federation
```

默认不应该 collapse。

---

## 2.2 Collaborative Reasoning Cell

代表 Danus 型结构：

```text
Persistent reasoning locus
          │
       frontier
      /   |   \
     R1  R2   R3
      \   |   /
      admission
          ↓
   shared accepted state
```

其价值来自：

```text
Parallelism
+ Independence
+ Composable Outputs
```

而不是角色 persona。

这里的 reasoning agents 可以是真正的多个 agent，也可以是临时 activation branches。

关键判据是：

```text
local work can be independently committed
```

即每个 worker 的输出可以经过窄、可验证、可组合的接口进入共享状态。

---

## 2.3 Internal Agent Acceleration

代表：

```text
one manpower point
   ├ search branch
   ├ coding worker
   ├ visual specialist
   └ best-of-N candidate
```

目的主要是：

- context partition；
- TPS；
- 并发；
- specialization；
- candidate diversity；
- latency reduction。

其生命周期通常短：

```text
Spawn
→ Explore
→ Commit Candidate
→ Aggregate
→ Collapse
```

这类 subagents 本质上是：

```text
elastic cognitive compute
```

而不是长期组织成员。

---

# 3. Organization Dynamics 的基本定义

Organization Dynamics 不是新的 canonical store，也不是一个新 Graph 类型。

它是一套对当前运行历史进行观察、诊断、提案和治理的动态机制：

```text
Structure_t
   ↓
Flow_t
   ↓
Observed Evidence_t
   ↓
Structural Pressure_t
   ↓
Transformation Proposal
   ↓
Proof / Governance
   ↓
Structure_(t+1)
```

核心闭环为：

\[
\boxed{
Structure_t
\rightarrow
Flow_t
\rightarrow
Observation_t
\rightarrow
Diagnosis_t
\rightarrow
Proposal_t
\rightarrow
Governance_t
\rightarrow
Structure_{t+1}
}
\]

其中：

- Structure：相对慢的组织结构；
- Flow：实际运行活动；
- Diagnosis：只读推断；
- Proposal：非 canonical 候选；
- Governance：允许结构变化的正式边界；
- Structure 更新：最终 canonical transformation。

---

# 4. Structure 与 Flow 必须严格区分

## 4.1 慢变量：Structure

包括：

```text
PersistentPoint
Peer identity
OrganizationDefinition
Institution
Role
Norm
Interaction
Commitment
Boundary
RuntimeScope / Holon
```

它们定义：

> 系统在结构上“是什么”。

---

## 4.2 快变量：Flow

包括：

```text
Invocation
Participation
Message
Evidence production
Work execution
Effect
Attention
Resource use
Failure
Campaign activity
Runtime branch creation
```

它们描述：

> 系统实际“发生了什么”。

---

## 4.3 Dynamics 的关键原则

结构不能直接根据单次 flow 改变。

应该：

```text
Flow history
→ repeated pattern
→ derived structural signal
→ proposed change
```

因此：

```text
Observed collaboration ≠ Organization
```

同样：

```text
Repeated message ≠ Commitment
High traffic ≠ Authority
Frequent cooperation ≠ automatic membership
```

---

# 5. Organization Dynamics 观察的是 multiplex network，而不是单一 AgentGraph

真实 AI 组织同时存在多类关系：

\[
\mathcal G_t =
(V,
E_{info},
E_{work},
E_{commit},
E_{authority},
E_{evidence},
E_{resource},
E_{dependency})
\]

必须保持：

```text
Information Edge
≠ Commitment Edge
≠ Authority Edge
≠ Evidence Edge
≠ Work Dependency Edge
```

例如：

```text
A frequently messages B
```

只说明：

```text
E_info(A,B) is strong
```

不能推出：

```text
B belongs to A's organization
```

更不能推出：

```text
A has authority over B
```

因此未来 MultiGraph UI 可以共享 renderer，但不能共享 canonical truth schema。

---

# 6. 组织边界的核心判据：Interface Compressibility

这是 Organization Dynamics 最重要的理论判据之一。

设某个候选边界把系统分成：

\[
S \mid \bar S
\]

定义：

- \(I_{internal}\)：边界内部协同所需的信息量；
- \(I_{boundary}\)：边界外部为了正确协作必须穿越边界的信息量。

健康边界应满足：

\[
\boxed{
I_{boundary} \ll I_{internal}
}
\]

即：

> 内部复杂度可以通过窄接口向外压缩。

### 健康例子：Danus worker

内部：

```text
full proof search context
```

外部：

```text
claim
proof
dependencies
```

边界可压缩。

### 不健康例子：Planner → Reviewer → Coder

如果每个人都必须重新读取整个 repo：

```text
I_boundary ≈ I_internal
```

那么角色边界只是人为切割。

因此 Split 的第一判据不应该是：

> “工作看起来不同吗？”

而应该是：

> **“局部结果是否可以形成一个稳定、窄、可验证、可复用的接口？”**

---

# 7. Organization Dynamics 需要结构压力，而不是万能 Score

不要设计：

```text
organization_score = 0.82
```

再超过阈值就自动变换。

应该维护多个独立的 derived pressures：

\[
\Pi_t =
(
P_{merge},
P_{split},
P_{federate},
P_{encapsulate},
P_{specialize},
P_{dissolve}
)
\]

它们不是 canonical truth，只是诊断。

---

## 7.1 Merge Pressure

当：

```text
context overlap ↑
sequential dependency ↑
shared state fraction ↑
same authority ↑
same evidence ↑
independence benefit ↓
```

则：

\[
P_{merge}\uparrow
\]

典型结果：

```text
Planner + Reviewer + Coder
        ↓
Persistent Engineering Point
```

保留真正独立的 deterministic test / witness。

---

## 7.2 Split Pressure

当：

```text
internal subdomain locality ↑
parallelizable work ↑
independent lifecycle ↑
resource heterogeneity ↑
failure containment value ↑
boundary compressibility ↑
```

则：

\[
P_{split}\uparrow
\]

但 Split 仍必须进入已有：

```text
Partition
+ InterfaceSynthesis
+ ProofObligations
```

而不是 Organization Dynamics 自己直接改 canonical structure。

---

## 7.3 Federation Pressure

当两个长期点位：

```text
remain sovereign
share recurring dependencies
need stable protocols
do not benefit from identity merger
```

则：

\[
P_{federate}\uparrow
\]

此时长期稳定终态可能就是：

```text
A ↔ B
```

并不意味着它们未来一定要合并成 Organization。

---

## 7.4 Encapsulation / Holon Pressure

当一个内部结构：

```text
internal coupling high
external coupling relatively low
shared local state high
external contract stable
independent lifecycle present
```

则：

\[
P_{encapsulate}\uparrow
\]

它越来越像一个 Holon。

---

## 7.5 Dissolution Pressure

当：

```text
no active participation
no meaningful commitments
no campaign role
no external dependency
no unique capability boundary
```

长期持续时：

\[
P_{dissolve}\uparrow
\]

但必须保留：

```text
Inactivity ≠ Death
Dormant ≠ Terminated
```

不能因为暂时沉默就自动删除 durable organization。

---

# 8. 多 Agent 系统必须拥有 anti-agentification pressure

Palimpsest 不应该成为一个鼓励不断增加节点的系统。

它必须具备：

```text
Agent Pruning
Architecture Collapse
Boundary Elimination
```

例如发现：

```text
Planner
Reviewer
Coder
```

满足：

```text
same model
same workspace
same evidence
high context overlap
no authority separation
no failure-domain separation
low parallelism
```

则系统应明确提示：

> 当前三 Agent 结构缺乏独立工程边界，建议 collapse 为一个长期 Engineering Point。

这是 Palimpsest 与普通 multi-agent builder 的关键差异之一。

---

# 9. 组织形态不是升级阶梯，而是多个稳定相

不能设计成：

```text
Peer
→ Coalition
→ Organization
→ Institution
```

好像所有关系最终都会制度化。

真实系统应理解成 phase space：

| 形态 | 本质 | 典型状态 |
|---|---|---|
| Independent locus | 独立认知点位 | 长期稳定 |
| Interaction | 临时交流 | 短期 |
| Federation | 独立 peers 的持续协作 | 长期稳定 |
| Coalition | 围绕目的的临时合作 | 中期 |
| Organization | 显式角色/规范/interaction structure | 长期 |
| Holon | runtime 上对外统一的递归组织边界 | 中长期 |
| Institution | identity + charter + continuation | 超长期 |

因此：

```text
Federation
```

可以是长期终态，而不是“不成熟 Organization”。

---

# 10. 多时间尺度动力学

Organization Dynamics 是典型多时间尺度系统：

\[
\tau_{activation}
\ll
\tau_{collaboration}
\ll
\tau_{organization}
\ll
\tau_{institution}
\]

大致对应：

```text
Activation / Branch          秒—小时
Collaboration / Coalition    分钟—天
Organization                 天—月
Institution                  月—年
```

因此不能由一个 Scheduler 统一决定。

至少要逻辑区分：

### Execution Loop

```text
Work
→ Attempt
→ Evidence
→ Next Work
```

### Collaboration Loop

```text
Need
→ Contact
→ Message
→ Commitment
```

### Organization Loop

```text
Observed patterns
→ Diagnosis
→ Structural proposal
→ Transformation
```

### Continuity Loop

```text
Campaign / Institution
→ Dormancy
→ Wake
→ Reconciliation
→ Evolution
```

这些 loop 可以互相产生输入，但不能互相吞并语义。

---

# 11. Hysteresis：防止组织结构抖动

Organization Dynamics 必须有 hysteresis。

否则：

```text
today: merge
tomorrow: split
next day: merge
```

组织结构会震荡。

原则应为：

```text
short-lived pattern
→ coalition / temporary scope

persistent stable pattern
→ organization proposal
```

而 Organization 一旦正式存在，应需要明显更强的反向证据才能 dissolve / split。

即：

\[
Threshold_{create}
\neq
Threshold_{remove}
\]

这种非对称阈值用于稳定长期结构。

---

# 12. RuntimeScope 与 Holon：G10-H 的正确目标

G10-H 不应只是：

> 增加 RuntimeScope type、Holon type、parser、store。

它应该解决：

\[
\boxed{
Make recursive AI organizations executable.
}
\]

核心问题：

1. 一个 Organization 如何对应真实 runtime boundary？
2. 哪些 runtime actors 属于同一个 scope？
3. 哪些 state 是 scope-local？
4. 哪些 orchestration policies 在 scope 内生效？
5. 哪些 interactions 能穿过 boundary？
6. 一个内部多 Agent 系统如何对外表现成一个 peer？
7. 内部成员变化时，何时需要改变外部 identity？
8. 内部变化何时可以完全不通知外界？

---

## 12.1 Holon 的核心性质

Holon 应满足：

```text
InternalPlurality
→ ExternalUnity
```

例如：

```text
Ordarium Holon
├ Main
├ Coding Worker 1
├ Coding Worker 2
└ Verifier
```

对 Palimpsest 外部可能只暴露：

```text
PeerRef: ordarium
Capabilities
BoundaryPorts
Commitments
```

外部无需知道内部的所有 runtime actors。

---

## 12.2 Holon 的真正核心是 boundary behavior

成员列表不是 Holon 的核心。

更重要的是：

\[
\partial H
\]

即：

```text
accepted inputs
provided outputs
interaction protocols
commitments
exposed capabilities
representation policy
effect constraints
```

于是内部变化：

\[
H_t \rightarrow H_{t+1}
\]

只要保持：

\[
BoundaryBehavior(H_{t+1})
\preceq
BoundaryContract(H_t)
\]

就可以低成本发生。

只有当 boundary contract 本身改变，才需要跨 peer negotiation。

---

# 13. Sovereignty Boundary：传统 Subagent 与真正 Peer 的统一原则

可以固定一条非常重要的系统原则：

\[
\boxed{
Control within a sovereignty boundary;
coordination across sovereignty boundaries.
}
\]

同一 Holon 内部：

```text
orchestration
spawn
assign internal work
change concurrency
change model binding
```

可以相对直接。

不同长期 Peer / Holon 之间：

```text
request
proposal
counterproposal
commitment
handoff
```

只能 coordination。

不能存在：

```text
assignPeerToTask()
forceRemoteAgent()
```

这种把 peer 降格为 subordinate 的默认语义。

---

# 14. Main Agent 的动态角色必须继续拆分

在 Organization Dynamics 中至少要区分：

```text
UserFocus
ExternalRepresentative
AuthorityHolder
```

它们可能暂时由同一 Agent 承担，但绝不等价。

因此：

```text
Main Agent
```

最多是一种 UI / focus 概念。

未来 Holon 如果需要对外代表权，应该有独立 representation policy，而不是默认：

```text
mainAgentId = representative = authority root
```

---

# 15. Organizational Drift

定义：

```text
DeclaredStructure ≠ ObservedStructure
```

例如 OrganizationDefinition 声明：

```text
A ↔ B
A ↔ C
```

但长期运行后实际：

```text
A ↔ B weak
B ↔ C strong
A ↔ C inactive
```

Palimpsest 应检测：

```text
OrganizationalDrift
```

但不能自动修改 OrganizationDefinition。

正确闭环：

```text
Observed Drift
→ Diagnosis
→ Transformation Proposal
→ Proof / Governance
→ Explicit Activation
```

---

# 16. Shadow Organization

当多个独立 Peer 长期表现出：

```text
recurring collaboration
stable role specialization
shared boundary state
repeated commitments
external behavioral unity
```

但没有正式 OrganizationDefinition，则出现：

```text
Shadow Organization
```

系统可以建议：

> 是否 formalize？

但仍然不能自动 promotion。

---

# 17. Zombie Organization

当 canonical Organization 长期存在，但：

```text
no participation
no active commitments
no campaigns
no meaningful dependencies
no runtime realization
```

则可能形成：

```text
Zombie Organization
```

系统应提出：

```text
revise / dissolve / retain-as-dormant
```

而不是自动删除。

---

# 18. Coordination Bottleneck

图结构可以用于发现认知瓶颈。

例如：

```text
    A
  / | \
 B  C  D
```

如果所有信息都经过 A：

```text
betweenness(A) ↑
context load(A) ↑
latency ↑
```

则可能需要：

```text
shared boundary state
direct B ↔ C collaboration
encapsulation into a Holon
```

这是真正有意义的 Graph Analytics。

---

# 19. 过度共享也是组织病

另一个极端：

```text
A ↔ B ↔ C ↔ D
everyone sees everything
```

会导致：

```text
InformationDuplication ↑
ContextCost ↑
ErrorCorrelation ↑
Herding ↑
```

因此：

```text
HighCommunication ≠ GoodOrganization
```

高质量组织往往追求：

\[
\boxed{
Low Communication
+
High Shared-State Quality
}
\]

Danus 的强项正是 worker 不需要持续互相聊天。

---

# 20. LivingSpec / Boundary State 的动力学位置

跨长期 Peer 的“类 spec”应理解为：

\[
\boxed{
BoundaryState_{A,B}(t)
}
\]

它不是：

```text
Work
Conversation
Evidence
Commitment
```

而是长期边界共享记忆：

```text
current requirements
accepted interface
constraints
assumptions
open questions
candidate revisions
compatibility state
```

因此应保持：

```text
Conversation
≠ SharedBoundaryState
≠ Commitment
≠ Evidence
```

未来可能出现：

```text
VersionedCollaborationArtifact
```

但当前不应提前冻结 schema。

推荐做法是先让真实 Palimpsest/Main ↔ Ordarium/Main 协作若干轮，再由实际产生的对象反推格式。

---

# 21. Danus-like Reasoning Cell 在动力学中的位置

Danus 类结构可以理解为一个 temporary / specialized cognitive Holon：

```text
ReasoningCell
├ worker A
├ worker B
├ worker C
└ verifier
```

内部动力学：

```text
Frontier
→ Parallel Exploration
→ Candidate
→ Admission
→ Shared Accepted State
→ Updated Frontier
```

外部只需要看到：

```text
capability
accepted outputs
current state
```

因此：

```text
Holon(Danus Cell) ∈ PeerUniverse
```

这为递归多 Agent 组织提供了统一结构。

---

# 22. Recursive Organization

最终任意尺度的系统都可以对外表现成一个 point：

```text
single persistent agent
```

可以是 peer。

```text
reasoning swarm
```

可以是 peer。

```text
whole project team
```

可以是 peer。

```text
institution
```

也可以参与更高层 federation。

因此：

\[
\boxed{
Holon(H) \in PeerUniverse
}
\]

内部复杂度对外部并不重要。

这正是 Palimpsest 能从“小型多 Agent 工具”扩展为组织计算系统的关键。

---

# 23. Organization Dynamics Engine 的责任分解

这里是逻辑责任，不要求做成五个 class。

## 23.1 Observer

从既有 truth stores / histories 读取：

```text
Work history
Coordination history
Participation
Commitments
Campaign activity
Runtime observations
Organization revisions
Institution epochs
Effect receipts
```

只读。

---

## 23.2 Diagnostician

识别：

```text
over-fragmentation
merge pressure
split pressure
shadow organization
organizational drift
zombie structure
coordination bottleneck
over-sharing
boundary leakage
duplicate capability locus
```

仍然只读。

---

## 23.3 Proposer

输出：

```text
REVISE
SPLIT
MERGE
FORMALIZE
DISSOLVE
ENCAPSULATE
FEDERATE
COLLAPSE
```

Proposal 不是 canonical truth。

---

## 23.4 Evaluator

执行：

```text
counterfactual analysis
historical comparison
proof-obligation generation
risk assessment
interface compressibility test
authority impact analysis
```

---

## 23.5 Governor

最后才决定是否进入已有 Organization Transformation / Institution Governance。

因此：

```text
Observation
≠ Diagnosis
≠ Proposal
≠ Activation
```

---

# 24. 与现有 G10-F Transformation 的关系

G10-F 已经拥有正式变换管线：

\[
T=(r,\beta,\chi,PO,E)
\]

可理解为：

```text
r   rationale
β   boundary
χ   change
PO  proof obligations
E   evidence
```

Organization Dynamics 不应该复制它。

更合理的关系是：

```text
Organization Dynamics
→ produces rationale + runtime evidence + candidate structure

G10-F Transformation
→ proves legality / interface sufficiency

Governance
→ activates canonical revision
```

因此：

```text
Dynamics proposes.
Transformation proves.
Governance activates.
```

---

# 25. Counterfactual Organization Evaluation

Organization Dynamics 不能只看历史。

它应该能够比较：

```text
Current Architecture
vs
Candidate Architecture
```

例如：

```text
current:
Planner + Reviewer + Coder

candidate:
Persistent Engineering Point
+ deterministic tests
+ independent security witness
```

对历史运行进行 replay / simulation：

```text
which communication disappears?
which parallelism is lost?
which evidence independence changes?
which authority separation changes?
what token/latency delta is expected?
```

形成：

```text
Counterfactual Organization Evaluation
```

这比“LLM 觉得应该拆三个 Agent”可靠得多。

---

# 26. Structural Changes 应被视为实验

任何正式：

```text
SPLIT
MERGE
REVISE
ENCAPSULATE
```

都应该产生组织经验：

```text
before metrics
rationale
proof obligations
transformation
after metrics
unexpected consequences
```

长期形成：

```text
OrganizationMemory
```

它记录的不是聊天，而是：

> 什么组织变换在什么条件下有效。

最终 Auto Architecture 应主要依赖这种经验，而不是 prompt intuition。

---

# 27. Organization Health 应观察什么

未来 Palimpsest 应能回答：

```text
哪些 boundary context transfer 过高？
哪些 Agent 高度相关却被重复运行？
哪些 Peer 已形成稳定 federation？
哪些 declared organization 已与现实 drift？
哪些 Holon 内部实现正在泄漏到外部？
哪些 commitment 经常被重谈？
哪些 Agent 成为 coordination bottleneck？
哪些结构长期没有任何真实活动？
哪些边界缺乏独立 failure-domain 价值？
哪些用户操作其实可以下放为局部自治？
```

这些才是组织 debugger 的核心问题。

---

# 28. 组织性能是 Pareto 问题

不能只优化最终 answer quality。

至少同时观测：

```text
Quality
Reliability
Latency
TokenCost
CoordinationCost
ContextTransferCost
FailureCorrelation
HumanEscalationRate
RecoveryCost
BoundaryStability
```

因此：

\[
A^* =
\arg\min_A
(Cost + \lambda Latency + \mu CoordinationCost)
\]

subject to：

\[
P(\text{business invariant violation}) < \epsilon
\]

Agent 数量只是优化变量，不是目标。

---

# 29. Human 的位置

随着 Organization Dynamics 增强，Human 不应该继续承担：

```text
message router
task decomposer
status poller
cross-agent sync operator
```

系统应逐步吸收这些机械负担。

Human 更接近：

```text
Constitutional
Value
High-impact Governance
Escalation
```

即：

- 组织最终追求什么；
- 高影响结构变化是否允许；
- 哪些 authority 永远不能自动下放；
- 两个合理但冲突的产品方向如何选择；
- institution purpose / charter 的根本变化。

目标不是去掉人，而是：

```text
HumanOperationalLoad ↓
HumanConstitutionalControl preserved
```

---

# 30. Ordarium 在 Organization Dynamics 中的边界

Ordarium 应越来越强，但语义上越来越克制。

它负责：

```text
idempotency
CAS
fencing
leases
revision
durable observation
authorization
effect admission
receipts
crash recovery
```

它不负责：

```text
who should collaborate
what is a commitment
what is an organization
which claim is true
who should become a Holon
whether two Agents should merge
```

固定原则：

```text
Ordarium guarantees mechanics.
Palimpsest interprets social and cognitive meaning.
```

---

# 31. DSH / Host 的位置

DSH / Pi / 其他 host 负责：

```text
actual model invocation
runtime carrier
session lifecycle
tool execution environment
resume / wake / follow-up mechanics
```

这些是 carrier integration。

Organization Dynamics 不应依赖某一种具体 host API 才成立。

因此：

```text
Attention ≠ Collaboration
Host Wake ≠ Organization Semantics
```

具体唤醒入口可以通过 DSH 插件、现有 hook 或 Pi 实验实现，但这是实现层问题，而不是 Palimpsest 总体愿景的中心。

---

# 32. Graph 的最终角色

Palimpsest 不应退化成一个更自由的 no-code Agent Canvas。

Graph 应成为：

```text
AI Organization Debugger
```

而不是：

```text
Workflow Program
```

未来应支持多种 graph species：

```text
Work
Architecture
Organization
Collaboration
Runtime
Campaign
Evidence
```

并支持叠加：

```text
Definition
Runtime
History
Authority
Evidence
```

例如顶层：

```text
Palimpsest  ⇄  Ordarium
```

点击边：

```text
2 active commitments
1 unresolved interface issue
last interaction: 3m
compatibility evidence: PASS
```

再 zoom：

```text
Ordarium Holon
├ Main
├ Coding Branch
└ Verifier
```

再 zoom：

```text
Attempt A52
Worktree ...
```

这才是 Graph 的长期价值。

---

# 33. Graph Editing / Emergence / Refactoring

Palimpsest 应同时支持：

## Graph Editing

用户或 Agent 显式声明结构。

## Graph Emergence

真实 collaboration / participation / commitment history 自然产生关系投影。

## Graph Refactoring

系统基于运行证据提出：

```text
split
merge
collapse
formalize
dissolve
encapsulate
```

未来真正独特的是后二者，而不是“节点可以随便拖”。

---

# 34. 推荐后续路线

## G10-H — RuntimeScope & Holon Grounding

目标：

> **Make recursive AI organizations executable.**

必须证明：

```text
one Agent may internally expand into many runtime actors

one collaborative cell may externally behave as one peer

an Organization may own a runtime scope

internal membership can change while external identity remains stable

external interaction does not require visibility into every internal actor

scope-local state / policy / lifecycle are explicit

boundary behavior is first-class
```

### G10-H 不应做

```text
managerAgentId
workers[]
```

式层级化偷懒。

也不要因为实现简单就重新把：

```text
Organization = RuntimeGroup = AgentGraph
```

混在一起。

---

## G10-I — Organization Dynamics

建议单独成为下一大 campaign。

第一版只做：

```text
Observe
→ Diagnose
→ Propose
```

不自动改任何 Organization。

### G10-I 第一阶段能力

建议优先：

```text
OrganizationObservationSnapshot
StructuralDiagnostics
MergePressure
SplitPressure
FederationPressure
EncapsulationPressure
DriftDetection
ShadowOrganizationDetection
ZombieStructureDetection
CoordinationBottleneckDetection
TransformationProposal
```

这些主要应为 derived / read-only。

真正 canonical mutation 继续复用 G10-F transformation/governance。

---

# 35. G10-I 的首批机器证明建议

应至少证明：

### OD-A01 — No automatic promotion

高 collaboration volume 不得自动创建 Organization。

### OD-A02 — No automatic merge

高 context overlap 只能产生 proposal。

### OD-A03 — No authority inference

communication / participation / focus 不得推导 effect authority。

### OD-A04 — No WorkGraph collapse

Organization diagnosis 不得修改 WorkGraph。

### OD-A05 — Evidence-grounded proposal

结构 proposal 必须引用明确的 observation basis。

### OD-A06 — Historical basis

同一运行历史得到同一 deterministic structural snapshot。

### OD-A07 — Stale proposal refusal

basis 已变化的 transformation proposal 不得直接 activation。

### OD-A08 — Hysteresis

短期 spike 不得与长期稳定模式等价。

### OD-A09 — Boundary compressibility

SPLIT proposal 必须至少提供 interface-sufficiency / compressibility 证据。

### OD-A10 — Merge independence loss

MERGE proposal 必须显式报告将失去的 authority/evidence/failure-domain independence。

### OD-A11 — Federation is stable

系统不得假定 recurring peer collaboration 必须升级为 Organization。

### OD-A12 — Holon opacity

内部 runtime reconfiguration 在不改变 boundary contract 时不得自动造成外部 identity change。

---

# 36. Palimpsest × Ordarium 应作为 Organization Dynamics 第一真实实验

两仓已经构成天然的长期 Peer：

```text
Palimpsest/Main
↔
Ordarium/Main
```

特点：

```text
different repos
different histories
different responsibilities
different authority
strong long-term interface dependency
high need for active feedback
low justification for identity merger
```

因此它们应主要成为：

```text
Stable Federation
```

而不是一个 Organization 中的 manager/subordinate。

它们适合验证：

```text
Living boundary state
recurring commitments
interface negotiation
compatibility evidence
structural drift
coordination cost
federation stability
```

同时，两仓内部各自仍然可以使用传统 subagent / reasoning cell。

这正好展示三层 multi-agent 可以同时存在。

---

# 37. 最终动态闭环

Organization Dynamics 的最终完整闭环可以固定为：

```text
Persistent AI Loci
        ↓
Local Autonomous Work
        ↓
Real Dependencies Emerge
        ↓
Peer Collaboration
        ↓
Commitments / Boundary State
        ↓
Temporary Coalitions / Stable Federations
        ↓
Observed Structural Patterns
        ↓
Organization Diagnostics
        ↓
Transformation Proposal
        ↓
Proof Obligations + Governance
        ↓
OrganizationDefinition Revision
        ↓
RuntimeScope / Holon
        ↓
Internal Adaptation
        ↓
External Behavior
        ↓
New Runtime Observations
        ↺
```

更慢的 continuity loop：

```text
Organization Revisions
        ↓
Institution Epochs
        ↓
Campaigns Survive Revisions
        ↓
World Changes
        ↓
Wake / Reconcile
        ↓
Organization / Runtime Adaptation
        ↺
```

---

# 38. Palimpsest 的最终定位

推荐长期产品定义：

> **Palimpsest is an operating environment for building, running, observing and evolving organizations of persistent AI workers.**

中文：

> **Palimpsest 是一个用于构建、运行、观测和演化长期 AI 人力组织的系统。**

这比：

```text
multi-agent orchestration framework
```

更符合当前已经形成的内核，也更能区分传统 no-code agent workflow builder。

---

# 39. 最终设计原则

可以把整套 Organization Dynamics 固定成以下原则：

```text
OD-P01  Agents exist before collaborations.

OD-P02  Collaborations emerge from real dependencies.

OD-P03  UserFocus ≠ AuthorityRoot.

OD-P04  Persistent peer collaboration ≠ subagent orchestration.

OD-P05  Control within sovereignty boundaries;
        coordination across sovereignty boundaries.

OD-P06  Work decomposition ≠ Agent decomposition.

OD-P07  Branch ≠ Durable Agent.

OD-P08  A split requires an interface that compresses internal state.

OD-P09  A merge must account for lost independence.

OD-P10  High communication is a cost signal, not a success metric.

OD-P11  Federation is a valid stable organizational phase.

OD-P12  Coalition ≠ Organization ≠ Holon ≠ Institution.

OD-P13  Internal plurality may expose external unity through a Holon.

OD-P14  Internal structural change is cheap while external contracts remain valid.

OD-P15  Observed structure ≠ canonical OrganizationDefinition.

OD-P16  Organization Dynamics proposes;
        Transformation proves;
        Governance activates.

OD-P17  Structural proposals must be evidence- and basis-grounded.

OD-P18  Long-lived structure changes slower than runtime activity.

OD-P19  Organization evolution requires hysteresis.

OD-P20  Palimpsest must be able to recommend removing Agents.

OD-P21  Graph is an organizational projection/debugger, not the universal truth store.

OD-P22  Ordarium owns reliable mechanics, not social/cognitive meaning.

OD-P23  Host runtime owns model/session execution, not Organization semantics.

OD-P24  Human operational routing should decrease;
        human constitutional governance remains.

OD-P25  Multi-Agent value comes from parallelism, independence,
        heterogeneity, locality, containment and composability —
        never Agent count by itself.
```

---

# 40. 当前最重要的阶段转换

Palimpsest 已经基本完成：

```text
“有哪些实体，以及它们不能被混淆为什么”
```

下一阶段应该集中解决：

```text
“这些实体在真实长期运行中如何形成结构、改变结构、隐藏内部复杂度、
暴露稳定边界，并在不可靠认知组件之上维持一个可演化的组织。”
```

因此当前主线应从：

```text
Static Semantic Entity Engineering
```

切换到：

```text
Dynamic Organization Semantics
```

最终目标不是“更多 Agent”。

而是：

\[
\boxed{
\textbf{A self-observing, governably self-refactoring AI organization substrate}
}
\]

其中：

- `self-observing`：从真实运行历史而非 persona 假设理解组织；
- `self-refactoring`：能够提出 split / merge / collapse / federation / encapsulation；
- `governably`：随机模型只能提出结构假设，不能绕过 proof、authority 和 governance；
- `AI organization substrate`：支持长期 peers、reasoning cells、subagents、Holons、Organizations 和 Institutions 在同一套语义体系中递归存在。

这应作为 Palimpsest 后 G10-GC3 阶段的总体愿景基线。

---

# Appendix A — 当前基线代码/文档映射

以下路径是本文现状判断的主要事实来源：

```text
docs/engineering/UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md
docs/engineering/G10-E-PARTICIPATION-FEDERATED-WORKFORCE-CAMPAIGN.md
docs/engineering/G10-F-ORGANIZATION-DURABLE-INSTITUTION-CAMPAIGN.md
docs/engineering/G10-G-CAMPAIGN-EPISTEMIC-WAKE-CAMPAIGN.md
docs/engineering/G10-GC3-UNIFIED-NEXT-ACTION-ADMISSION-CLOSURE.md

src/architecture/definition.ts
src/binding/contract.ts
src/run/definition.ts
src/runtime/identity.ts
src/runtime/carrier_port.ts
src/continuity/point.ts
src/federation/peer.ts
src/federation/messages.ts
src/federation/messaging.ts
src/federation/federation_service.ts
src/federation/workforce.ts
src/federation/commitment_service.ts
src/install.ts
src/tools/tools.ts
src/tools/dsh_types.ts
web/src/App.tsx
```

Ordarium 当前相关事实来源：

```text
main @ 073409b418a637fc48e2e311b6fa330e7eff7281
ordarium-v1.3.1

docs/research/ORD-BOOT-0-state-change-feed-spec.md
docs/research/ORD-BOOT-0.1-state-change-feed-hardening-spec.md
```

---

# Appendix B — 当前实现状态分类

```text
IMPLEMENTED / FROZEN
  Work
  WorkGraph
  Runtime identity
  PersistentPoint
  Federation core
  Commitment
  Handoff
  Coalition
  Organization
  Organization Transformation
  Institution
  Campaign
  Epistemic Continuity
  Prospective Memory / WAIT
  Wake / Reconciliation
  CampaignCompiler
  Unified Next-Action Admission

PARTIAL / NEEDS VERTICAL CLOSURE
  manpower-point assembly
  peer ↔ persistent continuity product wiring
  agent-facing federation surface
  real long-lived main-agent experience
  LivingSpec / boundary memory
  organization/campaign/federation UI
  default transport/host adapters

NEXT MAJOR ARCHITECTURAL FRONTIER
  RuntimeScope
  Holon
  Recursive runtime organization

NEXT DYNAMICS FRONTIER
  Organization Observation
  Structural Diagnosis
  Split/Merge/Federation/Encapsulation pressure
  Shadow Organization
  Drift
  Zombie Structure
  Coordination Bottleneck
  Counterfactual Organization Evaluation
  Transformation Proposal

FUTURE / EVIDENCE-DRIVEN
  generalized non-Project WorkDefinition
  automated organization experimentation
  learned organization priors
  cross-machine federation
  organization-level empirical optimizer
```

---

# Appendix C — 一句话路线

```text
G10-H:
Make recursive organizations executable.

G10-I:
Make organizations observable and diagnosable.

Later:
Make organization changes empirically optimizable —
without turning stochastic proposals into uncontrolled structural mutation.
```
