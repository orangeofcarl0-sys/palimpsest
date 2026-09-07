# G9-B3 跨层闭合 — 只读审计与裁决

- 日期：2026-09-08
- 基线：`1a8d688`（main，工作树 clean，56 文件 / 337 测试全绿；此后无新提交）
- 方法：先只读复现（scratch probes，输出逐条摘录，交付前删除）→ 冻结 30/31 号 closure revision → 实现。不占用 32 号。

---

## P1（复现实证）：patch 响应的 `graphDigest` 与 `doc` 不一致

`agentGraphSemanticDigest` 含 edge id（正确——边声明身份是 IR 语义态），但 CanvasDoc v2 无一等边：`liftToAgentGraph` 按文档序重生成 `e1..eN`，`unloadToCanvasDoc` 丢弃 patch 引入的 `pe*` 边 id。serve 端 `graphDigest: digest(patched)` 而 `doc: unloadToCanvasDoc(patched)` ⇒

```text
response.graphDigest : 418b7a55a24f…
digest(lift(doc))    : 1803a3f76944…
MATCH: false            ← 经真实 HTTP endpoint 复现（含 addEdges 的 patch）
```

调用者拿锚去 rebase 下一个 patch 必然 STALE_GRAPH_BASE——新鲜度锚指向一个客户端永远无法重建的图。**裁决（§3 最小正确修复）**：硬不变量 `response.graphDigest === agentGraphSemanticDigest(liftToAgentGraph(response.doc))` 成为 API 合同（成功响应以 returnedDoc 的回程 lift 为锚）；失败响应维持 `digest(lift(请求 doc))` 供 rebase。**登记**：这是 CanvasDoc v2 bridge hotfix——patched IR 边身份在 IR→Canvas→IR 仍会重生成，G9-D（v3 显式 edges[]）从"功能增强"升级为**新鲜度正确性依赖**（计划重排 B3→D→C→E→F→G）。

## P2（复现实证）：web 未消费 `graphDigest` + mirror 漂移

`compileCanvas` 返回类型、`CanvasPatchResult` 均无 `graphDigest`；web `TaskProposal` 缺 `suggestedSkills/scopeId/definitionId`；`ProjectProposal.changeClass` 仍是 `string`；架构师指令只写"可带 baseRevision"，不含真实锚。**裁决（§5）**：① web 类型补齐且后端恒存在的字段不设 optional；② "从需求生成"复制指令前先 `compileCanvas(当前草稿)` 取 `graphDigest`、取 live revision，指令**明确要求** patch 携带 `baseRevision`+`baseGraphDigest`；③ **禁止 review 时偷偷补锚**——patch 面板显示 已锚定/未锚定（解析用户提交的 JSON 判定），未锚定时明示"丢失更新保护不生效"；④ apply 成功后 response.doc+graphDigest 一并成为下一轮基线。

## P3（复现实证）：hold 的 `definitionId` 取错时间层

```text
hold definitionId: n99 status: stale setAt: 0   ← r1(n17) 挂断点、r2 复用 task-1(n99)
```

投影取**当前** task 身份——历史治理身份被错误改写为 n99。**裁决（§7，方案 B）**：`task_holds.definition_id` derived projection 列（**M9**）：projector `#applyHoldSet` 时从当时当前 ProjectIR 派生（事件序保证 projects 行即设置时修订）；存量行经 M9 用 `json_each` 从 PROJECT_CREATED/PROJECT_REVISED 载荷中按 `(revision, task_id)` 精确匹配回填——可证明、不推测。`HoldControlView.definitionId` 语义钉死为"hold 设置时的 definition identity"；历史任务无 definition 则诚实缺席，禁伪造 `= taskId` 或取当前值。**GraphTask 徽章归属规则（§9）**：`status=active`（修订未变 ⇒ 同一 IR）照常徽章；修订错配时仅当 `historical definitionId === current definitionId`（双侧都在且相等）才显示 stale 徽章——身份缺失（spec-first）或不同 ⇒ 只进 `runtime.controls.holds[]`，Design(n99) 不再背负"曾被 hold"的暗示；该保守 fallback 登记。

## P4（复现实证）：proposal "校验通过"不保证可声明

```text
duplicate-title diagnostics: []   ← 依赖词汇 title 歧义，title→id 映射 last-write-wins
updateEdges {id} parsed: [{"id":"e1"}]   ← updateNodes 有 EMPTY_UPDATE 而 updateEdges 没有
```

**裁决（§13/§17）**：① `validateProjectProposal` 增 `DUPLICATE_TITLE`（图身份歧义，非美观问题）；② 编译链闭合硬不变量 **validate clean ⇒ proposalTaskSpecs(...).every(parseTaskSpec) 成功**：validator 内做试编译，`parseTaskSpec` 的 ContractError 转结构化诊断 `TASK_SPEC_CONTRACT`（带 task title + 原始 detail）——复用 canonical 合同，不复制 schema 规则（duplicate dependsOn/writePaths/requiredArtifacts/suggestedSkills、非法路径、空 scopeId/definitionId 全部由此覆盖）；③ validate/declare/canvasCompile 共用同一 verdict（已同函数，自动一致）；④ `updateEdges` 条目必须含 `kind`，否则 parse 层 `EMPTY_UPDATE`——句法/语义 no-op 边界与 updateNodes 对齐。

---

## 验收映射（本轮新增）

PATCH-FRESH-A04/A05、WEB-FRESH-A01/A02、WEB-CONTRACT-A01、HOLD-ID-A01..A03、PROP-COMPILE-A01..A07、PATCH-GRAMMAR-A05。

## 回归红线

既有 G9-B2 全部不变量（baseRevision/baseGraphDigest、validate⇒apply、accepted⇒digest 变、UNREPRESENTABLE_IN_CANVAS）、replay fixture、缺省并发=1、definition_id ≠ task_id、Canvas 仍 draft、ledger 仍是唯一真相——全部不动。
