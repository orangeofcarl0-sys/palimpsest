# HANDOFF — Palimpsest / palimpsest-sr1

> 给接手本项目的 agent。**先读完本文件，再动代码。**
> 本文件是活文档：每次重要更改（合并 PR、修改权限/结算语义、新增证据、改变测试基线、消耗或新增付费预算、变更 DSH 版本）后，必须同步更新本文件并在同一次提交中提交。

---

## 0. 30 秒版本

- 真正的仓库在 **`F:/Codex_Work_Space/Palimpsest/palimpsest-sr1`**。父目录 `F:/Codex_Work_Space/Palimpsest` **不是 Git 仓库**，不要在那里工作。
- `main` 是唯一常驻分支。日常保留一条工作分支，并行工作上限为三条。分支归并、R3-A2 导入与历史引用恢复入口见 [分支清单](docs/engineering/repository/ACTIVE-BRANCHES.md)。
- 主线归因改写、切换后 CI 和旧 SHA 查找见 [§2](#主线归因与-sha-映射)。
- 自提交先启用仓库 `commit-msg`。主线逐个检查 PR 引入的提交归因，发布使用 rebase 合并。 [归因门禁](docs/engineering/repository/COMMIT-ATTRIBUTION.md)
- 2026-11-09 在 `codex/energy-project-continuity` 启动同一 energy 项目的三会话实验。首轮两组 Mock 资格 6/6。真实 Palimpsest T1 交付 `4cf360d5620fa10df5022c777aa0ed83c312a80a` 后自然退出，19 笔请求共 535,044 tokens。独立判分修复站点全名与缩写的等价归一化后，同提交离线复算 45/45，通过时新增付费请求为 0。所有者已核准 T2 基线 `8041871314136d417b285a800265858757463f68`。[报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md) · [机器证据](research-evidence/pnwf-energy/2026-11-09/continuity.json)
- Energy 首轮真实 T2 因 Worker 改写证书被宿主拦截。修复统一了 Work 与宿主的五文件范围，证书保持逐字节不变。后续两次观察分别为原生 Subagent 偏离（业务复核 45/45，缺少正式结算）和正式 Worker 结算后 Principal 达到 64 笔上限（业务 45/45，缺少等待结论）。[T2 报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-写范围修复与复跑)
- 等待式变体的 Palimpsest 真实闭环 3/3：T2 正式 Worker 候选 `e2bc1a424a30123213708990394fc8b19e18c445` 获所有者核准，Promotion 后 HEAD 为 `7aed12ea8618533c7acba5b1c8a4f60e8c1c97ce`；T3 从该 HEAD 提交采购摘要 `02fdf9c3aa3e2821e7fe32f82bd7e3b768baf234` 并自然退出。[复验报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#等待与结算引导的定向复验)
- 强原生 DSH 真实闭环也为 3/3。所有者核准 `ba95fd0e384b1523170ebc41d125b072fd94941e` 后原生组快进到该 SHA，T3 从该版本提交摘要 `7ee3971ab8348a1c028a05520bc797cc8672c9b0` 并自然退出。[对比报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#配对结论) · [机器证据](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json)
- Bench 树与 README 导航已合入主线，改写后对应提交为 `234be03cd82de55455a8a316fec66b8886d26cf9`。合并前 14/14 个 CI job 通过。导航入口见 §4。[PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242)
- Software 和 energy 的 readiness 定向观察证据、报告和 handoff 已合入主线，改写后对应提交为 **`666b4446c0649b7a3f425f1291fff99b6f97a2bf`**。合并前 14/14 个 CI job 通过。[PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239)
- 本地 `main` 被另一个 worktree 占用：`F:/Codex_Work_Space/DSH plugin/palimpsest-repo`。**不要**在这个 worktree 里 `git switch main`，也不要 reset/clean 其他 worktree。
- 按量记账续作和轨迹归因修复已通过 [PR #232](https://github.com/orangeofcarl0-sys/palimpsest/pull/232) 合并。新工作从确认的主线开分支。
  ```bash
  git fetch origin
  git switch -c codex/<your-branch> origin/main
  ```
- 最近完成：PNWF-CQ-R1 请求前预算预留、实际容器/World 资格、Mock 身份隔离、Operator/Head 最终复核、Direct→真实子进程 Worker→Settlement→Promotion→依赖续作。
- PR #230 的 14 个 CI job 首次运行全部成功：Linux 4,981 PASS / 33 SKIP、E2E 38/38、预算故障 20/20、Windows Host Boundary 通过。四个依赖外部 Host 的 gate 按既有环境条件跳过执行，不属于实测通过；详见 §5。
- `package-smoke` 遇到连续的 Ordarium 发布包下载 504 时，最后一次安装尝试通过 GitHub 官方资产 API 获取原包并核对锁文件 SHA-512。验收范围见 §5。
- Owner 于 2026-11-07 授权付费调用，2026-11-08 允许不设计费上限。本轮使用显式 `paid-usage-only` 模式，按终态 usage 记账并保留实际容器资格要求。历史 5M cohort 的结果和本轮实验范围见 §6。
- 2026-11-08 software 续作自然退出，27 个真实请求全部结算，共 982,857 tokens。记录 DELIVER，三项旧任务退役，HEAD 保持起始提交，promotion 为 0。主判据 1/1。
- 软件轨迹重算配对 31/31 个结果，两次 `NOT_READY` 原因分别为 `UNCOMMITTED_WORK` 和 `NO_SETTLEABLE_DELTA`。失败探针作业 1 次，同因重复拒绝 0 次，无进展调用 3 次。[重算证据](research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json)
- 2026-11-08 energy 沿用记账和终止条件，29 个请求全部结算，共 987,987 tokens。归因配对 43/43，`takeover` 被 `NO_SETTLEABLE_DELTA` 拒绝，过早 `plan` 触发 `quiescence_required`，转 `successor` 后修订并记录 DELIVER。自然退出，主判据 1/1。[对比报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md) · [Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)
- 修复两条轨迹在退役后收到的 `readiness CONTINUE_WORK`。退役计划的声明产物已提交且 episode 无交付阻塞时，`readiness` 返回 `SEMANTIC_JUDGEMENT`，提示模型确认成果后调用 `conclude DELIVER`。[修复与回归](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导)
- 从修复后的主线各复跑一条 software 和 energy。两条均在退役后验证并直接 `conclude DELIVER`，随后自然退出。两条退役后 `readiness` 调用均为 0，新提示采用情况为 `NOT_EXERCISED`。本轮 55 个请求全部结算，共 2,462,728 tokens。[复跑对比](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#readiness-修复后的真实模型复跑) · [机器证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)
- 从已退役、尚无交付的两份状态做定向观察。两条都先查 `readiness`、收到新提示，在后续模型步骤记录 `DELIVER` 并自然退出。人工 prompt 只要求先查，Host 自动附加常规 `pulse` 引导。30 个请求全部结算，共 756,492 tokens。[定向报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察) · [机器证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

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

## 2. 当前 Git / 分支状态（2026-11-09，最近同步）

| 项 | 值 |
|---|---|
| 仓库 | `F:/Codex_Work_Space/Palimpsest/palimpsest-sr1` |
| `origin/main` | 本地已核验的 energy 实验起点为 `112a7b50c25639ec5586afd170e9f7f311c561ba`；归因改写基线为 `0d7516488013e8f36883fd7ee27ef7deb8104bd2` |
| Energy 工作分支 | `codex/energy-project-continuity`，本轮代码、报告和证据在本地交付 |
| PR #227 | MERGED at `1766a794a52fcdda323331429b6881d2b1dc8636`；CI 全绿（unit / e2e / host-boundary / gates / package-smoke） |
| PR #230 | MERGED at `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`；被检验 head `b1554f89ecfa0dacf98e7f52b3ddc677600da051`；14/14 check jobs SUCCESS，执行范围见 §5 |
| PR #231 | MERGED at `4d5d9704e902d33b1380bf5a1df85dc39541935b`，PR 与合并后主线均为 14/14 check jobs SUCCESS |
| PR #232 | MERGED at `fd341c1b9cd4c7c245e0f2ee79d3269b83118f24`，已验证 head `8ceb48f2f0a8f1cba957d3b55198b1772b52ff04`，14/14 check jobs SUCCESS |
| PR #233 | MERGED at `fdd5308bf45e699058ecae86fcfb573e250e4e69`，同步 #232 的发布 handoff，14/14 check jobs SUCCESS |
| PR #234 | MERGED at `dbaaa0e6f2b03a1c4a7c6b322a8ae9404c28c44e`，已验证 head `98806d74310882d0bd237fce35a4fcefe25780b5`，14/14 check jobs SUCCESS |
| PR #235 | MERGED at `c827ef055a381988737c4e44c690f206447218dc`，同步 energy 交付记录，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| PR #236 | MERGED at `e5312cc5d81b5ada6f4a1015f8d00f9c557beb85`，修复退役后的 readiness 引导，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| PR #237 | MERGED at `987bab01f8aaaf04954eaedb434409b7a15c2631`，已验证 head `7402e5f37c4464d81baa6f111218043a913d48c8`，14/14 check jobs SUCCESS |
| PR #238 | MERGED at `5588cf9da6189dbe2b7cb121a188677b13113713`，同步复跑发布 handoff，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| [PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239) | MERGED at `00c5f46d69683ee75f3b74d44f184c0b7a19ac23`，已验证 head `ba2a245d7114df55d510da27f9ee9c1e02b22e04`，14/14 check jobs SUCCESS |
| [PR #240](https://github.com/orangeofcarl0-sys/palimpsest/pull/240) | MERGED at `86483ad40ef2659935a4085fd11025de768f4fc1`，同步 handoff 和 504 重试，合并前 14/14 check jobs SUCCESS |
| [PR #241](https://github.com/orangeofcarl0-sys/palimpsest/pull/241) | MERGED at `0f7dc1308060d6880eb8dbdc65581fe8e5ebf2b4`，发布包 504 恢复路径通过 PR 与主线 14/14 个 CI job |
| [PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242) | MERGED at `ca3e67661730f157acafe2c999afbac5b83459b2`，已验证 head `1f75c1cf2599a82bac680f6dbf4ae2bff6df33d8`，14/14 check jobs SUCCESS |
| 分支恢复 | 项目目录下 `branch-archives/2026-11-08-1560db0/` 保存清理前的 Git bundle、已验证镜像及原引用清单 |
| 工作树 | 本次交付提交后应 clean；以 `git status --short` 为准 |
| Node / pnpm | Node `24.14.1` / pnpm `11.21.0` |
| 平台 | Windows，PowerShell；Docker 中 Linux / DSH 0.2.1-rc.5 |

注意：`package.json` 声明 Node `>=24.15.0`，本机是 `24.14.1`，pnpm 会打 engine warning；当前构建/测试可用，但不要据此升级依赖或忽略其他 engine 错误。

### 主线归因与 SHA 映射

2026-11-08 从 `87e14286ff5ab50f2a6678340f8f4c2f734e75c1` 切换到上表的归因改写基线。21 个测试署名提交的作者与提交者沿用 `orangeofcarl0-sys` 的 Git 姓名和邮箱，10 个 G10 提交移除了 Claude 共同作者尾注。逐一核验了 1,139 个提交的文件树和父链。854 个提交获得新 SHA，285 个保留原 SHA。171 个旧签名随提交改写失效。9 个历史标签保留原对象与指向，其中 6 个仍可追溯到带 Claude 尾注的原提交。

切换后恢复了 `main-protection` 的原始规则和空放行列表。改写基线的三套工作流共 14/14 个 job 成功，R0 中 4 个依赖外部 DSH 的实测步骤按原环境条件跳过。[主线保护](https://github.com/orangeofcarl0-sys/palimpsest/rules/23655367) · [Linux unit / e2e](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882339) · [R0 Gates](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882338) · [Windows Host Boundary](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882351)

CI 通过后，GitHub 贡献图与具名 Contributors API 均只列出 `orangeofcarl0-sys`。逐一核对了 GitHub 对上述 31 个提交的署名。[Contributors](https://github.com/orangeofcarl0-sys/palimpsest/graphs/contributors)

查找旧 SHA 时，用完整原 SHA 查询 TSV 的第一列，第二列是新主线上文件树相同的提交。表中只列出 854 个改写提交。上表的历史 PR、CI 记录和归档实验保留当时的实际 SHA。新导航和源码链接使用改写后的 SHA。[提交映射](repository-audit/main-rewrite-2026-11-08.tsv)

本机回溯原提交对象使用已验证的完整 bundle `../branch-archives/2026-11-08-before-attribution-rewrite-87e1428/original-main.bundle`，其中 `refs/audit/original` 指向切换前的主线。

### 提交归因门禁

共享校验器和本地 hook 已通过 PR #246 合入 `1d76b2798e84691dff207ebbf08d4f61e9c1e119`。本检出已配置 `core.hooksPath=.githooks`。新克隆按归因门禁文档启用 hook。[PR #246](https://github.com/orangeofcarl0-sys/palimpsest/pull/246) · [归因门禁](docs/engineering/repository/COMMIT-ATTRIBUTION.md)

`main-protection` 强制 GitHub Actions 发布的 `commit-attribution`，并保留 `unit` 和 `e2e`。PR 必须基于最新主线，通过 rebase 合并。线性历史规则拦截手工合并提交，`main-publisher` 仅允许仓库所有者通过 PR 发布。记录新验收结果时取 rebase 后的主线 SHA。[主线保护](https://github.com/orangeofcarl0-sys/palimpsest/rules/23655367) · [发布权限](https://github.com/orangeofcarl0-sys/palimpsest/rules/26806204)

远端负向验证用 `--no-verify` 把混合大小写共同作者尾注和未授权邮箱写入中间提交，PR 的最后一个提交干净。主线版校验器在该 head 上报告失败并指出两项违规。修复后的 PR #247 全绿，通过合并 API 以精确 head 执行 rebase，落地为 `8418571d1e42e9cf7a391c1c1c39ce425aab1410`。实际提交消息与通过检查的候选一致。发布者规则可能让 `gh pr merge` 的预检显示 `BLOCKED`，按文档使用已实测的合并 API。[远端拒绝记录](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42507662604) · [PR #247](https://github.com/orangeofcarl0-sys/palimpsest/pull/247)

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
- 退役后通过 `readiness` 核对被移除任务的声明产物、当前提交和 `conclude` 共用的 episode 阻塞事实。产物已提交且无阻塞时给出 `SEMANTIC_JUDGEMENT` 与 `conclude DELIVER` 路径，当前 `DELIVER` 已记录时引导回复。

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

- [Bench 树](docs/engineering/README.md#bench-树) — 发布门禁、八条研究线和证据入口，含 software 与 energy 的用例、续作起点和两种 readiness 观察。
- `docs/engineering/PNWF-CQ-RESULT.md` — 本阶段完整报告（含无效 cohort 与超支）
- `docs/engineering/PNWF-CQ-R1-QUALIFICATION.md` — 本轮零付费资格、边界和复现；§5 区分初轮失败与修复后回归
- `docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md` — 按量记账合同、software 与 energy 的模型行为、拒绝、恢复和用量对比
- [Energy 三会话闭环](docs/engineering/ENERGY-PROJECT-CONTINUITY.md) — 首版交付、更正后的 Work 修订与晋升、原生对照；[机器证据](research-evidence/pnwf-energy/2026-11-09/)
- `research-evidence/pnwf-cq-paid/2026-11-08/` — 修复前后与定向观察共六条按量记账轨迹的逐请求用量、归因与原始文件摘要
- `research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json` — 修复后两条真实复跑、逐请求对账、退役窗口与前后对比
- `research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json` — 已退役且交付未记录状态的定向观察，含提示、调用顺序和逐请求对账
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
- `scripts/pnwf/energy/run.mjs` / `scripts/pnwf/summarize_energy.mjs` — 三会话资格、按 SHA 执行接受与可复算证据
- `scripts/pnwf/prepare_continuation.mjs` — 复制 recorded state + 相对 alternates
- `scripts/pnwf/score_continuation.mjs` — 机械评分（stream/ledger/exit/domain refusals）
- `scripts/psvr/session_attribution.mjs` — 逐调用归因
- `scripts/pnwf/execution_budget.mjs` / `bounded_provider.mjs` — 硬预算 Mock 预留与显式付费按量记账。请求先登记，终态结算，未知保留并停止准入
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

Energy T2 范围修复：`node --test scripts/pnwf/energy/contract.test.mjs scripts/pnwf/qualification.test.mjs scripts/psvr/session_attribution.test.mjs` 通过 33/33；构建、架构和公共 API 检查通过。回归包含委派前拒绝六文件计划、Worker 上下文范围检查、证书越界、错 SHA 接受，以及在一次宿主查询中等待结算并提示下一动作。

最终等待式变体的两组 Mock 6/6，29 笔请求全部对账，付费请求为 0。真实会话在通过相同的零付费资格之后才启动。

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

2026-11-08 的本地按量记账验证通过 24/24 请求测试（原 20 项和新增 4 项）、6/6 零付费容器场景、build、architecture 与 public API 检查。Mock 与付费容器使用相同镜像及 adapter 文件摘要。实际付费容器通过 16/16 canary 和复制 World 预检。[机器证据](research-evidence/pnwf-cq-paid/2026-11-08/software.json)

轨迹归因修复后，4/4 归因测试及 24/24 请求测试通过。CI unit job 运行 `node --test scripts/psvr/session_attribution.test.mjs`。真实轨迹离线重算通过 8 个原始文件的摘要验证，原始计量和产品事实与重算一致。评分器的 `--out` 与 `--attribution-dir` 可为重算指定独立目录。[重算证据](research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json)

Energy 执行前重新通过 24 项请求测试、4 项归因测试和 build。六个零付费容器场景沿用同镜像及八个 adapter 文件摘要的既有资格，实际 energy 容器独立通过 16 项检查和复制 World 预检。两条轨迹的终态用量与账本逐请求一致。[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

`test/pnwf_product.test.ts` 增加 software 和 energy 退役状态的正常工具回归，并覆盖产物缺失、未提交及仍有开放任务的边界。两份计划在旧版复现 `CONTINUE_WORK`，修复后提示 `conclude DELIVER`。六个相关测试文件共 59 项通过，构建、架构和公共 API 检查通过。另用原始 Work SQLite、Git 与 journal 前缀的独立副本离线复核，两条轨迹均能记录 `DELIVER`，8 项和 6 项产物证明与原记录一致。新增付费请求 0。[回归用例](test/pnwf_product.test.ts) · [离线复核](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导)

真实复跑在 `e5312cc` 重新通过 28 项脚本测试、构建、六个零付费容器场景，以及两次各 16 项实际隔离检查。首轮 `F:` 绑定失败发生于 Mock 请求前，随后改用 `C:` 的同提交执行副本，关键构建文件、镜像和 adapter 摘要相符。[复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

定向观察在 `5588cf9` 构建并通过 28 项脚本测试。两个 Mock 用独立副本验证下一模型请求带有 `readiness` 新提示，付费请求 0。两条真实会话分别通过 16 项隔离检查和一项复制 World 预检，原始 Work 与 journal 摘要在复制和运行前后相符。[定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

R3-A2 导入保留三项原始提交及冻结的用例、资格计划和运行证据。本地 TypeScript 构建与两个定向测试文件共 116 项通过。历史资格结论为四组 `UNQUALIFIED`。[资格结果](docs/engineering/R3-A2-SENTINEL-PORTFOLIO-RESULT.md)

PR #242 的 14 个 job 首次运行全部通过。Linux CI 通过 28 项脚本测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与真实下游安装通过，D2、D4、D5 与 D5 reliability 步骤因外部 DSH 环境未配置而跳过。Windows Host Boundary 和 clean-env 通过。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204750) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204837) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204867)

PR #239 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与 package-smoke 通过。D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 的 R1-H 为 17 PASS，R1-HR 为 45 PASS / 2 LIMIT，R1-HC 为 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960362) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960372) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960477)

`00c5f46` 的主线 CI 与 handoff PR #240 的首个提交均在 `package-smoke` 下游安装时遇到 Ordarium 发布包下载 HTTP 504。现有三次安装尝试已把 pnpm 的 `ERR_PNPM_FETCH_504` 纳入可重试错误，验收仍要求真实安装成功并验证公共入口。404 等确定性解析错误继续直接报错。[主线失败日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42464959904/attempts/1) · [PR 首次失败日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42465099471)

PR #240 的最后一次安装尝试通过，`00c5f46` 的失败 job 单独重跑后也通过。`86483ad` 的主线 `package-smoke` 在三次 CI 运行中均耗尽安装重试，终态均为 Ordarium 发布包下载 504。若第二次安装仍遇到这个终态，最后一次尝试改用 GitHub 官方资产 API 下载同一发布包，逐包校验 `pnpm-lock.yaml` 的 SHA-512 后才更新临时消费者配置。后续实际安装、治理会话及七个公开入口检查均已在独立临时目录验证。[历史主线重跑](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42464959904/attempts/2) · [连续 504 日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42466550587/attempts/3)

PR #237 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 和 package-smoke 通过，D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 的 R1-H 为 17 PASS，R1-HR 为 45 PASS / 2 LIMIT，R1-HC 为 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082427) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082437) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082407)

PR #234 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,981 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与 package-smoke 通过，D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 通过，R1-H 17 PASS，R1-HR 45 PASS / 2 LIMIT，R1-HC 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214180) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214270) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214078)

PR #232 在 14/14 个 job 成功后合并。Linux CI 通过 28 项脚本测试、4,981 项 Vitest 测试（33 项跳过）与 38 项 E2E 测试，架构和公共 API 检查通过。R0 六个 E gate 与 package-smoke 实际通过。D2、D4、D5 与 D5 reliability 的 gate 步骤按现有外部 Host 条件跳过。Windows Host Boundary 通过。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438699006) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438698982) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438698980)

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

### 修复前按量记账

Owner 于 2026-11-07 授权启动付费模型调用，2026-11-08 允许不设计费上限，随后明确授权一条同条件的 energy 续作。software 和 energy 分别使用全新单会话 cohort、独立账本及 `--mode=paid-usage-only`。金额与 token 总量上限为 `null`，每轮最多 64 次请求、30 分钟，单请求等待终态最多 240 秒。[执行与复现](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md)

Software 续作实际执行 4 分 51 秒，27 个请求全部结算，共 982,857 tokens（fresh input 33,921，cache read 934,912，cache creation 0，output 14,024），逐请求与 DSH 轨迹一致。记录 DELIVER、任务退役及原 Attempt 取消，HEAD 保持起始提交，promotion 为 0，主判据 1/1。

Energy 续作实际执行 157.052 秒，29 个请求全部结算，共 987,987 tokens（fresh input 31,412，cache read 944,512，cache creation 0，output 12,063），逐请求与 DSH 轨迹一致。记录 DELIVER、`decision-package` 转 STALE、原 Attempt 转 CANCELLED，HEAD 保持 `e631160`，promotion 为 0，主判据 1/1。两次按量记账运行合计 56 个已结算请求、1,970,844 tokens，未结算请求为 0。[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

### Readiness 修复后的按量复跑

Owner 授权从两个原始状态各重跑一条，沿用金额与 token 总量上限 `null`，每条 64 次请求、30 分钟会话与 240 秒单请求等待。两个新 cohort 各复制原状态和 prompt。Software 29 个请求、1,394,801 tokens，energy 26 个请求、1,067,927 tokens。本轮 55 个请求全部结算，共 2,462,728 tokens，终态账本逐请求与 DSH 相符。修复前后四条按量记账轨迹累计 111 个结算请求、4,433,572 tokens。[复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

两次复跑均退役旧图并记录 `DELIVER`，自然退出，主判据 2/2。修复前后的 DSH 时间为 software 260.505 → 162.069 秒，energy 126.927 → 150.026 秒。两条从退役到退出的时间缩短，且两条都跳过了退役后的 `readiness` 查询。归因结果把整条轨迹变化与新提示采用分开记录。[复跑对比](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#readiness-修复后的真实模型复跑)

### 退役状态下的 Readiness 定向观察

Owner 授权从两份已退役、交付尚未记录的状态各跑一条真实续作。新 journal 保留源 seq 1–2，人工 prompt 只要求先查 `readiness`，常规 `pulse` 引导来自 Host。两条都在步骤 1 收到新提示，在步骤 19（software）和步骤 9（energy）记录 `DELIVER`，随后自然退出。两条从起点保留原 HEAD、退役任务和 Work 事件。[定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

两次沿用 `paid-usage-only` 和原终止条件。Software 20 个请求、542,023 tokens，energy 10 个请求、214,469 tokens。30 个请求全部结算，共 756,492 tokens，逐请求用量与 DSH 相符。六条按量记账轨迹累计 141 个结算请求、5,190,064 tokens。[定向报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察)

### Energy 三会话项目

每个 Session 独立 cohort 和 DSH home；真实 T1 从原轨迹复用。仍用 `deepseek-flash`、DSH `0.2.1-rc.5` 和 `paid-usage-only`。每轮 64 笔、30 分钟、单请求 240 秒，Worker 和原生 Subagent 计入同一窗口，金额和总 token 不设上限。

两个未送审复跑合计 111 笔、3,613,879 tokens，全部结算。原生路径偏离为 47 笔、1,502,063 tokens；正式 Worker 成功结算但 Principal 达到请求上限的轨迹为 64 笔、2,111,816 tokens。[路径偏离](research-evidence/pnwf-energy/2026-11-09/scope-route-observation.json) · [请求窗口停止](research-evidence/pnwf-energy/2026-11-09/scope-request-stop.json)

两个完整周期均通过：Palimpsest 61 笔、1,555,257 tokens、520.9 秒，含复用的 19 笔 T1；强原生 DSH 75 笔、1,690,107 tokens、565.6 秒。候选就绪到接受分别为 101.5 秒、269.3 秒，独立于模型时间。本轮新增 228 笔、6,324,199 tokens，含两个未送审复跑，全部结算。[账本、归因和接受记录](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json)

### 2026-11-07 历史 cohort

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

### 执行条件

1. 按量记账使用全新单会话 cohort 和 SQLite ledger。Runner 核对会话、请求次数和时长配置，容器 adapter 检查本次实际 uid、网络、挂载、canary 和 Git World。
2. 转发前持久登记 `PENDING`。完整终态响应结算 fresh input、cache read、cache creation 和 output。断流或用量缺失记 `UNKNOWN`，停止 cohort 并保留记录。
3. 付费路由由宿主固定为 DeepSeek Messages 与 `deepseek-flash`，凭证由宿主读取。容器经固定 stdio 出口发请求，服务端工具由代理拒绝。
4. 同一版本先通过零付费故障测试和实际容器验证。要求硬预算时，继续使用有界合同，并为真实 Provider 单独证明上界。当前真实 Provider 的硬预算资格仍为 `PROVIDER_BOUND_UNQUALIFIED`。

---

## 7. 已知未解决问题 / 建议下一步

按优先级：

1. **真实 Provider 的硬预算资格**
   - 请求前预留、Mock 身份和实际容器故障链已实现并验证。
   - DeepSeek 兼容路径的 `max_tokens` 不能直接视为已证明上界；真实输入 token 上界也需明确证明。
   - `PROVIDER_BOUND_UNQUALIFIED` 约束硬预算模式。Owner 允许的按量记账实验使用 §6 的独立合同。

2. **跨 Host settlement 残余风险**（P1）
   - 无 Invocation 记录时，principal 仍可结算；产品只保证 `UNATTRIBUTED` 与不声称退出。
   - 若要机械拒绝，需要显式 principal-authored declaration 或 durable writer marker；不要新增通用 liveness runtime。

3. **Operator identity federation**（P2）
   - 当前是本地 Ed25519 bearer credential；不是 IdP/SSO。
   - 远程部署应提供自己的 `OperatorAuthorityPort`。

4. **真实模型产品闭环**（P1）
   - 两种状态各一次定向观察证实，指定先查 `readiness` 后，模型收到新提示，并在后续步骤记录 `DELIVER` 和自然退出。原始状态的两条修复后复跑都在退役后直接验证并交付，退役后查询 `readiness` 为 0。两组保留各自的起点和触发条件。[定向观察与原始状态复跑](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察)
   - Energy 在 RUNNING Attempt 下用 `metadata_only` 移除任务，收到 `quiescence_required`，随后按 `successor` → `plan` 恢复。Software 的失败探针是另一个层级的作业错误。两种恢复顺序及耗时见对比报告。
   - Energy 等待式变体已完成真实 Worker、结算、按 SHA 晋升和 T3 接续，强原生对照也完成。默认业务提示曾引发原生委派偏离；仅指定 Work 路径时又在结算后耗尽请求。后续产品验证可关注正式 Worker 的完成通知和 Work 作业 ID 提示；真实成功轨迹仍有一次把 Work ID 传给原生 `job_output` 的错误。

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
| 2026-11-08 | Owner 允许不设计费上限，新增显式按量记账，执行一条 software 续作 | `PNWF-CQ-PAID-USAGE-ONLY.md`，`research-evidence/pnwf-cq-paid/2026-11-08/software.json` | 24 项请求测试、6 个零付费容器场景通过。27 个付费请求，982,857 tokens，自然退出，主判据 1/1 |
| 2026-11-08 | 修复 DSH 调用归因并离线重算 software 轨迹 | `software-attribution-recount.json`，`PNWF-CQ-PAID-USAGE-ONLY.md` | 31/31 配对，2 次不同原因拒绝，1 次失败作业，无进展调用 3 次，新增付费调用 0 |
| 2026-11-08 | 合并按量记账续作与轨迹归因修复，记录发布检查 | [PR #232](https://github.com/orangeofcarl0-sys/palimpsest/pull/232)，`fd341c1` | 14/14 CI job 成功，四个 Host-dependent gate 步骤跳过 |
| 2026-11-08 | 执行 energy 续作并用修复后的归因脚本对比两条轨迹 | [对比报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md)，[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json) | 29 个已结算请求，987,987 tokens，主判据 1/1，43/43 结果配对 |
| 2026-11-08 | 合并 energy 证据、对比报告和 handoff，补录合并提交及检查 | [PR #234](https://github.com/orangeofcarl0-sys/palimpsest/pull/234)，`dbaaa0e` | 14/14 CI job 首次成功，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 修复退役计划的 readiness，引导模型核对已提交产物并记录 DELIVER | [回归用例](test/pnwf_product.test.ts)，[报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导) | software 与 energy 状态回归，新增付费请求 0 |
| 2026-11-08 | 在 #236 主线从原始状态各复跑一条 software、energy，归因比较修复前后 | [复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json) | 55 个请求，2,462,728 tokens，主判据 2/2，退役后查询 readiness 0/2 |
| 2026-11-08 | 合并复跑证据、修复前后对比报告和 handoff，同步实际合并提交与检查 | [PR #237](https://github.com/orangeofcarl0-sys/palimpsest/pull/237)，`987bab0` | 14/14 CI job 首次通过，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 从已退役、尚无交付的状态定向观察新提示采用 | [定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json) | 2/2 首查、2/2 后续 DELIVER 与自然退出，30 个请求、756,492 tokens |
| 2026-11-08 | 合并 readiness 定向观察证据、报告和 handoff，补录实际合并提交与 CI | [PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239)，`00c5f46` | 14/14 CI job 首次通过，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 同步发布 handoff 并补齐 `package-smoke` 的 HTTP 504 重试 | [PR #240](https://github.com/orangeofcarl0-sys/palimpsest/pull/240)，`scripts/release/consumer-smoke.mjs` | Ordarium 发布包下载 504 使用原三次尝试上限，真实下游安装为通过条件 |
| 2026-11-08 | 持续 504 时通过 GitHub 官方资产 API 恢复 `package-smoke` | [PR #241](https://github.com/orangeofcarl0-sys/palimpsest/pull/241)，`0f7dc13` | PR 与主线 CI 均为 14/14，主线核验四个原包的 SHA-512 后完成真实下游安装 |
| 2026-11-08 | 合并 Bench 树及 README 导航，登记实际合并点与 CI 范围 | [PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242)，`ca3e676` | 14/14 CI job 首次通过，核对 59 个链接与 87 个证据阶段，四个外部 DSH 步骤跳过 |
| 2026-11-08 | 归并工作分支，导入 R3-A2 冻结证据并归档其余独有历史 | [分支清单](docs/engineering/repository/ACTIVE-BRANCHES.md)，R3-A2 tip `10a5978` | 恢复验证 411 个引用，R3-A2 定向测试 116 项通过 |
| 2026-11-08 | 改写主线提交归因，核验 Contributors 并更新导航 | [归因与 SHA 映射](#主线归因与-sha-映射) | 归档原始主线和标签 |
| 2026-11-09 | 安装提交归因门禁并启用主线必需检查 | [归因门禁](#提交归因门禁) | 本地 hook、精确 PR head 检查、rebase-only 发布 |
| 2026-11-09 | 统一 energy T2 五文件写范围并完成等待式真实闭环与原生对照 | [报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md)，[证据](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json) | 定向测试 33/33、最终 Mock 6/6、真实 6/6；本轮新增 228 笔、6,324,199 tokens |

---

## 10. 给下一个 agent 的最短路径

1. 读本文件 §0–§3。
2. 读 `PNWF-CQ-R1-QUALIFICATION.md`，并读历史 `PNWF-CQ-RESULT.md` 的 §6/§9。
3. 按 §2 核对当前分支与工作树。新工作先 fetch，再从当前主线开 `codex/` 分支。
4. `pnpm build && pnpm architecture:check && pnpm architecture:check-public-api`。
5. 跑 §5 的顺序验收集。
6. 付费实验按 §6 选择执行合同。按量记账使用新的准备目录和账本，并实测本次容器资格。
7. 改完代码/证据后更新本文件并提交。
