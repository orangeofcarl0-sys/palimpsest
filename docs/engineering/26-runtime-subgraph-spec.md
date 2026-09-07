# Runtime Subgraph v1 规格（scope 身份 + 边界 + 执行归属）

> **Spec ID**：`PLMP-GRAPH-3` ｜ 状态：**已交付**（2026-09-07；演进线 G5 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §4；验收 RSUB-A01–A05 全绿〔49 文件 / 292 测试〕+ 浏览器冒烟：运行时徽章/嵌套视口/编译通过）
> **权威序**：IR 以 24 号、patch 以 25 号为准；提案/TaskSpec 合同以 18 号/03 号为准；VIS 以 17 号为准。
> **总纲**：subflow 获得 `mode`：`editorial`（缺省，编译期展开，行为逐字节不变）| `runtime`。runtime 子图 v1 ＝ **声明式 scope 身份 + 输入/输出边界（既有 data 边推导）+ 任务执行归属**——并发 policy 明确留给 G6，本规格不假装调度已感知 scope。

## 1. Scope

### 1.1 身份链（三层同字段语义）

| 层 | 字段 | 规则 |
|---|---|---|
| CanvasDoc v2 | subflow 节点 `mode?: "runtime"` | 缺省＝editorial；仅 subflow 可带；仅取值 `"runtime"`（单一编码，无显式 "editorial"） |
| AgentGraph IR | subgraph 节点 `mode?: "runtime"` | 同上；其余 kind 带 mode 即拒 |
| 投影 | `GraphTask.scopeId?` / `TaskDetails` | 缺席省略（术语隔离：scopeId 是人话 key） |

### 1.2 编译语义（就近归属）

`compileAgentGraph`：agent 节点的 `scopeId`＝沿 scope 链向上**最近的 `mode:"runtime"` subgraph** 的 id；无 runtime 祖先＝字段缺席。editorial 子图可嵌套于 runtime 子图内（纯分组，不改归属）。`TaskProposal.scopeId?`（提案面加法式可选，role/suggestedSkills 同款纪律）→ `proposalTaskSpecs` 透传 `TaskSpec.scope_id`（**SDS-4 例外**：缺省省略；canonical JSON 键排序 ⇒ 无 scope 项目 digest 逐字节不变，parity/replay fixture 不动）。TaskEnvelope 不加字段（worker 无需 scope；合同面最小触碰）。

### 1.3 投影与面板

`orchestrationGraph` 任务视图加法式可选 `scopeId`；面板：subflow 头部 `运行时` 徽章（mode=runtime）、Inspector 子图 mode 切换、TaskDetails 显示 scope。

## 2. Non-goals

scope 级并发/重试/记忆 policy（G6+）、scope 级 attempt 树、scope 声明事件（scope 随任务声明进 IR，不单独立事件）、宿主侧 scope 感知。

## 3. 合同触点 / 迁移 / digest

- **TaskSpec**：加法式可选 `scope_id`（缺省省略；键序 canonical ⇒ 既有 fixture/digest 零扰动；[ACC-02] 式证明＝全量测试原样绿）。**无新迁移**（任务/IR 以 JSON blob 存储，无新列）。
- **TaskProposal / GraphTask**：加法式可选字段。
- **CanvasDoc v2 / AgentGraph**：加法式可选 `mode`，缺省语义与既有文档逐字节一致。
- 事件：零新增、零 digest 影响。

## 4. 验收

| 项 | 断言 |
|---|---|
| RSUB-A01 | doc/IR 解析：mode 仅 subflow/subgraph 可带、仅 "runtime" 合法、错位/错值 fail-closed；round-trip 保真 |
| RSUB-A02 | 编译归属：runtime 子图成员 → scopeId＝runtime 祖先 id；editorial 嵌套不改归属；无 runtime 祖先＝键缺席（own-property 断言） |
| RSUB-A03 | `TaskProposal.scopeId` → `TaskSpec.scope_id` 透传；无 scope 的 TaskSpec canonical JSON 与既有 golden 逐字节一致 |
| RSUB-A04 | orchestrationGraph：scope 任务投影带 scopeId，无 scope 任务键缺席（live rig） |
| RSUB-A05 | patch 路径：addNodes 带 runtime subgraph + moveScope 成员 → unload → 编译归属正确（G4 协议可建 runtime 子图） |
| 浏览器 | 子图 mode 切换 → 徽章显示 → 校验提案通过；TaskDetails 显示 scope |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-GRAPH-3，G5）：mode 三层身份链、就近 runtime 祖先归属、TaskSpec/TaskProposal/GraphTask 三处加法式可选字段（无迁移、digest 零扰动论证）、TaskEnvelope 明确不加字段、并发留 G6。 |
| 2026-09-07 | **交付**：CanvasDoc subflow `mode?: "runtime"`（单一编码）→ IR subgraph mode → `compileAgentGraph` 就近 runtime 祖先归属（editorial 嵌套不改归属）→ `TaskProposal.scopeId`/`TaskSpec.scope_id`（SDS-4 缺省省略，canonical 键序 ⇒ 无 scope golden 逐字节断言）→ `GraphTask.scopeId` 投影；lift/unload/patch（A05：patch 建 runtime 子图编译归属正确）全链携带；面板运行时徽章 + Inspector mode 切换 + TaskDetails scope 行；RSUB-A01–A05 全绿（含 scope-less TaskSpec canonical golden 断言）；浏览器冒烟通过。 |
| 2026-09-07 | G9-A（30 号）修订：`GraphTask` 增加 `definitionId?`（与 `scopeId` 同款加法式缺席省略）；`task_id`（运行时实体）与 definitionId（定义身份）正式分离，本规格的归属链语义不变。 |
