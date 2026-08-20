---
name: palimpsest
description: "Use Palimpsest to run durable, evidence-governed multi-agent orchestration right from the shell: turn a one-sentence goal into a crash-recoverable project (task graph), have agents claim isolated attempts in parallel, let the deterministic command executor auto-run allowed gate commands with automatic batch retry, gate evidence before promotion, and inspect a human-readable project status at any time. Use when the user wants a long-horizon task organized into a persistent project, parallel candidate attempts, verification-before-acceptance, or crash-safe reproducible work instead of a single long chat."
---

# Palimpsest — 耐久、证据治理的多 agent 编排

将一句话目标编译为耐久项目：任务图（ProjectIR）、隔离尝试（attempt）、确定性门禁（gate）、版本化晋升。进程与会话可在任意时刻中断，重启后从 `status` 报告的断点继续。

## CLI 定位

CLI 位于插件仓库构建产物：

```bash
CLI="$(git rev-parse --show-toplevel)/dist/src/cli.js"   # 仓库内
# 仓库外：clone https://github.com/orangeofcarl0-sys/palimpsest 后
#   corepack pnpm install && corepack pnpm run build
```

## 命令参考

```text
new    <projectId> "<goal>"               创建项目 + 首任务（--skills 声明技能提示）
plan   <changeClass>                      修订任务图
next / preview                            单次调度决策 / 只读预览（零写入）
run    [maxSteps]                         一个回合：机械推进 + 剩余阶段
claim  <attemptId>                        认领（隔离工作区，返回技能提示）
report <attemptId> completed|failed "…"   提交执行报告
gate   <attemptId> <predicate> <exit>     记录门禁证据
promote <gateId>                          门禁 PASS 后晋升
pump   [maxSteps]                         自动命令执行循环
status                                   项目状态与 resume 断点
```

选项：`--db`（编排库）、`--ops`（副作用账）、`--repo`（真实 git 端口）、`--gate`（GateDefinition JSON 文件）、`--skills`（技能提示 JSON 数组）。默认路径基于 `$DSH_HOME`（回退 `~/.dsh`）。

## 驱动协议

1. **勘察**：`status` 获取 `resume` 区块；plan 模式下仅使用 `preview` / `status`（只读面，零写入）。
2. **推进**：`run`。返回阶段决定下一步：
   - `progress` — 继续 `run`；
   - `needs_worker` — 认领并派发 worker：子 agent 执行 `claim` → 完成工作 → `report`；
   - `needs_promotion` — 对候选执行 `gate` 记录证据，`promote` 晋升；
   - `awaiting_worker` — 在途尝试未决，不重复认领，等待返回或重新派发；
   - `paused` / `terminal` — 恢复或结束。
3. **恢复**：不信任记忆中的标识符；每回合开始先 `status` 对齐。所需 ID 均在 `resume` 区块自描述。

## 核心合同

1. **执行报告 ≠ 证据**：worker 自述不产生证据；证据仅由确定性门禁命令产生。
2. **LLM 意见 ≠ 项目状态**：agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交**：过期结果按 STALE 记录，不覆盖当前状态。

## worker 协议（技能提示）

`claim` 返回的 `skillHints` 来自任务声明的 `suggested_skills`。worker 应按提示加载对应技能后开工。

main-only 技能（如 browser-use）不得由子 agent 加载：此类任务由主代理执行，或在报告中标注"需主代理"。技能加载失败不是致命错误：任务按正常失败路径上报，由批次重试或计划修订处理。

## 拒绝处理

权限或 hook 拒绝视为用户否决：不原样重试同一调用。受影响任务作废（cancelled/expired）或经 `plan` 修订绕开；被拒轮次的迟到结果同样不可提交。
