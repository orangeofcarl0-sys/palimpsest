# Ordarium 对齐宪章（Cross-Repo Alignment Charter）

> **Spec ID**：`PLMP-ALN-1` ｜ 状态：**生效**（跨仓库协调权威）
> **权威序**：本文＝Ordarium 演进 × Palimpsest 消费的协调权威。系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；Ordarium 合同以其仓库 docs/12–17 为准；兼容层登记以其 `evidence/compatibility-register.md`（机器校验）为准。各权威域内冲突域内裁决；跨域冲突以本文登记的裁决为准并双向同步。
> **对侧镜像**：Ordarium `docs/18-release-compat-policy.md`（宿主中立发布纪律与消费者核对单）——本仓库的升级协议（§3）是其核对单的实例化。
> **修订记录**：`ALN-1`＝初版冻结（2026-08-29）：真相归属地图、演进接口清单（8 项四元组）、升级协议、半触达监护、唤醒制度、双边诉求登记、纪律红线；四项裁决 ALN-1..4 经用户确认（§8）。r2（同日）＝1.1.0 bump 落地登记：升级协议①勘误、sync-ordarium.mjs 退役、busy 断言补齐、演进清单 #1/#2 唤醒（§修订流水）。r3（同日）＝telemetry 外置试点落地（PLMP-TLM-1）：演进清单 #3/#7 唤醒、诉求③首条反馈产出。

---

## 0. 定位不变量（统筹的边界条件）

统筹机制本身服从两处定位，任何协调产物不得侵蚀：

- **Ordarium ＝ 通用内核**（Safe Action SDK + Effect Authority）：内核只认宿主中立形状——Action/Effect profile/identity/lease/reconcile/状态种类；"编排、项目、证据、晋升"等 Palimpsest 概念**永不进入内核合同**。落在 Ordarium 侧的协调物只能是通用政策；Palimpsest 至多以"首宿主案例"身份被引用，不存在特例通道。
- **Palimpsest ＝ 编排入口**（DSH 插件）：拥有"项目流程"语义（什么派发、什么算证据、什么晋升、什么作废）；**证据定义权（EvidenceAtom 体系）是本仓库所有物**。它是 Ordarium 的首个深度消费者而非唯一宿主，一切消费走公开合同面。
- **工作区布局澄清（用户裁决 2026-08-29）**：`DSH plugin\ordarium\` 是 Ordarium 项目自管的工作副本；本仓库对 Ordarium 仅以 GitHub release tarball 运行依赖，永不引用同级副本路径，也不把它当作本仓库的清理对象。

## 1. 真相归属地图（裁决 ALN-1）

### 1.1 两本既有账（不变）

| 账 | 存储 | 权威 | 内容 |
|---|---|---|---|
| 编排真相 | `palimpsest.sqlite`（哈希链事件库，33 类事件） | Palimpsest | 什么*应当*发生：项目版本、任务拓扑、治理声明（GATE_DEFINED/ROLE_TABLE_DEFINED/STAGE_GRAPH_DEFINED）、选拔决定、证据 |
| 副作用真相 | `operations.sqlite`（Ordarium 共账） | Ordarium | 什么*确实*发生、是否恰好一次、reconcile 收敛 |

### 1.2 第三块地：状态种类（裁决：最小消费，管理型先行）

Ordarium state-kind Stage 1 落地后，Palimpsest 的消费边界**逐一列举、未列即禁**：

| 状态 | 是否上账 | 理由 |
|---|---|---|
| 编排真相（项目/任务/尝试/证据事件） | **永不上账** | 哈希链是严谨性资产；上账即让渡主权（01 §1.1） |
| 治理声明（门禁/角色/阶段图） | **永不上账** | 属编排真相；镜像会产生第二权威 |
| 对话型（agent 间通信记录） | **不设**；G13 唤醒时单独裁决 | 当前无通信取证需求（§5 复检确认） |
| 管理型（跨宿主/跨项目/跨会话需存活的状态） | **消费，telemetry 先行试点** | `ModelPerformanceTable` 目前在本仓库 SQLite 自持；外置后跨会话可审计、宿主可见。试点 = 唯一预定消费点 |

由此推导：错误码 27–29（STATE_REVISION_CONFLICT / STATE_REF_NOT_FOUND）、state 修订、refs 反查**仅在管理型试点落地后进入本仓库**，且仅覆盖 telemetry 读写路径；编排恢复路径（PromotionRecoveryService、Crash A/B）**不依赖任何状态种类**——refs 反查不得成为恢复关键路径。

### 1.3 禁区（双向）

- Palimpsest 不直读 `operations.sqlite` schema，只走 Ordarium 公开 API；不自建 lease/recovery。
- Ordarium 不理解事件类型语义，不接收编排概念；内核不收消费者特例。

## 2. 演进接口清单（四元组账目）

每项：{触达现状（带证据）｜唤醒条件｜预定消费点｜消费姿态}。**本表是 bump pin 与里程碑出口复检的对象（§5）**。

| # | Ordarium 演进项 | 触达现状 | 唤醒条件 | 预定消费点 | 消费姿态 |
|---|---|---|---|---|---|
| 1 | `openRetry` 默认开启（1.1.0） | **已钉住（2026-08-29 bump）**：`createPalimpsestEffects` 显式传 `{attempts:5, delayMs:100}`（`src/effects/runtime.ts`），不再依赖上游默认 | 已唤醒（1.1.0 bump 完成） | `createPalimpsestEffects` 的 ledger 构造 | **显式钉住** + 行为断言测试 + 核对单（裁决 ALN-3，§4）——三件套已落地 |
| 2 | 账本 schema v2→v3 迁移（1.1.0） | 零代码触达（本仓库不对 operations.sqlite 做任何 PRAGMA/schema 操作）；迁移验证在册：原生 v2 fixture（`fixtures/ordarium/ledger-v2.sqlite`）+ 打开迁移断言（`test/ordarium_ledger.test.ts`） | 已唤醒（1.1.0 bump 完成）——既有 `$DSH_HOME` 账本在下次打开时自动迁移 | 无代码消费点；运行环境行为 | 迁移后全量 crash/reconcile 套件重跑（32/170 全绿）；发布说明核对（release notes §2） |
| 3 | `STATE_REVISION_CONFLICT` / `STATE_REF_NOT_FOUND`（错误码 27–29）、state 修订、refs 反查 | **已进消费面（PLMP-TLM-1，2026-08-29）**：telemetry 外置写路径消费 state CAS 与 `StateRevisionConflictError`（instanceof 映射 `isStateRevisionConflict`，归 busy 族）；`STATE_REF_NOT_FOUND`/refs 反查仍未触达（试点不用 refs） | 已唤醒（管理型试点落地） | telemetry 外置读写路径的乐观并发与失败分类（`src/telemetry/state_persistence.ts`） | 最小消费；错误按 instanceof 映射进既有 transient/busy 体系，不按数字码硬编码；refs 反查不进恢复路径（红线保持） |
| 4 | versioned Host Adapter（Ordarium `COMPAT-PAL-001` 缝，G18 交付） | **已消费（PLMP-CONF-1，2026-09-06）**：装配期 `assertHostContract(1)` 字面量握手 + `hostPort` 全直通映射 + `runHostAdapterConformance` 四场景全过 | 已唤醒（G18 交付 + 1.2.0 bump） | `PalimpsestEffectsRuntime.hostPort`（外部合同面；编排内 `invoke()` 不变） | 首宿主 conformance 案例（诉求②已兑现）；场景权威留 `@ordarium/testing`，palimpsest 只执行装配；`dsh_types.ts` 镜像与本案互不阻塞 |
| 5 | G14 模型工具独立 scope | 零触达（effects 全部 `scope: projectId`） | 出现按模型/工具拆分记账的**实证需求**（当前无；telemetry 在本仓库自持） | effects invoke 的 scope/callId 拼装 | 需求实证后才启用，不预埋 |
| 6 | G13 通信取证 | 零触达（证据体系只认确定性命令证据） | agent 间通信需升格为可考事实 | 若唤醒：通信记录 = Ordarium 通用状态条目（宿主中立形状），语义归本仓库 | 单独裁决；与 EvidenceAtom 定义权的边界显式修订，不得静默混入 |
| 7 | state-kind Stage 1（形状） | **已消费（PLMP-TLM-1）**：append-delta 主体（`expectedRevision:0` 创建后不改写）+ `list` 聚合装载 + `createStateStore({runtime})` | 已唤醒（1.1.0 交付 + 试点落地） | telemetry 外置试点（§1.2） | 首消费者形状评审——第 1 条反馈已产出（TLM-1 §1：计数器类负载的正确形状是 append-only 主体而非覆盖式 CAS 槽位，建议对侧 G11 文档补记） |
| 8 | 多项目共享账本（本仓库 v2 非目标，`06-audit-remediation-design-spec.md:24`） | 零触达 | Palimpsest v2 提案 | Ordarium namespace/lease/fence | v2 时另行裁决，本文不预设 |
| 9 | host-kit 消费线（G18 新叶包 `@ordarium/host-kit`） | **已消费（PLMP-CONF-1，2026-09-06）**：依赖清单新增第四行（1.2.0），握手/映射/runner 全接 | 已唤醒（G18 交付 + 1.2.0 bump） | 装配握手 + 外部合同面（`hostPort`） | 最小消费：harness 深化留后续；升级协议 pins 自 1.2.0 起为四行（core/ledger-sqlite/host-kit/testing） |

## 3. 升级协议（pin bump 的固定流程）

### 3.1 流程链

```
Ordarium release（release notes 含消费者可见行为变化清单，诉求①）
  → ① 重钉：package.json pin 行（1.2.0 起四行，含 host-kit）+ `pnpm-workspace.yaml` overrides（同四行）+ 重算 lockfile。**勘误（r2）**：pnpm 11 的 overrides 权威位置是 workspace yaml 且**承重**——ledger-sqlite/testing tarball 内声明的 `@ordarium/core` 版本号在 npm 不存在，必须重定向到同 release 的 core tarball，不可删；`package.json` 的 `pnpm.overrides` 块才是死配置（已清除）；该策略撞 pnpm 11 默认 `blockExoticSubdeps`，仓库已显式豁免（integrity 仍由 lockfile sha512 与供应链校验把关）
  → ② 消费核对单（§3.2 逐项）
  → ③ 五问复检（§5）
  → ④ 全量 pnpm check（31 文件/165 测试 + parity fixture 硬门）
  → ⑤ 修订登记：本文 §修订流水 + 03 SDS 修订记录各一行
```

工具项处置（2026-08-29 完成）：`tools/sync-ordarium.mjs` **退役删除**（文件与 `package.json` 的 `sync:ordarium` script 一并移除）——消费渠道早已切 GitHub Release URL，无剩余职责。

### 3.2 消费核对单

| # | 核对项 | 方法 |
|---|---|---|
| 1 | 默认值变化（承重 seam 逐一核对：openRetry、lease、deployment 协同等） | 对照 release notes 行为变化清单；本仓库消费的构造参数面（`runtime.ts:95-99`）逐项比对 |
| 2 | 存储迁移行为 | 用既有 v2 账本 fixture 打开验证迁移；迁移后全量 crash 套件重跑 |
| 3 | 错误分类边界 | 四类 transient/busy 错误的浮出行为断言（`errors.ts:20-31`）仍成立 |
| 4 | 新错误码 | 是否进入本仓库消费面；进入则映射进分类体系而非数字码硬编码 |
| 5 | 弃用面 | 对照本仓库实际消费清单：`OrdariumRuntime`、`SqliteLedger`、`defineEffects`、五 action、`FaultInjector`/`ManualClock`/`SimulatedProcessCrash`、四错误类 |
| 6 | 死配置卫生 | `pnpm.overrides` 等不再读取的块随手清除 |
| 7 | 半触达清单更新（§4） | 新发现的"零代码但默认值生效"面入册 |

## 4. 半触达监护（裁决 ALN-3）

**定义**：零代码触达、但经默认值/环境声明生效的面——"没改一行代码也会漂移"，与零触达项分开盯。

**在册**：演进清单 #1（openRetry）、#2（schema v2→v3）。发现新项即入册。

**三件套**：
1. **显式钉住**：bump 时承重 seam 显式传参固定，不吃上游默认；
2. **测试断言**：行为边界断言守面——已补（`test/ordarium_ledger.test.ts`：fail-fast、有界退避越界、`LedgerBusyError` 分类面归位、非 busy 族不重试）；
3. **核对单**：§3.2 第 1 项显式盯默认值。

## 5. 唤醒条件与复检制度

**五问复检**（源自 2026-08-29 事实核对，固化为制度）：每次 **pin bump** 与每次 **Palimpsest 里程碑出口**（SDS bump）必跑——①依赖现状（包/版本/渠道/锁文件解析）；②1.1.0+ 变更点触达 grep（openRetry/错误码/迁移/refs）；③对侧诉求与姊妹里程碑状态；④本仓库运行时状态；⑤G13/G14 唤醒迹象（通信取证、模型工具独立 scope）。输出追加至本文修订流水。

**G13/G14 定位原则**：二者是 Ordarium 的宿主中立 Goal——通信记录与 scope 拆分必须以通用机制落地（记录 = 状态条目；scope = 账本机制），**语义判定权归消费者**（什么算通信事实、按什么维度拆 scope 由 Palimpsest 的编排语义决定）。本仓库不催促提前；唤醒以 §2 唤醒条件为准，复检发现迹象时先登记再裁决。

## 6. 诉求登记（裁决 ALN-4）

### Palimpsest → Ordarium（三项文档级）

| # | 诉求 | 状态 |
|---|---|---|
| ① | release notes 必须列**消费者可见行为变化**五类：默认值 / 存储迁移 / 错误分类 / 新错误码 / 弃用面 | 已落对侧 `docs/18` §1 |
| ② | versioned Host Adapter 交付时，Palimpsest 作为**首宿主 conformance 案例**（呼应 `COMPAT-PAL-001` 缝） | **已兑现（2026-09-06，PLMP-CONF-1）**：G18 交付 + 1.2.0 bump + 握手/映射/四场景接入，`COMPAT-PAL-001` 关闭为已执行 |
| ③ | state-kind 形状评审征询首个消费者（ALN-1 最小消费裁决使本仓库成为管理型首消费者） | **双边闭环（2026-09-06）**：首条反馈（PLMP-TLM-1 §1：计数器类负载的正确形状是 append-only 主体）经对侧 G11 design-spec §10 冻结后补记采纳——验证而非推翻冻结决议；CTX-2 append-delta manifest 为第二实例 |

### Ordarium → Palimpsest

| # | 诉求 | 状态 |
|---|---|---|
| ① | Host Adapter 交付时配合 conformance 验收（合同冻结面 + 165 项测试作基座） | **已兑现（2026-09-06，PLMP-CONF-1）**：36 文件/205 测试作基座，四场景全过 |

## 7. 纪律红线

- **内核通用性**：协调产物不得使 Ordarium 理解编排语义；案例引用不进内核合同；消费者特例通道禁止；任何兼容层必须进 `evidence/compatibility-register.md`（有 owner 与移除条件，无主的临时层视同永久架构重审）。
- **Palimpsest 定位**：项目流程语义与证据定义权不外让；不直读账本 schema；不自建 lease/recovery；不绕 Ordarium API 落副作用。
- **无兼容层禁令（两仓库共守）**：升级不留旧默认值 shim——要么显式钉住，要么接受新默认并过全量测试；"前后不一致导致的兼容层"在两边都是缺陷。

## 8. 裁决记录

| 编号 | 日期 | 裁决 |
|---|---|---|
| ALN-1 | 2026-08-29 | 状态种类边界＝**最小消费：管理型先行**——编排真相与治理声明永不上账，telemetry 为唯一试点，对话型不设（G13 唤醒再裁） |
| ALN-2 | 2026-08-29 | 文档权威＝**Palimpsest 权威 + Ordarium 通用政策**——本文为协调权威；Ordarium 侧落宿主中立 `docs/18-release-compat-policy.md`，双边指针 |
| ALN-3 | 2026-08-29 | 半触达姿态＝**显式钉住 + 测试断言 + 核对单**三件套 |
| ALN-4 | 2026-08-29 | Ordarium 诉求＝**三项文档级**（release notes 行为变化清单 / Host Adapter 首宿主 conformance / state-kind 形状评审征询） |

## 修订流水

| 日期 | 修订 |
|---|---|
| 2026-08-29 | 初版冻结（PLMP-ALN-1）：四项裁决用户确认；演进接口清单 8 项；升级协议与复检制度生效；双边诉求登记。依赖基线：Ordarium v1.0.0（`package.json:28-32`），对侧已推进 1.1.0（Safe Action SDK + Effect Authority），本仓库尚未 bump。 |
| 2026-08-29（r2） | **Ordarium 1.1.0 bump 落地**（§3.1 全链）：对侧发布 `ordarium-v1.1.0`（六门 verify:release 绿 + 五类行为变化清单，诉求①兑现）。①重钉：三行 pin + workspace overrides + `blockExoticSubdeps: false` 豁免，lockfile/node_modules 实装 1.1.0；②消费核对单七项完成——默认值：openRetry 显式钉住 `{attempts:5, delayMs:100}`；存储迁移：原生 v2 fixture 打开迁移断言通过；错误分类：`LedgerBusyError` 归位断言通过；新错误码 27–29 未进消费面（telemetry 试点前）；弃用面：无；死配置：`package.json` overrides 清除；半触达清单 #1/#2 更新为已唤醒；③五问复检：依赖四层一致（pin==overrides==lock==实装）；触达 grep——openRetry 已消费，错误码/state 修订/refs 反查仍 0 命中；对侧诉求①已兑现、②③待对侧交付；运行时 32/170 全绿（parity fixture v2 硬门保持）；G13/G14 无唤醒迹象。工具项：`sync-ordarium.mjs` 退役。 |
| 2026-08-29（r3） | **telemetry 外置试点落地（PLMP-TLM-1，用户立项）**：`ModelPerformanceTable` 持久层从 orchestration SQLite 扩展表外置到管理型 state kind——append-delta 主体（`delta-<uuid>`，`expectedRevision:0` 创建后不改写）+ `list` 聚合装载；`createStateStore({runtime})` 随 `PalimpsestEffectsRuntime.state` 暴露为唯一消费门面；错误分类：`isStateRevisionConflict` 入 busy 族；无兼容层：`persistence.ts` 退役、旧扩展表成孤儿（声明在案）；演进清单 #3/#7 唤醒，诉求③首条反馈产出（计数器负载的 append-only 形状）；运行时 32/173 全绿（TLM-A01–A06，parity fixture v2 硬门保持）。五问复检：依赖 1.1.0 四层一致；effects scope 面未动（G14 不启用）；G13/G14 无唤醒迹象。 |
| 2026-08-29（r4） | **Palimpsest 里程碑出口（PLMP-ALC-1 遥测驱动分配，五问复检）**：①依赖现状：1.1.0 四层一致（pin==overrides==lock==实装），本里程碑零依赖变更；②1.1.0+ 变更点触达 grep：openRetry 已钉住、state kind 经 TLM/ALC 消费（list 聚合 + CAS write）、错误按 instanceof 映射（`isStateRevisionConflict`/`isLedgerBusyError`）、refs 反查仍 0 触达且不进恢复路径；③对侧诉求：①已兑现（1.1.0 五类 notes）、②待 Host Adapter 交付、③进行中（TLM §1 形状反馈已产出，ALC 未新增对侧面）；④本仓库运行时：33/185 全绿（ALC-A01–A11，parity fixture v2 硬门保持），演进清单 #3/#7 状态不变；⑤G13/G14 唤醒迹象：无。工程侧：三阶段提交 f39c9dc / b46ba41 / f180e2b，09 规格 r1 死点修正先于实现落地（无前后不一致）。 |
| 2026-08-29（r5） | **Palimpsest 里程碑出口（PLMP-ALC-2 模型推荐咨询面，五问复检）**：①依赖现状：1.1.0 四层一致，零依赖变更；②触达 grep：state kind 消费面不变（TLM list/CAS），refs 反查仍 0 触达；③对侧诉求：①②状态不变、③进行中（无新增对侧面——咨询臂纯宿主侧组合）；④本仓库运行时：34/193 全绿（ADV-A01–A06，parity fixture v2 硬门保持）；⑤G13/G14 唤醒迹象：无。工程侧：两阶段提交 f77ecb3 / 9e434c3，规格先于实现冻结（10 号，PLMP-ALC-2）。 |
| 2026-08-29（r6） | **Palimpsest 里程碑出口（PLMP-TLM-2 status 遥测视图，五问复检）**：①依赖现状：1.1.0 四层一致，零依赖变更；②触达 grep：对侧面零新增（纯宿主侧渲染）；③对侧诉求状态不变；④本仓库运行时：34/196 全绿（STV-A01–A03，parity fixture v2 硬门保持）；⑤G13/G14 无唤醒迹象。**文书澄清（D 类）**：对侧 `docs/research/agent-landscape-2026-08/05-palimpsest-charter.md` "全 src/ 无 OPERATION_UNCERTAIN/reconcile 处理（待焊接缝）"已过时——H1-P1 的 `reconcileAll()`/PromotionRecoveryService + `isTransientOperationError`（UncertainOperationError 映射）即该缝，TLM/ALC 补齐 state kind 迁移面；refresh 归 Ordarium 侧。工程侧：`8405b6c`，规格先于实现冻结（11 号，PLMP-TLM-2）。 |
| 2026-08-29（r7） | **Palimpsest 里程碑出口（PLMP-CTX-1 Context Brief，五问复检）**：①依赖现状：1.1.0 四层一致，零依赖变更；②触达 grep：对侧面零新增（纯宿主侧派生编译）；③对侧诉求状态不变；④本仓库运行时：35/202 全绿（CTX-A01–A06，parity fixture v2 硬门保持）；⑤G13/G14 无唤醒迹象。工程侧：两阶段提交 8fbcd0d / 9f83af9，规格先于实现冻结（12 号，PLMP-CTX-1）；知识闭环四模块（预算.txt §1）至此在两仓内全部有落点——Gate DSL（R1）/Invalidation（R2）/Allocator（R5+R13+ALC）/Context C2（R16），检索半边另立项。 |
| 2026-09-06（r8） | **Palimpsest 里程碑出口（PLMP-CONF-1 Host Adapter conformance，五问复检）**：①依赖现状：1.2.0 四行 pin（新增 host-kit）四层一致；对侧 ordarium-v1.2.0 release（eee2741 + tag + 六包 tarball，六门 verify:release 绿）；②触达 grep：HOST_CONTRACT_VERSION/assertHostContract/hostPort/runHostAdapterConformance 已消费，refs 反查仍 0 触达；③对侧诉求：①②**双双兑现**（COMPAT-PAL-001 关闭 + RCP-2 + 确认报告落盘对侧仓），③进行中；④本仓库运行时：36/205 全绿（CONF-A01–A04，parity fixture v2 硬门保持）；⑤G13/G14 无唤醒迹象。**两项裁决**：ALN-4② 消费通道（用户"直接 pull 也行"→实测判死：host-kit 声明 workspace:* 互依赖、git checkout 无 dist/prepare，git 通道不可装→最小 release 1.2.0）；升级协议 pins 自 1.2.0 起为四行。工程侧：e90eb6e（bump）/ 5baf38c（conformance），规格先于实现冻结（13 号，PLMP-CONF-1）。 |
| 2026-09-06（r9） | **Palimpsest 里程碑出口（PLMP-CTX-2 Context 检索半边，五问复检）**：①依赖现状：1.2.0 四行 pin 四层一致，零依赖变更；②触达 grep：state kind 消费面不变，refs 反查仍 0 触达；③对侧诉求：①②已兑现、③进行中（无新增对侧面）；④本仓库运行时：36/213 全绿（CTX2-A01–A10，**parity fixture 再生 v3**——snapshotDigest 因 context_manifests 投影表变更，migration 链 M5，事件类型 33→34）；⑤G13/G14 无唤醒迹象。**两项用户裁决**（CTX2-D1/D2）：V0 含词法检索（GitPort.scanLexical，只读非 Action）、manifest 进 canonical 审计链（新事件 + AttemptReport 加法式字段，SDS-4 例外三件套齐全）。工程侧：三阶段 a6a4a6f /（P3-P5 b20cd19），规格先于实现冻结（14 号，PLMP-CTX-2）。 |
| 2026-09-06（r10） | **对齐例行复核回执（对侧 d297314，五问对侧版）**：①②文书刷新已执行——charter 三处 dated 标注（"待焊接缝"过时化，worker 隔离强度审计仍在册）+ G11 §10 冻结后补记（**诉求③双边闭环**：append-only 反馈被验证而非推翻；CTX-2 manifest 为第二实例）；G8 item 6 澄清——@ordarium/dsh 为叶适配包，重审双条件（官方 DSH 类型可消费 + DSH 生态愿持自身适配器）均不挂 Palimpsest，无对应义务；G13/G14 仍休眠、`HOST_CONTRACT_VERSION` 无向 2 计划（字面量握手无需预改，exact-match fail-closed 兜底）；命题二判据①关闭与我方 r8 逐点一致、判据②等生产首例（纯外部牵引）；发布面复核通过（tag/六包/notes/RCP 一致）。**账目勘误两项**：①形状反馈引用锚＝PLMP-TLM-1 §1（我方往来 prompt 误引 CTX-1 §1，经查我仓文书无误引，对侧补记已按正确锚落）；②门槛口径统一为"六门 + `--with-matrix` 矩阵第七门"。对侧内部整洁项（归对侧）：COMPAT-LEDGER-001 登记行补标"已执行"。d297314 未推送（对侧惯例留用户执行）。 |
| 2026-09-06（r11/r12 合并登记） | **实证累积 + TLM r2 语义修正**：Docker 干净环境批量实证 N=12（三态结果 × 双模型 × 小额记账），暴露并修复 **PLMP-TLM-1 flush 语义缺陷**（跨进程基线对撞——新进程以 durable 聚合为基线导致同形记录静默丢失；修正为 fresh 基线/`loadTelemetryInto` 续接双语义，回归测试在案）；修正后累积 28 attempts（clean-a 7/7 成功、clean-b 21/0 成功），**ALC 资格门槛跨越**（task_type ≥12、per-model ≥8 部分），`telemetry --candidates` 数据化建议工作（诚实标注 prior-based 边界）；生产账本操作 48+ 笔（判据②样本持续积累，成本记账合计 0.111）。对侧行动项不变：charter/G11 文书已由对侧刷新（d297314，待推送），判据②首例可据 07 r11/r12 登记。 |
| 2026-09-06（r11） | **生产账本首用证据（命题二判据②首例，Docker 最小干净环境）**：stock node:24-bookworm 容器 + 消费者安装链（palimpsest npm tarball + pnpm overrides → ordarium-v1.2.0 release tarball）+ 干净 $DSH_HOME + 真实 git 仓——全流程 dispatch→claim→manifest(canonical)→work commit→gate evidence→report→真实合并晋升（PROMOTION_COMMITTED，全真实哈希）；共享账本第二项目（pump 归因）遥测样本落地。证据数字：productionLedgerOperations=5、telemetrySubjects=1、contextManifests=1、hashChainEvents=13。附带修正 CLI --repo 通道三缺口（new 真实 HEAD 注入、report --commit、promote 真实 expectedHead）+ pump 归因 + context 命令。对侧可据此登记判据②首例（注入式口径 → 生产首例成文）。工程侧：5baf38c 系列后 e2e 基建入仓（docker/minimal）。 |
| 2026-09-06（r13） | **Palimpsest 里程碑出口（PLMP-CTX-3 semantic 通道 + PLMP-CTX-4 Boot/Pull 分发，五问复检）**：①依赖现状：1.2.0 四行 pin 四层一致，零依赖变更；②触达 grep：对侧面零新增——`EmbeddingPort` 为宿主注入的 palimpsest 内部端口（真实 embedding 由宿主供给，非 Ordarium 合同面），`collectWorktreeTexts`/分发视图均为本地 effects 与纯派生，state kind 消费面与 refs 反查不变；③对侧诉求：①②已兑现、③进行中（无新增对侧面）；④本仓库运行时：39/224 全绿（CTX3-A01–A05 + CTX4-A01–A05，parity fixture v3 硬门保持——semantic 为缺席键、分发为纯派生，均零契约触碰）；⑤G13/G14 无唤醒迹象。数据门槛：semantic 立项资格已由 r11/r12 实证累积（28 attempts）跨越后冻结。工程侧：553dd57（规格冻结 15/16）/ 649d3ec（实现），SDS-17/SDS-18 两 bump，规格先于实现冻结。 |
| 2026-09-06（r14） | **对侧例行复核回执收妥 + 独立复证（对侧 3545a0b，五问对侧版）**：①依赖现状一致核实（四行 pin 1.2.0 四层，我侧"无变更"声明为真）；②触达 grep 四项全过（EVENT_TYPES 34 零新增、state kind 消费面原样、listReferencing 0 触达、`assertHostContract(1)` 在位）——CTX-3/CTX-4 零触达**双边独立成立**；③**诉求③关闭**（state-kind 形状评审征询反馈闭环：TLM-1 首条形状反馈入对侧 docs/dev/11"负载形状"节 + G11 §10，随 d297314/316b123 推送）；④对侧七门 1.2.0 发布时全 PASS，本轮 verify:architecture + verify:docs 绿（30 份文档）；⑤G13/G14 阴性。**四项执行**：判据②生产启用已作**里程碑**登记（对侧 docs/17 §16.9 ②行 + 研究层），但"真实恢复案例"口径**未翻转**——对侧独立 grep 判定我侧生产证据无 uncertain→reconcile 事件；我方以 ACC 全量只读复证**独立确认**（`ordarium_operations` 144 笔全 succeeded、operation_events 五态各 144 无 reconcile 分支、36 项目 palimpsest 事件无 UNCERTAIN/RECONCILE 类型）——接受该口径坚守（恢复案例 ≠ 生产启用），**判据②维持开放**，待首个生产 uncertain 事件成文即闭合（纯外部牵引）；d297314 已推送；TLM r2 dated 标注落两处（charter 05 §4 二次刷新 + docs/dev/11 fresh/load 不可混用警告）；COMPAT-LEDGER-001 补标完成。共识校对四项一致（learned policy 门控 / DSH manifest 外部 / v2 立项待议 / 双侧剩余清单）。双边诉求至此**①②③全部关闭**；对侧落盘 3545a0b（架构门 + docs 门绿）。 |
| 2026-09-06（r15） | **生产恢复案例证据（判据②"真实恢复案例"子项，Docker 干净环境真实 SIGKILL）**：`docker/minimal/recovery.sh` + `killer.mjs` 入仓——killer 轮询操作账本、在 promote 操作到达 `dispatched`（git merge 在飞）瞬间投递**真实 SIGKILL**（无故障注入器、无测试替身、生产形状账本）；孤儿态证据：operation=`dispatched`、`PROMOTION_PREPARED=1`/`PROMOTION_COMMITTED=0`；引擎操作租约（默认 30s）过期后一个恢复回合经 reconcilable 引擎 reclaim→reconcile→**重新派发**→succeeded——operationEventChain 全链 `proposed→authorized→claimed→dispatched→(crash)→claimed→dispatched→succeeded`，`PROMOTION_COMMITTED` reason＝"recovered: Ordarium reconciled the interrupted operation"，main 上 promote 合并提交恰 1 个（无双重提交），任务落 `TASK_SATISFIED`。技术注记：租约未过期时恢复尝试诚实报告 in-flight（首次 13s 重试即此，非失败）；SIGKILL 下无进程能写下字面 `uncertain` 状态行——结果未知性由 `dispatched` 孤儿 + 孤儿 git 进程体现，恢复评估由引擎自己完成。是否足以为"真实恢复案例"收口归对侧按宣称纪律判定；工程侧：f6dc3f3。 |
