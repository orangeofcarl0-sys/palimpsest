# Palimpsest

**面向真实项目的可靠多 Agent 协作。** 像跟一个项目 Agent 说话一样，在同一个项目里并行探索、自动选择合适的分析方式、检查当前项目状态；需要时，用一句话问另一个长期项目。Palimpsest 让这些协作可靠地发生。

```text
一个项目 Agent
  → 需要时在本项目内并行 Explore / 检查当前状态
  → 被明确要求时问另一个项目
  → 底下是耐久、证据治理、可恢复的项目状态
```

用户不需要记工具名、Recipe id、`ReasoningCell`、`PeerRef` 或线程号：用普通语言即可。

## 快速开始（产品路径）

在一个普通 deployment profile 上安装 shipped DSH principal，正常说话即可。三步：

**1. 创建/加载 deployment profile。** 唯一的本地协作开关是 `reasoning` 字段——存在即可（`{}` 表示使用打包的默认协作能力）：

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

最小可运行示例见 [`examples/deployment/single-project.json`](examples/deployment/single-project.json)（本地占位路径、不含凭证、通过严格 profile 解析）。profile 是 host/deployment 配置，不是语义权威：它只回答“哪个项目、哪个 peer、哪些库、哪个 attention 适配器”，永远不回答谁有语义授权。

**2. 启动 shipped DSH principal。** 完整安装步骤见 [用户指南](docs/user-guide.md)（把 `host/dsh` bundle 放到 `$DSH_HOME/profiles/node_modules/palimpsest-dsh-host`，写 profile 的 `package.json` + `cordis.patch.yml`，然后）：

```bash
node <dsh bin> --profile <your-profile>      # 常驻 principal（进出消息由 pump/attention 自动激活）
```

**3. 正常说话。** 例如：

```text
并行探索这个实现的两种方案。
检查当前项目状态。
```

```text
Explore two independent approaches to this implementation.
Check the current project state.
```

principal 自己选择高层产品路径：本地并行探索用**临时**推理分支（不是持久 peer、不产生 commitment，结果是**探索性发现**，不是 Evidence、也不代表已被验证为真）；“检查当前项目状态”验证的是**当前 Project Head**，绝不是刚才那些探索结论。

**跨项目。** 在 profile 里加上 `projectDirectory`（本部署可以触达的项目名称 ↔ peer 绑定），启动两个 host，然后：

```text
问一下 optics 项目这个问题。
Ask the optics project whether we already studied this.
```

这是一次显式的 Ask：它是一次普通 peer 通信，**不是** commitment、Work 任务或项目状态变更；对方可以回答、部分回答、拒绝或稍后回答，回答不会自动写进项目真值。

## 示例 profile

| 文件 | 用途 |
|---|---|
| [examples/deployment/single-project.json](examples/deployment/single-project.json) | 单项目 + 本地协作（`reasoning: {}`） |
| [examples/deployment/two-project-detector.json](examples/deployment/two-project-detector.json) | detector 项目，带 `projectDirectory`（可 Ask optics） |
| [examples/deployment/two-project-optics.json](examples/deployment/two-project-optics.json) | optics 项目，带 `projectDirectory`（可 Ask detector） |

三个示例都使用本地占位路径、不含任何凭证，并通过严格 profile 解析（未知字段会被拒绝）。

## 产品面 vs 专家面

| 面 | 内容 | 定位 |
|---|---|---|
| **产品路径** | `palimpsest_collaborate`（本地并行/自动选择/CHECK）、`palimpsest_cross_project`（跨项目 Ask） | 普通用户只需说人话 |
| **专家 / 自动化 / 调试路径** | Work CLI（`new / plan / run / claim / report / gate / promote`）、raw federation 工具、ReasoningCell 工具、management 面 | 保留，用于脚本化、手工控制与排查；普通协作**不需要**学习它们 |

## 它如何工作（under the hood）

Palimpsest 底下是一个**耐久、证据治理的项目运行时**：目标被组织为耐久项目（project workspace），任务在隔离环境中执行，只有通过确定性验证的工作才会被晋升为正式结果。项目本身是一等资产——它显式关联自己产出的知识资产并保留一份项目日志，但从不复制任何 canonical 真值。进程与会话可在任意时刻中断，重启后从断点继续，历史完整保留；多个长期项目 Agent 可作为独立主权主体，通过耐久语义传输协商共享边界、形成显式 commitment 并长期协作。

外部副作用经姊妹工程 [Ordarium](https://github.com/orangeofcarl0-sys/ordarium)（Safe Action SDK）执行于共享本地 ledger。

这是让上面的“说人话”体验保持耐久与正确的实现基础；README **不是**架构真值的所有者，真值在代码与规格中。

- **耐久性**：项目状态持久化于本地 SQLite 事件日志（append-only、哈希链）；崩溃或会话中断后可完整重建。
- **证据治理**：worker 自述不构成证据；证据仅由确定性门禁产生。晋升必须通过已注册门禁。晋升的 source commit 与 expected head 由系统从 attempt report 与 promotion 链派生，调用方**不能**指定；项目 head 经显式、静默门控的 reconciliation 与真实仓库保持一致。
- **历史保留**：每次计划修订生成新版本，旧版本与旧证据按绑定关系保留并自动失效。
- **并行执行**：角色槽位控制并发（默认 implementer 2，硬上限 20），支持多候选并行与锦标赛选择。
- **DSH 集成**：工具、CLI、技能三条入口共享同一控制器；shipped host 提供常驻 principal、pump/attention 生命周期与临时分支执行。
- **项目工作区（Project Workspace）**：项目是默认落地页。工作区是**派生的只读视图**，从既有 canonical 所有者实时重组，绝不复制事实；未配置的平面显式报警告，绝不猜测。该层只新拥有两条窄历史：**资产关联**与**项目日志**（IDEA / OPEN_QUESTION / NEGATIVE_RESULT / OPPORTUNITY / REFERENCE_NOTE）。Open Loop 是“值得一看”的派生提示，绝不是 Work 任务。
- **分级管理自主度（Management involvement）**：DIRECT / ASSIST / MANAGE / DELEGATE 是**用户/项目偏好**，与工作模式（Focus/Explore/Coordinate）正交；有效权限 = 既有语义授权 ∩ 管理策略 ∩ 能力可用性。一个模式永远不是授权：agent 只能**请求**，只有 operator 控制端口能落盘。没有 autonomy 分数，也没有 ManagerAgent——同一个持久项目 principal 服务所有模式。
- **持久联邦协作**：两个独立配置的长期项目 Agent 可通过 Ordarium `StateChangeFeed` 驱动的耐久传输交换语义事件、协商共享 boundary、形成显式 commitment，并在进程重启与重复投递后收敛（`palimpsest serve --profile <file>`）。
- **真实宿主认知**：长期项目 Agent 可由真实 DSH host 持久运行并冷恢复；Palimpsest attention 把 durable 语义事实激活为 host agent 的一轮真实认知，Agent 通过产品工具读取 canonical inbox/boundary/commitment 并自主决策——没有中心规划器。
- **意见化组织模式**：普通用户只需表达意图——**Focus**（聚焦）、**Explore**（并行探索）、**Coordinate**（与既有独立项目协作），可选 **Verify** 与 **Monitor**；系统用透明的 eligibility 规则与有限的**经验证据**给出建议，并展示反证与迁移限制。Explore 使用**临时**推理分支（非 durable agent），Coordinate 只在已存在的独立 peer 之间工作。
- **项目资产能力（可举证的证明 / 本地 Proof Vault）**：显式导入用户自有原始来源（**不会自动送给模型**），保存为不可变 source revision，派生精确 EvidenceItem，经**独立**验证与发布准入后成为带 provenance 的 Evidence claim；只为某个目的导出**真正的最小片段**。ProofAsset **不是**真值、法律证明、身份或凭证，Vault **不声称加密**。

## 安装

要求 Node ≥ 24.15。

```bash
git clone https://github.com/orangeofcarl0-sys/palimpsest.git
cd palimpsest
corepack pnpm install
corepack pnpm run build
```

依赖（`@ordarium/core`、`@ordarium/ledger-sqlite`、`@ordarium/testing`）从 Ordarium 的 [GitHub Release](https://github.com/orangeofcarl0-sys/ordarium/releases/tag/ordarium-v1.0.0) 拉取。

## 专家面：Work CLI

面向自动化、脚本与调试。普通协作不需要它。

```bash
CLI=dist/src/cli.js

node "$CLI" new p "convert the reports in docs/ to pptx" --skills '["document-skills:pptx"]'
node "$CLI" preview     # 只读查看下一步决策
node "$CLI" run 20      # 机械推进，输出剩余阶段
node "$CLI" status      # 项目状态与断点
```

在 DSH 中安装技能后（`.zcode/skills/palimpsest/`），直接对 agent 说“并行探索这个实现的两种方案”或“问一下 optics 项目”；中断后说“继续”即可恢复。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) | 用户指南：主路径（说话即协作）、跨项目、专家 CLI、恢复 |
| [docs/architecture.md](docs/architecture.md) | 架构：概念、合同、存储、确定性 |
| [docs/sdk-guide.md](docs/sdk-guide.md) | SDK 指南：嵌入、执行器协议、错误模型 |
| [docs/api-reference.md](docs/api-reference.md) | API 参考 |
| [docs/product/](docs/product/) | 产品面：零配置协作、单请求协作、跨项目协作 |
| [docs/engineering/](docs/engineering/) | 内部工程档案（移植记录、规格修订流水） |

## 测试

```bash
corepack pnpm exec vitest run
```

测试套件包含基线 fixture（`fixtures/replay/baseline-v1.json`）的摘要校验，任何涉及序列化的变更必须保持逐字节一致。

## 许可

MIT。
