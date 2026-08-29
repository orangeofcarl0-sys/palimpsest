# 遥测驱动自适应分配接线规格（R6→R5 闭环，管理型遥测的首个消费闭环）

> **Spec ID**：`PLMP-ALC-1` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；遥测持久层以 `08-telemetry-externalization-spec.md`（PLMP-TLM-1）为准；分配规则语义以本仓库 `src/allocate/allocator.ts`（R5，raw-notes 预算.txt §33–43/§51）为准；本文＝遥测→分配消费闭环的形状、权限边界与验收权威。跨仓库面无变更（消费走既有 TLM 门面），不涉 07 演进清单新项。
> **修订记录**：`ALC-1`＝初版冻结（2026-08-29）：两项用户裁决（身份＝宿主层供给、消费＝保守重映射）经 AskUserQuestion 确认；三段闭环设计、阈值常量、硬不变量清单、验收 ALC-A01–A11。

---

## 0. 立项与边界

R6 遥测的愿景承诺（01 §3："feeds the allocator once telemetry reaches the threshold"）与 R5 表头预留（"a learned policy may replace it after telemetry accumulates"）在 TLM 落地后前置就绪，但闭环未接：生产代码无 `telemetry.record()` 调用点、事件契约无 model 概念、`allocate()` 不读遥测。本文把闭环接上。

**用户裁决（2026-08-29，冻结）**：

| # | 裁决 | 内容 |
|---|---|---|
| ALC-D1 | 身份＝**宿主层供给** | task_type/model/cost 由宿主在 claim 时可选供给；**事件契约零改动**（TaskSpec/TaskEnvelope/AttemptReport 不动，无 SDS-4 例外触点，parity 零风险）；宿主不供即不记录不消费，零配置默认不变 |
| ALC-D2 | 消费＝**保守重映射** | telemetry 只重映射 escalation（worker↔strong）＋仅在 easy/deterministic 验证下允许上调 candidates；下行省钱靠档位降级，**样本数绝不因遥测收缩** |

**非目标**：learned policy（R5 预留项，远期另立项）；per-model 自动选模注入 envelope（escalation 档位是本闭环全部模型自由度，具体模型仍由宿主自选）；7 工具面任何变更与 `palimpsest_status` 遥测视图（P2 工具冻结边界，需另行裁决）；TLM 存储形状变更；契约加法式字段（D1 裁决排除）。

## 1. 三段闭环总设计

```text
[身份段] claim(attemptId, attribution?)          → 内存归因表（不持久、不入契约）
[记录段] attempt 证据面终局（gate verdict）       → telemetry.record()（内存面同步）
         pump 边界 / persistTelemetry()          → TLM delta append（幂等，失败浮出）
[消费段] allocateFor(taskId, estimates)          → allocate(estimates)（R5 原样）
         → adjustAllocation(rule, telemetry, …)  → 保守重映射（纯函数）
```

- 采样单位＝**attempt**；每个 attempt 恰至多一条遥测记录。
- 记录面（内存）同步无阻塞；持久化面复用 TLM（append-delta 主体、list 聚合），**零新 Ordarium 消费面**（不用 refs/history，07 红线保持）。
- 全程零事件、零投影、零 parity 触点；`snapshotDigest` 不变性由 TLM-A04 既有守门继续覆盖。

## 2. 身份段：宿主层归因（裁决 ALC-D1）

- `ProjectController.claim(attemptId, attribution?: AttemptAttribution)` 增加可选参数：

```ts
interface AttemptAttribution {
  /** 运行该 attempt 的模型标识（宿主任意命名空间，如 "flash"/"claude-x"）。 */
  model: string;
  /** 该 attempt 的宿主计价成本（≥0 有限；缺省 0——0 成本行使 costPerSuccess 比较失效，宿主应供真实值）。 */
  cost?: number;
  /** 遥测 task_type；缺省 = 该 attempt 任务的角色（TaskSpec.role，缺席即 "implementer"）。 */
  taskType?: string;
}
```

- 归因存入**内存 per-attempt 表**（`Map<attemptId, attribution>`），结算时消费并清除；进程崩溃丢失未结算样本——遥测是统计面而非 canonical，**不迁移、不补记**（声明在案）。
- 归因缺席的 attempt：正常执行，仅不产生遥测样本（`ALC-A03`）。零配置强默认（01 §9.1）不受影响。
- V1 归因入口＝controller API（`/advanced` 面、编程宿主、测试）；7 工具面的 `palimpsest_claim` 输入 schema **不扩**（工具冻结），真实 DSH manifest 切换（G9 遗留）后再议。

## 3. 记录段：证据面结算（合同 1 的遥测面）

- **成功判据＝证据面，绝不自述面**（三句合同第 1 句的遥测化）：
  - 记录点 ①（R12 自动路径）：`runAttemptWithCommandExecutor` 中机械门禁 `exitCode === 0` → success；否则 failure。exitCode 为 null（进程被终止等未知）→ **不记录**（未知不是样本）。
  - 记录点 ②（手动路径）：对某 attempt 的 `evaluateGate`/gate 求值 verdict＝PASS → success；FAIL → failure；未做门禁求值 → 不记录。
- `cost` 取归因值（缺省 0）；`task_type` 取归因值（缺省 role）。
- 结算即记账（内存面同步）；持久化双通道：pump 步进边界自动 flush ＋ 显式 `persistTelemetry()` 保留。flush 尽力而为——TLM 增量幂等保证失败不丢（synced 基线未推进，下次 flush 自动重试同一增量），失败置 pending 并经 `persistTelemetry()`/status 面浮出，**绝不静默**（01 §9.4）。

## 4. 消费段：保守重映射（裁决 ALC-D2）

### 4.1 形状

- 新增纯函数适配器 `src/allocate/telemetry_adapter.ts`：

```ts
adjustAllocation(rule: Allocation, input: {
  estimates: AllocationEstimates;      // 原六维（用于不变量判定）
  candidateLimit: number;              // 宿主 policy 上限（envelope candidate_limit 同源）
  stats: | {
      attempts: number;                // task_type 聚合（跨模型合并）
      successes: number;
      successRate: number;             // Gamma 平滑（R6 公式：prior 4 @ 0.5）
    }
    | undefined;                       // undefined = 无遥测 → 原样返回
}): Allocation
```

- `allocate()` 本体**一字不改**；`allocateFor` 在 `allocate(estimates)` 之后调用适配器（遥测 stats 由 controller 从内存表按 task_type 聚合取出）。R10 并发校准仍作用于调整后输出，机制不变。

### 4.2 资格与常量（V1 冻结值；调整走 ALC 修订流水，不静默改）

| 常量 | 值 | 语义 |
|---|---|---|
| `ELIGIBILITY_MIN_ATTEMPTS` | 12 | task_type 聚合 attempts < 12 → **原样返回**（遥测不参与） |
| `ESCALATE_BELOW` | 0.5 | 聚合平滑成功率 ≤ 0.5 → worker 可升 strong |
| `DOWNGRADE_ABOVE` | 0.85 | 聚合平滑成功率 ≥ 0.85 → strong 可降 worker |

### 4.3 重映射规则（顺序即优先级，首条命中即止）

1. **escalation 升档**：资格成立 ∧ `successRate ≤ ESCALATE_BELOW` ∧ rule.escalation＝`worker` → `strong`；candidates/verifiers 不动。
2. **escalation 降档**：资格成立 ∧ `successRate ≥ DOWNGRADE_ABOVE` ∧ rule.escalation＝`strong` → `worker`；candidates/verifiers 不动。
3. **candidates 上调**：资格成立 ∧ `successRate < ESCALATE_BELOW` ∧ `estimates.verifiability ∈ {"deterministic","easy"}` ∧ rule.escalation＝`worker` → `candidates = min(rule.candidates × 2, candidateLimit)`。
4. 其余一律原样返回。

`reason` 组合规则：规则表 reason ＋ 遥测子句（如 `"; telemetry: pooled success 0.42 over 18 attempts → escalate to strong"`）——分配决策在 reason 字符串内自解释，可审计。

### 4.4 硬不变量（任何 stats 下成立，违反即缺陷）

| # | 不变量 |
|---|---|
| [ALC-INV-1] | `expensiveExecution` 分支输出不可变（§44 GPU 预筛：廉价推理先行、绝不放宽 fan-out） |
| [ALC-INV-2] | U×V 象限（high uncertainty ＋ weak verification）candidates 永不增加（§35：64 个不可验证的意见仍是不可验证） |
| [ALC-INV-3] | `cheap` 与 `design-experiment` 档位永不重映射（结构性判断，非成功率判断） |
| [ALC-INV-4] | candidates 永不因遥测下调（保守裁决 ALC-D2：下行省钱只走档位降级） |
| [ALC-INV-5] | 一切输出仍受 `candidate_limit` 与 R10 并发校准钳制（既有机制，双重保险） |
| [ALC-INV-6] | 适配器为纯函数：同输入必同输出，无时钟、无随机、无 I/O |

## 5. 无兼容层与契约冻结面

- 事件契约、digest 规则、投影、migration、parity fixture：**零触碰**（D1 裁决）；`[ACC-02]` 不触发。
- `allocate()` 纯函数签名不变；telemetry 调整以独立适配器存在（00-heritage 差异登记于交付时补行）。
- TLM 模块零改动（新增的只是调用方）；`TelemetryStateSync`/`ModelPerformanceTable` 既有合同面不动。
- 无迁移、无旧路径 shim：本闭环是 R6 首次生产接线，不存在被替代的旧实现。

## 6. 验收

| # | 验收 | 方法 |
|---|---|---|
| ALC-A01 | 归因→记账闭环 | claim 带 `{model, cost}`，pump 跑 FakeGitPort 脚本化先败后成：每次 attempt 终局恰好一条记录，成败与 cost 与证据面一致 |
| ALC-A02 | 自述不算成功 | worker 报 completed 但 gate FAIL → 记 failure（合同 1 遥测化）；gate PASS 才记 success |
| ALC-A03 | 无归因零记录 | 不带 attribution 的 claim 全程零遥测样本；`allocateFor` 行为与现状逐字节一致 |
| ALC-A04 | 阈值门 | task_type 聚合 attempts < 12 → `adjustAllocation` 原样返回（reason 亦不变） |
| ALC-A05 | 升档重映射 | 种子遥测使聚合平滑成功率 ≤ 0.5 ∧ rule＝worker → strong，candidates/verifiers 不动，reason 含遥测子句 |
| ALC-A06 | 降档重映射 | 平滑成功率 ≥ 0.85 ∧ rule＝strong → worker |
| ALC-A07 | candidates 上调 | 成功率 < 0.5 ∧ verifiability＝easy ∧ rule＝worker → `min(candidates×2, candidateLimit)`（含钳制命中例） |
| ALC-A08 | 硬不变量矩阵 | [ALC-INV-1..4] 逐条：stats 取极值（0 成功/全成功/海量样本）下 expensiveExecution、U×V、cheap、design-experiment 输出与 rule 全等 |
| ALC-A09 | 纯函数确定性 | 同输入双调用全等；无时钟/随机依赖 |
| ALC-A10 | 跨会话学习闭环 | 结算→flush 落 state kind→新 controller `loadTelemetryInto`→`allocateFor` 依据重建统计给出与首个进程一致的调整 |
| ALC-A11 | flush 失败不丢不默 | 首次 flush 注入失败 → pending 浮出；下次 flush 幂等补写同一增量（恰一条主体），编排步进不中断 |

交付出口：全量 `pnpm check`（32/173 基线 ＋ 新增）；03 SDS bump（SDS-11）；00-heritage 差异登记行；01 §3 分层图 R13 行；工程索引登记。

## 7. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-ALC-1）：两项用户裁决（ALC-D1 宿主层供给、ALC-D2 保守重映射）经 AskUserQuestion 确认；三段闭环、身份段可选归因、证据面结算语义、阈值常量（12 / 0.5 / 0.85）、重映射规则与 [ALC-INV-1..6] 硬不变量、验收 ALC-A01–A11。 |
