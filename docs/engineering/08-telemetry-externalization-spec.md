# Telemetry 外置试点设计规格（管理型 state kind 首消费）

> **Spec ID**：`PLMP-TLM-1` ｜ 状态：**生效**
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；跨仓库协调以 `07-ordarium-alignment.md`（PLMP-ALN）为准；本文＝telemetry 外置消费的形状、错误分类与验收权威。对侧合同：Ordarium docs/17 §16.6（G11）与 `@ordarium/core` state 合同面（`createStateStore`/`StateRecord`/`StateRef`）。
> **修订记录**：`TLM-1`＝初版冻结（2026-08-29）：append-delta 主体形状、错误分类映射、无兼容层退役清单、验收 TLM-A01–A06。

---

## 0. 立项与边界（裁决 ALN-1 的唯一试点落地）

- 试点＝ALN-1 §1.2 预定的唯一管理型消费点：`ModelPerformanceTable` 的**持久层**从本仓库 orchestration SQLite 扩展表（`palimpsest_telemetry`，R11）外置到 Ordarium 管理型 state kind（`operations.sqlite` 共享时间线）。
- 外置收益：跨会话存活（既有）之外，新增**跨进程/跨宿主可见可审计**——每次持久化在共享账本留 revision 与 writer identity，宿主可用 Ordarium 公开 API 读取。
- 非目标（红线）：对话型状态（ALN-1 不设）；编排真相/治理声明上账（**永不上账**）；refs 反查消费（本试点不使用 `listReferencing`，更不进编排恢复路径）；telemetry 进入投影合同/parity fixture（绝不，TLM-A04 守门）。

## 1. 消费形状

- **store 构造**：`createStateStore({ runtime })` 绑定 `createPalimpsestEffects` 内的 `OrdariumRuntime`（quiesce/close 闸门随写路径生效），随 `PalimpsestEffectsRuntime.state` 暴露为唯一消费点。本仓库不直读账本 schema，全部走该门面。
- **namespace**：`palimpsest.telemetry.v1`——版本化命名空间自第一天生效；未来形状升级＝换 namespace，不留读旧层。
- **主体粒度＝append-delta（一次性主体）**：每次 `persistTelemetry()` 把内存表相对已同步基线的增量写成**一个新主体**：key＝`delta-<uuid>`（不透明，≤128 字符），value＝`{task_type, model, attempts, successes, cost}`（`attempts≥1` 整数、`successes≤attempts`、`cost≥0` 有限），`expectedRevision: 0` 创建，创建后永不改写。
- **装载＝list 聚合**：`listStates({namespace})` 全量分页拉取 → 按 value 聚合（三项计数求和）→ `ModelPerformanceTable.addAggregated()` 注入。跨项目同 (task_type, model) 的计数器随求和自然合并。
- **identity**：每次写 synthesized `{source: "palimpsest-telemetry", scope: "telemetry", callId: "tel-<uuid>"}`——遥测是管理面写入，不属于任何编排调用，不伪造编排身份；authorization 不带（state 合同可选项，管理面遥测无编排授权语义）。
- **决策记录（ALN-4③ 首消费者形状反馈之一）**：不用"每对一槽位 + CAS 累加覆盖"——多写者下覆盖式 CAS 计数器没有干净的合并规则（取 max 丢增量、求和双计）；一次性增量主体把并发合并退化为**交换律求和**。管理型状态里"计数器类负载"的正确形状是 append-only 主体而非可变槽位，值得 Ordarium 侧在 G11 文档中补记。

## 2. 错误分类（ALN-1：instanceof 映射，不硬编码数字码）

- `StateRevisionConflictError`：仅在 key uuid 碰撞（实际不可达）时可见；flush 内部换 key 有界重试（3 次）后上抛。新增分类 helper `isStateRevisionConflict`（`src/effects/errors.ts`）——归**busy 族**（存储争用、重试安全），与 transient（结果未决）互斥。
- `RuntimeClosedError` / `RuntimeQuiescingError`：close 后 persist 上抛，语义正确（账本已关）。
- Ordarium state 写路径**不进入编排恢复路径**：PromotionRecoveryService / Crash A/B 不依赖任何 state kind（ALN-1 §1.2 红线，由既有恢复套件保持绿验证）。

## 3. 无兼容层

- `src/telemetry/persistence.ts`（扩展表快照）**退役删除**；`writeTelemetry` / `rebuildTelemetry` 不保留 re-export。
- 旧 `palimpsest_telemetry` 表在既有编排库里成为孤儿（不再读写、不迁移）——pre-GA 遥测无迁移价值，此处声明在案。
- 装载语义由"逐 attempt 均摊重放"改为"聚合注入"（新增 `ModelPerformanceTable.addAggregated()`）；内存面 `record()/stat()/snapshot()/expectedCostPerSuccess()/bestModel()` 合同不变，调用方零改动。

## 4. 验收

| # | 验收 | 方法 |
|---|---|---|
| TLM-A01 | 重启存活 | 两个 controller 相继打开同一 operations ledger：phase1 record+persist，phase2 `loadTelemetryInto` 后 attempts/successes/costPerSuccess 一致 |
| TLM-A02 | 增量语义 | record×2 → persist → record×1 → persist：裸 store 聚合＝3 attempts，主体数＝2（每次 flush 恰一条 delta） |
| TLM-A03 | 幂等 | 无新记录的重复 persist 不新建任何主体 |
| TLM-A04 | 投影零扰动 | persist 前后 orchestration DB `snapshotDigest` 不变（遥测永不进投影/parity） |
| TLM-A05 | 分类面 | `StateRevisionConflictError` 经 helper 归 busy 且非 transient；既有 busy 边界断言（`test/ordarium_ledger.test.ts`）保持 |
| TLM-A06 | 裸 ledger 往返 | `createStateStore({ledger})` 直连 `SqliteLedger` 的 flush/load 往返一致（不经 controller） |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-TLM-1）：append-delta 主体形状、聚合装载、错误分类映射、无兼容层退役、验收 TLM-A01–A06；ALN-4③ 形状反馈第 1 条（计数器负载的 append-only 形状）。 |
