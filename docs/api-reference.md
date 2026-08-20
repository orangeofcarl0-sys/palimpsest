# API 参考

本文按源码导出面整理公开 API。语义规格见 [architecture.md](architecture.md) 与 [工程规格](engineering/03-system-design-spec.md)。

## 1. 导出面

| 路径 | 内容 |
|---|---|
| `palimpsest-dsh` | `schema` · `domain` · `state` · `scheduler` |
| `palimpsest-dsh/advanced` | `effects` · `evidence` · `select` · `allocate` · `telemetry` · `tools` · `installPalimpsest` |
| `bin.palimpsest` | CLI（`dist/src/cli.js`） |

## 2. installPalimpsest

```ts
installPalimpsest(host: DshPluginContext, options: InstallPalimpsestOptions): InstalledPalimpsest

interface InstallPalimpsestOptions {
  projectId: string;                    // 必填
  databasePath?: string;                // 默认 $DSH_HOME/palimpsest/palimpsest.sqlite
  ordariumDatabasePath?: string;        // 默认 $DSH_HOME/ordarium/operations.sqlite
  repository?: string;                  // 默认 git 端口根
  git?: GitPort;
  policy?: TaskPolicy;
  clock?: () => string;                 // Palimpsest 侧时钟
  effectsClock?: () => Date;            // Ordarium 侧时钟
  leaseMs?: number;
  hooks?: RuntimeHooks;
}

interface InstalledPalimpsest {
  readonly controller: ProjectController;
  readonly tools: readonly DshToolDefinition[];
  register(context: DshPluginContext): () => void;
  dispose(): Promise<void>;
}
```

## 3. ProjectController

```ts
new ProjectController(o: {
  store: EventStore;
  effects: PalimpsestEffectsRuntime;
  projectId: string;
  policy: TaskPolicy;
  clock?: () => string;
  parallel?: ParallelOptions;       // 角色槽位与预算（默认即强默认）
  gates?: readonly GateDefinition[];
})
```

### 生命周期

| 方法 | 说明 |
|---|---|
| `start(input: StartProjectInput): SchedulerEvent` | goal + tasks（TaskSpec[]）+ headCommit? |
| `plan(input: PlanInput): SchedulerEvent` | tasks + changeClass? + changedIds? + reason? |
| `invalidateTask(taskId, reason): SchedulerEvent` | 使任务失效 |

### 调度

| 方法 | 返回 |
|---|---|
| `step(): SchedulerEvent \| null` | 执行一次调度决策（`commit(decide())`） |
| `preview(): { decision, eventType?, entityId?, projectRevision? }` | 只读预览下一步，零写入 |
| `runTurn({ maxSteps? }): Promise<{ phase, mechanical, next? }>` | 机械推进一个回合并分类剩余阶段 |
| `pause(reason)` / `resume(reason)` | 调度控制 |

### 执行

| 方法 | 说明 |
|---|---|
| `claim(attemptId): Promise<{ worktreePath }>` | 认领：隔离工作区 + RUNNING |
| `report(attemptId, ReportInput): SchedulerEvent` | 四态执行报告 |
| `reportLate(attemptId, ReportInput): SchedulerEvent` | 迟到结果（STALE） |
| `runAttemptWithCommandExecutor(attemptId): Promise<{ exitCode, reportEvent }>` | 命令执行器路径 |
| `pumpCommandAttempts({ maxSteps? }): Promise<{ lastEvent, attemptsRun, exits }>` | 自动命令循环 |

### 证据

| 方法 | 说明 |
|---|---|
| `gate(GateInput): Promise<SchedulerEvent>` | 执行验证命令并记录 EvidenceAtom |
| `evaluateGate(gateId, subjectType, subjectId): { verdict, next_evidence_needed }` | 门禁求值 |
| `invalidateEvidence(evidenceId, reason): SchedulerEvent` | 证据失效 |

### 晋升与选择

| 方法 | 说明 |
|---|---|
| `promote(attemptId, sourceCommit, expectedHead): Promise<PromoteResult>` | 直接晋升 |
| `promoteWhenGatePasses(attemptId, sourceCommit, expectedHead, gateId)` | 门禁 PASS 才晋升；否则返回缺失证据 |
| `selectCandidate(judge: PairwiseJudge): Promise<TournamentResult>` | 锦标赛选择 |
| `selectAndPromoteWhenGatePasses(judge, gateId, expectedHead)` | 选择 + 门控晋升链 |

### 状态

| 方法 | 说明 |
|---|---|
| `allocateFor(taskId, estimates)` | 分配建议（与槽位联动） |
| `status(): ControllerStatusView` | 项目视图（含 `resume` 断点区块） |
| `persistTelemetry()` / `loadTelemetryInto(table)` | 模型性能统计持久化 |

## 4. Scheduler

```ts
new Scheduler(store: EventStore, projectId: string)

scheduler.decide(): NewEvent | null          // 纯决策，零写入
scheduler.commit(decision: NewEvent): SchedulerEvent
scheduler.runOnce(): SchedulerEvent | null   // = commit(decide())
scheduler.registerPolicy(policy: TaskPolicy)
scheduler.registerTask(authorized: AuthorizedTaskEnvelope): SchedulerEvent
scheduler.startAttempt(attemptId): SchedulerEvent
scheduler.recordCallback(attemptId, eventType, report | null): SchedulerEvent
```

## 5. EventStore

```ts
new EventStore(path: string, { clock: () => string })

store.append(request: NewEvent, opts?: { faultHook?, committedAt? }): SchedulerEvent
store.connection: DatabaseSync   // 只读访问投影；业务写入必须走 append
store.close()
```

路径函数：`defaultStatePath(repo)`、`dshDefaultStatePath()`。

## 6. effects

`PalimpsestEffectsRuntime.actions`：五个 Safe Action（profile 见 [architecture.md](architecture.md) §6）。

```ts
createPalimpsestEffects({ databasePath, git, clock?, leaseMs?, hooks? })

// git 端口
new GitCliPort(repository, worktreeRoot)   // 真实 git worktree
new FakeGitPort(head)                      // 内存端口；queueGateOutcome/setGateOutcome 供测试
```

## 7. TaskPolicy

```ts
new TaskPolicy({
  policy_id, read_paths,
  allowed_commands: [{ executable, argv_prefix }],
  network_policy: "deny" | "allow-listed", network_allowlist,
  timeout_s, lease_s, attempt_limit, candidate_limit: 1 | 2 | 4,
})

policy.digest                                        // canonical 摘要
policy.authorize(project, taskId): AuthorizedTaskEnvelope
```

## 8. 工具面

| 工具 | mode | 说明 |
|---|---|---|
| `palimpsest_status` | read-only | 项目视图与断点 |
| `palimpsest_preview` | read-only | 零写入决策预览 |
| `palimpsest_start` | mutating | 创建项目 |
| `palimpsest_plan` | mutating | 修订任务图 |
| `palimpsest_next` | mutating | 单次调度决策 |
| `palimpsest_run` | mutating | 回合推进 |
| `palimpsest_claim` | mutating | 认领尝试 |
| `palimpsest_report` | mutating | 提交报告 |
| `palimpsest_gate` | mutating | 记录证据 / 门禁求值 |

`DshToolDefinition.mode` 为宿主权限层提供 plan 模式判定依据。

## 9. 常用导出

| 模块 | 导出 |
|---|---|
| `schema` | `canonicalDigest`、`canonicalJsonBytes`、`parseNewEvent`、`parseProjectIr`、`parseTaskSpec`、`parseTaskEnvelope`、`attemptReportDigestOf`；类型 `ProjectIr`、`TaskSpec`、`TaskEnvelope`、`AttemptReport`、`EvidenceAtom`、`SchedulerEvent`、`NewEvent`、`EventType`、`TaskRole` |
| `domain` | `actionKey`、`stableEntityId`、`TaskPolicy`、`AggregateValidator` |
| `evidence` | `parseGateDefinition`、`GateEngine`、`computeInvalidationSet`、`changeClassInvalidates`、`ClaimGraph` |
| `select` | `runTournament`、`preferredJudge`；类型 `PairwiseJudge`、`TournamentResult` |
| `allocate` | `allocate`；类型 `Allocation`、`AllocationEstimates` |
| `telemetry` | `ModelPerformanceTable`、`rebuildTelemetry`、`writeTelemetry` |
| `tools` | `ProjectController`、`buildProjectIr`、`DEFAULT_HEAD_COMMIT`、`RoleSlotPolicy`、`BudgetLedger`、`definePalimpsestTools` |

## 10. 约束

1. 业务写入仅经 `EventStore.append`。
2. 涉及序列化的变更必须通过 parity 测试（`test/parity.fixture.test.ts`）。
3. 不确定结果不得终态化。
4. 宿主渲染层不暴露 event_id 与哈希。
