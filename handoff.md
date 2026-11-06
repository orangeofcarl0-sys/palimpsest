# HANDOFF — Palimpsest / palimpsest-sr1

> 给接手本项目的 agent。**先读完本文件，再动代码。**
> 本文件是活文档：每次重要更改（合并 PR、修改权限/结算语义、新增证据、改变测试基线、消耗或新增付费预算、变更 DSH 版本）后，必须同步更新本文件并在同一次提交中提交。

---

## 0. 30 秒版本

- 真正的仓库在 **`F:/Codex_Work_Space/Palimpsest/palimpsest-sr1`**。父目录 `F:/Codex_Work_Space/Palimpsest` **不是 Git 仓库**，不要在那里工作。
- 最近同步的正式主线：`origin/main` = **`b7460f3785406ba8ad3c1a4a5f19f275a38813ad`**（PR #230 合并，本次 handoff 同步的起点）。
  接手时先运行 `git rev-parse origin/main`，以实际值为准；不要把本行当成永久基线。
- 本地 `main` 被另一个 worktree 占用：`F:/Codex_Work_Space/DSH plugin/palimpsest-repo`。**不要**在这个 worktree 里 `git switch main`，也不要 reset/clean 其他 worktree。
- 本轮修复已通过 [PR #230](https://github.com/orangeofcarl0-sys/palimpsest/pull/230) 合并；原分支 `codex/project-takeover-20261107` 已完成。本次交接同步分支为 `codex/pnwf-r1-release-handoff`。新工作从确认的主线开分支：
  ```bash
  git fetch origin
  git switch -c codex/<your-branch> origin/main
  ```
- 最近完成：PNWF-CQ-R1 请求前预算预留、实际容器/World 资格、Mock 身份隔离、Operator/Head 最终复核、Direct→真实子进程 Worker→Settlement→Promotion→依赖续作。
- PR #230 的 14 个 CI job 首次运行全部成功：Linux 4,981 PASS / 33 SKIP、E2E 38/38、预算故障 20/20、Windows Host Boundary 通过。四个依赖外部 Host 的 gate 按既有环境条件跳过执行，不属于实测通过；详见 §5。
- **旧付费预算已耗尽且超支；owner 于 2026-11-07 已新授权启动付费模型调用。** 授权保留，但真实 Provider 上界尚未获技术资格，当前 runner 仍拒绝 paid execution。详见 §6。
- 当前 **所有 paid Provider 均未取得可执行单次计费上界资格，runner 明确拒绝付费执行**。20 项预算故障测试与 6 组真实 DSH 容器实验通过，只证明 Mock 合同；不能据此开启 paid cohort。

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

## 2. 当前 Git / 分支状态（2026-11-07，最近同步）

| 项 | 值 |
|---|---|
| 仓库 | `F:/Codex_Work_Space/Palimpsest/palimpsest-sr1` |
| `origin/main` | 以 `git rev-parse origin/main` 为准；最近同步 `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`（PR #230 merge） |
| PR #227 | MERGED at `1766a794a52fcdda323331429b6881d2b1dc8636`；CI 全绿（unit / e2e / host-boundary / gates / package-smoke） |
| PR #230 | MERGED at `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`；被检验 head `b1554f89ecfa0dacf98e7f52b3ddc677600da051`；14/14 check jobs SUCCESS，执行范围见 §5 |
| 交付分支 | 产品分支 `codex/project-takeover-20261107` 已合并；`codex/pnwf-r1-release-handoff` 从该合并点同步交接与 CI 证据 |
| 本地 `palimpsest-pnwf-action-coherence` | 已合并；tip `1c85407`，不要继续在该分支开发 |
| 工作树 | 本次交付提交后应 clean；以 `git status --short` 为准 |
| Node / pnpm | Node `24.14.1` / pnpm `11.21.0` |
| 平台 | Windows，PowerShell；Docker 中 Linux / DSH 0.2.1-rc.5 |

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
- 普通初始 `IN_SYNC` 不证明 Direct 成果。相等 Head 只有在 canonical approval 与 Direct basis revision 成对存在时才显示该语义提示。

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
  - Controller final owner 也必须通过部署配置的 `OperatorAuthorityPort`；任意 operator 字符串、缺失端口、agent 角色均拒绝
  - 目标必须是 checked-out HEAD、clean worktree、当前 ProjectIR head 的 descendant、promotion state 严格 `IN_SYNC`（`CONFLICT` 不得绕过）
  - task graph 必须不变（head-only）
  - 写 `MANUAL_APPROVAL_RECORDED` + `PROJECT_REVISED`，保留任务 reauthorize 到新 basis
  - 仍然只有一个 head owner：`ProjectController.planReconciled`
- 该 admission **不是** artifact acceptance，不是 promotion，不会产生 Worker Result。
- 本地 signed credential 不是 IdP/SSO；需要远程身份时由部署提供自己的 `OperatorAuthorityPort`。
- 同一 `appendAtomic` 的 `beforeCommit` 复核权限、HEAD、工作树和 promotion state；变化则整批回滚。原生 Git 观察留在 `unseen_inputs.ts`，注入 Head 规则。
- Git/SQLite 不是跨系统原子事务；最后读 Git 之后的外部漂移仍可能发生，已有执行 `HEAD_BASIS_MISMATCH` 拒绝后续工作。
- 零付费纵向验证已经覆盖两个真实 Node Worker、两次结算、一次 gate-gated promotion 和依赖任务从 promotion HEAD 续作；不等于真实模型自主闭环。

### 3.6 Execution world

- 自定义 Git port 的 world path 必须被 result exporter 尊重；`gitRepositoryWorldPort` 接受 `worldDir`。
- 复制 attempt world 时，`.git/objects/info/alternates` 必须是**相对路径** `../../../../../.git/objects`；绝对 host 路径在容器中会失效。
- `prepare_continuation.mjs` 仅准备新目录；实际 adapter 在本次 principal 容器内检查每个 live World 的对象、alternates、diff/status 和产品 observation，第一 Provider 请求前必须通过。

---

## 4. 关键文件索引

### 产品

- `src/domain/work_state.ts` — `WorkAttemptLiveness`, `WorkNextAction`, `semantic`, `explainWorkState`
- `src/work/read_model.ts` — status facts、`UNOBSERVED`、open-invocation 与 Direct approval/revision 观察；不构造 admission 事件
- `src/work/head.ts` — Head admission 规则与提交前 fence；通过注入观察复核，不直接读取 Git
- `src/work/plan_revision.ts` — plan invalidation/quiescence/receipt 构造；仍由 Controller 原事务写入
- `src/work/unseen_inputs.ts` — 只读 canonical Git basis 观察
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
- `test/pnwf_cq_basis_admission.test.ts` — 10 项：权限/CONFLICT/HEAD race/初始提示/CLI/真实子进程纵向链
- `test/lean_work_execution_world.test.ts` — custom Git port world root
- `test/odpe_outcome.test.ts`, `test/pwrs_relay.test.ts`, `test/pc1v1_next_action.test.ts` — 关键回归

### 报告 / 证据

- `docs/engineering/PNWF-CQ-RESULT.md` — 本阶段完整报告（含无效 cohort 与超支）
- `docs/engineering/PNWF-CQ-R1-QUALIFICATION.md` — 本轮零付费资格、边界和复现；§5 区分初轮失败与修复后回归
- `research-evidence/pnwf-cq-r1/2026-11-07/` — 新预算测试、六组实际容器、产品回归、纵向事件与诊断失败留档
- `research-evidence/pnwf-cq-r1/2026-11-07/release-ci.json` — PR #230 的被检验 head、合并 SHA、远程检查与明确跳过项；独立于发布前的 `verification.json` 快照
- `docs/engineering/PNWF-LIVE-TRAJECTORY.md` — 上一阶段 live trajectory 分析
- `research-evidence/pnwf-cq/2026-11-06/` — 确定性 evidence + 真实 host direct-governed
- `research-evidence/pnwf-cq/live/2026-11-07/` — **INVALID / OVER BUDGET** 容器 cohort
- `research-evidence/pnwf/live/2026-11-06/` — 上一阶段已授权 real-model cohort

### 脚本

- `scripts/pnwf/run_direct_governed_host.sh` — 真实 DSH Direct→Governed（含 operator CLI）
- `scripts/pnwf/isolation_gate.mjs` — 旧独立 canary；其 JSON 不是当前 runner 的执行许可
- `scripts/pnwf/container_adapter.mjs` — 容器内 principal session adapter
- `scripts/pnwf/prepare_continuation.mjs` — 复制 recorded state + 相对 alternates
- `scripts/pnwf/score_continuation.mjs` — 机械评分（stream/ledger/exit/domain refusals）
- `scripts/psvr/session_attribution.mjs` — 逐调用归因
- `scripts/pnwf/execution_budget.mjs` / `bounded_provider.mjs` — 请求前 session/cohort 预留、终态结算、未知保留；当前只接受明确 Mock 合同
- `scripts/pnwf/container_runtime.mjs` / `container_bridge.mjs` / `world_preflight.mjs` — 本次实际容器资格、network=none 的固定 stdio 出口、World 验证
- `scripts/pnwf/qualify_execution.mjs` / `qualification.test.mjs` — 真实容器六场景与 20 项轻量故障测试
- `scripts/lhape/provider_proxy_tcp.mjs` — 兼容文件名，旧凭证环境启动方式现已拒绝；不能继续无预算转发

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

本轮原验收集为 **7 files / 57 tests**。扩大回归的初轮为 11 files / 97 PASS / 1 FAIL（Head owner 不得读取 Git 的职责断言）；修复后受影响的 Basis/Head 两文件 **20/20 PASS**，其他 78 项在原批次通过。不要把它写成单次 98/98。architecture 0 violations；public API 0 missing/changed/added；构建通过。

补充命令：

```powershell
node --test scripts/pnwf/qualification.test.mjs
node scripts/pnwf/qualify_execution.mjs --out=<新的证据目录>
node node_modules/vitest/vitest.mjs run test/pc1v1_operator_identity.test.ts test/w_revision_safe.test.ts test/x_project_head.test.ts test/architecture/sr2b2_head_owner.test.ts --maxWorkers=1 --fileParallelism=false
```

结果：20/20 请求故障测试；6/6 实际容器场景；16/16 实例 canary。容器复现需要现存 PSVR recorded sources 和本地 image；不自动下载或伪造源数据。可用镜像 digest：`sha256:ebf870ae77228fa819a332add9d0ba9f1aefc404c0088ea3f6bb28030a0adef0`。

轻量请求故障测试已接入 CI unit job。PR #230 在 head `b1554f89ecfa0dacf98e7f52b3ddc677600da051` 上的三套工作流、14 个 job 首次运行全部成功，无需重跑或放宽断言。2026-11-07 全绿后合并为 `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`。

| 远程验证 | 实际结果 | 运行 |
|---|---|---|
| Linux CI | 预算故障 20/20；Vitest 423 PASS / 2 SKIP 文件，4,981 PASS / 33 SKIP 测试；E2E 38/38；构建、architecture、public API 通过 | [42309132630](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132630) |
| R0 | 六个 E gate 与 package-smoke 实际通过；D2/D4/D5 与 D5 reliability 因未配置外部 DSH 环境而跳过执行，绿色 job 不等于这些 gate 实测通过 | [42309132640](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132640) |
| Windows Host Boundary | R1-H 17 PASS；R1-HR 45 PASS / 2 LIMIT；R1-HC 26 PASS / 1 LIMIT；clean-env 10 PASS；architecture / public API 通过，均 0 FAIL | [42309132623](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132623) |

Windows 既有残余边界仍明确保留：HR-39b 不保证多个 ACTIVE world 的原生代码互读隔离；HR-33 不保证兄弟 world 名称的元数据保密；HC-27 当前 confidential profile 串行化 ACTIVE worker，不支持并行 ACTIVE confidential worker。此次 CI 没有把 LIMIT 改成 PASS，也没有运行付费模型。

机器发布记录为 [release-ci.json](research-evidence/pnwf-cq-r1/2026-11-07/release-ci.json)。它只记录上述 PR head 的检查和产品合并；后续交接提交的 CI 以对应 PR 为准，不能复用旧 head 的绿灯。

本机 PATH 过长，cmd/pnpm 子进程可能报找不到 node/tsc。仅在当前进程临时缩短 PATH，或用 `node node_modules/typescript/lib/tsc.js -b`、`node node_modules/vitest/vitest.mjs`；不要修改全局环境或为此升级依赖。

### 架构约束

- `src/tools/controller.ts` LOC ratchet **4830**；不要提高上限。Controller 只保留薄封装，规则放回相应 owner；不能为了 LOC 把写入规则塞进 `read_model.ts`。
- `architecture:check` 的 hotspot 也约束 fanOut（controller 上限 39）。
- 不要把新逻辑塞进 Controller 来“省文件”。

### 本地 Windows 全量 suite 的历史失败

此前全量 `npx vitest run` 在本地出现约 100+ failures，历史归因包括：

- 30s timeouts under parallel load（PNWF/PWRS/PC1/LHAPE/CI3 等；顺序跑会过）
- dirty-tree historical guards（`ad_verification_integration` 要求 protected paths 无 `git diff HEAD`；提交后会过）
- 缺少本地 `python`（`inplace_execution`）
- DSH version drift（全局 `0.2.2-rc.1` vs 合格 `0.2.1-rc.5`）
- Windows cleanup / junction EACCES（R3 historical evidence guards）

**不要**用放宽断言来让全量变绿。先用顺序验收集确认产品路径。

本轮远程 Linux 全量结果已单独列于上表；它不代表这些本地 Windows 历史问题已经逐项消除。远程 Windows 工作流验证 Host Boundary，并不执行完整 Vitest suite。

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

### 当前状态：旧预算超支；新授权已收到，技术资格仍未满足

Owner 在本轮发布指令中明确表示“授权启动付费模型调用”（2026-11-07）。这是一项新的有效授权，不应再次请求同一权限；没有据此将旧 5M 额度恢复或把历史 cohort 改判有效。当前指令未指定新 cohort 的量化 ceiling，尚未初始化任何 paid ledger。发布/CI 工作不需要模型调用，本轮新增 paid calls 仍为 0。实际启动前仍需落实具体可执行预算和 Provider 技术资格。

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
- PNWF-CQ-R1 新增付费调用 **0**；历史金额、INVALID 裁定和原始证据不变。

### 下次付费实验的前置条件（全部满足才可）

1. 具体真实 Provider/模型/兼容路径取得**可执行的单次输入与输出计费上界**。当前没有，所有 paid 执行被代码拒绝。末尾 usage 后再 429 不构成硬上界；定时 watchdog 也不是。
2. 每个请求先持久预留 session/cohort 额度，pending 全计入；未知 usage 保留预留并停止后续 session。当前实现只在确定性 Mock 合同下完成资格。
3. 新的 owner 付费授权已经在 2026-11-07 收到。实际运行需把具体 session/cohort ceiling 写入新 ledger；旧 5M 不能复用，新授权不改变 Provider 技术资格未满足的事实。
4. 本次实际 adapter/container 的 uid/network/mounts/canary/World 校验通过；不能借旧隔离 JSON。Principal 不得有可绕过代理的付费出口。
5. 同一运行链路先通过 **0 付费** 的身份/端口冲突、晚 usage、并发、中断、大请求/响应和精确计数测试。

此前“均授权”仅覆盖历史三项；本轮明确的新授权单独记录于上文，不得与旧额度混算。

---

## 7. 已知未解决问题 / 建议下一步

按优先级：

1. **真实 Provider 上界资格**（P0，付费实验前置）
   - 请求前预留、Mock 身份和实际容器故障链已实现并验证。
   - DeepSeek 兼容路径的 `max_tokens` 不能直接视为已证明上界；真实输入 token 上界也需明确证明。
   - 当前 `PROVIDER_BOUND_UNQUALIFIED` 是明确拒绝，不能通过配置或新授权绕过。

2. **跨 Host settlement 残余风险**（P1）
   - 无 Invocation 记录时，principal 仍可结算；产品只保证 `UNATTRIBUTED` 与不声称退出。
   - 若要机械拒绝，需要显式 principal-authored declaration 或 durable writer marker；不要新增通用 liveness runtime。

3. **Operator identity federation**（P2）
   - 当前是本地 Ed25519 bearer credential；不是 IdP/SSO。
   - 远程部署应提供自己的 `OperatorAuthorityPort`。

4. **真实模型产品闭环**（P1，需先满足 §6 全部条件）
   - 本轮 Direct→治理纵向链使用确定性真实子进程，不能外推自主模型行为。
   - 历史 INVALID cohort 不能作为 CQ 效果证明；未来合格运行再讨论产品收益。

5. **外部原生 HEAD 并发**
   - 提交前读取以前的变化可阻止并回滚；最后一次 Git 读取后的外部变化不能与 SQLite 原子封锁，后续执行 fence 会拒绝漂移。

6. **文档/证据一致性**
   - 历史报告为 `PNWF-CQ-RESULT.md`；当前资格为 `PNWF-CQ-R1-QUALIFICATION.md`。历史 §6 已统一为先 NOT_EXECUTED、后 EXECUTED/INVALID 的时间线。
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
| 2026-11-07 | 新增本 handoff；PR #228 merged | `7658527` | 活文档 |
| 2026-11-07 | 同步 origin/main 到 handoff merge；说明 SHA 需现场核实 | `docs/handoff-sync` | 防止把快照当永久基线 |
| 2026-11-07 | PNWF-CQ-R1：请求前预算预留、Mock/实际容器/World 资格；Operator/HEAD 复核与职责归位；真实子进程纵向治理链 | `docs/engineering/PNWF-CQ-R1-QUALIFICATION.md`；`research-evidence/pnwf-cq-r1/2026-11-07/` | 新增 paid calls 0；20 项预算测试、6 组容器场景；真实 Provider 仍 BLOCKED |
| 2026-11-07 | Owner 授权推送、创建 PR、跟进并修复 CI、全绿后合并及更新 handoff；另明确授权启动付费模型调用 | 本轮用户指令 | 新付费授权有效；尚无新量化 ledger，Provider 技术资格仍 BLOCKED，发布/CI paid calls 0 |
| 2026-11-07 | PR #230 在 14/14 CI job 成功后合并；同步真实 merge SHA、Linux 全量/E2E/Windows 结果和跳过项 | [PR #230](https://github.com/orangeofcarl0-sys/palimpsest/pull/230)；`b7460f3`；`release-ci.json` | 首次 CI 无失败、无重跑；四个 Host-dependent gate 未执行；新增 paid calls 0 |

---

## 10. 给下一个 agent 的最短路径

1. 读本文件 §0–§3。
2. 读 `PNWF-CQ-R1-QUALIFICATION.md`，并读历史 `PNWF-CQ-RESULT.md` 的 §6/§9。
3. 检查当前分支和工作树；本轮产品修复已通过 #230 合并。新工作先 fetch，再从当前主线开 `codex/` 分支。
4. `pnpm build && pnpm architecture:check && pnpm architecture:check-public-api`。
5. 跑 §5 的顺序验收集。
6. 如果任务涉及付费模型：先读 §6；owner 新授权已经收到，实际执行仍需真实 Provider 上界资格、实际隔离与新量化 ledger 全部就绪。
7. 改完代码/证据后更新本文件并提交。
