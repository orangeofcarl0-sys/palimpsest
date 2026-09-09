# G9-F 契约纪律 + 视图新鲜度 审计（实现前冻结）

- 日期：2026-09-10
- 基线：`main`＝`5646117`（G9-C COMPLETE）；实测 **58 文件 / 398 用例全绿**（指令 §38 基线 58/398 一致）
- 方法：全部结论来自当前代码机器探针（scratch 测试 8 项全过后删除）与源码逐行核对，不沿用旧 G9-F 计划的表述

## A. 解析器边界审计（§4/§5，机器实证）

### A.1 旧计划纠偏（§4）

旧 G9-F 计划称"Canvas `parseTaskPayload` 静默丢弃未知字段"——**已过时**。探针实证：CanvasDoc v3 未知节点键**抛错**（G9-D 会话 1 的显式 allowlist）。旧条目 PARSE-H02（Canvas task payload）＝ALREADY CLOSED，本批不再实现。

### A.2 作者书写解析器清单（探针实证）

| 解析器 | 必填 | 未知键（现状） | 嵌套 | 版本机制 | 书写者 |
|---|---|---|---|---|---|
| `parseCanvasDoc`（doc.ts） | 严格 | **严格（抛错）** | 严格（task payload allowlist） | `version:3` 字面量 | 人/LLM |
| `parseAgentGraph`（ir.ts） | 严格 | **严格（抛错）** | 严格（与 patch 共用三解析器） | `version:1` 字面量 | LLM |
| `parseGraphPatch`（patch.ts） | 严格 | **严格**（31 号 PATCH_FIELDS allowlist） | 严格 | baseRevision/baseGraphDigest 类型化 | LLM |
| `parseProjectProposal`（proposal.ts） | 严格 | **严格**（G9-B2 PROP-PARSE） | 严格 | — | 人/LLM |
| `parseStageGraphDefinition`（stage_graph.ts） | 值严格 | **宽松（缺陷）**：根/阶段/转换/守卫信封四层均不拒绝未知键 | 守卫子句委托 `parseClause`（唯一语法属主，正确） | — | 人/LLM（架构师） |
| `parseGateDefinition`（gate_clause.ts） | 值严格 | **宽松（缺陷）**：未知键忽略；`require` 同给 all+any 时 all 静默胜出 | 子句委托 `parseClause`（正确） | `version` 语义版本 | 人/LLM |
| `parseClause`（gate_clause.ts） | 值严格 | **宽松（缺陷）**：`{exists, not}` 同给时 exists 静默胜出、多余兄弟键忽略 | `where`＝**显式开放映射**（保持开放，§10） | — | 人/LLM |
| preset params（presets.ts `presetDraft`） | 访问时类型化 | **宽松（缺陷）**：未知参数键静默忽略 | — | — | 人（CLI/Web 面板） |
| 域状态机/事件字面量注册表 | 封闭 | 封闭 | — | — | 内核 |

**探针实录（8/8 过）**：PARSE-H01-A 根层 `"concurency":8` 被吞；B 阶段层同键被吞（归一输出缺 concurrency）；C 转换层多余键被吞；`parseClause({exists…, not…})` → 只剩 exists；`parseGateDefinition` 未知键＋all/any 同给 → all 胜；`presetDraft("pipeline",{goal,typoParam:1})` → typoParam 消失；CanvasDoc 未知键抛错；AgentGraph 未知键抛错。

### A.3 裁决（冻结进规格 35）

- **PARSE-INV-1** 作者书写封闭契约 ⇒ 未知键＝错误。修复面＝StageGraph 四层、GateDefinition 信封、GateClause 信封（`where` 子映射保持开放）、preset 参数集。复现器（H01-A/B/C）转为修复后必须抛错的验收测试。
- **PARSE-INV-2** 嵌套语法唯一属主：守卫子句仍只由 `parseClause` 拥有（StageGraph 修复不复制子句语法）；EvidenceAtom.value 归 evidence 属主。
- **PARSE-INV-3** 显式开放映射保持开放：`parseWhere`（gate 子句 where）与 `EvidenceAtom.value` 的**内容**永不因键级严格化被拒；但**含它们的契约信封**上的未知键必须拒（`valu` 拼写＝错误）。

## B. Canonical 契约严格性矩阵（§8/§9/§12）

现状：`requireFields()` 只查缺字段——**必填严格＋未知键宽松**；`normalizeEventPayload` 每个 case 返回**只含已声明字段的新对象**（未知键静默蒸发）。`models.ts` 头注释宣称 "unknown input fail-closed"——**与实现不符**（§15 必须修）。

| 契约 | 版本化 | 历史 wire 数据 | 外部生产者 | 现接受未知键？ | 期望策略 | 理由 |
|---|---|---|---|---|---|---|
| Requirement | schema_version∈ProjectIr | 是（fixture/replay） | 否（本库编译） | 是 | **封闭＝拒** | 版本化封闭契约（§11 首选裁决） |
| Decision | 同上 | 是 | 否 | 是 | **封闭＝拒** | 同上 |
| TaskSpec | 同上（SDS-4 加法式可选 role/suggested_skills/scope_id/definition_id 已声明） | 是 | 否 | 是 | **封闭＝拒**（允许键＝必填+四个已声明可选） | 加法式演进走显式可选字段，不走未知键容忍 |
| AllowedCommand | 否（嵌入） | 是 | 否 | 是 | 封闭＝拒 | 键集固定 |
| NetworkEndpoint | 否（嵌入） | 是 | 否 | 是 | 封闭＝拒 | 键集固定 |
| RuntimeMetadata | 否（嵌入） | 是 | 半外部（host worker 产 report） | 是 | 封闭＝拒 | host 按 SDK 合同产出；新键＝显式加法 |
| ProjectIr | schema_version=1 | 是 | 否 | 是 | 封闭＝拒 | 同 TaskSpec |
| TaskEnvelope | schema_version=1 | 是 | 否（本库产） | 是 | 封闭＝拒（含 suggested_skills 可选） | 同上 |
| AttemptReport | schema_version=1 | 是 | 半外部（host worker 报告） | 是 | 封闭＝拒（context_manifest 可选） | 同上 |
| EvidenceAtom | schema_version=1 | 是 | 本库产 | 是 | **信封封闭＝拒；`value` 内容开放** | §10 显式开放映射 |
| NewEvent/SchedulerEvent（信封） | schema_version=1/payload_version=1 | 是 | 否 | 是 | 封闭＝拒 | 信封键集固定 |
| normalizeEventPayload 各 payload 族 | payload_version=1 | 是 | 否 | 是（静默蒸发） | **逐 case 封闭＝拒**（键集＝各 case 归一输出的并集，含可选） | §13 |
| ROLE_TABLE_DEFINED payload | payload_version=1 | 是 | 否 | 是 | 封闭＝拒 | roles/hard_cap/declared_by |
| GATE_DEFINED payload | payload_version=1 | 是 | 否 | 是 | 信封封闭＝拒；`gate` 内嵌语法归 parseGateDefinition（唯一属主） | §13 唯一属主 |
| STAGE_GRAPH_DEFINED payload | payload_version=1 | 是 | 否 | 是 | 信封封闭＝拒；嵌套语法归 parseStageGraphDefinition | 同上 |
| CONTEXT_MANIFEST_ADDED manifest | payload_version=1 | 是 | host 编译产 | 是 | 封闭＝拒（semantic 加法式可选已声明）；`manifest.requirement`＝host 编译输入，按现注释保持对象级开放（CTX-2 语义归编译器）——登记为例外并写明 | 历史裁决（注释在案）保留 |
| EvidenceAtom.value / gate `where` / manifest.requirement | — | — | — | 内容开放 | **保持开放**（PARSE-INV-3） | 显式开放映射 |

**实现方式（§12）**：新增 `rejectUnknownFields(raw, allowed)` 助手（契约属主显式声明 required∪optional∪open），逐 parser 逐 case 显式调用——**禁止**全局改 `requireFields()`。

**历史兼容门（§14）**：strictness 变更必须过 `fixtures/replay/baseline-v1.json`（v3，Python 侧 digest 逐字节 parity）、`fixtures/ordarium/ledger-v2.sqlite`（conformance 用，不经 parseNewEvent——已核）、全量 replay/canonical digest 测试、SDS-4 加法式 golden（TASK_SPEC 合同在册用例）。HOLD_SET 的 `project_revision` 可选、manifest 的 `semantic` 可选等**已声明可选键**全部进允许集；探针显示 fixture 事件均由同合同产出，预期零历史破坏——以全量回归实证。若现网对象出现解析器不拥有的键：按 A（缺已声明可选）/B（fixture 非法）/C（有意扩展点）三查后再裁。

## C. OrchestrationGraph 依赖审计（§16–§19）

### C.1 输出字段 → 数据源（buildOrchestrationGraph + controller 装配）

| 视图字段 | 数据源 | 分类 |
|---|---|---|
| project.revision/goal/projectId | ProjectIr（账本派生投影） | event-derived durable |
| project.cursor | `MAX(event_id)` | event-derived durable |
| project.paused | scheduler_control 表 | projection-derived durable |
| tasks[].state | tasks 投影表 | projection-derived durable |
| tasks[].dependsOn/writePaths/…/definitionId/scopeId | ProjectIr | event-derived durable |
| tasks[].held | task_holds 表（M7/M8/M9） | projection-derived durable |
| tasks[].attempts[].state | attempts 投影表 | projection-derived durable |
| attempts[].attribution（model/cost） | **controller 进程内 `#attemptAttribution` Map** | **controller-process volatile** |
| attempts[].evidence/contextManifest | evidence / context_manifests 表 | projection-derived durable |
| attempts[].timeline | events 全量折叠（ATTEMPT_*/EVIDENCE_*/PROMOTION_*） | event-derived durable |
| promotions[] | PROMOTION_* 事件折叠 | event-derived durable |
| runtime.satellites/traces | 控制器由 attempts/evidence/manifest 派生（同图轮询面） | projection-derived durable |
| 角色容量视图 | role_tables 表＋attempts 表 | projection-derived durable |

### C.2 非事件图可见状态及其变更路径（§19 逐项）

| 变更 | 进图？ | 可无事件变更？ | 两次轮询间？ | 重启后？ |
|---|---|---|---|---|
| `#attemptAttribution.set`（claim(attemptId, attribution)） | 是（RUNNING attempt 的 model/cost） | 否——与 ATTEMPT_STARTED 追加同调用 | 是 | **是（Map 丢失，事件游标不变）** |
| `#attemptAttribution.delete`（#recordAttemptOutcome ← evaluateAttemptGate 判定 PASS/FAIL） | 是 | **是——`evaluateGate` 只读证据视图，结算零事件追加（探针级代码路径核对：controller.ts:1065-1074）** | 是 | 是 |
| telemetry 计数、budget/slots 计数 | 否 | 是 | — | —（不入图 ⇒ **不得**扰动视图游标，WEB-H01-D） |
| scheduler generation | 否（仅 status 视图） | 是 | — | —（同上） |

### C.3 裁决

$$
EventCursor \neq ViewCursor\quad(\text{VIEW-INV-1})
$$

- **EventCursor**：`graph.project.cursor` 语义原样保留（canonical 事件位置，§21 不动）。
- **ViewCursor**：加法式不透明串 `viewCursor`，语义＝"完整编排投影未变的验证器"。构成（§23 便宜）：`v1:<epoch>:<eventCursor>:<viewGeneration>`——epoch 为进程一次性随机 nonce（§25：重启即变，旧游标永不可能跨进程命中快路径）；viewGeneration 为进程内单调计数，**仅在图可见的易变态变更时 +1**（attribution set/delete；WEB-H01-D：不进图的状态一律不加）。
- **审计结论（WEB-H01-C 的依据）**：`evaluateAttemptGate` 结算＝**进程内真实存在的无事件图可见变更**（现有证据视图重判 → attribution 消失，`MAX(event_id)` 不动）⇒ 快路径若只看事件游标**会撒谎**；viewGeneration 必需。
- 快路径（§26/§27）：`GET /api/graph?viewCursor=<opaque>` 命中 ⇒ `{changed:false, viewCursor}` **不建图**；未命中 ⇒ 全图＋新 viewCursor。旧 `?cursor=<event-id>` 保持现状语义（保守：照常建图，不做不安全早退）；`graph.project.cursor` 含义不变。

## D. 健康语义（§29/§30）

现状：`/api/health` 调 `orchestrationGraph()` 取 cursor ⇒ 空库 400 "project does not exist"（G9-C/G9-D 冒烟两度实证的空态缺口）。裁决：`ServiceHealth ≠ ProjectInitialized`（HEALTH-INV-1）——health 改为廉价查询（scheduler_control/events 存在性＋MAX），不建图；返回 `{ok:true, projectInitialized, eventCursor?}`。WEB-HEALTH-A01：fresh store ⇒ 200/ok=true。

## E. G9-C 腰带预检（§31/§32）

探针级代码核对：`reconcileCanvasPresentation` 现输出 `[...kept, ...fresh]`——当 semanticResult 把新 id **交错**在存活 id 之间时，输出序 ≠ semanticResult 序 ⇒ **PRES-BELT-INV-1 违反**（helper 合同说 semanticResult 拥有节点序）。最小修复：按 semanticResult 序输出（位置仍按 before/避让）。§32 child-before-parent：Canvas 语法允许（scope owner 只要求存在于 doc，不要求声明在前）；placement 内部按 owner 先行播种（若 owner 未定位则全局网格种子），**输出序仍按 semanticResult**——两个腰带测试钉住。

## F. 本批不实现（§34/§35）

UAS 全部对象（ArchitectureDefinition/SystemGraph/WorkDefinition/Binding/RunDefinition/ExecutionPlan/AgentDefinition/Activation/Invocation/Channel/ContextPolicy/StatePolicy/OrchestrationPolicy/PersistentAgent/Campaign/Institution）；EventCursor/ViewCursor 设计需不阻塞上述未来特征但不预写 schema。Ordarium 仍是 Effect Authority——不把视图游标存进 Ordarium。
