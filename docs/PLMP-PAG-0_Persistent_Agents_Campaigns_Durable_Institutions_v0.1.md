# PLMP-PAG-0 — Persistent Agents, Long-Horizon Campaigns and Durable Institutions

> **Document ID**: `PLMP-PAG-0`  
> **Status**: **FROZEN / 理论基线冻结**  
> **Version**: `0.1`  
> **Date**: `2026-09-08`  
> **Companion specification**: `PLMP-AGT-0 — AgentGroup Theory v0`  
> **Scope**: Persistent Agents / Long-Horizon Campaigns / Durable Institutions / Evidence-Governed Continuity / Palimpsest  
> **Purpose**: 冻结“长期智能主体如何跨越一次次可替换运行而保持连续存在、维持长期承诺、积累和修订认识、休眠与唤醒、开展真实长期尝试并形成耐久机构”的理论语义。  
> **Authority**: 本文仅冻结理论对象、状态语义和工程红线，不自动改变现有 Palimpsest `ProjectIR / AgentGraph / Scheduler / Task / Attempt / Evidence / RuntimeSubgraph` schema。任何工程落地必须另立实施规格。  
> **Normative language**: `MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 具有规范性含义；其余为解释性内容。

---

# 0. Executive Summary

本文冻结以下核心结论。

## 0.1 `PLMP-AGT-0` 与 `PLMP-PAG-0` 是两根正交理论轴

`PLMP-AGT-0` 主要描述：

\[
\boxed{
\text{Spatial / Organizational Composition}
}
\]

即：

- 谁和谁组成组织；
- Role / Capability / Holon / RuntimeScope；
- Group boundary；
- composition；
- transformation。

本文 `PLMP-PAG-0` 描述：

\[
\boxed{
\text{Temporal / Epistemic Continuity}
}
\]

即：

- 什么东西穿过时间仍是同一个 Agent/Institution；
- 睡眠、唤醒、迁移、epoch；
- 为什么长期目标仍在追；
- 证据如何累积；
- belief 如何修改；
- 什么时候应等待、放弃、继续；
- 内部成员全部替换后为何主体仍可连续。

二者共同组成：

\[
\boxed{
DurableAgentSystem
=
AGT
\times
PAG
}
\]

真正的交点不是“一直运行的进程”，而是：

\[
\boxed{
\textbf{Durable Cognitive Institution}
}
\]

## 0.2 Persistent Agent 不是 Persistent Conversation

本文冻结：

\[
\boxed{
PersistentAgent
\neq
PersistentContextWindow
}
\]

长期主体的连续性不能由：

```text
旧聊天
→ summary
→ vector DB
→ 下次重新塞 prompt
```

来定义。

真正 continuity-bearing substrate 至少包括：

```text
stable identity
authorized lineage
commitments
evidence/provenance
epistemic state
campaign state
wake/prospective state
continuation authority
versioned charter/body/policy
```

当前：

```text
model
harness
host
prompt context
working memory
hidden CoT
```

均不是 identity kernel。

## 0.3 Agent existence 与 Activation 分离

本文冻结：

\[
\boxed{
AgentEntity
\neq
Activation
\neq
Intervention
}
\]

一个长期主体可以经历：

\[
\alpha_1(P),\alpha_2(P),\ldots,\alpha_n(P)
\]

很多次 activation。

某次 activation 被 kill / evict / checkpoint：

\[
\not\Rightarrow
Agent\ death
\]

这与 virtual actor / durable entity 思想一致。

## 0.4 长期目标的顶层对象不是 Project，而是 Campaign

`Project` 适合：

```text
known scope
finite deliverable
finite plan
completion expected
```

长期真实研究/工程目标通常不满足这些条件。

本文冻结：

\[
\boxed{
PersistentAgent
\supset
Campaign
\supset
Project/Plan
\supset
Task
\supset
Intervention
}
\]

Campaign 是：

> 围绕一个长期 commitment，在变化世界中持续形成假设、执行干预、积累证据、修订认识并反复生成阶段性 Project/Plan 的开放式活动。

Project 可以失败或被废弃，而 Campaign 仍继续。

## 0.5 Evidence History 与 Current Belief State 必须分离

本文冻结：

\[
\boxed{
EvidenceHistory
\neq
CurrentBeliefState
}
\]

Evidence history 应接近 append-only historical record。

Belief / hypothesis state 必须：

\[
\boxed{
non\text{-}monotonic
}
\]

可以因新证据、矛盾、失效校准或世界变化而修改。

## 0.6 Dormant 不等于 Dead

本文冻结生命周期：

```text
DORMANT
→ WAKING
→ RECONCILING
→ ACTIVE
→ QUIESCING
→ DORMANT
```

以及可选：

```text
MIGRATING
SUSPENDED
QUARANTINED
FORKED
TERMINATED
```

\[
\boxed{
DORMANT\neq TERMINATED
}
\]

## 0.7 Wake 不等于 Replay

长期 Agent 睡眠期间世界持续变化，因此 Wake MUST 包含：

\[
\boxed{
Rehydrate
+
ContinuityCheck
+
WorldReconciliation
+
EvidenceRefresh
+
BeliefRevision
+
CommitmentReconsideration
+
PlanCompilation
}
\]

不得仅：

```text
load old state
→ continue old plan
```

## 0.8 长期尝试不是简单 Retry，而是 Epistemic Intervention

长期 Campaign 中必须区分：

\[
\boxed{
OperationalOutcome
\neq
EpistemicOutcome
}
\]

例如实验成功执行并否定核心假设：

```text
OperationalOutcome = COMPLETED
EpistemicOutcome   = STRONG_REFUTATION
```

这不是失败尝试，而可能是高价值进展。

## 0.9 Persistent Agent 允许战略性等待

本文冻结：

\[
WAIT
\]

为合法 action。

若：

\[
VOA(WAIT)>
VOA(a),\quad\forall a\neq WAIT
\]

Agent SHOULD 进入 dormant，并安装 future wake condition。

## 0.10 最终顶层架构

```text
Durable Cognitive Institution
│
├── Identity / Lineage / Charter / Authority
│
├── Commitment Registry
│
├── Campaigns
│   ├── Hypothesis branches
│   ├── Evidence
│   ├── Plans / Projects
│   └── Intervention history
│
├── Epistemic State
├── Provenance
├── Prospective Memory / Watchers
├── Epoch Chain
│
└── CampaignCompiler
      ↓
   ProjectIR / AgentGraph
      ↓
   Scheduler / Task / Attempt / Ordarium
      ↓
   Outcomes + Evidence
      ↑
   Epistemic ingestion
```

现有 Palimpsest 可以作为这一系统的 **short-horizon execution engine**，无需被推翻。

---

# 1. Scope

本文冻结：

- PersistentAgent；
- Activation / Incarnation；
- Intervention；
- Epoch；
- Campaign；
- Project / Plan 的长期位置；
- commitment / intention；
- sleep / wake；
- prospective memory / watcher；
- continuation authority；
- migration / fork；
- evidence / belief / provenance；
- hypothesis branching；
- bitemporal knowledge；
- long-horizon action selection；
- WAIT；
- DurableHolon；
- DurableInstitution；
- CampaignCompiler；
- 与 Palimpsest 当前内核的映射；
- literature lineage；
- research hypotheses。

# 2. Non-Goals

本文 **不**：

- 实现通用 AGI；
- 规定长期 Agent 必须连续运行；
- 规定唯一 memory database；
- 规定唯一 belief-revision calculus；
- 强制所有知识转为 Bayesian probability；
- 强制所有长期目标转为 POMDP；
- 规定唯一 agent personality；
- 把 hidden CoT 视为 durable identity；
- 在当前 Palimpsest 内立即增加所有 schema；
- 把现有 ProjectIR 作废；
- 把最新 2026 persistent-agent preprints 视作已经成熟的经典理论基础。

---

# 3. Literature Lineage

本文主要依赖五类经典理论以及一类新兴工程线。

## 3.1 Virtual / Persistent Actor

关键思想：

\[
\boxed{
stable\ logical\ identity
\neq
in\text{-}memory\ activation
}
\]

Microsoft Orleans 的 virtual actor / grain：

- grain 有稳定、application-defined identity；
- activation 可按需生成；
- idle activation 可被移出内存；
- 后续调用可重新 activation；
- durable state 可恢复。

这为 PersistentAgent 的 **entity vs activation** 分离提供成熟工程类比。

## 3.2 Durable Execution / Event Sourcing

Temporal 等系统提供：

- durable event history；
- crash recovery；
- deterministic replay；
- timer；
- workflow chain；
- Continue-As-New。

尤其 Continue-As-New 证明：

\[
\boxed{
persistent\ identity
\neq
one\ infinite\ execution\ history
}
\]

一个 durable entity 可以保持同一个业务 identity，但分成多个有限 execution/epoch。

## 3.3 BDI / Persistent Intention

Cohen & Levesque 1990：

**Intention is choice with commitment**

强调：

- intention 不是普通 goal；
- agent 对 goal 有 commitment；
- commitment 有合理 drop condition；
- belief / goal / action / intention 之间存在规范关系。

长期 Agent 的 commitment layer 直接与此对齐。

## 3.4 Truth Maintenance / Belief Revision

Jon Doyle 的 TMS：

- 记录 belief 的 reasons；
- contradiction 时修订 belief set；
- dependency-directed backtracking；
- explanation。

de Kleer 的 ATMS：

- assumption sets；
- 多 context 并存；
- inconsistent information；
- 同时探索多个 candidate solutions。

长期 Campaign 的 hypothesis branch 与 epistemic dependency graph 与此高度对齐。

## 3.5 Scientific Discovery / Self-Driving Laboratories

Robot Scientist / autonomous science / SDL 提供了：

\[
Hypothesis
\rightarrow
Experiment
\rightarrow
Observation
\rightarrow
Analysis
\rightarrow
UpdatedHypothesis
\]

闭环。

2026 SDL review 强调下一阶段需要：

- scalability；
- generalizability；
- provenance-complete experimentation。

因此 Long-Horizon Campaign 比 software DAG 更接近真实自主科研。

## 3.6 Emerging Persistent-Agent Architecture

截至本文冻结日期 2026-09-08，出现了数篇非常直接的 persistent-agent preprints：

### Runtime-Independent Persistent Agents

提出 continuity-bearing substrate：

\[
P_t=(I_t,M_t,B_t)
\]

以及：

```text
quiesce
→ checkpoint
→ validate
→ bind
→ rehydrate
→ resume
```

迁移协议。

### Continuity Kernel

强调：

> storage retention 不足以定义 authoritative continuity。

提出：

```text
candidate
→ validate predecessor / authority / freshness
→ Commit / Reject / Quarantine / Defer
```

只有 Commit 才推进 authoritative branch head。

### Pera

把传统 bounded-task agent 与 long-lived persistent assistance 区分，强调持续感知：

```text
episodic executions
internal context
environment changes
```

并由这些 perception 构造 lifecycle tasks。

这些工作与本文方向高度接近，但均为非常新的 2026 preprints，本文将其标为：

> **Emerging alignment / trend evidence**

而不是经典理论的唯一来源。

---

# 4. Persistent-Agent Ontology

本文冻结以下基本对象：

```text
DurableInstitution
    │
    ├── PersistentAgent / DurableHolon
    │
    ├── Campaign
    │     ├── Epoch-spanning state
    │     ├── Project / Plan
    │     │     ├── Task
    │     │     └── Intervention
    │     ├── Hypothesis branches
    │     └── Evidence
    │
    ├── Commitment Registry
    ├── Epistemic State
    ├── Provenance
    ├── Watch Registry
    └── Governance / Continuation Authority
```

# 5. PersistentAgent

## 5.1 Definition

本文定义：

\[
\boxed{
P_t=
(
I,
\Lambda_t,
B_t,
J_t,
E_t,
K_t,
C_t,
W_t,
A_t
)
}
\]

其中：

| 符号 | 含义 |
|---|---|
| \(I\) | stable identity |
| \(\Lambda_t\) | authorized lineage / epoch history |
| \(B_t\) | versioned body / charter / policies |
| \(J_t\) | intentions / commitments |
| \(E_t\) | evidence + provenance history |
| \(K_t\) | current epistemic state |
| \(C_t\) | campaigns |
| \(W_t\) | prospective memory / wake conditions |
| \(A_t\) | continuation authority |

## 5.2 Identity kernel

Persistent identity SHOULD 最小化。

推荐：

\[
\boxed{
I_P=
(
id,
lineage,
charter,
authority,
commitments,
canonicalHead
)
}
\]

其余：

```text
model
prompt
host
harness
tool set
retriever
planner
personality style
```

均 MAY 版本化或替换。

---

# 6. AgentEntity ≠ Activation ≠ Intervention

本文冻结：

\[
\boxed{
PersistentAgent
\supset
Activation
\supset
Intervention
}
\]

## 6.1 Activation / Incarnation

\[
\alpha_k(P)
\]

表示第 \(k\) 次将 PersistentAgent materialize 到某个 execution substrate：

```text
reasoner
harness
host
working context
runtime tools
```

Activation 有自己的：

```text
activation_id
started_at
ended_at
model
harness
host
continuation_generation
```

Activation identity MUST NOT 替代 Agent identity。

## 6.2 Intervention

Intervention 是对世界/信息环境的一次实际作用：

\[
u_{k,j}
\]

例如：

- experiment；
- search；
- simulation；
- purchase；
- measurement；
- contact；
- query；
- write；
- external action。

Intervention 与 software retry 不同。

---

# 7. Hard Continuity Invariants

### PAG-INV-1 — Existence independent of activation

\[
AgentExists(P)
\not\Leftrightarrow
ActivationRunning(P)
\]

### PAG-INV-2 — Stable identity non-reuse

已终止 durable identity MUST NOT 被普通 allocator 自动复用。

### PAG-INV-3 — Activation identity is subordinate

\[
activationId
\neq
agentId
\]

### PAG-INV-4 — Context is not continuity truth

Working context / current prompt MUST NOT 成为唯一 continuity carrier。

### PAG-INV-5 — Evidence and belief separation

\[
EvidenceHistory
\neq
BeliefState
\]

### PAG-INV-6 — Wake reconciles with current world

Dormant agent MUST NOT blind-resume stale world assumptions。

### PAG-INV-7 — Intention persists only by explicit commitment semantics

长期目标持续的原因必须由 commitment 定义，而不是“数据库中还有一条旧 task”。

### PAG-INV-8 — One canonical continuation authority

每个 durable identity 在同一 continuation lineage 上 MUST 有唯一 canonical head / authority。

### PAG-INV-9 — Authorized migration does not imply new Agent

换 model/harness/host MAY 保持 durable identity。

### PAG-INV-10 — Copy is not continuation

完整复制 state 不自动获得 original identity。

### PAG-INV-11 — Failed execution may have positive epistemic value

\[
OperationalFailure
\not\Rightarrow
EpistemicValue=0
\]

### PAG-INV-12 — Historical epistemic state is immutable

Current belief 可修订；过去“当时相信什么”的历史 MUST NOT 被覆盖。

---

# 8. Epoch

## 8.1 Motivation

无限 event log 不适合作为单一 execution。

本文定义：

\[
\boxed{
PersistentAgent
=
Epoch_0
\rightarrow
Epoch_1
\rightarrow
\cdots
}
\]

Epoch 是有限的 continuity segment。

## 8.2 Epoch state

\[
E_k=
(
epochId,
parentEpoch,
openedAt,
closedAt,
head,
checkpoint,
summaryRefs
)
\]

## 8.3 Epoch closure

\[
E_k
\xrightarrow{seal}
Checkpoint_k
\xrightarrow{continue}
E_{k+1}
\]

保持：

\[
Identity(E_k)
=
Identity(E_{k+1})
\]

## 8.4 Epoch ≠ Agent lifetime

Epoch 是有限 operational history segment。

Agent lifetime 可以跨很多 Epoch。

---

# 9. Hot / Warm / Cold Durable State

## 9.1 Hot state

每次 wake SHOULD 直接 materialize：

```text
active commitments
current campaign heads
current hypotheses
critical beliefs
pending watchers
continuation authority
recent decisive evidence
```

## 9.2 Warm state

按需 retrieval：

```text
recent experiments
recent failed routes
recent project histories
important literature
important correspondence
```

## 9.3 Cold archive

保留但默认不进 context：

```text
raw logs
full tool traces
raw experiment data
old pages
old conversations
superseded plans
historical model outputs
```

## 9.4 Frozen rule

\[
\boxed{
Durable
\neq
AlwaysLoaded
}
\]

---

# 10. Memory Classes

本文冻结至少六类 durable memory。

## 10.1 Identity Memory

回答：

> 我是谁？

## 10.2 Normative Memory

回答：

> 我受什么 charter / authority / policy 约束？

## 10.3 Prospective Memory

回答：

> 未来什么条件下，我需要做什么？

## 10.4 Episodic Memory

回答：

> 发生过什么？

## 10.5 Epistemic Memory

回答：

> 我现在相信什么？为什么？

non-monotonic。

## 10.6 Procedural Memory

回答：

> 如何做？

```text
skills
strategies
workflow knowledge
tool usage policy
```

---

# 11. Sleep / Wake Lifecycle

建议状态机：

```text
          ┌─────────────┐
          │   DORMANT   │
          └──────┬──────┘
                 │ trigger
                 ▼
          ┌─────────────┐
          │   WAKING    │
          └──────┬──────┘
                 ▼
          ┌─────────────┐
          │ RECONCILING │
          └──────┬──────┘
                 ▼
          ┌─────────────┐
          │   ACTIVE    │
          └──────┬──────┘
                 ▼
          ┌─────────────┐
          │  QUIESCING  │
          └──────┬──────┘
                 └──────────────→ DORMANT
```

附加：

```text
MIGRATING
SUSPENDED
QUARANTINED
FORKED
TERMINATED
```

---

# 12. Wake Protocol

本文冻结推荐流程：

\[
\boxed{
Trigger
\rightarrow
Rehydrate
\rightarrow
ValidateContinuity
\rightarrow
ReconcileWorld
\rightarrow
RefreshEvidence
\rightarrow
ReviseBeliefs
\rightarrow
ReconsiderCommitments
\rightarrow
CompileWorkingContext
\rightarrow
SelectAction
}
\]

关键规则：

- Wake MUST 检查 continuity generation；
- MUST 刷新 time-sensitive world facts；
- MUST 检查旧 evidence validity；
- MUST reconsider commitments；
- MUST 重新编译 working context；
- MUST NOT 直接 replay old prompt 作为唯一恢复机制。

---

# 13. Prospective Memory

## 13.1 Definition

认知科学 prospective memory 是：

> memory for future intentions。

本文将 Watcher 定义为：

\[
\boxed{
Computational\ Prospective\ Memory
}
\]

## 13.2 WatchCondition

\[
W_i=
(
id,
predicate,
scope,
priority,
expiry,
wakeAction,
purpose
)
\]

## 13.3 Trigger classes

### Time-based

```text
wake at 2026-10-01
```

### Event-based

```text
wake when component arrives
wake when experiment result appears
```

### State-based

```text
wake when price < X
```

### Epistemic

```text
wake on contradiction with belief H
```

### Institutional

```text
wake when charter/authority changes
```

## 13.4 If–Then semantics

推荐：

```text
WHEN predicate
THEN wake campaign C
PURPOSE intention J
```

Watcher MUST 可追踪到某个 commitment / campaign / governance purpose。

---

# 14. Commitment / Intention

## 14.1 Definition

长期 intention 不应是简单 `goal: string`。

建议：

\[
\boxed{
J=
(
id,
goal,
adoptionBasis,
successCondition,
failureCondition,
impossibilityCondition,
abandonAuthority,
reconsiderPolicy,
status
)
}
\]

## 14.2 Means vs Ends

本文冻结：

\[
\boxed{
commitment\ to\ end
\neq
commitment\ to\ current\ means
}
\]

Plan 可以反复改变，而长期 intention 保持。

## 14.3 Reconsideration

\[
\pi_{reconsider}
\]

可以触发于：

- every wake；
- contradictory evidence；
- major world change；
- deadline；
- budget boundary；
- human policy change；
- route exhaustion。

## 14.4 Goal revision

Goal 改变 MUST 被版本化。

不得静默覆盖。

---

# 15. Campaign

## 15.1 Definition

\[
\boxed{
\mathcal C_t=
(
id,
J,
H_t,
E_t,
O_t,
\Pi_t,
B_t,
\Sigma_t
)
}
\]

其中：

| 符号 | 含义 |
|---|---|
| \(J\) | durable commitment |
| \(H_t\) | hypothesis / candidate explanation space |
| \(E_t\) | campaign evidence |
| \(O_t\) | available intervention options |
| \(\Pi_t\) | action-selection policy |
| \(B_t\) | budget/resources |
| \(\Sigma_t\) | sleep/stop/reconsider rules |

## 15.2 Campaign loop

\[
(H_t,E_t)
\xrightarrow{\Pi_t}
a_t
\xrightarrow{World}
o_{t+1}
\xrightarrow{Revision}
(H_{t+1},E_{t+1})
\]

---

# 16. Campaign vs Project

本文冻结：

\[
\boxed{
Campaign
\neq
Project
}
\]

Project 是 Campaign 的阶段性 executable projection。

Project failure：

\[
\not\Rightarrow
Campaign failure
\]

---

# 17. Project as Derived Execution Projection

长期层 canonical truth：

```text
commitments
campaign state
evidence
beliefs
world state
budget
```

通过：

\[
\boxed{
CampaignCompiler
}
\]

产生：

\[
ProjectIR_t
\]

即：

\[
CampaignCompiler(
J,K,E,W,B
)
\rightarrow
ProjectIR
\]

因此 ProjectIR MAY 被完全废弃并重新编译，而 Campaign identity 保持。

---

# 18. Campaign Loop with Current Palimpsest

```text
Campaign
   │
   ▼
CampaignCompiler
   │
   ▼
ProjectIR / AgentGraph
   │
   ▼
Scheduler
   │
   ▼
Task / Attempt / Ordarium
   │
   ▼
Observations / Outcomes
   │
   ▼
Evidence Ingestion
   │
   ▼
Belief Revision
   │
   └──────────────→ Campaign
```

现有 Palimpsest 被重新定位为：

\[
\boxed{
Short\text{-}Horizon\ Execution\ Engine
}
\]

---

# 19. Intervention

长期 Campaign 中的 Attempt SHOULD 被重新概念化为：

\[
\boxed{
Epistemic\ / Strategic\ Intervention
}
\]

例：

```text
experiment
measurement
simulation
literature search
expert consultation
purchase
prototype build
external contact
wait
```

---

# 20. Operational Outcome vs Epistemic Outcome

本文冻结两个正交状态。

## 20.1 OperationalOutcome

```text
COMPLETED
FAILED
CANCELLED
UNAVAILABLE
TIMED_OUT
```

## 20.2 EpistemicOutcome

```text
SUPPORTS
REFUTES
DISCRIMINATES
INCONCLUSIVE
ANOMALY
NO_NEW_INFORMATION
SUPERSEDED
```

## 20.3 Example

```text
Experiment ran correctly.
Result clearly falsified H1.
```

则：

```text
Operational = COMPLETED
Epistemic   = REFUTES(H1)
InformationGain = HIGH
```

---

# 21. Evidence History

建议：

\[
e=
(
id,
observation,
claimRelations,
source,
method,
context,
observedAt,
recordedAt,
validity,
provenance
)
\]

Observation SHOULD 保留。

其 validity / support role / interpretation 可改变。

---

# 22. Evidence Status Dimensions

至少分：

## Historical status

```text
RECORDED
SUPERSEDED
RETRACTED
INVALIDATED
```

## Epistemic role

```text
SUPPORTS
REFUTES
DISCRIMINATES
INCONCLUSIVE
BACKGROUND
ANOMALY
```

## Validity

```text
valid under context C
invalid after calibration change
valid for software version V
```

---

# 23. Evidence ≠ Belief

本文硬冻结：

\[
\boxed{
E_t
\neq
K_t
}
\]

Evidence ledger：

```text
what was observed
what was produced
where it came from
```

Belief state：

```text
what should currently be believed
given all applicable evidence
```

---

# 24. Belief Revision

长期系统 MUST 支持：

\[
K_t
\rightarrow
K_{t+1}
\]

且允许：

```text
retract
weaken
strengthen
branch
merge
unknown
```

可组合：

```text
AGM-like normative layer
TMS-like dependency layer
ATMS-like branch layer
Bayesian/statistical layer where appropriate
```

本文不强制唯一 backend。

---

# 25. Hypothesis Branch

\[
H_i=
(
id,
assumptions,
claims,
support,
conflicts,
status
)
\]

Campaign MAY 同时保持：

\[
\mathcal H_t=
\{H_1,H_2,\ldots,H_n\}
\]

不得强制每个时刻只有一个“best answer”。

---

# 26. Epistemic Branch ≠ Agent Fork

本文冻结：

\[
\boxed{
HypothesisBranch
\neq
AgentFork
}
\]

同一个 Agent 可同时探索多 hypothesis。

只有复制 continuity authority 并独立继续，才构成 Agent Fork。

---

# 27. Provenance Graph

本文建议采用 W3C PROV 的基本直觉：

```text
Entity
Activity
Agent
```

及：

```text
used
generated
derivedFrom
associatedWith
```

长期 Agent SHOULD 能回答：

> 这个 conclusion / artifact / evidence 到底怎么产生？

---

# 28. Four Distinct Long-Horizon Graphs

本文冻结至少四张逻辑图：

\[
\boxed{
G_{prov},
G_{evid},
G_{epi},
G_{intent}
}
\]

- \(G_{prov}\)：怎么来的；
- \(G_{evid}\)：什么支持/反驳什么；
- \(G_{epi}\)：现在相信什么；
- \(G_{intent}\)：还承诺做什么。

这些图 MUST NOT 因“都是知识”而被无类型地揉成一个 giant knowledge graph。

---

# 29. Evidence Dependency Invalidation

例如：

```text
Calibration C1
   ↓
Measurement M17
   ↓
Fit F3
   ↓
Support H1
```

若：

```text
C1 INVALIDATED
```

不得删除历史 M17/F3。

而是传播：

```text
M17 epistemically stale
F3  epistemically stale
support(H1) reduced/retracted
```

---

# 30. Temporal Semantics

长期系统 MUST 把时间作为一等维度，而不仅是 `created_at`。

## 30.1 Valid time

\[
t_{valid}
\]

事实在现实世界何时成立。

## 30.2 Transaction / knowledge time

\[
t_{known}
\]

系统何时知道/记录这个事实。

## 30.3 Bitemporal audit

历史决策必须依据：

\[
\boxed{
KnowledgeAvailableAt(t)
}
\]

评估。

不得用后来获得的信息 retroactively 解释过去行动。

---

# 31. Historical Epistemic State

Current belief 可改：

\[
K_{now}
\]

过去：

\[
K_t
\]

作为历史 state MUST immutable。

这样系统能回答：

```text
当时为什么相信 H1？
后来哪条 evidence 改变了判断？
```

---

# 32. Decision Record

重要长期决策 SHOULD 记录：

\[
d_t=
(
options,
knowledgeRefs,
policyVersion,
constraints,
estimatedUtilities,
chosen,
decisionBasis
)
\]

不要求保存 hidden CoT。

只需结构化：

```text
evidence refs
constraints
estimated tradeoffs
policy
```

---

# 33. Negative Knowledge

长期 memory MUST 支持：

```text
tried and failed route
invalidated hypothesis
irrelevant source
known impossible condition
known supplier limitation
known dead end
```

这些是：

\[
\boxed{
Negative\ Knowledge
}
\]

没有它，长期 Agent 会不断重复过去的错误路线。

---

# 34. Novelty Guard

在执行候选 intervention \(a\) 前：

\[
Similarity(a,A_{past})
\]

若很高，系统 SHOULD 问：

\[
\boxed{
What\ changed\ that\ justifies\ retry?
}
\]

再次尝试 SHOULD 至少有：

```text
new evidence
new method
new model capability
new equipment
new parameter
changed world condition
```

之一。

---

# 35. Evidence Aging

本文冻结：

\[
\boxed{
No\ universal\ time\ decay
}
\]

不能所有 evidence 使用：

\[
w(t)=e^{-\lambda t}
\]

统一折价。

Evidence validity SHOULD 主要基于：

\[
condition\text{-}based\ validity
\]

time decay MAY 作为一种 rule。

---

# 36. Epistemic Progress

长期 progress 不应等于：

\[
\frac{doneTasks}{totalTasks}
\]

可分别追踪：

- goal progress；
- epistemic progress；
- evidence coverage；
- option progress。

例如：

\[
\Delta H=
H(\mathcal H_0)-H(\mathcal H_t)
\]

---

# 37. Refutation Is Progress

若：

\[
P(H_1)
:
0.4
\rightarrow
0.01
\]

可能尚未找到最终解，

但 epistemic progress 明显为正。

本文冻结：

\[
\boxed{
eliminating\ a\ plausible\ wrong\ route
=
positive\ progress
}
\]

---

# 38. Action Selection

长期 action selection SHOULD 基于当前 epistemic/intentional state，而非只基于 task state。

推荐抽象：

\[
VOA(a)
=
IG(a)
+
DirectGoalValue(a)
+
FutureOptionValue(a)
-
Cost(a)
-
Risk(a)
\]

其中：

\[
IG(a)
=
\mathbb E[
H(\mathcal H_t)-H(\mathcal H_{t+1})
]
\]

---

# 39. WAIT

本文硬冻结：

\[
\boxed{
WAIT
}
\]

为一等 action。

WAIT ≠ BLOCKED。

WAIT 应产生：

```text
sleep reason
watch conditions
expected revisit horizon
commitment refs
```

---

# 40. Campaign States

建议：

```text
ACTIVE
DORMANT
SATISFIED
ABANDONED
EXHAUSTED
```

并允许：

\[
\boxed{
UNKNOWN
}
\]

作为一等 epistemic state。

---

# 41. Continuation Authority

本文冻结：

\[
\boxed{
one\ durable\ identity
\Rightarrow
one\ canonical\ continuation\ authority
}
\]

可实现为：

```text
lease
generation
fencing token
CAS
canonical branch head
```

旧 generation 的 activation MUST NOT：

- commit canonical state；
- issue unique external effects；
- advance authority；
- overwrite new head。

---

# 42. Candidate ≠ Canonical State

长期 Agent 的 model/tool/background worker 只产生：

\[
candidate
\]

candidate 通过：

```text
predecessor check
authority check
freshness check
uniqueness check
governance check
```

后才能 Commit 推进 canonical head。

---

# 43. Migration

Migration：

\[
P@E_1
\rightarrow
P@E_2
\]

identity 不变。

可替换：

```text
model
reasoner
harness
host
surface
retriever
planner
tool adapter
```

推荐协议：

```text
quiesce
→ checkpoint
→ validate
→ revoke old continuation
→ bind new execution substrate
→ rehydrate
→ reconcile
→ resume
```

---

# 44. Fork

Fork：

\[
P
\rightarrow
P_1,P_2
\]

MUST：

- fresh IDs；
- common lineage ancestor；
- explicit authority distribution；
- commitment/asset handling；
- subsequent independent canonical heads。

复制 state 不自动等于 continuation。

---

# 45. Memory Similarity ≠ Identity

本文冻结：

\[
\boxed{
MemorySimilarity
\not\Rightarrow
SameIdentity
}
\]

反之，部分 episodic memory 损坏：

\[
\not\Rightarrow
AgentDeath
\]

只要 continuity kernel 与关键 canonical state 仍有效。

---

# 46. Termination / Institutional Death

真正 TERMINATED SHOULD 由：

- charter fulfilled；
- charter revoked；
- commitments satisfied/transferred/closed；
- explicit authority action；
- lawful dissolution；

触发。

以下不应自动意味着 death：

```text
process crash
machine shutdown
model deprecation
network outage
long dormancy
```

---

# 47. Time-Scale Hierarchy

本文冻结：

\[
\tau_0
\ll
\tau_1
\ll
\tau_2
\ll
\tau_3
\ll
\tau_4
\]

| scale | meaning |
|---|---|
| \(\tau_0\) | reasoning tick |
| \(\tau_1\) | activation |
| \(\tau_2\) | project / experiment cycle |
| \(\tau_3\) | campaign |
| \(\tau_4\) | institution identity |

一个 LLM planner SHOULD NOT 被默认视为同时管理全部五个尺度。

---

# 48. DurableHolon

继承 `PLMP-AGT-0`：

\[
Holon
=
many\ internal\ agents
\rightarrow
one\ external\ actor
\]

本文增加：

\[
\boxed{
DurableHolon
=
Holon
+
TemporalContinuity
}
\]

即使当前内部 workers、models 和 topology 更换，对外 macro-agent identity 仍能合法延续。

---

# 49. DurableInstitution

## 49.1 Definition

\[
\boxed{
D=
(
I,
Charter,
Authority,
Assets,
Commitments,
Ledger,
MembershipRules,
Governance,
Campaigns
)
}
\]

## 49.2 Institution continuity

成员集合：

\[
A_t
\]

可以变化：

\[
A_t\neq A_{t+1}
\]

但：

\[
I_D
\]

保持连续。

## 49.3 DurableInstitution vs DurableHolon

- DurableHolon：强调对外作为一个 Agent；
- DurableInstitution：强调规范、责任、资产、承诺与历史跨成员变化持续存在。

一个实体 MAY 同时是两者。

---

# 50. Why Institution Is the AGT × PAG Intersection

`PLMP-AGT-0` 提供：

```text
organization
roles
capabilities
holons
runtime scopes
composition
```

`PLMP-PAG-0` 提供：

```text
identity through time
commitment
evidence
belief
campaign
sleep/wake
authority
```

二者交汇：

\[
\boxed{
Durable\ Cognitive\ Institution
}
\]

---

# 51. Thin Reasoner, Thick Institution

本文建议：

\[
\boxed{
Thin\ Reasoner
+
Thick\ Durable\ Substrate
}
\]

LLM reasoner：

```text
ephemeral
replaceable
activation-scoped
```

Institution：

```text
identity-rich
history-rich
evidence-rich
policy-rich
authority-rich
```

LLM MUST NOT 自行成为 canonical：

- identity；
- commitment；
- evidence；
- authority；
- history。

---

# 52. Five Planes

## Identity Plane

```text
who am I?
lineage
canonical head
continuation authority
```

## Intentional Plane

```text
what am I committed to?
why?
success?
abandonment?
```

## Epistemic Plane

```text
what do I believe?
what evidence?
what conflicts?
what is unknown?
```

## Execution Plane

```text
what should I do now?
with which agents/tools/resources?
```

## Governance Plane

```text
what may become authoritative?
what requires evidence?
who may approve?
what effects are allowed?
```

---

# 53. Plane Separation Invariants

- Reasoner output MUST NOT equal canonical epistemic state automatically.
- Worker report MUST NOT equal evidence automatically.
- Plan MUST NOT equal commitment.
- Current Project MUST NOT equal Campaign identity.
- Activation state MUST NOT equal durable identity.
- Historical provenance MUST NOT equal current belief.

---

# 54. Recommended Canonical Long-Horizon Layer

```text
Institution
Commitments
Campaigns
Hypothesis branches
Evidence
Provenance
Current epistemic state
Watchers
Epoch heads
Continuation authority
```

---

# 55. Recommended Derived Short-Horizon Layer

```text
ProjectIR
AgentGraph
Task graph
Allocation
Attempts
Runtime traces
Working context
```

Derived layer MAY 被：

```text
discarded
recompiled
replaced
migrated
```

而不损害 DurableInstitution identity。

---

# 56. CampaignCompiler

\[
\boxed{
CampaignCompiler:
LongHorizonState
\rightarrow
ShortHorizonPlan
}
\]

输入：

```text
commitment
belief/hypothesis state
relevant evidence
current world
budget
policy
```

输出：

```text
ProjectIR
AgentGraph
execution policy
```

---

# 57. Outcome Ingestion

\[
Outcome
\rightarrow
EvidenceIngestion
\rightarrow
ProvenanceUpdate
\rightarrow
BeliefRevision
\rightarrow
CampaignUpdate
\]

然后选择：

```text
new project
continue
wait
abandon
satisfy
```

---

# 58. Literature Alignment Matrix

| Frozen construct | Primary lineage | Alignment |
|---|---|---|
| entity ≠ activation | Orleans virtual actors | Direct engineering alignment |
| epoch / fresh execution chain | Temporal Continue-As-New | Direct engineering adaptation |
| persistent intention | Cohen–Levesque / BDI | Direct theoretical inheritance |
| prospective/wake memory | prospective memory psychology | Cross-domain adaptation |
| evidence≠belief | TMS / belief revision | Direct conceptual inheritance |
| multiple hypothesis contexts | ATMS | Direct conceptual inheritance |
| valid vs transaction time | temporal databases | Direct adaptation |
| provenance graph | W3C PROV | Direct standards alignment |
| experiment–hypothesis loop | Robot Scientist / SDL | Direct application alignment |
| information-gain experiment choice | Bayesian experimental design / SDL | Adaptation |
| runtime-independent identity | 2026 persistent-agent preprint | Emerging alignment |
| continuation authority | 2026 continuity-kernel preprint | Emerging alignment |
| lifecycle-task construction from perception | Pera 2026 | Emerging alignment |
| CampaignCompiler | Palimpsest synthesis | Proposed |
| evidence-governed continuity | Palimpsest synthesis | Proposed |
| Durable Cognitive Institution | AGT × PAG synthesis | Proposed |

---

# 59. What Is Not Claimed as Original

本文不将以下视为 Palimpsest 原创：

```text
virtual actor
durable workflow
event sourcing
intention/commitment
truth maintenance
belief revision
ATMS
prospective memory
bitemporal database
provenance
Bayesian experimental design
self-driving lab
institution
```

---

# 60. Candidate Palimpsest Synthesis

## 60.1 Evidence-Governed Continuity

\[
\boxed{
Identity
+
Commitment
+
Evidence
+
EpistemicRevision
+
ContinuationAuthority
}
\]

## 60.2 Campaign Compiler

\[
\boxed{
LongHorizonCanonicalState
\rightarrow
ProjectIR
}
\]

## 60.3 Epistemic Outcome Semantics

\[
\boxed{
OperationalOutcome
\neq
EpistemicOutcome
}
\]

## 60.4 Durable Cognitive Institution

\[
\boxed{
AGT
\times
PAG
}
\]

实现：

- spatial reorganization；
- temporal continuity；
- evidence accumulation；
- model replacement；
- campaign persistence；
- governed activation。

---

# 61. Research Hypotheses

## PAG-H1 — Continuity without model persistence

若 identity/lineage/commitments/evidence/authority 保持，可在更换 reasoner/model/harness 后维持可测主体连续性。

## PAG-H2 — Campaign > Project for open-ended research

对于 unknown-feasibility / evolving-route 问题，Campaign loop 比固定 DAG 在：

```text
dead-end avoidance
evidence reuse
adaptivity
long-term efficiency
```

上更优。

## PAG-H3 — Explicit negative knowledge reduces repeated failure

记录 dead ends + novelty guard 可显著减少重复低价值 intervention。

## PAG-H4 — Epistemic-progress scheduling improves research efficiency

基于 information gain / discriminative value 的 intervention selection 比 completion-driven scheduler 更适合开放研究目标。

## PAG-H5 — Prospective-memory watchers reduce persistence cost

大多数长期 Agent 可保持极高 dormant ratio，同时通过低成本 watcher 保持实际服务连续性。

## PAG-H6 — Evidence-governed institutional identity survives internal turnover

在内部 Agent/model/topology 大幅变化时，DurableInstitution 仍可通过 charter/authority/lineage/evidence continuity 保持可审计 identity。

---

# 62. Research Program

## PAG-R1 — Persistence Ontology

实现最小：

```text
PersistentAgent
Activation
Epoch
Campaign
Intervention
```

## PAG-R2 — Continuation Kernel

实现：

```text
canonical head
generation
lease/fencing
migration
fork
```

## PAG-R3 — Commitment Registry

实现：

```text
success
abandon
reconsider
versioned goal
```

## PAG-R4 — Epistemic Plane

实现：

```text
EvidenceGraph
Belief/Hypothesis state
dependency invalidation
negative knowledge
```

## PAG-R5 — Prospective Memory

实现：

```text
WatchCondition
WakeReason
DORMANT lifecycle
```

## PAG-R6 — Campaign Compiler

长期 state → ProjectIR。

## PAG-R7 — Durable Institution

与 `PLMP-AGT-0` Organization/Holon/RuntimeScope 整合。

---

# 63. Mapping to Current Palimpsest

## 63.1 Reusable directly

当前已有：

```text
append-only event log
Project revision
stale result rejection
EvidenceAtom
Gate
Context Compiler
GraphPatch
definition_id
Runtime trace
Ordarium effect authority
```

均是长期系统的重要基础。

## 63.2 Reinterpreted

### ProjectIR

未来定位：

\[
\boxed{
short\text{-}horizon\ derived\ execution\ plan
}
\]

而非最高 canonical long-term truth。

### Attempt

未来长期层应补：

```text
OperationalOutcome
EpistemicOutcome
```

### Context Compiler

未来成为：

```text
Wake/Activation Context Compiler
```

的重要器官。

## 63.3 Missing major organs

当前缺：

```text
Persistent identity object
Epoch chain
Campaign
Commitment registry
Hypothesis state
Belief revision
Evidence validity graph
Prospective/watch registry
Continuation authority at agent level
Campaign compiler
Durable institution
```

---

# 64. Engineering Freeze Rules

在后续规格明确替代之前：

1. **MUST NOT** 将 Persistent Agent 等同于长期不退出的 process。
2. **MUST NOT** 将 context window / chat summary 作为唯一 continuity truth。
3. **MUST NOT** 将 current model identity 作为 durable Agent identity。
4. **MUST NOT** 将 Campaign 等同于 Project。
5. **MUST NOT** 将 Project failure 自动升级为 Campaign failure。
6. **MUST NOT** 将 operational failure 解释成 zero epistemic value。
7. **MUST NOT** 将 Evidence ledger 与 Belief state 混合。
8. **MUST NOT** 静默重写历史 belief state。
9. **MUST NOT** blind-resume 睡眠前的 world assumptions。
10. **MUST NOT** 允许两个 activation 同时拥有同一 canonical continuation authority。
11. **MUST NOT** 将完整 state copy 自动视为 identity continuation。
12. **MUST NOT** 用统一时间衰减规则处理所有 evidence。
13. **MUST** 将 dormant 与 terminated 区分。
14. **MUST** 将 wake reason 与 commitment/campaign 建立可追踪联系。
15. **MUST** 支持 unknown / inconclusive 作为合法 epistemic outcome。
16. **SHOULD** 支持 WAIT 作为一等 long-horizon action。
17. **SHOULD** 支持 negative knowledge / dead-end retrieval。
18. **SHOULD** 将 Project 视为可重新编译的 execution projection。
19. **SHOULD** 将重要 decision 与当时可用 evidence/knowledge 建立历史关联。
20. **SHOULD** 采用 epoch segmentation，而不是假设无限单 execution。
21. **MAY** 采用概率 belief；不得强制所有 domain 使用同一概率模型。
22. **MAY** 采用 TMS/ATMS/AGM/Bayesian 等不同 epistemic backend，只要满足本文不变量。

---

# 65. Recommended Future Canonical Vocabulary

| UX term | Formal meaning |
|---|---|
| Long-term Agent | PersistentAgent / DurableInstitution |
| Session | Activation |
| Sleep | DORMANT lifecycle |
| Wake | new Activation + reconciliation |
| Long-term goal | Commitment |
| Mission / research line | Campaign |
| Current plan | Project / Plan |
| Task | bounded execution unit |
| Attempt | Intervention / execution attempt |
| Memory | typed memory classes, not one store |
| Knowledge | Epistemic state |
| History | Provenance + episodic record |
| Reminder / monitor | Prospective memory / WatchCondition |

---

# 66. Recommended Product Representation

```text
Optical Research Institution
[Durable Institution] [Holon]

Identity
  created 2026-09
  epoch 14
  canonical head r381

Commitments
  ● Low-cost free-running 1550 nm source
  ○ Beam quality validation

Campaigns
  C17 ACTIVE
  C21 DORMANT — wake on shipment
  C08 SATISFIED

Epistemic
  13 active hypotheses
  4 strongly refuted
  2 unresolved contradictions

Evidence
  812 observations
  57 invalidated dependencies
  94% critical provenance coverage

Watchers
  7 active

Current Activation
  model ...
  started ...
```

当前 model 只是 activation 信息，不是主体身份。

---

# 67. Canonical Definition

本文冻结：

> **Persistent Agent 是一个拥有耐久身份、受治理的 continuation lineage、持续承诺与可修订 epistemic state，并能跨越一次次可替换 activation 在变化世界中继续存在和行动的主体。**

形式上：

\[
\boxed{
PersistentAgent
=
Identity
+
Continuity
+
Commitment
+
EpistemicState
+
Campaigns
+
ProspectiveMemory
+
Authority
}
\]

---

# 68. Canonical Definition of Campaign

> **Campaign 是围绕一个 durable commitment，在不完全已知且持续变化的世界中，通过连续 intervention、evidence accumulation、hypothesis revision 与阶段性 planning 追求目标的开放式长期活动。**

\[
\boxed{
Campaign
\neq
finite\ task\ graph
}
\]

---

# 69. Canonical Definition of Durable Institution

> **Durable Institution 是一个能够跨成员、模型、运行时、组织结构与执行计划变化，仍依靠 identity、charter、authority、commitments、evidence 和 authorized lineage 保持连续存在的多主体认知组织。**

\[
\boxed{
DurableInstitution
=
AGT
\times
PAG
}
\]

---

# 70. Canonical Long-Horizon Loop

本文最终冻结：

\[
\boxed{
Campaign
\rightarrow
Project
\rightarrow
Interventions
\rightarrow
Evidence
\rightarrow
BeliefRevision
\rightarrow
Campaign
}
\]

并允许：

\[
Campaign
\rightarrow
WAIT
\rightarrow
DORMANT
\rightarrow
Wake
\rightarrow
Campaign
\]

---

# 71. Three Central Frozen Equations

第一：

\[
\boxed{
PersistentIdentity
\neq
Activation
\neq
MemoryContents
}
\]

第二：

\[
\boxed{
EvidenceHistory
\neq
CurrentBeliefState
}
\]

第三：

\[
\boxed{
Campaign
\rightarrow
Project
\rightarrow
Evidence
\rightarrow
BeliefRevision
\rightarrow
Campaign
}
\]

---

# 72. References

以下参考文献用于理论对齐。2026 年 preprints 被明确标注为 emerging work。

## [P1] Microsoft Orleans — Virtual Actor Model

Microsoft Orleans Documentation.  
**Microsoft Orleans — The Virtual Actor Model.**  
Stable application-defined grain identity; activation/deactivation separated from identity.  
https://dotnet.github.io/orleans/docs/overview/

## [P2] Temporal Continue-As-New

Temporal Documentation.  
**Continue-As-New.**  
A new Workflow Execution keeps the same Workflow Id, receives a fresh Event History and may continue indefinitely through an execution chain.  
https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/workflow-execution/continue-as-new.mdx

## [P3] Intention and Commitment

Philip R. Cohen, Hector J. Levesque.  
**Intention is Choice with Commitment.**  
Artificial Intelligence, 42(2–3), 213–261, 1990.  
DOI: `10.1016/0004-3702(90)90055-5`  
https://doi.org/10.1016/0004-3702(90)90055-5

## [P4] Truth Maintenance

Jon Doyle.  
**A Truth Maintenance System.**  
Artificial Intelligence, 12(3), 231–272, 1979.  
DOI: `10.1016/0004-3702(79)90008-0`  
https://doi.org/10.1016/0004-3702(79)90008-0

## [P5] Assumption-Based TMS

Johan de Kleer.  
**An Assumption-Based TMS.**  
Artificial Intelligence, 28(2), 127–162, 1986.  
DOI: `10.1016/0004-3702(86)90080-9`  
https://doi.org/10.1016/0004-3702(86)90080-9

## [P6] Prospective Memory

Jan Rummel, Lia Kvavilashvili.  
**Current theories of prospective memory and new directions for theory development.**  
Nature Reviews Psychology 2, 40–54 (2023).  
DOI: `10.1038/s44159-022-00121-4`  
https://doi.org/10.1038/s44159-022-00121-4

## [P7] W3C PROV

W3C.  
**PROV Primer / PROV Data Model.**  
Entity–Activity–Agent provenance model.  
https://www.w3.org/TR/prov-primer/

## [P8] Robot Scientist

Ross D. King et al.  
**Functional genomic hypothesis generation and experimentation by a robot scientist.**  
Nature 427, 247–252 (2004).

## [P9] Autonomous Scientific Discovery / Robin

**A multi-agent system for automating scientific discovery.**  
Nature 655, 497–505 (2026).  
DOI: `10.1038/s41586-026-10652-y`  
https://doi.org/10.1038/s41586-026-10652-y

## [P10] Self-Driving Laboratories

Richard B. Canty, Milad Abolhasani.  
**The past, present and future of self-driving laboratories.**  
Nature Reviews Chemistry 10, 523–537 (2026).  
Published 31 July 2026.  
Emphasizes scalability, generalizability and provenance-complete experimentation.  
DOI: `10.1038/s41570-026-00847-2`  
https://doi.org/10.1038/s41570-026-00847-2

## [P11] Runtime-Independent Persistent Agents — Emerging

Zhenyu Zhao, Roy Zhao.  
**Runtime-Independent Persistent Agents: Preserving Identity, Memory, and Code Across Models, Harnesses, and Servers.**  
arXiv:2609.00546, 2026-09-01.  
https://arxiv.org/abs/2609.00546

> Status at freeze: very recent preprint; used as emerging alignment, not settled foundational literature.

## [P12] Continuity Kernel — Emerging

Jun He, Deying Yu.  
**Beyond Memory: A Transactional Continuity Kernel for Long-Lived AI Agents.**  
arXiv:2608.11632, 2026-08-12.  
https://arxiv.org/abs/2608.11632

> Status at freeze: recent preprint; especially relevant to authoritative branch-head activation and continuation authority.

## [P13] Pera — Emerging

Shihan Dou et al.  
**Agents in the Large: Perception-Centered Architecture for Persistent Agents.**  
arXiv:2608.30478, 2026-08-31.  
https://arxiv.org/abs/2608.30478

> Status at freeze: recent preprint; supports the shift from bounded-task agents toward long-lived, environment-perceiving persistent agents.

---

# 73. Provenance of the Frozen Theory

## 73.1 Literature-derived

```text
entity vs activation
durable execution chain
intention / commitment
truth maintenance
assumption contexts
prospective memory
provenance
scientific experiment loops
```

## 73.2 Literature-adapted

```text
prospective memory → WatchCondition
TMS / ATMS → Campaign epistemic plane
Temporal Continue-As-New → Agent Epoch
W3C PROV → Durable Institution history
experimental design → long-horizon intervention scheduler
```

## 73.3 Palimpsest synthesis

```text
PersistentAgent
  + Evidence Governance
  + Continuation Authority
  + CampaignCompiler

OperationalOutcome
  !=
EpistemicOutcome

LongHorizonCanonicalState
  → ProjectIR

AGT × PAG
  → Durable Cognitive Institution
```

---

# 74. Final Frozen Statement

在 `PLMP-PAG-0 v0.1` 之后，Palimpsest 对长期智能主体的所有设计 SHOULD 遵守如下理解：

\[
\boxed{
\text{A long-lived agent is not a process kept alive.}
}
\]

它是一个通过：

```text
stable identity
authorized lineage
commitments
evidence/provenance
revisable epistemic state
campaigns
prospective memory
continuation authority
```

在变化世界中跨越多次 activation、migration、sleep/wake 仍保持连续性的主体。

其长期工作不是：

```text
one giant Project DAG
```

而是：

\[
\boxed{
Campaign
\rightarrow
Project
\rightarrow
Interventions
\rightarrow
Evidence
\rightarrow
BeliefRevision
\rightarrow
Campaign
}
\]

最终：

\[
\boxed{
PLMP\text{-}AGT\text{-}0
\times
PLMP\text{-}PAG\text{-}0
=
Durable\ Cognitive\ Institution
}
\]

这是后续 Persistent Agent、Long-Horizon Campaign、Durable Holon、Institutional Memory、CampaignCompiler 与长期 Evidence Governance 工作的理论起点。

---

**END OF FROZEN SPEC — PLMP-PAG-0 v0.1**
