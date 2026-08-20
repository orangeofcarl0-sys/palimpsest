# Palimpsest API 参考（开发者）

> 事实来源：`src/index.ts` / `src/advanced.ts` 的导出面，与源码签名逐一核对。类型名以代码为准；规格语义见 docs/03，指南见 docs/04。

## 1. 导出面速查

| 包路径 | 提供 | 说明 |
|---|---|---|
| `palimpsest-dsh`（`.`） | `schema` · `domain` · `state` · `scheduler` | 合同核心，零第三方依赖（仅 `node:sqlite`） |
| `palimpsest-dsh/advanced`（`./advanced`） | `effects` · `evidence` · `select` · `allocate` · `telemetry` · `tools` · `installPalimpsest` | 嵌入面：完整编排 + Ordarium effects + 工具/宿主接线 |
| `bin.palimpsest` | CLI `dist/src/cli.js` | 与工具面同源的命令面 |

## 2. `installPalimpsest`（黄金路径）

```ts
installPalimpsest(host: DshPluginContext, options: InstallPalimpsestOptions): InstalledPalimpsest
// options: { projectId(必), databasePath?, ordariumDatabasePath?, repository?,
//            git?, policy?, clock?, effectsClock?, leaseMs?, hooks? }
// returns InstalledPalimpsest: { controller, tools, register(ctx): ()=>void, dispose(): Promise<void> }
```

- `databasePath` 默认 `$DSH_HOME/palimpsest/palimpsest.sqlite`（`DSH_HOME` 未设回退 `~/.dsh`）；`ordariumDatabasePath` 默认 `$DSH_HOME/ordarium/operations.sqlite`。
- `git` 默认 `GitCliPort(repository, repository/.palimpsest/worktrees)`；`trustedDefaultPolicy()` 为安全默认（deny 网络、attempt_limit 2、candidate_limit 1、命令白名单 python -m pytest）。

## 3. `ProjectController`（SDK 面，六组方法）

```ts
new ProjectController(o: { store: EventStore; effects: PalimpsestEffectsRuntime;
  projectId: string; policy: TaskPolicy; clock?; parallel?; gates? })
```

| 组 | 方法（签名要点） |
|---|---|
| 生命周期 | `start(input: StartProjectInput): SchedulerEvent`（goal + tasks[TaskSpec] + headCommit?）；`plan(input: PlanInput): SchedulerEvent`（tasks + changeClass? + changedIds? + reason?）；`invalidateTask(taskId, reason): SchedulerEvent` |
| 调度 | `step(): SchedulerEvent \| null`（=`commit(decide())`）；`preview(): { decision: 'idle'\|'paused'\|'next', eventType?, entityId?, projectRevision? }`（零写入，plan-mode 安全）；`runTurn({maxSteps?}): Promise<{ phase: 'terminal'\|'paused'\|'needs_worker'\|'needs_promotion'\|'progress', mechanical: {attemptsRun, exits}, next? }>`；`pause(reason)` / `resume(reason)` |
| 执行 | `claim(attemptId): Promise<{ worktreePath }>`；`report(attemptId, ReportInput): SchedulerEvent`（四态）；`reportLate(...)`（→STALE）；`runAttemptWithCommandExecutor(attemptId): Promise<{exitCode, reportEvent}>`；`pumpCommandAttempts({maxSteps?}): Promise<{lastEvent, attemptsRun, exits}>` |
| 证据 | `gate(GateInput): Promise<SchedulerEvent>`（predicate+command 执行→EvidenceAtom）；`evaluateGate(gateId, 'attempt'\|'task', subjectId): { verdict, next_evidence_needed[] }`；`invalidateEvidence(evidenceId, reason)` |
| 晋升与选择 | `promote(attemptId, sourceCommit, expectedHead): Promise<PromoteResult>`；`promoteWhenGatePasses(attemptId, sourceCommit, expectedHead, gateId)`（非 PASS 拒绝并回缺失证据）；`selectCandidate(judge: PairwiseJudge): Promise<TournamentResult>`；`selectAndPromoteWhenGatePasses(judge, gateId, expectedHead)` |
| 分配与状态 | `allocateFor(taskId, estimates)`（与槽位联动）；`status(): ControllerStatusView`；`persistTelemetry()` / `loadTelemetryInto(table)` |

`ControllerStatusView` 关键字段：`revision`、`headCommit`、`schedulerState`、`generation`、`tasks[]`、`attempts[]`、`evidence[]`、`promotions[]`、`parallel{admittedAttempts, rejectedClaims}`、**`resume{action, detail, inFlightAttemptIds, openTasks}`**（E3 断点区块）。

## 4. `Scheduler`（合同核心）

```ts
new Scheduler(store: EventStore, projectId: string)
scheduler.registerPolicy(policy: TaskPolicy)   // 受信 policy 准入
scheduler.registerTask(authorized: AuthorizedTaskEnvelope): SchedulerEvent
scheduler.decide(): NewEvent | null    // 纯决策，零写入（preview/run 基石）
scheduler.commit(decision: NewEvent): SchedulerEvent
scheduler.runOnce(): SchedulerEvent | null   // = commit(decide())
scheduler.startAttempt(attemptId): SchedulerEvent
scheduler.recordCallback(attemptId, EventType, report|null): SchedulerEvent
```

## 5. `EventStore` 与数据库

```ts
new EventStore(path: string, { clock: () => string })
store.append(request: NewEvent, opts?: { faultHook?, committedAt? }): SchedulerEvent
store.connection: DatabaseSync      // 直接读投影（禁止绕过 append 写）
store.close()
// 开库即强制 WAL + busy_timeout 5000 + synchronous FULL + foreign_keys ON（database.ts）
// 路径：defaultStatePath(repo) / dshDefaultStatePath()（$DSH_HOME 回退 ~/.dsh）
```

## 6. effects（Ordarium 五 action）

`PalimpsestEffectsRuntime.actions`：

| Action | profile | 输入要点 |
|---|---|---|
| `worktree.create` | idempotent(durable) | worktreeId |
| `git.commit` | reconcilable | worktreeId, message |
| `git.promote` | reconcilable | attemptId, sourceCommit, expectedHeadCommit |
| `gate.command` | readOnly | worktreeId, executable, argv → { exitCode: number\|null } |
| `worker.dispatch` | guarded | … |

工厂：`createPalimpsestEffects({ databasePath, git, clock?, leaseMs?, hooks? })`；git 端口：`GitPort` 接口 / `GitCliPort(repo, worktreeRoot)`（真实 `git worktree add`）/ `FakeGitPort(head)`（内存双亲合并、`queueGateOutcome`/`setGateOutcome` 供测试脚本化）。

## 7. TaskPolicy（受信准入）

```ts
new TaskPolicy({ policy_id, read_paths, allowed_commands: [{executable, argv_prefix}],
  network_policy: 'deny'|'allow-listed', network_allowlist, timeout_s, lease_s,
  attempt_limit, candidate_limit: 1|2|4 })
policy.digest                                  // canonical digest（fixture parity 校验过）
policy.authorize(project, taskId) → AuthorizedTaskEnvelope  // digest 化的授权信封
```

## 8. 工具面（9 个，含 E4 mode 声明）

| 工具 | mode | 作用 |
|---|---|---|
| `palimpsest_status` | read-only | 人可读项目视图 + `resume` 断点 |
| `palimpsest_preview` | read-only | 零写入预判下一步 |
| `palimpsest_start` | mutating | goal → 耐久项目 |
| `palimpsest_plan` | mutating | 修订任务图 |
| `palimpsest_next` | mutating | 一次调度决策 |
| `palimpsest_run` | mutating | 一回合机械推进 + 阶段 |
| `palimpsest_claim` | mutating | 认领 attempt + worktree |
| `palimpsest_report` | mutating | 上报（自述≠证据） |
| `palimpsest_gate` | mutating | 取证 / 注册门禁求值 |

`DshToolDefinition` 增 `mode?: "read-only" | "mutating"`（E4）：宿主权限层可直接据此在 plan 模式放行/拒绝。

## 9. 常用导出常量/函数

`schema`: `canonicalJsonBytes` / `canonicalDigest`（sha256 hex）、`parseNewEvent`、`parseProjectIr`、`parseTaskSpec`、`parseTaskEnvelope`、`attemptReportDigestOf`、类型 `ProjectIr/TaskSpec/TaskEnvelope/AttemptReport/EvidenceAtom/SchedulerEvent/NewEvent/EventType/TaskRole`。
`domain`: `actionKey` / `stableEntityId` / `TaskPolicy` / `AggregateValidator`。
`evidence`: `parseGateDefinition` / `GateEngine` / `computeInvalidationSet` / `changeClassInvalidates` / `ClaimGraph`。
`select`: `runTournament` / `preferredJudge` / 类型 `PairwiseJudge/TournamentResult`。
`allocate`: `allocate` / 类型 `Allocation/AllocationEstimates`。
`telemetry`: `ModelPerformanceTable` / `rebuildTelemetry` / `writeTelemetry`。
`tools`: `buildProjectIr` / `DEFAULT_HEAD_COMMIT` / `RoleSlotPolicy` / `BudgetLedger` / `definePalimpsestTools` / `ProjectController`。

## 10. 契约红线（违反了必回归）

1. 所有写入走 `EventStore.append` 六段管线；**禁止**直接对 `connection` 写业务表。
2. 任何事件/序列化改动必过 `test/parity.fixture.test.ts`（契约门，逐字节）——例外只有 §9.2 的加法可选字段缺省省略。
3. 不确定结果不得 terminalize（PROMOTION_FAILED 只在确定性失败时发）。
4. 宿主渲染层不暴露 event_id / hash；用户语言是 goal/task/attempt/verified/evidence。
