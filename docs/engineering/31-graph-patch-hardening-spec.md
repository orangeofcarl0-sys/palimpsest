# GraphPatch Hardening 规格（fail-closed 输入协议 + 结果图验证 + 无损应用门）

> **Spec ID**：`PLMP-GRAPH-5` ｜ 状态：**已交付**（2026-09-07；G9-B 批次，母体＝`audits/G9-SEMANTIC-CLOSURE-ASSESSMENT.md` §3/§4；验收 PATCH-H01–H06 + ROUNDTRIP-A01 全绿〔54 文件 / 319 测试〕）
> **权威序**：AgentGraph IR 与编辑协议以 24/25 号为基，本规格为加法式收紧；Canvas 门以 21/23 号为基；SDS-4 例外以 03 号为准。
> **总纲**：GraphPatch 是 AI 输入边界——它必须像 CanvasDoc/AgentGraph 一样被严格解析、按结果图确定性验证、并且永不把无法在画布上忠实表达的语义降级应用。硬不变量：**validate PASS ⇒ apply 结构性必成**。

## 1. 问题（审计实证）

1. serve `body["patch"] as GraphPatch`——零解析零白名单（P0-C）。
2. validator 只查局部操作；六例 validate `[]` → apply 结构性失败/静默丢失（addNodes 内部重复、move→已移除 scope、移除 scope 留孤儿、add edge→已移除节点、remove+update 静默吞掉、subgraph 带 task 载荷）（P0-D）。
3. apply 成功 + compile 失败仍 `applied:true`，`unloadToCanvasDoc` 把 Tool/Router/Memory/Human/Artifact 降级成**空文本注记**、非 data 边直接蒸发——silent semantic degradation（P0-E）。

## 2. 设计

### 2.1 `parseGraphPatch(value): GraphPatch`（严格语法）

- 顶层未知字段拒绝；七个操作数组**必在**（省略不传＝响亮失败，EMPTY_PATCH 是唯一模板）；`baseRevision` 非负整数可选。
- `addNodes`/`addEdges` 复用 IR 的 `parseAgentGraphNode`/`parseAgentGraphEdge`（单语法，无第二 parser；24 号三解析器随之导出）。
- `updateNodes` 只收 `{id, label?, task?, text?}`——**不收 kind**（kind 不可变在 parse 层钉死：换 kind＝删旧加新，不是就地变形）；`updateEdges` 收 `{id, kind?}`（kind ∈ 9 边 kind）；`moveScope` 收 `{id, scope}`。
- 重复操作纪律：`removeNodes/removeEdges` 列表内重复、`updateNodes/updateEdges/moveScope` 目标重复一律响亮拒绝（不依赖 Map 后者覆盖）。`addNodes` 内部重复 id 归 validator（DUPLICATE_NODE_ID，H01 语义）。

### 2.2 结果图验证（P0-D）

- **单一结果构造**：`computePatchedGraph(base, patch)` 按固定序产出结果——validator 检查它，apply 提交它。validate 与 apply 从此共享同一构造，漂移不可能。
- 新诊断类型（`GraphPatchDiagnosticType` 加法式）：
  - `CONFLICTING_NODE_OPERATION` / `CONFLICTING_EDGE_OPERATION`：remove ∩ update / remove ∩ move / removeEdge ∩ updateEdge——静默吞掉即 preview ≠ 结果，拒绝；
  - `MOVE_TARGET_REMOVED`：move 进本 patch 移除的 scope；
  - `SCOPE_OWNER_REMOVED` / `SCOPE_OWNER_INVALID`：结果图 scope 归属完整性（owner 被本 patch 移除 / owner 缺失或非 subgraph）——覆盖"移除 subgraph 留孤儿成员"与"加节点 scope 指向 agent"两类原裂缝；
  - `ILLEGAL_NODE_UPDATE`：task 载荷只对 agent、text 只对 annotation（kind 不可变 ⇒ 以 base kind 判定）。
- 结果图检查：DUPLICATE_NODE_ID（含 patch 内部重复）、NODE_HAS_EDGES（基边端点不在结果）、EDGE_ENDPOINT_UNKNOWN（新增边端点不在**结果**节点集——原实现错用 base+adds，已修）、EDGE_SELF_LOOP、SCOPE_CYCLE（每轮至多一个，首环去重语义保留）。
- 硬不变量：validate `[]` ⇒ `applyGraphPatch` 不再可能因结构合法性问题失败（重解析 `parseAgentGraph` 在同一构造上运行）。

### 2.3 无损应用门（P0-E，serve 面）

- `canvasRoundTripDiff(graph): string[]`（canvas/lift.ts）：`unload → parseCanvasDoc → lift` 回程语义比对——节点 id/kind/label/scope/mode/task/text 逐字段、边 `(kind,source,target)` 有序多重集；空数组＝可忠实表达。
- serve patch handler 在 apply 后先过门：有损 → `applied:false` + `UNREPRESENTABLE_IN_CANVAS`（detail 逐条列出损失）+ preview，**永不**返回 unload 产物当 doc、**永不**假装 compile 之前一切正常。
- 反例保留：data-edge 环是 canvas 可表达的（doc 合法、编译诚实报 `UNSUPPORTED_RUNTIME_CYCLE`）——表达门不拦"编译不了但表达无损"的类别（ROUNDTRIP-A01 断言）。
- 边界登记：`lift(unload(g)) === g` 的严格全等（含边 id）依赖 Canvas 边一等身份（32 号 / G9-D）；本轮比较**语义投影**（边以 `(kind,source,target)` 多重集计），边 id 再生是登记差异、非语义损失。

## 3. 合同触点

| 面 | 变更 | 纪律 |
|---|---|---|
| `parseGraphPatch` + 六类新诊断 | graph/patch.ts；serve patch 端点从 `as` cast 改为严格解析 | 输入边界 fail-closed |
| ir.ts `parseAgentGraphNode/Edge/TaskPayload` | 导出（原内部 parser 改名导出） | 单语法复用 |
| `GraphPatchDiagnosticType` | +6 类型（`UNREPRESENTABLE_IN_CANVAS` 仅 apply 门产生） | 加法式 |
| serve `/api/canvas/patch` | 严格解析（400）+ apply 后表达门 | 纯派生不变；声明仍走 start/plan |
| web | 零改动（诊断为结构化字符串，新类型透传） | — |

## 4. 验收

| 项 | 断言 |
|---|---|
| PATCH-H01 | patch 内 addNodes 重复 id → validator `DUPLICATE_NODE_ID`（不再拖到 apply 崩） |
| PATCH-H02 | remove+update / remove+move / removeEdge+updateEdge → `CONFLICTING_*`（伴随真实连带问题的诊断一并列出，如 NODE_HAS_EDGES） |
| PATCH-H03 | move→本 patch 移除的 subgraph → `MOVE_TARGET_REMOVED`；移除 subgraph 留孤儿 → `SCOPE_OWNER_REMOVED`；add edge→移除节点 → `EDGE_ENDPOINT_UNKNOWN`（指明"被本 patch 移除"）；加节点 scope→agent → `SCOPE_OWNER_INVALID` |
| PATCH-H04 | validate `[]` ⇒ apply 成功且再解析全等（有效 patch 电池）；反向 belt：全部畸形 patch 均被 validate 拦截，无一带到 apply 抛 |
| PATCH-H05 | 未知顶层/操作字段、缺数组、baseRevision 非法、remove/update/move 目标重复、非法边 kind、IR 节点字段违规全拒绝；EMPTY_PATCH 解析恒等 |
| PATCH-H06 | 端点级：引入 Tool 节点/消息边/边 kind 改 control → `applied:false` + `UNREPRESENTABLE_IN_CANVAS`、无 doc 返回 |
| ROUNDTRIP-A01 | 干净图/数据环 → 损失清单为空；Tool+消息边 → 恰好点名两类损失 |
| 回归红线 | 既有 310 项原样绿（PATCH-A01–A05 全过＝诊断形状兼容）；replay fixture digest 不动 |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-GRAPH-5，G9-B）：严格 parser、结果图验证（validate⇒apply 硬不变量）、无损应用门（UNREPRESENTABLE_IN_CANVAS）；`lift∘unload === g` 严格全等（含边 id）留待 32 号 / G9-D——本轮为语义投影等价，差异在此登记。 |
| 2026-09-07 | **交付**：`parseGraphPatch` + `computePatchedGraph` 单一结果构造 + 六类新诊断（CONFLICTING_NODE/EDGE_OPERATION、MOVE_TARGET_REMOVED、SCOPE_OWNER_REMOVED/INVALID、ILLEGAL_NODE_UPDATE）+ `canvasRoundTripDiff` + serve 严格解析与表达门；EDGE_ENDPOINT_UNKNOWN 语义修正为结果节点集（原 base+adds 含被移除节点）；ir.ts 三解析器导出；PATCH-H01–H06 + ROUNDTRIP-A01 全绿（54 文件 / 319 测试，既有 310 项原样绿）。 |
