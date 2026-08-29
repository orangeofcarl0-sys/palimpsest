# Context Brief 规格（Context Compiler C2 结构化压缩器，知识闭环的缺环）

> **Spec ID**：`PLMP-CTX-1` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；遥测线以 `08–11`（TLM/ALC）为准；R7 ClaimGraph 语义以 `src/evidence/graph.ts` 为准；素材母体＝raw-notes 预算.txt §1–12（非权威，冲突以正式文档为准）。本文＝C2 结构化压缩器的形状、两条红线与验收权威。
> **修订记录**：`CTX-1`＝初版冻结（2026-08-29）：立项裁决＝C2 切片（用户未应答，按既定推荐模式执行）——检索半边（预算.txt §3 requirement、§5–9 hybrid retrieval/manifest/coverage、§12 boot/pull）明确另立项；[CTX-INV-1..5] 红线；验收 CTX-A01–A06。

---

## 0. 立项与边界

预算.txt 的四模块知识闭环（Context Compiler + Evidence/Gate DSL + Invalidation + Allocator）中，后三者已交付（R1/R2/R5+R13/ALC-2），**Context Compiler 是唯一缺环**；01 §8 所称"trajectory compression"即其 C2 切片（§4：Evidence、decision、failure history **可以结构化压缩**）。本规格把切片接成纯函数器官 + 控制器咨询面。

**最高不变量（预算.txt §1）**：**Context 不是事实源**——brief 是派生的咨询编译物，永不落事件账、永不进 envelope、永不参与 snapshot digest。

**非目标（另立项）**：retrieval 半边（Context Requirement、hybrid retrieval、dependency 图检索、coverage assessment、Context manifest/provenance、Boot/Pull 分层）；C0/C1/C3 层；token 预算；learned retrieval（§52 明令 V0 禁止）。

## 1. 形状

### 1.1 纯函数器官（`src/context/compressor.ts`）

```ts
compileContextBrief(input: ContextBriefInput): ContextBrief
```

输入（控制器从既有投影汇集，全部已存在）：

| 域 | 来源 | 层级 |
|---|---|---|
| `evidence` | evidence 投影（evidence_json：subject/predicate/exit_code/status） | **事实层** |
| `interpretations` | attempts 的 report_json（summary/worker_status/task_id） | **解释层** |
| `claims` | R7 ClaimGraph（label + claimStatus：status/supportedBy/contradictedBy） | **冲突层** |

输出 `ContextBrief { projectId, facts, interpretations, conflicts }`：

- `facts`：证据原子 **1:1 直拷**（evidenceId/subject/predicate/exitCode/status）——零摘要、零合并、零生成文本；
- `interpretations`：attempt 报告 1:1（workerStatus 是**自述**，明确标注为解释层）；
- `conflicts`：凡 `contradictedBy` 非空的 claim，双侧证据 id 并列、R7 判定**原样直拷**。

### 1.2 红线（[CTX-INV-1..5]，违反即缺陷）

| # | 红线 |
|---|---|
| [CTX-INV-1] | **事实层零摘要**：facts 与证据原子一一对应，字段直拷，压缩器不生成任何事实文本（预算.txt §10：摘要不得污染事实） |
| [CTX-INV-2] | **层级隔离**：facts 不携带 summary，interpretations 不携带证据 id——两层的字段集类型级分离，无混合形态 |
| [CTX-INV-3] | **冲突不平均**（预算.txt §11）：被反驳的 claim 原样进 conflicts，supports/contradicts 双侧并列、verdict 直拷 R7 判定，压缩器绝不生成"大体支持 X"式混合结论 |
| [CTX-INV-4] | **纯函数**：同输入必同输出；无时钟、无随机、无 I/O |
| [CTX-INV-5] | **咨询面**：brief 永不 append 事件、不进 envelope、不参与 snapshot digest |

## 2. 控制器组合

```ts
contextBrief(options?: { taskId?: string }): ContextBrief
```

- 汇集投影 → `compileContextBrief`；`taskId` 过滤收窄 attempts 与其证据（evidence.subject ∈ 该任务的 attempt 集）；claims 在 V0 为**项目级全局**（图无 task 维度，声明在案）。
- 与 `status`/`resume` 同为只读派生面；工具面不动（controller API，编程宿主/`/advanced` 消费）。

## 3. 无兼容层

- 全新器官、全新文件（`src/context/`，镜像预算.txt §50 的代码边界命名）；不替代、不包装任何既有面；R7/证据投影合同零改动。
- 事件契约、digest、parity：零触碰（brief 永不落账，[CTX-INV-5]）。

## 4. 验收

| # | 验收 | 方法 |
|---|---|---|
| CTX-A01 | 分层完整 | 种子投影（2 证据 + 2 报告 + 1 claim）：facts 与证据 1:1、interpretations 与报告 1:1 |
| CTX-A02 | 摘要污染守门 | facts 项无 summary 字段；interpretations 项无证据 id 字段（类型级 + 断言） |
| CTX-A03 | 冲突不平均 | 同时被支持与反驳的 claim → conflicts 单条、双侧 id 并列、status 原样直拷、无生成结论文本 |
| CTX-A04 | 纯函数确定性 | 同输入双调用全等 |
| CTX-A05 | 咨询面红线 | `contextBrief()` 前后事件数与 `snapshotDigest` 不变 |
| CTX-A06 | task 过滤 | `taskId` 收窄 attempts/evidence 至该任务；claims 保持全局 |

交付出口：全量 `pnpm check`（34/196 基线 ＋ 新增）；03 SDS bump；00-heritage 差异登记行（R16）；01 §3 分层图行；工程索引登记。

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-CTX-1）：C2 切片立项（推荐模式）；`compileContextBrief` 形状、三层输入映射、[CTX-INV-1..5] 红线、`contextBrief` 咨询面、验收 CTX-A01–A06；检索半边与 C0/C1/C3 层明确另立项。 |
