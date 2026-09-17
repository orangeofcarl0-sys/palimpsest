# 用户指南

本指南的主路径是**说话即协作**：把 Palimpsest 安装进一个普通项目，启动它的常驻 principal，然后用普通语言请求协作。耐久项目运行时（goal → 任务图 → 隔离 attempt → 确定性门禁 → 晋升）是这一体验的实现基础，作为专家面在第 4 节保留。

## 1. 主路径：说话即协作

### 1.1 三步

**1. 创建/加载 deployment profile。** 唯一的本地协作开关是 `reasoning` 字段——存在即可（`{}` 表示使用打包的默认协作能力；只有一个高级覆盖 `reasoning.storePath`）。最小可运行示例见仓库根的 `examples/deployment/single-project.json`：

```json
{
  "schemaVersion": 1,
  "profileId": "my-project",
  "projectId": "my-project",
  "localPeer": "my-project-peer",
  "persistentPoint": "pp-my-project",
  "repository": "C:/path/to/your/repo",
  "transport": { "namespace": "my-project", "databasePath": "C:/path/to/state/transport.sqlite" },
  "databases": {
    "orchestration": "C:/path/to/state/orchestration.sqlite",
    "ordarium": "C:/path/to/state/ordarium.sqlite",
    "coordination": "C:/path/to/state/coordination.sqlite",
    "transportCursors": "C:/path/to/state/cursors.sqlite",
    "attentionMarks": "C:/path/to/state/attention.sqlite"
  },
  "reasoning": {}
}
```

profile 必须通过**严格解析**：每一层都只接受上表列出的键，出现 authority/role/permission 之类的字段会 fail closed，而不是被静默忽略。`reasoning` 里不允许 `autonomy` / `everything` 开关。

**2. 安装并启动 shipped DSH principal。** 先构建 Palimpsest，然后把 host bundle 放到 DSH 解析它的位置，并写 profile 目录（路径用绝对路径）：

```bash
# 0) 构建
corepack pnpm install && corepack pnpm run build

# 1) 把 shipped host bundle 放到 profile 加载器解析的位置
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
REPO="$(git rev-parse --show-toplevel)"
mkdir -p "$DSH_HOME/profiles/node_modules"
rm -rf "$DSH_HOME/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/dsh" "$DSH_HOME/profiles/node_modules/palimpsest-dsh-host"

# 2) profile 目录：package.json 声明 bundle
mkdir -p "$DSH_HOME/profiles/my-project"
cat > "$DSH_HOME/profiles/my-project/package.json" <<'JSON'
{
  "name": "dsh-profile-my-project",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON

# 3) 把 host 指向你的 deployment profile 与构建产物
cat > "$DSH_HOME/profiles/my-project/cordis.patch.yml" <<YAML
- id: palimpsest-tools
  config:
    palimpsestEntry: '$REPO/dist/src/advanced.js'
    deploymentProfile: '$DSH_HOME/profiles/my-project/deployment.json'
    serve: false
YAML
# 把 §1.1 的 profile JSON 写到 deploymentProfile 指向的路径
```

然后启动常驻 principal（也可以先给一句初始消息，如 `"...  "` 处直接写任务）：

```bash
node "$DSH_BIN" --profile my-project
```

principal 会创建或冷恢复一个持久会话，并运行 attention 循环：进出消息由 pump → drain → activate 自动激活同一个 principal，不需要用户轮询。

**3. 正常说话。** 例如：

```text
并行探索这个实现的两种方案。
检查当前项目状态。
```

```text
Explore two independent approaches to this implementation.
Check the current project state.
```

你会得到 principal 的可见回答。要点：

- **并行 Explore** 使用有界的**临时**推理分支：它们不是 peer、不是 durable agent、不留下身份，也不产生 commitment。返回的是“探索性发现（exploratory findings）”，**不是** Evidence，也不代表已被验证为真。
- **检查当前项目状态** 走 CHECK：它用真实的 Project Verification 运行时验证**当前 Project Head**，与本轮探索结论无关；主路径文案不会暗示探索结论被独立验证过。
- 若能力不可用（没有 `reasoning`、任务需要更强验证、或需要跨项目），`run` 会如实回答 `CAPABILITY_REQUIRED` / `CROSS_PROJECT_REQUIRED` / `PARTIAL`，不会伪造多 Agent 工作，也不会把单 agent 重复包装成多 Agent。

### 1.2 跨项目：一句话问另一个项目

在**两个** profile 上都配置 `projectDirectory`（本部署可触达的项目名称 ↔ peer 绑定；`directory` 只是 peer 身份提示），两个 host 共享同一个 transport namespace 与数据库；然后启动两个 host：

```text
$DSH_HOME/profiles/detector/deployment.json   +  node "$DSH_BIN" --profile detector
$DSH_HOME/profiles/optics/deployment.json     +  node "$DSH_BIN" --profile optics
```

示例见 `examples/deployment/two-project-detector.json` 与 `two-project-optics.json`（含双方 `projectDirectory`）。对 detector 的 principal 只说：

```text
问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？
```

流程：

```text
origin 用户一句话
  → origin principal 选择 palimpsest_cross_project 的显式 Ask（一次普通 peer 消息）
  → 对方的 shipped pump 观察到请求
  → 对方的 live principal 被激活，读取 pending 并回答（可直接作答，也可用它自己的本地协作）
  → origin 的 pump 观察到回答并激活 origin principal
  → origin 无需第二次用户提示即把回答展示出来
```

诚实边界：Ask 是 peer 通信，**不是** commitment、Work 任务、ProjectIR 修订、boundary 变更、Evidence 或 Proof，也不会自动提升为项目状态；对方可以回答、部分回答、拒绝或稍后再答。用户不需要提供 PeerRef、thread id，也不需要切换项目或轮询。若请求的项目名无法从 id/displayName/alias 唯一确定，产品会请你澄清或列出候选，而不会瞎猜。

## 2. 安装

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
| `<profile>.databases.orchestration` | 编排状态（事件日志） |
| `<profile>.databases.ordarium` | 副作用执行记录 |
| `<profile>.transport.databasePath` | 耐久传输（跨项目邮箱底座） |
| `<profile>.databases.*` | coordination / cursors / attention marks 等 |

## 3. 专家面：Work CLI

面向自动化、脚本与调试。普通协作不需要学习它。核心模型：**goal** 编译为任务图，每个任务由隔离的 **attempt** 执行，attempt 通过确定性**门禁**后其结果被**晋升**为正式状态。

### 3.1 命令参考

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

通用选项：`--db <path>`（编排库）、`--ops <path>`（副作用账）、`--repo <path>`（真实 git 端口）、`--gate <file>`（GateDefinition JSON）、`--skills '<json>'`（任务技能提示）。

### 3.2 工作流

```bash
CLI=dist/src/cli.js
node "$CLI" new p "convert the reports to pptx" --skills '["document-skills:pptx"]'
node "$CLI" run 20
node "$CLI" status
```

`run` 返回当前阶段：

| 阶段 | 含义 | 后续动作 |
|---|---|---|
| `progress` | 存在可推进的决策 | 继续执行 `run` |
| `needs_worker` | 需要执行者完成任务 | `claim` + 执行 + `report` |
| `needs_promotion` | 候选已就绪待验证晋升 | `gate` + `promote` |
| `awaiting_worker` | 存在未决的在途尝试 | 等待其返回或重新派发 |
| `paused` | 调度器已暂停 | `resume` |
| `terminal` | 全部任务已终结 | 无 |

### 3.3 验证与晋升

执行报告中的声明不构成证据。证据由 `gate` 产生，晋升要求门禁判定为 PASS：

```bash
node "$CLI" gate <attemptId> tests_pass 0 python -m pytest
node "$CLI" promote gate-release
```

门禁判定为 INCOMPLETE 时返回缺失证据清单，不执行晋升。

### 3.4 中断恢复

任意时刻中断（进程终止、会话关闭、重启）后，`status` 的 `resume` 区块报告断点、在途尝试与所需标识符。按其 `action` 字段继续对应操作即可。已完成的工作不会重复执行；过期返回的结果按 STALE 记录，不影响当前状态。

## 4. DSH 集成

技能安装于 `.zcode/skills/palimpsest/`（项目级）或 `~/.zcode/skills/palimpsest/`（用户级）后，ZCode/DSH agent 可直接说“并行探索……”“检查当前项目状态”“问一下另一个项目”。技能文档中的示例使用 `git rev-parse --show-toplevel` 解析仓库根；构建产物位于 `dist/src/cli.js`。

注意：**shipped DSH principal 不读取该技能文件**——它是 ZCode 客户端技能。principal 的工具选择由 `palimpsest_collaborate` / `palimpsest_cross_project` 的**工具描述**与用户措辞驱动；技能文件服务于 ZCode 侧的产品路径。

## 5. 常见问题

**worker 报告完成，为何未晋升？**
执行报告只是自述。证据来自门禁命令的确定性结果；证据齐备且门禁 PASS 后方可晋升。

**并行 Explore 的结论可以直接当事实用吗？**
不可以。它们是探索性发现，不是 Evidence，也不代表已被独立验证。“检查当前项目状态”验证的是当前 Project Head，不是这些结论。

**问另一个项目后没有立刻回答？**
`status` 中“尚无回答”是 WAITING，不是失败；对方是主权项目，可以稍后回答、部分回答或拒绝。回答也不会自动写入项目状态。

**权限请求被拒绝会如何？**
拒绝视为用户否决。相关任务作废或改由计划修订处理，不会自动重试同一调用。

**如何迁移到另一台机器？**
复制 §2 列出的状态文件至相同相对路径。
