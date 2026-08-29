# Ordarium 对齐宪章（Cross-Repo Alignment Charter）

> **Spec ID**：`PLMP-ALN-1` ｜ 状态：**生效**（跨仓库协调权威）
> **权威序**：本文＝Ordarium 演进 × Palimpsest 消费的协调权威。系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；Ordarium 合同以其仓库 docs/12–17 为准；兼容层登记以其 `evidence/compatibility-register.md`（机器校验）为准。各权威域内冲突域内裁决；跨域冲突以本文登记的裁决为准并双向同步。
> **对侧镜像**：Ordarium `docs/18-release-compat-policy.md`（宿主中立发布纪律与消费者核对单）——本仓库的升级协议（§3）是其核对单的实例化。
> **修订记录**：`ALN-1`＝初版冻结（2026-08-29）：真相归属地图、演进接口清单（8 项四元组）、升级协议、半触达监护、唤醒制度、双边诉求登记、纪律红线；四项裁决 ALN-1..4 经用户确认（§8）。r2（同日）＝1.1.0 bump 落地登记：升级协议①勘误、sync-ordarium.mjs 退役、busy 断言补齐、演进清单 #1/#2 唤醒（§修订流水）。

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
| 3 | `STATE_REVISION_CONFLICT` / `STATE_REF_NOT_FOUND`（错误码 27–29）、state 修订、refs 反查 | 零触达（全仓 grep 0 命中；错误分类仅四类 1.0.0 类型：`UncertainOperationError`/`OperationBusyError`/`SimulatedProcessCrash`/`LedgerBusyError`，`src/effects/errors.ts:11-31`） | 裁决 ALN-1 的管理型试点落地 | telemetry 外置读写路径的乐观并发与失败分类 | 最小消费；错误按 Ordarium 分类映射进既有 transient/busy 体系，**不按数字码硬编码**；refs 反查不进恢复路径 |
| 4 | versioned Host Adapter（Ordarium `COMPAT-PAL-001` 缝） | 零准备（本仓库无 adapter 注册/版本协商代码） | Ordarium 交付 adapter 版本协商 | `installPalimpsest` / `src/tools/dsh_types.ts` 适配层 | 首宿主 conformance 案例（诉求②）；合同冻结面（31 文件/165 测试）作验收基座 |
| 5 | G14 模型工具独立 scope | 零触达（effects 全部 `scope: projectId`） | 出现按模型/工具拆分记账的**实证需求**（当前无；telemetry 在本仓库自持） | effects invoke 的 scope/callId 拼装 | 需求实证后才启用，不预埋 |
| 6 | G13 通信取证 | 零触达（证据体系只认确定性命令证据） | agent 间通信需升格为可考事实 | 若唤醒：通信记录 = Ordarium 通用状态条目（宿主中立形状），语义归本仓库 | 单独裁决；与 EvidenceAtom 定义权的边界显式修订，不得静默混入 |
| 7 | state-kind Stage 1（形状） | 零消费 | Ordarium 发布 Stage 1 | telemetry 外置试点（§1.2） | 首消费者形状评审（诉求③） |
| 8 | 多项目共享账本（本仓库 v2 非目标，`06-audit-remediation-design-spec.md:24`） | 零触达 | Palimpsest v2 提案 | Ordarium namespace/lease/fence | v2 时另行裁决，本文不预设 |

## 3. 升级协议（pin bump 的固定流程）

### 3.1 流程链

```
Ordarium release（release notes 含消费者可见行为变化清单，诉求①）
  → ① 重钉：package.json 三行 pin + `pnpm-workspace.yaml` overrides 三行 + 重算 lockfile。**勘误（r2）**：pnpm 11 的 overrides 权威位置是 workspace yaml 且**承重**——ledger-sqlite/testing tarball 内声明的 `@ordarium/core` 版本号在 npm 不存在，必须重定向到同 release 的 core tarball，不可删；`package.json` 的 `pnpm.overrides` 块才是死配置（已清除）；该策略撞 pnpm 11 默认 `blockExoticSubdeps`，仓库已显式豁免（integrity 仍由 lockfile sha512 与供应链校验把关）
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
| ② | versioned Host Adapter 交付时，Palimpsest 作为**首宿主 conformance 案例**（呼应 `COMPAT-PAL-001` 缝） | 待 Ordarium 交付 |
| ③ | state-kind 形状评审征询首个消费者（ALN-1 最小消费裁决使本仓库成为管理型首消费者） | 待 Stage 1 评审 |

### Ordarium → Palimpsest

| # | 诉求 | 状态 |
|---|---|---|
| ① | Host Adapter 交付时配合 conformance 验收（合同冻结面 + 165 项测试作基座） | 待对侧交付，本仓库承诺配合 |

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
