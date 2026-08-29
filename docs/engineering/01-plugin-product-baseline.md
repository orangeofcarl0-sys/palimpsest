# Palimpsest DSH 插件产品基线

> Product revision：`PALIMPSEST-PLUGIN-16`
> 状态：P0–P3 已交付 + Research 线 R1–R12（…/ telemetry 持久化 / 命令执行器自动化接线）已落地。本文是插件形态的产品与工程权威说明。

## 1. 产品定义

Palimpsest DSH 插件是 **Ordarium 的典型产品**：一个用户友好的多 agent 编排插件。用户向 DSH agent 说一句话目标，插件把它变成耐久项目——目标编译（ProjectIR）、任务图（Task DAG）、隔离 Attempt、确定性证据门禁、版本化晋升；进程崩溃、agent 失败、迟到结果都不会污染 canonical 状态，全部历史可回放。

三方定位：

- **对用户**：一句话目标 → 可崩溃恢复、保留全部历史、只晋升验证过工作的项目；零配置强默认，普通 DSH 用户不需要理解 event log。
- **对 agent**：一个精选工具面（P2 起 7 个工具），长程工作有纪律——agent 不拥有流程，流程由插件拥有。
- **对 Ordarium**：首个示范全部五种 effect profile 与共账拓扑的产品级消费者（docs/12 §9 所述"显式调用 Action 的宿主"）。

核心身份继承自 Palimpsest：**Revision without amnesia**——新版本不覆盖历史，旧证据按其绑定 revision 保存并自动失效。

## 2. 三句不可违背的合同

1. **AttemptReport ≠ Evidence**：Worker 自述只能进入报告的 `summary`；证据由确定性 Gate 产生并绑定 subject digest。
2. **LLM opinion ≠ Project State**：ProjectIR 只能经证据驱动的事件修订；agent 的判断是提议，不是状态。
3. **迟到成功 ≠ 可提交**：stale 隔离硬性执行；执行成功与当前可提交是两个概念。

## 3. 分层架构

```text
src/schema     五 Schema + canonical digest + 28 EventType + payload 规范化     【P0 ✅】
src/domain     状态机转换表 / aggregate 权威校验 / 受信 TaskPolicy / 稳定身份    【P0 ✅】
src/state      EventStore（node:sqlite, PLMP）/ 投影 / 快照 / migration          【P0 ✅】
src/scheduler  确定性"下一步"决策；只能请求 Event append                          【P1 ✅】
src/effects    Ordarium Safe Actions（五 effect 映射）+ 共享 ledger runtime       【P1 ✅】
src/effects    GitPort 抽象（Fake/CLI）+ PromotionManager（Crash A/B 恢复）      【P1 ✅】
src/executors  执行器抽象：claim/report 协议 + 命令执行器 + mock                  【P1 ✅】
src/tools      DSH 工具面（7 工具）+ ProjectController + 用户友好渲染           【P2 ✅】
src/evidence   Gate DSL：声明式定义 + 确定性求值（all/any/exists/count/not + where）【R1 ✅】
src/evidence   typed invalidation：语义兼容演算（change_class × 依赖边敏感度）        【R2 ✅】
src/tools      palimpsest_gate 支持按注册 gate 求值（verdict + nextEvidenceNeeded）  【R3 ✅】
src/select     pairwise tournament：递归两两淘汰候选（judge 只见 id+summary）      【R4 ✅】
src/allocate   自适应计算分配：六维估计 → 规则表（候选数/验证者/升级）          【R5 ✅】
src/telemetry  模型能力统计表：按 task_type+model 累计并估算预期成功成本          【R6 ✅】
src/evidence  科研 evidence graph：CLAIM→EVIDENCE→EXPERIMENT→CONFIG→COMMIT→DATA 证明链  【R7 ✅】
src/tools     promoteWhenGatePasses：门禁 PASS 才放行晋升（verdict 驱动）      【R8 ✅】
src/tools     selectAndPromoteWhenGatePasses：tournament 胜者 → 门控晋升全链路  【R9 ✅】
src/tools     allocateFor 并发校准：候选数建议 ↔ 角色槽位/硬上限联动             【R10 ✅】
src/telemetry  telemetry 外置持久化：管理型 state kind append-delta（重启/跨会话重建）【R11→TLM ✅】
src/tools     CommandExecutor 自动化接线：pump 自动 claim→gate→report→批次重试 【R12 ✅】
src/install    installPalimpsest(ctx, options) 黄金路径                          【P2 ✅】
多 agent 并行：角色槽位（RoleSlotPolicy）+ 2–4 候选 + 基础预算（BudgetLedger）  【P3 ✅】
```

依赖方向固定为 `schema ↑ domain ↑ state ↑ scheduler`（同 docs/11 §3）；`state` 不得导入 `scheduler`。

## 4. 双存储拓扑

| 存储 | 路径 | 角色 |
|---|---|---|
| Palimpsest 编排账 | `$DSH_HOME/palimpsest/palimpsest.sqlite` | 事件日志真相源（PLMP application_id、user_version=1、哈希链、append-only 触发器） |
| Ordarium 共享 ledger | `$DSH_HOME/ordarium/operations.sqlite` | 与其他 DSH 插件共账的副作用执行账 + 管理型状态（telemetry 外置，PLMP-TLM-1） |

两个库各管一件事：Palimpsest 管"项目应当发生什么"，Ordarium 管"副作用真的发生了什么、是否恰好一次"。

## 5. Ordarium effect 映射（P1 已落地）

| 插件动作 | Action 名 | Effect profile | 依据 |
|---|---|---|---|
| 创建 worktree | `palimpsest.worktree.create` | `idempotent(durable)` | 同键重复创建可安全复用 |
| Attempt 提交 | `palimpsest.git.commit` | `reconcilable` | 可按 commit hash 查询 |
| 晋升合并 | `palimpsest.git.promote` | `reconcilable` | Promotion Crash A/B → reconcile 恢复，不盲重试 |
| Gate 命令执行 | `palimpsest.gate.command` | `readOnly` | 一次性 worktree 内重跑，无外部副作用 |
| 外部 worker dispatch | `palimpsest.worker.dispatch` | `guarded` | dispatch 后结果不明保持 uncertain |

插件直接依赖 `@ordarium/core` + `@ordarium/ledger-sqlite`（宿主/框架作者路径，docs/12 §5），不重复注册 Ordarium 运维工具面。依赖以 GitHub release tarball URL 逐包钉死：`package.json` 三行 pin + `pnpm-workspace.yaml` overrides 重定向打包内互依赖（ledger-sqlite/testing tarball 内声明的 `@ordarium/core` 版本号在 npm 不存在，必须重定向到同 release 的 core tarball——pnpm 11 的 overrides 权威位置是 workspace yaml，该块承重不可删；`blockExoticSubdeps: false` 为此策略显式豁免，integrity 仍由 lockfile sha512 与 pnpm 供应链校验把关）。单包 git 依赖的 `workspace:*` 限制是 Ordarium 记录在案的已知问题；P1 时代的 `tools/sync-ordarium.mjs` 打包路径已退役（00-heritage §5）。

**P1 恢复语义（机器验收）**：`git.promote` 在 execute 前后两个崩溃窗口由 reconcilable 恢复——Crash A（合并前）reconcile 见 head 未变 → `absent(retrySafe)` → 重启后重放 execute，合并恰好一次；Crash B（合并落地、账本未记）reconcile 见 source 已是 head 祖先 → `succeeded`，绝不二次合并。`worker.dispatch` 崩溃后保持 `uncertain`（`UncertainOperationError`），不盲重试。readOnly 的 `gate.command` 同 identity 崩溃窗口后拒绝盲重试，新 identity（新 operation）正常重做。PromotionManager 对崩溃/不确定错误不落 `PROMOTION_FAILED` 终态，只有确定性失败才终态化。

## 6. 工具面（P2 冻结）

根入口 7 工具，精选、渐进披露（镜像 Ordarium façade 文化）：

```text
palimpsest_start    goal → ProjectIR r0 + 假设账本
palimpsest_plan     修订任务 DAG（新 ProjectIR revision）
palimpsest_next     调度器决策 + TaskEnvelope
palimpsest_claim    (子) agent 认领 envelope —— claim/report 协议入口
palimpsest_report   交回 AttemptReport（自述 ≠ 证据）
palimpsest_gate     确定性门禁 → EvidenceAtom
palimpsest_status   人可读项目状态（用户友好渲染）
```

`palimpsest-dsh/advanced`：replay / snapshot 维护 / Operations 受权接线 / 自定义执行器。

多 agent 并发默认（P3，源自 Sparse Cognitive Parallelism 结论）：峰值软 8 / 硬 20，按角色分槽（Manager 恒 1、Scout ≤6、Verifier ≤3），demand-driven 不填满。

## 7. 阶段门

| 阶段 | 交付 | Exit 门 |
|---|---|---|
| **P0** ✅ | 合同核心移植 | digest/事件链/snapshot 与 Python fixture 逐字节 parity；migration 身份一致；tsc + 测试全绿 |
| **P1** ✅ | scheduler 决策 + Ordarium effects + 执行器 | 五 action 各自通过 `@ordarium/testing` 故障注入（FaultInjector + ManualClock + lease 过期恢复）；Promotion Crash A/B → reconcile 语义验收；TS scheduler 从零复现 Python fixture 全 15 事件（digest 逐字节一致） |
| **P2** ✅ | DSH 工具面（7 工具）+ installPalimpsest + ProjectController | 12 项故障验收场景（docs/05 §3）在插件形态全部通过（pause/resume、crash recovery、snapshot rebuild、local retry、lease expiry、late result、revision change、evidence invalidation、write escape、promotion happy path、event idempotency；Crash A/B 由 P1 套件机器验收） |
| **P3** ✅ | 多 agent 并行 | 角色槽位（默认 implementer 2、全局硬上限 20）与 attempt 预算（默认无限）在 claim 时准入；4-candidate 批次并行；并发下 stale/late 不回归（测试套件机器验收）；强默认零配置 |

P0–P3 之后的入口产品线（E1–E4：一句话闭环、装备化 worker、断点续跑、DSH 工作模式兼容收口）规划冻结于 [`02-entry-line-and-mode-compatibility.md`](02-entry-line-and-mode-compatibility.md)。

## 8. 非目标

- 不做 DSH 已有职责：Agent Loop、审批、凭证、沙箱、会话、渲染引擎；
- 不做 Ordarium 已有职责：副作用记账、幂等、lease、恢复引擎（调用，不重建）;
- P3 之前不做：Gate DSL、语义兼容演算、learned allocator、trajectory compression、分布式 scheduler（docs/05 §6 冻结边界继续有效）；
- 不承诺"恰好一次"超出 Provider 事实支持的范围——uncertain 是诚实结果，不是失败。

## 9. 用户友好原则

1. **零配置强默认**：默认 SQLite、默认 deny 网络、默认单 active task；高级能力全部 opt-in 于 `/advanced`。
2. **术语隔离**：工具输出不暴露 event_id/hash chain；用户语言是 goal/task/attempt/verified。
3. **崩溃是正常路径**：任何时刻 kill，重启即恢复；这必须是默认行为而非配置项。
4. **失败可见**：uncertain/stale 以明确措辞呈现，绝不静默吞掉或伪造成成功。
