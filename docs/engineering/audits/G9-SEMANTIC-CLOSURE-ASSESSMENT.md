# G9 语义闭合 / 固本（Semantic Closure / Hardening）— 只读审计

- 日期：2026-09-07
- 基线：`84f4fbb`（main，工作树 clean）
- 方法：先审计后实现；本文只读。全部结论均以代码路径 + scratch vitest 复现器机器实证（复现器输出逐条摘录于下，交付前删除），未实现任何一项。
- 本轮范围：G9-A（身份安全）+ G9-B（GraphPatch 固本）。G9-C–G 只登记裂缝与批次对应，不在本轮顺手实现。

---

## 0. 基线盘点

已交付且本轮**不重复实现**：PLMP-CANVAS-5/6（22/23 号）、PLMP-GRAPH-1/2/3（24/25/26 号）、PLMP-SCHED-1（27 号）、PLMP-RUNTIME-1（28 号）、PLMP-DEBUG-1（29 号），SDS-30..36 在册，测试基线 51 文件 / 305 项全绿。

---

## 1. F-A：身份谱系裂缝 —— authoring identity ≠ canonical definition identity（P0-A）

**代码链证据**：

- `liftToAgentGraph`（canvas/lift.ts）：canvas key → IR node id，身份保住。
- `compileAgentGraph`（graph/ir.ts:383-396）：产出 `TaskProposal {title, dependsOn: labels, ...}` —— **node.id 在此丢弃**。
- `proposalTaskSpecs`（architecture/proposal.ts:153-168）：按声明顺序重新生成 `task-1..task-N`。
- 运行时面：`GraphTask`（tools/graph.ts）无 definitionId；卫星/Trace 只有 taskId。

**scratch 实证**：`canvasCompile` 一个 key 为 `n17`/`n18` 的两任务文档，输出：

```text
proposal tasks: [{"title":"Research","dependsOn":[]},{"title":"Write","dependsOn":["Research"]}]
definitionId present: false
```

即 `Canvas n17 → ProjectProposal "Research" → task-3 → attempt a82` 之间没有任何持久化的 `n17 ↔ task-3` lineage。hold、晋升、上下文、故障归因全都只能按 task_id 漂移重绑。

**G9-A 裁决（设计，本文只登记）**：加法式可选 definition identity——`TaskProposal.definitionId?` → `TaskSpec.definition_id?` → ProjectIR → `GraphTask.definitionId` → 卫星/Trace。语义：`definition_id = AgentGraph node id`，`task_id = 运行时/规范任务实体 id`，二者不是同一概念；禁止伪造 `definition_id = task_id`。旧项目缺席照常工作（SDS-4 例外纪律：缺省键省略 ⇒ 既有 digest 逐字节不变，golden 断言在册）。

---

## 2. F-B：Debugger hold × plan revision 误附着（P0-B）

DEBUG-1 声称"hold 按 task_id 锚定并跨 plan revision 存活"。**scratch 复现记录（全部真实输出）**：

场景 r1：`task-1 = A`、`task-2 = B(dep task-1)`；`hold task-1`；`runOnce() = null`（hold 生效，正确）。
`plan()` 修订为 r2：`task-1 = X`、`task-2 = A`、`task-3 = B`（无 changeClass）：

```text
r2 task-1 held flag: true   objective: Complete task-1.   state: READY
post-revision activation attempt: expected revision 0, current revision is 1
re-register task-1 at r2: task already exists (UNIQUE constraint failed: tasks.project_id, tasks.task_id)
```

三重实证：

1. **误附着（本轮缺陷）**：`task_holds` 以 `(project_id, task_id)` 为主键，HOLD_SET payload 无修订字段；修订后同一个 `task-1` 在语义上是全新的 X，`GraphTask(task-1).held === true` —— 用户给 A 挂的断点静默套在 X 头上，面板照常显示"挂起"。
2. **修订后激活链断裂（已登记缺口，本轮不动）**：`#applyProjectRevised`（state/projector.ts:246-269）只改 `projects` 行；`tasks` 表行仍挂 r1 envelope → 调度器激活时 `RevisionConflict: expected revision 0, current revision is 1`。
3. **重注册不可行（同上）**：宿主按 `start()` 同款流程 `scheduler.registerTask(policy.authorize(ir, "task-1"))` → TASK_CREATED 行 UNIQUE 冲突。即 SDS-28 已登记的"声明即运行最后一公里"缺口实际上比原记更深：plan 之后**没有任何可用路径**为存量 task_id 换发 r2 envelope。

**G9-A 裁决**：短期语义 `hold = (project_revision, task_id)`——

- `HOLD_SET` payload 加法式可选 `project_revision`（新 hold 一律携带；缺省 = legacy）；
- `task_holds` 加列 `project_revision`（M7 迁移；投影表，无 digest 触点）；
- 调度器只认"修订匹配"的 hold 为活跃门；不匹配 = **stale（惰性）**：不再拦截该任务，面板显示"已过期"，可显式放行或重挂（重挂 = 新 HOLD_SET 携带新修订，天然可审计）；
- `project_revision IS NULL`（legacy 事件/行）= 活跃 —— 保守回退，保既有 fixture/老账本行为逐字节（与"禁伪造除非明确标记 legacy fallback"同款纪律，回退语义在 30 号规格明文登记）；
- 长期语义（definitionId 锚定 + 显式 rebase 事件 + 删除节点孤儿化）需要新事件类型，超出本轮，登记为后续规格，不在 G9 顺手做。

---

## 3. F-C：GraphPatch 输入边界不是 fail-closed 协议 + validator 只查局部（P0-C/P0-D）

**输入边界**：serve.ts:320 `const patch = body["patch"] as GraphPatch` —— 零解析零白名单，任意 JSON 直接类型欺诈进内核。

**validator 只查局部操作，不查结果图**。六个裂缝全部 scratch 实证（validate 返回 `[]` 后 apply 的真实行为）：

```text
(a) dup addNodes      validate:[] → apply THROWS: agent graph: duplicate node id
(b) move→已移除scope  validate:[] → apply THROWS: node "b" references unknown scope "s"
(b2) 移除scope留成员  validate:[] → apply THROWS: node "b" references unknown scope "s"
(c) add edge→已移除点 validate:[] → apply THROWS: edge "pe1" references unknown node "a"
(d) remove+update同点 validate:[] → apply "OK"，但 update 被静默吞掉（labels: S,B —— rename 丢失）
(e) subgraph带task载荷 validate:[] → apply THROWS: node "s" must not carry field "task"
```

(d) 最危险：validate 通过、apply 成功、**update 无声丢失**——预览说了要改名，应用后没有改名，preview ≠ 已提交决策。另：`removeNodes:["a","a"]`、`updateNodes` 两次同 id 等重复操作全靠 `Map()` 后者覆盖，无纪律。

**G9-B 裁决**：

- `parseGraphPatch(value): GraphPatch` 严格 parser：顶层与每个操作对象未知字段拒绝；七操作数组必在；addNodes/addEdges 复用 IR parser（导出 ir.ts 内部 parse）；updateNodes 只收 `{id,label?,task?,text?}`（**不收 kind** —— kind 不可变在 parse 层钉死）；updateEdges 收 `{id,kind?}`；remove/update/move 目标重复即拒；addNodes 内部重复 id 归 validator（PATCH-H01 语义）。
- validator 升级为**结果图验证**：与 apply 共享同一结果构造（同一固定序），对结果图重跑结构不变量；新诊断 `DUPLICATE_NODE_ID`（patch 内）/`CONFLICTING_NODE_OPERATION`/`CONFLICTING_EDGE_OPERATION`/`MOVE_TARGET_REMOVED`/`SCOPE_OWNER_REMOVED`/`ILLEGAL_NODE_UPDATE`。
- 硬不变量：`validateGraphPatch(base,patch) = [] ⇒ applyGraphPatch(base,patch)` 结构性必成（PATCH-H04）。

---

## 4. F-D：unsupported IR"应用成功后降级"（P0-E）

serve patch handler（serve.ts:317-348）：apply 成功 → compile try/catch → **无论 compileError 与否一律 `applied:true, doc: unloadToCanvasDoc(patched)`**。而 `unloadToCanvasDoc`（canvas/lift.ts:87-88）对非 agent/subgraph 节点一律：

```ts
return { ...base, type: "annotation" as const, text: node.text ?? "" };
```

即 Tool/Router/Memory/Human/Artifact → **空文本注记**；非 data 边（message 等）直接消失（只有 data 边进 dependsOn）。图上画一个 Tool，应用后画布上多了一个无名注记、连线蒸发——silent semantic degradation，用户无从察觉。

**反例保留（不是缺陷）**：RUNTIME_CYCLE 是 canvas 可表达的（依赖边成环在 doc 合法、编译诚实报错）——表达门只拦"无法忠实回程"的类别，不拦"编译不了但表达无损"的类别。

**G9-B 裁决**：apply-to-canvas 门 = `unload(patched)` 能通过 `parseCanvasDoc` **且** `lift(unload(patched))` 与 `patched` 语义全等（节点 id/kind/label/scope/mode/task/text 逐字段 + 边 `(source,target,kind)` 有序列全等）。不满足 → `applied:false` + `UNREPRESENTABLE_IN_CANVAS`，**永不**把 unload 结果当 doc 返回。
边界登记：`lift(unload(g)) === g` 的严格全等（含边 id）依赖 Canvas 边一等身份（G9-D / CanvasDoc v3），本轮先落"语义投影等价"，全等留给 G9-D——差异与理由登记于 31 号规格修订流水。

---

## 5. 其余裂缝登记（本轮不实现，对应批次）

| 编号 | 裂缝 | 证据 | 批次 |
| --- | --- | --- | --- |
| F-E | patch apply 经 `unloadToCanvasDoc` 重建整 doc：未传 positions → 坐标全落确定性网格（lift.ts:63-64）；`groups: []` 清空视觉分组（lift.ts:90）。自由画布的组织成果被顺手清零 | 代码路径 | G9-C |
| F-F | 边身份丢失：IR `pe7` → unload → `dependsOn` → lift → `e1`（lift.ts:36-41）；patch 已支持 `removeEdges/updateEdges(id)` 而 canvas 无从保边 id | 代码路径 | G9-D |
| F-G | preset 只产 ProjectProposal；GUI declare 缺省不传 stageGraph → `fan_out` 名义并发实为 ACTIVE concurrency=1 串行；preset 与 execution governance 脱钩 | SDS-34 语义推演 | G9-E |
| F-H① | `parseStageGraphDefinition` 无未知字段白名单（根/stage/transition 三层都不查）：`"concurency":8` 静默当缺省 1（stage_graph.ts:128-186 实读） | 已核验 | G9-F |
| F-H② | canvas `parseTaskPayload`（doc.ts:96-112）不拒未知字段：`{"rol":"scout"}` 静默丢弃——与 ir.ts 同名 parser（有白名单）不一致 | 已核验 | G9-F |
| F-H③ | `/api/graph?cursor` 无快路径：未变化也全量 `buildOrchestrationGraph()` 再比对 cursor，长历史项目 O(history)/轮询 | 代码路径 | G9-F |
| F-I | GUI 复杂度已超人工冒烟可靠覆盖面 | G2–G8 冒烟实践 | G9-G |

---

## 6. G9-A/B 验收映射（本轮必须新增）

- `ID-A01`：canvas node id 在 declaration 中存续为 definition identity（`test/definition_lineage.test.ts`）。
- `ID-A02`：plan 重排不把 debugger hold 重绑到语义不同的节点（DBG-REV-A01/A02，`test/debugger_controls.test.ts` 扩展）。
- `PATCH-H01..H05`：duplicate addNodes / remove+update / move→removed scope / validate⇒apply 不变量 / 未知字段（`test/graph_patch_hardening.test.ts`）。
- `PATCH-H06`：unsupported IR 拒绝降级应用（endpoint 级，`test/graph_patch.test.ts` 扩展）。
- 回归红线自查：replay fixture digest、canonical digest、缺省并发=1、既有 305 项原样绿；SDS-4 golden 断言不动。

---

## 7. 诚实边界

- plan 修订后任务重注册链（§2 三重断裂之 2/3）是已登记内核扩展项，**G9 不修**——本轮只保证 hold 不再误附着、stale 可见可放行。
- hold 长期 rebase 语义（definitionId 锚定 + 显式 rebase 事件）需要新事件类型与独立规格，登记不动。
- G9-C–G 的裁决权在各自批次的规格里，本审计只登记裂缝与对应关系。
