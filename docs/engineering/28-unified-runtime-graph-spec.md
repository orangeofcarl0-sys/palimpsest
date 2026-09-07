# Unified Runtime Graph 规格（一线三投影 + ephemeral 身份）

> **Spec ID**：`PLMP-RUNTIME-1` ｜ 状态：**已交付**（2026-09-07；演进线 G7 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §6；验收 RUNTIME-A01–A03 全绿〔50 文件 / 301 测试〕+ 浏览器冒烟：卫星/Trace 由 graph.runtime 驱动）
> **权威序**：VIS 契约以 17 号为基、由本规格加法式扩展；scope 以 26 号、并发以 27 号为准。
> **总纲**：Definition / Runtime / Trace 是**同一张 canonical graph 的三种投影**，共享稳定身份（taskId ↔ attemptId）；本轮把这条 lineage 变成一个纯派生节点随唯一轮询面下发——三个不相关系统不存在的承诺落地为"一个端点、一次派生"。

## 1. Scope

### 1.1 `graph.runtime` 节点（VIS 投影加法式节，随 `/api/graph` 下发）

`buildOrchestrationGraph` 产出加法式可选 `runtime` 节点：

```text
runtime {
  satellites: [ ephemeral runtime instance ]   // 在途 attempt（开集），canvas 卫星同源
    { attemptId(=runtimeInstanceId), taskId(=definitionId), taskTitle, role,
      scopeId?, state(=status), origin: "scheduler-activation",
      createdAt(=timeline 首事件时刻，缺席省略), attribution? }
  traces: [ span 行 ]                            // 全量 attempt 时序（Trace 投影）
    { attemptId, taskTitle, role, scopeId?, state, spans[] }
  roleOccupancy: [ { role, occupied, slots } ]   // G6 容量视图（已声明角色表同源；
                                                 // 键序确定性；无声明表＝节缺席）
}
```

- **ephemeral 语义显式化**：attempt 即 ephemeral runtime node——`attemptId`＝runtimeInstanceId、`taskId`＝definitionId、origin＝scheduler-activation；晋升折叠语义不变（终态 attempt 折回任务，trace 面保留全史）。**零新事件**（全部从既有投影派生）。
- **Promote-to-Definition ＝ G4 patch 通道**（GraphPatch → validate → declare）；本规格不新增直接写路径（愿景 §18 落地面已在 25 号交付，此处仅登记映射）。

### 1.2 单轮询面

`/api/canvas/derive` **退役**（同轮更新 panel 与测试，无双路径）：卫星/Trace 改随 `/api/graph` 的 `runtime` 节点下发（cursor 门控不变）。`satelliteAttempts`/`traceRows` 纯函数保持内核单源，仅消费面迁移。

## 2. Non-goals

attempt 树/子 Agent 谱系（内核项，非本规格）、OTel 导出、ephemeral 节点的运行时创建事件、scope 级容量视图（roleOccupancy 是角色级）。

## 3. 合同触点 / 迁移 / digest

VIS 投影加法式可选节（缺省省略——手工 fixture 无 runtime 键不受影响）；`SatelliteAttempt`/`TraceRow` 加法式可选 `scopeId/createdAt/origin`；serve 面退役一个端点（本轮自有面，调用方同轮迁移）；事件/ProjectIR/调度/digest 零触碰；术语隔离机器守门覆盖新节（零 event_id/哈希）。

## 4. 验收

| 项 | 断言 |
|---|---|
| RUNTIME-A01 | lineage 一致：同一 attemptId 在 satellites/traces/GraphTask.attempts 三面携带同一 taskId/title/scope；scopeId/createdAt/origin 正确 |
| RUNTIME-A02 | roleOccupancy：声明表 slots + ACTIVE/VERIFYING 占用逐角色正确、键序确定；无声明表＝键缺席 |
| RUNTIME-A03 | serve：`/api/graph` 带 runtime 节点（token 门内）；`/api/canvas/derive` 404（退役）；零写入；术语隔离守门原样通过 |
| RUNTIME-A04 | 确定性：两次构建 runtime 节点全等 |
| 浏览器 | live 冒烟：卫星与 Trace 抽屉照常工作（数据源切到 graph.runtime） |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-RUNTIME-1，G7）：`graph.runtime` 加法式节（satellites/traces/roleOccupancy）、attempt＝ephemeral 显式化（runtimeInstanceId/definitionId/origin 映射）、`/api/canvas/derive` 退役、Promote-to-Definition 映射 G4 patch 通道。 |
| 2026-09-07 | **交付**：`buildOrchestrationGraph` 产出 `runtime` 节点（satellites〔origin/createdAt/scopeId ephemeral 身份〕+ traces〔scopeId〕+ roleOccupancy〔已声明角色表 × ACTIVE/VERIFYING 占用，键序确定；无声明表＝键缺席〕）；`/api/canvas/derive` 退役（panel/测试同轮迁移，404 断言在册）；panel 单轮询面（graph 轮询即得三投影）；RUNTIME-A01–A03 全绿（lineage 三面同 id 断言、确定性、术语隔离原样）；浏览器冒烟：卫星停靠 + Trace span 抽屉照常。 |
