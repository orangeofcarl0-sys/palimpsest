# Palimpsest

Palimpsest 是一个面向 DSH 的多 agent 编排插件：将一句话目标编译为耐久项目，任务在隔离环境中执行，只有通过确定性验证的工作才会被晋升为正式结果。进程与会话可在任意时刻中断，重启后从断点继续，历史完整保留。

外部副作用经姊妹工程 [Ordarium](https://github.com/orangeofcarl0-sys/ordarium)（Safe Action SDK）执行于共享本地 ledger。

## 特性

- **耐久性**：项目状态持久化于本地 SQLite 事件日志（append-only、哈希链）；崩溃或会话中断后可完整重建。
- **证据治理**：worker 自述不构成证据；证据仅由确定性门禁产生。晋升必须通过已注册门禁。
- **历史保留**：每次计划修订生成新版本，旧版本与旧证据按绑定关系保留并自动失效。
- **并行执行**：角色槽位控制并发（默认 implementer 2，硬上限 20），支持多候选并行与锦标赛选择。
- **DSH 集成**：9 个工具（含只读勘察面）、CLI、技能三条入口共享同一控制器。

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

测试套件包含与冻结 Python 基线的跨语言摘要校验（`fixtures/replay/baseline-v1.json`），任何涉及序列化的变更必须保持逐字节一致。

## 许可

MIT。
