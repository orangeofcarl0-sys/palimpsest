---
name: palimpsest
description: "Use Palimpsest to run durable, evidence-governed multi-agent orchestration right from the shell: turn a one-sentence goal into a crash-recoverable project (task graph), have agents claim isolated attempts in parallel, let the deterministic command executor auto-run allowed gate commands with automatic batch retry, gate evidence before promotion, and inspect a human-readable project status at any time. Use when the user wants a long-horizon task organized into a persistent project, parallel candidate attempts, verification-before-acceptance, or crash-safe reproducible work instead of a single long chat."
---

# Palimpsest — 耐久、证据治理的多 agent 编排

把"一句话目标"变成一个耐久项目：目标编译成任务图（ProjectIR），attempt 在隔离工作区中执行，只有过确定性门禁（证据）的结果才被选中并晋升；崩溃可恢复、历史可查、迟到结果作废。

一个真正的命令入口：插件仓库根下的 Node CLI（构建产物 `dist/src/cli.js`）。技能本体的仓库根用 `git rev-parse --show-toplevel`（在仓库内任何子目录都有效）：

```bash
CLI="$(git rev-parse --show-toplevel)/dist/src/cli.js"
# 仓库根可能不在当前树的场景，回退到环境变量或下列默认路径
[ -f "$CLI" ] || CLI="D:/Data and code/xuchengjian/dsh_plugin/palimpsest-plugin/dist/src/cli.js"
```

若 `dist/` 缺失或过期，先构建：在仓库根 `corepack pnpm run build`。

## 快速上手（完整演示）

在临时目录跑一遍（干净、可丢弃）：

```bash
DEMO="$(mktemp -d)/demo" && mkdir -p "$DEMO"
cd "$DEMO" && git init -q 2>/dev/null || true
CLI="D:/Data and code/xuchengjian/dsh_plugin/palimpsest-plugin/dist/src/cli.js"
node "$CLI" new p "Prove durable projects." --db "$DEMO/palimpsest.sqlite" --ops "$DEMO/ops.sqlite"
node "$CLI" next --db "$DEMO/palimpsest.sqlite" --ops "$DEMO/ops.sqlite"
node "$CLI" pump --db "$DEMO/palimpsest.sqlite" --ops "$DEMO/ops.sqlite"
node "$CLI" status --db "$DEMO/palimpsest.sqlite" --ops "$DEMO/ops.sqlite"
```

`pump` 自动完成：派发 attempt → 执行允许的 gate 命令 → 退出码映射 completed/failed → 失败自动批次重试 → 成功停于 VERIFYING 或预算耗尽 TASK_FAILED。这是完全确定性的过程（不经 LLM）。

`preview` 与 `run` 构成入口循环：plan 模式 / 勘察阶段用 `preview`（零事件）；需要推进时用 `run`——机械部分自动跑掉，返回的阶段告诉你下一步必须由你（宿主 agent）判断：`needs_worker`（派出子 agent 认领并干活、交回 report）、`needs_promotion`（对 VERIFYING 批次做 gate + promote）、`terminal`（无剩事）。

## 命令语义

```text
new   <projectId> "<goal>"              编译目标 → 耐久项目 + task-1
plan  <changeClass>                     修订任务图（metadata_only|behavior_change|contract_breaking）
next                                     一次确定性调度决策
preview                                  只读预判"下一步会做什么"（零事件；plan 模式下可安全勘察）
run    [maxSteps]                       一次回合：机械推进（自动 gate 命令+批次重试）+ 阶段判定（needs_worker / needs_promotion / terminal / paused）
claim <attemptId>                        认领 attempt（隔离工作区 + 租约）
gate  <attemptId> <predicate> <exit> [cmd...]   确定性门禁 → 证据原子
report <attemptId> completed|failed "<summary>"  上报（自述 ≠ 证据）
promote <gateId>                         只有 gate PASS 才晋升胜者候选
pump  [maxSteps]                          全自动命令执行循环
status                                   人可读项目视图（tasks/attempts/evidence/promotions）
```

常用选项：`--db <path>`（编排库，默认 `$DSH_HOME/palimpsest/palimpsest.sqlite` 或 `~/.dsh/…`）；`--ops <path>`（Ordarium 副作用账，默认 `$DSH_HOME/ordarium/operations.sqlite`）；`--repo <path>`（改用真实 git CLI 端口）；`--gate <file.json>`（注册一个或多个 GateDefinition）。

## 三句不可违背的合同

1. **自述 ≠ 证据**：worker 说"完成了"不算数；只有确定性命令产生的 EvidenceAtom 算数。
2. **LLM 意见 ≠ 项目状态**：agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交**：过期后返回的结果标记 STALE，绝不覆盖新状态。

## 装备化 worker（E2）

任务可在 `plan`/`start` 时通过 `suggested_skills` 声明它需要的技能/插件（数组，缺省省略，未知技能不致命）。**worker 协议**：你用 `palimpsest_claim` 认领 attempt 后，若 TaskEnvelope 携带 `suggested_skills`，按清单加载对应技能再开工——"配合相关插件"是机制不是口号。

**main-only 路由（重要）**：部分技能仅限主代理加载（例如 browser-use 的 control-browser 明确禁止子代理使用）。协调这类工作时：

- 规划时若某任务需要 main-only 技能，优先把该任务路由给**主代理亲自执行**，或显式在 summary 中标明"需主代理"，不要派给子 agent 后期望它加载禁令内技能；
- 常用 main-only 清单以本文件维护为准，遇到未收录但被拒绝的技能，按"拒绝 ≠ 错误"处理：重规划而非重试加载。

**失败可见**：技能加载失败/不存在不是 fatal——任务按正常失败路径上报（failed + 原因），由批次重试或计划修订消化。

## 进阶：带证据的完整晋升（演示验证→选择→门控晋升）

```bash
node "$CLI" --gate '[
  {"gate_id":"gate-release","version":1,"subject_type":"attempt",
   "require":{"all":[{"exists":{"predicate":"tests_pass"}}]}}
]' promote gate-release --db ... --ops ...
```

流程：`pump` 到 VERIFYING 后，对 COMPLETED 候选运行 tournament 选出胜者 → 读其 result_commit → 门禁 PASS 才晋升 → TASK_SATISFIED；缺证据返回 INCOMPLETE 与缺失清单，不落 PROMOTION_COMMITTED。
