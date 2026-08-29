# 06 · 加固线设计规格 H1 —— 审计修复与架构上链（冻结）

> **状态：FROZEN · 2026-08-29**。本规格依据 2026-08 对 v0.1.2 的双轴代码审计（严谨性/灵活性）与四项已决分歧点制定。冻结后修改须走修订流水（文末）。实现合并后须在 `03-system-design-spec.md` 追加修订记录。

## §0 背景与依据

- 审计来源：对 `src/` 的逐文件审计（promotion.ts / controller.ts / scheduler.ts / state/event_store.ts / effects/runtime.ts / select/tournament.ts / evidence/gate_dsl.ts / allocate/allocator.ts）及测试面盘点。
- 已确认强项（本规格不得回退）：append-only 哈希链事件存储（`BEGIN IMMEDIATE` + 逐项目 sequence 单调 + `previous_event_digest` 追加校验 + 投影游标检查）；门禁 DSL（纯函数、白名单谓词、`INCOMPLETE≠FAIL`、Evidence Demand Generator）；promotion 瞬态分类；U×V 自适应分配；锦标赛机制；E1–E4 验收测试面。
- 四项已决分歧（2026-08-29，用户裁定）：
  1. **Goal 范围 = 全部含自重构**：严谨修复与架构上链（门禁/角色/阶段三层）同 Goal。
  2. **判官 = 项目声明制**：判官作为项目级配置事件声明（rubric / llm / manual），无隐式默认。
  3. **判官输入 = 结构 + 受控自述**：结构化字段为形式输入；worker 摘要保留为 `UntrustedText` 辅助输入，长度受控、判决可审计。
  4. **对账 = 混合式**：自动回填终态（succeeded/failed），uncertain 显式 blocked 并附 reconcile 建议，in-flight 只报告。

## §1 目标与非目标

**目标**：
- G1 恢复器官：PREPARED promotion 的启动对账（RecoveryService）+ gate 瞬态分类与重试（GateRunner）。
- G2 选拔器官：项目声明制判官 + 判决事件化 + 判官输入去注入化（SelectionService）。
- G3 架构上链：门禁表 / 角色表 / 阶段图全部事件化上哈希链，调度器解释声明图。
- G4 自重构合同：拓扑变更 = 事件声明 + 通过治理门禁（"系统只能通过自己的证据门禁重构自己"）。
- G5 小项打包：instanceof 修正、授权 source 派生、隔离模型文档化、工具数文档漂移。

**非目标**：规模分片/联邦（单机 SQLite 天花板已知，v2）；容器化执行器实现（仅文档化隔离模型与执行器接缝）；多项目共享账本；API reference 重建（实现合并后随 03 修订一并）；Ordarium 内核任何变更（本 Goal 只消费 v1.0.0 已发布 API）。

## §2 合同要点

### 2.1 新增事件类型（schema 扩展，payload_version 均为 1）

| 事件 | 载荷要点 | 幂等键 |
|---|---|---|
| `CANDIDATE_SELECTED` | `{tournament: [{left,right,winner,tie}], judge: {id, kind: rubric\|llm\|manual, replayable}, winner, entries_digest}` | `selection-v1:{project_id}:{anchor}` |
| `GATE_DEFINED` | `{gate: GateDefinition, declared_by, reason}`（gate_id 内 version 单调） | `gate-defined-v1:{project_id}:{gate_id}:{version}` |
| `ROLE_TABLE_DEFINED` | `{roles: [{role, slots}], hard_cap, soft_cap, declared_by, reason}` | `roles-v1:{project_id}:{revision语义}` |
| `STAGE_GRAPH_DEFINED` | `{stages, transitions, guards, declared_by, reason}`（guards 复用门禁 DSL 子句机制） | `stage-graph-v1:{project_id}:{version}` |

### 2.2 迁移（v(N)→v(N+1)）

迁移必须写入**genesis 声明事件**：默认门禁注册表（现行代码注册的 GateDefinition 全集）、默认角色表（`implementer:2, tester:1, verifier:1, scout:2, analyst:2, soft 8, hard 20`）、默认阶段图（现行硬编码管线的逐字声明化）。**行为等价性由 parity fixture 与 E1–E4 套件强制**（验收 H1-D3）。

### 2.3 模块边界

- 新增 `src/recovery/`：`RecoveryService`（对账 pass，见 §3.1）。
- 新增 `src/tools/gate_runner.ts`：`runGate()`（瞬态分类 + 有界重试，见 §3.2）；瞬态分类 helper 提取至 `src/effects/errors.ts`（promotion 与 gate 共用）。
- `src/select/` 扩展：`RubricJudge`（纯函数）、`DeclaredJudge` 读投影（声明制）、`JudgeView` 合同；controller 的选拔逻辑拆出为 `SelectionService`（C7 随附）。
- `src/tools/controller.ts` 瘦身：status/gate/selection/promotion 驱动/claim/stale 中，恢复与选拔两块移出；controller 保留编排粘合。

### 2.4 判官合同

```ts
interface JudgeView {
  structured: StructuredDigest;      // exit codes / 测试计数 / 文件清单 / 耗时（确定性提取）
  commentary: UntrustedText | null;  // worker 自述，受控
}
interface UntrustedText { text: string; /* ≤512 chars，report 时截断 */ origin: "worker-self-report" }
interface DeclaredJudge { kind: "rubric" | "llm" | "manual"; /* rubric: 纯函数；llm/manual: 判决仍事件化 */ }
```

规则：R1 无 `JUDGE` 声明的项目执行选拔 → `DomainValidationError`（fail-closed，废除恒 tie 假肢）；R2 `llm`/`manual` 判官的 `CANDIDATE_SELECTED.replayable = false`；R3 rubric 判官必须可实现为 `(JudgeView) => Decision` 的纯函数且被重放测试覆盖。

## §3 分项设计与验收

### 3.1 RecoveryService（混合式对账）

- 输入：PREPARED promotion 集合（有 `PROMOTION_PREPARED` 无终态事件）。对每条查 Ordarium `runtime.ledger.get(operationId)`：
  - `succeeded` → 从 receipt 回填 `PROMOTION_COMMITTED`；
  - `failed` → 以 `record.error` 安全错误码追加 `PROMOTION_FAILED`；
  - `uncertain` → `reconcileOnly`（`gitPromote` 的 reconcile 合同：`GitPort.head(worktreeId)` 对比 `expectedHeadCommit` → succeeded/failed/absent）；`absent` + retrySafe → 重新 invoke；否则进 blocked 报告；
  - `dispatched/leased/running` → 不动，报告 in-flight（租约语义归 Ordarium）；
  - `absent` → 重新 invoke（幂等键保护）。
- 集成：`status()` 的 resume block 增分类 `prepared-promotions`；`run()` 在 `scheduler.decide()` 前自动回填终态；uncertain → blocked 报告（附 reconcile 建议），不静默。
- **验收**：H1-A1 FaultInjector 注入 crash（PREPARED↔COMMITTED 之间）→ 重启对账回填 COMMITTED 且 head 正确；H1-A2 uncertain → blocked 报告含 reconcile 建议、无伪造终态；H1-A3 in-flight → 报告且不重复事件；H1-A4 absent → 重 invoke 成功且幂等。

### 3.2 GateRunner

- `LEDGER_BUSY` → 指数退避重试 ×3（200ms 起）；`OPERATION_BUSY`（同 operation 被持）→ 编程错误直接抛（gate 的 operationId 含 attempt+predicate digest，并发 gate 非法）；其余 `OrdariumError` → 原样抛，attempt 显式失败。
- **验收**：H1-B1 注入 LEDGER_BUSY → 重试后成功且无 attempt 泄漏；H1-B2 非瞬态 → 立即 fail-closed 且 report() 落 ATTEMPT_FAILED。

### 3.3 SelectionService（声明制判官）

- `selectCandidate` 按投影中最新 `JUDGE` 声明构造判官；无声明 → fail-closed（R1）。
- `RubricJudge`：纯函数，输入 `JudgeView.structured`；`llm`/`manual` 判官可读 `commentary`（R2/R3 约束）。
- 判决落 `CANDIDATE_SELECTED`（含 rounds/judge/winner/entries_digest）。
- **验收**：H1-C1 声明 rubric → 选择确定性且重放同 winner；H1-C2 无声明 → fail-closed 错误（恒 tie 假肢废除）；H1-C3 判决事件含 rounds 与 judge 引用；H1-C4 超 512 字符摘要被截断且 Untrusted 标注生效。

### 3.4 架构上链（D-1/D-2/D-3）与自重构（G4）

- D-1 门禁上链：注册表改读投影；新版本 = 新 `GATE_DEFINED` 事件；旧版本经现有失效机制绑定失效。
- D-2 角色上链：payload 中 `role` 保持 string，校验层改为对照已声明角色表（schema 枚举退役）；默认表由迁移 genesis 事件提供（§2.2）。
- D-3 阶段图上链：调度器解释声明的 `STAGE_GRAPH_DEFINED`；guards 限门禁 DSL 子句白名单；**默认图 = 现行管线逐字声明化**。
- **自重构合同（G4）**：任何拓扑变更 = 新声明事件 + 通过治理门禁 `architecture-change-v1`（子句：新定义可解析；全部 open attempt/task 在新图中可达；`declared_by` 已记录；与现行版本的差异已陈述）。一票否决（all 模式）。
- **验收**：H1-D1 门禁定义事件往返 + 旧版本失效；H1-D2 声明角色表生效（槽位按声明执行）；H1-D3 默认图声明化后 parity fixture 与 E1–E4 全绿（行为零变化）；H1-D4 声明新图 → 调度器按新图决策；H1-D5 非法图（open 任务不可达）被 `architecture-change-v1` 拒绝；H1-D6 **自发重构 e2e**：不改代码，仅声明（新增角色 + 新阶段）→ 系统按新拓扑运行。

### 3.5 小项（G5）

- C4：`promotion.ts` 以 `error instanceof SimulatedProcessCrash` 替代 name 鸭子类型。
- P2-4：`ORCHESTRATOR_AUTHORIZATION.source` 派生为 `plan-revision:{N}:intent:{kind}`（授权记录指向治理依据）。
- P2-5：`docs/architecture.md` 增"隔离模型"节（worktree 目录级 + DSH 权限系统遏制 + 执行器接缝）；sdk-guide 标注执行器沙箱边界。
- 文档漂移：工具数 9→10 校正。

**验收**：H1-E1 全部小项合入且既有套件零回归。

## §4 风险与回滚

| 风险 | 缓解 |
|---|---|
| D-3 触碰调度器核心引入行为漂移 | H1-D3 parity 门为硬门（默认图声明化后 E1–E4 + parity 全绿才允许后续阶段合并） |
| 迁移后旧代码读新事件类型失败 | 迁移前向单行；**回滚 = 备份恢复 + 代码回退**（诚实标注：事件类型不可被旧代码忽略）——发布前强制全量备份演练 |
| LLM/manual 判官不可重放 | `replayable:false` 显式标注 + 文档；重放语义限定 rubric |
| 自重构被滥用（随意改拓扑） | `architecture-change-v1` 一票否决 + 全部声明事件可溯（谁、何时、为何） |
| 对账与运行竞态 | 对账读 Ordarium 单一事实，回填走既有幂等键；in-flight 不动 |

## §5 验证门与阶段

| 阶段 | 内容 | 出口门 |
|---|---|---|
| H1-P1 | §3.1 + §3.2 + §3.5（恢复器官 + 小项） | H1-A1..A4, H1-B1..B2, H1-E1 全绿 |
| H1-P2 | §3.3（选拔器官） | H1-C1..C4 全绿 |
| H1-P3 | §3.4 D-1/D-2（门禁/角色上链）+ 迁移 genesis | H1-D1..D2 + parity + E1–E4 全绿 |
| H1-P4 | §3.4 D-3（阶段图上链）+ G4 自重构 | H1-D3..D6 全绿 |

全程门：`pnpm check`（build + vitest）+ parity fixture 零漂移 + E1–E4 回归。实现合并后在 `03-system-design-spec.md` 追加修订记录并同步现行文档（architecture/sdk-guide）。

## 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（依据双轴审计 + 四项裁定：全含自重构 / 项目声明制判官 / 结构+受控自述 / 混合式对账） |
| 2026-08-29 | **H1 全案交付**：P1＝`6bd6007`（恢复器官 + 小项）、P2＝`561e132`（声明制选拔）、P3＝`2083923`（门禁/角色上链 + genesis 迁移）、P4＝`47969bb`（阶段图上链 + 声明图解释 + 治理校验 + 自重构 e2e）。出口审计：全量 31 文件 / 165 测试绿；parity fixture v2 与 E1–E4 硬门绿；四条裁决全部落地，未留兼容层（构造器内存选项 `parallel`/`gates` 已移除）。已按 §5 收尾门同步 `03-system-design-spec.md`（SDS-8）与现行文档。 |
