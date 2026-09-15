# Palimpsest

Palimpsest 是一个面向 DSH 的持久化 AI 工作体运行环境：将一句话目标编译为耐久项目，任务在隔离环境中执行，只有通过确定性验证的工作才会被晋升为正式结果。进程与会话可在任意时刻中断，重启后从断点继续，历史完整保留；多个长期项目 Agent 可作为独立主权主体，通过耐久语义传输协商共享边界、形成显式 commitment 并长期协作。

外部副作用经姊妹工程 [Ordarium](https://github.com/orangeofcarl0-sys/ordarium)（Safe Action SDK）执行于共享本地 ledger。

## 特性

- **耐久性**：项目状态持久化于本地 SQLite 事件日志（append-only、哈希链）；崩溃或会话中断后可完整重建。
- **证据治理**：worker 自述不构成证据；证据仅由确定性门禁产生。晋升必须通过已注册门禁。
- **历史保留**：每次计划修订生成新版本，旧版本与旧证据按绑定关系保留并自动失效。
- **并行执行**：角色槽位控制并发（默认 implementer 2，硬上限 20），支持多候选并行与锦标赛选择。
- **DSH 集成**：9 个工具（含只读勘察面）、CLI、技能三条入口共享同一控制器。
- **持久联邦协作**：两个独立配置的长期项目 Agent（各自的 PeerRef、PersistentPoint、语义库与 inbox）可通过 Ordarium `StateChangeFeed` 驱动的耐久传输交换语义事件、协商共享 boundary、形成显式 commitment，并在进程重启与 重复投递后收敛（`palimpsest serve --profile <file>` 可复现启动完整栈；`pnpm run dogfood:live` 运行真实双 peer 演练）。
- **真实宿主认知**：长期项目 Agent 可由真实 DSH host 持久运行并冷恢复；Palimpsest attention 会把 durable 语义事实激活为 host agent 的一轮真实认知，Agent 通过 `palimpsest_*` 工具读取 canonical inbox/boundary/commitment 并自主决策——无需人工转发消息，也没有中心规划器（`node scripts/dogfood/real-host-federation.mjs` 运行双 OS 进程真实演练）。
- **经验评测基础**：Palimpsest 可定义可复现的组织实验，跨显式架构变体（single-locus / 人工角色分工 / 联邦 peers / reasoning cell）运行多次隔离真实宿主试验，只采集可观测或明确分类的度量（不可得即 `unavailable`，绝不写 0），以分布与 Pareto 而非单一分数评价，保留失败与不确定性，并把架构选择与观测结果持久化到 **append-only Organization Memory**——它可**为未来组织变更提供参考，但永不授权变更**（`node scripts/experiments/run-campaign.mjs`）。
- **意见化组织模式**：普通用户只需表达意图——**Focus**（聚焦）、**Explore**（并行探索）、**Coordinate**（与既有的独立项目协作），可选 **Verify**（更强验证）与 **Monitor**（跨时间持续关注）；系统用透明的 eligibility 规则与有限的**经验证据**（OrganizationMemory）给出建议，并展示反证与迁移限制——不发明任意 AgentGraph、不伪造 durable peer、不给出隐藏分数。Explore 使用**临时**推理分支（非 durable agent），Coordinate 只在已存在的独立 peer 之间工作。
- **可举证的证明资产**：把用户自有的原始来源（本地显式导入，**不会自动送给模型**）保存为不可变的 source revision，派生精确 EvidenceItem，经**独立**验证与发布准入后成为带 provenance 的 Evidence claim；系统能回答“我能举证什么、依据哪个来源、支持是否仍然新鲜、下游哪些结论依赖它、为某个目的必须披露什么”，并只生成**目的限定**的本地披露包（仅含明确选中的 claim 与必需证据）。ProofAsset **不是**真值、法律证明、身份或凭证，Vault **不声称加密**。

## 安装

要求 Node ≥ 24.15。

```bash
git clone https://github.com/orangeofcarl0-sys/palimpsest.git
cd palimpsest
corepack pnpm install
corepack pnpm run build
```

依赖（`@ordarium/core`、`@ordarium/ledger-sqlite`、`@ordarium/testing`）从 Ordarium 的 [GitHub Release](https://github.com/orangeofcarl0-sys/ordarium/releases/tag/ordarium-v1.0.0) 拉取。

## 快速开始

```bash
CLI=dist/src/cli.js

node "$CLI" new p "convert the reports in docs/ to pptx" --skills '["document-skills:pptx"]'
node "$CLI" preview     # 只读查看下一步决策
node "$CLI" run 20      # 机械推进，输出剩余阶段
node "$CLI" status      # 项目状态与断点
```

在 DSH 中安装技能后（`.zcode/skills/palimpsest/`），直接对 agent 说"用 palimpsest 完成 X"；中断后说"继续"即可恢复。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) | 用户指南：安装、命令、工作流、恢复 |
| [docs/architecture.md](docs/architecture.md) | 架构：概念、合同、存储、确定性 |
| [docs/sdk-guide.md](docs/sdk-guide.md) | SDK 指南：嵌入、执行器协议、错误模型 |
| [docs/api-reference.md](docs/api-reference.md) | API 参考 |
| [docs/engineering/](docs/engineering/) | 内部工程档案（移植记录、规格修订流水） |

## 测试

```bash
corepack pnpm exec vitest run
```

测试套件包含基线 fixture（`fixtures/replay/baseline-v1.json`，v2 共 16 事件；v1 冻结自 Python 运行时，v2 由 TS 调度器再生并加入 genesis 阶段图声明）的摘要校验，任何涉及序列化的变更必须保持逐字节一致。

## 许可

MIT。
