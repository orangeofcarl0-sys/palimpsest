# LHAPE — Long-Horizon Adaptive Project Execution 最终报告

Status: **engineering qualification complete; paid model cohort BLOCKED.**
本轮没有新的付费模型授权，因此没有任何真实模型调用。以下所有“模型”内容均为确定性 Messages
替身，所有 Host、Worker 进程、工具执行、文件写入、Git commit、Promotion 和 Host kill 都是真实的。

## 0. 结论

Palimpsest 现在可以让多个真实 Work Worker 在各自独立的 Execution World 中并发生产候选资产；底层
测量事实可以通过既有 Contribution → Decision → ProjectIR Revision 路径改变计划；正在运行的旧
worker 可以在任务退休后继续存在，其晚到结果保留为历史 COMPLETED 结果、不被 Promotion 接受；
新的 Principal Session 可以从 durable pulse/state 接续、对旧结果做 continuation 判断并重新工作；
一个被真正杀掉的 Host 留下的已提交世界可以由新 Host 观察并结算；最终三个 revised/integration
任务都通过既有 Promotion 路径被接受，项目到达 revision 4、`NO_ACTION`。

这是**真实 Host 上的确定性工程验证**，不是模型能力、业务质量或 F/L/G 优势的证明。

## 1. Git 事实

| 项目 | 值 |
|---|---|
| 起点 | `d16800fbe3d1a6172b66b466b227c5fddbb45b98`（`origin/main`，APS 最终记录） |
| 分支 | `palimpsest-long-horizon-adaptive-execution` |
| 实现 commit | `e59a9112c11ea45e4300e20e30ca7e2136d7cf24` |
| 实现 tree | `751a05e7116264b2ecf0c32fb0ac4eba61137ab0` |
| 代码冻结 | 无独立 freeze commit；`e59a911` 是本轮实现基线 |
| 本地 `main` | `67b29c9e7907b08fe594738973ce48b55e10d80b`（未移动） |
| `origin/main` | `d16800fbe3d1a6172b66b466b227c5fddbb45b98`（未移动） |
| 是否 force-push / 移动 main | 否 |
| 是否 push / PR / merge | 否；按授权边界只做了本地正常 commit |
| 历史 Code/Evidence Freeze | 未修改、未 rebase、未删除 |
| 本轮执行证据 | `research-evidence/lhape/2026-11-03/` |

本报告与证据由后续 delivery commit 记录；该 commit 的 hash 写在
`research-evidence/lhape/2026-11-03/DELIVERY.json` 中。

### 1.1 重要变更（不是行为保持补丁）

- `src/interaction/work_delegation.ts`
  - 增加只读 `jobs()`、显式 `stop()`（AbortController + `stopRequested`，并且明确
    `STOP_REQUESTED ≠ STOPPED`）。
  - 增加 host-local 重复启动保护：同一 task 在同一 Host 已有 active job 时拒绝第二个 worker，
    避免两个进程写同一个 world。
  - settlement 保持 INERT：不自动 tick scheduler。D5 continuation 流程自己推进 scheduler，这是一个
    既有合同；本轮 operator 脚本在 acceptance 前执行合法 tick。
- `src/application/surfaces/work.ts` + `src/adapters/dsh/normal.ts`
  - 把**既有** `WorkDelegationService` 和 `ResultContinuationService` 接到模型可见的 normal
    product path：`delegate`、`workers`、`stop`、`results`、`continue`，以及按 task 指定
    `complete`。没有新增 Work runtime、Continuation 引擎或结果账本。
  - `delegate` 在返回前等待 execution position 进入 canonical 状态（有界），这样连续两次
    delegate 不会把同一个 task 解析两次；worker 仍在后台运行，调用本身从不等待 completion。
- `src/composition/continuity.ts` / `src/project_contribution/service.ts`
  - Contribution decision 的 crash window：`controller.plan()` 已提交 ProjectIR revision（其中
    带 decision id）但 Journal note 未写时，重试会从 canonical revision history 恢复 planChange，
    只补写缺失的 decision note，不再次修订计划。
- `src/scheduler/scheduler.ts` / `src/tools/work_evidence.ts` / `src/tools/controller.ts`
  - 晚到结果的真实阻塞点：callback event 曾用 attempt 的**历史 envelope revision** 作为
    `expected_project_revision`，只要项目 revision 前进，合法晚到结果就无法落账。现在 event 的
    optimistic fence 使用**当前 ProjectIR revision**；evidence atom 仍记录它被授权时的
    revision，并由 `expectedProjectRevision` 单独承担 append fence。两者不再混为一个字段。
- `src/project_pulse/*`
  - Pulse 增加 derived `execution`：canonical attempt 与**本 Host** 的 job 分开；没有本 Host job
    的 RUNNING attempt 报 `EXECUTION_UNOBSERVED`，退休任务上的 open attempt 报
    `ORPHANED_EXECUTION`，退休任务的 COMPLETED 结果报 `STALE_RESULT`。这些全部是 advisory。
- `host/deployment/runtime/win32_label.js`
  - `PALIMPSEST_DSH_ROOT` 现在是显式 seam 覆盖：此前它被 entry point 压住，导致部署指定的
    rc.5 seam 被全局 rc.3 覆盖，worker 因 drift 被拒。entry point 仍作为 fallback。
- `scripts/lhape/`
  - 真实 Windows Host 场景、PTC worker 脚本、operator promotion、final pulse、summary、
    fail-closed cohort gate 和 per-session entry。这里的 deterministic Messages 替身只驱动真实
    DSH loop；所有记录标注 `MOCK_MODEL_REAL_DSH_HOST`。

没有新增 canonical ProjectIR owner、approval ledger、intent admission authority、第二个 Promotion
路径、通用 scheduler/router/watchdog、新 result ledger、通用业务真值引擎、新文件系统 sandbox 或
LayerFS 集成。

## 2. 真实执行事实

主场景证据：`research-evidence/lhape/2026-11-03/main/`。

| 能力 | 本轮事实 |
|---|---|
| 真实并发 Work Worker | 6 个真实 worker session；baseline capacity / baseline cost / revised capacity 三段 session 区间真实重叠（`run-summary.json.workerOverlapPairs`）；每个 worker 有自己的 Execution World |
| 独立 Execution World | 每个 attempt 一个 `worktree` world；canonical HEAD 在 worker 运行期间不动；promotion 前候选结果不进入 canonical |
| 实际产物生产 | 真实 `run_code` → `pwsh`/`write` → Git commit；6 个 attempt 各有 result commit |
| Result Export / Integration | 每次 SETTLED 均 export 到 canonical object DB；3 次 operator Promotion 进入 canonical head |
| 贡献驱动计划变化 | `ctb-b7926e…` → `REVISE_PLAN`；revision 0→1；删除 `capacity`/`cost`，新增 `capacity-v2`/`cost-v2`/`integration`；`changeClass=behavior_change`，`changedIds=[capacity,cost]` |
| Worker 运行期间 Replan | 两个 baseline worker 在 revision 时仍存活；它们先 commit 后 park，replan 后才被 release/report |
| Late Result | baseline capacity result `04343d7a…` 与 baseline cost result `4442b232…` 在任务退休后仍为 COMPLETED 历史结果；continuation 报 `INCOMPATIBLE`/`STALE`；Promotion 报 `task_retired`；最终 pulse 队列 `STALE_RESULT` |
| Session Continuation | S2/S3 是新 Host 进程，无 principal transcript 继承；从 durable pulse/state 恢复；S2 选择 rework，S3 用合法 `next` unblock integration 后 delegate |
| Final Acceptance | 3 次真实 Promotion：`capacity-v2` → `60c25062…`，`cost-v2` → `c852acd0…`，`integration` → `0ff650ab…`；operator 只给 task，不提供 source commit/expected head |
| Long-Horizon Outcome | revision 4；`capacity-v2`/`cost-v2`/`integration` 全部 SATISFIED；`NO_ACTION`；三个 artifact 相互一致 |

### 2.1 主场景时间线（UTC）

| 时间 | 事实 | 证据 |
|---|---|---|
| 16:46:17 | S1A 开始 baseline capacity | `main/run-summary.json` |
| 16:46:26 | baseline capacity worker 启动（真实 PTC worker） | worker session `worker-057c…` |
| 16:46:39 | S1B 开始 baseline cost | `main/run-summary.json` |
| 16:46:49 | baseline cost worker 启动，commit 后 park | `worker-f98e…` |
| 16:46:52 | 外部 measured constraint 到达 | `main/constraint-arrived-at.txt` |
| 16:47:03 | 真实 native subagent 读取 input + sites，principal 记录 contribution 并执行 revision 0→1 | `LHAPE_CHILD_CONSTRAINT`, `ctb-b7926e…` |
| 16:47:13 | revised capacity worker 启动 | `worker-5d57…` |
| 16:47:15 | 释放 parked baseline workers | `main/baseline-released-at.txt` |
| 16:47:16 | 两个 baseline 晚到结果结算为 retired task 上的 COMPLETED | `attempt-c3f5…`, `attempt-7438…` |
| 16:47:24 | revised cost worker 完成 | `main/run-summary.json` |
| 16:47:40 | 新 principal S2；检查 late result 并选择 rework | `main/mock.jsonl` |
| 16:47:51 | rework worker 在当前 basis 运行 | `Continuation context` session |
| 16:48:40 | 新 principal S3；`next` unblock integration 后 delegate | `main/mock.jsonl` |
| 16:48:49 | integration worker 运行 | worker session |
| 16:49:27 | S3 结束；`final-pulse` 读 revision 4 | `main/final-pulse.json` |

### 2.2 中断与恢复

证据：`research-evidence/lhape/2026-11-03/interrupt/`。

1. IR1 在 16:49:57 启动真实 worker；worker 写入并 commit `deliverables/interrupted.md`，然后
   **不报告**地 park。
2. 16:50:09，harness 解析到真实的 Windows Node host PID，`taskkill /T /F` 杀掉整个 tree；
   `kill-result.txt` 记录 PID，随后 Windows 进程查询确认 `node.exe` 中不再有 IR1 command line，
   且 `mock.jsonl` 在 kill 后没有 IR1 请求。
3. IR2 在 16:50:24 读取 pulse/workers：attempt 是 RUNNING，`hostObserved=false`，不被声称为仍存活。
4. `palimpsest_work action=complete taskId=interrupted-write` 从已提交 world 观察并 SETTLED；
   返回明确写出“this host observed the world; it does not claim the previous worker process is still
   alive”。结果 commit `fe4c0d56…`，operator Promotion 后 task SATISFIED，head
   `5042ccb167248a7f8087b04817da23d6712e8c14`。

## 3. 测试与资格

| 项目 | 结果 |
|---|---|
| TypeScript build (`npx tsc -b`) | PASS |
| Hotspot suites（13 files，83 tests） | 83/83 PASS |
| D5 continuation suite（13 tests） | 13/13 PASS |
| 新增 LHAPE surface tests（4 tests，含在 83 内） | 4/4 PASS |
| Windows host boundary（`host_s1_spine_coverage` 14 + `host_s1r_reparse_boundary` 15 + `host_conformance` 3） | 32/32 PASS；使用 profile 内的 temp 和 run-owned rc.5 seam |
| Architecture (`module-architecture --check`) | PASS，0 violations |
| Public API (`--check-public-api`) | PASS，0 missing/changed/added |
| 真实 Windows Host main scenario | PASS（revision 4，三任务 SATISFIED） |
| 真实 Windows Host interrupt scenario | PASS（kill 后新 Host 恢复并 Promotion） |
| 真实付费模型调用 | **0**；LHAPE-C cohort **BLOCKED** |

说明：本地 Windows 全局 DSH host 是 `0.2.1-rc.3`，项目 pin 的 Win32 seam 是
`0.2.1-rc.5`；worker pre-create receipt 显示 `resolvedVersion=0.2.1-rc.5, drifted=false`。这不是
“整个 host 都是 rc.5”的声明。CI 的 `host-boundary` 使用 rc.5 解析。

## 4. LHAPE-C 状态

已准备：

- `docs/programs/lhape/LHAPE-C-PROTOCOL.md`：F/L/G 定义、公平性约束、指标、预算/stop 规则。
- `scripts/lhape/run_cohort.mjs`：fail-closed cohort gate。要求 `lhape-spend-authorization/v1`
  覆盖本 cohort、provider、F/L/G、aggregate ceiling 和未来 expiry；本地硬上限 8,000,000 tokens；
  `--execute` 时每 session 仍经真实 usage 读取的 budget guard。
- `scripts/lhape/cohort_session.mjs`：authorized session entry；没有同一 authorization 时拒绝启动。
- `research-evidence/lhape/live/cohort-pre-registration.json`：预注册 cohort。
- `research-evidence/lhape/live/lhape-c-long-horizon-2026-11-03/BLOCKED.json`：
  `state=BLOCKED`，`modelCalls=0`，blocker 是“no LHAPE spend authorization”。

结论：**LHAPE-C 的付费 F/L/G 长程 cohort 没有运行，也不得运行**。本轮没有任何模型成本优势、
业务质量或跨条件比较的结论。

## 5. 架构收敛

**真正复用的模块**：`ProjectController.plan`、Work/Attempt、`WorkDelegationService`、
`dshSubprocessWorkWorkerPort`、`ExecutionWorld`、Scheduler capacity、`ResultContinuationService`、
Promotion、ProjectJournal、ProjectContinuity、ProjectPulse。没有第二套 canonical state。

**实际集成缺口（本轮修复）**：

1. 既有 `WorkDelegationService` 和 `ResultContinuationService` 没有接到 normal product/tool path；
   worker 只能由 gate 脚本直接驱动。本轮的 work surface/tool 暴露解决了这一点。
2. 晚到结果的 event fence 使用了历史 envelope revision，导致合法晚到结果无法落账。拆分为
   “atom 记录的历史 revision”与“append 的当前 revision”。
3. Contribution decision 在 plan 已提交、Journal note 未写时的 crash window 无法重试。用 canonical
   decision id + revision history 恢复，不新建事务平台。
4. Windows read fence 的显式 seam root 被全局 entry 覆盖；修正优先级。
5. Pulse 只有 pending work，没有“本 Host 是否观察到 worker”。增加 execution projection 和
   unobserved/orphaned/stale-result 队列。
6. async settlement 不自动 tick scheduler 是 D5 既有合同；本轮把合法 tick 放在 operator
   acceptance 前，而不是改 settlement 语义。

**真实运行驱动的修正**：worker read guard 拒绝 `.palimpsest` durable state（正确），因此 revised
任务把 measured constraint 放在 task objective 中；worker 的 commit 必须在自己的 world 内完成，
场景因此使用“commit 后 park、replan 后 report”的顺序来产生真正的晚到结果；Host 必须活过 release
和 settlement，否则 worker 结果无人结算。

**仍然存在的问题**：

- Windows read-fence backend 每个 Host 只允许一个 active confidential worker。并发 2 通过两个 Host
  实现；这不是单 Host 并发能力的证明。
- Worker read guard 不允许读取 Host durable state；跨 attempt 的项目输入目前只能通过任务 context
  或 project source 传递。
- Operator acceptance 仍需显式 tick 才能把 ACTIVE 完成迁移到 VERIFYING；这是既有 D5 合同，
  不是本轮新增的自动接受。
- 没有 real-model 长程行为、没有 F/L/G cohort、没有成本结论。
- 旧 baseline 结果的 compatibility 是 `INCOMPATIBLE`，因此本轮选择了 rework，而不是 reuse；没有
  证明“部分有价值的旧结果被复用”的收益。

## 6. 最终回答

**Palimpsest 是否已经能让多个真实 Agent 在一个持续演化的项目中共同生产、相互影响、处理异步变化，
并可靠形成最终成果？**

在**真实 Windows DSH Host + 真实 worker 子进程 + 真实 Git/文件/Promotion** 的确定性工程验证中：
**可以**。两个 baseline worker 在独立世界中并发运行；真实 measured constraint 触发了实际 revision；
旧 worker 在任务退休后仍存活，其晚到结果被保留为历史而未被接受；rework 和 cross-session
continuation 完成；真实 Host kill 后的已提交世界被新 Host 结算；最终三个任务通过既有 Promotion
被接受，revision 4，`NO_ACTION`。

但这不是“Palimpsest 优于强原生 DSH”的证明：模型是确定性替身，F/L/G 真实 cohort 因无新授权而
BLOCKED，且 Windows 单 Host 的 worker 容量限制真实存在。若要回答业务价值和比较收益，必须获得新的
明确模型授权后运行 LHAPE-C；不得把本轮结果当作该比较的替代品。
