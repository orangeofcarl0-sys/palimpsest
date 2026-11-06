# HANDOFF — Palimpsest / palimpsest-sr1

> 给接手本项目的 agent。**先读完本文件，再动代码。**
> 本文件是活文档：每次重要更改（合并 PR、修改权限/结算语义、新增证据、改变测试基线、消耗或新增付费预算、变更 DSH 版本）后，必须同步更新本文件并在同一次提交中提交。

---

## 0. 30 秒版本

- 真正的仓库在 **`F:/Codex_Work_Space/Palimpsest/palimpsest-sr1`**。父目录 `F:/Codex_Work_Space/Palimpsest` **不是 Git 仓库**，不要在那里工作。
- 当前正式主线：`origin/main` = **`1766a794a52fcdda323331429b6881d2b1dc8636`**（PR #227 merge）。
- 本地 `main` 被另一个 worktree 占用：`F:/Codex_Work_Space/DSH plugin/palimpsest-repo`。**不要**在这个 worktree 里 `git switch main`，也不要 reset/clean 其他 worktree。
- 新工作从 `origin/main` 开新分支：
  ```bash
  git fetch origin
  git switch -c <your-branch> origin/main
  ```
- 最近完成：PNWF-CQ 产品收敛、operator-mediated Direct→Governed basis admission、容器隔离与评分修正。
- **付费模型预算已耗尽且超支，当前禁止启动任何新的付费 session。** 详见 §6。
- 当前最主要的未修问题：provider proxy 没有 per-session token cap；容器 cohort 因此超预算。下次付费实验前必须先修。

---

## 1. 项目定位与入口

Palimpsest 是“可信项目资产 + 自发性 agent 协作”的 DSH Host 产品层。核心不是再造 agent runtime，而是让真实项目事实（Git、Work、Evidence、Promotion、ProjectIR、Episode）成为模型可正确使用的行动依据。

主要入口：

| 入口 | 路径 |
|---|---|
| 产品安装/组合 | `src/product.ts`, `src/install.ts`, `src/composition/` |
| DSH 工具适配 | `src/adapters/dsh/` |
| Work 域与状态解释 | `src/domain/work_state.ts`, `src/work/`, `src/application/` |
| Controller（热点） | `src/tools/controller.ts` |
| 连续性/Pulse | `src/project_continuity/`, `src/project_pulse/` |
| CLI | `src/cli.ts`, `src/cli_product.ts` |
| 研究证据 | `research-evidence/` |
| 工程报告 | `docs/engineering/` |

---

## 2. 当前 Git / 分支状态（2026-11-07）

| 项 | 值 |
|---|---|
| 仓库 | `F:/Codex_Work_Space/Palimpsest/palimpsest-sr1` |
| `origin/main` | `1766a794a52fcdda323331429b6881d2b1dc8636` |
| PR #227 | MERGED；CI 全绿（unit / e2e / host-boundary / gates / package-smoke） |
| 当前本地分支 | `docs/handoff`（从 `origin/main` 新建，仅用于本文件） |
| 本地 `palimpsest-pnwf-action-coherence` | 已合并；tip `1c85407`，不要继续在该分支开发 |
| 工作树 | clean |
| Node / pnpm | Node `24.14.1` / pnpm `11.21.0` |
| 平台 | Windows 10/11，Git Bash |

注意：`package.json` 声明 Node `>=24.15.0`，本机是 `24.14.1`，pnpm 会打 engine warning；当前构建/测试可用，但不要据此升级依赖或忽略其他 engine 错误。

---

## 3. 已合并的产品语义（不要回退）

### 3.1 Work / 状态

- `status` 与 `readiness` 必须使用同一组 attempt/direct-outcome 事实。
- `readiness` 对零差分必须说：
  - 没有可结算候选增量（no settleable candidate delta）
  - 正式完成未就绪（formal completion not ready）
  - 用户实际成果需另行评估（assess the actual outcome separately）
- 绝不能把“正式 Attempt 无增量”说成“用户实际工作尚未完成”。
- 未提交修改必须先于零差分检查。
- `WorkAttemptLiveness` 的词汇是 `ACTIVE | EXITED | UNKNOWN | UNOBSERVED`；**没有** `NEVER_STARTED`。
- 本 Host 无 Invocation 记录 = `UNOBSERVED`，不是“Worker 从未启动”，也不是“上一个 writer 已停止”。
- Principal 结算无 Invocation 的 world 时归属 `UNATTRIBUTED`；不得声称观察到 worker exit。

### 3.2 行动指导

- `status.nextAction` 是机械合法性；`status.nextAction.semantic` 是业务判断（是否需要继续/退休/CHECKPOINT）。
- 不要把 Scheduler 的合法 `next` 改成“应该退休”；只显示两类事实。
- 零差分 + Direct Commit Ahead：`NO_SETTLEABLE_DELTA` / `SEMANTIC_JUDGEMENT`，不得推荐重复 `complete`。

### 3.3 Plan / Invalidation

- `metadata_only` / `backward_compatible` + `changedIds` **不会**产生 typed invalidation；normal tool 会拒绝这种误导性调用。
- 只有 `behavior_change` / `contract_breaking` 产生 typed invalidation。
- 普通退休 = 在 quiescent 时提交 `tasks: []` 的 graph revision，不是 metadata invalidation。
- `planReconciled` 的 final owner 会重检 invocation ledger；任务要 stale 时若有 OPEN invocation，必须 `quiescence_required` 拒绝。
- 不要削弱 Adapter 的 worker 保护，也不要只依赖 Adapter 快照。

### 3.4 Journal 投影

- `REFERENCE_NOTE` 不等于 open question。
- 带 `relatedRefs.kind === "commit"` 的验证记录、`episode:` / `relay:` provenance 的产品记录，是 recorded observation，不进入 `openQuestions`。
- 无结构化来源的 `REFERENCE_NOTE` 仍保持保守，进入 open questions；真正的 `OPEN_QUESTION` 永远保留。

### 3.5 Direct → Governed（operator-mediated basis admission）

- Direct commit 默认只是 repository outcome，不是 governed result。
- 未经 operator admission：
  - `status` 显示 `DIRECT_HEAD_AHEAD`
  - `prepareMutatingWork` 抛 `HEAD_BASIS_MISMATCH`
  - 不得写 `ATTEMPT_COMPLETED` / `PROMOTION_COMMITTED`
- 合法入口：`palimpsest basis admit`（Operator CLI，不是模型工具）
  - 验证签名 Ed25519 operator credential（`OperatorAuthorityPort`）
  - 目标必须是 checked-out HEAD、clean worktree、当前 ProjectIR head 的 descendant、无 promotion effect ahead
  - task graph 必须不变（head-only）
  - 写 `MANUAL_APPROVAL_RECORDED` + `PROJECT_REVISED`，保留任务 reauthorize 到新 basis
  - 仍然只有一个 head owner：`ProjectController.planReconciled`
- 该 admission **不是** artifact acceptance，不是 promotion，不会产生 Worker Result。
- 本地 signed credential 不是 IdP/SSO；需要远程身份时由部署提供自己的 `OperatorAuthorityPort`。

### 3.6 Execution world

- 自定义 Git port 的 world path 必须被 result exporter 尊重；`gitRepositoryWorldPort` 接受 `worldDir`。
- 复制 attempt world 时，`.git/objects/info/alternates` 必须是**相对路径** `../../../../../.git/objects`；绝对 host 路径在容器中会失效。
- `prepare_continuation.mjs` 和 `container_adapter.mjs` 都已修；不要改回绝对路径。

---

## 4. 关键文件索引

### 产品

- `src/domain/work_state.ts` — `WorkAttemptLiveness`, `WorkNextAction`, `semantic`, `explainWorkState`
- `src/work/read_model.ts` — status facts、`UNOBSERVED`、invalidation/open-invocation、basis admission helpers
- `src/application/work_outcome.ts` — readiness 与 finalize
- `src/application/work_settlement.ts` — principal completion 文案/归属
- `src/adapters/dsh/normal.ts` — normal work tool 描述与 plan/complete 行为
- `src/adapters/dsh/common.ts` — principal-safe status projection（含 semantic）
- `src/project_continuity/service.ts` — journal/openQuestions 投影
- `src/tools/controller.ts` — `planReconciled`、head advance、final-owner quiescence
- `src/cli_product.ts` / `src/cli.ts` — `basis admit`
- `src/deployment/execution_world.ts` — world export / `worldDir`
- `src/composition/core.ts` — Git port/world root 组合

### 测试

- `test/pnwf_product.test.ts` — PNWF direct/governed 产品行为
- `test/pnwf_cq_action_coherence.test.ts` — CQ-A/B/C/D/E + TOCTOU
- `test/pnwf_cq_direct_governed.test.ts` — Direct→Governed 边界反例
- `test/pnwf_cq_basis_admission.test.ts` — operator admission 成功/负例/CLI
- `test/lean_work_execution_world.test.ts` — custom Git port world root
- `test/odpe_outcome.test.ts`, `test/pwrs_relay.test.ts`, `test/pc1v1_next_action.test.ts` — 关键回归

### 报告 / 证据

- `docs/engineering/PNWF-CQ-RESULT.md` — 本阶段完整报告（含无效 cohort 与超支）
- `docs/engineering/PNWF-LIVE-TRAJECTORY.md` — 上一阶段 live trajectory 分析
- `research-evidence/pnwf-cq/2026-11-06/` — 确定性 evidence + 真实 host direct-governed
- `research-evidence/pnwf-cq/live/2026-11-07/` — **INVALID / OVER BUDGET** 容器 cohort
- `research-evidence/pnwf/live/2026-11-06/` — 上一阶段已授权 real-model cohort

### 脚本

- `scripts/pnwf/run_direct_governed_host.sh` — 真实 DSH Direct→Governed（含 operator CLI）
- `scripts/pnwf/isolation_gate.mjs` — Docker 隔离 canary
- `scripts/pnwf/container_adapter.mjs` — 容器内 principal session adapter
- `scripts/pnwf/prepare_continuation.mjs` — 复制 recorded state + 相对 alternates
- `scripts/pnwf/score_continuation.mjs` — 机械评分（stream/ledger/exit/domain refusals）
- `scripts/psvr/session_attribution.mjs` — 逐调用归因
- `scripts/lhape/provider_proxy_tcp.mjs` — provider proxy（**缺少 per-session token cap**）

---

## 5. 验证命令与当前基线

### 必跑

```bash
cd F:/Codex_Work_Space/Palimpsest/palimpsest-sr1
pnpm build
pnpm architecture:check
pnpm architecture:check-public-api
```

### 验收集（顺序执行，避免 Windows 并行超时）

```bash
npx vitest run --fileParallelism=false \
  test/pnwf_cq_action_coherence.test.ts \
  test/pnwf_cq_direct_governed.test.ts \
  test/pnwf_cq_basis_admission.test.ts \
  test/pnwf_product.test.ts \
  test/pc1v1_next_action.test.ts \
  test/pwrs_relay.test.ts \
  test/lean_work_execution_world.test.ts
```

当前基线：**7 files / 50 tests PASS**；architecture 0 violations；public API 0 missing/changed/added。

### 架构约束

- `src/tools/controller.ts` LOC ratchet **4830**；当前约 **4822**。不要让它增长；需要新逻辑时放进 `src/work/read_model.ts` 或独立模块，Controller 只保留薄封装。
- `architecture:check` 的 hotspot 也约束 fanOut（controller 上限 39）。
- 不要把新逻辑塞进 Controller 来“省文件”。

### 全量 suite 的已知失败

全量 `npx vitest run` 在本地会有约 100+ failures，归因于：

- 30s timeouts under parallel load（PNWF/PWRS/PC1/LHAPE/CI3 等；顺序跑会过）
- dirty-tree historical guards（`ad_verification_integration` 要求 protected paths 无 `git diff HEAD`；提交后会过）
- 缺少本地 `python`（`inplace_execution`）
- DSH version drift（全局 `0.2.2-rc.1` vs 合格 `0.2.1-rc.5`）
- Windows cleanup / junction EACCES（R3 historical evidence guards）

**不要**用放宽断言来让全量变绿。先用顺序验收集确认产品路径。

### 真实 Host

```bash
bash scripts/pnwf/run_direct_governed_host.sh
node scripts/pnwf/isolation_gate.mjs --base="$HOME/pnwf-isolation" --json="$HOME/pnwf-isolation/isolation-gate.json"
```

DSH 合格版本：`@deepseek-ai/dsh@0.2.1-rc.5`，当前位于：

```text
C:\Windows\TEMP\dsh-021\node_modules\@deepseek-ai\dsh\lib\bin.js
```

全局安装可能是 `0.2.2-rc.1`（HR-27 drift）。脚本支持：

```bash
PNWF_DSH_BIN=... PNWF_DSH_MODULES=... bash ...
```

不要为了省事直接升级 DSH；升级必须重新验证 host boundary。

---

## 6. 付费模型实验状态（重要）

### 当前状态：预算耗尽 + 超支，禁止继续

| 项 | tokens |
|---|---:|
| 非 cohort adapter smoke（`CONTAINER_SMOKE`） | 1,495,807 |
| software session | 1,720,995 |
| energy session | 1,973,976 |
| **实际总计** | **5,190,778** |
| 原授权 | 5,000,000 |
| **超支** | **+190,778** |

- 2026-11-07 容器 cohort：**0/2 primary**，两次都 budget killed，`complete=0`、`conclude=0`、task ACTIVE、attempt RUNNING、promotions=0、head 未动。
- 结果 **INVALID**：
  1. 复制的 attempt world alternates 曾是绝对 Windows 路径，在 Linux 容器失效（已修为相对路径）。
  2. budget watchdog 看不到 in-flight usage；provider proxy 没有 pre-call token cap，导致超 ceiling。
  3. smoke 因 mock 端口被占用误打真实 proxy，1,495,807 tokens 已计入，未隐藏。
- 证据：`research-evidence/pnwf-cq/live/2026-11-07/`。

### 下次付费实验的前置条件（全部满足才可）

1. 在 provider proxy 增加 **per-session token cap**：解析 `message_delta.usage`，到 soft ceiling 拒绝/429，不能只靠 adapter 轮询 zstd。
2. 用修复后的 `prepare_continuation.mjs` 重新复制状态，确认 attempt world alternates 是相对路径。
3. 新的、明确的 owner 付费授权（当前 5M 已超支，没有剩余额度）。
4. 容器 adapter 使用合格 image；isolation gate `EVALUATION_ISOLATION_QUALIFIED`。
5. 先做 **0 付费** 的 mock smoke（mock 使用独立端口，且确认端口未被占用）。

**不要**用“均授权”自动推断新的付费授权；只覆盖当时列出的三项。

---

## 7. 已知未解决问题 / 建议下一步

按优先级：

1. **Provider-side token cap**（P0，付费实验前置）
   - `scripts/lhape/provider_proxy_tcp.mjs` 目前无 usage 限制。
   - 需要 per-session 计数；到 soft ceiling 时拒绝后续请求，并让 adapter 记录 `killedBy=budget`。
   - 修复后重新跑一次 0 付费 mock smoke。

2. **跨 Host settlement 残余风险**（P1）
   - 无 Invocation 记录时，principal 仍可结算；产品只保证 `UNATTRIBUTED` 与不声称退出。
   - 若要机械拒绝，需要显式 principal-authored declaration 或 durable writer marker；不要新增通用 liveness runtime。

3. **Operator identity federation**（P2）
   - 当前是本地 Ed25519 bearer credential；不是 IdP/SSO。
   - 远程部署应提供自己的 `OperatorAuthorityPort`。

4. **Clean container cohort**（P1，需新授权）
   - 修复 alternates + token cap 后，重新跑 2 个 stage；当前结果不能作为 CQ 效果证明。

5. **文档/证据一致性**
   - `docs/engineering/PNWF-CQ-RESULT.md` 是权威；如再改产品语义，必须同步更新 §3/§4/§7/§9/§10。
   - 证据目录不要事后修改原始 stream/state；新增分析放新目录或新文件。

---

## 8. 交接同步协议（必须遵守）

### 何时更新本文件

每次**重要更改**后，在同一次 commit 中更新本文件。重要更改包括：

- 合并/回滚 PR
- 修改 Work/Attempt/Settlement/Promotion/ProjectHead 权限语义
- 修改 `status` / `readiness` / `nextAction` 的模型可见语义
- 新增或改变付费实验、预算、authorization、cohort
- 改变 DSH 版本、isolation image、host boundary
- 改变测试基线（新增/删除 acceptance tests，已知失败归因变化）
- 发现并修复影响真实项目执行的产品缺陷

### 更新哪些 section

至少更新：

- §0 30 秒版本
- §2 Git 状态（`origin/main`、当前分支、工作树）
- §5 验证基线（如果测试数变化）
- §6 预算状态（如果发生任何付费调用）
- §7 未解决问题
- §9 变更日志（追加一行）

### 变更日志格式

```markdown
| 日期 | 变更 | 证据/PR | 备注 |
|---|---|---|---|
| 2026-11-07 | PR #227 merged: PNWF-CQ + basis admission | 1766a79 | 容器 cohort INVALID/over budget |
```

### 提交要求

- 本文件与代码/证据一起提交；不要只在本地改。
- 如果只更新 handoff，使用 `docs(handoff): ...`。
- 不要把本文件放进 `research-evidence/` 或临时目录。

---

## 9. 变更日志

| 日期 | 变更 | 证据/PR | 备注 |
|---|---|---|---|
| 2026-11-07 | PR #227 merged：PNWF-CQ action coherence、UNOBSERVED liveness、plan invalidation、journal 投影、isolation gate、评分修正、operator basis admission | `1766a79` | CI 全绿 |
| 2026-11-07 | 容器 cohort 执行 | `research-evidence/pnwf-cq/live/2026-11-07/` | **INVALID / +190,778 over budget**；禁止继续付费 |
| 2026-11-07 | 新增本 handoff | `docs/handoff` branch | 活文档 |

---

## 10. 给下一个 agent 的最短路径

1. 读本文件 §0–§3。
2. 读 `docs/engineering/PNWF-CQ-RESULT.md` 的 §1、§3、§6、§9。
3. `git fetch origin && git switch -c <branch> origin/main`。
4. `pnpm build && pnpm architecture:check && pnpm architecture:check-public-api`。
5. 跑 §5 的顺序验收集。
6. 如果任务涉及付费模型：先读 §6，**默认拒绝执行**，直到 token cap + 新授权就绪。
7. 改完代码/证据后更新本文件并提交。
