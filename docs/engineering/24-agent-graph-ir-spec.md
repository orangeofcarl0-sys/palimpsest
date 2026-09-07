# AgentGraph IR v1 规格（renderer-neutral 图中间表示）

> **Spec ID**：`PLMP-GRAPH-1` ｜ 状态：**已交付**（2026-09-07；演进线 G3 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §2；验收 GRAPH-A01–A05 全绿〔47 文件 / 282 测试〕，canvas 21 项含 A02/A03 字节级断言原样通过＝单路径替换零漂移实证）
> **权威序**：CanvasDoc v2 以 23 号为准；提案/声明面以 18 号为准；系统设计以 03 号为准。
> **总纲**：React Flow 类型永不做领域模型。新内核模块 `src/graph/` 提供**与渲染器、运行时双方解耦**的 AgentGraph IR；编译收敛为单路径 `CanvasDoc → lift → AgentGraph → capability gate → ProjectProposal`——不再存在 doc 直 flatten 的第二条编译路径（防前后不一致）。IR 允许表达 ≠ 当前 runtime 必须执行：超集语义在 capability 门 fail-closed（`UNSUPPORTED_*`），绝不静默 flatten。

## 1. Scope

### 1.1 IR 形状（`src/graph/ir.ts`，扁平 + scope 归属，与 CanvasDoc 同构但语义化）

```text
AgentGraph { version: 1, goal, nodes: [AgentGraphNode], edges: [AgentGraphEdge] }
AgentGraphNode { id, kind, label, scope: nodeId | "root",
                 kind=agent: task {writePaths?, requiredArtifacts?, gateId?, role?, suggestedSkills?}
                 kind=annotation: text }
AgentGraphEdge { id, source: nodeId, target: nodeId, kind: EdgeKind }
EdgeKind = "data" | "control" | "message" | "handoff" | "delegation" | "evidence"
         | "validation" | "aggregation" | "retry"
NodeKind = "agent" | "subgraph" | "gate" | "tool" | "router" | "memory" | "human"
         | "artifact" | "annotation"
```

- **compound**：`scope` 归属链表达嵌套（沿用 INV-C1..C4 同款不变量：owner 必须是 subgraph、无 self-scope、无环）；**cycle-capable-at-IR-level**：agent 节点间 data 边成环**解析合法**（IR 不拒），由 capability 门判 unsupported——这是 IR 层与文档层的核心差异。
- **multigraph-ready / ports**：`source/target` 为 node id；端口与重边语义推迟到 G5（加法式可选字段，非本版合同）。
- 解析 fail-closed：未知字段/坏形状/重复 id/未知 scope 引用/scope 非法/边端点不存在/agent 缺 task payload/subgraph 带 payload/annotation 缺 text 即拒。

### 1.2 Capability 门（compile 前置，全部 fail-closed）

| 诊断 | 触发 |
|---|---|
| `UNSUPPORTED_NODE_KIND` | kind ∉ {agent, subgraph, annotation}（gate/tool/router/memory/human/artifact 目前只在 IR 与未来画布调色板存在，编译拒绝） |
| `UNSUPPORTED_EDGE_KIND` | edge kind ≠ "data" |
| `UNSUPPORTED_EDGE_ENDPOINT` | 边端点是非 agent 节点 |
| `UNSUPPORTED_RUNTIME_CYCLE` | agent 节点沿 data 边成环（当前 DAG runtime 不执行循环——愿景 §E/§8 的"revision loop ≠ graph cycle"落地面） |

`agentGraphCapabilities(graph)` 纯函数返回诊断数组（确定性排序）；`compileAgentGraph(graph)` 诊断非空即 throw（fail-closed），否则产出与现路径逐字节同形的 ProjectProposal（task＝agent 节点声明序；dependsOn＝data 边 target 的 label，按边声明序）。annotation 透明。

### 1.3 单编译路径（防不一致的核心）

`src/canvas/lift.ts`：`liftToAgentGraph(doc)`——task→agent、subflow→subgraph、annotation→annotation、scope=z、依赖 key→data 边（确定性边 id）。`canvasCompile` 改为 `compileAgentGraph(liftToAgentGraph(doc))`；**产出与旧 flatten 逐字节一致**（既有 A02/A03/A18–A21 原样通过即机器证明）。布局纯度推广：任意布局后 `liftToAgentGraph(laid)` 与 `liftToAgentGraph(doc)` 结构全等（IR 不携带坐标）。

## 2. Non-goals

serve 新端点（G4 的 patch 面一并考虑）、面板消费 IR（G4/G7）、Tool/Router 等的运行时语义、subgraph 边界端口（G5）、循环执行语义（IR 表达、编译拒绝）。

## 3. 合同触点 / 迁移 / digest

事件/ProjectIR/调度/digest：零触碰。CanvasDoc：零变化（v2 冻结）。ProjectProposal：零变化（输出同形）。新面＝`src/graph/` 模块 + `canvasCompile` 内部实现替换（对外签名/行为不变）。兼容性：无 shim——旧 flatten 路径整体删除，不留双路径。

## 4. 验收

| 项 | 断言 |
|---|---|
| GRAPH-A01 | `parseAgentGraph` fail-closed 全矩阵 + 合法文档 round-trip |
| GRAPH-A02 | lift：CanvasDoc v2 → IR 结构正确；`compileAgentGraph(lift(doc))` 与断言中的手写提案逐字节一致；嵌套 z 链场景 |
| GRAPH-A03 | capability 门四类诊断各一 + 干净图零诊断；compileAgentGraph 对违例 throw 且信息携带诊断 |
| GRAPH-A04 | IR 层环合法（parse 通过）而 capability 报 `UNSUPPORTED_RUNTIME_CYCLE`——IR 允许表达 ≠ runtime 执行 |
| GRAPH-A05 | 确定性：lift/compile/capabilities 同输入两次全等；布局纯度推广（四布局后 lift 结构全等）；既有 canvas 测试原样全绿（单路径替换的回归证明） |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-GRAPH-1，G3）：IR v1 形状（9 节点 kind 分层、9 边 kind、scope compound、cycle-capable）、capability 门四诊断、单编译路径（doc→lift→IR→proposal，旧 flatten 删除）、布局纯度推广；ports/multigraph 语义显式推迟 G5。 |
| 2026-09-07 | **交付**：`src/graph/`（ir.ts：9 节点 kind 分层、9 边 kind、scope compound 解析、capability 门四诊断、compileAgentGraph fail-closed）+ `src/canvas/lift.ts`（liftToAgentGraph，确定性边 id）+ `canvasCompile` 改为 compileAgentGraph∘lift（旧 flatten 整体删除，无双路径）；GRAPH-A01–A05 全绿；布局纯度推广实证（四布局后 lift 结构全等）；环 IR 合法/capability 拒绝（A04）。 |
| 2026-09-08 | G9-D（32 号 PLMP-CANVAS-7）修订：capability 门加法式 +1 诊断 **UNSUPPORTED_PARALLEL_DATA_EDGE**（同一 (source,target) 重复 data 边在 DAG runtime 无多重性语义——TaskSpec.depends_on 要求唯一——此前静默产出重复 dependsOn title 到 TaskSpec 合同层晚炸）；IR 保持 multigraph（平行边结构合法、解析通过），画出≠能编译的分层裁决不变；diagnostic 4→5 类。 |
| 2026-09-07 | G9-A（30 号 PLMP-GRAPH-4）修订：`compileAgentGraph` 对 agent 任务恒输出 `definitionId: node.id`（定义身份全链贯通，详见 30 号）；既有 compile 字节断言同轮更新＝有意合同变更，IR 形状与 capability 门零改动。 |
