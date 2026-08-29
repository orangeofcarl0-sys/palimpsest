# 模型推荐咨询面规格（R6 bestModel 接线，ALC 闭环的咨询臂）

> **Spec ID**：`PLMP-ALC-2` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；遥测持久层与消费闭环以 `08`（PLMP-TLM-1）/`09`（PLMP-ALC-1）为准；R6 语义以本仓库 `src/telemetry/performance_table.ts`（raw-notes 预算.txt §43）为准；本文＝模型推荐咨询面的形状、诚实门控与验收权威。
> **修订记录**：`ALC-2`＝初版冻结（2026-08-29）：立项裁决＝A-2 纯咨询面（用户选定）；R6 `bestModel` 原样复用、新增诚实门控（per-model 资格 + 零成本静默）；验收 ADV-A01–A06。

---

## 0. 立项与边界

ALC-1 闭环解决了"用多少算力、什么档位"（escalation/candidates），R6 的另一半承诺——"哪个模型"（`bestModel`/`expectedCostPerSuccess`，raw-notes §43）——有 API、有持久层，但无生产消费面。本文把它接成**纯咨询面**：宿主在调用 `allocateFor` 时提交自己的可运行候选集与价格，遥测数据充分时返回建议与理由；**宿主仍自选模型**。

**非目标**：`TaskEnvelope`/`TaskSpec` 不加 model 字段（事件契约零触碰）；7 工具面不动（`allocateFor` 是 controller API）；选拔/tournament 不消费建议；不做自动模型切换；不做 learned policy（R5 表头预留，远期）。

## 1. 形状

### 1.1 器官（R6 线，`ModelPerformanceTable` 新增）

```ts
export const MODEL_MIN_ATTEMPTS = 8;   // per-model 数据资格

suggestModel(
  taskType: string,
  candidates: readonly { model: string; cost: number; priorSuccessRate?: number }[],
): { model: string; reason: string } | undefined
```

- `candidates[].cost` ＝ **每次尝试**的价格（与归因 `attribution.cost` 同语义）；`priorSuccessRate` 透传 R6 冷启动先验。
- **排名算法零新增**：直接复用 R6 `bestModel`（Gamma 平滑 + costPerSuccess 升序 + 冷启动 `cost/prior` 回退）——与 ALC-1"`allocate()` 本体零改动"同纪律，本规格的新增性质全部在**门控**。

### 1.2 诚实门控（建议存在的全部条件）

| # | 条件 | 违反时 |
|---|---|---|
| [ADV-G1] | 至少一个候选 **data-backed**（per-model `attempts ≥ MODEL_MIN_ATTEMPTS`） | 无数据支撑的建议是编造 → `undefined` |
| [ADV-G2] | 至少一个**参与排名**的候选拥有非零成本基础（data-backed 看 `avgAttemptCost > 0`；冷候选看 `cost > 0`） | 全零成本下 costPerSuccess 比较无意义且 0 恒胜 → 该候选不参与排名；无排名集 → `undefined` |
| [ADV-G3] | `bestModel` 返回 defined | 空集/全无成本基础 → `undefined` |

- 零成本候选**不参与排名**（价格信号缺失即弃权），但不妨碍其他候选被推荐。
- 冷候选（无 data-backed stat）以 `cost / priorSuccessRate` 参与排名——R6 §43 原义；一旦任务类型存在 data-backed 样本，纸面便宜的未试模型可以入选建议（生成数据的探索是建议的合理产出），`reason` 标注 `prior-based` 以示基础。
- `reason` 固定携带：模型名、attempts、平滑成功率、cost/success、基础（`data-backed` / `prior-based`）。

### 1.3 控制器组合（`allocateFor` 咨询臂）

```ts
allocateFor(taskId, estimates, options?: {
  /** 咨询候选集（宿主可运行集 + 价格）；缺席 = 无模型建议，其余行为不变。 */
  modelCandidates?: readonly { model: string; cost: number; priorSuccessRate?: number }[];
}): {
  allocation: Allocation;
  concurrency: AllocationCalibration;
  suggestedModel?: string;
  suggestedModelReason?: string;
}
```

- 建议与 ALC-1 档位重映射**相互独立**：档位回答"多少推理力"，模型建议回答"哪个具体模型"，V1 不耦合。
- 缺席 `modelCandidates` / 冷表 / 门控不过 → `suggestedModel` 缺席，`allocateFor` 其余行为**逐字节不变**（既有调用方零影响）。

## 2. 无兼容层与契约冻结面

- 事件契约、digest、投影、parity：零触碰（`[ACC-02]` 不触发）；返回面为**加法式可选字段**。
- R6 `bestModel`/`expectedCostPerSuccess`/`stat` 合同零改动；新增性质只有 `MODEL_MIN_ATTEMPTS` 常量与 `suggestModel` 门控方法。
- 无旧路径、无迁移、无 shim：本面是 R6 咨询能力的首次生产接线。

## 3. 验收

| # | 验收 | 方法 |
|---|---|---|
| ADV-A01 | 数据驱动推荐 | 两个 data-backed 候选（便宜的 58% 成功率 vs 昂贵的 83%）：推荐 costPerSuccess 更低者（便宜的胜出——单位成功成本才是 R6 判据），reason 含 data-backed 与数值 |
| ADV-A02 | per-model 资格门 | 全部候选 per-model attempts < 8 → `undefined`（即便 task_type 聚合充足） |
| ADV-A03 | 零成本静默 | data-backed 但全零成本 → `undefined`；混合成本时零成本候选不参与排名、不妨碍他人 |
| ADV-A04 | 零配置默认 | 无 `modelCandidates`、冷表、空候选集 → `undefined`；`allocateFor` 其余返回与现状全等（既有调用方零影响） |
| ADV-A05 | 先验回退 | 存在 data-backed ∧ 冷候选纸面更优 → 冷候选可被推荐，reason 标注 `prior-based` |
| ADV-A06 | 纯函数确定性 | 同输入双调用全等 |

交付出口：全量 `pnpm check`（33/185 基线 ＋ 新增）；03 SDS bump；00-heritage 差异登记行（R14）；01 §3 分层图行；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-ALC-2）：A-2 立项（用户选定）；`allocateFor` 咨询臂形状、R6 `bestModel` 原样复用 + 诚实门控 [ADV-G1..3]（per-model ≥8、零成本静默、先验回退标注）、验收 ADV-A01–A06。 |
