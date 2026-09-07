# Ready-Set 调度规格（声明式并发 + 有界激活）

> **Spec ID**：`PLMP-SCHED-1` ｜ 状态：**已交付**（2026-09-07；演进线 G6 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §5；验收 SCHED-A01–A06 全绿〔50 文件 / 298 测试〕+ live 冒烟：concurrency=2 项目两任务同时 ACTIVE、卫星 attempt 各一、依赖任务 BLOCKED）
> **权威序**：阶段图契约以 H1（06 号 §3.4 D-3/G4）为基、由本规格**加法式扩展**；角色槽以 H1 D-2（既有 ROLE_TABLE_DEFINED）为准；系统设计与 SDS-4 例外纪律以 03 号为准。
> **总纲**：单 ACTIVE 锁存是基线管线形状，不是并发治理。并发治理全部是**账本上的声明数据**：任务级上限＝ACTIVE 阶段的 `concurrency`（本规格新增的加法式可选声明），角色级上限＝既有已声明角色表（`slotOf(role)` + hard cap，零新增面）。每次 `decide()` 仍至多提交一个事件；ready-set 不是一次事务十个事件，而是"按声明容量逐拍激活"。

## 1. Scope

### 1.1 声明面：ACTIVE 阶段 `concurrency`（唯一新字段）

`StageGraphStage` 增加法式可选 `concurrency?: number`（正整数）：仅 latch 阶段（ACTIVE/VERIFYING）可声明，其余阶段携带即 TypeError（fail-closed）；缺省＝1＝**逐字节现状**。ACTIVE 的 concurrency 同时是激活容量（READY → ACTIVE 的入场上限）；VERIFYING 的 concurrency 只治理自身扫描穿透。SDS-4 例外适用：缺省省略、canonical 键序 ⇒ genesis 声明与既有 fixture/event digest 逐字节不变——**无 schema bump、无迁移、无 fixture 再生**（与规划初稿"M6+fixture v4"的差异及理由在此登记：字段是加法式可选声明，且角色槽治理面已存在，无需更重的合同变更）。

### 1.2 扫描语义（锁存 → 有界穿透）

按声明序扫描阶段（不变）。latch 阶段（ACTIVE/VERIFYING）：按任务声明序逐个 advance，首个非空决策即返回（不变）；全部为空（在途/守卫停摆）时——`count(该阶段) < concurrency(该阶段)` 则**穿透**到后续阶段，否则维持现状（返回 null 终止本轮）。缺省 1 ⇒ 穿透条件永假 ⇒ 与现行为逐字节一致（回归门）。

### 1.3 激活入场（READY → ACTIVE 的容量判据）

READY 激活前判两道已声明容量（确定性，声明序）：

1. **任务级**：`occupancy(ACTIVE ∪ VERIFYING) < concurrency(ACTIVE 阶段)`——满则本轮不再激活（全局容量，直接终止 READY 扫描）；
2. **角色级**：`countOpenInRole(role) < slotOf(role)`（已声明角色表，含 hard cap 同源）——满则**跳过该任务继续扫描**（其他角色可能仍有容量；角色取自 ProjectIR TaskSpec.role，缺席＝implementer）。

事件形态零变化（TASK_STARTED 等原样）；一次 decide 一个事件（不变）；`decide()` 纯函数（预览＝提交，E1 纪律不变）。

### 1.4 声明入口

`start(input.stageGraph?)`：可选已验证阶段图（缺省 genesis 逐字声明，不变）；`declareStageGraph` 本就是治理通道（拓扑/并发变更＝图再声明）。serve `/api/proposal/declare` 启动分支可选透传 `stageGraph`。

## 2. Non-goals

优先级/抢占/公平队列、跨项目资源池、VERIFYING 独立于 ACTIVE 的容量策略、worker 侧变更（claim 时 `assertAdmissible` 原样）、scope 级并发策略（scope v1 是归属，不是调度维度）。

## 3. 合同触点 / 迁移 / digest

STAGE_GRAPH_DEFINED 载荷 stages[] 条目加法式可选 `concurrency`（1.1 论证 ⇒ 既有事件/fixture 零扰动，[ACC-02] 式证明＝全量测试原样绿）；投影 `graph_json` 全载荷存储 ⇒ 零改动；调度事件形态零变化；`StartProjectInput`/serve 载荷加法式可选 `stageGraph`。**无迁移、无 fixture 再生、无版本 bump**。

## 4. 验收

| 项 | 断言 |
|---|---|
| SCHED-A01 | 解析 fail-closed：concurrency 须正整数、仅 latch 阶段可带；缺省图（无 concurrency）解析与 genesis 逐字节等价 |
| SCHED-A02 | 回归门：缺省声明下，多任务项目的 decide() 事件序列与现状一致（单 ACTIVE 锁存原样；全量既有测试原样绿即证） |
| SCHED-A03 | concurrency=2：首个任务在途时第二个 READY 任务被激活（两拍两事件）；每次 decide 至多一个事件；decide 纯函数两次全等 |
| SCHED-A04 | 有界：concurrency=2、三个 READY 任务 ⇒ 同时至多 2 个 ACTIVE；一个批次落回 READY 后第三个才激活 |
| SCHED-A05 | 角色槽：slot=1 的角色在占位时跳过同角色任务、激活其他角色任务（声明表同源判定） |
| SCHED-A06 | serve：declare 启动可带 stageGraph；坏图 400；事件链正常 |
| 浏览器 | 无新 UI 面（调度语义）——以 live 冒烟验证机械推进在并发声明下推进多任务（serve + control run） |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-SCHED-1，G6）：ACTIVE 阶段 concurrency 加法式声明（缺省＝逐字节现状）、锁存有界穿透、双道激活容量（任务级声明 concurrency + 角色级既有声明表）、start/serve 可选 stageGraph 声明入口；与规划初稿的差异（无 M6/fixture v4——SDS-4 加法式例外 + 角色槽面已存在）在此登记。 |
| 2026-09-07 | **交付**：`StageGraphStage.concurrency`（latch 阶段限定、正整数、缺省 1）+ 调度扫描有界穿透 + READY 激活双道容量（任务级 ACTIVE concurrency + 已声明角色表；无表＝基线无角色门）+ **聚合校验器两处单活跃不变量改为读声明容量**（#validateTaskStarted + validateGlobalInvariants——审计发现单活跃在追加层还有第二道硬编码，非只有扫描锁存）+ `start()` 先验证图后落账（坏声明不再留下半启动项目）+ declare 请求升级为 `{proposal, stageGraph?}` 单一形状（三处调用方同轮更新，无双格式）+ serve 透传；SCHED-A01–A06 全绿；live 冒烟通过（A/B 同时 ACTIVE + 卫星 + C BLOCKED）。 |
