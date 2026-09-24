# 轻度治理与选择性委派规格（用户只表达标准，机械前置由产品推导；主代理保持直接工作能力）

> **Spec ID**：`PLMP-LEAN-1` ｜ 状态：**2A-B / 2B 已 CLOSED；`PLMP-DELEGATE-1` D1 已 CLOSED / STRONG PASS；D2-r1 设计冻结（DESIGN FROZEN / PASS）；D2 实现 = GO，D2-a / D2-b 已交付，D2-c / D2-cR / D2-e1 / D2-e2 / D2-d 已交付（D2-c = STRONG PASS；D2 live gate NEXT）**（2026-09-24）
> **愿景句**：用户只需要**轻度治理**；palimpsest 形成**自洽高效的多执行者协作**，从而提高**最终结果质量**与**项目管理稳定性**。
> **产品身份句**：**Palimpsest 让主代理保持正常工作能力，在值得时选择性委派，并把协作状态、证据、复核与恢复留在项目 sidecar 中，而不是塞进主代理的上下文。**
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；证据/晋升/账本语义沿用既有冻结规格，**本文不改**；"DSH 主代理当架构师、插件零内嵌 LLM"的宿主中立红线沿用 `18-architecture-modes-spec.md`。
> **修订记录**：
> - `LEAN-1` 初版（2026-09-20）：立项自 2026-09-19/20 的六轮 DSH 活体实测（`rs-test/dsh-*.out`、`interaction-report.json`、`probe-*.mjs`）；验收 `LEAN-A01`–`LEAN-A14`。
> - `LEAN-1` 第 1 期交付（2026-09-21，`217214c`）：§1 标准推导 + §4 操作者控件清理落地；`LEAN-A01`–`A04`、`A12`、`A13` 通过；活体验证：操作者只写一句中文，产品推导出命令、门禁、谓词与授权集，闭环 `verdict: PASS | missing: []`。
> - `LEAN-1` **amendment**（2026-09-21）：**主代理身份修正**——新增 §0.5 产品身份与 §0.6 七条不变量；**废除旧 L3**（多执行者默认律），代以 §0.6 `INV-6` 独立执行机会律；§3.1 派发主体从"产品默认派发"改为"主代理选择性委派 + 产品负责汇合"；§3.4 禁止条款加范围限定并显式承认直接工作路径；**§2.3 复核主体修正**——实测确认 `CURRENT_PROJECT_HEAD` 是当前运行时唯一的 subject kind（`src/project_verification/artifacts.ts:207`），其唯一入口 action 名即 `verify_current_head`（`src/adapters/dsh/project.ts:191`），且 §5 一致性规则在仓库 head ≠ 规范 head 时拒绝（`src/project_verification/service.ts:256`），因此 **in-place 执行下独立复核结构性不可能触发**——这是 `CF-AD-01` 的产品触发条件，拆出 §2.6 两层质量模型与第 2B 期；新增附录 A（第 2A 期 Completion Handoff 详细设计）、附录 B（第 2B 期 Attempt-bound Verification 详细设计）、附录 C（`PLMP-DELEGATE-1` 立项）、附录 D（近期不做清单）。
> - `LEAN-1` **第 2A 期部分交付**（2026-09-21）：`palimpsest_finish` 落地——主代理只陈述一次"我认为完成了"，产品从已确认标准与 envelope 推导其余。控制器新增**无命令产品观察路径**（`#recordObservedEvidence`，`command: null` / `exit_code: null`）并把命令类证据构造收敛为单一来源（`#recordCommandEvidence`，`gate` 与 `finish` 共用，避免命令被执行两次）；`gate()` 的越界拒绝与 `report()` 的产品观察被 `finish` 复用。验收 `LEAN-A16`/`A17`/`A18` 全通过；**`LEAN-A15` 只通过确定性一半**——一次 `finish` 后 attempt 为 COMPLETED、证据齐、且工具契约无处安放 `attemptId`/`predicate`/`exitCode`/`changedFiles`/`gateId`（源码级断言）均已证明，但 `A15` 还要求**活体**双证与 **gate PASS**，二者本轮**未做**（活体 DSH 会话未跑；测试断言到证据齐与结算，未断言门禁判定为 PASS）。**并根治第 1 期暴露的 `write_scope_valid` 语义**——那条证据如今是产品对 `git diff` 的观察，调用方无任何参数可以冒充它（`LEAN-A18`）。**本轮未交付**：`LEAN-A05`/`A06`（§2.1 证据要求推导）与 `LEAN-A14`（§5 readiness 校验操作者配置）——它们是独立于 `finish` 的工作，仍待做。工具侧新增**已审阅新增机制** `REVIEWED_TOOL_ADDITIONS`（route 早有、工具此前没有，导致新工具无法表达）：名称集合仍是双向精确比较，删除或未登记的新增仍失败。门禁：单元 184 文件 / 2095 测试、e2e 38/38、`architecture:check` 0 violation（12 baseline exceptions）、`check-public-api` 0/0/0。附带修复：`src/tools/controller.ts` 中 `#gateOutputKey` 的两个**字面 NUL 字节**改为 `\u0000` 转义（值等价，但裸字节让该文件被工具链判定为二进制，Edit/grep 均无法工作）。
> - `LEAN-1` **第 2A-R 期（Completion Integrity Closure）交付**（2026-09-21）：独立复核发现并**实测确认**一个 correctness gap——`finish` 的 in-place 观察同时统计已提交与未提交变更，于是**未提交的工作也会被接受**：探针在 `main@89377c7` 上得到 `finish ACCEPTED`、`changed_files: ["src/dedupe.ts"]`、而 `result_commit` = **base**（不含该改动）。更严重的是 in-place 晋升守卫只比较"记录的提交 == 仓库 HEAD"，该状态下两者都是 base，**守卫会通过**，于是晋升可能记录一个 canonical head 并不含工作内容的 COMMITTED 结果。**新增并冻结不变量**：`Attempt COMPLETED ⇒ resultCommit 是包含所观察工作的不可变提交`（即 `changed_files == Diff(base, resultCommit)`）；拒绝而非代提交——`git commit` 是普通 agent 工作（read/edit/test/commit），不是治理机器，产品不得代写提交。同时：worktree 模式下 `finish` **fail closed**（该模式的工作树路径属 git port，高层路径无法观察，不假装支持）；DSH 结果**投影掉 `attemptId`**（`INV-4`：编排状态不进主上下文，应用层结果仍保留）；并把误挂的 `#assertInPlaceAttemptCurrent` 文档注释归位（它恰好描述的就是这个缺陷，注释中补记"必要但不充分"）。验收 `LEAN-A22`–`A25`（`test/lean_finish_integrity.test.ts`）；§8 第 5 条按操作者裁决定为 **(a′) Commit-bound isolated verification**，附录 B §B.3 据此修正（`ATTEMPT_RESULT` 的一致性**不是**"ambient HEAD == resultCommit"——那会把主代理锁死在已完成的工作上；而是 subject 由 canonical 报告物化、提交对象存在、verifier 精确物化该提交）。门禁：单元 185 文件 / 2099 测试、e2e 38/38、`architecture:check` 0 violation（12 baseline exceptions）、`check-public-api` 0/0/0。
> - `LEAN-1` **第 2A-Q 期（Completion Contract + readiness）交付**（2026-09-21）：新增 **L1 纯派生** `src/domain/completion_contract.ts`——`deriveAttemptCompletionContract(standard, task, envelope, capabilities)` 产出 `{basisDigest, mechanical, verification, diagnostics}`，**不落任何事件、不读任何存储**（`Envelope is basis ≠ Envelope stores every derived requirement`：**未**给 `TaskEnvelope` 增加任何 evidence/verification 字段）。机械部分用**三种 check kind**（`run_standard_command` / `assert_write_scope` / `assert_required_artifacts`）而非谓词列表，谓词映射单点单向。`finish` 改为**消费同一个派生**（一条派生、多个消费者，禁止 readiness/finish/2B 各持一套规则）；`A05`/`A06` 按"envelope 是 basis"与"`expected_files_exist` 只来自执行前已声明路径"改写；`write_scope_valid` 无条件要求。readiness **分两层**（`R_deployment` 启动可答 / `R_task` 需任务），部署缺 verifier **只在任务确实需要复核时**才算 task blocker；`A14` 的判据是"不能晚失败"（策略不允许所需命令必须在任务开始前出现并指明补救方是操作者）。capabilities 由 composition 如实注入（有 repository 才 `sandboxSpawnVerified`，有 verification store 才 `independentVerifierAvailable`），未声明一律按缺失处理。验收 `LEAN-A05`/`A06`/`A14`（`test/lean_completion_contract.test.ts`，14 项）；readiness 经 `/api/application/surfaces` 的 `governance.completionReadiness` 暴露。**D2 两条硬前置已登记**（worktree-aware `observeAttemptResult` 复用同一 materialization 断言；principal attempt attribution 需 host-local 绑定、不得创造 Agent identity 真值）。**已知中间缺口**：`verification.required` 已派生但 2B 之前不强制，只在 readiness 上可见。门禁：单元 186 文件 / 2113 测试、e2e 38/38、`architecture:check` 0 violation（12 baseline exceptions）、`check-public-api` 0/0/0。
> - `LEAN-1` **第 2A-Q-R 期（verification policy calibration）交付**（2026-09-21）：复核发现 `single_evidence` 作为 hard requirement **把风险代理搞错了**——命令**数量**不是证据**强度**的代理（一条 `npm test` 可能跑 5 个断言也可能跑 500 个），且会让普通任务被迫启动第二执行者，与 `INV-6`（exploit useful independence; never manufacture agents）和 G10-R 的"人为 role split 可为纯开销"冲突。四处校准：① 复核分**两个强度**（`required`/`requiredReasons` 与 `recommended`/`recommendationReasons`），`REQUIRED` 保持窄，2B v1 只做 `contract_boundary`，不加 size threshold（"大 diff"执行前不可知）；② 触发**改名** `single_evidence → single_command_bar`（旧名本身是比它实际测量更强的 epistemic 主张）；③ **`RequirementBasis ≠ CapabilityAssessment`**——`deriveAttemptCompletionContract` **不再接收 capabilities**（分层由构造保证），`basisDigest` 只覆盖规范性输入，capability 说明移出契约 `diagnostics`；否则 verifier 中途配置好会移动摘要而标准未动，削弱 `INV-7`；④ readiness 两层**强度不同**——部署层**描述性**（`CONFIGURED`/`DEGRADED`/`INCOMPLETE` + `gaps`，不叫 blockers），任务层**可行动**（`READY`/`BLOCKED` + `blockers` + `advisories` 承载 RECOMMENDED 但不可用）。阻断规则精确为 `已知要求 ∧ 缺失能力 ⇒ 提前阻断`，不多不少。验收 `LEAN-A05`/`A06`/`A14` 扩到 19 项。门禁：单元 186 文件 / 2118 测试、e2e 38/38、`architecture:check` 0 violation、`check-public-api` 0/0/0。
> - `LEAN-1` **2A final live gate 实测（两次，均未通过）+ 零产出泵修复**（2026-09-21，`6302a20`）：装置 `rs-test/lean-2a-live-gate.mjs`（真实 DSH 单轮 + 离线核对 attempt/证据/门禁/转录）。**第 1 轮**：agent 干对了活但 `claim` 早一步（`palimpsest_next` 每次只提交一个事件），改调 `palimpsest_run` —— 机械泵在**未改动**的树上跑策略命令退出 0，留下 `COMPLETED` + `changed_files: []` + `result_commit` = base + 零证据，**正是 `finish` 专门要拒绝的状态**。修复：`#assertCompletionHasWork` 由 `report` 与 `finish` **共用**（§3.3 此前只在 `finish` 强制），去掉 `finish` 的 `required_artifacts.length === 0` **逃逸口**（预先存在的产物不是工作），泵的无命令分支由 `completed` 改 `failed`。回归 `LEAN-A26` 确定性复现该失败；`test/inplace_execution.test.ts` 的陈旧性测试改**前提**（原先"在干净树上 report"——正是刚被判非法的状态）。**第 2 轮**：agent 按指示只调一次 `finish` 被拒 `no attempt is running`，自行查证后正确诊断 **`project "livegate" has no ProjectIR`**（无计划/无 ready set/无可认领 attempt），并**拒绝自行铸造治理状态**。**结论：`LEAN-A15` 活体那一半未证明，2A 未闭合**；缺口不是 scheduler 补丁，而是 direct path 缺少与 `finish` **对称的开始协议**。据此起草**附录 E（第 2A-B 期，Direct Work Bootstrap，`palimpsest_begin`，规划未实现）**：`Agent decides what the work is. Palimpsest makes the work governable.` —— 主代理把目标编译成最小 direct proposal（含 `writePaths`，属**工作语义**而非机器词汇），产品验证并机械建立唯一受管工作位（只用 `preview`/`step`/`claim`，**禁止** `run`/pump），readiness **全部前置、拒绝时零项目事件**，`begin` 前只读勘察允许而 mutation 不允许，标准确认**不得**从 `begin` 铸造，已有计划**不得**静默改写，retry 必须**收敛**且用派生摘要判同一性。门禁：单元 186 文件 / 2119 测试、`architecture:check` 0 violation、`check-public-api` 0/0/0。
> - `LEAN-1` **附录 E 的 E-r1 修订**（2026-09-21，docs-only，实现前）：逐段对照 `start`/`preview`/`step`/`claim` 后，把 2A-B 的实现前边界收紧。**核实两处代码事实**：`controller.start()` 在未传 `headCommit` 时使用 `DEFAULT_HEAD_COMMIT = "c".repeat(40)`（`src/tools/controller.ts:124`）；且 `start()` 的 genesis 是**多事件**序列（`PROJECT_CREATED` → release `GATE_DEFINED` → `ROLE_TABLE_DEFINED` → `STAGE_GRAPH_DEFINED` → task registration），因此 crash 可落在任意两个声明之间，retry **不得**用新 clock 重建 creation basis（否则同幂等键 + 不同载荷）。修订九项：v1 仅 **repository-bound + in-place**；fresh begin **绑定真实 HEAD** 并加机器验收；clean-tree **分阶段**（未归属拒绝 / 已归属 RUNNING 是正常 Work）；restart 覆盖 **partial genesis 每个落点**；Case B/C 改 **语义等价而非来源**（无 marker 时来源不可判），比较 normalized shape / `D_direct` 而非完整 digest；`goal` 改称 agent-compiled；`writePaths` 明确为 self-binding scope 并说明与 ARCH-2 确认规则的窄例外关系；`A29` 改 **event delta 0**、`A33` 改 **低层工具调用计数 0** 并注明 fixture 已预置确认标准（不声称单轮确认 goal+standard）；新增 `A34` pre-claim **HEAD drift fail-closed** 与 **S0–S3 状态机**。验收 `A27`–`A34`。**仍为规划、未实现。**
> - `LEAN-1` **附录 E 的 E-r2 修订**（2026-09-21，docs-only，实现前）：E-r1 判为 **architecture PASS / implementation HOLD**——仍有 4 个会让 `A27`/`A30` **假绿**的 blocker。**新核 5 处代码事实**：`ProjectIR.digest` 含 `committed_at`（`src/schema/models.ts:468`）；`StartProjectInput` **已含** `committedAt?`（`src/tools/controller.ts:136`，故修法**不动既有面**）；`#advanceActiveStage()` 在任务已占位该 stage 时返回 `null`（`src/scheduler/scheduler.ts:232`）；`TASK_CREATED` 已固定 `task_envelope` 与 `policy_digest`（`src/scheduler/scheduler.ts`、`src/domain/policy.ts` 的 `AuthorizedTaskEnvelope`）。**四个 blocker**：① **S0 一次性冻结 `liveHead` + `genesisCommittedAt`** 并原样传两侧，加断言 `prospective.digest == canonical.digest` 与 `envelopeId`/`projectDigest` 一致——**只对齐 HEAD 不够**，`project_digest`/`envelope_id` 会不同（§E.15.1）；② **S1 先读 canonical attempt**，已有可 claim 的 CREATED attempt 直接 claim，不再 `preview/step`（§E.15.2）；③ **2B 之前 `verification.required` fail closed**（`ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE`，零写）或把 capability 升级为"attempt-result verification executable"，**不得**让旧的 current-head verifier 假装满足（§E.14.1）；④ **`writePaths` 必须非空**（否则与"完成需 `changed_files > 0`"矛盾，begin 时即可证明不可完成，§E.4.2）。**三处边界**：⑤ **语义等价 ≠ 授权 basis 等价**——已有 `TASK_CREATED` 则复用 canonical envelope、**绝不重授权**，v1 保证范围写明为"同一 operator configuration 之下"，不暗示解决任意配置漂移（§E.13）；⑥ **"begin before first mutation" 是 principal protocol precondition，不是可检测的安全属性**——先改后 commit 再 begin 时工作树仍干净，产品无法追溯，`Palimpsest does not retroactively claim work`（§E.6）；⑦ **判 dirty 须复用与 `finish` 相同的脚手架过滤规则**（`.palimpsest/`），否则产品会被自己的状态目录卡死（§E.7）。另：`E.10` 完成摘要由 `testsRequired` 改为 `mechanicalChecks` 人话摘要（标准可能要求 `lint_pass`/`process_exit_zero`）；S0–S3 精确化并写出三个 basis 的分工 `Work semantics ≠ Governance basis ≠ Runtime capability`（`D_direct` 只负责第一项）。**实现门禁：E-r2 后 2A-B = GO。仍为规划、未实现。**
> - `LEAN-1` **附录 C 的 C-r1 修订**（2026-09-22，docs-only，D1 实现前）：2B 冻结为 **CLOSED / STRONG PASS**，direct path 基线为 `begin → native work → finish → G_work ∧ V_required ∧ E_promotion`。附录 C 判 **architecture PASS / D1 implementation HOLD**——原规格把「ReasoningCell 是 canonical owner」与「后台 OS job 的执行生命周期」混在了一起。**四条新原则**：**① `Reasoning semantic state ≠ host job state`**（ReasoningCell 能持久表达 `BRANCH_OPENED`/`CANDIDATE_SUBMITTED`/`BRANCH_CLOSED`，**不能**表达 PID/进程存活/Promise；D1 状态由两层组合派生为 `RUNNING`/`COMPLETED`/`FAILED`/`INTERRUPTED`/`UNKNOWN`，且 `OPEN branch after restart ≠ RUNNING worker`，v1 **不自动重跑** `INTERRUPTED`）；**② `WriteSet_project(worker) = ∅` 靠 ephemeral snapshot**（对 delegation 时 committed HEAD 建 detached 临时 checkout，冻结 `ReadBasis`；未提交的 Principal 修改**不**复制过去；约束是 canonical project 零写，而非禁止一切临时文件写入）；**③ 正常路径不 polling，restart 可如实 `INTERRUPTED`**（只送 terminal actionable 经 attention/followup；**不声称**跨 crash 的可靠投递队列；delivery mark 非 canonical）；**④ D1 认知与 Work/Evidence/Verification/Promotion 完全正交**（不建 Task/Attempt、不产 `EvidenceAtom`、不满足 Work Gate 或 `ATTEMPT_RESULT` 复核、不改 `PromotionEligibility`、不需 `palimpsest_begin`）。另：**现有 branch host 改为 async seam**（`start() → {completion, cancel()}`，`run()` 保留为同步包装——同一认知后端、不同交互生命周期，**禁止**第二套 Agent runtime）；**抽共用的 `runBranchToSettlement`**（不复制 candidate settlement；host 失败则关 branch 且**不制造伪 epistemic claim**）；**D1 公共面收窄**为 `start {task, kind?: RESEARCH}` / `status` / `inspect`（`WORK` 留 D2、跨项目复用 `palimpsest_cross_project`、`receive` 本地无必要、`AUTO` 不急）；**context firewall 精确化**（`No Principal conversation/session by default` + brief + evidence allowlist + frozen snapshot，即 `context firewall ≠ no project context`）。**修正 C.3 与 DEL-A04 的自相矛盾**：只禁止新的 canonical `DelegationStore`/`Event`/`Authority`/event type，应用层 DTO（`DelegationRef`/`DelegationResultProjection`）不在禁止之列；且**不冻结** `dlg:v1:…` 具体字符串，只要求 opaque、可严格解析、可往返。**验收** `DEL-A01`–`A04` 保留（A01 barrier 式、A02 记 frozen basis、A03 status 调用数为 0、A04 修正措辞），新增 `DEL-A05`–`A08`（snapshot 写隔离 / `INTERRUPTED ≠ RUNNING` / 与 Work·Evidence·Verification·Promotion 正交 / `collaborate` blocking 行为不变以证明 delegate 是加法）。**实现门禁：C-r1 后 D1 = GO。仍为规划、未实现。**
> - `LEAN-1` **第 2A-B 期交付**（2026-09-22）：`palimpsest_begin` 落地——direct path 终于有了与 `finish` 对称的开始协议。实现按 §E.16 的 S0–S3，全部前置在任何写入之前求值：`ProjectController.begin()`（preflight → prospective basis → `start({headCommit, committedAt})` → S1 先读 canonical attempt 再 claim）、application work 面 `begin()`、DSH 工具 `palimpsest_begin`（登记 `REVIEWED_TOOL_ADDITIONS`）、`test/lean_begin.test.ts`（9 项）。**实现中发现并修掉一处规格未覆盖的自身缺陷**：`#assertNoUnownedWork` 原本只在 S1 分支调用，S0（无项目）漏检——`A29` 的"stray file"一例当场暴露，已改为 S2 早返回之后**无条件**执行（S2 的 RUNNING attempt 合法拥有脏树，不得被拒）。另有两处测试构造被纠正：用手改 `attempts` 行模拟 crash 会让账本与投影不一致（retry 会死在幂等键不匹配），改为用公开生命周期原语**忠实构造** `ATTEMPT_CREATED` 未 claim 的状态。**验收**：`A27`–`A32`、`A34` 确定性通过（含 prospective basis 与 canonical basis 的 `projectDigest`/`envelopeId` 一致、每次拒绝的 event delta 0、`ATTEMPT_CREATED` 落点 retry claim 同一个 attempt、pre-claim HEAD drift 拒绝）；**`A33` 活体通过**——真实 DSH：只读勘察 → `begin`×1 → 改代码/测试/提交 → `finish`×1，`toolCalls(begin)=1`、`toolCalls(finish)=1`、`toolCalls(start|next|claim|run|gate|report)=0`，最终 `Attempt COMPLETED`、`result_commit` 含工作、`gate-release PASS (missing: [])`。**据此 `A15` 活体那一半关闭**。门禁：单元 187 文件 / 2128 测试、e2e 38/38、`architecture:check` 0 violation（12 baseline exceptions）、`check-public-api` 0/0/0。**活体一处次要观察（非 blocker）**：`begin` 之后 agent 的首次 `write` 报 "file changed since it was read"，重读后内容未变、重试成功——疑似 begin 触碰了文件元数据，留待观察。
> - `LEAN-1` **附录 B 的 B-r1 修订**（2026-09-22，docs-only，实现前）：2A-B 判为 **STRONG PASS / CLOSED**，2B 判为 **architecture direction PASS / implementation HOLD**。**新核三处代码事实**：first-party verifier 即 `commandProjectHeadVerifier({ command: "git", args: ["diff", "--check"] })`（`src/composition/governance.ts:176`）——**在 clean checkout 里必然 PASS**，故把它的 `supportedSubjects` 扩成含 `ATTEMPT_RESULT` 会同时造成**假验证**与**既有 head verification history 全部 stale**（改 definition digest）；`ProjectHeadVerificationSubject` 硬编码于 `provider.ts`/`status.ts`/`artifacts.ts`/`store.ts` 四处；`PromotionManager.assessEligibility()` 是唯一 assessor（5 处调用点）。修订九项：**① B.4 与 #147 校准**（唯一硬触发是 `contract_boundary`；`single_command_bar` 仅 RECOMMENDED；v1 不实现 diff-size threshold；operator-requires 等 `ProjectStandard` 有 clause 后再做）；**② subject 改 union**（`ProjectVerificationSubject = Head | AttemptResult`，`CURRENT_PROJECT_HEAD` 语义不动，`new subject kind ≠ new verification system`）；**③ Work-backed materialization owner**（窄 read port，调用方永不提供 `resultCommit`/`baseCommit`/`reportDigest`）；**④ agent-facing 不接收 `attemptId`**（恰好一个 current-batch COMPLETED promotion candidate → 验它；0 → `NO_ATTEMPT_RESULT`；>1 → `AMBIGUOUS_ATTEMPT_RESULT`，不猜）；**⑤ 新建 verifier ref** `project.attempt.git-diff-check.v1`，旧 `project.head.git-diff-check.v1` 不动，新 provider 的 commit 来自 canonical subject 故无 injection；**⑥ Verification service 控制的隔离检出 port**（`materialize` → detached checkout @ R → `release()`，throw/timeout/ERROR 也 cleanup；不是 Work truth、不是 project mutation、不是 durable artifact）；**⑦ freshness 按 kind 分开**（`ATTEMPT_RESULT` **绝不**查 ambient HEAD）＋ **runtime capability subject-aware**（`supportsIndependent(kind)`，这才是解锁 `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` 的正确条件——不是"store 存在"）；**⑧ promotion 显式 admission bridge**（Verification-agnostic 投影 + typed blocker `required_verification_missing`/`_unsatisfied`，挂在唯一 `assessEligibility()` 上，promotion domain **不** import Verification）；**⑨ 正常 `finish` 在 application 层自动触发 required verification**（Work owner + Verification owner 编排，`ProjectController` 不 import Verification），且 **`Verification FAIL ≠ Work FAIL`**（Attempt 保持 COMPLETED，不改历史报告，v1 不发明自动 reopen）。验收增补 `A35`（exact isolated materialization + cleanup）、`A36`（RA/RB adversarial：HEAD 推到 RB 后 RA 的 run 仍 CURRENT，而 promotion(RA) 仍可因 head_conflict 被拒——机器证明 `Verification freshness ≠ Promotion authority freshness`）、`A37`（双向 subject firewall）、`A38`（promotion bridge，并断言 **`EvidenceAtom` 计数在 Verification PASS 前后不增加**——证明没有 evidence laundering）。**仍为规划、未实现。**
> - `LEAN-1` **2B 交付 + `PLMP-DELEGATE-1` D1 全程交付（2026-09-22/23）**：2B 按 B-r1 九项落地（subject union、新 verifier ref `project.attempt.git-diff-check.v1`、Work-backed materialization、application 层 finish 编排、promotion admission bridge、按 kind 分开的 freshness 与 subject-aware capability、隔离检出 materialization port），`A35`–`A38` 通过并**冻结为 CLOSED / STRONG PASS**。随后 D1 分片交付（`#163`–`#168`）：**D1-a** async branch-host seam（`start()→{completion,cancel()}`，`run()` 为同实现的同步包装；内部类型不进公共面，barrel 收窄为六个既有符号）；**D1-b** 共用 settlement（`branch_settlement.ts`：`statementFromOutput`/`evidenceRefsFromOutput`/`settleBranchFromOutput`，两个生命周期同源，消除候选语义漂移）；**D1-c** ephemeral snapshot（detached worktree @ committed HEAD，未提交修改不复制，每条路径都 release）；**D1-d** delegation runtime（状态由 canonical branch view + 本进程 job map **两层**派生，`OPEN + 无 job ⇒ INTERRUPTED`，`DEL-A06`）；**D1-e** 四道 pre-surface hardening + 表面接线（identity 由 `H(projectId, basisCommit, task)` **推导**，顺序 `freeze → identity → 读已有 canonical/host 状态 → 才 open/start`；`delegationRef` 改为 `dlg2.<basisCommit>.<cellId>.<branchId>` **携带 exact basis**，terminal projection 亦带 `basisCommit`；host / settlement / **delivery** 三类故障分离 + 每 ref 至多一次 terminal projection；`DEDUPLICATED` 与 blocking 路径统一为 `COMPLETED`；并修掉 cell 用**编造 policy ref** 打开的真实缺陷——那会让每次委派的验证永远失败却像"从不收敛"）；**D1-f** 活体 barrier gate（`rs-test/lean-d1-live-gate.mjs`：`worker spawned < principal edited < worker released` 是**测量**出来的；`palimpsest_delegate`×1 即 `status`/`inspect`×0；终态经**未经请求的 followup turn** 到达且排在主代理自己那一轮之后；`collaborate` 仍 blocking 且不委派）；**D1-g** frozen-read closure（见 §C.23：branch 请求带 capability profile，`RESULT_ONLY` 默认 / `PROJECT_READ_ONLY` = `read`/`glob`/`grep` + result，无任何写/shell 工具；`rs-test/lean-d1g-read-gate.mjs` 实测 worker 在 live 树已被 Principal 改掉之后仍报出 **H0 第一行的 frozen marker**）。**裁决：`PLMP-DELEGATE-1` D1 = CLOSED / STRONG PASS**——两个活体 barrier 使结论不只依赖单元测试与架构推演。门禁：单元 197 files / 2190 tests、e2e 38/38、`architecture:check` 0 violation（12 baseline）、`check-public-api` 0/0/0。
> - `LEAN-1` **附录 C 的 D2-r1 修订**（2026-09-23，docs-only，D2 实现前）：D1 冻结后**不回头重构**，只冻结 D2 的形状。**六条原则**：① **Worker 是 Work executor，不是 ReasoningBranch**（`RESEARCH → ReasoningCell`、`WORK → Work Task/Attempt`；可复用 DSH agent/subprocess backend，但禁止"给 branch host 加第三档写权限"——`Do not turn Reasoning branch into a code worker`）；② **isolated worktree execution world，且圈内不削工具**（`Free cognition inside bounded execution world`；边界是**世界**而不是工具集）；③ **只有一条 mutating lane**（Principal 可继续 read/reason/search/chat/delegate RESEARCH，但不得启动第二条 canonical mutation；D2 的准入不是"write-set 不交叠"而是"不存在第二条 mutating line"，**严格强于**旧 `A10` 的"重叠即拒"）；④ **严格性放在出口**（`attempt → immutable result commit → mechanical evidence → required verification → promotion eligibility`）；⑤ **`Worker COMPLETED ≠ Promoted`**（唯一 assessor `assessEligibility()` 不变，不新增第二条晋升路径）；⑥ **worktree completion observation 是第一硬前置**（2A-R 的 `Completed ⇒ resultCommit` 必须**复用同一 completion invariant**，不得新写"worker 大概改完了"的近似逻辑）。**旧假设重新评估**：`principal attempt attribution` **移出 D2**——D2 v1 直接规定"启动 mutating WORK delegation 时不允许已有正在执行的 Principal direct Work attempt"（fail closed，任何写入之前），不变量仍是 `one mutating Work attempt`，host-local 的 principal-attempt 绑定**下移 D3**，符合 `do not solve D3 inside D2`；这是 D2-r1 中唯一需要一句话裁决的点。**明确不属于 D2 的四件事**：write-path disjoint 并发（D3）；Result Transplant（D3，并写死 **"write disjointness is necessary for concurrent mutation, but not sufficient for promotion authority"**——A 可 promote `H0 → H1`，而 B 的 authority 仍绑 `base = H0`，不能因为 B 改的是别的文件就把 `B(H0)` promote 到 `H1`，否则绕开 G10-Z 的 exact-head protection）；blocking Explore enrichment / cognition capability parity（独立项，理由：DEL-A08 已证明 delegate 是加法，立刻再改 collaborate 会让 D1 的 closure boundary 重新漂移）；给 Reasoning branch 加写权限（永不在 D2 出现——D2 worker 的写能力属于**它的 disposable execution world 的边界**，不属于 branch 的能力档）。准入三条在任何写入之前求值（无 RUNNING Principal attempt、工作树无未归属变更、无另一个活跃 mutating delegation），并在**出口复核 `HEAD == base`**、漂移即拒绝结算——这是 `cross_revision_promotion_not_supported`（§3.2）在 D2 的落点，保证 D2 **永远不会**绕开 G10-Z exact-head protection。**`PROJECT_READ_ONLY` 的地位**同时写清：它是"当前最小、已通过活体的 cognition profile"，**不是**"Palimpsest 的研究 Agent 原则上只能 read/glob/grep"；真正冻结的是 `WriteSet_canonical_world(worker) = ∅`，而不是 `WriteSet_worker_disposable_world(worker) = ∅`；因此将来扩展研究 Agent 的 disposable execution world **不构成重开 D1 correctness**。验收：`A10`/`A09` 按 §D2.6 **重定形**（第二条 mutating lane 在任何写入之前被拒，event delta 0；旧"比较集合含主代理 in-place attempt"的机制因此**不需要**在 D2 出现）+ 新增提案 `DEL-D2-A01`–`A06`（含 D2 专属活体与 `DEL-D2-A06` crash/restart 诚实）。**仍为设计冻结、未实现。**

---

## 0. 立项与边界

### 0.1 实测基线：问题不是缺功能，是**错位**

六轮活体会话（fence / token / in-place 三种部署，含一次完整闭环）测出的用户动作清单：

| 用户必须做的动作 | 实际性质 | 实测代价 |
|---|---|---|
| 在 deployment profile 声明 `policy.allowed_commands` | 平台配置 | 写错即**永远产不出证据**；agent 无权修（正确），用户看到的是"活干完了、项目推不动" |
| 声明 release gate（仅 CLI） | 平台配置 | 要选 `tests_pass`/`process_exit_zero` 这类**用户不拥有的词汇**，且必须与 agent 记录的谓词一致 |
| 推调度器（单步 / 机械推进 ×20） | 操作机器 | 操作者面板把 `手搓模式`/`暂停`/`单步`/`机械推进 ×20` 交给用户 |
| 晋升 | 判断（唯一真判断） | 藏在 `Work 图面` 一个按钮里，默认要求一个用户没声明过的 `gate-release` |
| 事后对齐谓词 | 返工 | 实测中操作者只能反过来迁就 agent 已记录的谓词 |

实测中"第二个执行者"只出现过一次，且是**浪费**：机械 pump 替 agent 抢了一次 attempt，报 `completed`、`changed_files: []`、零证据——消耗预算而无产出。真正的多执行者通道（branch 执行器 / `workerDispatch` / federation / crossProject）**一次都没跑过**。

质量侧：闭环里只有 **1 条证据**（agent 自选的一条测试命令），没有第二主体独立复核；`project_verification`（`MECHANICAL_INDEPENDENT`）在更早会话里出现过，但**不在闭环内**。

稳定性侧：账本很稳（幂等、不可变声明、审计链、头对账都按设计拒绝过错误操作）；脆的是**接缝**——六轮里挖出的六个缺陷，三个是 in-place 接缝、两个是配置死路、一个是顺序契约，共同形态是"必须按特定顺序、用特定词汇做对，做错得到诚实但沉重的死胡同"。

### 0.2 一句话诊断

**产品把"操作者"当成了懂平台的工程师，把"协作"当成了调度器的机械动作。** 于是：该由产品推导的（工具链 → 可用命令 → 完成标准 → 该记录哪些证据）交给了用户；该由多执行者分担的（独立任务、独立复核）交给了单个 agent 顺手做；该在判断时刻只呈现结论的，呈现成了一组机器词汇和按钮。

### 0.3 三条设计律（本文最高约束，冲突时以上位者胜）

- **L1 一次表达律**：用户用**自己的语言**表达意图与标准**一次**；一切机械前置（可用命令、门禁条款、谓词、默认命令、调度推进）由产品**推导**并在需要时**提议**，不得要求用户先用机器词汇表达。
- **L2 推导质量律**：质量条由**任务形状**推导（是否触及测试、是否跨边界、风险高低），**独立复核默认在环**；"证据由 agent 自由选择"不再是合法默认。质量条分两层（机械完成 / 独立复核），见 §2.6。
- **L3 独立执行机会律**（**amendment 取代旧"多执行者默认律"**）：**主代理的直接工作是一等公民**；当存在**安全、可分离且具有实际收益**的独立执行边界时，产品默认允许并鼓励利用它；**不存在这种边界时，单执行者是正常形态，不叫退化**。绝不能为凑数制造执行者。完整形式见 §0.6 `INV-6`。

> **旧 L3 为什么废除**：旧表述"多执行者是默认形态，单执行者是它的退化情形"在实测中被证明会导向两个错误——把"主代理自己 read→edit→test→finish"当成需要修正的形态，以及把派发主体交给调度器（旧 §3.1）。G10-R 的既有经验结论也支持废除：人工 planner/reviewer split 在至少一个场景中是**纯开销**。多执行者的价值来自**真实的独立劳动点**，不来自数量。

### 0.4 非目标（明确不做）

- 不新增 runtime registry / discovery / reflection / service locator / 字符串键服务表（沿用 SR-1 §11）。
- 不让 adapter 承载语义策略；不让 agent 侧扩权（策略上界永远在操作者一侧）。
- 不削弱"观察替代申报"：证据仍是产品自己的观察，`exitCode` 之类的申报通道不得复活（SR-1 #134 已封）。
- 不改账本事件形状、晋升链不变式、公共 API 面；不新增 architecture exception 或 SCC。
- 不把"轻度治理"做成"无治理"：用户仍拥有接受/退回与策略上界的最终权力。

### 0.5 产品身份：Principal-first 的选择性委派 sidecar

**Palimpsest 是一个面向通用主代理的 durable collaboration sidecar。** 主代理始终是**完整的传统 Agent**——可以自己 read / edit / search / shell / 思考 / 把工作做完，甚至一次 palimpsest 调用都不发；Palimpsest 在它**旁边**承担 worker 生命周期、上下文隔离、证据、独立复核、汇合与恢复。只有某块工作值得分离时，主代理才把它委派出去。

五个词都重要：

- **主代理**：完整 Agent，**不是 ManagerAgent**；它管理 worker 状态机的能力不应存在。
- **sidecar**：**不在用户请求的必经路径上**。主代理的直接工作路径（direct path）是一等公民，不是需要被修正的退化形态。
- **selective**：不是每件事都多执行者；不存在有价值的独立边界时，单执行者是正确的。
- **durable**：项目状态、Work、证据、复核可恢复。
- **governed**：委派**不绕开** authority / evidence / promotion。

**结构（与现状一致，不是架构转向）**：主代理的原生工具来自宿主；Palimpsest 的工具作为**附加**注册进同一 registry——`host/dsh/lib/index.js` 的注册是 passthrough（`toRealTool` 只映射 Palimpsest 自己的工具定义），**不拦截**主代理自己的 read/edit/shell。宿主中立红线沿用 `18-architecture-modes-spec.md:21`：DSH 主代理当架构师，插件零内嵌 LLM。

五种**执行位**（execution locus），各有既有 owner，不新造第六种：

| 执行位 | owner | 可否写项目 | 语义 |
|---|---|---|---|
| 主代理直接工作 | 宿主 + Work Attempt | 可以 | 正常直接工作 |
| 认知分支 | ReasoningCell | **不应写** | 临时认知探索 |
| Work 执行者 | Task/Attempt + worktree | 可以 | 真正的项目执行 |
| 独立复核 | Project Verification | **不应写** | 独立协议检查 |
| 远端项目 | Federation / CrossProject | 自己项目内可以 | 主权项目协作 |

已证明的两个既有模式，新能力**复用它们而不是另起炉灶**：

- 认知分支的**上下文隔离**：一个 frozen `ReasoningBranchBrief` 进（`src/reasoning_cell/artifacts.ts:115`），恰好一条 `{statement, evidenceRefs}` 出（`src/deployment/branch_host.ts:47`）。
- 跨项目 Ask 的**异步生命周期**：`ask` 立即返回、不等答案；`status` 是纯派生（"no response yet means WAITING, not failure"）；`receive` 取终态（`src/adapters/dsh/product.ts:91`）。

### 0.6 七条不变量（本文最高约束的完整形式）

以下七条是本规格的**架构不变量**。任何实现、任何后续修订都不得违反；违反者视为缺陷而非取舍。

**`INV-1` 直接工作一等公民（Direct Path First-Class）**

```
任务只有一条自然工作线时：主代理 read → edit → test → finish 就是正确行为。
单执行者不叫退化。
```
产品**不得**要求任何工作先经过委派层。`palimpsest_finish`（附录 A）存在的意义是让这条路径**更短**，不是让它变成必经。

**`INV-2` 委派是叠加，不是模式切换（Delegation Is Additive）**

```
DirectWork XOR MultiAgent        ← 错误模型
DirectWork ∥ OptionalDelegation  ← 本规格模型
```
同一个 turn / session 内"主代理自己改模块 A"与"把调查 B 委派出去"**完全合法且应被支持**。不存在"切换为 multi-agent mode"这种状态。

**`INV-3` 三种上下文互不替代（PrincipalContext ≠ ProjectState ≠ WorkerContext）**

| 上下文 | 归谁 | 保存什么 |
|---|---|---|
| Principal Context | 宿主会话，**昂贵且稀缺** | 用户对话、当前思考、当前直接工作需要的信息、少量可行动结果摘要 |
| Project State | Palimpsest，durable | goal、requirements、tasks、attempts、evidence、verification、history、promotion |
| Worker Context | 隔离、短生命周期 | 自己的 objective、必要项目 refs、必要文件/context、自己的局部工作状态 |

只有**明确需要**的信息才跨边界。今天这条靠构造成立（branch 进出形状），本规格把它写成**显式不变量**，以防未来改动静默破坏。

**`INV-4` 编排噪音不进主上下文（Orchestration Noise Must Not Enter Principal Context）**

默认**不进入**主代理上下文：attempt id、lease、session id、retry count、event sequence、cursor、worker 进程状态、scheduler iteration。

应当**进入**：结论、改动、证据、未解决项、冲突、需要判断的东西。

但必须同时成立：

```
compress orchestration state  ≠  hide decision evidence
```
**证据不能压没。** 判断"要不要接受这次改动"需要结论**加依据**；压缩该删的是机器状态，不是证据。把"压缩"做成"隐瞒"是缺陷。

**`INV-5` 机械事实由产品观察（Product Observes Mechanical Facts）**

**禁止**让 agent 自己申报机械事实（`write_scope_valid = true` / `files_exist = true` / `tests_pass = true`）。正确模型：

```
Palimpsest 观察 diff        → scope_valid
Palimpsest 检查文件系统      → expected_files_exist
Palimpsest 执行授权命令      → tests_pass
```
Agent 只表达"我认为这块工作完成了"。这条直接根治第 1 期活体暴露的 `write_scope_valid` 语义问题（当时那条证据是**同一条测试命令被打上标签**，本身不独立证明范围）。见 §2.6 与附录 A。

**`INV-6` 独立执行机会律（Exploit useful independence; never manufacture agents）**

```
主代理的直接工作是一等公民；
当存在安全、可分离且具有实际收益的独立执行边界时，Palimpsest 默认允许并鼓励利用它；
不存在这种边界时，单执行者是正常形态。
```
判定顺序是**先问要不要委派，再问怎么委派**；"多执行者数量"**不是**产品成功指标。

**`INV-7` 执行前固定完成标准（No Hidden Moving Goalposts）**

任务开始后完成标准**不得**突然改变。质量要求必须是

```
Q_T = f(ProjectStandard, TaskEnvelope, TaskSpec, PolicyVersion)
```
并在**执行前固定**。执行后只能 `observe against Q_T`，**不能**看完结果再发明新标准。第 1 期已把 Q_T 落在 `ProjectStandard` + envelope 上，因此本条是**确认时机**问题（§8 未决项 4），不是新增机制。

---


## 1. 完成标准（Done-ness）一次声明、产品推导

### 1.1 形状：`ProjectStandard`

```ts
/** 用户语言的完成标准；由产品从仓库推导成候选，用户确认或改写。 */
interface ProjectStandard {
  readonly statement: string;                    // 用户的话，如 "测试通过，且不越界改文件"
  readonly clauses: ReadonlyArray<StandardClause>; // 推导出的机器条款（可编辑）
  readonly derivedFrom: readonly string[];       // 推导依据（如 "package.json:scripts.test"）
  readonly confirmedBy: string;                  // 操作者标识；未确认的候选不得作为门禁
}
type StandardClause =
  | { readonly kind: "command_succeeds"; readonly command: readonly string[]; readonly predicate: "process_exit_zero" | "tests_pass" | "lint_pass" }
  | { readonly kind: "files_exist"; readonly paths: readonly string[] }
  | { readonly kind: "scope_respected" };        // → write_scope_valid
```

### 1.2 推导器（`deriveProjectStandard`）

从仓库**只读探测**，产出一个**候选**（绝不自动生效）：

| 探测 | 依据 | 候选条款 |
|---|---|---|
| Node | `package.json` 的 `scripts.test` / `scripts.lint` | `command_succeeds: ["npm","test"]` / `["npm","run","lint"]` |
| Python | `pytest.ini`/`pyproject.toml`/`tests/` 且 `pytest` 可用 | `command_succeeds: ["python","-m","pytest"]` |
| Rust | `Cargo.toml` | `["cargo","test"]` |
| Go | `go.mod` | `["go","test","./..."]` |
| 其它 | 仅源码树 | `scope_respected` + `files_exist`（无命令条款） |

**探测到的命令必须经"可执行性 + 沙箱可 spawn"双重校验**（见 §5.1），不可执行的候选必须**在提议时**说明原因，而不是等用户跑到最后。

### 1.3 与既有 policy / gate / envelope 的关系

```
操作者策略（profile.policy.allowed_commands）  = 上界：绝不允许之外的东西执行
ProjectStandard（本项目完成标准，用户确认）    = 本项目"算完成"的条款
envelope.allowed_commands                      = 探测到的命令 ∩ 策略上界（自动写入，非 agent 编写）
release gate 的 require                        = Standard 的 clauses → GateDefinition
```

三者**一处生成、多处引用**：`ProjectStandard` 确认后，产品**自动声明** release gate（`gate-release`），并把它写进每个 envelope 的 `allowed_commands`。用户从此不再接触谓词词汇，也不再需要在 CLI 声明门禁。

### 1.4 禁止

- **禁止**在任何位置硬编码默认门禁命令。现状有三处：`src/composition/core.ts`（`trustedDefaultPolicy` 的 `allowed_commands`）、`src/cli.ts:344`、`src/serve.ts:461`。默认必须来自探测 + 策略。
- **禁止**由 agent 编写 `allowed_commands`；agent 只能在**已授权集合内**选择，越界必须被拒并指出可选项（现状已如此，保留）。
- **禁止**未确认的 `ProjectStandard` 生效；候选必须显式确认（会话内一句"就按这个来"或面板一次点击）。

### 1.5 验收

- `LEAN-A01`：在 Node 仓库上，**操作者不知道任何谓词词汇**也能完成一次证据记录——标准由探测提议、确认后自动声明门禁与授权命令。
- `LEAN-A02`：探测出的命令不可执行时，**提议阶段**即给出原因与替代项（不是运行时死胡同）。
- `LEAN-A03`：`envelope.allowed_commands` 恒等于"探测 ∩ 策略上界"；构造一个越界命令必须被拒且列出可选项。
- `LEAN-A04`：删除硬编码默认后，未确认标准的项目**不得**产出任何证据（诚实空态），且 readiness 明确报"未确认完成标准"。

---

## 2. 质量条由任务推导，独立复核默认在环

### 2.1 完成契约由任务**派生**（`deriveAttemptCompletionContract`）

**envelope 是 basis，不是存储。** 本规格**不为** `TaskEnvelope` 增加 `required_evidence` /
`verification_requirement` / `quality_contract` 之类的字段——那会把一个本来可以纯派生的问题变成新的
canonical contract。任务"要证明什么"是下列输入的函数：

```
deriveAttemptCompletionContract(
  ProjectStandard,          // 操作者确认的完成标准
  TaskSpec, TaskEnvelope,   // 任务自己的声明，与它运行的授权
  DeploymentCapabilities    // 这个部署实际能做什么
) → {
  basisDigest,              // H(全部输入)：同输入 ⇒ 同摘要
  mechanical,               // 三种 check kind，见 §2.7
  verification: { required, reasons },
  diagnostics               // 被收窄的、无法检查的、以及稍后会变成死路的
}
```

它是**函数结果，不是 durable artifact**：不落任何事件、不读任何存储。因此"执行前固定的标准没有被事后
抬高"（`INV-7`）是一条**机器可核**的性质，而不是承诺。

**收窄只能来自已声明的规则**（例如"全部写入路径都是文档/数据 ⇒ 该任务的命令条款不适用"），且每次收窄必须
写进 `diagnostics` 并注明是哪条规则做的——**不得**由 agent 临时判断"这次不需要"。

### 2.2 `gateId` 默认在环（由**产品**给出，不是主代理挑选）

证据要求与门禁条款由**产品**推导并放进 envelope；主代理的正常路径是 `palimpsest_finish`（附录 A）——它一步完成"记录证据 + 结算 attempt + 派生下一步要求"，主代理**从不**自己挑 `gateId`、也从不写谓词。

`palimpsest_gate` 作为**专家通路**保留：显式带 `gateId`（或由产品在 envelope 里给出）时返回 `nextEvidenceNeeded`，供需要逐步控制、调试或研究时使用（`Kernel API = expressive`）。自由谓词（不带 `gateId`）只保留给已确认标准之外的一次性诊断，且**不计入晋升资格**。

> **amendment 修正**：初版 §2.2 写的是"把这条既有通路从专家用法变成**唯一用法**"，与附录 A 的 `finish` 冲突。二者不矛盾——**产品**始终是 `gateId` 与谓词的来源，差别只在主代理是否需要亲手逐步操作。常态是 `finish`，`gate` 是专家路径。

### 2.3 独立复核进环（复核对象必须是**本次尝试的结果**）

`project_verification` 从"可选能力"变成**默认在环**：任务满足任一条件即要求独立复核（`MECHANICAL_INDEPENDENT` 或更强）：

- 触及边界/契约/安全相关路径；
- 证据只有一条命令且任务规模超过阈值（改文件数或行数）；
- `ProjectStandard` 明确要求。

复核由**另一个执行者**承担（§3），产出 `project_verification` 事实；晋升门禁的 `require` 由 §1.3 自动带上该条款。

**但复核对象有一个实测确认的硬约束（本 amendment 的核心修正）。** 当前运行时的 `project_verification` **只能验一种 subject**：

| 实测事实 | 位置 |
|---|---|
| 唯一的 subject kind 是 `CURRENT_PROJECT_HEAD` | `src/project_verification/artifacts.ts:207` |
| subject 由 **canonical ProjectIR 投影**物化（不是工作树） | `src/project_verification/provider.ts:118` |
| 唯一入口 action 名即 `verify_current_head`；描述明写 agent 不得验任意提交 | `src/adapters/dsh/project.ts:191` |
| §5 一致性规则：实际仓库 head ≠ 规范 head 时**拒绝** | `src/project_verification/service.ts:256` |

于是"任务完成 → 跑 Project Verification → 晋升"这条朴素写法在 **in-place 执行**下会落到两个都不对的分支之一：

- **agent 已提交**（in-place 下 `report()` 记录 `resultCommit`，即工作已提交）：仓库 head 已前进到结果提交、规范 head 仍停在 base → 一致性规则**拒绝**。即 **in-place 下独立复核结构性不可能触发**。
- **agent 未提交**：一致性规则通过，但复核的是 base——真正的改动躺在工作树里从未被复核。这正是"**看起来独立复核了，其实复核的是旧世界**"的错觉。

因此 §2.3 的"默认在环"在当前运行时里**无法表达"复核这次尝试的结果"**。这不是措辞问题，而是 `CF-AD-01` 记录的天花板的产品触发条件（`docs/engineering/audits/G10-AD-CARRY-FORWARD.md:15`）。修正拆成两步：§2.6 定义正确的两层质量模型，附录 B（第 2B 期）新增 `ATTEMPT_RESULT` subject。

### 2.4 禁止

- **禁止**"单证据完成超阈任务"：晋升前若复核要求未被满足，必须拒绝并说明缺哪一条。
- **禁止**把"agent 自选谓词"当作默认路径（现状）。
- **禁止**用一条与 agent 自己相同的命令冒充"独立"复核（复核主体或环境至少有一项不同，且产品记录差异）。

### 2.5 验收

- `LEAN-A05`：改代码且仓库存在**已确认**测试标准的任务，其由 envelope/task/standard **派生**出的 completion contract 必须包含 `tests_pass`；不属于该 contract 的自由 evidence **不构成该任务的完成资格**。**不新增任何 envelope 字段**——`Envelope is basis ≠ Envelope stores every derived requirement`。
- `LEAN-A06`：`write_scope_valid` **无条件**要求（`write_paths` 本就在 `TaskEnvelope` 里，无写入路径时该断言平凡成立）；`expected_files_exist` **只在执行前已声明的路径存在时**要求——合法来源仅限 `TaskSpec.required_artifacts → envelope.required_artifacts` 与标准自身的 `files_exist` 条款，**绝不**由观察到的 changed files 反推（那会违反 `INV-7`：跨目录写入**不**蕴含"凭空生成产物要求"）。
- `LEAN-A07`：超阈任务在缺少独立复核时晋升被拒，拒绝文本点名缺哪条、由谁补。
- `LEAN-A08`：复核事实记录"主体/环境与实现者不同"的可核对差异；同主体同命令的复核被拒。

### 2.6 两层质量模型与晋升就绪

§2.3 的缺陷来自把两种**性质不同**的质量判据混成一层。正确模型是两层，各有 truth owner，**互不转化**。

**第一层：机械完成（Mechanical Completion）**——基于**当前 attempt**，全部由产品观察（`INV-5`），仍属 Work Evidence / Gate 世界：

| 判据 | 产品如何观察 |
|---|---|
| `tests_pass` / `lint_pass` / `process_exit_zero` | 产品在授权命令集内执行（cwd = 该 attempt 的执行位） |
| `write_scope_valid` | 产品观察 `git diff --name-only base..HEAD` + `git status --porcelain`，与 envelope 的 `write_paths` 比对 |
| `expected_files_exist` | 产品检查文件系统 |
| `artifact present` | 产品检查声明的产物 |

**第一层的入场条件（2A-R 冻结）**：`Attempt COMPLETED ⇒ resultCommit 是包含所观察工作的不可变提交`（`changed_files == Diff(base, resultCommit)`）。这不是又一条判据，而是**其余判据有意义的前提**——若记录的提交不含工作，则"证据齐、scope 通过"描述的是一个 canonical head 里并不存在的东西。详见附录 A §A.8。

**第二层：独立复核（Independent Verification）**——仅当风险政策要求时在环。**subject 必须绑定本次尝试**，而不是当前项目 head：

```
projectId, taskId, attemptId, envelopeId, baseCommit, resultCommit, reportDigest
```
而非 `CURRENT_PROJECT_HEAD`。实现见附录 B。

**晋升就绪**由三个 truth owner 的结果**分别**给出，产品只做汇合：

```
R = G_work ∧ V_required ∧ E_promotion

G_work      = Work Evidence / Gate（产品观察）
V_required  = 独立协议结果（Project Verification）
E_promotion = 既有晋升资格（PromotionEligibility）
```

**冻结（不得违反）**：

- **禁止**把 verification PASS 铸造成 `EvidenceAtom`（不得出现 `verification PASS → mint EvidenceAtom → gate PASS` 这条链）。`PASS` 只是"那个具名协议通过了"，**不是真值**。
- **禁止**用一个旧 head 的 PASS 满足 attempt 级复核要求（附录 B 的 `LEAN-A20` 要求机器证明二者不等价）。
- 三个 truth owner 保持分开，是本层设计的**全部意义**。

### 2.7 完成契约的形状与消费者（2A-Q 冻结）

**三种 check kind，不是谓词列表。** 产品层说"要检查**什么**"，Evidence owner 说"canonical evidence **怎么形成**"：

```
MechanicalCheck =
  | RUN_STANDARD_COMMAND(command, predicate)   → tests_pass / lint_pass / process_exit_zero
  | ASSERT_WRITE_SCOPE                          → write_scope_valid
  | ASSERT_REQUIRED_ARTIFACTS(paths)            → expected_files_exist
```

**禁止**在契约里直接写谓词名再让产品层解释它——第 1 期正是这样自创了 `where.command` 那种错误解释。check kind 到 evidence 语义的映射是**单向且单点**的。

**组合规则**：`Q_task = Q_project ⊕ Q_task-shape`，其中 `⊕` **只能**增加适用的检查或收窄适用性，**绝不能**移除已确认的项目要求、也绝不能削弱操作者策略。

**一个派生，多个消费者**（本期的核心架构约束）：

```
deriveAttemptCompletionContract(...)
        ├─ finish              → 执行 mechanical 部分
        ├─ readiness           → 呈现 deployment 层与 task 层
        ├─ nextEvidenceNeeded  → 投影缺什么
        └─ 2B                  → 读 verification.required
```

**禁止**让 readiness、finish、2B 各持一套规则——那必然漂移。任何一处要改"任务需要什么"，改的都是这一个派生。

**复核有两个强度**（**2A-Q-R 校准**）：`REQUIRED` 只留给**强且执行前可知**的风险；其余是 `RECOMMENDED`（值得再看一眼，但**不阻断晋升**）。

| 触发 | 强度 | 理由 |
|---|---|---|
| `contract_boundary`（schema / contract / security / auth / proto / public-api） | **REQUIRED** | 强风险，且执行前即可判定 |
| `operator_requires_independent_verification` | **REQUIRED** | 尚无子句种类可表达，待 `ProjectStandard` 支持后再启用 |
| `single_command_bar`（标准只有一条命令） | **RECOMMENDED** | 见下 |

**为什么 `single_command_bar` 不能是 hard requirement**：命令**数量**不是证据**强度**的代理——一条 `npm test` 可能跑 5 个断言，也可能跑 500 个。把它当硬要求，会让"主代理修一个小函数 → tests PASS → scope PASS → commit materialized"仍然被迫启动第二执行者，等于重新滑向"为了多 Agent 而多 Agent"，与 `INV-6`（**exploit useful independence; never manufacture agents**）和 G10-R 测到的"人为 role split 可能是纯开销"直接冲突。**触发名必须说清它测的是什么**：叫 `single_command_bar`，不叫 `single_evidence`——后者的措辞本身就是一个比它实际测量更强的 epistemic 主张。

**`REQUIRED` 保持窄**（2B v1 只做 `contract_boundary`）：不要一开始就加"大 diff""文件很多""感觉复杂"这类触发——**尤其"大 diff"在执行前根本不知道**。若将来确需 size threshold，唯一严谨的做法是**提前声明条件、事后只观察是否成立**（例：执行前固定 `changed_files > 8 ⇒ required`），这样仍满足 `INV-7`。

**`RequirementBasis ≠ CapabilityAssessment`**（冻结）：

```
basisDigest          = H(ProjectStandard, TaskSpec, TaskEnvelope)      ← 只含规范性输入
CompletionReadiness  = assess(CompletionContract, CurrentCapabilities) ← 动态评估
```

**capabilities 不是契约派生的入参**（由构造保证，不靠约定）。否则 verifier 在任务中途被配置好，会让 `basisDigest` 变化而**标准本身没动**——那会削弱 `INV-7` 的语义。2B 会引用这个摘要作为**要求的身份**，所以它必须只表示"标准"，不表示别的。

**readiness 分两层，且两层强度不同**：

- `R_deployment` 是**描述性**的：`CONFIGURED` / `DEGRADED` / `INCOMPLETE` + capability 事实 + `gaps`。**不叫 blockers**——缺 capability 只在具体任务需要它时才是 blocker。若部署层也报 `BLOCKED`，就会出现"系统显示 BLOCKED、这个 task 又是 READY"这种产品语言上的自相矛盾。
- `R_task` 是**可行动**的：`READY` / `BLOCKED` + `blockers`（外加 `advisories`，承载 RECOMMENDED 但当前不可用的情况——说出来，但绝不拒绝）。

```
Task readiness is actionable; deployment readiness is descriptive.
```

**`A14` 的真正判据是"不能晚失败"，且规则要精确**：

```
已知要求 ∧ 缺失能力  ⇒  提前阻断
```

不多也不少。当前任务要跑测试而沙箱不可用 → `BLOCKED`；当前任务是纯文档 → 沙箱不可用**无关**；当前任务要独立复核而无 verifier → `BLOCKED`；当前任务不要求复核 → 那是 **capability gap，不是 blocker**。要求"所有未来可能用到的能力启动时都在"会让启动变成误报，那正是本机制要防的晚失败的镜像。

> **本期与 2B 的边界**：`verification.required` 在 2A-Q **已派生但不执行**——2B 之前它只是 readiness 上的诚实陈述，尚不能在晋升时强制。这个中间缺口是已知的，且是本规格要它显式可见的原因，而不是等 2B 再重新发明"哪些任务需要复核"。**校准后的后果**：普通低风险 code task 的 `required = false`（只是 recommended），因此 direct path 不会因缺 verifier 而被阻断——这才是"2A 的产品证明"要跑的那条路径。

---

## 3. 选择性委派：主代理发起，产品汇合

### 3.1 派发主体是**主代理**，不是调度器

**"多执行者"必须拆成三个性质完全不同的问题**，不能设计一个 `spawn_agent()` 然后全往里面塞：

| 类别 | 问题形态 | 既有 owner | 可否写项目 |
|---|---|---|---|
| **A 认知并行** | 这个问题有多种解释/方案 | ReasoningCell（branch） | **WriteSet = ∅** |
| **B Work 并行** | Task A 与 Task B 是真正独立的项目工作 | Task/Attempt + worktree | 可以（治理难度最高） |
| **C 独立复核** | 实现已存在，需要另一独立主体检查 | Project Verification | **不应写** |

```
MultiExecutor = CognitiveParallelism ∪ WorkParallelism ∪ IndependentVerification
```

**派发由主代理发起**（`INV-1`/`INV-2`/`INV-6`）：产品**不默认派发**、不自动把独立任务分给不同执行者。产品的职责是——当主代理选择委派时——承担上下文分片、并发上限、租约、结果回收与汇合。产品可以在被问到时**建议**某块工作适合委派（§8 未决项 6），但建议不是派发。

**当前实现缺口（本 amendment 记录，附录 C 立项修）**：今天多执行者只能由产品在**一次请求内**发起——`palimpsest_collaborate` 是阻塞的 one-request 调用（主代理调它就得等，无法同时干自己的活），`workerDispatch` 只是 effects 层的内部动作（`src/effects/actions.ts:285`），**主代理够不到**。这正是实测中"真正的多执行者通道一次都没跑过"的结构原因：不是通道坏了，是没有给主代理的入口。

### 3.2 汇合与冲突

- 汇合由产品执行：按依赖顺序把各执行者的 `result_commit` 依次晋升，冲突在**晋升前**用既有 `write_paths`/scope 证据暴露，而不是在 git 层撞车。
- 冲突策略必须显式：写路径重叠的任务**不得**并发派发（在计划校验期即拒绝并给出串行化的计划修订）。

**写冲突规则必须覆盖主代理自己**，不是只比较 workers：

```
∀ i ≠ j : Mutating_i ∧ Mutating_j  ⇒  WriteSet_i ∩ WriteSet_j = ∅
其中 i, j ∈ { 主代理的 in-place attempt, Worker A, Worker B, ... }
```

**产品只有在主代理正处于一个受管 in-place attempt 中时才知道 `PrincipalWriteSet`。** 如果主代理完全绕过 Work（直接用 edit 改仓库、没有 active attempt），则 `PrincipalWriteSet = unknown`，此时**不得**宣称 mutating delegation 安全。v1 必须 **fail closed**：

```
现在可以委派认知类工作。
要委派会写项目的工作，请先进入一个受管任务，这样你的写范围才是已知的。
```

**但这句话不得成为推给主代理的机器概念**（否则违反 `INV-1` 与 §0.5）。正确做法是 `palimpsest_delegate` / `palimpsest_finish` **自动完成 claim**，主代理只说"我要委派这块"。§8 未决项 6 记录该选择。

**更深的内核限制（必须显式承认）**：当前 Palimpsest **不支持 old-base 并行晋升**——`A based on H0` 与 `B based on H0`，A 晋升 `H0 → H1` 之后，B **不能**把基于 H0 的结果晋升到 H1（`cross_revision_promotion_not_supported`，`src/domain/promotion_eligibility.ts:46`；G10-X/Z 已冻结）。即使 `WriteSet(A) ∩ WriteSet(B) = ∅` 也一样。因此：

```
write-set 不相交是必要条件，不是充分条件
```

**真正的并行代码 worker 不得在近期的任何一期草率打开**；需要它时走附录 C 的 D3（Result Transplant），**绝不**放松 G10-Z。

### 3.3 空产出的硬规则（收窄：只约束 Work 执行位）

**任何消耗 attempt 预算的 Work 执行者必须留下可观察的工作**：`report(completed)` 在观察到的 `changed_files` 为空、且 `produced_artifacts` 为空时**必须被拒**，并提示改为 `failed`/`cancelled` 或修订计划。这条直接消灭实测中那次"机械 pump 报 completed、零产出、零证据"的浪费。

**收窄（amendment 新增）**：真正只需要分析、不需要修改项目的任务**不应该被硬塞成 Work Attempt**——它应该走认知分支 / 独立复核 / 跨项目 Ask。因此：

- **禁止**给 `TaskSpec` 增加 `allow_empty_output = true` 这类开关；正确做法是**路由**，不是豁免。
- 空产出拒绝文本必须**指出正确的执行位**（"这类任务请走认知分支或跨项目 Ask"），符合 §5.3。

### 3.4 禁止

**适用范围限定（amendment 新增）**：以下禁止条款**仅适用于存在独立任务的任务图**，即"任务图中确有可分离的独立工作"这一前提下。它们**不适用于直接工作路径**——主代理 read → edit → test → finish（`INV-1`）**不是**本节的禁止对象，且不得被任何实现读成禁止对象。

- **禁止**在**存在独立任务的任务图中**把多执行者协作降级为"单个 agent 顺手做完，账本旁观"。
- **禁止**机械 actor 在无可观察产出时占用 attempt 预算（§3.3）。
- **禁止**并发派发写路径重叠的任务（§3.2，比较集合必须含主代理的 in-place attempt）。
- **禁止**为凑数制造执行者（`INV-6`）；"多执行者数量"不得成为任何验收项或指标。
- **禁止**让产品默认派发（§3.1）；派发主体是主代理。

### 3.5 验收

- `LEAN-A10`：写路径重叠的计划在启动校验期被拒，并给出串行化修订建议；比较集合**包含**主代理的 in-place attempt（构造"主代理改 A、委派 worker 也改 A"必须被拒）。**（D2-r1 重定形：见 §D2.6——D2 的准入不是"重叠即拒"而是"不存在第二条 mutating lane"，严格更强；write-set 比较属 D3。）**
- `LEAN-A11`：**移交第 2A 期**（`palimpsest_finish` 是空产出拒绝的落点，见附录 A `LEAN-A17`）。
- `LEAN-A09`：**移交 `PLMP-DELEGATE-1`（附录 C，D2 阶段）**——它要求"两个执行者完成三任务项目"，在旧 §3.1（产品默认派发）下成立，在新方向下必须由主代理发起委派才成立，故随 §3 重新定界。**（D2-r1 重定形：见 §D2.6——exclusive mutation 下同一时刻只有一条 mutating line，"两个执行者同时改项目"不再适用。）**

---

## 4. 用户的常态动作只剩一个：晋升边界的接受 / 退回

### 4.1 形状

一屏（面板内或会话内等价呈现）给出**结论与依据**，用户只做一次选择：

```
本次改动：src/dedupe.ts、test/dedupe.test.ts（+42 −3）
证据：tests_pass 通过（产品执行，exit 0）｜ scope 校验通过
复核：独立执行者 B 复跑（不同环境），PASS
未验证：无
风险提示：无
[ 接受 ]   [ 退回并说明 ]
```

### 4.2 入口合一

"声明完成标准"与"接受结果"必须在**同一处**可达（面板与 CLI 同源）；默认门禁按 §1.3 自动声明，因此**不存在**"按钮要一个没人声明过的 gate"这种死路。

### 4.3 禁止

- **禁止**任何用户可见的操作者控件出现：谓词词汇、attempt 选择器、**exit code 输入框**。
  （实测缺陷，**已在第 1 期修复**：`web/src/Panels.tsx` 的"记录门禁证据"表单曾收集 `exitCode` 且默认命令写死 `python -m pytest`，而服务端已忽略该字段并改为真实执行——**控件在说谎**。现表单已无 `exitCode` 字段，命令与门禁改为选择，由 `LEAN-A13` 的源码级断言守住。）
- **禁止**把调度推进（单步/机械推进）作为用户的常规动作；它只能是诊断面板里的高级项。
- **禁止**接受/退回按钮依赖用户先手工完成任何机器步骤。

### 4.4 验收

- `LEAN-A12`：从"agent 完成"到"用户接受"的路径上，用户**零次**接触谓词/attempt id/exit code/调度步进。
- `LEAN-A13`：新项目上"接受"按钮**立即可用**（门禁按 §1.3 已声明），不存在 `gate-release is not declared` 死路；面板源码中不再存在 `exitCode` 表单字段（源码级断言）。

---

## 5. 稳定性：接缝必须是前置校验，不是事后发现

### 5.1 readiness 必须校验**操作者自己的配置**

现有 readiness 诚实报告"8 个未配置平面"，但**不校验**用户自己写下的东西。新增校验（全部进 readiness，且进会话开场摘要）：

| 校验 | 失败后果（现状） | 失败后应有 |
|---|---|---|
| `policy.allowed_commands` 是否可执行、是否覆盖探测到的工具链 | 跑到最后才知道永远产不出证据 | 启动即报，并给出建议条款 |
| 探测到的命令在**沙箱内**能否 spawn（如 Node test runner 需要 `--test-isolation=none`） | agent 自行发现并绕行 | 探测期给出可用形式，写入候选标准 |
| 完成标准是否已确认 | 空态无解释 | 开场一句"请确认完成标准" |

### 5.2 顺序契约由产品保证

任何"必须先做 A 才能做 B"的顺序，产品必须在启动时把 A 做完或给出明确入口（例：gate 必须先于证据 → 项目启动时按 §1.3 自动声明默认门禁）。**不得**要求用户用机器词汇、按未文档化的顺序完成前置。

### 5.3 每条拒绝必须给出补救路径

拒绝文本必须命名**具体的补救动作**（哪条命令、哪个路径、哪两个提交、哪个下一步工具）。这是既有方向（#134/#137/#138 已做到），本文把它升格为规格：**没有补救路径的拒绝视为缺陷**。

### 5.4 验收

- `LEAN-A14`：在一个故意配错 `allowed_commands` 的部署上，**启动**即报告失败原因与建议；在一个 Node 仓库上，探测期即给出沙箱可用的测试命令形式。

---

## 6. 依赖与不改的东西（冻结清单）

| 冻结项 | 依据 |
|---|---|
| 证据原子的形状与"观察替代申报" | SR-1 #134；本文不得复活申报通道 |
| 晋升链不变式与 head 对账 | G10-X / G10-Z |
| 账本事件形状、幂等键、不可变声明 | 既有 schema |
| 公共 API 面与 architecture 门禁 | SR-1 §4/§28（`public-api` 0/0/0，0 violation，不新增 exception/SCC） |
| DSH 宿主中立（插件零内嵌 LLM） | `18-architecture-modes-spec.md` 红线 |
| 操作者拥有策略上界与接受权 | 本文 §0.4 |
| **复核 ≠ 证据；`PASS` ≠ 真值** | G10-AD；本文 §2.6 |
| **不放松 G10-Z**（old-base 跨 revision promotion） | G10-X/Z；本文 §3.2、附录 C D3 |
| **不新增 `DelegationStore` / `DelegationEvent` / `DelegationAuthority`** | 本文 §0.5；附录 C（委派是**投影**，不是新的真值种类） |
| **不新增 `UniversalDelegationContext`** | 附录 C（复用各 owner 既有的上下文类型） |
| **主代理的直接工作路径**（direct path） | 本文 §0.6 `INV-1`；任何实现不得使其成为必经委派 |
| **不扩大 canonical `AttentionService` 的语义** | 附录 C（主代理侧注意力在 application/host 层合成） |

---

## 7. 交付路线图与出口

| 顺序 | 阶段 | 目的 | 改内核？ | 出口（确定性可验） |
|---:|---|---|---|---|
| **0** | `LEAN-1` amendment（**本文**） | 修正 L3、冻结七条不变量与 direct path、修正复核主体 | 否（仅文档） | 本文合并且全文无自相矛盾；无验收项 |
| **1** | `LEAN-1` 第 1 期（**已交付** `217214c`） | 标准推导 + 操作者控件清理 | 很少 | `A01`–`A04`、`A12`、`A13` |
| **2A** | Completion Handoff（**部分交付** 2026-09-21） | `palimpsest_finish`：主代理做完工作后不再亲自操作治理机器 | 很少 | `A16`–`A18` **已通过**；`A15` **仅确定性一半**（活体与 gate PASS 未做） |
| **2A-R** | Completion Integrity Closure（**已交付** 2026-09-21） | 冻结"完成的 in-place 工作必须 commit-materialized"；worktree 下 `finish` fail closed；主代理投影去掉 `attemptId` | 很少 | `A22`–`A25` **全部通过**；**2B 的前置**——没有它，`ATTEMPT_RESULT` 的 subject 可能指向不含工作的提交 |
| **2A-Q** | Completion Contract + readiness（**已交付** 2026-09-21） | §2.1 完成契约**纯派生**（`deriveAttemptCompletionContract`，**不是新的真值属主**、不落任何事件）+ §2.7 三种 check kind + §5.1 readiness 分两层（标准已确认？命令可执行？沙箱可 spawn？所需 verifier 可用？） | 很少 | `A05`、`A06`、`A14` **全部通过** |
| **2A-Q-R** | verification policy calibration（**已交付** 2026-09-21） | 复核两强度（`single_command_bar` 降为 RECOMMENDED 并改名）、`basisDigest` 排除 capabilities、capability 说明移出契约、部署层 readiness 改为描述性 | 很少 | `A05`/`A06`/`A14` 扩到 19 项全通过；**校准后普通低风险任务 `required = false`，direct path 不再被阻断** |
| **2A live** | 2A final live gate | 一次真实 DSH 收口：用户一句标准 → read/edit/test/commit/finish → materialized / scope / tests / gate 全 PASS | 无 | **`A15` 活体那一半已由 `A33` 关闭**（2026-09-22）。此前两轮失败暴露的零产出泵（`A26` 已修）与"无开始入口"（2A-B 已修）均已闭合 |
| **2A-B** | Direct Work Bootstrap（**已交付** 2026-09-22，附录 E） | `palimpsest_begin`：与 `finish` 对称的开始协议。主代理把目标编译成最小 direct proposal，产品验证并机械建立唯一受管工作位 | 很少（组合既有原语） | `A27`–`A32`、`A34` **确定性通过**；**`A33` 活体通过**（`begin`×1、`finish`×1、低层工具调用 ×0、gate PASS）。v1 仅 repository-bound + in-place、`writePaths` 非空 |
| **2B** | Attempt-bound Verification（**规划，附录 B；B-r1 已修订**） | 正确的复核 subject（`ATTEMPT_RESULT`），触发 `CF-AD-01`，按 §8(5) 的 **(a′)** 以隔离检出物化不可变提交；subject union + 新 verifier ref + promotion admission bridge + application 层 finish 编排 | 是，小而明确 | `A07`、`A08`、`A19`–`A21`、**`A35`–`A38`**。唯一硬触发是 `contract_boundary` |
| **3** | `PLMP-DELEGATE-1` D1：异步认知委派（**CLOSED / STRONG PASS**，`4b77321`/`8ecc783`） | 主代理自己工作 + 后台认知并行 | 否/极少 | `DEL-A01`–`DEL-A08` **全部通过**（含两个活体 barrier：D1-f 异步 barrier、D1-g frozen-read barrier）；公共面 `RESEARCH`（`start`/`status`/`inspect`）；`delegate → PROJECT_READ_ONLY`、`collaborate → RESULT_ONLY`；`WORK` 类委派在写范围未知时 **fail closed**（§3.2） |
| **4** | `PLMP-DELEGATE-1` D2：异步 Work 委派（**D2-r1 DESIGN FROZEN / PASS；D2 = IMPLEMENTATION GO；D2-a 已交付**） | isolated worker，exclusive mutation：把"后台认知 worker"升级为"后台真实 Work executor"，同时仍只有一条 mutating line | 中 | `A10`/`A09`（按 §D2.6 **重定形**）+ `DEL-D2-A01`–`A06`；D2 专属活体；**已交付 D2-a**（execution world + 统一 completion observation，7 项验收）与 **D2-b**（bootstrap existing scheduler-admissible canonical Work task：入口形状、envelope authority 复用、lane 占用、P0–P7 preflight、retry 收敛，9 项验收；见 §D2.8/§D2.9）——两片均**无 LLM** |
| **5** | Dogfood checkpoint | 判断是否**真的**需要并发写 | 无 | 一份判断结论（无验收项） |
| **6** | `PLMP-DELEGATE-1` D3：并发写 | Result Transplant + multi-writer | 只有真实需求才做 | D3 专属验收在 `PLMP-DELEGATE-1` 内定义 |
| **7** | Adaptive delegation | 用 empirical history 改善委派选择 | 产品层 | 产品层验收（无内核门禁） |

**第 2 期拆分的理由**：2A 与 2B 解决两个不同问题——2A 是"人不管治理机器"，2B 是"复核对象正确"。2A 几乎不动内核且立刻消除实测中"工作完成但 attempt 停在 RUNNING"的摩擦；2B 必须动 subject kind，风险小而明确。两者不应捆在一起交付。

**验收项去向（amendment 重映射，避免孤儿）**：`A09` 与 `A10` 原本挂在旧 §3（产品默认派发）下；`A11` 原挂在旧 §3.3 下。现分别移交 D2、D2、2A（成为 `A17`）。`A05`–`A08` 保留但改挂到 2A/2B。

每阶段必须：确定性门禁（`tsc -b`、vitest、`architecture:check`、`check-public-api`、playwright）全绿；新增活体场景脚本落 `rs-test/`；**不得**新增 architecture exception/SCC，不得变更公共 API。**任何工具契约变更**（如 2B 新增 action）必须显式登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity，不得顺手改。

---

## 8. 待操作者裁决（实现前需要一句话）

1. **接受/退回的形态**：面板内为主、会话内等价呈现（推荐），还是只做其中之一？
2. **独立复核阈值**：全部任务默认在环，还是仅超阈任务？（影响成本与延迟。**amendment 收窄为 §2.6 的两层模型 + 附录 B 的风险推导表**。）
3. **并发上限与冲突策略**：默认并发数，以及写路径重叠时的处理（拒绝计划 vs 串行化重排）。
4. **`ProjectStandard` 的确认时机**：项目启动时一次确认（推荐），还是每次晋升时确认？（`INV-7` 只要求"执行前固定"，不指定时机。）
5. **in-place 执行与独立复核的关系**（**amendment 新增；2A-R 已按操作者裁决定为 (a′)**）：§2.3 实测显示 in-place 下当前复核无法触发，三条路——
   - **(a′)（已裁决）Commit-bound isolated verification**：`finish` 成功即保证工作已 commit-materialized（§A.8），于是 `AttemptResultSubject` 绑定的是一个**真正不可变的 Git 对象**；verifier 用**隔离 checkout** 精确物化该提交并跑协议，**不**要求 ambient HEAD 等于 `resultCommit`（否则主代理一继续推进，已完成工作的复核就无法运行）。作者执行位与 verifier 执行位无关：作者 in-place，verifier 隔离检出。
   - ~~(a)~~ 已被 (a′) 取代：(a) 的"仓库 head == subject.resultCommit"会把主代理锁死在已完成的工作上。
   - (b) 独立复核只在 promotion **之后**进行，以结果提交为 subject。**反对**：这会把 Verification 从 admission input 降为 post-hoc audit，无法阻止有问题的结果进入 canonical head。可作为 promotion 后的 monitor/audit 存在，但不能替代晋升前的 attempt 复核。
   - (c) 要求需要独立复核的任务改走 **worktree** 执行器。**反对**：这会把主代理的直接路径重新变成二等公民（`Author placement ≠ Verifier placement`）。
6. **委派时的写范围 claim 是否自动**（**amendment 新增**）：§3.2 要求 mutating 委派在 `PrincipalWriteSet` 未知时 fail closed。是把"先进入受管任务"这句话推给主代理（违反 `INV-1`），还是由 `palimpsest_delegate` / `palimpsest_finish` **自动 claim**（**推荐**）？以及产品是否可以在被问到时**建议**某块工作适合委派（`ASSIST` 模式）？

---

## 附录 A（第 2A 期）：Completion Handoff —— `palimpsest_finish`

### A.1 目标

实测最后一次活体会话的形态是：主代理做完了代码，`tests` 通过、scope 通过、gate 可以 PASS，但 **attempt 仍停在 RUNNING**——因为主代理与内核之间还有协议摩擦（它得自己 report、自己挑谓词、自己对齐门禁）。本期的目标是一条不变量：

```
主代理做完工作后，不再亲自操作治理机器。
```

依据：`INV-1`（直接路径一等公民）、`INV-5`（机械事实由产品观察）、`L1`（一次表达）。

### A.2 工具形状

```ts
palimpsest_finish
  input : { summary?: string }        // 只需要"我认为这块完成了"这一句
  拒绝  : attemptId / gateId / predicate / exitCode / changedFiles / workerId / authority
```

不需要主代理提供 `attemptId`、`gateId`、`predicate`、`exitCode`、`changedFiles`——这些全部由产品派生。

> **契约变更提示**：这是**新增工具**，必须显式登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity（§7 的通用要求），不得顺手加。

### A.3 推导链（一次调用内完成）

```
1. 找到当前主代理唯一的 active attempt
     0 个 或 >1 个 → 拒绝，并给出补救（进入/收敛到唯一受管任务）
2. 观察执行位
     in-place → git diff --name-only base..HEAD + git status --porcelain（过滤 .palimpsest/）
     worktree → 该 attempt 的 worktree 观察
3. 派生 changed_files
4. 与 envelope.write_paths 比对            → write_scope_valid      （产品观察，INV-5）
5. 检查声明的产物                          → expected_files_exist   （产品观察）
6. 在授权命令集内执行 CompletionContract 命令 → tests_pass / lint_pass / process_exit_zero
     （授权集 = 探测 ∩ 策略上界，§1.3；产品在正确 cwd 下真实执行并记录**自己观察到的**退出码）
7. 记录产品观察到的 Evidence 原子
8. 生成 AttemptReport
9. 结算 attempt（COMPLETED）
10. 派生 nextEvidenceNeeded（若 §2.3/附录 B 要求复核，则指向复核）
```

### A.4 失败模式：attempt **保持 RUNNING**，绝不结算

| 情形 | 行为 |
|---|---|
| 测试/命令失败 | attempt 保持 RUNNING；返回**确切失败 + 补救**（哪条命令、观察到什么） |
| scope 越界 | attempt 保持 RUNNING；**点名越界路径** |
| **有未提交的工作**（§A.8） | attempt 保持 RUNNING；**点名未提交路径**并要求 commit 或 revert（在任何命令执行、任何证据记录**之前**拒绝） |
| 空产出（§3.3） | 拒绝，并**指出正确的执行位**（认知分支 / 复核 / 跨项目 Ask） |
| 无 active attempt | 拒绝，给出进入受管任务的入口 |
| **worktree 执行** | **fail closed**：该模式的工作树路径属 git port，高层路径无法观察，不得假装检查过 scope 与产物 |

### A.5 禁止

- **禁止** `finish` 接受 `exitCode` / `changedFiles` / `predicate` / `gateId`（`INV-5`、SR-1 #134 不得复活申报通道）。
- **禁止**在机械事实未通过时结算 attempt（不得"先完成、后补证据"）。
- **禁止** `finish` 铸造 Evidence 之外的任何真值。
- **禁止** `finish` 触发晋升——晋升仍是操作者唯一的真判断（§4）。

### A.6 验收

- `LEAN-A15`：主代理 `read → edit → shell → finish`（**一次** `finish` 调用）后 attempt 为 COMPLETED、证据齐、gate PASS；主代理全程**零次**接触 `predicate`/`gateId`/`attemptId`/`exitCode`/`report`（源码级 + 活体双证）。
- `LEAN-A16`：测试失败时 attempt **保持 RUNNING**，返回确切失败与补救，且**不产生** PASS。
- `LEAN-A17`：空产出 `finish` 被拒，拒绝文本指出正确执行位（**取代旧 `LEAN-A11`**）。
- `LEAN-A18`：`finish` 记录的 `write_scope_valid` 是**产品观察**——构造"agent 声称在范围内、实际越界"必须被拒（**根治第 1 期暴露的 scope 证据语义问题**：当时那条证据是同一条测试命令被打上标签，本身不独立证明范围）。

**2A-R 验收（Completion Integrity，`test/lean_finish_integrity.test.ts`）**：

- `LEAN-A22`：**未提交的工作不能 finish**——拒绝文本点名未提交路径、给出 commit/revert 补救，attempt 保持 RUNNING，且**一条证据都没记录**（检查发生在任何命令执行之前）。
- `LEAN-A23`：**成功 finish 后 `resultCommit` 真的包含工作**——`git diff --name-only base..resultCommit` 等于 `changedFiles`、该提交里确实有改动内容、工作树在该提交上干净。
- `LEAN-A24`：worktree 模式下 `finish` **fail closed**，拒绝文本给出补救（改用 `palimpsest_report` 或切到 in-place），**不假装**检查过 scope 与产物。
- `LEAN-A25`：主代理投影**不含 `attemptId`**，而应用层结果仍含它（`INV-4`：编排状态不进主上下文）。

### A.7 活体场景

```
用户给一句标准
→ 主代理直接工作（read / edit / shell）
→ 主代理只调用一次 finish
→ attempt completed、证据完整、gate PASS
→ 操作者看到接受/退回界面（§4.1）
```

---

### A.8 `finish` 成功必须满足：工作已 commit-materialized（**2A-R 冻结**）

**不变量**：

```
finish 成功  ⇒  工作树干净
                且 changed_files == Diff(baseCommit, resultCommit)
```

**为什么必须冻结（实测）**：2A 的观察同时统计 `git diff --name-only base..HEAD` 与 `git status --porcelain`，因此**未提交的工作也会被计入 changed_files**，而 `result_commit` 取的是当前 HEAD——**一个不包含这些工作的提交**。探针在 `main@89377c7` 上得到：

```
finish outcome       : ACCEPTED
changedFiles         : ["src/dedupe.ts"]
HEAD == base         : 327f7724efef
working tree dirty   : "M src/dedupe.ts"
report.result_commit : 327f7724efef
resultCommit 包含该工作: NO
```

**为什么它同时是 2B 的前置**：in-place 晋升守卫（`#assertInPlaceAttemptCurrent`）只比较"记录的提交 == 仓库 HEAD"，在上述状态下两者都是 base，**守卫通过**，晋升可能记录一个 canonical head 不含工作内容的 COMMITTED 结果。而 2B 的 `ATTEMPT_RESULT` subject 若指向一个不含工作的提交，就会得到"验证跑得很漂亮、但 subject 错了"——这正是本类系统最该防的错误。**必要条件与充分条件**：守卫是必要的但不充分，`#assertCompletionMaterialized` 补上另一半。

**为什么拒绝而不是代提交**：`git commit` 是普通 coding agent 的正常工作（read / edit / test / commit），不是治理机器。产品要隐藏的是 `gateId`/`predicate`/`attemptId`/`lease`/晋升协议/证据构造，**不是普通 Git 工作**。因此正确体验是：

```
Agent: 修改 → commit → palimpsest_finish()
若忘了 commit：finish 拒绝并列出未提交路径，补救路径明确
```

### A.9 `INV-4` 在 `finish` 返回面上的体现

应用层结果**保留** `attemptId`（操作者面板可能需要它），但 **DSH 适配器投影掉它**——主代理看到的只有 `state` / `changedFiles` / `evidenceRecorded` / `nextEvidenceNeeded`。"这是哪个 attempt"从不是主代理要做的判断。这正是 `Application/Internal result ≠ Principal result projection`。

## 附录 B（第 2B 期）：Attempt-bound Verification

> **状态：规划（未实现）**。`B-r1` 修订（2026-09-22，实现前）：逐段对照当前 Verification runtime 后，把 2B 从 *architecture direction PASS / implementation HOLD* 推到可开工。**新核两处代码事实**：first-party verifier 就是 `commandProjectHeadVerifier({ command: "git", args: ["diff", "--check"] })`（`src/composition/governance.ts:176`）——在 clean checkout 里必然 PASS，故**旧 head verifier 绝不能扩成 attempt verifier**（§B.11）；`ProjectHeadVerificationSubject` 硬编码于 `provider/status/artifacts/store` 四处（§B.8）；`PromotionManager.assessEligibility()` 是唯一 assessor、有 5 处调用点（§B.14）。修订九项：① B.4 与 #147 校准；② subject **union**（不是新系统）；③ Work-backed materialization owner，调用方永不提供 commit/digest；④ agent-facing **不接收 `attemptId`**（0/1/>1 目标推导）；⑤ **新建 verifier ref**，旧 head verifier 不动（避免假验证 + 旧历史 stale）；⑥ Verification service 控制的隔离检出 port（throw/timeout 也 cleanup）；⑦ freshness **按 kind 分开**、`ATTEMPT_RESULT` 绝不查 ambient HEAD，且 runtime capability **subject-aware**；⑧ promotion **显式 admission bridge**（Verification-agnostic 投影 + typed blocker + 挂在唯一 assessor 上，promotion domain 不 import Verification）；⑨ 正常 `finish` 在 **application 层**自动触发 required verification（`Verification FAIL ≠ Work FAIL`）。验收增补 `A35`–`A38`。

### B.1 触发 `CF-AD-01`

`CF-AD-01` 的原文触发条件是"A product need to verify something that is not the project head, **WITH a different admission design**"（`docs/engineering/audits/G10-AD-CARRY-FORWARD.md:15`）。§2.3 的实测正是这个需求，本期即其产品触发。

### B.2 新 subject 形状（**扩展 subject kind，不新建第二套 Verification**）

```ts
interface AttemptResultVerificationSubject {
  readonly schemaVersion: 1;
  readonly kind: "ATTEMPT_RESULT";
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly baseCommit: string;
  readonly resultCommit: string;
  readonly reportDigest: string;
  readonly digest: string;    // canonicalDigest({ domain: ATTEMPT_RESULT_SUBJECT_DOMAIN, subject })
}
```

要点：

- **不是** head subject，故不带 `projectRevision` / `projectDigest` / `headCommit`。
- **不是**新的真值种类。`VerifierRegistry`、`IndependenceClass`、`VerificationHistory`、`PASS|FAIL|SCORE|UNRESOLVED|ERROR` **全部复用**。
- 新增一个 **Work-backed read port** 供物化：从 attempt 的 canonical 记录读 `resultCommit` / `reportDigest`，**调用方永不指定验证目标**（沿用既有 §4 纪律）。

### B.3 一致性规则：两种 subject 的**规则不同**（2A-R 修正）

两条既有纪律不变——"subject 必须由 canonical 状态物化"、"ambient git 永不被当作 subject"——但 **`ATTEMPT_RESULT` 不能沿用 head 的 ambient 比较**。

| subject kind | 一致性要求 |
|---|---|
| `CURRENT_PROJECT_HEAD`（现状） | 仓库 head == `subject.headCommit`。**保留**：它声称验证的是"当前 head"，所以 ambient head 必须等于 subject。 |
| `ATTEMPT_RESULT`（新增） | **不比较 ambient HEAD。** 三条：① subject 由 canonical `AttemptReport` 物化（`resultCommit = R`，调用方永不指定）；② Git 对象 `R` 存在；③ **verifier 在隔离检出中精确物化 `R`** 并跑协议。 |

**为什么不要求 ambient HEAD == `resultCommit`**：那会重新锁死主代理的自由。例如 `finish` 任务 A 得到不可变提交 `RA`，复核启动；此时主代理继续读代码、甚至进入下一项工作，`HEAD` 变成 `RB`——若复核依赖 `HEAD == RA`，A 的复核就永远无法运行，而 `RA` 本身仍是完全有效的不可变产物。因此：

```
VerificationSubject = R          （不可变产物）
current repository HEAD          （属 promotion / current-authority，不属 verifier subject identity）
```

**为什么这反而提升独立性**：verifier 检查的是 `exact immutable result artifact`，而不是"主代理当前工作目录此刻碰巧长什么样"。运行形态：

```
AttemptReport → resultCommit R → verifier 建立/复用 @R 的隔离检出 → 跑协议 → VerificationRun(subject = R)
```

**独立性分级沿用现有模型，不改**：机械 verifier 用 `MECHANICAL_INDEPENDENT` 在独立检出中跑确定协议（不需要另一个 LLM）；模型 verifier 若要算独立，仍须满足既有的显式分离契约（`SEPARATE_PROCESS` / `SEPARATE_SERVICE` / `SEPARATE_HOST`）——**同模型、同上下文、只换提示词不构成独立**。

### B.4 风险推导（**B-r1：与 #147 校准后的真实 policy 对齐**）

**旧表述已过期**：本附录原写"大任务 → REQUIRED""只有一条证据命令 → REQUIRED"。二者均已被 §2.7 的 2A-Q-R 校准**否决**——`single_command_bar` 降为 RECOMMENDED 且**不阻断晋升**，2B v1 也**不实现** diff-size threshold。

**2B v1 的实际 policy**（以 `src/domain/completion_contract.ts` 为准，本表只是它的复述）：

| 任务形状 | 2B v1 |
|---|---|
| 普通本地代码任务 | verification **not required** |
| `single_command_bar`（标准只有一条命令） | **RECOMMENDED** only，不阻断 promotion |
| `contract_boundary`（schema / contract / security / auth / proto / public-api） | **REQUIRED** |
| 大 diff / 文件数多 | v1 **不实现**（"大 diff"执行前不可知；将来若加，条件必须提前声明、事后只观察） |
| operator 显式要求 | **等 `ProjectStandard` 有相应 clause 之后**再实现（当前无该 clause kind） |

**禁止**在 2B 的验收测试里把已经校准掉的错误策略重新实现回来。**唯一**的硬触发是 `contract_boundary`。

### B.5 工具契约变更登记

`palimpsest_verification` 现 action 集为 `["status", "history", "verify_current_head"]`（`src/adapters/dsh/project.ts:191`），新增 `verify_attempt_result`：

- 这是**工具契约变更** → 必须登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity。
- 已核：`PROJECT_VERIFICATION_SUBJECT_KINDS` **不在** `architecture/public-api-baseline.json` 中，故公共 API 面 `0/0/0` **不受影响**。即：架构上便宜，但契约可见，**必须显式登记**。

### B.6 禁止

- **禁止**把 attempt 的 PASS 铸造成 `EvidenceAtom`（§2.6）。
- **禁止**用 `CURRENT_PROJECT_HEAD` 的 PASS 满足 attempt 级复核要求（`LEAN-A20` 要求机器证明二者不等价）。
- **禁止**让调用方指定 `resultCommit`。
- **禁止**在 in-place 工作未提交时声称"复核了结果"。
- **禁止**把 `ATTEMPT_RESULT` 加进**旧** head verifier 的 `supportedSubjects`（既是假验证，也会让既有 head verification history 全部 stale，§B.11）。
- **禁止**让 provider 自己决定在哪个目录跑（隔离检出必须由 Verification service 的 materialization port 控制，§B.12）。
- **禁止**在 provider throws / timeout / ERROR 时跳过 cleanup（§B.12）。
- **禁止**对 `ATTEMPT_RESULT` 检查 ambient HEAD（§B.13）。
- **禁止**让 `ATTEMPT_RESULT` 的 run 影响 current-head status，或反之（双向 anti-alias，§B.13）。
- **禁止**用"verification store 存在"当作 `ATTEMPT_RESULT` 可满足的条件（须是"存在 executable independent verifier 且 `ATTEMPT_RESULT ∈ supportedSubjects`"，§B.13）。
- **禁止**让 promotion domain import `ProjectVerificationRun`（只看 admission 投影，§B.14）。
- **禁止**在 `assessEligibility()` 之外另加 promotion 检查（所有入口必须共享唯一 assessor，§B.14）。
- **禁止**让 `ProjectController` import Verification（编排属于 application composition，§B.15）。
- **禁止** `Verification FAIL → TASK_FAILED`，或改写历史 `AttemptReport`（§B.16）。
- **禁止**为 2B 顺手发明"verification fail 自动 reopen task"（先 dogfood，§B.16）。
- **禁止**让 Principal 手工调用 verifier 成为正常路径（`verify_attempt_result` 是 expert/debug 路径，§B.15）。

### B.7 验收

- `LEAN-A19`：`ATTEMPT_RESULT` 复核可跑通——in-place 下 attempt 提交后、晋升前，`subject.resultCommit` 成立且复核 PASS。
- `LEAN-A20`：**机器证明** `CURRENT_PROJECT_HEAD` 复核 ≠ `ATTEMPT_RESULT` 复核：一个旧 head 的 PASS **不能**满足 attempt 级要求。
- `LEAN-A21`：风险推导生效——小/本地任务不要求认知复核；**边界任务**缺复核时晋升被拒并点名缺哪条、由谁补（承接 `LEAN-A07`；**B-r1 已按 §2.7 校准修正文案**：不再是"单证据/大任务"，而是 `contract_boundary` 为唯一硬触发）。

---

## B-r1 修订（2B 实现前）：把"验证真的跑了但语义仍不对"的风险钉死

> **状态：规划**。B-r1 是 docs-only 修订，未实现。它把 2B 从 *architecture direction PASS / implementation HOLD* 推到可开工。

### B.8 subject 是 **union**，不是新的 verification 系统

**已核**：`ProjectHeadVerificationSubject` 当前被硬编码在四处——`provider.ts` / `status.ts` / `artifacts.ts` / `store.ts`——并贯穿 `ProjectVerificationRequest` / `RunEvent` / `Run` / `ProjectVerifierVerifyInput` / status / store parser。

正确改法是**扩展既有 subject union**：

```ts
type ProjectVerificationSubject =
  | ProjectHeadVerificationSubject
  | AttemptResultVerificationSubject;
```

`parseProjectVerificationSubject()` / `sameSubject()` / `Request.subject` / `RunEvent.subject` / `Run.subject` / `VerifyInput.subject` **全部改用该 discriminated union**。`CURRENT_PROJECT_HEAD` 的语义**完全不动**。

```
new subject kind  ≠  new verification system
```

### B.9 materialization owner 是 **Work**（窄 read port）

subject 形状**保持 B.2 所写**，**不加** `projectRevision` / `projectDigest` / `currentHead` —— 它描述的是一个**历史上已完成、不可变的 Work result**。

新增一个**很窄**的 Work-backed read port（概念形状）：

```ts
AttemptResultVerificationSource {
  materialize(attemptId): AttemptResultVerificationSubject
  rematerialize(attemptId): AttemptResultVerificationSubject
}
```

**只**从 canonical 读：`attempt row` / `AttemptReport` / `TaskEnvelope`。必须保证：

```
attempt.state == COMPLETED
report.result_commit != null
report envelope == canonical envelope
reportDigest == canonical AttemptReport digest
```

调用方**永不**提供 `resultCommit` / `baseCommit` / `reportDigest`。内部用 `attemptId` 无妨；**禁止**的是"agent 自己挑一个 commit 然后说验证它"。

### B.10 目标推导：agent-facing **不接收 `attemptId`**

`palimpsest_verification` 可增 action `verify_attempt_result`，但 Principal **不得**再看到 `attemptId`。2B v1 明确限定：

```
恰好一个 current-batch COMPLETED promotion candidate  → 验它
0 个   → NO_ATTEMPT_RESULT
>1 个  → AMBIGUOUS_ATTEMPT_RESULT（不猜；先走既有 candidate selection）
```

内部 application/service 可以有 `verifyAttemptResult(attemptId)`；**DSH 投影不暴露该参数**。

```
Internal identity  ≠  Principal vocabulary
```

Direct path 天然只有一个 candidate，因此不受影响。

### B.11 **必须新建 verifier ref**——旧 head verifier **绝不能**扩成 attempt verifier

**已核**：first-party verifier 就是 `commandProjectHeadVerifier({ command: "git", args: ["diff", "--check"] })`（`src/composition/governance.ts:176`）。

把它的 `supportedSubjects` 从 `[CURRENT_PROJECT_HEAD]` 扩成 `[CURRENT_PROJECT_HEAD, ATTEMPT_RESULT]` 会造成**两个**严重后果：

1. **假验证**：`git diff --check` 检查的是**工作树 diff**。在一个 clean checkout @ R 里它**没有 diff 可查**，必然 PASS——于是产品会宣布"`ATTEMPT_RESULT` 已独立验证"，而实际上只证明了"干净检出没有未提交的空白错误"。
2. **旧历史全部 stale**：改 `supportedSubjects` 会改变该 verifier 的 **definition digest**，使既有 head verification history 因 protocol definition change 而失效。

因此 2B 新建一个**独立 verifier ref**（概念名）：

```
project.attempt.git-diff-check.v1      ← 新
project.head.git-diff-check.v1         ← 保持不动
```

新 provider 是 **subject-aware** 的：命令里的 commit 来自 canonical `ATTEMPT_RESULT` subject，**不是 caller**，因此没有 command/commit injection：

```
git diff --check <baseCommit>..<resultCommit>
```

运行形态：

```
AttemptReport → ATTEMPT_RESULT(R) → 隔离检出 @ R → git diff --check base..R → PASS/FAIL/ERROR
```

**产品语言必须准确**：只能说 `MECHANICAL_INDEPENDENT protocol passed`，**不得**说"契约变更已被语义审查证明正确"。

```
Verification PASS  ≠  Truth
```

### B.12 隔离检出由 **Verification service** 控制（窄 materialization port）

```
VerificationMaterializationPort {
  materialize(subject): Promise<{ repository, materializedCommit, release() }>
}
```

| subject kind | 规则 |
|---|---|
| `CURRENT_PROJECT_HEAD` | 沿用现状：`ambient repo HEAD == subject.headCommit`，provider 可在当前 repo 跑 |
| `ATTEMPT_RESULT` | `git object R exists` → **isolated detached checkout @ R** → `materializedCommit == R` → provider 在其中跑 → `finally` cleanup |

**即使 provider throws / times out / 返回 ERROR 也必须 cleanup。** Materializer **不是** Work truth、**不是** project mutation、**不是** durable artifact——它只是 Verification runtime 的 ephemeral 执行环境（与 Reasoning branch 的 ephemeral 思路一致）。

### B.13 freshness **按 subject kind 分开**；能力也必须 subject-aware

**freshness**（当前实现只做"重读 ProjectIR + 重读 ambient HEAD"，仅适用于 head）：

```
CURRENT_PROJECT_HEAD:  same canonical head subject  ∧  ambient HEAD 仍然相等
ATTEMPT_RESULT:        rematerialize canonical attempt result  ∧  subject digest 仍然相等
```

**`ATTEMPT_RESULT` 绝不检查 ambient HEAD。** 这正是对抗测试要证明的：

```
Attempt A → RA，复核在 RA 上启动；期间 HEAD → RB
⇒ run.subject.resultCommit == RA 且 freshness == CURRENT（不是 STALE）
```

而 `promotion(RA)` 仍可因 `head_conflict` / `cross_revision_promotion_not_supported` 被拒。这机器证明了：

```
Verification freshness  ≠  Promotion authority freshness
```

**status 不得被 attempt run 污染**：现有 `deriveProjectVerificationStatus()` 已用 `sameSubject(run.subject, currentHeadSubject)` 精确筛，是好基础；但内部大量代码直接读 `run.subject.projectRevision` / `.headCommit`，加 union 后**必须 kind-aware**。并需**双向 anti-alias**：

```
HEAD PASS          不能使 ATTEMPT_RESULT 变成已满足
ATTEMPT_RESULT PASS 不能使 current-head status 变成 PASS
```

**runtime capability 也必须 subject-aware**：`runtimeAvailable` / `independentVerifierRefs` / `defaultVerifierRef` 现在是**全 verifier 集合**，会让"只有 attempt verifier 的部署"错误地告诉 current-head status "VERIFY available"。因此把单个 bool 升级为至少能回答：

```
supportsIndependent("CURRENT_PROJECT_HEAD")
supportsIndependent("ATTEMPT_RESULT")
```

这也是解锁 §E.14.1 那道 `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` 的**正确条件**——不是"verification store 存在"，而是：

```
∃ executable independent verifier : ATTEMPT_RESULT ∈ supportedSubjects
```

### B.14 Promotion 集成必须是**显式 bridge**（唯一 assessor）

**绝对禁止** `Verification PASS → mint EvidenceAtom → release gate PASS`。正确关系仍是：

```
Ready = G_work ∧ V_required ∧ E_promotion
```

给 `PromotionEligibilityInput` 增加一个**极窄、Verification-agnostic** 的投影：

```ts
verification: {
  required: boolean;
  satisfied: boolean;
  subjectDigest: string | null;
  runRef: string | null;
  detail: string | null;
}
```

**promotion domain 不得 import `ProjectVerificationRun`**——它只看"required quality admission 是否满足"。由 Project Verification owner 把自己的历史投影成这张 admission fact。

新增 typed blocker（detail 再说具体原因：no run / FAIL / ERROR / not independent / wrong subject / stale input）：

```
required_verification_missing
required_verification_unsatisfied
```

```
PromotionEligibility  ≠  Verification
但 Promotion admission 可以明确要求 Verification
```

这正是 `CF-AD-01` 所说的 **"WITH a different admission design"**。

**必须挂在唯一 assessor 上**：不能只在 UI / `palimpsest_finish` / `promoteWhenGatePasses` 外面加检查——G10-Z 的核心设计就是"所有 promotion 入口共享同一个 eligibility assessor"（**已核**：`PromotionManager.assessEligibility()` 有 5 处调用点，含 expert promote / product promote / selection / recovery preview）。给 `assessEligibility()` 注入一个很窄的 `AttemptVerificationAdmissionPort`，**而不是**让 PromotionManager 直接读 `ProjectVerificationStore`。

### B.15 正常 `finish` 路径**自动**触发 required verification（application 层编排）

若 2B 之后正常路径变成"Principal 自己想起来调 `verify_attempt_result`"，等于刚把 gate/report/scheduler 藏掉又把 verifier 状态机暴露回去。正确做法是在 **application 产品层**：

```
controller.finish() → 内部 attemptId
  → CompletionContract.verification.required ?
      是 → verification.verifyAttemptResult(内部 attemptId) → 返回压缩结果
```

**不是**让 `ProjectController` import Verification，而是 Application composition 编排 **Work owner + Verification owner**。这才是之前一直在找的"产品中间层"位置。

因此普通 Principal 仍然只是 `begin → work → finish`，而 finish 的结果可能是：

```
work completed ✓  mechanical checks ✓  independent verification PASS ✓  ready for acceptance
```

或

```
verification FAIL → promotion blocked, review finding: …
```

`palimpsest_verification verify_attempt_result` 保留为 **expert / debug / re-run** 路径。

### B.16 `Verification FAIL` **不是** `Work FAIL`

```
Attempt COMPLETED ∧ Verification FAIL
```

是**合法状态**。**禁止** `Verification FAIL → TASK_FAILED`，**禁止**改历史 `AttemptReport`。它的含义是"这个完成候选被独立协议否决、不能 promotion"，主代理/用户可以据此重做 Work。

v1 若重做仍需显式 plan / new attempt，**先接受这个摩擦**；**不要**为 2B 顺手发明"verification fail 自动 reopen task"——先 dogfood 再决定。

### B.17 验收（B-r1 增补）

`A19`–`A21` 保留（`A21` 已按 §2.7 修正文案），另增：

- `LEAN-A35` **exact isolated materialization**：断言 `checkout HEAD == subject.resultCommit`、ambient HEAD 与之无关、且**无论成功失败 cleanup 都执行**。
- `LEAN-A36` **RA/RB adversarial**：复核期间 main HEAD 从 RA 推到 RB，`RA` 的 run 仍为 `CURRENT`、`run.subject.resultCommit == RA`；而 `promotion(RA)` 可因 `head_conflict` 被拒——机器证明 `Verification freshness ≠ Promotion authority freshness`。
- `LEAN-A37` **bidirectional subject firewall**：同时证明 `HEAD PASS` **不能**满足 `ATTEMPT_RESULT`，且 `ATTEMPT_RESULT PASS` **不能**使 current-head status 变 PASS。
- `LEAN-A38` **promotion bridge**：同一 attempt 在 `gate PASS`、其余 eligibility 通过、但缺 required verification 时 promotion 被拒；补上**精确 subject 的独立 PASS** 后同一 promotion 变为 eligible。**并断言 `EvidenceAtom` 计数在 Verification PASS 前后不增加**——机器证明：

  ```
  Verification admission happened without evidence laundering
  ```

---

## 附录 C（立项）：`PLMP-DELEGATE-1` —— 选择性委派运行时

> **状态：立项（D1 未实现）**。`C-r1` 修订（2026-09-22，实现前）：2B 已冻结为 **CLOSED / STRONG PASS**，direct path 基线为 `begin → native work → finish → G_work ∧ V_required ∧ E_promotion`。附录 C 的方向判为 **architecture PASS**，但 D1 判为 **implementation HOLD**——当前规格把「ReasoningCell 是 canonical owner」与「后台 OS job 的执行生命周期」混在了一起。C-r1 钉住四条新原则并把 D1 的公共面收窄。

> **另起规格的理由**：`LEAN-1` 解决"**人**不操作治理机器"；`PLMP-DELEGATE-1` 解决"**主代理**不管理 worker 机器"。两者关联，但不是同一个问题。本附录只做立项与边界冻结，不写完整设计。

### C.1 问题

主代理今天**没有 agent 发起的委派原语**（§3.1）：`palimpsest_collaborate` 是阻塞的 one-request 调用，`workerDispatch` 是 effects 层内部动作。于是"主代理边自己干活边委派"做不到——这是实测中多执行者通道从未跑过的结构原因。

### C.2 产品接口

```ts
palimpsest_delegate
  actions : prepare | start | status | receive | inspect
  常规路径 : start
  input   : { task: string, kind?: AUTO|RESEARCH|WORK, paths?: string[], projectRefs?: string[] }
  拒绝    : workerId / sessionId / attemptId / lease / authority / admissionDecision
  返回    : { delegationRef, kind, state: "STARTED", detail }   // 立即返回
```

`status()` **保留**给 debug / restart recovery / explicit inspection，**不是正常工作流**（见 C.6）。

### C.3 不建立 `DelegationStore`

真实状态已各有 owner：

| delegation kind | canonical owner |
|---|---|
| `RESEARCH` | ReasoningCell |
| `WORK` | Work Task/Attempt |
| `VERIFY` | Project Verification |
| `CROSS_PROJECT` | Federation / thread |

```
Delegation is a projection, not a new truth species.
```

`delegationRef` 只是一个 **opaque、可严格解析、可往返（round-trippable）的 routing reference**；内部必须能还原到 canonical `ReasoningCell` + branch ref。**不冻结具体字符串格式**（早期草案里的 `dlg:v1:…` 只是示意，不是契约）：格式可以演进，只要解析与还原仍然严格。

> **C-r1 修正（自相矛盾）**：本节说 `delegationRef` 是正式概念，而 `DEL-A04` 原写「不存在 `Delegation*` 类型」——按字面执行连 `DelegationRef` 自己都被禁止。已改为：**不存在新的 canonical `DelegationStore` / `DelegationEvent` / `DelegationAuthority` / delegation event type**；普通 application DTO（`DelegationRef`、`DelegationResultProjection`）**不是新的 ontology**，无需为通过 grep 测试而故意改怪名字。

概念形状（示意，非契约）：

```
dlg:v1:reasoning:<cell>:<branch>
dlg:v1:work:<attempt>
dlg:v1:verify:<run>
dlg:v1:project:<request>
```

**禁止** `DelegationStore` / `DelegationEvent` / `DelegationAuthority`——它不是新的 identity ontology。

### C.4 上下文类型复用（不发明万能 capsule）

| kind | 复用既有类型 |
|---|---|
| `RESEARCH` | `ReasoningBranchBrief` |
| `WORK` | `TaskEnvelope` + `ContextManifest` |
| `VERIFY` | `VerificationSubject` |
| `CROSS_PROJECT` | `PROJECT_ASK` packet |

**禁止** `UniversalDelegationContext`（会形成第二套语义体系）。真正需要冻结的只有一条：

```
任何 backend 都不得默认收到主代理的全部 conversation / session。
```

### C.5 worker → principal 只返回 result projection

主代理**不接收** worker session，只接收统一投影：

```
Delegated result completed.
结论：
可观察的工作：
证据：
复核：
未解决项：
冲突：
```

需要深入时用 `inspect(ref)` 做 **progressive disclosure**。`INV-4` 同时生效：压缩的是编排状态（attempt id / lease / session / event id / cursor），**不是**决策证据。

### C.6 不要求主代理 polling

- 新增 **`PrincipalAttentionComposer`**（application/host 层）合成：既有 federation/boundary attention ＋ 委派终态投影 ＋ 复核 needs-attention ＋ 需要主代理的 Work 阻塞。
- 输出仍是一小组**可行动项**；host runner 继续 `agent.followup(...)`。
- **禁止**扩大 canonical `AttentionService` 的语义。
- 主代理**不得**需要 `status? status? status?`。

### C.7 三代与 Result Transplant

| Stage | 能力 | 主要风险 |
|---|---|---|
| **D1** | 异步 **RESEARCH** 委派 | 很低 |
| **D2** | **exclusive** mutating WORK 委派 | 中 |
| **D3** | **concurrent** mutating 委派 + Result Transplant | 高 |

**D1 最先做**：`WriteSet(worker) = ∅`，不引入 git/head 问题，且直接验证核心体验——

```
主代理：delegate research B → 调用立即返回
主代理：继续修改 A
worker：完成 B
attention：B 就绪
主代理：吸收摘要
```

**D2**：后台 worker 可以修改项目，但项目同时**只有一条 mutating line**。主代理此时可以 read / reason / search / 委派认知 / 与用户对话，但**不应**同时开展另一条 mutating Work 路径。证明：isolated worktree + 真 attempt + 真 evidence + 真 report + 真 promotion + 异步返回 + attention 完成通知。

**D2 的两条硬前置（2A-R / 2A-Q carry-forward，必须随 D2 一起交付）**：

1. **worktree-aware 的完成观察**。`Completed ⇒ commit-materialized`（§A.8）目前只在 in-place 可观察；worktree 模式下 `finish` 已 fail closed。打开 mutating worker 前必须提供同一接口性质的观察，**复用同一个** `#assertCompletionMaterialized`：

   ```
   observeAttemptResult(attemptId) → {
     baseCommit, resultCommit,
     committedChanges, uncommittedChanges,
     requiredArtifactsState
   }
   ```

   **禁止**为 worktree 路径另写一套"差不多"的完成规则——那正是 §A.8 那个洞的复现路径。

2. **principal attempt attribution**。`#uniqueRunningAttempt()` 今天成立，是因为 in-place 已冻结为同时只有一个 RUNNING attempt。D2 之后会同时存在"主代理 in-place attempt + 后台 worker attempt"，此时"唯一的 RUNNING attempt"**不再等价于**"主代理自己的 attempt"。届时需要一种 **host-local principal binding**（本主代理会话 → 当前直接 attempt），且它**不得**创造 Agent identity 真值——它是 host/deployment 绑定，不是语义身份。

**D3**：只有真实 dogfood 证明 D2 的串行 mutation 是**瓶颈**以后才做。这时引入 **Result Transplant**，而**不是**弱化晋升 authority：

```
Worker B 在 H0 完成        → B 的结果历史留存
主代理 A 晋升 H0 → H1
Palimpsest 在 H1 上开一个【新的】B attempt
机械移植 B 的 patch
检查写路径兼容
重跑全部机械证据
重跑要求的独立复核
正常 H1 晋升
```

即 `Attempt_{B,H0} ≠ Attempt_{B,H1}`：**不修改历史、不假装旧 authority 仍有效**。

> **绝不**放松 G10-Z 允许"旧 attempt 跨 revision promote"——那会重新打开一批已封住的 authority 问题。

### C.8 `AttemptExecutionPlacement`（先研究派生，不马上改 schema）

现状 `ProjectController.execution = "in-place" | "worktree"` 是 **controller 级**，长期需要 **attempt 级**（主代理 attempt → in-place；Worker A/B → worktree）。但：

- **不马上修改 event schema**；
- 先研究能否从既有 `worktree.create` effect / attempt id / Ordarium operation **可靠派生** placement；
- **可派生就不要**把 placement 变成新的 canonical field；只有重启后无法可靠推导时，才考虑增加持久绑定。

### C.9 与管理模式的关系（不新增 autonomy scalar）

现有 `MANAGEMENT_INVOLVEMENTS = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"]`（`src/project_management/profile.ts:35`）已足以约束委派的产品行为，**不需要**新增 `auto_multi_agent = true` 这类 scalar：

| Mode | 产品行为 |
|---|---|
| `DIRECT` | 不自动启动委派；主代理可显式调用 |
| `ASSIST` | 可以**建议**"这个调查适合委派" |
| `MANAGE` | 可自动启动安全的 read-only / 机械复核 |
| `DELEGATE` | 可在既有计划与预算内自动调度允许的 worker |

仍满足 `effective permission = semantic authority ∩ management policy ∩ capability availability`。

### C.10 验收（D1 出口）

- `DEL-A01`（**C-r1 收紧为 barrier 式证明**）：用 barrier 证明 `start` **已经返回**、主代理**已经执行了下一次 direct mutation**，而 worker **尚未完成**；后台完成后经 attention 呈现终态投影。
- `DEL-A02`（**C-r1 收紧**）：branch input **不含 Principal conversation/session**（断言 brief 形状），**并记录 frozen project basis**（snapshot 的 `H0`）。
- `DEL-A03`（**C-r1 收紧**）：真实 DSH transcript 中 **`status` 调用次数为 0**，终态结果由 **followup** 送达。
- `DEL-A04`（**C-r1 修正措辞**）：架构断言——**不存在新的 canonical `DelegationStore` / `DelegationEvent` / `DelegationAuthority` / delegation event type**。应用层 DTO 不在禁止之列。
- `DEL-A05` **snapshot write-isolation**：worker 即使尝试在自己的 snapshot 里 `edit`/`shell` 写文件，canonical repository **零变化**（`git status --porcelain` 与 HEAD 均不变），且 snapshot 在结束后被丢弃。
- `DEL-A06` **INTERRUPTED ≠ RUNNING**：模拟 host crash（branch 仍 OPEN、进程已无对应 job）后，`status(ref)` 必须报 **`INTERRUPTED`**，**不得**报 `RUNNING`；v1 **不自动重跑**。
- `DEL-A07` **orthogonality**：D1 前后 **Work event / `EvidenceAtom` / Project Verification / Promotion event 的数量均不因 research 本身增加**；research 不创建 Task、不创建 Attempt、不满足 Work Gate、不满足 `ATTEMPT_RESULT` 复核、不改 `PromotionEligibility`、也不需要 `palimpsest_begin`。
- `DEL-A08` **additive surface**：原有 `palimpsest_collaborate` 的 blocking 行为**保持不变**（同一执行器、不同交互生命周期），证明 `delegate` 是**加法**而非替换。

---

## C-r1 修订（D1 实现前）：语义生命周期与 host 执行生命周期必须分开

> **状态：规划**。C-r1 是 docs-only 修订。它把 D1 从 *architecture PASS / implementation HOLD* 推到可开工。

### C.11 四条新原则

**① `Reasoning semantic state ≠ host job state`（最重要的冻结）**

ReasoningCell 今天能**持久表达**的是：`BRANCH_OPENED` / `CANDIDATE_SUBMITTED` / verification·admission / `BRANCH_CLOSED`。它**不能**持久表达：subprocess PID、宿主进程是否还活着、某个 Promise 是否还在跑。

```
Semantic lifecycle  ≠  Host execution lifecycle
```

ReasoningCell 继续是**语义真值 owner**；后台 DSH 子进程只是**可丢失的 host execution**。

**D1 的产品状态由两层组合派生**：

| 状态 | 含义 |
|---|---|
| `RUNNING` | branch OPEN，**且当前进程确实持有活跃 host job** |
| `COMPLETED` | branch 已产生 terminal candidate/evaluation 并关闭 |
| `FAILED` | branch 已关闭且无有效 candidate（host failure / timeout） |
| `INTERRUPTED` | branch 仍 OPEN，但**当前进程没有对应 host job**（典型：restart / crash） |
| `UNKNOWN` | ref 无法解析，或 canonical branch 不存在 |

```
OPEN branch after restart  ≠  RUNNING worker
```

否则会制造「系统说 worker 还在跑、其实进程早没了」的**假状态**。

**D1 v1 不自动重跑 `INTERRUPTED` branch**：自动重跑会立刻遇到重复 stochastic cognition、旧 child 是否幸存等问题。`status`/`inspect` 在 restart recovery 时**如实报告 `INTERRUPTED`**；透明重启以后真有需求再做。这仍满足「正常路径不 polling」，因为**无故障**运行依靠 terminal attention。

**② `WriteSet_project(worker) = ∅`，靠 ephemeral project snapshot**

`ReasoningBranchBrief` 只带 `objective` / `question` / accepted frontier（好：防止整段 Principal conversation 被复制）。但 branch runner 的 `workDir` 是显式参数，若直接指向 Principal 正在改的主仓库，worker 会看到一个**不断变化的 filesystem**：虽然 `WriteSet(worker) = ∅`，但 `ReadBasis(worker)` **没有冻结**。

D1 在 delegation start 时对**当时的 committed HEAD = H0** 建一个 **detached 临时 checkout**：

```
Principal repo    H0 → edits continue...
                        │
delegate snapshot  H0 ──┴─ research worker reads here
```

worker 即便误用 `edit`/`shell` 改这个临时 checkout，也**不会**改到 canonical project；退出后整个 snapshot 丢弃。因此 D1 的真正约束是：

```
WriteSet_canonical_project(worker) = ∅
```

而**不是**要求 worker 在整个 OS 上不能写任何临时文件。

若 Principal 在启动 delegation 时主仓库已有**未提交**修改，D1 v1 明确：**research snapshot 基于 delegation 时的 committed HEAD，未提交的 Principal 修改不自动复制过去**。这比偷偷读一个移动中的 dirty tree 更诚实；而 `DEL-A01` 的目标场景本就是「先 delegate B，再开始改 A」，核心体验不受限。

**③ 正常路径不 polling；restart 可以如实是 `INTERRUPTED`**

```
background job settles
  → application-level terminal result projection
  → PrincipalAttentionComposer / host wake
  → agent.followup(...)
```

只送 **terminal actionable**，不送进度。delivery mark 继续是**非 canonical** 的机械标记。

D1 v1 **不声称**拥有「跨 host crash 的可靠 notification queue」：进程 crash 后 branch OPEN 而 host job 消失，restart 后 `status(ref)` 报 `INTERRUPTED`，**不得**伪称自动恢复了投递。以后若 dogfood 证明「crash 后也必须自动重新投递」有价值，再加基于 ReasoningCell history 的 restart reconciliation。

**④ D1 的认知与 Work/Evidence/Verification/Promotion **完全正交**（新硬不变量）**

D1 `RESEARCH`：

```
不创建 Work Task
不创建 Attempt
不产生 EvidenceAtom
不满足 Work Gate
不满足 ATTEMPT_RESULT 复核
不改 PromotionEligibility
不需要 palimpsest_begin
```

因此 Principal 可以「delegate research B → begin/edit/finish Work A」，也可以在一个**已经 RUNNING 的 direct attempt 中**启动 research。research branch 自己的 ReasoningCell verification/admission **仍然只是 cell-local epistemic standing**，不变成 Work Truth/Evidence。

```
Direct Work  ∥  Optional cognitive delegation
```

而不是让 D1 变成另一种 Work mode。

### C.12 把现有 branch host 改成 async seam（不写第二套 adapter）

当前 `dshSubprocessBranchExecutionPort()` 已具备大部分能力：显式 `workDir`、超时、abort、规范化 result、临时 brief 文件与 cleanup。唯一问题是 `run(...)` 的 Promise **只在 child 结束时 settle**，所以 `palimpsest_delegate start` 无法立即返回。

**不新建第二套 subprocess adapter**，而是把 host 层抽成：

```ts
start(...) → { completion: Promise<BranchExecutionResult>, cancel() }
run(input) { const job = await start(input); return job.completion; }   // 旧同步接口保留
```

于是 `palimpsest_collaborate` 仍是现有 **blocking UX**，而 `palimpsest_delegate` 用**同一执行器**的 `start()` 立即返回：

```
same cognition backend  ·  different interaction lifecycle
```

**禁止**为 D1 创建第二套 Agent runtime。

### C.13 不要重新实现 Reasoning candidate settlement

`RecipeExecution.executeExplore()` 已有正确链条：`branch execution → structured statement → submitCandidate → evaluateCandidate`。D1 **不得**复制一份「差不多」的实现，否则很快出现「`collaborate` 的 candidate semantics ≠ `delegate` 的 candidate semantics」。

抽一个内部共用 helper：把**一个已打开 branch 从 brief 跑到 candidate/evaluation**的逻辑变成**单一来源**：

```ts
await runBranchToSettlement(...)                 // 同步 recipe
void runBranchToSettlement(...).then(...)        // 异步 D1
```

ReasoningCell 仍是 candidate/admission owner。若 host execution `FAILED`/`TIMEOUT`，则**关闭 branch、无 candidate**——**不得**制造「host crashed」这种伪 epistemic claim。

### C.14 D1 的公共面比 C.2 更窄

C.2 是**长期总形状**（`AUTO | RESEARCH | WORK`、`paths`、`projectRefs`、`prepare/start/status/receive/inspect`）。对 D1 来说太早。**保留长期接口设想，但明确 D1 实现子集**：

```
palimpsest_delegate
  start   { task, kind?: RESEARCH }
  status  { delegationRef }    // debug / restart recovery
  inspect { delegationRef }    // progressive disclosure
```

正常路径**只有 `start`**。

- `WORK` → 留给 D2；
- `projectRefs` / 跨项目 → 已有成熟的 `palimpsest_cross_project`，**不在 D1 重做一条路**；
- `receive` → 本地 research 没有类似 Federation ACK 的语义必要性；terminal projection 直接经 attention/followup 送给 Principal；
- `AUTO` → 不急。D1 的目标是证明**Principal 主动选择委派时**能真正异步，而不是先解决分类器问题。

### C.15 context firewall 的精确表述

既然 branch host 的 cwd 是显式 `workDir`，正确规则**不是**「worker 除 brief 外什么上下文都没有」，而是：

```
No Principal conversation/session by default
```

同时允许：

```
ReasoningBranchBrief  +  explicit evidence allowlist  +  frozen project read snapshot
```

```
context firewall  ≠  no project context
```

这才是一个**真正可用的 research worker**，而不是脱离项目的裸模型。

## C-r2 修订（D1-e 实现前）：把工具交给 Principal 之前的四个 runtime 缺口

> **状态：已实现（D1-e）**。C-r1 冻结了「语义生命周期 ≠ host 执行生命周期」。C-r2 冻结另外四件事：
> 它们都很局部，但每一个在**公开之后**都会变成「看起来在工作、其实不对」的状态。原则是：**先关掉这
> 四个，再接 application 面与工具**，而不是先注册工具再修。

### C.16 delegation identity 是**推导**的，不是分配的

```
D_delegation = H(projectId, basisCommit, task)
```

D1-d 之前，cellId 只由 `task` 推导，于是「同一进程里连续两次 `start({task:"X"})`」会得到**同一个 ref**，
却**再次 freeze snapshot、再次 `port.start()`**，然后 `active.set(ref, …)` 直接覆盖第一份 job：
两个 child 共用一个 semantic branch，而 host map 只认识第二个。

identity 加入 `projectId` 与 `basisCommit` 后：

- 同 project / 同 task / 同 basis 的重试**收敛**（不启动第二个 worker）；
- 同 task、**新 HEAD** 是**新的** delegation，旧 candidate 不会污染新一次 delegation；
- 不同 project 即便共享 ReasoningCell store 也不会碰撞；
- 附带一个重要性质：**ref 可恢复**——主代理丢了 ref 后重发同一个 task，就能拿回已有结论。

顺序也随之钉死：**freeze basis → 推导 identity → 读已有 canonical/host 状态 → 才 open/start**。
先 open 再判断会抹掉唯一需要的事实（branch 是不是本来就在）。

`start` 的返回因此不再是「我启动了」，而是**它实际做了什么**：

| `outcome` | 含义 | `state` |
|---|---|---|
| `STARTED` | 真的起了新 job | `RUNNING` |
| `ALREADY_RUNNING` | 同一 delegation 已在本进程运行（**没有**第二个 worker） | `RUNNING` |
| `EXISTING` | 已存在且没启动任何东西（terminal 回放 / `INTERRUPTED`） | 派生状态 |

### C.17 `delegationRef` **携带 exact basis**

`basisCommit` 原本只存在于 `active.get(ref).snapshot.basisCommit`，settlement 后 `active.delete(ref)` 就
丢了——与 C-r1「finding can name its own basis」不闭合。解法**不是**建 store（C.3 禁止），而是让 opaque
ref 自身携带 basis，并让 **terminal projection 也带 `basisCommit`**：

```
delegationRef = dlg2.<basisCommit>.<cellId>.<branchId>      parser 严格校验每一段
```

`dlg2` 是**新的版本号**：载荷不兼容地变了，v1 ref 必须解析为 `null`（`UNKNOWN`），而不是被误读成 v2。
于是 restart 之后只要持有 ref，`inspect(ref)` 仍能回答「这个结论计算于 R」。

### C.18 三类故障必须分开

```
host execution failure  ≠  semantic settlement failure  ≠  terminal delivery failure
```

只有前两类决定 outcome。D1-d 的链条是 `job.completion.then(conclude).catch(conclude)`，而 `conclude`
**最后**才调用 `onTerminal`——所以一旦 D1-e 把它接到真实 followup，投递错误会让第一个 `conclude` reject，
外层 `.catch` 再调用一次 `conclude`：**二次 close、二次 release、二次 terminal delivery**，同一份研究被结算两次。

实测（把投递隔离与 exactly-once guard 一起移除，`test/lean_delegation_runtime.test.ts`）：
`expected 2 to be 1`。修复分两层：

1. 投递被隔离（`try/catch`）：`onTerminal` 失败最多意味着「notification delivery failed」，绝不改写 research
   outcome；
2. exactly-once guard：一个 ref 在本进程**最多**产生一次 terminal projection。

投递本身是 host-local、noncanonical、best-effort，**不声称 crash-durable**；真正的结果状态仍从
ReasoningCell 推导。`Notification ≠ Result truth`。

### C.19 `DEDUPLICATED` 在两条生命周期里都是收敛，不是失败

`settleBranchFromOutput()` 对 DEDUPLICATED 明确返回 `converged=true, unresolved=false`；blocking
`collaborate` 也不把它计为 unresolved。但 delegation 曾把它设为 `FAILED`，且 `stateOf()` 只认 `ADMITTED`。
统一之后：`ADMITTED` 或 `DEDUPLICATED-to-existing-claim` 都是 **`COMPLETED`**，detail 写明
"converged on an existing exploratory conclusion"。这正是抽共享 settlement coordinator 原本要防止的漂移，
所以它同时是 C.13 的回归。

### C.20 D1-e 交付的表面

```
palimpsest_delegate
  start   { task, kind?: "RESEARCH" }      ← 正常路径只有这一个
  status  { delegationRef }                ← debug / restart recovery
  inspect { delegationRef }                ← explicit drill-down
```

- **工具面保持极窄**：不加 `AUTO` / `WORK` / `receive` / `projectRefs`；
- 组合：新的 `composition/delegation` 簇（**不新增 store**），仅当 reasoning store + repository +
  async branch host 都在时存在，否则**缺席而非 stub**；
- **terminal 投递不进 canonical `AttentionService`**（它的 ontology 是 peer message / boundary decision /
  commitment）。走的是 application/host 组合：

```
DelegationService.onTerminal
   → PrincipalTerminalComposer（产品层：格式、standing、投递失败记录）
   → host followup adapter（DSH：runner 自己那条 turn 投递路径）
   → principal agent.followup(...)
```

  host 侧**不新增投递实现**：DSH runner 已经有一个把文本变成"一次被 flush、被报告的 turn"的函数
  （launch message 与 attention 激活都走它），delegation 终态复用它，因此终态是 transcript 里的一等 turn，
  而不是一次不可见的 turn。

  DSH 的 principal session 在 deployment **之后**才创建，所以 delivery 是 **late-bound**（与
  `bindAttentionActivation` 同形）；未绑定时报 `delivered: false`，**绝不静默丢弃**。
  并且它只在「有可达的 DSH agent **且** profile 要求 DSH activation」时存在：`activation: "none"` 是操作者
  在说 pull mode only，一个「终态永远回不来」的 delegation 会变成陷阱——agent 会开始研究并等待一个不可能
  到达的答案。那里缺席才是诚实答案，`palimpsest_delegate` 也随之缺席。
- followup 文本带 **basis + exploratory conclusion + standing**，**不带** ref/cellId/branchId；
- `palimpsest_collaborate` 的 blocking 行为**不变**（同一执行器、不同交互生命周期）。

### C.21 D1-e 验收（增补）

在 DEL-A01–A08 之外，以下每一条都有机器验收：

| 增补 | 断言 |
|---|---|
| 同 basis 重复 `start` | 只有一个 host job，ref 相同，`outcome=ALREADY_RUNNING` |
| 同 task 新 HEAD | 不同 ref、不同 cell，`outcome=STARTED` |
| 不同 project、同 task、同 basis | 不同 ref，不碰撞 |
| terminal 之后 `inspect` | 仍返回 exact `basisCommit`，且 `conclusion` 可读 |
| terminal 后重发同一 task | `outcome=EXISTING`，**不重跑**（submit/evaluate 计数不变） |
| `INTERRUPTED` 后重发同一 task | 仍是 `EXISTING`，**不自动重跑** |
| `onTerminal` 抛错 | 一次 settle、一次 release、一次投递；outcome 不变 |
| `DEDUPLICATED` | `COMPLETED`，与 blocking 路径一致，且 restart 后仍是 `COMPLETED` |
| cell 的 policy ref | 必须是 first-party exploratory bundle 服务的 `recipe.explore.*`，否则验证永远失败却像"从不收敛" |

活体（barrier 式）见 DEL-A01/DEL-A03：`start` 已返回、主代理已执行下一次 direct mutation、worker 尚未完成；
真实 DSH transcript 中 `status` 调用数为 **0**，终态由 **followup** 送达。

实测装置：`rs-test/lean-d1-live-gate.mjs`。它把 branch host 指向一个**中继 wrapper**：wrapper 先在 barrier 上
park，rig 观察到主代理已经改完文件之后才放行，wrapper 再把 stdout 原样交给**真实**的 DSH branch worker。于是

```
worker spawned  <  principal edited  <  worker released
```

是被**测量**出来的，而不是从意图推断的。测量结果（真实一轮）：

```
principal called palimpsest_delegate            06:28:48.009
worker spawned（start 已返回）                   06:28:48.274
principal edited src/dedupe.ts（worker 仍 park） 06:28:48.791
worker released                                  06:28:48.792
terminal result delivered                        06:29:00.537
```

工具调用：`palimpsest_delegate` ×1（即 `status`/`inspect` ×0）、`palimpsest_begin` ×1、`palimpsest_finish` ×1、
低层工具 ×0；`Attempt COMPLETED` 且 `result_commit` 含该改动。第二回合 `palimpsest_collaborate` ×1、`delegate` ×0、
delegation 投递 ×0（DEL-A08 的活体一半）。

### C.22 D1 的**已确认缺口**：research worker 没有读取能力（活体实测）

> **状态：已由 §C.23（D1-g）关闭**（delegated branch 现为 `PROJECT_READ_ONLY`；blocking `collaborate` 保持
> `RESULT_ONLY`，其工具集逐字节不变）。本节保留原样，因为它是"缺口如何被**测量**出来"的记录。

同一个装置还测出一条**规格与实现的分歧**，必须如实登记，且**不擅自修复**（两个候选修法都要动已冻结的边界，
属于必须评审的架构决定）：

- 实测：branch 的 cwd 确实是冻结快照（`…\.palimpsest\delegationasis-<digest>`），**不是** live repo；
- 但 worker 拿不到读能力：`host/dsh/lib/runner.js` 的 `runBranch` 在 `setup` 里执行
  `agentCtx.tools.restrict({ allow: [branchToolName] })`，能力集**恰好**是 `palimpsest_branch_result`
  （UX-C §17/§37 的 CAPABILITY BOUNDARY，原文即 "a prompt line is NOT the boundary, the capability set is"）；
- 于是 branch 只能凭空回答，而它**诚实地拒绝了编造**：

```
本分支没有任何文件读取工具，且上下文中未提供 src/dedupe.ts 的任何内容（acceptedClaims 为空），
因此无法原样引用 dedupe 函数体的第一行代码，也无法据此判断其时间复杂度。
```

  这句话本身是好消息（没有让裸模型假装读过代码），但它说明 §C.11 ②/§C.15 写的
  `ReasoningBranchBrief + explicit evidence allowlist + frozen project read snapshot` 里，最后一项今天是一个
  **读不到的 cwd**：

```
WriteSet_canonical_project(worker) = ∅      ← 成立（DEL-A05）
ReadBasis(worker)                          ← 快照已冻结，但 worker 读不到 ⇒ 目前等价于 brief-only
```

两个候选修法（**需要评审后再做**）：

1. **放宽 branch 能力集**到只读的项目工具（`read`/`glob`/`grep`）。注意 `palimpsest_collaborate` 的 branch 走的
   是**同一个 adapter**，其 cwd 是 **live** 工作树——所以这同时会改变 blocking 路径的边界，与 DEL-A08「collaborate
   行为不变」冲突，除非把能力集变成 branch 环境的**显式参数**（delegate = 只读快照 / collaborate = 仅 result）。
2. **把快照内容作为 branch input 的一部分物化**（沿用 UX-C 的 `evidenceContext` selector-only 机制：不新增工具、
   不动边界），代价是只能读"被显式选中的部分"，而不是通用研究。

因此 D1 的对外结论必须精确：**生命周期（A01/A03/A08）已闭合；认知的输入面目前仍是 brief-only**，不得表述为
"worker 会去读你的项目"。

### C.23 D1-g：delegated research branch 的**只读项目能力**（缺口闭合）

修法不是把项目文件塞进 `evidenceContext`（`ProjectContext ≠ EvidenceContext`，且 selector 模式要求 Principal
预先猜出 worker 需要哪些文件，会削弱独立研究价值），也不是自建 project filesystem，而是给 branch 请求增加一个
**能力档（capability profile）**，由 host 组合成具体的工具集：

```
RESULT_ONLY        [ palimpsest_branch_result ]                      ← 默认
PROJECT_READ_ONLY  [ read, glob, grep, palimpsest_branch_result ]
```

三条性质让它成为**能力边界**而不是承诺：

1. **默认是 `RESULT_ONLY`**：blocking `palimpsest_collaborate` 的 branch 工具集**逐字节不变**（空请求不可能
   放宽任何东西）——这就是 DEL-A08 的"能力面"那一半；
2. **只读集里没有任何能改字节或跑程序的东西**：没有 `write`/`edit`/`str_replace`/`pwsh`/`bash`/shell/terminal/
   subagent。于是"worker 不能修改 canonical project"来自**工具集**，而不是来自 prompt 或路径检查；
3. **档位随 branch payload 传递**（`parseBranchHostPayload` 严格解析，未知档位 fail closed 而非静默降级），
   所以 branch host 读到的是**它真正被授予的**能力，而不是被口头告知的。

`palimpsest_delegate` 请求 `PROJECT_READ_ONLY`，作用对象是 snapshot 的 `workDir`。

**这版不声称什么**（必须写准）：这不是 OS 级沙箱——host 原生 reader 仍可打开绝对路径，恶意 worker 不在 D1 的
threat model 内（D1 的模型是 **Principal 主动启动、受信但能力受限的辅助 cognition**）。D1 保证的是两条：
`WriteSet_canonical_project(worker) = ∅`，以及正常路径下 `ReadBasis(worker) = delegation-time frozen snapshot`。
不可信第三方 worker / 外部模型供应商 / 敏感 monorepo / 远程执行 / 多租户隔离出现时再谈更强隔离。

活体（`rs-test/lean-d1g-read-gate.mjs`，barrier 与 D1-f 同构）实测：

```
live tree still holds the FROZEN marker : NO      ← Principal 已把 live 第一行改成 LIVE marker
live tree holds the LIVE marker         : YES
worker quoted the FROZEN marker         : YES     ← 它读的是冻结快照
worker quoted the LIVE marker           : NO
delegated branch offeredTools           : ["glob","grep","palimpsest_branch_result","read"]
  has read/glob/grep                    : YES
  has NO writer/shell tool              : YES
T2 blocking branches offeredTools       : [["palimpsest_branch_result"],["palimpsest_branch_result"]]
T2 every blocking branch is RESULT_ONLY : YES
```

即 worker 在被放行（此时 live 树已是 LIVE marker）之后，仍然报出 **H0 第一行的 FROZEN marker**——"它读的是冻结
快照"因此不是时序巧合可以解释的。D1 的原始目标随之成立：

```
Direct Work_Principal  ∥  Independent Research_worker@H0
```

（D1-f 测出的缺口属"产品能力面"而非 Agent 行为：当时的 worker 拒绝编造答案是**正确**行为。D1-g 只改能力面。）

## D2-r1 修订（D2 实现前，docs-only）：exclusive mutating Work delegation

> **状态：设计冻结（未实现）**。D1 已判 **CLOSED / STRONG PASS**（活体见 §C.21/D1-f barrier 与 §C.23/D1-g frozen-read barrier），
> 本修订**不回头改 D1**，只回答 D2 的三个问题：**D2 是什么、不是什么、第一硬前置是什么**。实现前只剩一句话裁决（§D2.3）。

### D2.1 一句话目标

```
Principal 把一项**会改项目**的工作异步交出去，worker 在自己的 isolated execution world 里用**正常工程能力**完成它，
而 canonical project 在任何时刻只有**一条 mutating line**；worker 的成果只能从**出口**进入 canonical。
```

它是 D1 的自然下一步，但**不是** D1 的放大：D1 的 canonical owner 是 `ReasoningCell`，D2 的 canonical owner 是
**真实 Work Task/Attempt**。

### D2.2 六条冻结原则

**① Worker 是 Work executor，不是 ReasoningBranch。**

```
RESEARCH → ReasoningCell        （D1，已冻结）
WORK     → Work Task / Attempt  （D2）
```

底层 DSH agent / subprocess machinery **可以复用**，但 canonical owner 必须是真实 Task/Attempt，因此：

```
Do not turn Reasoning branch into a code worker.
```

**禁止**把它做成"给 branch host 加第三档写权限然后继续用 branch 协议"。那是把两种 owner semantics 混成一种，
重新违反早已冻结的边界。

**② Worker 拿到 isolated worktree execution world，并且在那个世界里不被削成几个工具。**

```
Free cognition inside bounded execution world
```

世界内它可以有正常工程能力：`read` / `edit` / `write` / 跑测试 / shell / 分析。边界**是世界本身**，不是工具集——
这与 D1 的 `PROJECT_READ_ONLY` 是两种不同的机制，不要互相套用（§D2.5）。

**③ D2 只有一条 mutating lane。**

Worker 在 mutate 期间，Principal 可以继续：

```
read ✓   reason ✓   search ✓   chat ✓   delegate RESEARCH ✓
mutate canonical / 启动第二条 direct Work attempt ✗
```

因此 D2 的准入规则**不是**"write-set 不交叠"，而是**"不存在第二条 mutating line"**。这比旧 `LEAN-A10` 的
"重叠即拒"**更强也更简单**：不是比较集合再决定是否放行，而是根本不允许并行 mutation。

准入在**任何写入之前**求值，共三条，缺一即 **fail closed**（与 §3.2 的"未知即拒绝"一致）：

```
① 不存在正在执行的 Principal direct Work attempt
② canonical 工作树没有**未归属**变更（复用 begin 的同一判据与 `.palimpsest/` 脚手架过滤）
③ 不存在另一个活跃的 mutating delegation（每 project 至多一条）
```

求值通过之后，`HEAD` 被**冻结为该 delegation 的 base**，并在出口复核：

```
出口时 HEAD ≠ base  ⇒  拒绝结算（诚实失败），不把基于旧 base 的结果当作基于新 HEAD
```

这条正是 §3.2/`cross_revision_promotion_not_supported` 在 D2 的落点：它保证 D2 **永远不会**绕开 G10-Z 的 exact-head
protection——即使 Principal 违反了协议去改仓库，产品也只是拒绝，而不是晋升一个 base 不成立的结果。

（"Principal 在 delegation 活跃期间不得 mutate"因此是 §E.6 同类的 **principal protocol precondition**：产品无法追溯
"他到底改没改过"，但产品能检测 `HEAD` 漂移并在出口 fail closed。）

**④ 严格性放在出口。**

Worker 可以大胆探索（甚至在 disposable world 里写 reproducer、改临时文件、跑实验），canonical 只认出口：

```
Work attempt → immutable result commit → mechanical evidence
             → required independent verification → promotion eligibility
```

**⑤ `Worker COMPLETED ≠ Promoted`。**

Worker 完成不等于项目已经接受。promotion authority 不因 worker 完成而弱化，唯一 assessor 不变（`assessEligibility()`），
不新增第二条晋升路径。

**⑥ worktree completion observation 是 D2 的第一硬前置。**

2A-R 冻结的

```
Attempt COMPLETED ⇒ resultCommit 是包含所观察工作的不可变提交
```

必须**扩展到 worktree execution**，且**复用同一 completion invariant**（同一断言、同一 materialization）。
**不得**新写"worker 大概改完了"的近似逻辑——那正是 2A-R 修掉的东西，换个执行世界重犯一次没有任何理由。

### D2.3 旧假设的重新评估：`principal attempt attribution` **移出 D2**

旧附录 C 假设 D2 之后可能出现：

```
Principal RUNNING attempt
+  Worker RUNNING attempt
```

因此把「principal attempt attribution（host-local 绑定主代理的 in-place attempt）」列为 D2 硬前置。

从 **exclusive mutation** 的目标重新看，这个前置**不需要在 D2 解决**。D2 v1 可以直接规定：

> **启动 mutating WORK delegation 时，不允许已经存在正在执行的 Principal direct Work attempt。**
> （fail closed，在任何写入之前求值）

于是不变量仍然是 `one mutating Work attempt`，而 host-local 的 principal-attempt 绑定**下移 D3**——那才是真正需要
并发 mutation 的阶段。好处是明显的复杂度下降，且符合：

```
do not solve D3 inside D2
```

**这是 D2-r1 中唯一需要一句话裁决的点**（见 §D2.4 的重新开启条件）。

**裁决（2026-09-23，已确认）**：

> **D2 v1 does not require principal-attempt attribution: a mutating delegation is inadmissible while a Principal
> direct Work attempt is running, preserving one mutating Work attempt. Host-local Principal↔Attempt attribution is
> therefore deferred to D3, where concurrent mutation first makes that distinction necessary.**

理由一句话：D2 已经主动维持 `one mutating Work attempt`，所以"哪个 RUNNING attempt 属于 Principal"在 D2 **根本不会成为问题**；
提前把它做进 D2，只是在为尚不存在的 D3 并发状态付复杂度成本（`Do not solve concurrency before concurrency exists.`）。

### D2.4 明确**不属于** D2 的四件事（各带重新开启条件）

**1. write-path disjoint 并发（→ D3）。** D2 不该存在两条 mutating line，所以"两个不交叠 write-set 并发"不是 D2 的准入规则。

**2. Result Transplant / 跨 head 晋升（→ D3）。** 理由必须写死，因为它是**必要不充分**的：

```
Principal A @ H0            WriteSet_A ∩ WriteSet_B = ∅
Worker B    @ H0

A promotes:  H0 → H1
             ↑
             B 的 authority 仍绑定 base = H0
```

即使 B 改的是另一个文件，也**不能**因此把 `B(H0)` 直接 promote 到 `H1`——那会绕开 G10-Z 的 exact-head protection。

```
Write disjointness is necessary for concurrent mutation,
but not sufficient for promotion authority.
```

这正是 D3 需要 Result Transplant 的原因，也正是它不能提前到 D2 的原因。

**3. blocking Explore enrichment / cognition capability parity（独立项，不进 D2）。** 见 §D2.5——现在改 `collaborate`
会让 D1 的 closure boundary 重新漂移。

**4. 给 Reasoning branch 加写权限（永不在 D2 出现）。** 第三档**不是** `PROJECT_WRITE`：D2 worker 的写能力属于
**它的 disposable execution world 的边界**，不属于 branch 的能力档。

### D2.5 与 D1 的关系：D1 冻结、branch 词汇不扩写档

D1 的冻结态是：

```
delegate RESEARCH → PROJECT_READ_ONLY
collaborate       → RESULT_ONLY
```

本修订**不改**这两条。但要注意 `PROJECT_READ_ONLY` 的**地位**：它是

> **当前最小、已经通过活体的 cognition profile**

而**不是**"Palimpsest 的研究 Agent 原则上只能 read/glob/grep"。以后真实 dogfood 若表明研究 Agent 经常需要写 reproducer、
改临时代码、跑局部实验，可以扩展它的 **disposable execution world**——那**不构成重开 D1 correctness**，因为真正冻结的是：

```
WriteSet_canonical_world(worker) = ∅
```

而不是：

```
WriteSet_worker_disposable_world(worker) = ∅
```

**阶段冻结之后停止优化是健康的**：D1 刚通过活体，不因为"Free cognition / strict authority"的新认识回头重构它。

关于 blocking `collaborate = RESULT_ONLY`（D1-g 活体观察到：PARALLEL 分支对源码问题会答"材料不足"）：
它确实存在能力上限，但登记为**未来的独立项**，而不是混入 D2：

| 项 | 内容 | 重新开启条件 |
|---|---|---|
| cognition capability parity / blocking Explore enrichment | 给 blocking `collaborate` 的 branch 也开只读项目能力（复用同一 profile 机制） | dogfood 表明 blocking Explore 的 brief-only **经常**损害价值 |

理由：DEL-A08 已证明 delegate 是**加法**、collaborate 行为没有偷偷变化；立刻再改 collaborate 会让 D1 的 closure boundary 重新漂移。

### D2.6 验收（D2 出口）

**既有两项按 D2-r1 重新定形：**

- `LEAN-A10`（**重定形**）：不再表述为"write-set 重叠即拒"，而是**第二条 mutating lane 在任何写入之前被拒**：
  ① 已存在 RUNNING 的 Principal direct Work attempt 时，启动 mutating WORK delegation → 拒；
  ② canonical 工作树存在未归属变更时，启动 mutating WORK delegation → 拒；
  ③ mutating WORK delegation 活跃时，Principal `begin`/claim 另一条 attempt → 拒。
  三次拒绝都必须 **event delta 0**；并且**出口复核 `HEAD == base`**，漂移则拒绝结算（构造"Principal 偷偷 commit 后
  再 finish delegation"必须被拒）。（"比较集合含主代理 in-place attempt"的机制因此**不需要**在 D2 出现。）
- `LEAN-A09`（**重定形**）：主代理发起 mutating WORK 委派后**继续只读认知**，worker 在 isolated worktree 完成 →
  出口链完整；整个过程中项目只有一条 mutating line（旧表述"两个执行者完成三任务项目"在 exclusive mutation 下不再适用）。

**D2-r1 新增提案：**

| ID | 断言 |
|---|---|
| `DEL-D2-A01` | **活体（barrier 式）**：worker 在 worktree 中 mutate 期间，Principal 完成自己的 read/search 与一次 RESEARCH 委派；worker 完成后，**出口之前** canonical repo 零变化 |
| `DEL-D2-A02` | worker 成果**只从出口**进入 canonical（`attempt → result commit → mechanical evidence → required verification → promotion eligibility`），并显式断言 **`Worker COMPLETED ≠ Promoted`** |
| `DEL-D2-A03` | worktree execution 下 `Attempt COMPLETED ⇒ resultCommit` 成立，且**复用同一 completion invariant**（同一断言路径，无第二套近似） |
| `DEL-D2-A04` | **无第二真值面**：无 `DelegationStore`/`WorkerTask`/`ManagerAgent`；canonical owner 是同一账本里的 Task/Attempt；worker 不产 `EvidenceAtom`、不改 `PromotionEligibility` |
| `DEL-D2-A05` | **D1 不回归**：`delegate RESEARCH` 仍 `PROJECT_READ_ONLY`、`collaborate` 仍 `RESULT_ONLY`、`DEL-A01`–`A08` 全绿（加法而非替换） |
| `DEL-D2-A06` | crash/restart 诚实：被打断的 mutating worker 报 `INTERRUPTED`（不假装 RUNNING），v1 不自动重跑，canonical world 不留半成品 |

D2 必须有自己的活体装置（落 `rs-test/`），且确定性门禁全绿（`tsc -b`、vitest、`architecture:check`、`check-public-api`、playwright）。

### D2.8 切片计划与 D2-a 交付记录

```
D2-a  Execution world + observation          ← PASS（纯机械、无模型；§D2.8）
D2-b  Work-attempt bootstrap / exclusive admission   ← STRONG PASS（§D2.9）
D2-c  Worker runtime / execution inside the world   ← STRONG PASS（runtime + live gate；commit blocker 由 D2-cR 关闭）
D2-cR Self-contained Work Execution World Closure   ← CLOSED（§D2.11）
D2-e1 Settlement closure（WorkerOutcome → Canonical Work result）   ← CLOSED（§D2.12）
D2-e2 Verification + promotion readiness（复用 2B 路径，不造 worker verification）   ← CLOSED（§D2.13）
D2-d  Async lifecycle + host-local job map + followup   ← CLOSED（§D2.14）
D2-LIVE 端到端异步 delegated Work 达到 promotion eligibility   ← PASS（§D2-LIVE）
=== D2 CLOSED === 
```

**D2 最终能力陈述**（D3 的输入契约）：

> **An existing canonical Work can be executed asynchronously in an isolated real ExecutionWorld, produce an
> immutable source-result facet, settle crash-safely into canonical execution history, undergo independent
> verification and current-state promotion admission, and reach ELIGIBLE without changing canonical project source
> or exercising Promotion authority.**

D2 不再追加阶段（不开 D2-e3 / D2-f）；下一阶段是 **D3-0：World-Basis / Resource-Domain semantic foundation**
（先冻结 `ProjectWorldBasis = (P, S, A, E)` 与 `AttemptResult = source facet + asset facets + …`，再重新定义 currentness
与 compatibility），而不是直接做 "H0 commit → H1 commit" 的 transplant —— 否则很容易把 D3 再次锁回 Git-centric 模型。

切片顺序会按代码实际情况调整，但**D2-a 必须保持纯机械、无模型**：它要证明的不是"怎么 spawn 一个 coder"，而是

> 一个真实 Work attempt 放到 isolated worktree 后，Palimpsest 仍能像 in-place 一样准确回答：它到底做了什么、
> 有没有未提交工作、最终 immutable result commit 是什么。

**D2-a 明确排除**：DSH worker launch、PTC/native 决策、`palimpsest_delegate(kind=WORK)`、terminal followup、
worker crash lifecycle、promotion、verification、management mode、write-set concurrency、principal attribution。

#### D2-a 交付（2026-09-23）

**Work execution world 是既有的、真实的、attempt 绑定的 git worktree**——不是新造的第二套，也不是 D1 的 delegation
snapshot（那是**读**冻结，这是**执行**世界，两者的语义与生命周期不同）。它在 `claim` 时由 `GitPort.createWorktree`
创建于 `.palimpsest/worktrees/<attemptId>`，并新增两条**只读**的 port 成员让 Work owner 能命名它而不必自建第二套机制：

```
GitPort.repository?: string                      // in-place 判断所在的树
GitPort.worktreePath?(worktreeId): string        // 纯路径算术：只说树在哪里，不说它存在、更不创建
```

**统一 completion observation**（本片真正承重的部分）：

```
observeAttemptResult(attemptId) → {
  attemptId, placement, workDir, baseCommit, observedHead,
  committedChanges,       // git diff --name-only base..HEAD
  uncommittedChanges,     // git status --porcelain
  changedFiles,           // 两者并集（排序）
  requiredArtifacts,      // 每个声明产物在该树里是否存在
}
```

它现在是 `finish` 与 `report` **共同**的输入，`#assertCompletionMaterialized` 与 `#assertCompletionHasWork` 是**同一条**
规则，与 placement 无关。`report` 在 worktree placement 下**不再采信调用方的 `changedFiles`/`resultCommit`**——
这正是 D2-a 之前那条路径的漏洞：placed attempt 的完成只凭 worker 自述。于是：

```
CompletionInvariant(in-place) == CompletionInvariant(worktree)
```

**可观察性是 placement 的性质，不是一刀切要求**：port **能命名一棵树**（first-party `GitCliPort` 恒能）⇒ 观察它；
**命名了却没有那棵树** ⇒ 拒绝（"看不见"绝不等于"干净"）；**port 根本无法命名树**（内存 port，只存在于测试世界，
磁盘上没有树也就无所谓看错）⇒ 该 placement 的完成仍回到调用方报告，行为与本片之前一致。这条分界写进了代码注释与
`observeAttemptResult` 的返回类型（`null` = 该 placement 不可观察）。

**`finish` 仍然只服务 in-place**，但理由换了：不再是"树观察不到"（已经不成立），而是**工作位**——`finish` 关闭的是
`begin` 打开的直接 attempt，而 `begin` 是 in-place only（§E.4.1），worktree placement 下不存在这样的工作位。错误信息
如实改为这一点，并保留"placed attempt 由自己的 report 路径结算"。

**验收**（`test/lean_work_execution_world.test.ts`，7 项）：

| 用例 | 断言 |
|---|---|
| world 存在且绑定 base | 真实 git worktree（`git worktree list` 认得）、`workDir` 指向 `.palimpsest/worktrees/<attemptId>`、HEAD == base、canonical 树零变化 |
| **world 缺失** | 拒绝（`has no work execution world`），绝不报成"干净" |
| **未提交的完成** | 拒绝且 event delta 0、attempt 仍 RUNNING（与 in-place 同一规则、同一信息） |
| **已提交的完成** | 结算到**world 内的提交**，且调用方谎报的 `changedFiles`/`resultCommit` 被观察覆盖；canonical 树仍为零变化 |
| **提交后又漂移** | 拒绝（"已有 result commit"不是忽略后续工作的理由） |
| **越界工作** | 拒绝，且错误信息点名 placement |
| **canonical HEAD 前移** | 观察仍诚实（base H0 / result R）；"结果身份 ≠ 晋升权威"由出口那一层回答（§3.2 / `cross_revision_promotion_not_supported`） |

同片还发现并修正了两处**既有测试的陈旧前提**：`A24`（原判据是"worktree 读不到树"——该理由已被本片推翻，改为"没有直接工作位"）
与 `test/e2_host_demo.test.ts`（它原本在真实 worktree 里产出 `out/report.pptx` 后**不提交就 report**，靠旧的自述路径通过；
现在按真实工作纪律提交后再 report，并额外断言账本记录的是**被观察到的**提交与文件）。后者是本片最有价值的副作用：
**新的完成规则当场抓出了一个编码了旧弱行为的测试**。

#### D2-b 交付（2026-09-23）

**入口形状（评审冻结）**：

```
D2-b bootstraps execution of an EXISTING scheduler-admissible canonical Work task.
```

```
palimpsest_begin   = 声明最小 direct Work + bootstrap Principal attempt
D2-b               = 把一个**已经声明并已获授权**的 canonical task bootstrap 成 isolated worker attempt
```

因此 D2-b **不接收** `goal` / `writePaths` / `requiredArtifacts`，也**不能**创建 TaskSpec；它只消费已经存在于
ProjectIR、已经通过 `TaskPolicy` 获得 canonical `TaskEnvelope` 的任务：

```
What work exists?  ≠  Who executes that work?
```

前者属于 ProjectIR / planning，后者才属于 delegation。没有 canonical task ⇒ **`WORK_NOT_DECLARED`**（零事件），
产品**不会**顺手变成 planner。

**复用关系**：

```
复用   TaskPolicy / TaskEnvelope / CompletionContract 语义
不复用 palimpsest_begin 作为 worker bootstrap API
```

worker 的 authority **就是** canonical `TaskEnvelope`（project revision/digest、base commit、write_paths、
required_artifacts、allowed_commands、policy identity）——不出现 `DelegationEnvelope` / `WorkerEnvelope` / `WorkerAuthority`。
于是下游的 completion contract、scope 观察、mechanical checks、`ATTEMPT_RESULT` 复核、`PromotionEligibility` 全部直接复用。

**唯一 base**：`Base_D2 = TaskEnvelope.base_commit`。admission 只**证明当前世界仍与它一致**，不"冻结"第二个 base
值——否则立刻出现 `TaskEnvelope base` vs `Delegation base` 两个真值。

**scheduler 主权**：D2-b 只推进 scheduler 自己认为 next 的那个任务（`preview()` → `TASK_STARTED` → 该 task）。
`expectedTaskId` 是**断言**而非调度命令：

```
expectedTaskId = assertion  ≠  scheduling command
```

不一致 ⇒ `TASK_NOT_NEXT_SCHEDULABLE`（零事件），**绝不** hold A / skip A / force B。

**lane 占用（取代三条分别的 source）**：核心判据是 `there is no existing mutating Work owner`。因为 D2 的 mutating
delegation 本身就是 Work Attempt，canonical Work 投影已能回答：任何 `CREATED`/`LEASED`/`RUNNING` 的 mutating attempt
都算 lane occupied（in-place RUNNING 即 Principal lane，worktree 的即 worker lane）。**没有** `activeDelegations`
durable state，也**不问**"这是谁的 attempt"（§D2.3）。

**preflight 顺序**（全部在第一条事件之前，任何失败 `Δevents = 0`）：

```
P0 placement: execution == worktree（in-place 部署没有 worker lane）
P1 canonical project 存在                    → 否则 WORK_NOT_DECLARED
P2 ProjectHeadStatus.state == IN_SYNC        → 否则 HEAD_NOT_IN_SYNC（G10-X 既有规则，不绕过）
P3 lane 占用 / resume（见下）
P4 scheduler next 必须是 TASK_STARTED 且等于 expectedTaskId → 否则 TASK_NOT_NEXT_SCHEDULABLE
P5 由 canonical envelope 派生 CompletionContract + task readiness（能力不满足则 fail closed）
P6 canonical 树无未归属变更（与 begin **同一**判据）
P7 live HEAD == projectHeadCommit == provenEffectHeadCommit == envelope.base_commit
   → 否则 HEAD_BASIS_MISMATCH
ONLY THEN: step TASK_STARTED → step ATTEMPT_CREATED → claim（建 worktree）
```

**dirty 判定复用**：新增内部 `#observeCanonicalMutationBasis(repository)`，`begin` 与 D2-b **共同消费**（不是复制判断），
`.palimpsest/` 过滤一致——否则 Direct 与 Delegated 两条入口会对同一个 canonical repo 产生两种 clean 定义。

**crash/retry 收敛**（v1 直接定义）：

| 状态 | 行为 |
|---|---|
| 已有 matching `CREATED` attempt | **claim 它**（不再 step——scheduler 在 stage 被占用时返回 null，再 step 会死锁） |
| 已有 matching `LEASED`/`RUNNING` attempt | 返回 `RESUMED`：不 re-claim、不新建 worktree |
| lane 被**别的** task 持有 | `MUTATING_LANE_OCCUPIED`，零写 |
| 同一 task 已 terminal | 不自动开下一 batch，交给正常 scheduler |

**返回状态不叫 `WORKER_RUNNING`**：D2-b 只建立 work position，所以是 `PREPARED` / `RESUMED`。因为

```
Attempt RUNNING  ≠  Host worker running
```

（与 D1 的 `Reasoning semantic state ≠ host job state` 同一条教训）。D2-d 才组合 host job state。

**出口 `HEAD == base` 不塞进 `report()`**：D2-a 已证明"canonical HEAD 后来移动，worktree 结果仍可诚实观察"，所以这条
不能变成所有 worktree attempt 的普遍完成 invariant——那又会把 result identity 与 promotion authority 混起来。
它属于 **mutating delegation settlement admission**（D2-e 交付）：结算时若 `current canonical expected head !=
envelope.base_commit` ⇒ `BASE_DRIFT` 拒绝，但**不删除** worktree、不宣称结果不存在（那是 D3 Result Transplant 的输入）。

**验收**（`test/lean_mutating_bootstrap.test.ts`，9 项，全程无 LLM）：

| # | 断言 |
|---|---|
| 1 | `WORK_NOT_DECLARED`：无 canonical task 时拒绝、零事件、且**不能**创建 ProjectIR/TaskSpec |
| 2 | `TASK_NOT_NEXT_SCHEDULABLE`：expected ≠ scheduler next 时拒绝零事件；一致时通过（断言形式可用） |
| 3 | **envelope authority 复用**：attempt 绑定的 envelope 就是 canonical task envelope（经 Work owner 自己的 `attemptWorkRecord` 读回），结果里没有第二个 authority 词汇 |
| 4 | `MUTATING_LANE_OCCUPIED`：同 task 重复调用走 `RESUMED`（不新增事件/attempt）；别的 task 请求被拒且零事件 |
| 5 | **clean canonical basis**：未归属变更拒绝（同一 filter），`.palimpsest/` 脚手架不算阻塞 |
| 6 | `HEAD_BASIS_MISMATCH`：canonical head 前移时拒绝，零事件、零 attempt |
| 7 | **retry 收敛**：`ATTEMPT_CREATED` 后 crash ⇒ 重试 claim **同一个** attempt（用公开生命周期原语忠实构造），再重试零事件 |
| 8 | **no worker yet**：`state=PREPARED`、detail 明说没有 worker 在跑、worktree 真实且干净、canonical 树零变化 |
| 9 | in-place 部署**没有** worker lane：`WORKTREE_PLACEMENT_REQUIRED` |

**D2-b 顺带说明的一条结构性质**：`execution` 的取值本身就让两条 lane 互斥——in-place 部署 `begin` 可用而 worker lane
不可用，worktree 部署反之（§E.4.1）。这**不是** D2 v1 的额外规则，而是既有 placement 语义的结果，也正是 §D2.3 能成立
的原因：在 D2 v1 里，"哪个 RUNNING attempt 属于 Principal"根本不会成为一个问题。

#### D2-c 交付（2026-09-24）

**一句话**：

```
Run a capable, PTC-first engineering Agent inside the already-prepared Work execution world,
but let it export only a non-authoritative worker outcome.
```

```
D2-b  canonical TaskEnvelope → RUNNING Attempt → isolated worktree @ H0 → PREPARED
D2-c  PREPARED → strong worker cognition → edits/tests/experiments INSIDE the world → WorkerOutcome
      NO ATTEMPT_COMPLETED / Evidence / Verification / Promotion / canonical mutation
```

```
D2-c = execution  ≠  settlement（D2-e）
```

**交付**：

- `WorkWorkerExecutionPort.run()`（**blocking**；D2-d 再扩成 `start()` + host-local job map，与 D1 同一片切法）；
- 结果词表 `READY_FOR_SETTLEMENT | NEEDS_ESCALATION`（端口级另有 `HOST_FAILURE`）；**没有 `COMPLETED`**——
  `Worker says READY_FOR_SETTLEMENT ≠ Attempt is COMPLETED`；
- 工具定义作为**数据**跨进程边界：host 只做"注册 + 取第一次上报 + 打印"，而词表、允许的参数、escalation 必须带 reason
  等规则全部在**回来的路上**由 `parseWorkWorkerResult` 严格执行（`enum` 由 `WORK_WORKER_OUTCOME_KINDS` 生成，不是
  JS 里第二份清单）。之所以这样切：host 只能通过 entry 触达 Palimpsest，而公共 API 面已冻结（**不得新增导出名**），
  所以环境像 context 一样以序列化描述跨界，而"语义只有一处"这条没有被牺牲；
- **capability-open + authority-closed**：worker 继承宿主普通工程工具，`deny` 掉继承来的 `palimpsest_*`。deny 清单按
  **scope 自己可见的 schema 枚举**而非硬编码——因为 `restrict()` 对未知名字 fail，静态清单会在部署组合出不同
  Palimpsest 面时直接崩，并会悄悄漏掉以后新增的 authority 工具。worker 的 result 工具注册进**它自己那一层**：
  DSH 明文规定 restriction 只过滤"继承来的"层、从不过滤本层注册；
- **PTC-first**：worker scope `presentAs('ptc')`。presentation 是 **host 配置 / runtime provenance**，**不进入**
  TaskEnvelope、AttemptReport 或任何 Work event——它只说明"这个 worker 怎样使用同一组 capability"；
- **context**：canonical task-sufficient（project goal/requirements/decisions + task objective + write scope +
  required artifacts + base commit + completion 人话摘要 + verification-required），并排除
  principal conversation、scratchpad、scheduler seq、**attempt id**、gate id、lease state
  （`Context isolation ≠ Context starvation`）；
- **escalation 不 terminalize attempt**：host worker 停了 ≠ canonical Work terminal；**host failure 只是
  `HOST_FAILURE`**，绝不自动制造 `ATTEMPT_FAILED`（D2-d 才组合 `INTERRUPTED`）；
- `TaskEnvelope.allowed_commands` **不是** worker 的 shell ACL：它仍然只决定"哪些命令结果能成为受管 mechanical
  evidence"（`Worker experiment ≠ Work Evidence`，worker 自己跑测试通过也不产生 `EvidenceAtom`）；
- 未暴露 `palimpsest_delegate(kind=WORK)` 给 Principal（那是 D2-d）。

**活体实测**（`rs-test/lean-d2c-worker-gate.mjs`；真实 DSH、真实模型、真实仓库、真实 worktree）：

```
worker run ended                       : exit:0
worker cwd == prepared world           : YES
presentation                           : ptc
offered tools (count)                  : 1
  has run_code (PTC transport)         : YES
  wire is PTC-only (run_code)          : YES
  inherited Palimpsest authority tools : NONE (authority-closed)
outcome                                : NEEDS_ESCALATION
worker actually edited the world       : YES ["M src/ranges.ts"]
world committed                        : NO
COMMIT BLOCKER                         : (见下)
canonical HEAD unchanged               : YES
canonical tree unchanged               : YES
canonical ranges.ts still buggy        : YES
ledger events / attempts / evidence    : 8→8 / 1→1 / 0→0 (unchanged)
ledger ATTEMPT_COMPLETED               : 0 → 0 (unchanged)
ledger attemptStates                   : RUNNING → RUNNING (unchanged)
```

即：

```
Worker really did Work   ∧   the canonical world still did not accept it
```

而且这一轮**恰好演示了词表的设计意图**：worker 找到了并修好了 bug（`M src/ranges.ts`），却因为**无法提交**而如实上报
`NEEDS_ESCALATION`（带 reason），**没有**谎报 `READY_FOR_SETTLEMENT`。PTC 下 wire header 只有 `run_code`，所以
"它有 `palimpsest_worker_result` 吗"不能从 header 判断——它能上报，本身就是它可达的证明。

#### D2-c 的 OPEN 缺口：worker **无法提交**（需评审）

```
execution world = git worktree            （D2-a 复用既有基础设施）
world boundary  = workspace-write @ cwd    （本片强制：世界边界必须成立，否则 fail closed）
worker commits its own work                （本片要求：git commit 是 agent 工作，产品不代写提交）
⇒ 结构性不可能：git worktree 的 .git 在 worktree 之外
```

DSH 的 `workspace-write` 恰好是「session cwd + host `/tmp` + `os.tmpdir()`」，**没有第二可写根**（已核
`dsh-sandbox/roots`：`writableRoots(policy)` 的语义就是这一条）；唯一能放开的是 `danger-full-access`，而那是明确
禁止的（不能 PTC + full-access + 只靠 prompt 承诺不碰 canonical repo）。实测中 worker 自己给出了同样的诊断：
"the worktree's .git directory lies outside the sandboxed workspace (workspace-write) and the escalation to
danger-full-access requires approval"。

两个候选解（**都改 D2-a 的世界形状，因此必须评审**，本片不擅自选）：

1. **世界改为自包含仓库**：`git clone --shared/--reference` 到 `.palimpsest/worlds/<attemptId>`，`.git` 就在**世界内** ⇒
   `workspace-write` 足够、worker 正常提交。代价：结果提交的 object 落在**世界自己的 store**（canonical 晋升需要
   fetch/bundle 或 alternates），且每次 prepare 多一次 clone（小仓库 + 硬链接/alternate 可接受）。
2. **由 host 在出口代提交**：与本片冻结的"worker 自己提交、产品不代写提交"冲突，**不推荐**；若将来要，必须作为一次
   显式评审。

**顺带说明 D2-a 的观察规则是对的**：本片结束时世界是 dirty 的，于是 `observeAttemptResult` 的 `uncommittedChanges`
非空 ⇒ D2-e 的 settlement 会拒绝结算。也就是说"worker 说自己 READY"与"产品能否结算"确实是两件事，而第二条由
**产品观察**决定——这正是 `Agent discipline improves UX; product observation preserves correctness`。

**结论**：D2-c 的**运行时与边界**已实证（PTC、capability-open/authority-closed、outcome ≠ fact、canonical 零变化、
escalation 诚实），**"worker 自己提交"这一步被世界形状阻塞**。因此 D2-c 判
**runtime PASS / live gate PARTIAL（1 个结构性 blocker，需评审）**，而不是 STRONG PASS。

#### D2-cR 交付（2026-09-24）：Self-contained Work Execution World Closure

**裁决**：采用**世界拥有自身可变 Git 状态**的方案，**拒绝** host-side commit，也**不**为了保住旧 backend 去把
linked worktree 的 `.git/worktrees/...` 变成 DSH 的第二可写根。

理由不是"worktree 有个 sandbox 兼容小 bug"，而是一条更值得冻结的架构事实：

```
Work Execution World must own its mutable execution state.
```

host-side commit 被拒的根本原因是 ownership：一旦变成

```
Worker edits → Host decides what to add/commit
```

host 就同时承担**选择哪些文件属于成果**、**创建结果 artifact**、**再验证这个 artifact** 三件事，
executor 与 governor 又混在一起。继续维持：

```
Worker authors the candidate artifact;  Palimpsest observes and admits it.
```

##### 新增的是**契约**，不是"git clone"

```
Canonical Work basis
      ↓
ExecutionWorld contract      create / open-or-resume · exact basis · worldDir · observe · result export · release
      ↓
first-party backend: GitRepositoryWorld（本片实现）        · LinkedWorktreeWorld（legacy / 测试兼容）
future:              ContainerWorld / RemoteSandboxWorld / MicroVMWorld
```

"Palimpsest 的 Worker 就是 Git linked worktree"这句话从来没有被冻结；被冻结的是 D2-a 真正证明的那条：

```
CompletionInvariant is placement-independent
```

linked worktree 只是当时用来证明它的 backend；backend 被实测淘汰，invariant 不因此动摇。因此
`observeAttemptResult()` 一行未改，变的只是 **workDir 如何被 materialize**。

##### 第一方 backend 的精确形态与命名

```
git clone --shared --no-checkout <canonical> <world>   ← 借用不可变对象，不复制历史
git checkout --detach <basisCommit>                    ← 精确 basis
git remote remove origin                               ← 不给 Worker 一条显式"push 回 canonical"的路
user.name/user.email                                   ← 操作性 commit identity
```

术语必须写准：这是 **self-contained MUTABLE repository world**（或 world-owned Git control plane with
borrowed immutable object backing），**不是** fully self-contained——`--shared` 让
`.git/objects/info/alternates` 仍指向 canonical object store。真正要解决的是：

```
所有 MUTABLE Git state（HEAD / refs / index / config / new objects）都必须在 sandbox writable root 内。
```

而不是"每次都复制 500MB/5GB 的对象"。将来若出现 remote execution、world 搬迁、canonical object store
生命周期不可靠、更强 read isolation，backend 可换成 `--dissociate` / full clone / bundle materialization /
remote image，**Work 语义不变**。

##### commit identity

```
GitAuthorMetadata  ≠  PalimpsestAgentIdentity
```

`Palimpsest Worker <worker@palimpsest.invalid>` 只表示"这个 candidate commit 来自 Worker execution"，
**不**冒充用户，**不**声称 durable Agent identity。Work truth 不依赖它。

##### World lifecycle（现在冻结，D2-d 才用）

| 状态 | 含义 |
|---|---|
| `PREPARED` | world 存在，`HEAD = TaskEnvelope.base_commit`，不保证有 worker |
| `ACTIVE` | host-local worker 正在使用它——**host execution fact，不是 canonical Work state** |
| `QUIESCENT` | worker 已停（`READY_FOR_SETTLEMENT` / `NEEDS_ESCALATION` / `HOST_FAILURE` / host restart），**world 保留** |
| `RELEASED` | **只有**产品明确知道结果已被安全记录/导出，或用户明确丢弃，才 cleanup |

**禁止**：`worker process exits → rm -rf world`。`release()` 只能被显式调用。

##### crash / restart（现在冻结）

世界路径确定性：`.palimpsest/worlds/<attemptId>`（`worldPath`；`worktreePath` 保留为冻结低层面的兼容别名）。
于是 restart 后：

```
Attempt RUNNING + world exists + no host worker  → INTERRUPTED（D2-d）
Attempt RUNNING + world missing                  → WORLD_MISSING / recovery_required
```

**绝不**"那就重新 clone 一个 H0"——旧 world 里可能有数小时工作、未提交修改、本地 commit、实验文件；
重建等于悄悄丢数据。

##### 结果导出：现在定义，D2-e 调用

```
Result export  ≠  Promotion
```

host-owned primitive `exportResultCommit(world, R)`：把对象导入 canonical repository 的 object database，
**不移动 HEAD、不更新任何 ref、不改 ProjectIR、不动 working tree**。之后 `git cat-file -e R^{commit}` 成立。
即：

```
Object availability  ≠  Canonical project state
```

与 Verification materialization 同一哲学。实现用 object-only fetch（`git fetch --no-tags <world> HEAD`，
无 refspec 目的地 ⇒ 只写 `FETCH_HEAD`）。

##### 验收（`test/lean_execution_world.test.ts`，7 项 + D2-a/D2-b 全套回归）

| # | 断言 |
|---|---|
| 1 | world 的**可变 git state 在 world 内**（`.git/HEAD`、`config`），不可变 base 走 alternates **借用**，HEAD == basis，**无 origin**，commit identity 是操作性身份，且 canonical **不把它列为 linked worktree** |
| 2 | Worker 在 world 内**自己提交**（不带任何 `-c user.*` 覆盖，用 world 自己的身份），canonical HEAD/内容/工作树零变化 |
| 3 | `open()` 对缺失 world **fail closed**（`WORLD_MISSING`，明说"不重建"），且不会顺手造一个 |
| 4 | restart **重开同一个 world**（同路径、同 HEAD、同结果），不产生第二个 world、不换 basis |
| 5 | `exportResultCommit` 后 canonical **可读**该提交，而 HEAD/工作树/refs/文件内容**逐项不变** |
| 6 | 对已消失的 world 导出 ⇒ 拒绝（`WORLD_MISSING`） |
| 7 | worker 进程结束后 world **仍在**（含未提交工作），只有显式 `release()` 才删除；重复 release 不报错 |

**活体**（`rs-test/lean-d2c-worker-gate.mjs`，真实 DSH + 真实模型 + 真实世界）：

```
worker run ended                           : exit:0
worker cwd == prepared world               : YES
presentation / wire                        : ptc / PTC-only (run_code)
inherited Palimpsest authority tools       : NONE (authority-closed)
outcome                                    : READY_FOR_SETTLEMENT
world owns its git state (.git inside)     : YES
world has no origin remote                 : YES
world committed (HEAD moved to R)          : YES      ← D2-c 的 blocker 关闭
COMMIT BLOCKER                             : (not observed)
the fix is IN the world's commit           : YES
canonical HEAD / 树 / 内容                  : 不变 / 不变 / 仍有 bug
ledger events / attempts / evidence        : 8→8 / 1→1 / 0→0
ledger ATTEMPT_COMPLETED / attemptStates   : 0→0 / RUNNING→RUNNING
```

即完整链路成立：

```
Worker really did Work（读/改/测/commit R）  ∧  canonical world still did not accept it
```

**D2-c = STRONG PASS**（runtime + live gate 双证）。

##### 命名迁移

内部 D2 代码改用 `executionWorld` / `worldDir` / `worldPath`（`PreparedMutatingWork.worldPath`、
`GitPort.worldPath` / `createWorld`、effects action `palimpsest.world.create`）；被冻结的低层面保留
`GitPort.worktreePath` / `createWorktree` / `palimpsest.worktree.create` 作为**兼容别名**（同值）。
不为 public API freeze 把内部设计继续叫 worktree。

#### D2-e1 交付（2026-09-24）：Settlement Closure

**只解决一件事**：

```
WorkerOutcome  →  Canonical Work result
```

完整路径（顺序本身就是语义）：

```
READY_FOR_SETTLEMENT
      ↓  observeAttemptResult()            ← D2-a 的观察，一行未改
      ↓  completion invariant              ← 与 in-place 同一条规则
      ↓  basis settlement admission        ← 最新 head 四方一致
      ↓  exportResultCommit(R)             ← 先 export
      ↓  report()                          ← 后 report
      ↓  ATTEMPT_COMPLETED
```

入口：`ProjectController.settleMutatingWork({ attemptId, workerOutcome })`。三条铁律：

**① `WorkerOutcome ≠ AttemptReport`**：worker 不生成 report，也**不能**写账本。产品记录的一切都来自观察；`settleMutatingWork` 调 `report()` 时**不传**任何 `changedFiles`/`resultCommit`——传无可传，正是设计。

**② basis 在 export/report 之前**：先 export 再发现 drift，会留下一个"已导出、已记账、却对着项目已经不存在的 head"的世界。四方一致（`IN_SYNC` ∧ project head == proven effect head == live repo HEAD == `envelope.base_commit`）任一不满足 ⇒ `BASE_DRIFT`：**no export / no report / no verification / no promotion / world retained / R retained**。

**③ 先 export 后 report**：report 会写下 `result_commit = R`，这个名字必须在 canonical object universe 里可解析，否则世界释放后账本就指着一个谁都物化不出来的提交。export 不成立 ⇒ `NOT_READY`（`RESULT_NOT_EXPORTED`），不记账。

**④ BASE_DRIFT 不自动修复、不 terminalize**：不做 auto rebase / cherry-pick / transplant，也不新建 H1 world。返回 `BASE_DRIFT` + `resultAvailable` + `worldRetained`，**attempt 仍是 RUNNING**（lane 故意保持 fenced）。一条外部/违规的 head 漂移**绝不能**顺带释放 mutation authority——这是 fail-closed，不是 deadlock bug；后续由显式的恢复/取消/未来 transplant 决定。

**其余拒绝**（都保持 attempt RUNNING、世界不动）：`UNCOMMITTED_WORK`（世界还有未提交工作——D2-c 活体里 worker 无法提交时正是这条会拦）、`NO_WORK`（空产出）、`OUT_OF_SCOPE`（越界，点名 envelope 的 `write_paths`）、`WORLD_UNOBSERVABLE`，以及 `NEEDS_ESCALATION`/`HOST_FAILURE`（worker 没交出工作 ⇒ 什么都不观察、不导出、不记账）。

**新 backend 带来的三个 crash window 都钉住了**：

| 窗口 | 状态 | retry 结果 |
|---|---|---|
| A：R 只在 world（未导出未记账） | 进程死在 settlement 前 | 重跑同一 settlement ⇒ `SETTLED` |
| B：R 已导出、未 report | 死在 export 与 report 之间 | 重跑 ⇒ 导出幂等（object availability 无副作用）⇒ `SETTLED`，无重复事实 |
| C：已 report | worker/world 仍在 | retry ⇒ **replay**：调度器以 `(attempt, terminal event type, report digest)` 为身份返回已提交事件；断言 attempt 数、`ATTEMPT_COMPLETED` 事件数、`result_commit` 三者均不重复 |

**实现说明（一处架构取舍）**：`ProjectController` 是 L2，`ExecutionWorldPort` 的第一方实现在 L5，直接 import 会构成 `L2 → L5` 越界（实测被 `architecture:check` 拦下，1 violation）。因此 controller 侧**结构化声明**它唯一需要的那一件事：

```ts
interface SettlingExecutionWorldPort {
  exportResultCommit(input: { attemptId: string; commit: string }):
    Promise<{ imported: boolean; detail: string }>;
}
```

与 `FinishVerificationFace`、D1 的 snapshot port 同一手法：形状即契约，第一方实现仍在 `src/deployment/`，Work owner 不知道它的名字。`executionWorld` 选项可选——最小安装没有 world，此时 settlement 会如实报告"未能导入结果"，而不是假装导入过。

**验收**（`test/lean_settlement_closure.test.ts`，9 项，真实仓库 + 真实 world + 真实 git）：

| 用例 | 断言 |
|---|---|
| 正常闭环 | `SETTLED`；`result_commit` == 观察到的 R 且 canonical 可 `cat-file -e`；`changed_files` 来自观察；canonical HEAD 与文件**仍未接受**该工作 |
| 未提交 | `NOT_READY/UNCOMMITTED_WORK`，attempt 仍 RUNNING，工作仍在世界内 |
| 空产出 | `NOT_READY/NO_WORK` |
| escalation / host failure | `NOT_READY`，且**即使世界里有完美提交**也什么都不做：未记账、未导出 |
| HEAD 漂移 | `BASE_DRIFT` + `resultCommit` + `worldRetained`；未记账、未导出（`cat-file -e` 失败）、attempt 仍 RUNNING、世界与 R 完好 |
| 漂移撤销后重试 | 同一世界 `SETTLED`——结果在拒绝中存活，这正是"不删"的理由 |
| Crash A / B / C | 如上表 |

**下一步（D2-e2）**：复用 2B 已证明的路径，**不造 Worker verification**——`ATTEMPT_COMPLETED → ATTEMPT_RESULT subject → independent verifier（若 required）→ PromotionVerificationAdmission → assessPromotionEligibility()`，且闭合到 **promotion eligibility** 为止（`Worker COMPLETED ≠ Promoted`，D2 不再发明 "worker finished → auto promote" 的特殊通路）。类型上按评审意见预留 `sourceResultCommit` 与未来的 `producedAssetRefs`，措辞上把 result commit 说成 **source result facet**，不写成"Work 的全部输出"。

#### D2-e2 交付（2026-09-24）：Worker Result Settlement & Promotion Readiness

**这一片只回答一个问题**：

```
一个刚完成的真实 Work attempt，怎样进入 2B 已经证明过的 verification / admission 语义？
```

它是 **integration closure，不是 subsystem construction**。判据（评审给定，并已落成机器检查）：

> 删掉本片新增的 orchestration glue，既有的 2B verification / admission 原语必须仍然独立成立；如果必须重写 2B 才能接上 D2 Work，说明 integration boundary 错了。

**本片未新增任何 semantic primitive**：

```
不加 verifier            （仍用 commandAttemptResultVerifier()，ref 与 2B 相同）
不加 verification 生命周期 （仍用 ATTEMPT_RESULT subject + 既有 run/protocol/independence/freshness）
不加 promotion 通路       （仍用唯一 assessor assessPromotionEligibility）
不加状态词汇              （NOT_READY 已有表达，见下）
```

`test/lean_promotion_readiness.test.ts` 里有一条 CI-only 结构断言守这条线：上述四个 plane 的源文件不得出现
`WorkerVerification` / `DelegationVerification` / `WorkVerification` / `AIReviewResult` / 第二个 eligibility assessor，
且 `commandAttemptResultVerifier()` 与 `assessPromotionEligibility(` 仍是唯一入口。

**`NOT_READY` vs `INELIGIBLE` 不需要新状态**（评审指定唯一要重点审计的一点）。既有 blocker taxonomy 恰好已经区分：

```
required_verification_missing      无 run 存在        ⇒ 事实不足（NOT_READY）
required_verification_unsatisfied  有 run 但不合格     ⇒ 已证明不可采纳（INELIGIBLE）
```

**五条 invariant 的验收**（`test/lean_promotion_readiness.test.ts`，6 项）：

| invariant | 断言 |
|---|---|
| **A** `ATTEMPT_COMPLETED ⇏ PROMOTION_ELIGIBLE` | 真实 D2 spine 产生的 attempt 为 COMPLETED，而 eligibility 为 false |
| **B** verification 判断不改写 Work 历史 | 跑完真实 verifier 后：attempt 仍 COMPLETED、`report` 逐字节不变（含 `result_commit`）、事件/晋升计数不变 |
| **C** 需要时 PASS 是必要而非充分 | 存在 PASS 时 eligibility 仍由 current state 决定（见 D）；本片中 required 未被满足时 blocker 为 `_missing`，绝非 `_unsatisfied` |
| **D** eligibility 针对**当前状态**求值 | 同一 attempt、同一 recorded result、项目 head 前移后重新求值，答**由当前状态算出**；且 digest 可重复读取一致（`f(f(x)) = f(x)`） |
| **E** eligibility **零 project mutation** | 前后 `head` / 工作树 / refs / 事件数 / 晋升数逐项相等 |

**两处实测发现，都改进了规格而不是迁就实现**：

1. **required + 未组合 verifier ⇒ 在 bootstrap 就被拒**（`ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE`，§E.14.1）。这不是"没有 run"，
   而是**该部署根本不能开始这份工作**：`TASK_STARTED` 为 0、attempt 为 null、零事件。原来那版用例把它当"没有 run"来测，
   与规格不符，现已改成断言这条 fail-closed 语义本身。
2. **`canonicalExpectedHead` 是晋升链的 head**，在没有晋升时**合理地**等于 envelope base——所以 head 前移**不**通过它体现。
   本片把这个观察写进注释：漂移体现在**可采纳性**（ineligible + 相应 blocker + digest 变化），以及"verdict 从不被当作 authority"。
   我最初写的断言要求一个 currentness blocker 出现，实测该 attempt 早已因 `task_not_verifying` 不可采纳（COMPLETED 但 task 已越过该 batch），
   于是把断言收紧为**证据支持的确切命题**，而不是更漂亮的更强命题。

**同步 Work spine 现在闭合为**：

```
prepare  → materialize execution authority
run      → perform mutable work
settle   → freeze and record execution result
verify   → independently test result claims
eligible → judge whether CURRENT state permits acceptance
```

每个箭头语义不同，且 `ELIGIBLE → PROMOTE` 这条边**不归本片**（既有 Promotion authority 拥有；`Worker COMPLETED ≠ Promoted`）。
类型上按评审预留：result commit 是 **source result facet**，`AttemptResult` 未来可加 `producedAssetRefs` / `artifactManifestDigest`，
而 verifier 看到的 subject identity 仍是 `ATTEMPT_RESULT`，不随 Asset Plane 出现而重写。

**D2-e2 明确未做**（评审列出的清单，逐条未动）：auto promote / auto merge / auto transplant / auto rebase、
verification rollback、asset CAS、通用 ProjectWorldBasis schema、async scheduler、background verifier worker、
D3 compatibility analysis、BASE_DRIFT recovery。

**阶段状态**：

```
D2-a   PASS
D2-b   STRONG PASS
D2-c   STRONG PASS
D2-cR  CLOSED
D2-e1  CLOSED
D2-e2  CLOSED（本片）
D2-d   NEXT —— 只改 transport/lifetime，不改 semantics
D3     NOT YET
```

#### D2-d 交付（2026-09-24）：Host-local Asynchronous Work Execution Transport

**定义（评审冻结）**：

```
Async D2 = existing synchronous semantics + different lifetime/transport
```

**不是** `new scheduler semantics`。以下全部不变：prepare / run / settle / completion invariant / basis admission /
verification / eligibility / promotion authority。本片只增加：non-blocking `start`、host-local execution lifetime、
job observation/followup、restart honesty。

##### 只有一个 prepare→run→settle 实现

```ts
executeMutatingWorkBlocking(deps, { expectedTaskId })   // 唯一同步内核：prepare → run → settle
```

blocking 入口与**每一个** async job 都调用它。**禁止**出现 `syncPrepare` + `asyncRun` + `asyncSpecificSettlement`
——那会在一个发布周期内漂移，而漂移直到某次 async attempt 按 sync 路径不共享的规则结算才会被发现。

##### `start` 冻结执行请求身份（不是 deferred semantic recompilation）

```
t0 start(W)  →  t1 ProjectIR 变化  →  t2 callback 唤醒  →  t3 重新解析 W'
```

若 t3 从当前 ProjectIR 重新编译输入，后台可能跑的不是用户在 t0 启动的那个候选。因此新增**只读**解析
`mutatingWorkTarget()`（无事件、无 attempt、无 world），`start` 只解析**一次**并把 `taskId` 冻结进 job；
`prepareMutatingWork({ expectedTaskId })` 在任何 effect 前**再断言**它（连同 head basis），世界若已移动则**拒绝**，
绝不静默重解释。

##### 两个平面，绝不混淆

```
HostJobState  ≠  AttemptState        HostJob ∉ canonical Project truth
```

job map 极薄：invocation handle + execution promise + 最小观察元数据（`jobId` / `taskId` / `attemptId` / `phase` /
`settlement` / `hostError`）。**禁止**塞入 task definition、authority state、retry count、verification status、
promotion status、dependency graph——那是一个没有 durability 的 scheduler database，正是最危险的工程退化。
`phase ∈ {QUEUED, RUNNING, FINISHED, HOST_ERROR}` 是 **host transport 词汇**，不是 project lifecycle。

因此不存在 `job FINISHED ⇒ ATTEMPT_COMPLETED`，也不存在 `job HOST_ERROR ⇒ ATTEMPT_FAILED`：唯一能让 attempt 完成
的仍是 `settleMutatingWork()`。

##### `HOST_ERROR` 不 terminalize

prepare 成功 → attempt RUNNING → world 存在 → worker 进程异常：host job 记 `HOST_ERROR`，Project 保持
**ATTEMPT RUNNING、world retained、lane fenced**，不产生 `ATTEMPT_FAILED`。因为

```
host failed to continue observing work  ≠  work is semantically failed
```

里面甚至可能已经有一个完整 commit。

##### Restart honesty：host-local jobs **不 durable**

| crash 位置 | 重启后 |
|---|---|
| prepare 前 | 什么都没开始（`start` 只是"当前 host 接受了这次调用"，**不是** durable scheduling ack） |
| prepare 后 | `ATTEMPT RUNNING` + world 保留：**orphaned execution stays canonically UNRESOLVED**（不 FAILED、不自动 resume） |
| worker commit 后、settle 前 | 同上，且 world 里有 R（未来显式 recovery 的输入）；D2-d 不碰 |
| settle 内 | D2-e1 三个窗口已闭合：export/report/terminal replay，无重复事实；D2-d **不重新解决一遍** |
| settle 完成后 | `ATTEMPT COMPLETED`；host map 丢失**不改变** Project truth |

##### `followup` 严格只读

可返回 host-local status、`attemptId`（若已产生）、settlement（若已有）、host error、canonical attempt snapshot。
**不做** retry / resume / settle / verify / promote。也**不**因为 job 不见就把 attempt 改成 FAILED。
旧 `jobId` 在新进程返回 `UNKNOWN`（"host-local jobs are not durable…"），而不是 `FAILED`；调用者若持有 `attemptId`，
canonical inspection 仍如实回答。两个查询空间：

```
jobId      = transport handle      （ephemeral）
attemptId  = durable execution identity
```

`attemptId` 在 prepare 成功那一刻即通过 followup 暴露，之后调用者不再只依赖 ephemeral handle。

##### 重复 `start` 不重新发明 exactly-once

不引入 durable idempotency registry。canonical 层已有 attempt admission 与 lane fencing，所以最坏情况是第二个 job 被
canonical 拒绝。真正需要 machine-proof 的是：

```
canonical exactly-one-owner  >  host exactly-one-Promise
```

##### 结构断言（CI-only）

`src/interaction/work_delegation.ts` **代码中**（注释剥离后）不得出现 `ATTEMPT_COMPLETED` / `ATTEMPT_FAILED` /
`ATTEMPT_CANCELLED` / `PROMOTION` / `promoteAttempt` / `assessPromotionEligibility` /
`commandAttemptResultVerifier` / `verifyAttemptResult` / `recordCallback`，也不得出现 `retryCount` /
`authorityState` / `verificationStatus` / `promotionStatus` / `dependencyGraph`。即：transport 不能写 project lifecycle、
不能自行 verify/promote、job map 不能长成 scheduler。

##### 验收（`test/lean_work_delegation_transport.test.ts`，10 项）

| 用例 | 断言 |
|---|---|
| **golden async** | `start` 在完成前返回（attempt 已达 RUNNING 而 worker 仍 parked）→ 放行 → `FINISHED` → attempt `COMPLETED`；result commit 是真提交且 ≠ base；canonical 树仍未被接受 |
| **existing Work only** | 无 canonical work ⇒ `WORK_NOT_DECLARED`，零事件零 attempt；API **没有** `task` 参数（prose 在结构上不可能） |
| **expectedTaskId mismatch** | `TASK_NOT_NEXT_SCHEDULABLE`，**在任何 job/attempt/world/event 之前** |
| **equation 1** | `CanonicalOutcome(sync) == CanonicalOutcome(async)`：同 task、同 attempt state、同 changed files、同 settlement state；commit **哈希不同是必须的**（两次独立执行各自的 world 与时间戳），断言的是 canonical facts 相等而非哈希相等 |
| **equation 2** | worker 抛异常 ⇒ host 记 `HOST_ERROR`，Project 仍 RUNNING、无 `ATTEMPT_FAILED`/`ATTEMPT_COMPLETED`；且第二次 `start` **resume** 而非抢占（`canonical exactly-one-owner`），attempt 数恒为 1 |
| **equation 2b** | worker 报 `HOST_FAILURE` ⇒ settlement `NOT_READY`，attempt 仍 RUNNING |
| **restart honesty** | 新 host 对旧 `jobId` 返回 `UNKNOWN`；canonical attempt 不变；旧 worker 事后结束也**不**追溯改变状态 |
| **Project truth outlives host** | settle 已完成后重启：host 忘记 job，但 `inspectAttempt` 仍 `COMPLETED` |
| **followup purity** | 重复 followup（含不存在的 jobId）后 events / attempt states / HEAD / 工作树 / refs 逐项不变 |
| **结构断言** | 见上 |

**D2-d 明确未做**（评审 OUT 清单，逐条未动）：durable queue、restart auto-resume、retry scheduler、cross-host dispatch、
remote worker protocol、BASE_DRIFT recovery、automatic transplant/rebase/verification/eligibility/promotion、
prose-to-WORK creation、asset CAS、ProjectWorldBasis generalization、D3 compatibility。

#### §D2-LIVE 交付（2026-09-24）：real async Work reaches promotion eligibility without exercising promotion authority

这是 **D2 的最终系统级验收**，不是又一个子阶段。它回答的问题不是"每个部件是否工作"（D2-a…D2-d 各自已证明），而是：

> 这些**分别证明过的部件，真实组合以后是否仍然组成同一个系统**？

因此它是**纵向**测试，只有一个 golden scenario，不重新穷举 BASE_DRIFT / UNCOMMITTED_WORK / crash 窗口 / 重复 start /
verification FAIL —— 那些属于拥有它们的切片，重复只会让清单更长。

```
real ProjectIR WORK → async start → real ExecutionWorld → worker edit/test/commit
  → settle（唯一 D2-e1 spine）→ followup 观察完成 → 独立 verification（2B runtime）
  → ELIGIBLE → canonical source 未变、promotion facts 为零
```

装置 `rs-test/lean-d2-live-gate.mjs`，用**已交付的 seam** 端到端：真实 deployment profile → `launchDeployment` →
真实 `makeWorkDelegationService` → 真实 `dshSubprocessWorkWorkerPort` 跑真实 PTC DSH worker。rig 自有部分只有：
fixture 仓库、包在 worker 进程外的 tee/barrier wrapper、观测辅助。

**非阻塞是 barrier 证明，不是墙钟断言**：`start` 已返回而 worker 进程停在被 park 的位置（`PALIMPSEST_LIVE_GATE_BARRIER`
未出现即不 spawn），随后放行 —— 而不是 `elapsed < N ms` 这类机器负载敏感的断言。

15 项判定：work 在委派前已存在（非 prose 创建）／async start 早于 worker 返回（barrier）／worker 在自己的 world 内运行／
worker authority-closed（继承的 `palimpsest_*` 恰好为 0）／attempt `COMPLETED`／result 已导出且 canonical 可读／
R 携带声明文件并在其上通过仓库自带测试／followup 零副作用／verification 的 subject 是 `ATTEMPT_RESULT` 且 `PASS`／
qualification satisfied／**ELIGIBLE**／canonical source（HEAD+工作树+refs）未变／**promotion events 与 rows 均为 0**／
execution history 确有推进（`Δattempts ≠ 0`）。

这正是 `ELIGIBLE ⇏ PROMOTED` 在活体链上的显式证明，也是
`R exported into canonical Git object universe ≠ R promoted into canonical source` 的显式证明。

##### 活体门禁测出的两个**打包缺陷**（均已修复并落确定性回归）

两个缺陷对**所有切片测试都不可见**，因为每个切片各自搭 stack，从不经过"把两个部件接起来"的 composition；而打包部署
恰恰只走那条路。

| 缺陷 | 现象（实测） | 根因 | 修复 |
|---|---|---|---|
| **一个世界两个名字** | packaged 部署上 settlement 返回 `NOT_READY`/`RESULT_NOT_EXPORTED`（`WORLD_MISSING`），**任何** delegated attempt 都无法到达 COMPLETED | git port 把 world 建在 `.palimpsest/worktrees`，execution-world port 却从 `.palimpsest/worlds` 导出 —— 两个位置都"正确"，接起来就错 | `composeCore` 计算**一次** `worldsRoot` 并同时交给两者；拼写取 `worlds`（本体是 EXECUTION WORLD，§D2-cR），`worktrees` 只作为调用方自带 port 的旧路径 |
| **capability 由"请求方式"而非"实际组合"推导** | boundary task 被 `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` 拒绝，readiness 报 `DEGRADED` —— 而同一部署**确实**composed 了可执行的独立 attempt-result verifier（实测跑出 PASS） | controller gate 的 `attemptResultVerificationAvailable` 在 verification runtime 组合**之前**、由 proxy（"`projectVerificationStore` 是否作为 option 传入"）算出；打包路径不传 store 而是**创建** store，于是 flag 说 `false`，随后却组合出真实 verifier | capability 改为 **late-bound**（与既有 `verificationAdmission` 同一 idiom）：core 持稳定 holder，由**真正组合 verification runtime 的那个 cluster** 一次 bind；`begin`/`prepareMutatingWork` 的 gate、readiness 的 gap、task 层 satisfiable 判定**统一按 subject kind** 取 attempt-result capability（`CURRENT_PROJECT_HEAD` 与 `ATTEMPT_RESULT` 是两个独立事实） |

原则落定（正式修正进工程方法）：

$$\boxed{\text{a capability must be derived from what was COMPOSED, never from how it was requested}}$$

以及同一类缺陷的通名：**同一事实的第二种拼写法**（两个 world 根名、两个 "clean" 定义、请求式 capability）——
它们各自都能通过 review，只有接起来才失败。

两个缺陷用 `test/lean_d2_live_composition.test.ts`（3 项）在**打包路径**上钉死：world 存在且与 settlement 导出口径一致、
packaged 部署的 boundary task 被**准入**且确实带 `contract_boundary` 要求、以及反方向——bare install 仍**无** runtime、
仍报 gap、仍拒绝（防止修复退化为"把常量翻成 true"）。两项均已**临时回退修复验证过会失败**，再恢复。

##### 第三处同类缺陷：readiness 用 head-verifier capability 判断 attempt-result 要求

上表缺陷 2 的修复过程中，`deriveCompletionReadiness` 暴露出同一种混淆的第三份：`contract_boundary` 触发的是
**ATTEMPT_RESULT** 要求（`contract.verification.required` 由 §B.4 触发、由 §B.14 的 attempt-result qualification 满足），
但 readiness 的 deployment gap 与 task-layer `verificationSatisfiable` 都拿 `independentVerifierAvailable`
（head 面）去判断。后果是：一个组合了 attempt-result verifier 而没有 head verifier 的部署，会声称"必需验证的活
**在这里无法完成**"，而它其实完全做得到。两处都改为按 attempt-result capability 判断。

##### 一条环境事实（不是产品缺陷，但决定了 rig 的位置）

DSH 的 PTC sandbox（`dsh-sandbox-windows-acl`）通过对 workspace 目录调用 `SetNamedSecurityInfoW` 来授予 worker 写能力，
需要 `WRITE_DAC`。本机实测：用户在自己 profile 内是 FullControl，但在 `F:`/`E:` 卷与 `C:\` 根上只有继承来的 `Modify`
（**无** `WRITE_DAC`），于是每个 PTC `run_code` 都在
`SetNamedSecurityInfoW failed (Win32 5): grantWrite(<dir>)` 处中止 —— 在 F: 的仓库 fixture、F: 的裸目录、`F:\`、`E:\`、
`C:\` 都如此，**包括此前活体门禁用过的 D2-c world**；给一个测试目录授予 FullControl 后立刻恢复正常。

这是**宿主 sandbox 的属性，不是 Palimpsest 的缺陷**：产品的契约恰恰是 PTC worker **fail closed 而非静默降级**，
而它做到了 —— worker 如实报告"无法在此 world 内完成"，没有伪造任何 canonical outcome（attempt 保持 RUNNING，
无 `ATTEMPT_FAILED`）。因此 rig 把 fixture 放在宿主能真正提供 sandbox 的位置，使它测量的是 D2 链而不是本机卷的 ACL。

##### 顺带修复：host bundle 挂载了已不存在的 PTC 包

`host/dsh/cordis.patch.yml` 曾 insert 一条名为 `@deepseek-ai/dsh-code-runtime-worker-thread` 的 `code-runtime` 条目。
该包在当前 DSH 中**已不存在**（现为 `@deepseek-ai/dsh-ptc-runtime-node`，且 `dsh-base` 自己已挂载），所以这条 insert 解析为空，
每个 worker session 都记 `code-runtime … failed to import`，PTC-presented worker 因此**没有任何可用 transport** 去调用自己的工具
（实测：模型反复尝试 `run_code` 全失败，最后只能以纯文本收尾 —— 对用户表现为"worker 什么都没做"）。该过期条目已删除并注明原因。

**D2-LIVE 明确未做**：不新增任何产品接口（无 test-only promotion shortcut、无 special live verifier、无 force-settle、
无 `waitUntilDone` product API、无 special worker mode）；允许新增的只有 fixture / test barrier / test harness / observation helper。
不重测下层已证明的 adversarial 矩阵。不把 `ELIGIBLE` 变成 promotion。

### D2.7 禁止（本附录）

1. 不在 D2 内做并发 mutation、Result Transplant 或 principal-attempt 绑定（它们都是 D3）。
2. 不把 Reasoning branch 当 code worker（不给 branch 加写档）。
3. 不为 D2 新增 authority / identity / truth plane。
4. 不把"write-set 不交叠"当作放开并行 mutation 的依据。
5. 不因为 worker 完成而弱化 promotion authority。
6. 不回头重构已冻结的 D1。

## 附录 D：近期明确不做（anti-waste）

> **原则修订（2026-09-24）**：`Anti-waste ≠ 等问题出现再设计`。以前有时把"没有真实 trigger 就不要做"用得太广，
> 于是把**已经证明长期必要、且形态基本可判定的承重底座**也拖成了迁移债（Execution World 就是这一例：D2-c 的
> blocker 已经证明 linked worktree 不适合长期做 Worker Execution World）。修订后分三类：
>
> | 类型 | 策略 |
> |---|---|
> | **承重 invariant / substrate abstraction** | 已证明长期必要时，**主动设计并尽早实现** |
> | 产品策略 / 行为偏好 | dogfood / 真实需求驱动 |
> | 性能优化 / 多 backend / 复杂容错 | **有测量后**再实现 |
>
> 更准确的表述：
>
> ```
> Don't build speculative semantics;  do build obvious foundations before they fragment.
> ```
>
> 属于第三类、因此**仍然不做**的例子：microVM backend、pause/resume 资源回收、remote world migration、
> write-disjoint 并发（D3）。

1. 不新增 `ManagerAgent`。
2. 不新增 `DelegationStore` / `DelegationEvent` / `DelegationAuthority`。
3. 不把主代理全上下文复制给 worker。
4. 不把认知分支（Reasoning branch）改成代码 worker。
5. 不把 Project Verification 的 `PASS` 伪装成 Work Evidence。
6. 不让 old-base worker 结果直接跨 revision promotion。
7. 不为并发把 execution mutex 写成 Task dependency。
8. 不把"多 Agent 数量"做成产品成功指标。
9. 不让主代理 poll worker。
10. 不删除既有 low-level kernel tools（`palimpsest_reasoning` / `palimpsest_recipe` / `palimpsest_verification` / `palimpsest_manage` / 低层 Work 工具等**全部保留**）。

因此：

```
Kernel API   = expressive   （可操作的多 Agent 内核，研究/调试/自定义能力不损失）
Principal API = opinionated （主代理的首选路径是少量高层工具）
```

---

## 附录 E（第 2A-B 期）：Direct Work Bootstrap —— `palimpsest_begin`

> **状态：第 2A-B 期已交付（2026-09-22）**。`LEAN-A27`–`A32`、`A34` 确定性通过；**`A33` 活体通过**，并据此**关闭 `A15` 活体那一半**。实现：`ProjectController.begin()`（S0–S3 + fail-before-write）、application work 面 `begin()`、DSH 工具 `palimpsest_begin`（登记于 `REVIEWED_TOOL_ADDITIONS`）、`test/lean_begin.test.ts`（9 项）。
> **E-r1 修订（2026-09-21，实现前）**：逐段对照现有 `start`/`preview`/`step`/`claim` 后补入 5 个 correctness/recovery blocker 与 4 处收紧——① v1 冻结 **repository-bound + in-place**（§E.4.1）；② fresh begin **必须绑定真实 Git HEAD**，因 `start()` 在缺省时用 `DEFAULT_HEAD_COMMIT = "c".repeat(40)`（§E.15.1）；③ clean-tree 规则**分阶段**（未归属拒绝 / 已归属 RUNNING 是正常 Work，§E.7）；④ restart 覆盖扩到 **partial genesis 每个落点**，且 retry 只能 replay canonical basis、**不得**用新 clock 重新规划（§E.13）；⑤ Case B/C 判据改为**语义等价而非来源**（无 direct marker 时来源不可判），比较对象是 normalized shape / `D_direct` 而非完整 `ProjectIR.digest`（§E.12）；⑥ `goal` 改称 agent-compiled goal，不声称用户原话（§E.4）；⑦ 明确 `writePaths` 是 self-binding scope 及与 ARCH-2 确认规则的关系（§E.5）；⑧ `A29` 改断言 **event delta 0**、`A33` 改断言**低层工具调用计数为 0**（§E.19）；⑨ 新增 `A34` **pre-claim HEAD drift fail-closed**，并新增 **S0–S3 状态机**（§E.16）。验收 `LEAN-A27`–`A34`。
> **E-r2 修订（2026-09-21，实现前 basis/recovery closure）**：E-r1 判为 **architecture PASS / implementation HOLD**，因仍有 4 个会让 `A27`/`A30` **假绿**的 blocker 与 3 处边界。**又核了 5 处代码事实**：`ProjectIR.digest` 含 `committed_at`（`models.ts:468`）；`StartProjectInput` **已含** `committedAt?`（`controller.ts:136`，故修法不动既有面）；`#advanceActiveStage()` 在任务已占位时返回 `null`（`scheduler.ts:232`）；`TASK_CREATED` 已固定 `task_envelope` + `policy_digest`（`scheduler.ts` / `policy.ts`）。修订：**① S0 一次性冻结 `liveHead` + `genesisCommittedAt`**，两侧原样传入，并加机器断言 `prospective.digest == canonical.digest` 与 `envelopeId`/`projectDigest` 一致（§E.15.1）——只对齐 HEAD 不够，`project_digest` 与 `envelope_id` 会不同；**② S1 先读 canonical attempt**：已有可 claim 的 CREATED attempt 就直接 claim，不再 `preview/step`（§E.15.2）；**③ 2B 之前 `verification.required` fail closed**（`ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE`）或把 capability 升级为"attempt-result verification executable"，**不得**让旧的 current-head verifier 假装满足（§E.14.1）；**④ `writePaths` 必须非空**（否则与"完成需 `changed_files > 0`"矛盾，begin 时即可证明不可完成，§E.4.2）。边界：**⑤ 语义等价 ≠ 授权 basis 等价**——已有 `TASK_CREATED` 则复用 canonical envelope、绝不重授权，v1 保证范围写明为"同一 operator configuration"（§E.13）；**⑥ "begin before first mutation" 是 principal protocol precondition，不是可检测属性**，`Palimpsest does not retroactively claim work`（§E.6）；**⑦ 判 dirty 复用与 `finish` 相同的脚手架过滤规则**，否则产品会被自己的 `.palimpsest/` 卡死（§E.7）。另：`E.10` 的完成摘要由 `testsRequired` 改为 `mechanicalChecks` 人话摘要（标准可能要求 `lint_pass`/`process_exit_zero`）。S0–S3 精确化，并写出三个 basis 的分工：`Work semantics ≠ Governance basis ≠ Runtime capability`。验收在 `A27`/`A29`/`A30` 内补机器断言。

### E.1 问题：有结束协议，没有开始协议

**实测（`rs-test/lean-2a-live-gate.mjs`，两轮真实 DSH）**：

- **第 1 轮**：agent 把活干对了，但 `claim` 早了一步（`palimpsest_next` **每次只提交一个事件**），于是改调 `palimpsest_run` —— 机械泵自己创建/领取/结算了 attempt，在**未改动的旧代码**上跑策略命令退出 0，留下 `COMPLETED` + `changed_files: []` + `result_commit` = base + 零证据。（该零产出缺口已在 `#assertCompletionHasWork` 修复，见 §3.3。）
- **第 2 轮**：agent 按指示只调一次 `finish`，被拒 `no attempt is running`；它自行查证后正确诊断 **`project "livegate" has no ProjectIR`** —— 没有计划、没有 ready set、没有可认领的 attempt。它**拒绝自行铸造治理状态**（那属于操作者），并如实报告。

于是主代理只能在两个坏选择之间：**A. 自己操作 `start`/`next`×N/`claim`；B. 直接工作，但 `finish` 找不到 attempt。** 一个诚实的 agent 选 B 并拒绝，是**正确行为**——要改的是产品。

**缺口不是又一个 scheduler 补丁，而是 direct path 缺少与 `finish()` 对称的入口。**

### E.2 核心句与公式

> **操作者只表达目标与标准；主代理把目标编译成最小 direct-work proposal；Palimpsest 验证该提案并机械地建立唯一受管工作位，直到 Principal 可以直接开始工作。**

```
Agent decides what the work is.
Palimpsest makes the work governable.
```

**明确排除**"用户一句话 → Palimpsest 自己生成 ProjectIR / 计划"：**Palimpsest 没有 LLM，不得重新变成 planner**。正确链路：

```
User intent → Main Agent semantic compilation → Palimpsest mechanical bootstrap
```

这与 `18-architecture-modes-spec.md` 既有原则一致：**主代理是 architect，Palimpsest 是验证与执行 substrate。**

### E.3 边界：只服务 Direct Work，不是另一个 Project Architect

第一版严格限定：

```
one goal → one direct task → one principal attempt
```

**不做**：自动拆 N 个 task、自动决定 fan-out、自动 spawn worker —— 那是 `PLMP-DELEGATE-1` / 架构线的职责。

### E.4 形状

```ts
palimpsest_begin({
  goal: string,                    // 主代理从用户意图编译出的 direct-work goal
  writePaths: string[],            // 主代理对自己本次 Work 的 self-binding scope
  requiredArtifacts?: string[],    // 可选；缺省空
})
```

**拒绝**（Principal 不提供）：`projectId` / `taskId` / `attemptId` / `role` / `gateId` / `predicate` / `exitCode` / scheduler 状态 / `standard` / `confirmed`。

`objective = goal`，不再单独要一个 `objective`。

> **`goal` 不是"用户原话"**。tool args 来自主代理，所以产品能证明的只有"主代理提交了这个 goal 作为它对用户意图的语义编译"，**不能**证明这是用户原话。除非将来 host 提供 trusted human-turn provenance，否则不得如此措辞。这与 §E.11 对 standard authority 的严谨性一致：`agent-authored proposal ≠ verified user quotation`。

### E.4.1 v1 前置：仅 **repository-bound + in-place**（fail-before-write）

**这是 v1 必须冻结的硬前置**，否则 `begin` 会主动造出一条必然走不完的 direct path：

```
execution = worktree
  begin → claim → 产品创建 worker worktree
  Main Agent → 仍在自己的 cwd / 主仓库编辑
  finish → worktree 模式 fail closed（§A.4）→ 拒绝
```

```
DirectBegin_v1  ⇒  repository bound  ∧  execution = in-place
```

不满足则 **fail-before-write**，零项目事件，并给出明确补救：

> 当前 deployment 的工作位是 isolated worktree；direct principal bootstrap v1 只支持 in-place。Worktree 执行留给 D2 worker path。

**禁止**为了让 `begin` 看起来通用而提前解决 D2。

### E.4.2 v1 前置：`writePaths` **必须非空**（fail-before-write）

Direct Work 的完成要求 `changed_files.length > 0`（§A.8 / `#assertCompletionHasWork`）。若 `writePaths = []`，则任何真实改动都会被 scope 断言判为**越界**——这是一个**在 begin 时即可证明的不可完成任务**。

```
writePaths.length === 0  ⇒  fail-before-write，零项目事件，进入 A29
```

分析型任务本来就应该去 Reasoning / Verification / CrossProject，而不是 Work attempt（§3.3 的收窄）。

### E.5 谁提供什么：Agent 提供工作语义，产品推导机器

必须区分两类东西：

| 类别 | 例子 | 谁提供 |
|---|---|---|
| **机器编排词汇** | `attemptId` / `gateId` / event sequence / lease | **产品**（Principal 永不接触） |
| **工作语义** | "我准备修改 `src/dedupe.ts`" | **主代理** |

主代理本来就在读文件、改文件，它提供计划写范围**没有问题**。反过来，若让 Palimpsest 从"修一下这个 bug"自行推导出 `src/a.ts`、`src/b.ts`，那才是**在插件里偷偷实现 planner**。

```
Agent proposes work semantics; product derives machinery.
```

**`writePaths` 的 authority 含义必须写明**：它是主代理对**本次 Work 的 self-binding scope**，**不是**主代理给自己扩权。它只能：

- 限定本 attempt 什么算合法改动；
- 作为 completion observation 的 basis（§A.3 的 scope 断言）。

它**不能**：

- 扩大 operator policy（`policy.allowed_commands` 仍是上界）；
- 扩大宿主文件系统权限；
- 创造任何外部 commitment。

> **与 ARCH-2 确认规则的关系（必须显式说明，否则两个规格读起来会矛盾）**：`18-architecture-modes-spec.md` 的 ARCH-2 要求"agent proposal → 用户确认 → 才可声明"。**Direct bootstrap 是该规则的窄例外**：它只允许一个 principal self-bound task，不能扩大 policy/authority、不能创建 peer/commitment、不能 promotion。因此它的声明**不等价于"用户批准了一套项目架构"**。窄例外成立的理由是：这个 proposal 的作用域就是主代理自己马上要做的那一次改动，而该改动的最终结果仍由操作者的接受/退回（§4）裁决。

### E.6 时机纪律：begin 在**第一次 mutation 之前**（read-only 勘察允许）

```
User task → Main Agent → read / grep / inspect / search  → palimpsest_begin → mutation begins
```

- **允许**：begin 之前的只读勘察（否则主代理根本不知道 `writePaths`）。
- **不允许**：begin 之前的 mutation。若 agent 已 `edit`+`commit` 才 `begin`，则 `baseCommit` = 已改动的 HEAD，**产品不可能知道这些工作属于本任务**，attribution 失效。

> **纪律：begin before first mutation, not necessarily before first read.**

**但这**不是** v1 可检测的安全属性，必须如实标注。** 若主代理已经 `edit` + `commit` 然后才 `begin`，工作树**仍然是干净的**，产品**无法知道**刚才那个 commit 属于用户任务——sidecar 架构天然做不到追溯，`baseCommit` 就是那个已改动的 HEAD。

因此本条是 **principal protocol precondition**，不是系统能拒绝所有违规情形的保证：

```
Palimpsest does not retroactively claim work.
```

`A33` 只需证明**正常主路径遵守它**；**不得**把它写成"系统会拒绝一切先改后 begin 的情形"。

### E.7 入口侧：工作树规则**分阶段**（未归属必须拒绝，已归属是正常 Work）

这是 2A-R 教训的入口侧对应版本，但**不能无条件执行**——否则会拒绝一个完全合法的恢复状态。分两段：

**S0/S1（尚未建立或尚未 claim principal attempt：没有合法 owner）** → **unowned project changes 必须为零**，否则拒绝：

> 当前工作树已有未归属变更。请先处理这些变更再开始受管工作；否则产品无法证明哪些改动属于本任务。

**判 dirty 必须复用与 `finish` 相同的产品脚手架过滤规则**（in-place observation 已明确排除 `.palimpsest/`）。**禁止**裸用 `git status --porcelain`：若部署恰好留下未被 ignore 的 `.palimpsest/`，产品会被**自己的状态目录**卡死。

```
unowned PROJECT changes == 0
product-owned scaffolding（.palimpsest/ 等）按同一 canonical filter 排除
```

**S2（已有 matching RUNNING principal attempt）** → 树**可以**脏、**可以**有新提交：

```
RUNNING attempt  ⇒  之后的仓库变更属于该 attempt
```

这正是 crash 恢复的常见形态（claim → 编辑未提交 → host crash → retry begin）。此时 retry **不再次 claim、不要求 clean**，直接返回 `RESUMED/READY`，后续仍由 `finish()` 的 materialization/scope 规则收口。

```
unowned dirty tree 必须拒绝；owned dirty tree 是正常 Work。
```

**禁止**把现存 dirty tree 默认为本任务的工作。

### E.8 复用既有原语：Direct begin 是**组合**，不是新的语义种类

**不新增** durable `DirectWorkPlan` / `DirectProjectStore` / `DirectTask` / `DirectAttempt` / `DirectPlanEvent`。内部走既有面：

```
pipelinePreset({ goal, stages: [{ title: goal, writePaths, requiredArtifacts }] })
  → 单阶段 ProjectProposal
  → validateProjectProposal()
  → proposalTaskSpecs()
  → controller.start(...)
```

### E.9 内部循环：只用生命周期原语，**禁止** `run`/pump

**实测已经证明为什么**：`palimpsest_run` 是机械执行器，有机会**真的执行 attempt**（第 1 轮就是这么毁掉的）。`begin` 的任务只是"把状态机推进到 Principal 可以开始工作"，因此只允许：

```
preview() / step() / claim()
```

内部循环（**产品拥有顺序**，这正是 §5.2 原本要解决的）：

```
start(project)
loop (bounded, 防御上限 maxSteps = 16):
    preview()
      TASK_STARTED    → step(); continue
      ATTEMPT_CREATED → event = step(); claim(event.entityId); break
      其它             → fail closed
```

**真正的不变量不是"最多 16 步"，而是允许提交的事件种类**：

| | 事件 |
|---|---|
| **允许**（activation-only lifecycle，仅为到达一个可 claim 的 direct attempt） | `PROJECT_CREATED` / release `GATE_DEFINED` / `ROLE_TABLE_DEFINED` / `STAGE_GRAPH_DEFINED` / task registration / `TASK_STARTED` / `ATTEMPT_CREATED` / `ATTEMPT_STARTED` |
| **禁止** | `ATTEMPT_COMPLETED` / `ATTEMPT_FAILED` / `EVIDENCE_ADDED` / 任何 promotion effect / verifier 执行 / worker dispatch |

`maxSteps = 16` 是**防失控上限**，不是语义——不要把它读成"begin 最多做 16 件事"。

**禁止**调用 `runTurn()` / `pumpCommandAttempts()` / `palimpsest_run`。用户不再需要操作 N 次 `next`。

### E.10 返回值：Principal 投影不泄漏编排状态

应用层可以知道 `projectId`/`taskId`/`attemptId`/`baseCommit`，但 Principal 投影只有：

```ts
{
  state: "READY",
  goal,
  writeScope,             // 允许改哪些路径
  requiredArtifacts,
  // 完成要求的**人话摘要**，不是只有 tests：
  // 标准可能要求的是 lint_pass 或 process_exit_zero，而非 tests，
  // 因此不要给出一个"看似简单但错误"的质量概览。
  completion: {
    mechanicalChecks: string[],            // 例如 ["运行 `node --test …`", "写入范围校验"]
    independentVerificationRequired: boolean,
  },
}
```

**不得**返回 `attempt-7338` / `TASK_STARTED seq 14` / `lease` / scheduler 状态。继续遵守：

```
Application result ≠ Principal projection
```

### E.11 标准确认**不得**从 `begin` 进入（authority 边界）

**禁止**：

```ts
palimpsest_begin({ standard: "…", confirmed: true })   // ← Agent 声称"用户确认了"
```

该调用来自 Agent，等于**让 Agent 铸造操作者确认**。`begin` 只**消费**已确认的 `ProjectStandard`；没有则返回 `NEEDS_STANDARD_CONFIRMATION` + 人话候选。

未来若 DSH host 能**证明**某段文本来自当前 human user turn，才可建立 trusted user-intent/standard bridge，那时才能真正做到"一条用户消息 → goal + confirmed standard"。

```
same human interaction is desirable  ≠  agent may mint operator confirmation
```

### E.12 判据是**语义等价**，不是来源（不得静默改计划）

**不能靠"这个 ProjectIR 是不是 `begin` 创建的"来区分**：本附录已冻结"不新增 direct marker、`D_direct` 纯派生"，那么一个与请求完全同形的 ProjectIR 究竟由 `begin` 还是由 architect/start 创建，**在 canonical 形态上一模一样，来源不可判**。要判来源就必须加 durable marker——而那正是明确不要做的。

因此判据是**语义等价**：

| 情形 | 判据 | 行为 |
|---|---|---|
| **A** 无 canonical project | — | 创建 one-task direct project（**当前实测失败对应的主场景**） |
| **B** 已有 canonical state，与 requested direct projection **语义等价** | `goal` 同、**恰好一个** task、`objective` 同、`depends_on = []`、`write_paths` 同、`required_artifacts` 同、相关 genesis 配置兼容 | 安全收敛（无论它由谁创建） |
| **C** 已有 canonical state 与 requested projection **不等价** | 上述任一项不符 | `CONFLICT`，**零新写**：*"当前项目已有计划；direct bootstrap 不会静默重写现有计划。请使用现有 ready task 或显式计划修订。"* |

```
semantic equivalence, not provenance
```

**禁止** `begin(goal) → 隐式 plan revision`。闭合 A15 不顺势重做 project planning UX。

> **比较对象是 normalized direct shape 或 `D_direct`，不是完整 `ProjectIR.digest`**：后者包含 `committedAt` 等运行期字段，与 direct proposal identity 不是一回事（见 §E.13）。

### E.13 crash/retry **收敛**：replay canonical basis，**不得**用新 clock 重新规划

不必把多个 store 写成一个事务——Palimpsest 已是 durable event machine。要证明的是 **retry converges**。

**但 `controller.start()` 本身不是单事件原子操作**。它依次提交（已核 `src/tools/controller.ts`）：

```
PROJECT_CREATED
  → release GATE_DEFINED（标准已确认时）
  → ROLE_TABLE_DEFINED
  → STAGE_GRAPH_DEFINED（v1）
  → task registration（每 task 一次）
```

因此 crash 可能落在**任意一个** genesis 声明之间：

```
PROJECT_CREATED ✓  GATE_DEFINED ✓  ROLE_TABLE_DEFINED ✗ ← crash
```

**retry 绝不能天真地重跑一个新的 `start()`**：`PROJECT_CREATED` 的幂等键基于 `projectId`，而 ProjectIR 带 `committedAt`。若 retry 用 `now()` 重建 ProjectIR，就会出现**同幂等键 + 不同请求载荷**——那不是收敛。

```
retry = replay / complete the canonical basis
      ≠ re-plan with the current clock
```

**规则**：若 canonical `PROJECT_CREATED` 已存在，resume **不得**用新的 clock/head 重新生成 project creation basis；必须从 canonical ProjectIR 读取原 `committedAt`、head 与 task shape，重建 byte-equivalent 的 genesis 输入，或**逐项 ensure 缺失的 genesis 声明**。

**同一性用派生摘要**（不新增 durable 字段）：

```
D_direct = H(goal, writePaths, requiredArtifacts)
```

与当前 canonical `ProjectIR` / `TaskSpec` **规范化后**重新推导比较即可——`derived identity, no second truth`。**不要**比较完整 `ProjectIR.digest`（含运行期字段）。

若语义等价性不成立 → `CONFLICT`，**绝不覆盖**。

**收敛终态**（不要求"每种事件严格一个"，但**不得因 retry 产生语义版本升级**）：

```
恰好一个 ProjectIR
恰好一个生效的 gate definition/version
恰好一个 role declaration
恰好一个 stage graph v1
恰好一个 direct task
恰好一个 principal attempt
```

**但"语义等价"不等于"授权 basis 等价"**（blocker）：

**已核**：`TASK_CREATED` 的载荷已固定 `task_envelope` 与 `policy_digest`（`src/scheduler/scheduler.ts`；`AuthorizedTaskEnvelope = { envelope, policy_id, policy_digest }`，`src/domain/policy.ts`）。因此 envelope 是**不可变**的。

若 crash 之后 profile policy 变了，**不得**因为 `D_direct` 相同就重新 `policy.authorize()` 并静默换一个 envelope：

```
已有 TASK_CREATED  ⇒  复用 canonical envelope，绝不重授权
task 尚未注册      ⇒  才可用当前 policy 重新 preflight
```

更严格的做法（可选）：pre-claim 检测到 policy drift 时直接 `POLICY_BASIS_CONFLICT`。

**`ProjectStandard` 跨 restart 的 drift 属同一类问题**，但当前没有独立的 durable standard digest。因此 **v1 的保证范围必须写明**：

```
crash/retry 的保证范围 = 同一 operator configuration 之下
```

**不得**暗示已经解决了任意配置漂移。

### E.14 fail-before-write：readiness 在任何写入之前

`begin()` 必须**先**全部推导完，再决定是否落账：

```
derive standard → derive one-task proposal → derive prospective envelope
→ derive completion contract → derive task readiness
```

若出现 `required command unauthorized` / `sandbox unavailable` / `required verifier unavailable` / `standard unconfirmed` / `invalid write scope` / **工作树脏**，则：

```
ZERO PROJECT EVENTS
```

**禁止** `先 PROJECT_CREATED，然后发现永远无法完成`。这是 `begin` 最重要的保证，也是 `A14`（不能晚失败）在入口侧的延续。

### E.14.1 2B 之前：`verification.required` 必须 **fail closed**（blocker）

**已核**：当前 `independentVerifierAvailable` 在 `install.ts` 里本质只是 `projectVerificationStore !== undefined`，而现有 Verification **只支持 `CURRENT_PROJECT_HEAD`**（§2.3）。

于是会出现一个**假可满足**：一个 `contract_boundary` 任务得到 `verification.required = true`，readiness 因"有 verifier store"而认为可满足，**但 `ATTEMPT_RESULT` 根本还不能验证**。旧的 current-head verifier **不得**假装满足它。

**2A-B 在 2B 之前必须**：

```
contract.verification.required === true
  ⇒  ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE
     零写，进入 A29
```

或者把 capability 明确升级为**"attempt-result verification executable"**（语义上更强、可被 2B 兑现的那种），而不是复用一个语义更弱的旧标志。**二者择一，不得两者都不做。**

普通 direct task 不受影响——`single_command_bar` 已只是 recommendation（§2.7），`required` 只在 `contract_boundary` 这类强风险上为真。

### E.15 prospective envelope（实现注意）

`CompletionContract` 依赖 `TaskEnvelope`，而 envelope 通常由 `TaskPolicy.authorize(ProjectIR, taskId)` 产生——`start()` 之前还没有 canonical project。这是可以**纯构造**的：

```
build proposed ProjectIR in memory
  → policy.authorize(proposedProject, "task-1")
  → derive CompletionContract
  → readiness
（全部不落账）
→ 仅当 READY 才 controller.start(...)
```

### E.15.1 S0 必须**一次性冻结 genesis basis**（HEAD **与** committedAt）（blocker）

**已核两处代码事实**：

- `controller.start()` 在未传 `headCommit` 时使用 `DEFAULT_HEAD_COMMIT = "c".repeat(40)`（`src/tools/controller.ts:124`）。
- `ProjectIR.digest` **包含 `committed_at`**（`src/schema/models.ts:468`：`canonicalDigest({ ...value, committed_at: canonicalDatetime(...) })`），而 `TaskEnvelope` 的 identity 又包含 `project_digest`。

因此**只对齐 HEAD 是不够的**：若 preflight 用 `T0` 构造 proposed ProjectIR，而 `start()` 自己用 `now() = T1`，则即使 goal / task / HEAD 全同，也会得到**不同的 `project_digest` 与不同的 `envelope_id`** —— preflight 里算出的 `CompletionContract` 与 readiness 描述的就不是最终生效的那份 basis。这正是 `A27` 会**假绿**的路径。

**S0 必须一次冻结两个值，并原样传给两侧**：

```
liveHead           = git HEAD（preflight 观察）
genesisCommittedAt = 单一时刻（S0 冻结一次）

build proposed ProjectIR { headCommit: liveHead, committedAt: genesisCommittedAt }
  → policy.authorize(proposed, "task-1") → CompletionContract → readiness
（全部不落账）

controller.start({ ..., headCommit: liveHead, committedAt: genesisCommittedAt })
```

> **无需改动既有面**：`StartProjectInput` 已含 `committedAt?: string`（`src/tools/controller.ts:136`）。

**机器验收**（`A27`）：

```
prospectiveProject.digest   ==  canonicalProject.digest
prospective envelope_id / project_digest
                            ==  最终 TASK_CREATED 里的对应值
```

必须同时钉住 `committedAt` / `headCommit` / `projectDigest` / `envelopeId` 四项。

### E.15.2 S1 必须**先读 canonical attempt**，不能只靠 `preview()`（blocker）

**已核**：scheduler 在某个 task 已占位该 stage 时，`#advanceActiveStage()` 返回 `null`（`src/scheduler/scheduler.ts:232`：`if (rows.length >= (stage.concurrency ?? 1)) return null;`）。

于是"crash 于 `ATTEMPT_CREATED` 之后"这一落点上，retry 的 `preview()` **不会**再给出 `ATTEMPT_CREATED` —— 按 §E.9 原伪代码会**卡死**，而 `A30` 恰恰声称覆盖这个落点。

**S1 的正确顺序是先读 canonical attempt**：

```
1. 已有 matching、可 claim 的 CREATED attempt  → claim(existingAttempt)   ← 不 step
2. 已有 matching RUNNING principal attempt     → 进入 S2
3. 完全没有 attempt                            → preview/step 直到 CREATED → claim
```

**禁止**在已有可 claim 的 attempt 时再 step（会重复创建或空转）。

### E.16 begin 状态机（S0–S3，实现时最不容易出错的模型）

比"新项目 / crash / 普通 ProjectIR"更**机器可判**，且完全不需要新的 truth species。

```
S0  NO PROJECT
    freeze  liveHead + genesisCommittedAt（一次冻结，§E.15.1）
    build   精确的 prospective ProjectIR / envelope / contract
    require repository bound ∧ in-place ∧ confirmed standard
            ∧ writePaths 非空（§E.4.2）∧ unowned changes == 0（§E.7）
            ∧ readiness READY ∧ required-verification 可满足（§E.14.1）
    fail-before-write（event delta 0）
    start   using THE SAME liveHead + genesisCommittedAt

S1  MATCHING PROJECT, NO RUNNING ATTEMPT
    require direct shape 语义等价（§E.12）
            ∧ governance/authorization basis 兼容（§E.13：已有 TASK_CREATED 则复用 canonical envelope）
            ∧ ambient HEAD == canonical project head   ← pre-claim 必须相等
            ∧ unowned changes == 0（按同一 canonical scaffolding filter）
    action  已有 matching 可 claim 的 CREATED attempt → claim IT（不 step，§E.15.2）
            否则 → activation-only step 直到 CREATED → claim

S2  MATCHING RUNNING ATTEMPT
    require direct shape 语义等价
    tree    MAY BE DIRTY / MAY HAVE NEW COMMITS（§E.7）
    action  不 re-claim、不做 scheduler 变更；返回 RESUMED

S3  EVERYTHING ELSE
    action  CONFLICT，零写
```

**这样 `begin` 的三个 basis 就分得非常清楚**：

```
Work semantics  ≠  Governance basis  ≠  Runtime capability
```

`D_direct` **只负责第一项**，不应被迫证明另外两项——这正是 §E.12（语义等价）、§E.13（授权 basis 复用）、§E.14.1（运行期能力可满足）各管一段的原因。

**S1 的 HEAD 规则是本状态机的关键不变量**：

```
pre-claim resume  ⇒  ambient HEAD == canonical project head
```

若不等（例如 `begin` 在 H0 创建了 `PROJECT_CREATED`，crash 于 claim 之前，随后外部/native git 动作把 HEAD 推到 HX），必须 **fail closed**：

```
REFUSE HEAD_CONFLICT
不 claim attempt
不采纳 HX
```

否则 `ProjectIR.base = H0` 而仓库 HEAD = HX，Principal 一旦开始工作，`finish` 的 `Diff(H0, resultCommit)` 会把 **HX 的外部改动也归到当前 task**。这与 G10-X 的精神一致：**ambient state 不得悄悄成为 canonical truth。**

注意两段不同：**claim 前**必须相等；**claim 后**不能再要求 `HEAD == base`，因为 Principal 的合法工作本来就会推进 HEAD。这与 §E.7 的分阶段规则是同一个状态边界。

### E.17 对称边界

```
BEGIN   ← agent: "我准备做这块工作"
        → product: ProjectIR / Task / Envelope / scheduler 推进 / attempt 创建 / claim

中间    ← agent 完全传统地工作: read / edit / shell / test / commit

FINISH  ← agent: "我认为做完了"
        → product: materialization / scope / commands / artifacts / evidence / report / completion
```

Principal 的 direct path 最终收敛为：

```
begin()  →  normal coding  →  finish()
```

而 `ProjectIR` / `TaskSpec` / `Envelope` / `TASK_STARTED` / `ATTEMPT_CREATED` / `claim` / gate predicates / `AttemptReport` **全部留在下面**。

### E.18 `begin` 是 Agent 选择的产品工具，**不是请求中间件**

Palimpsest 仍是 sidecar。纯问答（"解释这个函数"）**不应** begin Work；只有要改代码才调用 `begin`。

```
Main Agent works.
Main Agent chooses when managed Work begins.
```

### E.19 验收

- `LEAN-A27` **one-call bootstrap**：新部署、无 ProjectIR，一次 `palimpsest_begin(...)` 后 `ProjectIR` 存在、一个 task、一个 attempt **RUNNING**；Principal **从未**调用 `start`/`plan`/`next`/`claim`/`run`。**并断言 prospective basis 与 canonical basis 字节级一致**（§E.15.1）：

  ```
  prospectiveProject.digest == canonicalProject.digest
  committedAt / headCommit / projectDigest / envelopeId
      == 最终 TASK_CREATED 中的对应值
  ```

  以及 `ProjectIR.head_commit` **严格等于** preflight 观察到的 Git HEAD。
- `LEAN-A28` **begin does no work**：`begin` 后 `changed_files = []`、`evidence = []`、无 report —— 只准备工作位，**绝不复活 pump**。
- `LEAN-A29` **preflight before write**：以下情形**均须** `begin` 被拒，且断言 **orchestration project log 的 event delta == 0**（`events_after == events_before`），**不只**是"`PROJECT_CREATED` 计数为 0"（否则"没建 ProjectIR 但先写了一条 role/gate 事件"仍会通过）：
  - 标准缺失 / 所需命令未授权 / task readiness blocked / **unowned changes 非零** / **execution ≠ in-place**；
  - **`writePaths = []`**（§E.4.2，可证明不可完成）；
  - **`verification.required = true` 而 `ATTEMPT_RESULT` 运行期不可用**（§E.14.1，`ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE`）。
- `LEAN-A30` **restart convergence**：在 **partial genesis 的每一个落点**模拟 crash —— `PROJECT_CREATED` 后 / release gate 声明后 / role table 后 / stage graph 后 / task registration 后 / `TASK_STARTED` 后 / `ATTEMPT_CREATED` 后 / claim 后。每次 retry `begin` 后收敛终态满足 §E.13：恰好一个 ProjectIR、一个生效 gate definition/version、一个 role declaration、一个 stage graph v1、一个 direct task、一个 principal attempt（RUNNING）；**且不得因 retry 产生语义版本升级**。另加三例：
  - claim → 编辑但未提交 → 模拟重启 → `begin(same proposal)` → **RESUMED，零新增 attempt**（§E.7 的 S2 段）；
  - **已有 `ATTEMPT_CREATED` → retry `claim` 的必须是那一个 attempt，不得产生第二个**（§E.15.2）；
  - **task 已注册后 policy 改变** → **不得**生成第二个 envelope（§E.13：复用 canonical envelope，绝不重授权）。
- `LEAN-A31` **conflicting existing state**：已有**语义不等价**的 canonical state 时 `begin(new proposal)` **不得** plan/rewrite，返回冲突且**零写**。
- `LEAN-A32` **principal projection hygiene**：返回中不存在 `projectId`/`taskId`/`attemptId`/`gateId`/`eventType`/`lease`/scheduler。
- `LEAN-A34` **pre-claim HEAD drift fails closed**：`begin` 在 H0 创建 `PROJECT_CREATED`，claim 前 crash，外部 git 动作把 HEAD 推到 HX，retry `begin(same proposal)` → **拒绝 `HEAD_CONFLICT`**、**不 claim**、**不采纳 HX**（§E.16 的 S1 不变量）。
- `LEAN-A33` **full live direct path**（**正式关闭 `A15` 活体那一半**）：真实 DSH —— 用户给目标 → 主代理只读勘察 → `begin` **一次** → edit → test → commit → `finish` **一次**；最终 `Attempt COMPLETED`、materialization true、gate **PASS**。
  - **验收判据是 tool-call 计数，不是文本匹配**：DSH 的 tool catalogue / description 本身就会包含 `palimpsest_start` 等字符串，所以**不能**断言 session 文本里没有这些串。必须断言 execution trace 中：

    ```
    toolCalls("palimpsest_begin")  == 1
    toolCalls("palimpsest_finish") == 1
    toolCalls(start | next | claim | run | gate | report) == 0
    ```
  - **前置须注明**：本 fixture 的 deployment **已携带一个预先确认的 `ProjectStandard`**（因为 §E.11 已冻结 `begin` 不能铸造操作者确认）。**不得**把 A33 读成"单个 human turn 同时确认了 goal 与 standard"——trusted human-turn bridge 尚未实现。

### E.20 禁止（本附录）

- **禁止**让产品自己"规划"（无 LLM；主代理是 architect）。
- **禁止**把 `begin` 扩成 Project Architect（拆多 task / fan-out / spawn worker）。
- **禁止** `begin` 内部调用 `run` / pump / `runTurn` / `pumpCommandAttempts`；也**禁止**提交 §E.9 禁止表里的任何事件种类。
- **禁止**从 `begin` 的入参接受或铸造操作者确认（`standard`/`confirmed`）。
- **禁止**把 `goal` 措辞成"用户原话"（它是 agent-compiled goal）。
- **禁止**把 `writePaths` 当作扩权手段（它只是 self-binding scope）。
- **禁止**把现存 dirty tree 默认为本任务工作（**未归属**必须拒绝；**已归属**的 RUNNING attempt 是正常 Work）。
- **禁止**在 v1 支持 `execution ≠ in-place` 或未绑定 repository 的部署（须 fail-before-write）。
- **禁止** fresh begin 不传 `headCommit`（会落成 `DEFAULT_HEAD_COMMIT = "c".repeat(40)` 的假 head）。
- **禁止**在 pre-claim 阶段接受 `ambient HEAD ≠ canonical project head`。
- **禁止**用新的 clock/head 重新生成已存在的 project creation basis（retry 只能 replay/补齐 canonical basis）。
- **禁止**用**来源**区分 Case B/C（判据是语义等价，不是 provenance）。
- **禁止**用完整 `ProjectIR.digest` 作同一性比较（含运行期字段；应用 normalized shape / `D_direct`）。
- **禁止**静默改写已有计划（Case C 必须拒绝）。
- **禁止**在 preflight 之前落任何项目事件（判据是 event delta 0）。
- **禁止**新增 `DirectWorkPlan` / `DirectProjectStore` / `DirectTask` / `DirectAttempt` / `DirectPlanEvent`。
- **禁止**在 Principal 投影里泄漏编排状态。
- **禁止**把 `begin` 做成请求中间件（纯问答不 begin）。
- **禁止**只对齐 HEAD 而不对齐 `committedAt`（prospective 与 canonical 的 `project_digest`/`envelope_id` 必须一致，§E.15.1）。
- **禁止**在已有可 claim 的 CREATED attempt 时再 step（§E.15.2）。
- **禁止**接受 `writePaths = []`（可证明不可完成，§E.4.2）。
- **禁止**让语义更弱的旧 verifier 标志假装满足 `verification.required`（§E.14.1）。
- **禁止**在已有 `TASK_CREATED` 时重新 `policy.authorize()` 或替换 canonical envelope（§E.13）。
- **禁止**声称 crash/retry 已解决任意配置漂移（v1 保证范围 = 同一 operator configuration）。
- **禁止**把"begin before first mutation"写成系统可检测的安全属性（它是 principal protocol precondition，§E.6）。
- **禁止**裸用 `git status --porcelain` 判 dirty（须复用与 `finish` 相同的脚手架过滤规则，§E.7）。
