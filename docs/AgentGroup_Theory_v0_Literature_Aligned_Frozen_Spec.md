# AgentGroup Theory v0 — Literature-Aligned Frozen Specification

> **Document ID**: `PLMP-AGT-0`  
> **Status**: **FROZEN / 理论基线冻结**  
> **Version**: `0.1`  
> **Date**: `2026-09-08`  
> **Scope**: Palimpsest / Graph-native Multi-Agent IDE / Evidence-governed Multi-Agent Operating Environment  
> **Purpose**: 冻结 AgentGroup 的术语、数学对象、文献谱系、组合语义、质量判据、变换语义与 Palimpsest 映射，作为后续实现 `Organization / Holon / RuntimeScope / Coalition / VisualGroup / GroupPatch` 的理论基线。  
> **Authority**: 本文仅冻结理论与术语，不自动改变现有 Palimpsest schema、CanvasDoc、AgentGraph、RuntimeSubgraph 或调度器实现。任何工程落地必须另立设计规格并显式引用本文。  
> **Normative language**: `MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 具有规范性含义；其余描述为解释性内容。

---

## 0. Executive Summary

本文冻结以下核心结论。

### 0.1 AgentGroup 不是“若干 Agent 的集合”

最弱定义

\[
G \subseteq A
\]

不足以表达组织结构、角色、能力、交互、边界、治理、运行时和外部行为。

本规格采用的广义 AgentGroup 是一个**开放的、有组织的、多主体模块**：

\[
\boxed{
G=
(A,R,C,\rho,\kappa,F,N,\Gamma,\partial,\Pi,X,\mathcal S)
}
\]

其中：

- \(A\)：成员 Agent / 子组织；
- \(R\)：Roles；
- \(C\)：Capabilities；
- \(\rho\)：Agent–Role assignment；
- \(\kappa\)：Agent–Capability possession；
- \(F\)：Goals / Missions / Functional structure；
- \(N\)：Norms / Permissions / Obligations / Invariants；
- \(\Gamma\)：内部 interaction / communication graph；
- \(\partial\)：开放边界 / interface；
- \(\Pi\)：routing / scheduling / retry / resource policy；
- \(X\)：runtime internal state；
- \(\mathcal S\)：externally observable behavioral semantics。

### 0.2 “AgentGroup”只保留为产品层 umbrella term

底层理论与 schema **MUST NOT** 用一个模糊的 `Group` 对象同时承载所有语义。

本文冻结五个不同对象：

1. **Organization**：成员、角色、能力、目标、规范；
2. **Holon**：内部由多个 Agent 组成、对外表现为单一 Agent/模块的复合体；
3. **RuntimeScope**：scheduler/state/retry/budget/lifecycle 的执行所有权边界；
4. **Coalition**：针对任务临时形成、可重叠的协作集合；
5. **VisualGroup**：仅表示 UI/Canvas 视觉组织。

`AgentGroup` MAY 在 UX 中作为泛称，但内核 MUST 区分上述语义。

### 0.3 好的 AgentGroup 不是“内部边多、外部边少”这么简单

好的 AgentGroup 必须至少同时考虑：

- organizational feasibility；
- task utility；
- synergy；
- modularity / near-decomposability；
- interface compressibility；
- communication / token / latency cost；
- robustness；
- observability / controllability；
- verifiability / evidence quality；
- substitutability。

不存在脱离 task/environment 的普适最佳组织。

因此质量应建模为：

\[
\boxed{
\mathbf Q(G\mid \tau,\mathcal E)
}
\]

而不是固定的单一标量 \(Q(G)\)。

### 0.4 好的 Group Transformation 不是“重新画图”

变换：

\[
T:G\rightarrow G'
\]

至少由五部分组成：

\[
\boxed{
T=(r,\beta,\chi,PO,E)
}
\]

- \(r\)：typed graph rewrite；
- \(\beta\)：boundary/interface rewrite；
- \(\chi\)：semantic change class；
- \(PO\)：proof obligations；
- \(E\)：支持 obligations 的 evidence。

Palimpsest SHOULD 将未来的 Group transformation 设计为：

```text
proposal
  ↓
typed rewrite
  ↓
structural / organizational / interface validation
  ↓
proof obligations
  ↓
evidence
  ↓
governed activation
```

而不是“AI 直接改 canonical graph”。

### 0.5 文献定位

本文不是重新发明经典 MAS。

其理论来源大致为：

```text
AGR / OCMAS
  └─ Agent / Group / Role

MOISE+
  └─ Structural / Functional / Deontic organization

OMACS / O-MaSE
  └─ Goal / Role / Agent / Capability / Policy + runtime reorganization

Holonic MAS
  └─ multiple agents → super-agent / holon

Coalition Formation
  └─ coalition value, coalition structure, overlap

Simon / Organizational Design
  └─ near-decomposability, organization-dependent performance

Open Systems / Structured Cospans
  └─ explicit boundary + composition

Wiring Operads
  └─ hierarchical composition / substitution

Interface Automata / Assume–Guarantee
  └─ compatibility / refinement / protocol

Process Algebra
  └─ observational equivalence / substitutability

Algebraic Graph Transformation
  └─ typed rewrite / preserved-created-deleted identity

Information Bottleneck
  └─ compact but sufficient interface

GPTSwarm / G-Designer / AgentPrune
  └─ LLM-specific topology, communication cost, task adaptivity
```

真正值得 Palimpsest 继续发展的综合是：

\[
\boxed{
\textbf{Evidence-Governed Open Agent Organizations}
+
\textbf{Typed, Identity-Preserving Group Transformation}
}
\]

---

# 1. Scope and Non-Goals

## 1.1 Scope

本文冻结：

- AgentGroup 核心术语；
- 组织、Holon、RuntimeScope、Coalition、VisualGroup 的区分；
- literature-aligned formal object；
- membership / ownership / encapsulation 的关系；
- open boundary；
- composition；
- behavioral semantics；
- interface compatibility；
- group quality；
- split / merge / extract / inline / rewire 的数学语义；
- proof obligations；
- change classification；
- 与 Palimpsest 现有 `AgentGraph / definition_id / RuntimeSubgraph / GraphPatch / evidence governance` 的映射；
- 后续研究方向。

## 1.2 Non-goals

本文 **不**：

- 修改当前 CanvasDoc；
- 定义实际数据库 migration；
- 直接引入 Group canonical event；
- 实现 Runtime Subgraph v2；
- 实现 Group scheduler；
- 实现自动 GroupAdvisor；
- 规定唯一的优化算法；
- 规定唯一 LLM topology；
- 声称本文的全部数学组件均为原创理论；
- 将 category theory 作为唯一或首要理论根基。

---

# 2. Normative Terminology

## 2.1 Agent

`Agent` 是可被赋予能力、角色或运行任务的主体。

本文不要求 Agent 必须是 LLM；其可表示：

- LLM Agent；
- deterministic worker；
- human participant；
- software service；
- composite Holon。

Agent identity MUST 与 role identity 分离。

---

## 2.2 Role

Role 表示组织中的功能位置，而非 Agent 自身身份。

\[
R=\{r_1,\ldots,r_k\}
\]

角色分配关系：

\[
\rho\subseteq A\times R
\]

同一 Agent MAY 承担多个 Role；同一 Role MAY 由不同 Agent 在不同 run 中承担。

---

## 2.3 Capability

Capability 表示 Agent 能完成什么，而不是“当前被分配做什么”。

\[
C=\{c_1,\ldots,c_m\}
\]

能力拥有关系：

\[
\kappa\subseteq A\times C
\]

角色可定义能力需求：

\[
req:R\rightarrow 2^C
\]

若：

\[
req(r)\subseteq cap(a)
\]

则 Agent \(a\) 在 capability 层面至少具备承担 Role \(r\) 的条件。

这是从 OMACS 继承并适配的概念。

---

# 3. Five Distinct Group-Like Objects

## 3.1 VisualGroup

### Definition

VisualGroup 只表达：

- Canvas grouping；
- selection；
- visual bounding；
- color / label；
- collapse / expand presentation。

### Hard rule

\[
\boxed{
VisualGroup \not\Rightarrow runtime\ semantics
}
\]

VisualGroup MUST NOT 自动：

- 创建 scheduler boundary；
- 创建 role；
- 改变 routing；
- 改变 runtime ownership；
- 改变 evidence policy。

---

## 3.2 Organization

Organization 表示组织关系：

\[
O=(A,R,C,\rho,\kappa,F,N,\ldots)
\]

回答：

- 谁属于什么组织；
- 谁承担什么 Role；
- 谁具有什么 Capability；
- 组织目标是什么；
- 有哪些 norms / policies。

Organizational membership MAY overlap。

例如：

```text
Agent X
├─ member of Research Organization
└─ member of Safety Organization
```

这不是冲突。

---

## 3.3 Coalition

Coalition 是任务驱动、通常临时的协作集合：

\[
K\subseteq A
\]

或在 overlapping coalition 语义下：

\[
a \in K_1,\quad a\in K_2
\]

可同时成立。

Coalition SHOULD 用于：

- temporary panel；
- bidding；
- debate；
- ensemble；
- one-run expert team；
- dynamic task allocation。

Coalition MUST NOT 自动等价于 persistent Organization 或 RuntimeScope。

---

## 3.4 RuntimeScope

RuntimeScope 是执行所有权边界。

它负责定义：

- scheduler ownership；
- runtime state ownership；
- retry ownership；
- budget ownership；
- lifecycle；
- cancellation；
- checkpoint；
- optional local memory；
- local concurrency policy。

### Ownership rule

Runtime ownership SHOULD form a forest / laminar hierarchy：

\[
S_1\cap S_2=\varnothing
\quad\lor\quad
S_1\subseteq S_2
\quad\lor\quad
S_2\subseteq S_1
\]

原因不是“所有 Group 必须是树”，而是 execution ownership 必须避免多重不兼容 owner。

---

## 3.5 Holon

Holon 是本文最接近“真正 Runtime AgentGroup”的对象。

Holonic MAS 的经典定义中，多个 agents 可放弃部分 autonomy，合并成一个 “super-agent”，从外部看仍像一个单一 agent。

因此定义：

\[
H=(G,\partial H,\pi_H)
\]

其中：

- \(G\)：内部 Organization / Agent network；
- \(\partial H\)：对外 interface；
- \(\pi_H\)：内部行为到外部单一主体行为的 abstraction map。

\[
\pi_H:
\mathcal S_{\text{internal}}
\rightarrow
\mathcal S_{\text{external}}
\]

Holon 的本质不是 containment，而是：

\[
\boxed{
\text{internal multiplicity}
\rightarrow
\text{external unity}
}
\]

---

# 4. Four Independent Relations

Palimpsest 的长期 schema SHOULD 区分以下关系。

## 4.1 Organizational membership

\[
\mu_{org}(a,G)
\]

表示 Agent 属于 Organization。

可重叠。

---

## 4.2 Execution ownership

\[
owner_{exec}(x)=S
\]

表示 runtime entity \(x\) 的执行责任归 RuntimeScope \(S\)。

应唯一或层级唯一。

---

## 4.3 Coalition participation

\[
\mu_{coal}(a,K,t)
\]

表示 Agent 在时间/run \(t\) 中参与 Coalition \(K\)。

通常临时。

---

## 4.4 Visual membership

\[
\mu_{vis}(n,V)
\]

纯展示关系。

---

## 4.5 Frozen rule

内核 MUST NOT 通过一个单字段：

```text
groupId
```

无区别地承载上述四种关系。

---

# 5. Literature-Aligned Formal AgentGroup Object

本文冻结的广义 AgentGroup：

\[
\boxed{
G=
(A,R,C,\rho,\kappa,F,N,\Gamma,\partial,\Pi,X,\mathcal S)
}
\]

---

## 5.1 \(A\): Members

成员集合：

\[
A=A_{agent}\cup A_{subgroup}
\]

MAY 包含：

- atomic Agent；
- Holon；
- child Organization。

---

## 5.2 \(R\): Roles

角色集合。

角色 SHOULD 表示组织功能位置，而非 model/persona identity。

---

## 5.3 \(C\): Capabilities

能力集合。

可包括：

```text
web_search
coding
formal_verification
optics_reasoning
evidence_review
git_write
human_approval
```

Capability 是 organization reconfiguration 的重要输入。

---

## 5.4 \(\rho\): Role assignment

\[
\rho\subseteq A\times R
\]

---

## 5.5 \(\kappa\): Capability possession

\[
\kappa\subseteq A\times C
\]

---

## 5.6 \(F\): Functional structure

\[
F=(Goals,Missions,Plans,Dependencies)
\]

包括：

- organization goals；
- mission decomposition；
- tasks；
- success conditions。

来源主要为 MOISE+ functional specification / organizational MAS。

---

## 5.7 \(N\): Normative / Governance structure

\[
N=(Obligations,Permissions,Prohibitions,Invariants)
\]

例如：

```text
Verifier MUST NOT self-verify its own implementation result.
Only gate-PASS artifacts MAY be promoted.
Worker self-report MUST NOT become Evidence automatically.
External side effect MUST use Ordarium authority.
```

---

## 5.8 \(\Gamma\): Internal interaction graph

\[
\Gamma=(V,E,\tau_V,\tau_E)
\]

节点可以是：

- Agent；
- Role instance；
- Tool；
- Artifact；
- Holon；
- gate。

Edge 可包括：

```text
message
handoff
delegation
data
evidence
validation
aggregation
control
retry
```

---

## 5.9 \(\partial\): Open boundary

\[
\partial G=(I,O,Ctl,Gov)
\]

分别表示：

- data input；
- data output；
- control interface；
- governance/evidence interface。

后续可增强为 typed protocol boundary。

---

## 5.10 \(\Pi\): Internal policy

\[
\Pi=
(
\pi_{route},
\pi_{schedule},
\pi_{retry},
\pi_{resource},
\pi_{selection}
)
\]

---

## 5.11 \(X\): Runtime state

\[
X_t
\]

可包含：

- active attempts；
- messages；
- current assignments；
- budget；
- evidence state；
- memory；
- pending approvals；
- local control state。

---

## 5.12 \(\mathcal S\): Observable behavior semantics

\[
\mathcal S(G)
\]

表示外部环境可观察到的合法行为集合或行为分布。

确定性简化：

\[
\mathcal S(G)\subseteq \Sigma_\partial^*
\]

随机 LLM 情况：

\[
\mathcal S(G)
=
P(Y_{0:T}\mid U_{0:T})
\]

---

# 6. Four-Layer Semantic Stack

本文冻结以下四层模型：

\[
\boxed{
\mathfrak G=
(
\mathfrak O,
\mathfrak C,
\mathfrak B,
\mathfrak T
)
}
\]

---

## 6.1 Layer O — Organizational Semantics

\[
\mathfrak O=(A,R,C,\rho,\kappa,F,N)
\]

文献根：

- AGR / OCMAS；
- MOISE+；
- OMACS；
- Normative MAS。

解决：

> 谁、为什么、凭什么、按什么规则组成这个组织？

---

## 6.2 Layer C — Communication / Computation Semantics

\[
\mathfrak C=(\Gamma,\Pi,X)
\]

文献根：

- team decision；
- decentralized control；
- graph-based MAS；
- GPTSwarm；
- G-Designer；
- AgentPrune。

解决：

> Group 内部如何实际协作？

---

## 6.3 Layer B — Boundary / Compositional Semantics

\[
\mathfrak B=(I,O,Ctl,Gov,Protocol)
\]

文献根：

- open systems；
- decorated / structured cospans；
- wiring operads；
- interface theories；
- Information Bottleneck。

解决：

> Group 如何作为一个独立模块与外部世界交互？

---

## 6.4 Layer T — Transformation Semantics

\[
\mathfrak T=(Rewrite,Refinement,Equivalence,ProofObligations)
\]

文献根：

- algebraic graph transformation；
- DPO；
- process algebra；
- interface refinement；
- organizational reorganization。

解决：

> 如何合法、安全地改变 Group？

---

# 7. Open-System Interpretation

## 7.1 Structured cospan interpretation

一个开放 AgentGroup 可抽象为：

\[
\boxed{
L(I_G)
\xrightarrow{i_G}
X_G
\xleftarrow{o_G}
L(O_G)
}
\]

其中：

- \(I_G\)：input boundary；
- \(O_G\)：output boundary；
- \(X_G\)：内部 network。

再用组织 decoration：

\[
\Omega_G=(A,R,C,F,N,\Pi)
\]

得到：

\[
\boxed{
\mathbb G=
(
L(I_G)\rightarrow X_G\leftarrow L(O_G),
\Omega_G
)
}
\]

该形式借用 open systems / structured cospans，不宣称现有 Palimpsest 已实现 categorical semantics。

---

## 7.2 Sequential composition

若：

\[
G_1:I\rightarrow J
\]

\[
G_2:J\rightarrow K
\]

可沿 \(J\) 组合：

\[
\boxed{
G_2\circ G_1
}
\]

概念上内部网络通过共享接口的 gluing/pushout 组合。

---

## 7.3 Parallel composition

\[
\boxed{
G_1\otimes G_2
}
\]

表示相互独立或并行的 Group 组合。

---

# 8. Operadic Interpretation of Nested Groups

Wiring-diagram operad 提供如下解释：

\[
w\in\mathcal W(B_1,\ldots,B_n;B)
\]

表示把多个 boxes：

\[
B_1,\ldots,B_n
\]

通过 wiring 组成宏 box \(B\)。

这特别适合：

```text
Searcher ─┐
Critic   ─┼─> ResearchHolon
Writer   ─┘
```

然后 ResearchHolon 可再次作为一个 box：

```text
ResearchHolon ─┐
VerifierHolon ─┼─> ProjectHolon
BuilderHolon  ─┘
```

因此：

\[
\boxed{
\text{Nested Holon}
\approx
\text{hierarchical substitution of open boxes}
}
\]

---

# 9. Boundary Semantics

## 9.1 Boundary is not merely exposed edges

一个成熟 Group boundary SHOULD 至少表达：

```text
inputs
outputs
control
governance
protocol
```

而不是简单收集所有跨 Group edge。

---

## 9.2 Assume–Guarantee contract

建议定义：

\[
\mathcal C_G=(Assume_G,Guarantee_G)
\]

例如：

### Assumptions

```text
Query is well-formed.
Budget >= B.
Required context handles are readable.
```

### Guarantees

```text
Output conforms to ReportSchema.
All critical factual claims carry evidence.
Cost <= C.
No external side-effect bypasses Ordarium.
```

---

## 9.3 Evidence Contract

Palimpsest 特别强化：

\[
\boxed{
O_G=(Result,Evidence)
}
\]

一个 Group 不仅输出：

```text
answer
```

还 SHOULD 能输出：

```text
evidence
provenance
gate results
validation traces
```

因此 Group interface 的重要扩展是：

\[
\boxed{
\text{what was produced}
+
\text{why it is trusted}
}
\]

---

# 10. Protocol-Level Interface

单纯 JSON schema 不足以描述交互。

未来 Group interface MAY 表示 protocol automaton，例如：

```text
READY
  ↓ receive Task
RUNNING
  ↓ may request Context*
VERIFYING
  ↓ must produce Evidence
DONE
```

此处与 Interface Automata / interface theory 对齐：

- input assumptions；
- output behaviors；
- temporal protocol；
- compatibility；
- refinement。

---

# 11. Holon Semantics

## 11.1 Definition

Holon：

\[
H=(G,\partial H,\pi_H)
\]

必须满足一个关键性质：

> 外部环境可以把整个内部 Group 当作单一主体使用。

---

## 11.2 Abstraction map

\[
\pi_H:
\mathcal S_{internal}
\rightarrow
\mathcal S_{external}
\]

例如内部：

```text
Scout A
Scout B
Verifier
Writer
```

外部只观察：

```text
accept(task)
status()
emit(report)
emit(evidence)
fail(reason)
```

---

## 11.3 Holon extraction criterion

一个组织子结构适合提升为 Holon，至少需要：

1. 内部组织 coherent；
2. 边界可定义；
3. 外部可通过较小接口使用；
4. 内部失败能合理投影为外部状态；
5. 其行为能被 macro-agent contract 描述。

---

# 12. Interface Compressibility and Information Bottleneck

令：

- \(X_G\)：完整内部状态；
- \(Z_G\)：Group 暴露的 interface state；
- \(Y_{ext}\)：外部任务真正相关变量。

借用 Information Bottleneck：

\[
\mathcal L_{IB}
=
I(X_G;Z_G)
-
\beta I(Z_G;Y_{ext})
\]

理想边界：

- \(I(X_G;Z_G)\) 较小：不暴露过多内部细节；
- \(I(Z_G;Y_{ext})\) 足够大：保留外部真正需要的信息。

本文不宣称这是经典 AgentGroup 定义。

它被标记为：

> **Literature-adapted / Palimpsest research hypothesis**

---

# 13. Group Quality: No Universal Scalar

## 13.1 Context dependence

质量必须条件化于：

\[
\tau = task
\]

与：

\[
\mathcal E = environment
\]

因此：

\[
\boxed{
\mathbf Q(G\mid\tau,\mathcal E)
}
\]

---

## 13.2 Feasibility gate first

在优化前先定义：

\[
F(G)\in\{0,1\}
\]

检查：

- goals covered；
- roles covered；
- capabilities available；
- policy satisfied；
- interface compatible；
- hard invariants preserved。

若：

\[
F(G)=0
\]

则组织不可行，不进入 Pareto 优化。

---

# 14. Quality Vector

本文建议质量向量：

\[
\boxed{
\mathbf Q(G)
=
(U,S,M,I,-C,R,V,O)
}
\]

---

## 14.1 \(U\): Task utility

性能、accuracy、pass rate、reward 等。

---

## 14.2 \(S\): Synergy

\[
S(G)
=
U(G)
-
U_{\text{decomposed}}(G)
\]

回答：

> 联合工作是否产生了超过成员独立工作的价值？

---

## 14.3 \(M\): Modularity / near-decomposability

一个简单候选量：

\[
M(G)=
1-
\frac{
W(\partial G)
}{
W(E_{internal})+W(\partial G)+\epsilon
}
\]

但这只能作为一项指标，而不是 Group 的定义。

---

## 14.4 \(I\): Interface quality

衡量：

- interface size；
- sufficiency；
- protocol simplicity；
- boundary stability；
- hidden internal complexity。

---

## 14.5 \(C\): Coordination cost

LLM-MAS 尤其需要：

\[
C=
\lambda_t T_{token}
+
\lambda_l L_{latency}
+
\lambda_m N_{message}
+
\lambda_\$ Cost
\]

AgentPrune / G-Designer 一类现代工作直接说明 communication topology 和 token overhead 是一级问题。

---

## 14.6 \(R\): Robustness

对：

```text
agent failure
hallucination
malicious agent
tool failure
timeout
context corruption
```

的鲁棒性。

可写：

\[
R(G)
=
\mathbb E_{\omega\sim\Omega}
U(G;\omega)
\]

---

## 14.7 \(V\): Verifiability

Palimpsest 特别重视：

- evidence coverage；
- provenance；
- independent verification；
- gate coverage；
- replayability。

简单候选：

\[
V(G)=
\frac{
\# verified\ critical\ claims
}{
\# critical\ claims
}
\]

---

## 14.8 \(O\): Observability / Operability

包括：

- health observability；
- progress；
- diagnosability；
- pause；
- cancel；
- retry；
- reconfigure；
- resource adjustment。

---

# 15. Pareto View of Good Groups

“好的 Group” SHOULD 定义为任务条件下的 Pareto-efficient organization：

\[
\boxed{
G^*
\in
ParetoFront\{
\mathbf Q(G\mid\tau,\mathcal E)
\}
}
\]

不同运行模式可选不同 operating point：

```text
cheap mode      → emphasize cost
fast mode       → emphasize latency
reliable mode   → emphasize robustness + evidence
research mode   → emphasize quality + evidence
```

---

# 16. Coalition Value and Group Value

经典 coalition formation 常定义：

\[
v(C)
\]

并搜索：

\[
\max_{\mathcal P}
\sum_{C\in\mathcal P}v(C)
\]

本文继承其：

- coalition value；
- synergy；
- coalition structure search；

但明确：

\[
\boxed{
Coalition \neq full AgentGroup semantics
}
\]

因为 \(v(C)\) 通常不包含：

- internal interface；
- runtime ownership；
- evidence governance；
- stable identity；
- protocol；
- compositional behavior。

---

# 17. Quotient / Macro Graph

给定 micro AgentGraph：

\[
\mathcal G=(V,E)
\]

和组织划分或 Holon extraction：

\[
\mathcal P=\{G_1,\ldots,G_k\}
\]

可形成 macro graph：

\[
\boxed{
\mathcal G/\mathcal P
}
\]

每个 Group 收缩为宏节点。

### Micro graph

```text
Agent
Task
Tool
Evidence
Message
```

### Macro graph

```text
ResearchHolon
VerificationHolon
ImplementationHolon
```

未来 GUI SHOULD 能够在 micro / macro 两层切换。

---

# 18. Group Transformation Core Object

定义：

\[
\boxed{
T=
(r,\beta,\chi,PO,E)
}
\]

---

## 18.1 \(r\): Structural rewrite

推荐采用 typed graph rewrite 语义。

DPO 形式：

\[
L
\leftarrow
K
\rightarrow
R
\]

- \(L\)：matched old structure；
- \(K\)：preserved structure；
- \(R\)：new structure。

---

## 18.2 \(K\) and stable identity

\(K\) 自然对应：

> 变换中保持 identity 的对象。

这与 Palimpsest 当前 `definition_id` / stable graph identity 极其一致。

例如：

```text
A → B → C
```

改成：

```text
A → B → V → C
```

则：

```text
A/B/C  IDs preserved
V      fresh ID
```

---

## 18.3 \(\beta\): Boundary rewrite

结构变化后必须重新计算：

- inputs；
- outputs；
- crossing edges；
- typed ports；
- protocols；
- evidence boundary。

---

## 18.4 \(\chi\): Semantic change class

本文冻结四类：

```text
equivalent_refactor
refinement
behavior_change
contract_breaking
```

可与 Palimpsest 当前：

```text
metadata_only
backward_compatible
behavior_change
contract_breaking
```

做未来映射。

---

## 18.5 \(PO\): Proof obligations

每次变换产生需要证明的条件。

---

## 18.6 \(E\): Evidence

证明 obligations 的：

- deterministic validator output；
- tests；
- type checks；
- simulations；
- benchmark；
- human approval；
- formal proof；
- replay evidence。

---

# 19. Three Main Transformation Classes

## 19.1 T0 — Observational Refactor

\[
\boxed{
G\equiv_{\epsilon,\mathcal C}G'
}
\]

外部 contract-relevant 行为在容差内等价。

典型：

- change internal hierarchy；
- change internal routing；
- split worker roles；
- insert internal aggregator；
- encapsulate internal details。

---

## 19.2 T1 — Refinement

\[
\boxed{
G'\preceq G
}
\]

直觉：

- input assumptions 不更强；
- output guarantees 不更弱；
- safety/evidence guarantees MAY 变强。

例如：

```text
旧: result
新: result only after independent verifier PASS
```

---

## 19.3 T2 — Behavior Change

若不存在等价/ refinement 关系：

```text
new tool authority
new side effects
new external outputs
different failure semantics
```

必须显式治理。

---

# 20. Contract Breaking

若：

- input interface incompatible；
- output interface incompatible；
- protocol incompatible；
- key guarantees removed；

则：

\[
\boxed{
contract\_breaking
}
\]

不得伪装成 ordinary graph edit。

---

# 21. Primitive Organizational Algebra

组织关系层 MAY 包含：

\[
join(a,G)
\]

\[
leave(a,G)
\]

\[
assignRole(a,r)
\]

\[
unassignRole(a,r)
\]

\[
grantCapability(a,c)
\]

\[
revokeCapability(a,c)
\]

\[
formCoalition(A,\tau)
\]

这些操作不必改变 runtime encapsulation。

---

# 22. Primitive Holonic Algebra

Holonic / execution layer MAY 包含：

\[
encapsulate(G)\rightarrow H
\]

\[
inline(H)
\]

\[
H_2\circ H_1
\]

\[
H_1\otimes H_2
\]

\[
split(H,J)
\]

\[
merge(H_1,H_2)
\]

\[
rewireBoundary(H,p)
\]

其中 \(J\) 是 split 时新发现/合成的中间 interface。

---

# 23. Split is Boundary Discovery

Group split 不是简单：

\[
A=A_1\cup A_2
\]

真正要求：

\[
G
\approx
G_2\circ_JG_1
\]

必须找到：

\[
\boxed{
J=\text{new intermediate interface}
}
\]

因此：

\[
\boxed{
Split
=
Partition
+
Interface\ Synthesis
}
\]

---

# 24. Split Proof Obligations

一个 Split 至少 SHOULD 证明：

### Structural

\[
A_1\cup A_2=A
\]

若是 exclusive execution split：

\[
A_1\cap A_2=\varnothing
\]

### Identity

未重建成员 identity 保持。

### Capability feasibility

每个新 Group 的 Role requirement 有可行 Agent/Capability。

### Boundary validity

所有跨新边界 interaction 被合法接口承载。

### Contract

根据 change class 证明 equivalence/refinement 或显式声明 behavior change。

---

# 25. Merge Semantics

Merge：

\[
G'=merge(G_1,G_2)
\]

不应仅以“跨边界消息很多”为充分条件。

需同时评估：

- boundary cost reduction；
- specialization loss；
- internal coordination growth；
- policy conflict；
- role collision；
- evidence independence loss；
- failure isolation loss。

---

# 26. Holon Extraction

本文建议未来研究：

\[
ExtractHolon(S)
\]

给定：

\[
S\subseteq V
\]

寻找 boundary \(Z\)，使：

1. \(S\) 内部交互 coherent；
2. \(Z\) 较小；
3. \(Z\) 对外行为充分；
4. macro-agent 能替代 \(S\)。

候选条件：

\[
\boxed{
HolonCandidate
=
Modularity
+
InterfaceCompressibility
+
BehavioralSubstitutability
}
\]

---

# 27. Group Equivalence

## 27.1 Exact theoretical form

若：

\[
\mathcal S(G)=\mathcal S(G')
\]

可定义 exact behavioral equivalence。

---

## 27.2 LLM practical form

LLM 是 stochastic，因此实际采用：

\[
\boxed{
G\equiv_{\epsilon,\mathcal C}G'
}
\]

其中：

- \(\mathcal C\)：contract-relevant observations；
- \(\epsilon\)：允许偏差。

可比较：

```text
task success
output schema
evidence guarantees
side-effect authority
failure probability
latency tolerance
cost tolerance
```

不应要求逐 token 一致。

---

# 28. Substitutability

好的 Holon SHOULD 支持替换：

\[
G \leadsto G'
\]

而外部只依赖正式 contract。

这是：

- modularity；
- interface refinement；
- observational equivalence；

的共同结果。

因此：

\[
\boxed{
\text{Substitutability}
}
\]

是高质量 AgentGroup 的核心高级属性。

---

# 29. Transformation Cost

定义：

\[
C_T=
C_{rewire}
+
C_{interface}
+
C_{migration}
+
C_{validation}
+
C_{disruption}
\]

因此即使：

\[
\mathbf Q(G')\succ\mathbf Q(G)
\]

仍需考虑：

\[
Benefit(T)-C_T
\]

是否值得执行。

---

# 30. GroupAdvisor

未来 GroupAdvisor SHOULD 是 advisory，而不是 canonical writer。

输入：

- runtime traces；
- communication graph；
- token usage；
- role/capability data；
- failure statistics；
- evidence coverage；
- boundary traffic。

输出：

```text
SplitCandidate
MergeCandidate
ExtractHolonCandidate
InlineHolonCandidate
MoveMemberCandidate
RewireCandidate
```

---

## 30.1 Example: SplitCandidate

```yaml
group: Research
proposal:
  left: LiteratureSearch
  right: Synthesis

observations:
  internal_cluster_score: 0.83
  cross_partition_message_ratio: 0.18
  estimated_token_reduction: 0.31
  evidence_coverage_change: 0.00

boundary:
  proposed_interface:
    output: EvidenceBundle

classification: equivalent_refactor
```

---

## 30.2 Example: MergeCandidate

```yaml
groups:
  - Theory
  - Synthesis

observations:
  cross_boundary_message_ratio: 0.67
  duplicated_context_transfers_per_run: 4
  duplicated_roles:
    - analyst
  independent_governance_boundary: false

expected:
  token_change: -0.23
  communication_rounds: -1
```

---

# 31. Governance Principle

本文冻结：

\[
\boxed{
Proposal
\neq
Transformation
\neq
Activation
}
\]

一个优化器、LLM architect 或 GroupAdvisor MAY 提出 candidate。

它 MUST NOT 因此自动获得 canonical activation authority。

---

# 32. Evidence-Governed Transformation Pipeline

推荐未来：

```text
Organization Optimizer / LLM Architect / Human
                     │
                     ▼
          GroupTransformProposal
                     │
                     ▼
             Typed Graph Rewrite
                     │
                     ▼
      ┌──────────────┼───────────────┐
      ▼              ▼               ▼
 Structural    Organizational     Interface
 Validation     Feasibility       Validation
      └──────────────┼───────────────┘
                     ▼
             Proof Obligations
                     │
                     ▼
              Evidence Bundle
                     │
                     ▼
              Governance Gate
                     │
                     ▼
               Atomic Activate
```

---

# 33. Atomic Activation

Group transformation SHOULD obey:

\[
\boxed{
prepare
\rightarrow
validate
\rightarrow
activate
}
\]

不得出现：

```text
move half members
crash
leave half old topology + half new topology
```

这与 Palimpsest 当前 ArchitectureRevision atomicity 问题属于同一类原则。

---

# 34. Identity Rules

本文与 G9-D stable graph identity 方向对齐。

## 34.1 Preserved entities

若逻辑实体仅：

- rename；
- move；
- role adjustment；
- payload adjustment；

且 change semantics 判定为同一 definition，则 stable identity SHOULD 保持。

## 34.2 Created entities

新：

- Agent definition；
- Holon；
- Group；
- edge；
- interface port；

必须 fresh ID。

## 34.3 Deleted entities

Identity SHOULD retire，不由普通 allocator 自动复用。

## 34.4 Rewrite and identity

DPO 中 \(K\) 可作为 identity continuity 的数学对应。

---

# 35. Relationship to Current Palimpsest

## 35.1 AgentGraph

当前 AgentGraph 可视为：

\[
\Gamma
\]

和部分 structural syntax。

它不是完整 Organization。

---

## 35.2 `definition_id`

当前：

```text
AgentGraph node id
→ TaskProposal.definitionId
→ TaskSpec.definition_id
→ Runtime/Trace
```

是未来 Group transformation identity continuity 的重要基础。

---

## 35.3 RuntimeSubgraph v1

当前 RuntimeSubgraph v1 更接近：

```text
runtime-addressable scope
```

而不是完整 RuntimeScope/Holon。

它目前没有完整：

- local scheduler；
- retry；
- memory；
- lifecycle；
- ports；
- budget；
- behavior contract。

本文不得倒逼现有实现过度宣称。

---

## 35.4 VisualGroup

当前 visual group MUST 继续被视为 presentation object，除非未来显式 promote 成 Organization/Holon。

---

## 35.5 GraphPatch

GraphPatch 是未来 GroupTransform 的重要先导，但当前只处理 AgentGraph semantic edit。

未来 GroupTransform MAY 包含：

```text
organizationalPatch
graphRewrite
boundaryRewrite
proofObligations
```

而不应简单把所有 Group 语义塞入 GraphPatch。

---

# 36. Recommended Future Schema Separation

长期建议：

```text
AgentGroup            ← UX umbrella

OrganizationDefinition
  id
  members
  roles
  capabilities
  assignments
  goals
  norms

HolonDefinition
  id
  organizationId
  internalGraph
  interface
  abstractionPolicy

RuntimeScopeDefinition
  id
  owner
  schedulerPolicy
  retryPolicy
  budgetPolicy
  lifecycle

CoalitionInstance
  id
  members
  task
  runId
  expiresAt

VisualGroup
  id
  label
  members
  presentation
```

这些对象 MAY 互相关联，但 MUST NOT 被一个 polymorphic `Group` JSON 隐式混合。

---

# 37. Literature Alignment Matrix

| Frozen construct | Primary lineage | Alignment type |
|---|---|---|
| Agent / Group / Role | AGR / OCMAS | Direct inheritance |
| Structural / Functional / Deontic | MOISE+ | Direct inheritance |
| Capabilities + dynamic role assignment | OMACS | Direct inheritance |
| Coalition value / structure | Coalition formation | Direct inheritance |
| Overlapping membership | Overlapping coalition literature | Direct inheritance |
| Holon as super-agent | Holonic MAS | Direct inheritance |
| Near-decomposable organization | Simon / organization design | Adaptation |
| Open boundary | Fong / cospans / structured cospans | Adaptation |
| Hierarchical box composition | Wiring operads | Adaptation |
| Interface compatibility / refinement | Interface Automata / interface theory | Adaptation |
| Behavioral equivalence | Process algebra | Adaptation |
| DPO graph rewrite | Algebraic graph transformation | Direct formal machinery |
| Boundary compression | Information Bottleneck | New application |
| Evidence contract | Normative MAS + Palimpsest | Palimpsest synthesis |
| Stable definition→runtime→trace identity | software/provenance ideas + Palimpsest | Palimpsest synthesis |
| Proof-obligation GroupPatch | graph rewrite + evidence governance | Palimpsest synthesis |
| Governed activation of auto-reorganization | OMACS + Palimpsest governance | Palimpsest synthesis |
| Task-aware LLM topology | GPTSwarm / G-Designer | Modern LLM evidence |
| Communication/token cost | AgentPrune / G-Designer | Modern LLM evidence |

---

# 38. What Is Not Claimed as Original

本文明确不将以下视为 Palimpsest 原创：

- Agent/Group/Role；
- coalition formation；
- role assignment；
- capability-based organization；
- holonic agent；
- hierarchical organization；
- open system；
- cospan composition；
- wiring operad；
- interface refinement；
- bisimulation；
- graph rewriting；
- information bottleneck；
- dynamic topology optimization。

---

# 39. Candidate Original Synthesis

Palimpsest 最有潜力形成原创贡献的部分是以下组合，而不是单个组件。

## 39.1 Evidence-Governed Open Agent Organization

\[
\boxed{
Organization
+
OpenBoundary
+
EvidenceContract
+
GovernedActivation
}
\]

---

## 39.2 Stable Cross-Layer Organizational Identity

\[
\boxed{
Definition
\rightarrow
Task
\rightarrow
Attempt
\rightarrow
Trace
\rightarrow
Governance
}
\]

---

## 39.3 Typed Group Transformation Calculus

\[
\boxed{
GraphRewrite
+
BoundaryRewrite
+
IdentityContinuity
+
ChangeClassification
+
ProofObligations
+
Evidence
}
\]

---

## 39.4 Governance-Aware Adaptive Organization

自动优化器只提出：

\[
candidate
\]

随后：

\[
rewrite
\rightarrow
proof
\rightarrow
evidence
\rightarrow
activate
\]

由独立 governance kernel 执行。

---

# 40. Research Hypotheses

## H1 — Boundary Compression Hypothesis

好的 Holon 可使用较小 interface \(Z_G\) 保留对外任务相关信息：

\[
I(X_G;Z_G)
\text{ relatively low}
\]

同时：

\[
I(Z_G;Y_{ext})
\text{ sufficiently high}
\]

---

## H2 — Evidence-Preserving Refactor Hypothesis

存在大量：

\[
G\rightarrow G'
\]

使：

\[
Cost(G')<Cost(G)
\]

同时：

\[
EvidenceContract(G')
\succeq
EvidenceContract(G)
\]

且 task utility 变化在容差内。

---

## H3 — Governance-Aware Topology Hypothesis

若 optimization objective 不仅包含：

```text
accuracy
token
latency
```

还包含：

```text
evidence quality
failure isolation
boundary complexity
independent verification
```

则得到的最优组织拓扑将系统性不同于只优化 task performance / token 的 topology。

---

## H4 — Holon Extraction Hypothesis

存在可观测条件，使：

\[
S\subseteq V
\]

可自动识别为：

\[
HolonCandidate
\]

其判断可由：

\[
Modularity
+
InterfaceCompressibility
+
BehavioralSubstitutability
\]

联合实现。

---

# 41. Research Program

建议后续研究阶段：

### AGT-R1 — Formal Object

冻结：

- Organization；
- Holon；
- RuntimeScope；
- Coalition；
- VisualGroup。

### AGT-R2 — Interface

定义：

- typed ports；
- evidence contract；
- protocol；
- compatibility。

### AGT-R3 — Quality

建立：

- runtime metrics；
- Group quality vector；
- Pareto analysis。

### AGT-R4 — Transformation

实现：

- extract；
- inline；
- split；
- merge；
- rewire。

### AGT-R5 — Equivalence

设计 LLM-compatible:

\[
\equiv_{\epsilon,\mathcal C}
\]

### AGT-R6 — GroupAdvisor

基于 trace/communication/evidence 产生候选变换。

### AGT-R7 — Governed Activation

与 Palimpsest evidence/governance kernel 整合。

---

# 42. Engineering Freeze Rules

在本文被下一版理论规格明确取代之前：

1. **MUST NOT** 把 VisualGroup 与 RuntimeScope 合并。
2. **MUST NOT** 假设所有 organizational membership 是 tree。
3. **MUST NOT** 用单一 `groupId` 同时表达 organization、runtime ownership、coalition 和 visual membership。
4. **MUST NOT** 把“通信 cluster”自动视为 AgentGroup。
5. **MUST NOT** 让 topology optimizer 直接写 canonical organization。
6. **MUST** 将 stable identity 与 group transformation 一并考虑。
7. **MUST** 将 Split 视为 partition + boundary/interface synthesis。
8. **MUST** 将 Holon 理解为外部可替换的 macro-agent，而不是画布框。
9. **SHOULD** 将 Group quality 建模为 task/environment conditioned multi-objective problem。
10. **SHOULD** 为 behavior-changing transformations 产生显式 proof obligations。
11. **SHOULD** 将 evidence/provenance 作为 Group output contract 的一部分。
12. **MAY** 使用 category-theoretic machinery 作为组合语义，但不得要求普通产品代码直接暴露 category theory 术语。

---

# 43. Recommended Product-Layer Vocabulary

用户看到的 UX 可以继续使用：

```text
AgentGroup
```

但高级视图 SHOULD 能显示具体语义 badge：

```text
组织 Organization
执行域 Runtime Scope
复合智能体 Holon
临时联盟 Coalition
视觉组 Visual
```

例如：

```text
Research Team
[Organization] [Holon]
```

或：

```text
Safety Committee
[Organization]
```

或：

```text
Debate Panel #42
[Coalition]
```

---

# 44. Recommended Future GUI Interpretation

一个节点集合可以同时显示：

```text
┌ Research ──────────────────┐
│ [Organization] [Holon]     │
│                            │
│ Searcher                    │
│ Critic                      │
│ Synthesizer                 │
└────────────────────────────┘
```

但 UI SHOULD 允许：

```text
Expand Holon
Collapse Holon
Show organizational memberships
Show runtime ownership
Show coalition overlays
Show visual groups
```

这些是不同 projection。

---

# 45. Canonical High-Level Definition

本文最终冻结：

> **AgentGroup（产品泛称）是由多个 agent、roles、capabilities、goals、norms 与 interaction structure 构成，并可选择通过显式边界对外组合和运行的多主体组织。**

当其具有：

- 明确开放接口；
- 外部可将其作为单一主体使用；
- 内部复杂度被封装；

则它进一步构成 **Holon**。

---

# 46. Canonical Definition of a Good AgentGroup

本文冻结：

\[
\boxed{
\text{Good AgentGroup}
=
\text{feasible}
+
\text{task-effective}
+
\text{near-decomposable}
+
\text{interface-compressible}
+
\text{robust}
+
\text{observable}
+
\text{verifiable}
+
\text{substitutable}
}
\]

同时满足合理的：

\[
communication / token / latency / coordination
\]

成本。

不存在单一 task-independent optimum。

---

# 47. Canonical Definition of a Good Group Transformation

本文冻结：

\[
\boxed{
\text{Good Transformation}
=
\text{valid rewrite}
+
\text{identity continuity}
+
\text{organizational feasibility}
+
\text{boundary correctness}
+
\text{declared behavioral relation}
+
\text{proof obligations}
+
\text{evidence}
+
\text{atomic governed activation}
}
\]

---

# 48. Literature References

以下参考文献用于理论对齐。本文不要求工程实现直接依赖其全部形式系统。

### [R1] AGR / OCMAS

Jacques Ferber, Olivier Gutknecht, Fabien Michel.  
**From Agents to Organizations: An Organizational View of Multi-Agent Systems.**  
AOSE 2003, LNCS 2935, pp. 214–230.  
DOI: `10.1007/978-3-540-24620-6_15`  
https://doi.org/10.1007/978-3-540-24620-6_15

### [R2] MOISE+

Jomi Fred Hübner, Jaime Simão Sichman, Olivier Boissier.  
**MOISE+: Towards a Structural, Functional, and Deontic Model for MAS Organization.**  
AAMAS 2002.  
DOI: `10.1145/544741.544858`  
https://doi.org/10.1145/544741.544858

### [R3] OMACS / Capability-Based Adaptive Organizations

Scott A. DeLoach, Walamitien H. Oyenan, Eric T. Matson.  
**A Capabilities-Based Model for Adaptive Organizations.**  
Autonomous Agents and Multi-Agent Systems, 16(1), 13–56, 2008.  
DOI: `10.1007/s10458-007-9019-4`  
https://doi.org/10.1007/s10458-007-9019-4

### [R4] OMACS Framework

Scott A. DeLoach.  
**OMACS: A Framework for Adaptive, Complex Systems.**  
2009.  
DOI: `10.4018/978-1-60566-256-5.ch004`  
https://doi.org/10.4018/978-1-60566-256-5.ch004

### [R5] Holonic Multi-Agent Systems

Christian Gerber, Jörg Siekmann, Gero Vierke.  
**Holonic Multi-Agent Systems.**  
DFKI Research Report RR-99-03, 1999.  
DOI: `10.22028/D291-24979`  
https://doi.org/10.22028/D291-24979

### [R6] Coalition Structure Generation

Tuomas Sandholm, Kate Larson, Martin Andersson, Onn Shehory, Fernando Tohmé.  
**Coalition Structure Generation with Worst Case Guarantees.**  
Artificial Intelligence, 111(1–2), 209–238, 1999.  
DOI: `10.1016/S0004-3702(99)00036-3`  
https://doi.org/10.1016/S0004-3702(99)00036-3

### [R7] Quantitative Organizational Design

Bryan Horling, Victor Lesser.  
**Quantitative Organizational Models for Large-Scale Agent Systems.**  
MMAS 2004, LNCS 3446, pp. 121–135.  
DOI: `10.1007/11512073_9`  
https://doi.org/10.1007/11512073_9

### [R8] Open and Interconnected Systems

Brendan Fong.  
**The Algebra of Open and Interconnected Systems.**  
DPhil thesis, University of Oxford, 2016.  
DOI: `10.5287/ora-qromnvbe2`  
https://ora.ox.ac.uk/objects/uuid:79a23c8c-81a5-4cf1-a108-29ba7dfd8850

### [R9] Structured Cospans

John C. Baez, Kenny Courser.  
**Structured Cospans.**  
Theory and Applications of Categories / arXiv, 2019.  
https://arxiv.org/abs/1911.04630

### [R10] Wiring Operads

Dylan Rupel, David I. Spivak.  
**The Operad of Temporal Wiring Diagrams: Formalizing a Graphical Language for Discrete-Time Processes.**  
2013.  
https://arxiv.org/abs/1307.6894

### [R11] Interface Automata

Luca de Alfaro, Thomas A. Henzinger.  
**Interface Automata.**  
ESEC/FSE 2001.  
DOI: `10.1145/503209.503226`  
https://doi.org/10.1145/503209.503226

### [R12] Algebraic Graph Transformation

Hartmut Ehrig, Karsten Ehrig, Ulrike Prange, Gabriele Taentzer.  
**Fundamentals of Algebraic Graph Transformation.**  
Springer, 2006.  
https://link.springer.com/book/10.1007/3-540-31188-2

### [R13] Information Bottleneck

Naftali Tishby, Fernando C. Pereira, William Bialek.  
**The Information Bottleneck Method.**  
2000.  
https://arxiv.org/abs/physics/0004057

### [R14] GPTSwarm

Mingchen Zhuge et al.  
**GPTSwarm: Language Agents as Optimizable Graphs.**  
ICML 2024.  
https://proceedings.mlr.press/v235/zhuge24a.html

### [R15] G-Designer

Guibin Zhang et al.  
**G-Designer: Architecting Multi-Agent Communication Topologies via Graph Neural Networks.**  
ICML 2025.  
https://proceedings.mlr.press/v267/zhang25cu.html

### [R16] AgentPrune

Guibin Zhang et al.  
**Cut the Crap: An Economical Communication Pipeline for LLM-Based Multi-Agent Systems.**  
ICLR 2025.  
https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html

---

# 49. Provenance of the Frozen Theory

## 49.1 Literature-derived

直接继承：

```text
Agent / Group / Role
capabilities
coalition
holon
organizational structure/function/norm
open systems
interface refinement
graph rewriting
```

## 49.2 Literature-adapted

跨域适配：

```text
structured cospan → open AgentGroup
operad → nested Holon
Information Bottleneck → group boundary quality
bisimulation/refinement → LLM group substitutability
DPO K → stable definition identity continuity
```

## 49.3 Palimpsest synthesis

本文冻结为后续原创方向：

```text
Evidence-Governed Open Agent Organization

Definition → Runtime → Trace → Governance stable identity

GroupTransform =
  graph rewrite
  + boundary rewrite
  + identity continuity
  + semantic classification
  + proof obligations
  + evidence

Optimizer Proposal
  !=
Canonical Activation
```

---

# 50. Final Frozen Statement

在 `PLMP-AGT-0 v0.1` 之后，Palimpsest 中所有与 AgentGroup 相关的设计讨论 SHOULD 采用如下理解：

\[
\boxed{
\text{AgentGroup is not a box around agents.}
}
\]

它是一个可能具有组织、能力、角色、目标、规范、内部交互、开放边界、运行策略和外部行为语义的复合多主体对象。

其中：

\[
\boxed{
Organization
\neq
Holon
\neq
RuntimeScope
\neq
Coalition
\neq
VisualGroup
}
\]

但这些对象可以组合形成用户层面的 AgentGroup。

好的 AgentGroup 不是静态拓扑，而是：

\[
\boxed{
\text{task-conditioned, feasible, composable, verifiable organization}
}
\]

好的 AgentGroup Transformation 不是重新绘图，而是：

\[
\boxed{
\text{typed, identity-preserving, contract-aware, evidence-governed rewrite}
}
\]

这是后续 Palimpsest AgentGroup、Runtime Subgraph v2、GroupAdvisor、Executable Architecture 与自动组织优化工作的理论起点。

---

**END OF FROZEN SPEC — PLMP-AGT-0 v0.1**
