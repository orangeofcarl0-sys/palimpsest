# Definition Lineage 规格（规范定义身份 + 修订锚定断点）

> **Spec ID**：`PLMP-GRAPH-4` ｜ 状态：**已交付**（2026-09-07；G9-A 批次，母体＝`audits/G9-SEMANTIC-CLOSURE-ASSESSMENT.md` §1/§2；验收 ID-A01–A03 + DBG-REV-A01–A02 全绿〔53 文件 / 310 测试〕）
> **权威序**：IR 与编译以 24 号为准；Canvas 身份以 23 号为准；调试 hold 的七问框架以 29 号为基（§1.1 修订行被本规格**显式取代**）；SDS-4 例外以 03 号为准。
> **总纲**：让已存在的 graph-native 架构语义闭合，而不是增加表面能力。本轮解决两条已实证的身份裂缝：authoring identity ≠ canonical identity（谱系在编译时断裂）、debugger hold 跨 plan revision 误附着（治理身份 bug）。

## 1. 问题（审计实证，见母体审计 §1/§2）

1. `Canvas n17 → "Research" → task-3 → attempt a82` 之间没有持久 lineage：`compileAgentGraph` 丢 node.id，`proposalTaskSpecs` 按声明顺序重生成 `task-1..N`。
2. `task_holds` 以 `(project_id, task_id)` 为主键、HOLD_SET 无修订字段；plan 修订重排任务后，旧修订给 A 挂的断点静默套在语义全新的 X 上（复现：`GraphTask(task-1).held === true`，objective 已换成 X）。

## 2. 设计

### 2.1 definition identity（定义身份 ≠ 运行时实体 id）

- 语义钉死：`definition_id = AgentGraph node id`（作者视角的稳定定义）；`task_id = 运行时/规范任务实体 id`。**二者不是同一概念；禁止伪造 `definition_id = task_id`**。
- 编译链全程携带：`AgentGraphNode.id → TaskProposal.definitionId → TaskSpec.definition_id → ProjectIR → GraphTask.definitionId → Satellite/Trace.definitionId`。运行时图显式输出 `definitionId / taskId / attemptId`，不再隐含二者同体。
- `compileAgentGraph` 对 agent 任务**恒定**输出 `definitionId: node.id`（IR 节点 id 恒存在）；spec-first 路径（preset/手写提案）缺席＝"该提案未经稳定图 IR 出源或对账"，不合成。
- 提案边界完整性：`validateProjectProposal` 新诊断 `DUPLICATE_DEFINITION_ID`——两个任务不得认领同一 definition（会把一个定义别名到两个运行时）。
- **legacy 语义**（SDS-4 例外）：`definition_id` 缺省省略、canonical JSON 键序 ⇒ 无 definition 项目 digest 逐字节不变（golden 断言：ID-A02）；replay fixture 零再生。`TaskEnvelope` **不加字段**（worker 无需定义身份，同 26 号 scope 先例）。

### 2.2 hold 修订锚定（取代 29 号 §1.1 "跨修订存活、不绑 revision" 裁决）

- 短期语义：`hold = (project_revision, task_id)`。`HOLD_SET` payload 加法式可选 `project_revision`（新 hold 一律携带当前修订）；`task_holds` 加列 `project_revision`（**M7**，投影表，无 digest/fixture 触点）。
- 消费规则（调度器）：
  - `hold.project_revision == 当前修订` → **active**：照旧拦截（READY 不激活、BLOCKED 不解锁）；
  - `hold.project_revision != 当前修订` → **stale（惰性）**：不再拦截任何任务；VIS 面显示"挂起·已过期"，可显式放行或**重挂**（重挂＝新 HOLD_SET 携带当前修订，天然可审计）；
  - `project_revision IS NULL`（legacy 事件/行）→ **active**（保守回退，保既有 fixture/老账本调度行为逐字节；回退语义在此明文登记，不沉默）。
- VIS：`GraphTask.held` 从 `boolean` 改为 `"active" | "stale"`（缺席＝未被 hold；面板徽章两态、放行按钮对两态都可用）。
- **长期语义（登记，不在本轮做）**：definition_id 落地后 hold 可锚定 definitionId——同 definition 显式 rebase（需可审计的 rebase 事件）、节点删除孤儿化、新节点复用 task_id 不继承。需要新事件类型与独立规格。

## 3. 合同触点

| 面 | 变更 | 纪律 |
|---|---|---|
| `TaskProposal` | +`definitionId?` | SDS-4 加法式 |
| `TaskSpec` | +`definition_id?`（nonEmpty string，同 scope_id 先例） | SDS-4 加法式；digest golden ID-A02 |
| `compileAgentGraph` | agent 任务恒输出 `definitionId: node.id` | 既有 compile 字节断言同轮更新（A02/A19/A21/GRAPH-A03/PATCH-A03）＝有意合同变更，无双格式 |
| `validateProjectProposal` | +`DUPLICATE_DEFINITION_ID` | 只在重复时触发，零既有扰动 |
| `HOLD_SET` payload | +`project_revision`（可选，≥0 整数） | SDS-4 加法式；legacy 事件缺省照常 |
| `task_holds` | **M7** `ALTER TABLE ... ADD COLUMN project_revision INTEGER`（可空） | 投影表；STRICT 表加列须带类型（实测） |
| `GraphTask` | +`definitionId?`；`held?: "active"\|"stale"` | web types/Panels 同轮更新，无双格式 |
| 卫星/Trace | +`definitionId?`（来自所属 task） | 缺席省略 |

## 4. 验收

| 项 | 断言 |
|---|---|
| ID-A01 | canvas node id 在 declaration 中存续为 definition identity：compile→proposal→specs→ProjectIR→GraphTask 全链 `n17/n18`；激活后卫星与 Trace 携带 `definitionId/taskId/attemptId` 三元 |
| ID-A02 | spec-first 提案键缺席：`Object.hasOwn(spec,"definition_id")===false`；解析往返仍缺席；canonicalDigest 与手写 legacy JSON 全等；带 definition_id 的 digest 确实不同（字段真实上链） |
| ID-A03 | 两任务认领同一 definitionId → `DUPLICATE_DEFINITION_ID`；互异 → 空诊断 |
| DBG-REV-A01 | r1 hold A → plan 重排（task-1=X, A→task-2, B→task-3）→ 旧 hold 仅在 X 上显示 `stale`、不拦任何人；重挂携带当前修订（`task_holds.project_revision` == live revision）；放行后 held 全清 |
| DBG-REV-A02 | 闸门消费修订：修订匹配 hold 拦截（null）；修订错配 hold 不拦（TASK_STARTED 放行且 VIS 显示 stale）；legacy NULL 行保活跃回退（null + `held:"active"`） |
| 回归红线 | 既有 305 项原样绿（compile 断言更新外零漂移）；replay fixture digest 不动；缺省并发=1 不动 |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-GRAPH-4，G9-A）：definition identity 全链 + hold 修订锚定（取代 29 号 §1.1 跨修订存活裁决）；长期 definitionId-rebase 语义登记不做。 |
| 2026-09-07 | **交付**：TaskProposal/TaskSpec/GraphTask/卫星/Trace 加法式字段 + compileAgentGraph 恒输出 definitionId + DUPLICATE_DEFINITION_ID + HOLD_SET payload revision + M7 + 调度闸门修订消费（stale 惰性/active/legacy-NULL 回退）+ GraphTask.held 两态 + 面板 stale 徽章与 definition 行；ID-A01–A03 + DBG-REV-A01–A02 全绿（53 文件 / 310 测试，既有 305 项除五处 compile 断言更新外原样绿）。 |
