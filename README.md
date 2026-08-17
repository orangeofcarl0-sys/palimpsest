# Palimpsest DSH Plugin

> **A user-friendly multi-agent orchestration plugin for DSH, built on Ordarium.**
> One-sentence goals become durable projects. —— Revision without amnesia.

Palimpsest 把一句话目标编译成耐久项目（ProjectIR + Task DAG），Attempt 在隔离与证据门禁下推进，只有通过确定性 Gate 的工作才被晋升到 canonical 状态；全部外部副作用经姊妹工程 **Ordarium**（Safe Action SDK + Effect Authority，https://github.com/orangeofcarl0-sys/ordarium）以 Safe Action 执行在共享本地 ledger 上。

## 当前状态（P0）

本仓库处于复兴计划的首个里程碑（P0）：

| 层 | 状态 |
|---|---|
| `src/schema` 五核心 Schema + canonical digest | ✅ 已移植，跨语言 digest parity 已验证 |
| `src/domain` 状态机 / aggregate 校验 / 受信 Policy | ✅ 已移植 |
| `src/state` 事件存储（SQLite, PLMP）／投影／快照 | ✅ 已移植，snapshot digest 与 Python 逐字节一致 |
| `src/scheduler` 调度决策 + Ordarium effects 接线 | ⏳ P1 |
| DSH 工具面（7 工具）+ `installPalimpsest` | ⏳ P2 |
| 多 agent 并行（claim/report 并发、角色槽位） | ⏳ P3 |

产品定义、分层架构、Ordarium effect 映射与阶段门见 [`docs/01-plugin-product-baseline.md`](docs/01-plugin-product-baseline.md)；设计传承与权威来源声明见 [`docs/00-heritage.md`](docs/00-heritage.md)。

## 验证（P0）

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm exec vitest run
```

测试套件（17 项）以 `fixtures/replay/baseline-v1.json` 为黄金基准：该 fixture 由冻结的 Python Runtime 生成，TS 实现对其全部事件重算 request/event digest、重放进真实 SQLite 文件并比对 snapshot digest，逐字节一致才通过——这是两个运行时共享同一合同的机器证明。

## 依赖 Ordarium（P1 起）

P0 的 schema/domain/state 零外部依赖（仅 `node:sqlite` 内置）。P1 接入 Ordarium：

```bash
corepack pnpm run sync:ordarium   # 从同级 Ordarium checkout 打包五 tarball 入 vendor/
corepack pnpm add "file:vendor/ordarium/@ordarium-core-1.0.0.tgz" \
  "file:vendor/ordarium/@ordarium-dsh-1.0.0.tgz" \
  "file:vendor/ordarium/@ordarium-ledger-sqlite-1.0.0.tgz" \
  "file:vendor/ordarium/@ordarium-testing-1.0.0.tgz"
```

（单包 git 依赖因 `workspace:*` 无法解析是 Ordarium 记录在案的已知限制；五 tarball 自洽性即其 `test:package` 验证的内容。）

## 三句不可违背的合同

1. **AttemptReport ≠ Evidence** —— Worker 自述的 "tests passed" 不产生证据；证据只来自确定性 Gate。
2. **LLM opinion ≠ Project State** —— Manager/agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交** —— 执行成功与当前可提交是两回事；stale 隔离绝不放松。
