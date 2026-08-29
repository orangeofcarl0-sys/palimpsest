# status 遥测视图规格（遥测线的用户面）

> **Spec ID**：`PLMP-TLM-2` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；遥测持久层与消费闭环以 `08`/`09`/`10`（PLMP-TLM-1 / ALC-1 / ALC-2）为准；本文＝遥测在 `palimpsest_status` 用户面的形状、术语隔离红线与验收权威。
> **修订记录**：`TLM-2`＝初版冻结（2026-08-29）：立项说明（工具**集合**冻结不动，status 人话内容随系统生长有 H1 先例——`status.resume` 即 H1 新增）；加法式可选 `telemetry` 节、冷表缺席、术语隔离红线；验收 STV-A01–A03。

---

## 0. 立项与边界

遥测线已能记录（TLM-1 外置）、能决策（ALC-1 重映射、ALC-2 模型建议），但用户在 `palimpsest_status` 里看不见任何遥测——用户友好原则 4（失败可见）与人话原则要求补上这一环。

**边界裁决**：7 工具**集合**冻结不动（不增删工具、不改工具入参契约）；本规格只生长 `status` 的人话内容——先例：H1 向 status 增设 `resume` 节（06 规格），本规格同法。

**非目标**：不做遥测管理/清零/导出工具；不暴露估计器术语（Gamma/先验）；不进 `palimpsest_gate` 等其他工具输出。

## 1. 形状

### 1.1 `ControllerStatusView` 加法式可选节

```ts
telemetry?: {
  rows: Array<{
    task_type: string;        // 遥测类型（缺省即任务角色）
    model: string;
    attempts: number;
    successes: number;
    successRate: string;      // 人话百分比，如 "58%"（R6 平滑值，不暴露估计器术语）
    avgCost: string;          // 每次尝试平均成本，四位小数，如 "0.0020"
    costPerSuccess: string;   // "0.0040"；无样本成本基础时 "n/a"
  }>;
};
```

- **冷表缺席**：零样本时 `telemetry` 键不存在（零配置强默认，01 §9.1——空节也是噪音）。
- 数据源＝内存面 `telemetry.snapshot()`（重启后经 `loadTelemetryInto` 重建，跨会话可见）。
- 行数不设上限：遥测天然低频（每 attempt 终局一条），V1 不做分页。

### 1.2 术语隔离红线（01 §9.2）

遥测节**只含**上列七字段；不得出现 `event_id`、哈希链、digest、估计器名称、namespace/revision 等内部词汇。由 STV-A03 机器守门。

## 2. 无兼容层

- 加法式可选字段：既有 status 消费方零影响；`palimpsest_status` 工具契约（入参/工具名）不变。
- 无迁移、无开关：遥测节随数据自然出现，不设配置项。

## 3. 验收

| # | 验收 | 方法 |
|---|---|---|
| STV-A01 | 有样本即人话可见 | pump 带归因跑两 attempt（一败一成，各 0.002）→ status.telemetry 一行：attempts 2、successes 1、successRate "50%"（平滑值）、avgCost "0.0020"、costPerSuccess "0.0040" |
| STV-A02 | 冷表缺席 | 无归因跑 pump → status 无 `telemetry` 键 |
| STV-A03 | 术语隔离红线 | 遥测节键集恰为七字段；序列化文本不含 event/digest/hash 等内部词汇 |

交付出口：全量 `pnpm check`（34/193 基线 ＋ 新增）；03 SDS bump；00-heritage 差异登记行（R15）；01 §3 分层图行；07 r6（含对侧 research 文书滞后澄清，D 类项）；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-TLM-2）：加法式 `telemetry` 节、冷表缺席、人话格式、术语隔离红线、验收 STV-A01–A03。 |
