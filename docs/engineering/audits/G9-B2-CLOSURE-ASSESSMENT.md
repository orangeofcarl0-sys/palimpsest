# G9-B2 输入 / 新鲜度 / 治理闭合 — 只读审计与裁决

- 日期：2026-09-07
- 基线：`4fa148b`（main，工作树 clean，54 文件 / 319 测试全绿）
- 方法：先审计后冻结后实现；本文只读（裁决草案在文末，实现随 31 号规格修订扩展交付）。
- 定位：G9-B2 是 30/31 号规格的 **closure revision**（方案 1，不抢占 32–36 编号）；CanvasDoc v3 / presets / G9-C 以下全部不做。

---

## A. GraphPatch 新鲜度锚错层（baseRevision 只锚 project，不锚 draft）

**证据**：`GraphPatch.baseRevision` 只在 serve 端对 `controller.orchestrationGraph().project.revision`（serve.ts:322-323）判 STALE_BASE；Canvas 草稿是纯客户端状态（21 号红线），用户手改草稿不产生 PROJECT_REVISED。于是：

```text
Project revision = 5
Draft G0 → AI 读 G0 出 patch P（baseRevision=5）
用户手改草稿 → Draft G1（revision 仍 5）
P 应用 → STALE_BASE 不触发 → lost update
```

**裁决**：加法式 `GraphPatch.baseGraphDigest?` ＋ 纯函数 `agentGraphSemanticDigest(graph)`（canonicalDigest 纪律）：

- `baseRevision` ＝ canonical governance freshness（保留现名 STALE_BASE，不破坏合同；语义钉死"project revision"）；
- `baseGraphDigest` ＝ authoring semantic graph freshness， mismatch → 新诊断 `STALE_GRAPH_BASE`（绝不与 STALE_BASE 混义）；
- 两 guard 独立存在（可只带其一）；任一 stale → 拒绝，不得互相覆盖；
- digest 覆盖 version/goal/节点（id/kind/label/scope/mode/task/text）/边（id/source/target/kind），**按声明序**（node 序决定 task id 序、edge 序决定 dependsOn 序——顺序是语义，忠实包含；对象键序由 canonicalDigest 键排序、Unicode NFC 由 canonical 层处理）；视觉状态（x/y/viewport/分组框）在 IR 层不可表示 ⇒ 结构性排除，拖动 20px 永不 stale；
- **不建服务端 draft 状态**：无 canvas_versions 表、无 draft 事件；digest 是请求内乐观并发断言，server 从请求 doc lift 后现算；
- digest 的读取面：`/api/canvas/compile` 响应与 patch 两类响应加法式携带 `graphDigest`（AI 锚定用），web 类型同步加可选字段。

## B. ProjectProposal 仍非正式输入合同

**证据**（`as ProjectProposal` cast 存量）：serve.ts:262（/api/proposal/validate）、serve.ts:288（/api/proposal/declare）、serve.ts:311（/api/canvas/insert）、cli.ts:364（architect 手写文件）。`validateProjectProposal` 是语义校验器（重复 definitionId/依赖环/未知依赖/未知 gate/缺写域），不应兼任 JSON 形状解析——拼错 `changeClas` 会被静默吞掉。

**裁决**：`parseProjectProposal(value): ProjectProposal`（architecture 层，与 validate 分层）：根字段白名单 `{goal, changeClass, tasks}`；TaskProposal 字段白名单 `{title, dependsOn, writePaths, requiredArtifacts, gateId, role, suggestedSkills, scopeId, definitionId}`（以当前 main 为准）；类型逐字段检查；changeClass 恰为四字面量之一；**不新增比既有 validator 更严/更松的语义**（title 空串仍归 validator 的 EMPTY_TITLE）。四个 first-party 边界统一接线，禁止继续 cast。preset 是内核可信生成：不进生产热路径，但加 `parseProjectProposal(presetDraft(id,…))` 逐 preset 的 producer/consumer 合同断言（测试级）。

## C. Patch add/update 语法不同构 + no-op 不诚实

**证据**：ir.ts `parseAgentGraphNode` 对 `label`/`text` 用 `str()`（空串合法），而 31 号 `parseNodeUpdate` 用 non-blank `patchId` ⇒ `add annotation text:"" 合法`、`update text:"" 拒绝` 的不对称；`updateNodes {id}`（零变更字段）、`label A→A`、`kind data→data`、`scope s→s` 均被接受且 preview 显示 "更新载荷" 但结果图不变——违反 Preview ↔ Result honesty。

**裁决**：① 拆分 `patchIdentifier`（id/scope 目标，non-blank）/`patchString`（与 IR 同域，任意字符串）/集合成员检查——一个字段在 AgentGraph 里合法，update 就允许同样取值；② **句法 no-op** parse 层拒绝（updateNodes 无任何变更字段 ⇒ `EMPTY_UPDATE`）；③ **语义 no-op** 采纳方案 A：validator 产出 `NO_OP_OPERATION` 并拒绝（label/text/task/edge-kind/scope 与当前值全等即报；AI 产出 no-op 通常代表输入错误，显式告知优于静默归一）；④ 新硬不变量：**accepted 非空 patch ⇒ 语义 digest 必变**（validator 层以 digest(result) ≠ digest(base) 兜底，捕捉互相抵消的组合；EMPTY_PATCH 除外）。不存在"metadata-only no-op"例外。

## D. hold 治理状态的可解释性缺口 + legacy 重审

**证据**：

1. stale hold 显示在**新语义任务**上：`Design.held = stale` 安全（不拦）但表达错误——该 hold 属于 r1 的 Research，不属于 Design（DBG-REV-A01 已机证）。
2. **orphan hold**：r1 hold task-5 → r2 task-5 不复存在 → `task_holds` 行仍在、`GraphTask[]` 无此任务 → 治理状态从 UI 消失（复现在册）。
3. legacy `NULL → active`（G9-A 回退）意味着 G9-A 之前设置的 hold 在 plan 重排后仍可能误阻断新任务。

**LEGACY-HOLD-AUDIT 裁决（三方案比较后选 C，回退到 B 兜底）**：

- 方案 A（NULL→active）：保旧行为但保留误阻断——与 fail-closed 原则冲突，弃。
- 方案 B（NULL→stale）：fail-safe 但"升级后旧断点失效"。
- **方案 C（采用）**：`events` 表**本来就有** `expected_project_revision INTEGER` 列（M1，migrations.ts:96），且 HOLD_SET 恒以 `promotions.projectRevision()`（number，project 缺失即抛，永不为 null）写入——即**每个 HOLD_SET 事件行自证其设置时的修订**。据此：
  - projector `#applyHoldSet`：payload 无 revision 时从 `event.expected_project_revision` 派生（可证明回填，非推测）；
  - **M8**：存量库 `UPDATE task_holds SET project_revision = (SELECT e.expected_project_revision FROM events e WHERE e.project_id=task_holds.project_id AND e.event_id=task_holds.last_event_id)`（last_event_id 恰指向最近一次 HOLD_SET）；
  - 两路走完后 NULL 只剩"无法证明"的行（直接播种/损坏）→ **NULL = stale**（宁可失效也不误阻断）；G9-A 的"legacy NULL = active"回退**作废**（30 号修订流水登记）。
- **治理投影**（全部可从现有 `task_holds` + `HOLD_SET` 事件 + 当前 ProjectIR 纯派生，零新事件、零编造字段）：`runtime.controls.holds[]` ＝ `{taskId, setAtRevision, currentRevision, status: "active"|"stale"|"orphan", reason, declaredBy, definitionId?}`（definitionId 仅当任务仍在当前 IR——orphan 的历史身份 ledger 里没有，不编造）。`GraphTask.held` 保留为 convenience。面板加"控制挂起"列表，stale/orphan 不再因任务图变化消失。

## E. canonical schema parser 严格度审计（本轮只审计不改线）

**静态扫描**：`src/schema/models.ts` 全文件**零**未知字段白名单（`grep "unknown .*field|includes(field)"` 无命中）——13 个 canonical parser（parseRequirement/parseDecision/parseTaskSpec/parseAllowedCommand/parseNetworkEndpoint/parseRuntimeMetadata/parseProjectIr/parseTaskEnvelope/parseAttemptReport/parseEvidenceAtom/normalizeEventPayload/parseNewEvent/parseSchedulerEvent）全部是 requireFields-only：**缺字段拒绝、多字段静默接受**。这与文件头"unknown input fail-closed"的声称不符。对照：ir.ts 四 parser、doc.ts doc/node/group 层是严格白名单；doc.ts `parseTaskPayload`（task 载荷内层）与 stage_graph.ts 三层开放（F-H①②，G9-F 范围）。

**裁决**：按母体指令，本轮**不改 `requireFields()`**（wire 冻结合同/历史 fixture/前向兼容/嵌套 schema 的影响面必须逐合同裁决）；产出矩阵（本文）+ tripwire 测试（SCHEMA-AUDIT-A01）钉死当前事实，防止无声漂移；G9-F 的 parser scope 据此矩阵重定（不再只有 StageGraph/Canvas——models.ts 的 13 个 parser 是最大缺口，涉及 wire 合同，须独立规格逐个裁决）。

---

## 验收映射（本轮新增）

PATCH-FRESH-A01..A03、PROP-PARSE-A01..A04、PATCH-GRAMMAR-A01..A04、HOLD-GOV-A01/A02、HOLD-LEGACY-A01、SCHEMA-AUDIT-A01（母体 §19 全单采纳）。

## 回归红线

worker report ≠ evidence、LLM opinion ≠ canonical、late success ≠ committable、preview == 下一提交决策、Ordarium 效力权威、Canvas 仍 draft、ledger 仍是唯一 canonical、definition_id ≠ task_id；既有 replay fixture、spec-first 项目、缺省并发=1、validate⇒apply 不变量、UNREPRESENTABLE_IN_CANVAS 保护全部不动。
