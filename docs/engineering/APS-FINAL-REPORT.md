# APS 最终工程报告 — Autonomous Project Synthesis

日期：2026-11-03  
分支：`palimpsest-autonomous-project-synthesis`  
代码冻结：`d75c5b671fd740f6a71d16c372259e031aac4d21`  
开发起点：PC1-V1 Evidence Freeze `d691f3f1a8130e11e52a0ce293c935c4452fb9d2`  
证据：`research-evidence/aps/2026-11-03-host-run/` 与本报告所在提交

---

## 0. 结论摘要

本轮没有继续把 APS 做成一套新的通用 Agent Harness，而是把 Palimpsest 已有的 ProjectIR、
Project Workspace、Journal、Continuity、Work/Scheduler、Delegation 和真实 DSH Host 组合成一条
可运行的纵向链路：

```
用户目标
  → 派生 ProjectPulse（目标、约束、已接受/候选/负结果/开放问题/待处理工作/贡献/未消费结果）
  → Agent 自主调用 native DSH Subagent 或 Palimpsest Delegation
  → 贡献以非规范 Journal 记录进入项目（显式区分 principal-declared 与 product-observed）
  → Principal 决策
  → 现有 controller.plan 产生真实 ProjectIR 修订 / task 增删
  → 后续 Work 执行并留下可验收产物
  → 新 Principal Session 读取 pulse 继续
```

已实际观察到：

- 两个**真实 native DSH Subagent 子会话**并发运行并返回 finding；
- 两个贡献被记录为 `NATIVE_SUBAGENT`，读取足迹明确标记为 **DECLARED**，`independentVerification: false`；
- 新 Principal Session 依据其中一个贡献执行 `REVISE_PLAN`，产品真实记录了 **revision 0 → 1**，
  新增 `site-b-coastal`、`capacity-refresh`，移除 `site-b`；
- 该 Session 启动并完成 `site-a`，写出 `deliverables/site-a.md` 并提交，任务进入 **VERIFYING**；
- 第三个新 Principal Session 的 pulse 能看到计划变更、交付候选、操作员验收队列，以及另一个
  **UNASSESSED + STALE** 的贡献（晚到/未消费结果）；
- 随后执行真实 operator acceptance：`site-a` 经现有 Promotion 路径变为 **SATISFIED**；
  由该贡献的 `REVISE_PLAN` 新增的 `site-b-coastal` 与 `capacity-refresh` 也由确定性 worker
  完成并接受，最终 **三个任务 SATISFIED，revision 4**，贡献链的
  `downstream.observableOutcome = true`。

这不是模型质量或成本结论。运行使用确定性 Messages 替身，标记为 `MOCK_MODEL_REAL_DSH_HOST`；
没有 provider 调用，没有付费 token。APS-C 的 F/L/G 真实模型对照 **BLOCKED**：没有 APS 花费授权。

---

## 1. Git 事实

| 项目 | 值 |
|---|---|
| 开发分支 | `palimpsest-autonomous-project-synthesis` |
| 起点 | `d691f3f1a8130e11e52a0ce293c935c4452fb9d2`（PC1-V1 Evidence Freeze） |
| 代码冻结 | `d75c5b671fd740f6a71d16c372259e031aac4d21` |
| 本阶段 commit | `d653e811`（核心实现）→ `e0fa0891`（真实 Host harness）→ `d75c5b67`（APS-C gate + basis 语义）→ 本报告/证据提交 |
| 本地 `main` | `67b29c9e7907b08fe594738973ce48b55e10d80b`（未移动） |
| `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896e`（未移动） |
| 是否 force-push | 否 |
| 是否 merge `main` | 否 |
| 是否 push | 是，`origin/palimpsest-autonomous-project-synthesis` |
| 是否创建 APS PR | 是，PR #217；stacked on `palimpsest-pc1v1-governance-to-outcome`，base 不是 `main` |
| 历史 Code/Evidence Freeze | 未修改、未 rebase、未删除 |
| 工作树 | 交付提交后干净（`git status --short` 为空；`.aps-tmp/` 为本地测试临时目录，未提交） |

### 1.1 PR 与 required checks

PR #217 是 **stacked PR**，避免把 PC1-V1 的 216 号 PR 完整复制一遍；它不直接合并到 `main`。当前状态：

- `MERGEABLE`，但 required checks **FAILURE**：
  - `unit`：`trajectory_p2e1rf_malformed_ace.test.ts` 与
    `trajectory_p2e1rg_kernel_coverage.test.ts` 失败；这两项在 PC1-V1 CI 中已存在，本轮未改动
    相关代码。
  - `host-boundary`：仅 HR-27 失败，CI 解析到
    `@deepseek-ai/dsh-win32-process@0.2.1-rc.5`，而 hardening contract 记录的是 `0.2.1-rc.3`；
    这是 CI 依赖漂移。
- 同一轮中 `e1-k/e2-i/e3-c/e4-l/e5-p/e-live` gates、`e2e`、`d2/d4/d5/d5-reliability` 与
  `package-smoke` 均通过。`package-smoke` 初次失败是因为新增模块让 `npm pack --dry-run --json`
  的列表超过 Node 默认子进程 buffer；已在该脚本内设置 64 MB buffer，复跑通过。
- 仍然只有 `unit` 与 `host-boundary` 失败；两者都是本轮之前已存在的 CI 问题。
- 没有 admin bypass，没有 force-push，`main` 未移动。主分支合并仍被 required checks 阻塞。

差分范围：

- 新增 `src/project_contribution/`（`types.ts`、`records.ts`、`service.ts`、`index.ts`）
- 新增 `src/project_pulse/`（`types.ts`、`service.ts`、`index.ts`）
- 新增 `src/adapters/dsh/contribution.ts`
- 修改 `src/composition/continuity.ts`、`src/composition/application.ts`、`src/install.ts`
- 修改 `src/application/factory.ts`、`src/application/surface.ts`、
  `src/application/surfaces/product.ts`、`src/application/surfaces/project.ts`
- 修改 `src/adapters/dsh/product.ts`、`continuity.ts`、`index.ts`、`tool_profile.ts`
- 修改 `host/dsh/lib/project_hint.js`
- 修改 `tools/architecture/layers.ts` 与架构/公共 API 基线
- 新增 `scripts/aps/`（host 运行、mock、摘要、证据复制、预算 guard、cohort gate）
- 新增/更新测试：`test/aps_project_pulse.test.ts`、`test/aps_delegation_chain.test.ts`、
  `test/aps_cohort_gate.test.ts`、`test/pc1_normal_product.test.ts`、
  `test/pc1v1_hard_constraints.test.ts`、`test/architecture/dsh_adapter_clusters.test.ts`

---

## 2. 实际产品能力

| 能力 | 状态 | 证据 |
|---|---|---|
| 自然项目接续 | **实现 / 已观察** | 三个真实 DSH Principal Session 读取同一 durable state；Pulse 是新的第一读 |
| Agent 自主合作 | **仅在脚本化 Host 运行中观察** | 脚本决定调用两个 native subagent；不是真实模型的自主选择 |
| Native DSH Subagent 贡献接入 | **已验证** | 两个真实 child sessions 返回文本；贡献记录标记 `PRINCIPAL_DECLARED` / `DECLARED`，不虚构读取足迹 |
| Palimpsest Delegation 结果消费 | **部分验证** | 服务与 adapter 测试覆盖 terminal/unconsumed/interrupted/consume；本次 Host profile 未组合 delegation（无 reasoning store / branch host） |
| 贡献驱动的实际重规划 | **已验证 / 已观察** | 真实 `controller.plan` revision 0→1；added/removed/changed task 由产品计算，不是 `changedPlan` 声明 |
| 并发项目产物制作 | **部分** | 两个 subagent 并发返回 finding；实际仓库产物由 principal 单独写出，未做到两个 Agent 同时写相互关联产物 |
| 晚到结果处理 | **已验证 / 已观察** | stale 贡献拒绝静默改计划、`allowStaleBasis` 显式；Host 第三个 Session 看到 UNASSESSED+STALE 贡献与 terminal/interrupted delegation 队列 |
| 跨 Session 继续执行 | **已观察** | Session 2/3 均以 pulse 恢复目标、贡献、计划变更和待验收工作 |
| 最终成果合成 | **已完成（确定性交付 + 真实 Promotion）** | 三个 task SATISFIED；`site-a`、`site-b-coastal`、`capacity-refresh` 均经现有 Promotion 路径；贡献新增 task 的 `downstream.observableOutcome = true` |
| 可信接受边界 | **未削弱** | 没有新增 acceptance/promotion 路径；贡献不是 Evidence、不是接受、不是授权；既有 Promotion/Work 测试通过 |

---

## 3. 真实任务结果（确定性 Host 运行）

### 3.1 用户目标

> “Select a defensible vendor for each site and leave a reviewable selection artifact, respecting
> every stated site constraint.”

初始计划：`site-a`、`site-b` 两个独立任务，均要求写出 `deliverables/*.md`。

### 3.2 Agent 合作过程

**Principal Session 1**

1. `palimpsest_continuity action=pulse`：看到目标、两个 pending tasks、无贡献。
2. 并发启动两个 native DSH `subagent`：
   - 一个检查 2026 coastal rating；
   - 一个检查 site A 的 width/design-minimum 约束。
3. 两个 child sessions 均真实运行并返回 finding。
4. Principal 记录两条贡献：
   - coastal finding：`ctb-014342a3...`（本次运行 ID），声明读取 `sources/vendor-capabilities.csv` 与 `sources/sites.md`；
   - width finding：`ctb-9213588e...`，同样声明读取足迹。
   两条都记录 `observation: PRINCIPAL_DECLARED`、`readFootprintObservation: DECLARED`、
   `independentVerification: false`。

**Principal Session 2（新 Session）**

1. pulse 看到两条贡献。
2. 对 coastal finding 执行 `REVISE_PLAN`：
   - `changeClass: behavior_change`，`changedIds: ["site-b"]`；
   - 真实计划修订 0→1；
   - added: `site-b-coastal`、`capacity-refresh`；
   - removed: `site-b`；
   - changed: 无（没有用同一 task_id 改变含义；产品会拒绝这种 replacement）。
3. `palimpsest_work action=start` 取得 `site-a`。
4. 写出 `deliverables/site-a.md`，该文件包含 vendor、决定性的设计最低温和宽度约束。
5. Git commit 后 `palimpsest_work action=complete`；任务进入 **VERIFYING**。

**Principal Session 3（新 Session）**

1. pulse 看到：
   - 计划 revision 1；
   - coastal contribution 为 `PLAN_CHANGED`，`basisState: CURRENT`；
   - width contribution 为 `UNASSESSED`，`basisState: STALE`（项目已移动）；
   - `site-a` 为 `VERIFYING`，操作员验收队列有 `OPERATOR_ACCEPTANCE`；
   - width contribution 在 `STALE_CONTRIBUTION` 队列中。

### 3.3 哪些贡献改变了计划

只有 coastal finding 改变了计划。width finding 被记录但未评估，成为第三个 Session 可见的
晚到/未消费结果。没有把第二个 finding 硬塞进计划，也没有把它自动当成接受事实。

### 3.4 最终成果

三个交付物均已由真实 Work/Promotion 路径接受：

| 任务 | 状态 | 产物 |
|---|---|---|
| `site-a` | **SATISFIED** | `deliverables/site-a.md`，SHA-256 `6c11e8fe8a3dbba8e7c5d9e99a01d64c89bc688115c33f3467086eb3916f50b0` |
| `site-b-coastal` | **SATISFIED** | `deliverables/site-b-coastal.md`，SHA-256 `6ad48bb8d95edf501136bd28d3bbd2795a224842453ef45aea500ade88a19907` |
| `capacity-refresh` | **SATISFIED** | `deliverables/capacity-refresh.md`，SHA-256 `53f992cac12deef0ed1abcdb296567bb3a6a079081e4cf1f9f44259554b91f8d` |

- 最终 project revision：**4**
- 最终 project head：`102679a2a6706512f35be33878dd759fb68cdc3c`
- `site-a` 的真实 operator acceptance：`promotion-c4e30c694416ab0862b9056bb46a9099`，head 从
  `37afc073...` 推进到 `3e364a88...`
- `site-b-coastal`：`promotion-0bd67a8c06678d25649f55c8f3c24f0f`
- `capacity-refresh`：`promotion-50ce4baeb7410a1eee17fea0961b05c1`
- 贡献链：coastal 贡献的新增任务 `site-b-coastal`、`capacity-refresh` 均 SATISFIED，
  `downstream.observableOutcome = true`；width 贡献仍为 `UNASSESSED + STALE`，没有被错误接受。

注意：`site-b-coastal` 的产物是一个“无法从声明来源确认 2026 coastal rating”的
negative/needs-verification 交付，而不是伪造一个合规 vendor。下游完成由确定性 test-owned
worker 执行，不是模型结果。

### 3.5 人工干预

三个 Principal Session 运行期间没有人工干预。世界、项目 seed 和脚本是测试所有；seed 不是评分对象。
没有把 seed 结果当作模型行为。

运行结束后，Owner 授权的 operator acceptance 与确定性 downstream completion 被显式执行：
`operator_accept.mjs` 对 `site-a` 走真实 Promotion；`complete_downstream.mjs` 由 deterministic
test-owned worker 完成并接受贡献新增的两个 task。两者都在证据中单独标注，不计作模型行为。

---

## 4. 测试与环境

### 4.1 构建与热点测试

- `tsc -b`：PASS
- 热点批次（24 个测试文件）：**130/130 tests PASS**
  - 含 APS pulse/contribution、native/host adapter、delegation chain、cohort gate
  - 含 PC1 normal product、PC1-V1 R1/R2/R4/R5/R6/R7/R8、continuity、CLI/runtime、host conformance
  - 含 architecture cluster/public API/ratchet 检查
- `node scripts/audit/module-architecture.mjs --check`：**PASS**（0 violations）
- `node scripts/audit/module-architecture.mjs --check-public-api`：**PASS**（missing/changed/added = 0）

### 4.2 环境说明

- 本地 Windows 运行 vitest 需要把 `TMP/TEMP/TMPDIR` 指向可写目录，否则 global setup 会扫描
  `C:\Windows\TEMP` 并得到 EPERM；这是测试环境卫生问题，不是产品回归。
- 真实 Host 运行在 WSL2 + bubblewrap 中完成；没有 Windows drive/owner home 挂载，没有真实
  provider 凭据；provider proxy 只接受 mock key。

### 4.3 未声称全绿

没有运行或声称整个历史测试套件全绿。PC1-V1 报告过的历史 trajectory 测试与 CI DSH 依赖漂移
仍然存在；本轮未把它们当作产品回归，也没有为了“全绿”进行大规模历史测试重构。

---

## 5. 架构变化

### 5.1 复用的现有能力

- **Project Workspace / Journal**：贡献记录、决策记录、delegation start 全部写入现有 append-only
  Journal；没有新 store。
- **Project Continuity**：pulse 复用 `summary()` 的目标、约束、已接受/候选/负结果/开放问题/
  待处理工作/权威边界。
- **ProjectController.plan**：实际重规划走现有 revision/validation/lineage；没有第二套 plan owner。
- **Work/Scheduler**：`site-a` 的 start/complete/VERIFYING 走现有路径。
- **Delegation**：consume 继续复用现有 delegation service + receipt；新增的只是把它接入贡献链。
- **DSH Host**：真实 `palimpsest_*` 工具注册、native subagent、session、sandbox 都走现有 host。

### 5.2 新增的不可避免状态

- `src/project_contribution/`：Journal-backed 的非规范贡献/决策记录。所有权在 Project Journal，
  从 contribution record 事件产生，按内容 digest 去重，basis 变化时标 stale，与 ProjectIR
  revision 通过 decision record 关联。
- `src/project_pulse/`：纯派生视图，无 store、无 cache、无 authority。
- 没有新增规范 Project 状态数据库、Scheduler、Result Ledger、通用 Event Platform、Agent runtime
  或第二 Promotion 路径。

### 5.3 被真实运行推翻/修正的旧假设

- `changedPlan: true` 不是计划改变。现在只有实际 task graph 经 `controller.plan` 产生可观察
  revision delta，才叫 `planChange`；boolean 仍保留但标为 declaration。
- 正常工具目录确实过宽。`normal` 从 12 个名字缩减为 6 个：`start`、`work`、`continuity`、
  `project`、`delegate`、`contribute`（实际组合中 `delegate` 可缺失）。`outcome`、`review`、
  `verification`、`collaborate`、`cross_project`、`surfaces` 留在 `expert`。
- 仅靠 journal 条数提示不足以让冷启动 Principal 找到项目状态。Host hint 现在明确指向
  `palimpsest_continuity action=pulse`，但不内联内容、不替 Principal 决策。
- 一个 local task_id 的含义不能在 revision 中原地改变；产品会要求新 task_id。Host 运行按这个
  真实约束使用 `site-b-coastal` 替换，而不是伪造 `changedTaskIds`。

### 5.4 仍然没有体现实际价值的部分

- Campaign / Attention / ReasoningCell / Organization 没有进入默认路径；本轮没有证据表明普通任务
  需要它们。
- Palimpsest Delegation 在本次 Host profile 中没有组合（缺 reasoning store / branch host），
  因此 async delegation 的真实 Host 价值仍只有确定性的 service/adapter 证据。
- 两个 native subagent 没有并发写仓库产物；并发资产生产仍未验证。
- 正式 Work 治理对普通任务仍有成本；本轮只把 `site-a` 这一件实质交付放进 Work，没有把所有
  research 都变成 Work。

---

## 6. 对照结果与 APS-C

### 6.1 已执行一个有上限的真实模型 pilot

Owner 于 2026-11-03 授权 APS 花费后，执行了 `aps-pilot-2026-11-03`：

- F / L / G 各 **1 个真实 model session**，同场景、同可见来源、同评分器；
- provider/model：`deepseek-official` / `deepseek-flash`；
- 授权：每 session 2.5M tokens，总计 7.5M；
- 实际：**1,851,733 tokens**，没有 session 触发 budget guard 停止；
- 三个条件都 **5/5** 正确：Site A 选择合规 vendor 并说明 tie-break；Site B 因缺少当前 2026
  coastal 证据而 withhold；没有把 2024 列或“expected”证书当作 current。

| 条件 | 分数 | Tokens | Subagent | Palimpsest 调用 |
|---|---:|---:|---:|---:|
| F | 5/5 | 344,470 | 1 | 0 |
| L | 5/5 | 250,765 | 0 | 4（pulse/project） |
| G | 5/5 | 1,256,498 | 1 | 17（work/contribution/pulse） |

G 的 artifact 正确，但直接 operator acceptance 被真实拒绝：模型在报告 `selection`（commit
`349e074`）之后又提交了 independent check（`ac4971f`），in-place promotion guard 拒绝把旧报告当作
包含后续工作的结果。随后执行了合法的 typed replan：原 `selection`/`selection-final` 变 STALE，
新的 `selection-final-2` 覆盖当前完整 artifact 集并被 Promotion（`promotion-cafd69a6...`），
最终 `selection-final-2 = SATISFIED`、revision 4、project head `ac4971f`。空的
`independent-check` position 也由带决策的 plan revision 退休。这个 replan 还暴露并修复了一个
真实缺陷：已退休 task 的 RUNNING attempt 仍占用 in-place 单写 lane；修复后 `openAttempts`、
in-place lane 和 `finish` 使用同一读取，并新增 `test/aps_replan_orphan.test.ts` 回归测试。

详细结果：[APS-C-PILOT-RESULT.md](APS-C-PILOT-RESULT.md)。

这是 **n=1、单场景、单模型** 的 pilot。可以说：在这个场景中 L 比 F 少用约 27% tokens，G 比 F
多用约 3.6× tokens，且 G 的 formal Work 在 `VERIFYING` latch 下阻塞了第二个任务。不能说
Palimpsest 总体上更优、更经济或更差；也不能把它当作完整长程对照。

### 6.2 执行边界与尚未完成的完整 cohort

- `docs/programs/aps/APS-C-PROTOCOL.md`：完整 F/L/G 长程场景、指标、评分纪律。
- `scripts/aps/run_cohort.mjs`：fail-closed cohort gate。缺授权、授权过期、cohort/provider/
  condition 不匹配、请求总量超授权或超本地硬上限、code freeze 与 HEAD 不一致，任一条件都
  BLOCKED，`modelCalls = 0`。
- `scripts/aps/budget_guard.mjs`：真实读取 DSH session usage，累计超过 session ceiling 时写
  `STOPPED.json` 并 SIGTERM/SIGKILL 目标进程；pilot 中三个 session 均未触发停止。
- `test/aps_cohort_gate.test.ts`：5 个测试覆盖无授权、授权不足、freeze 不匹配、READY 不执行、
  预算 guard 真正杀进程。
- 完整 APS-C 仍缺：T1/T2、跨 Session、晚到/过期结果、delegation、重复/配对样本。G 的接受已通过
  合法 replan 完成，但 pilot 本身不替代这些。

### 6.3 与 PC1-V1 的关系

PC1-V1 的真实 P/F 结论仍是 `NOT_SUPPORTED`（P 26,524,721 vs F 15,160,662 tokens；两者正确/完整）。
本轮 APS pilot 的 F/L/G 全部正确，且 L 在该单场景中低于 F、G 高于 F；这与 PC1-V1 的
“治理成本可能超过收益”的警告一致，但样本量不足以推翻或确认任何总体结论。

---

## 7. 未解决限制（必须保留）

1. **真实模型只做了一个 pilot**：F/L/G 各一个 session、单场景；确定性 Host 运行仍使用脚本化
   Messages 替身，不能替代完整长程模型证据。
2. **完整 APS-C 未执行**：没有 T1/T2、跨 Session、晚到结果、delegation 和重复样本；仅凭 pilot
   不能声称总体质量/成本优势。
3. **Delegation 未在 Host 中组合**：本次 profile 无 reasoning store / async branch host；
   `palimpsest_delegate` 不在目录中。Delegation 证据来自确定性测试。
4. **并发资产生产未验证**：两个 subagent 并发返回 finding，但没有并发写相互关联产物。
5. **G 的接受链未完成**：G 的 `selection` 停在 VERIFYING，`independent-check` 因 latch 保持
   READY；真实模型没有、也不能代替 operator acceptance。确定性的 `site-a` 接受链已单独闭合。
6. **全量历史套件未声称全绿**：只做热点资格；历史 trajectory/CI 依赖问题未修复。
7. **normal profile 是有意收窄**：高级工具仍在 `expert`，但旧调用方若依赖 normal 的
   `palimpsest_outcome`/`review`/`verification`/`collaborate`/`cross_project` 需要切到 expert。
8. **贡献 basis 语义**：已评估且其 plan revision 仍为当前 revision 的贡献显示 CURRENT；未评估
   的历史贡献显示 STALE；当前 revision 已继续前进时，即使曾导致 plan change 也会显示 STALE。
   pulse 同时给出 status 和 basisState，Principal 仍需自行判断。

---

## 8. 下一步（需要 Owner 决策）

1. **完整 APS-C 长程 cohort**：pilot 只做了 F/L/G 各一个 session、单场景。若要讨论质量/成本优势，
   需要 T1/T2、跨 Session、晚到/过期结果、delegation 和重复/配对样本。
2. **G 的 rework/re-report**：G 的 `selection` 因后续提交落在报告之后而被 in-place guard 拒绝；
   需要一个合法的 rework/report 流程，而不是绕过 guard。
3. **Delegation Host 组合**：若要验证 async delegation 的真实 Host 价值，需要在 profile 中组合
   reasoning store + branch host，并重新冻结 cohort。
4. **PR/合并**：PR #217 已创建为 stacked PR；主分支合并仍受 required `unit`/`host-boundary`
   阻塞。需要 Owner 决定：修复 CI 的 DSH pin 与两个历史 trajectory 测试，或明确接受 PR 保持在
   open/stacked 状态。不会使用 admin bypass。

---

## 附录：关键代码位置

| 位置 | 作用 |
|---|---|
| `src/project_contribution/service.ts` | `record`、`recordDelegationStart`、`decide`、`list`；实际 plan revision |
| `src/project_contribution/records.ts` | Journal marker/JSON 编解码；malformed record 跳过 |
| `src/project_pulse/service.ts` | 派生 pulse、decision queue、mechanical vs decision-relevant |
| `src/application/surfaces/product.ts` | `ContributionApplicationSurface`；delegation 面 |
| `src/application/surfaces/project.ts` | `ProjectWorkspaceApplicationSurface.pulse()` |
| `src/adapters/dsh/contribution.ts` | `palimpsest_contribute` 工具 |
| `src/adapters/dsh/product.ts` | `palimpsest_delegate start/consume` 接入贡献链 |
| `src/adapters/dsh/continuity.ts` | `palimpsest_continuity action=pulse` |
| `src/adapters/dsh/tool_profile.ts` | normal 六工具收窄 |
| `host/dsh/lib/project_hint.js` | 冷启动 pulse 提示 |
| `scripts/aps/run_host.sh` | WSL2 + bwrap 真实 DSH Host 运行 |
| `scripts/aps/budget_guard.mjs` | 执行级 token 停止边界 |
| `scripts/aps/run_cohort.mjs` | fail-closed F/L/G cohort gate |
