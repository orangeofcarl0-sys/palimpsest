# 契约纪律 + 视图新鲜度 规格（PLMP-PARSE-1，G9-F）

- 日期：2026-09-10
- 母体审计：`audits/G9-F-CONTRACT-VIEW-FRESHNESS-ASSESSMENT.md`（机器探针先行，scratch 8/8 实证后删除）
- 立论：**契约被精确解释**＋**用户可见视图的新鲜度绝不冒充 canonical 事件位置**

## 1. 裁决

### 1.1 作者书写封闭契约（§7）

$$
AuthorAuthoredClosedContract \Rightarrow UnknownField = ERROR
$$

修复面（全部探针实证过的宽松点）：`parseStageGraphDefinition`（根/阶段/转换/守卫信封四层）、`parseGateDefinition`（信封＋require 的 all/any 互斥）、`parseClause`（信封恰好一个 exists|count|not）、`presetDraft`（未知参数键＝错误）。旧计划 PARSE-H02（Canvas task payload）＝**已闭合**（G9-D），登记不再实现。

### 1.2 嵌套语法唯一属主（PARSE-INV-2）

StageGraph 修复只在**自己拥有的对象层**加未知键拒绝；守卫子句数组原样委托 `parseClause`；GATE_DEFINED/STAGE_GRAPH_DEFINED 事件 payload 的嵌套语法归 parseGateDefinition/parseStageGraphDefinition（信封层只拒信封级未知键）。

### 1.3 开放映射保持开放（PARSE-INV-3）

`parseWhere`（gate 子句 where）内容、`EvidenceAtom.value` 内容、`CONTEXT_MANIFEST_ADDED` 的 `manifest.requirement`（CTX-2 历史裁决）**永不**因键级严格化被拒；含它们的契约信封上的未知键照拒（`valu` 拼写＝错误）。

### 1.4 Canonical 逐合同显式策略（WIRE-INV-1；§9 矩阵见审计 B 节）

新增 `rejectUnknownFields(raw, allowed)`；每个 canonical parser 与每个 `normalizeEventPayload` case 显式声明 required∪optional∪open 并调用之。**禁止**全局改 `requireFields()`（§12）。可选键全部进允许集（TaskSpec 四项、TaskEnvelope.suggested_skills、AttemptReport.context_manifest、HOLD_SET.project_revision、manifest.semantic、TASK_READY/TASK_STALE 的 batch_activation_event_id 可选、CANDIDATE_SELECTED 的 task_id/winner 可空等——逐 parser 枚举）。

### 1.5 历史兼容门（WIRE-INV-2；§14）

strictness 变更必须过：`fixtures/replay/baseline-v1.json`（Python digest 逐字节 parity）、全量 replay/canonical digest、SDS-4 加法式 golden、`fixtures/ordarium/ledger-v2.sqlite`（conformance 链）。历史对象出现解析器不拥有的键：先 A（缺已声明可选）/B（fixture 非法）/C（扩展点）三查再裁。

### 1.6 文档与实现一致（§15）

`models.ts` 头注释改述实际行为：必填严格＋**逐合同显式**未知键策略（封闭＝拒；显式开放映射例外清单写明）——不再宣称笼统 "unknown input fail-closed"。

## 2. 视图新鲜度（§16–§28）

### 2.1 概念分离

$$
EventCursor \neq ViewCursor\quad(\text{VIEW-INV-1})
$$

- **EventCursor**：`graph.project.cursor` 语义原样（canonical 事件位置）。
- **ViewCursor**：不透明串 `v1:<epoch>:<eventCursor>:<viewGeneration>`；同 viewCursor ⇒ 同完整编排投影（VIEW-INV-2）。epoch＝进程一次性随机 nonce（重启即变，VIEW-INV 跨进程假等价不可能）；viewGeneration＝进程内单调计数，**仅**图可见易变态（`#attemptAttribution` set/delete）变更时 +1；不进图的状态（telemetry/budget/slots/generation）一律不加（WEB-H01-D）。
- 审计结论：`evaluateAttemptGate` 结算＝进程内**无事件**的图可见变更（VIEW-INV-3 的具体路径）——只看事件游标的快路径会撒谎，viewGeneration 必需。

### 2.2 轮询协议（§26/§27）

- `GET /api/graph?viewCursor=<opaque>`：命中（同进程 epoch＋eventCursor＋viewGeneration 全等）⇒ `{changed:false, viewCursor}` **不建图**（VIEW-INV-4）；未命中 ⇒ 全图＋新 viewCursor。
- 旧 `?cursor=<event-id>`：语义原样（照常建图；`changed` 判定不变）——不安全早退永不发生。
- 无参：全图＋新 viewCursor。响应加法式加 `viewCursor` 字段。

### 2.3 健康（HEALTH-INV-1；§29/§30）

`GET /api/health` ⇒ `{ok:true, projectInitialized, eventCursor?}`，廉价查询（scheduler_control/events 存在性＋MAX），**永不建图**；空库 ⇒ 200/ok=true（WEB-HEALTH-A01）。

## 3. G9-C 腰带（§31/§32）

- **PRES-BELT-INV-1**：`NodeOrder(after) = NodeOrder(semanticResult)`——修复 `[...kept,...fresh]` 为按 semanticResult 序输出（位置仍按 before/避让）；交错序腰带测试钉住。
- §32 child-before-parent：语法合法（owner 只要求存在于 doc）；placement 播种按"owner 已定位则 owner 下方，否则全局网格"，**输出序仍按 semanticResult**（腰带测试钉住，不建布局引擎）。

## 4. 验收

- **PARSE-H01-A/B/C**：三处 typo 修复后必须抛错（`unknown stage graph field "concurency"` 等）；**PARSE-H01-D**：守卫子句内容仍由 parseClause 全权拥有（合法子句过、子句信封未知键拒、where 内容开放）。
- 矩阵抽查：每 canonical parser 一个未知键拒绝用例＋EvidenceAtom.value/where 开放内容仍接受＋信封未知键拒绝。
- **WEB-H01-A**（同 viewCursor：建图计数不增、changed=false）、**B**（追加图可见事件 ⇒ 失效）、**C**（evaluateAttemptGate 无事件结算 ⇒ 失效且 MAX(event_id) 不变）、**D**（非图可见变更不扰游标）、**E**（跨进程旧游标不得命中快路径）。
- **WEB-HEALTH-A01**：空库 health 200/ok=true。
- PRES-BELT ×2（交错序、child-before-parent）。
- 回归门：kernel/web tsc、全量 vitest（基线 58/398）、web build、浏览器冒烟 §39（A/B/C/D）。

## 5. 不变量汇总

```text
PARSE-INV-1  作者书写封闭契约 ⇒ 未知键＝错误
PARSE-INV-2  嵌套语法唯一属主
PARSE-INV-3  显式开放映射保持开放；信封未知键不开放
WIRE-INV-1   canonical 未知键策略逐合同显式（非 requireFields() 副作用）
WIRE-INV-2   历史合法 fixture 在 strictness 变更后仍可解析
VIEW-INV-1   EventCursor ≠ ViewCursor
VIEW-INV-2   同 ViewCursor ⇒ 完整编排投影未变
VIEW-INV-3   ViewCursor 失效 ⇏ canonical 事件变更（易变态独立失效）
VIEW-INV-4   安全未变快路径不建图
HEALTH-INV-1 服务健康不要求已初始化 ProjectIR
PRES-BELT-INV-1 表现 reconcile 永不改 semanticResult 节点声明序
```

## 6. 非目标（§34/§35）

UAS 全部对象零实现（EventCursor/ViewCursor 设计不阻塞未来特征）；Ordarium 保持 Effect Authority（不存视图游标）；G9-G/G10 不开工。

## 7. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-10 | 初版冻结（PLMP-PARSE-1）：母体审计机器探针先行；StageGraph/GateDefinition/GateClause/preset 参数未知键＝错误；canonical 逐合同 `rejectUnknownFields`（禁全局 requireFields 重写）；开放映射三例外登记；EventCursor≠ViewCursor（v1:epoch:eventCursor:viewGeneration，evaluateAttemptGate 无事件结算实证）；?cursor= 保守兼容；health 空态修复；G9-C 节点序腰带。 |
