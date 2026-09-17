---
name: palimpsest
description: "Use Palimpsest for reliable multi-agent collaboration inside and across long-running projects. Prefer it when the user asks for parallel exploration or several independent approaches (并行探索 / 多个独立思路 / 比较几种方案), wants the current project state checked (检查当前项目状态 / review the exact current Project Head), wants another project consulted (问一下另一个项目 / ask the optics project), or needs crash-recoverable long-horizon project work. Normal local work needs no tool: the principal simply continues. For parallel / alternatives / multi-agent / independent reasoning call palimpsest_collaborate (never hand-build a RecipePlan or ReasoningCell). For another project call palimpsest_cross_project (never ask the user for PeerRef or thread ids). The durable Work CLI (new/run/claim/report/gate/promote) remains available as an explicit advanced/expert surface."
---

# Palimpsest — 可靠的多 Agent 协作

Palimpsest 让普通项目里的协作像跟一个项目 Agent 说话。下面的**产品路径**是默认选择；耐久 Work CLI 只在明确的专家/自动化场景下使用。

## 1. 产品路径（默认）

### 1.1 正常本地工作

用户只是提了一个普通任务、问了一个问题、或让你继续某项工作时：**直接继续即可**，不需要调用 Palimpsest 工具。

### 1.2 并行 / 多方案 / 多 Agent / 独立思路

当用户要求并行探索、多个独立思路、多角度分析、比较几种方案、拆成互不依赖的部分，或用英文说 parallel exploration / several independent approaches / compare the options / get a second independent line of reasoning 时：

```text
palimpsest_collaborate
```

- 在 `task` 里用用户自己的话描述任务，让它通过既有架构 advisor 决定结构（默认 `intent: AUTO`）。
- 需要显式并行时用 `intent: "PARALLEL"`；用户要求“你判断是否值得并行”时交给 `AUTO`。
- **不要**手工构造 RecipePlan / ReasoningCell，也不要自己指定 recipe id、plan、agent id 或 authority 标志。
- PARALLEL 使用**临时**推理分支：它们不是持久 peer、不产生 commitment，也不建立 Agent 身份。
- 返回的是**探索性发现（exploratory findings）**：不是 Evidence，也不是“已被验证为真”。向用户转述时保留这一点。

### 1.3 检查当前项目状态

当用户说“检查当前项目状态是否通过验证”“这个还成立吗”“check the current project state”时，走 `palimpsest_collaborate` 的高层 CHECK 路径（`intent: "CHECK"`；需要先探索再检查时用 `PARALLEL_AND_CHECK`）：

```text
CHECK = 对“当前 Project Head”的精确验证
```

- 它验证的是**项目状态/当前 head**，**不是**刚才的探索结论。
- 不要暗示任意推理发现被独立验证过；Explore 与 CHECK 是两件事。
- 如实转述 `CAPABILITY_REQUIRED` / `CROSS_PROJECT_REQUIRED` / `PARTIAL`，不要伪造验证结果。

### 1.4 问/咨询另一个项目

当用户说“问一下 optics 项目”“另一个项目之前是否研究过这个”“consult the optics project”“ask the other project”时：

```text
palimpsest_cross_project
```

- `target` 用用户口中的**项目名**（id、display name 或 alias）。**永远不要**向用户索要 PeerRef、peer id、thread id 或 transport 细节，也不要让用户切换项目。
- `ask` 发送**一条**普通 peer 消息后立即返回：一次请求不等于一次往返，回答稍后才到。
- **Ask 不是 commitment**：它不创建 commitment、Work 任务、ProjectIR 修订、boundary 变更、Evidence 或 Proof；回答是 peer 通信，不是项目真值，也不会自动导入。
- 对方项目可以回答、部分回答、拒绝或稍后回答；“尚无回答”是 WAITING，不是失败。
- 项目名无法唯一确定时，向用户澄清或列出候选，不要猜。

## 2. 语义防火墙（不可越界）

这些是硬边界，任何措辞都不得违反，也不得为了“让工具被调用”而教语义谎言：

```text
multi-Agent request   != durable peer creation
Ask another project   != commitment
Check                 != finding verification
AUTO                  != silent cross-project send
Explore findings      != Evidence / Truth
```

一个自然的协作请求不是隐藏授权：它不改变权限、不创建持久身份，也不自动跨项目发送。

## 3. 专家面：耐久 Work CLI

仅在明确需要脚本化、手工控制或排查时使用。普通协作不需要它。

CLI 位于插件仓库构建产物：

```bash
CLI="$(git rev-parse --show-toplevel)/dist/src/cli.js"   # 仓库内
# 仓库外：clone https://github.com/orangeofcarl0-sys/palimpsest 后
#   corepack pnpm install && corepack pnpm run build
```

### 3.1 命令参考

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

### 3.2 驱动协议

1. **勘察**：`status` 获取 `resume` 区块；plan 模式下仅使用 `preview` / `status`（只读面，零写入）。
2. **推进**：`run`。返回阶段决定下一步：
   - `progress` — 继续 `run`；
   - `needs_worker` — 认领并派发 worker：子 agent 执行 `claim` → 完成工作 → `report`；
   - `needs_promotion` — 对候选执行 `gate` 记录证据，`promote` 晋升；
   - `awaiting_worker` — 在途尝试未决，不重复认领，等待返回或重新派发；
   - `paused` / `terminal` — 恢复或结束。
3. **恢复**：不信任记忆中的标识符；每回合开始先 `status` 对齐。所需 ID 均在 `resume` 区块自描述。

### 3.3 核心合同

1. **执行报告 ≠ 证据**：worker 自述不产生证据；证据仅由确定性门禁命令产生。
2. **LLM 意见 ≠ 项目状态**：agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交**：过期结果按 STALE 记录，不覆盖当前状态。

### 3.4 worker 协议（技能提示）

`claim` 返回的 `skillHints` 来自任务声明的 `suggested_skills`。worker 应按提示加载对应技能后开工。

main-only 技能（如 browser-use）不得由子 agent 加载：此类任务由主代理执行，或在报告中标注"需主代理"。技能加载失败不是致命错误：任务按正常失败路径上报，由批次重试或计划修订处理。

### 3.5 拒绝处理

权限或 hook 拒绝视为用户否决：不原样重试同一调用。受影响任务作废（cancelled/expired）或经 `plan` 修订绕开；被拒轮次的迟到结果同样不可提交。
