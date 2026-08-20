# 用户指南

本指南面向使用 Palimpsest 管理长周期任务的用户。核心模型：**goal**（目标）编译为任务图，每个任务由隔离的 **attempt**（尝试）执行，attempt 通过确定性**门禁**后其结果被**晋升**为正式状态。

## 1. 安装

```bash
git clone https://github.com/orangeofcarl0-sys/palimpsest.git
cd palimpsest
corepack pnpm install
corepack pnpm run build
```

要求 Node ≥ 24.15。

状态文件位置（可用环境变量 `DSH_HOME` 调整，默认 `~/.dsh`）：

| 文件 | 用途 |
|---|---|
| `$DSH_HOME/palimpsest/palimpsest.sqlite` | 编排状态（事件日志） |
| `$DSH_HOME/ordarium/operations.sqlite` | 副作用执行记录 |

备份项目即备份这两个文件。

## 2. 命令参考

```text
new    <projectId> "<goal>"                创建项目并注册首任务
plan   <changeClass>                       修订任务图
next                                      执行一次调度决策
preview                                   只读预览下一次调度决策（不写入）
run    [maxSteps]                          机械推进一个回合并报告剩余阶段
claim  <attemptId>                         认领任务（返回隔离工作区与技能提示）
report <attemptId> <status> "<summary>"    提交执行报告
gate   <attemptId> <predicate> <exit>      记录门禁证据
promote <gateId>                           晋升通过门禁的候选
pump   [maxSteps]                          自动执行命令循环
status                                    项目状态与断点
```

通用选项：

| 选项 | 说明 |
|---|---|
| `--db <path>` | 编排库路径 |
| `--ops <path>` | 副作用账路径 |
| `--repo <path>` | 使用真实 git 端口 |
| `--gate <file>` | 注册 GateDefinition（JSON） |
| `--skills '<json>'` | 声明任务技能提示（如 `["document-skills:pptx"]`） |

## 3. 工作流

### 3.1 创建与推进

```bash
node "$CLI" new p "convert the reports to pptx" --skills '["document-skills:pptx"]'
node "$CLI" run 20
node "$CLI" status
```

`run` 自动执行机械步骤（调度、允许的验证命令、失败重试），并返回当前阶段：

| 阶段 | 含义 | 后续动作 |
|---|---|---|
| `progress` | 存在可推进的决策 | 继续执行 `run` |
| `needs_worker` | 需要执行者完成任务 | `claim` + 执行 + `report` |
| `needs_promotion` | 候选已就绪待验证晋升 | `gate` + `promote` |
| `awaiting_worker` | 存在未决的在途尝试 | 等待其返回或重新派发 |
| `paused` | 调度器已暂停 | `resume` |
| `terminal` | 全部任务已终结 | 无 |

### 3.2 验证与晋升

执行报告中的声明不构成证据。证据由 `gate` 产生，晋升要求门禁判定为 PASS：

```bash
node "$CLI" gate <attemptId> tests_pass 0 python -m pytest
node "$CLI" promote gate-release
```

门禁判定为 INCOMPLETE 时返回缺失证据清单，不执行晋升。

### 3.3 中断恢复

任意时刻中断（进程终止、会话关闭、重启）后，`status` 的 `resume` 区块报告断点、在途尝试与所需标识符。按其 `action` 字段继续对应操作即可。已完成的工作不会重复执行；过期返回的结果按 STALE 记录，不影响当前状态。

## 4. DSH 集成

技能安装于 `.zcode/skills/palimpsest/`（项目级）或 `~/.zcode/skills/palimpsest/`（用户级）后，DSH agent 可直接驱动完整循环。plan 模式下 agent 仅使用只读面（`preview`、`status`），不修改项目状态。

技能仓库根的定位：技能文档中的示例使用 `git rev-parse --show-toplevel` 解析，构建产物位于 `dist/src/cli.js`。

## 5. 常见问题

**worker 报告完成，为何未晋升？**
执行报告只是自述。证据来自门禁命令的确定性结果；证据齐备且门禁 PASS 后方可晋升。

**权限请求被拒绝会如何？**
拒绝视为用户否决。相关任务作废或改由计划修订处理，不会自动重试同一调用。

**如何迁移到另一台机器？**
复制 §1 列出的两个状态文件至相同相对路径。
