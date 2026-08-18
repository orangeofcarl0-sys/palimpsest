# Palimpsest DSH Plugin

> **A user-friendly multi-agent orchestration plugin for DSH, built on Ordarium.**
> One-sentence goals become durable projects. —— Revision without amnesia.

Palimpsest 把一句话目标编译成耐久项目（ProjectIR + Task DAG），Attempt 在隔离与证据门禁下推进，只有通过确定性 Gate 的工作才被晋升到 canonical 状态；全部外部副作用经姊妹工程 **Ordarium**（Safe Action SDK + Effect Authority，https://github.com/orangeofcarl0-sys/ordarium）以 Safe Action 执行在共享本地 ledger 上。

## 当前状态（P0 + P1）

| 层 | 状态 |
|---|---|
| `src/schema` 五核心 Schema + canonical digest | ✅ 已移植，跨语言 digest parity 已验证 |
| `src/domain` 状态机 / aggregate 校验 / 受信 Policy | ✅ 已移植 |
| `src/state` 事件存储（SQLite, PLMP）／投影／快照 | ✅ 已移植，snapshot digest 与 Python 逐字节一致 |
| `src/scheduler` 确定性调度决策（Python scheduler 完整移植） | ✅ P1，fixture 从零重放 15 事件 digest 逐字节一致 |
| `src/effects` 五 Ordarium Safe Action + 共享 ledger + PromotionManager + GitPort | ✅ P1，五 action 故障注入 + Promotion Crash A/B 恢复验收通过 |
| `src/executors` claim/report 协议 + 命令执行器 + mock | ✅ P1 |
| DSH 工具面（7 工具）+ `installPalimpsest` + ProjectController | ✅ P2 |
| 多 agent 并行（claim/report 并发、角色槽位） | ⏳ P3 |

产品定义、分层架构、Ordarium effect 映射与阶段门见 [`docs/01-plugin-product-baseline.md`](docs/01-plugin-product-baseline.md)；设计传承与权威来源声明见 [`docs/00-heritage.md`](docs/00-heritage.md)。

## 验证

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm exec vitest run
```

测试套件（54 项）以 `fixtures/replay/baseline-v1.json` 为黄金基准，分三层机器证明：

1. **合同 parity（P0）**：fixture 全部事件重算 request/event digest、重放进真实 SQLite 并比对 snapshot digest，逐字节一致。
2. **调度器 parity（P1）**：TS Scheduler 从零复现 Python `populate()` 调用序列，重新生成的 15 事件 Event Log（含 committed_at、哈希链、双摘要）与 fixture 逐字节一致。
3. **effects 故障注入（P1）**：五 action 各过 `@ordarium/testing` FaultInjector 崩溃检查点（after-claim / after-dispatch）+ ManualClock 驱动 lease 过期重启；Promotion Crash A（合并前崩溃恢复后恰好合并一次）与 Crash B（合并落地后崩溃，reconcile 恢复且绝不二次合并）均机器验收。
4. **12 项故障验收场景（P2）**：docs/05 §3 的 pause/resume、crash recovery、snapshot rebuild、local retry、lease expiry、late result、revision change、evidence invalidation、write escape、promotion happy path、event idempotency 在插件形态全部通过。

## 依赖 Ordarium

P0 的 schema/domain/state 零外部依赖（仅 `node:sqlite` 内置）。P1 接入 Ordarium 五包（实际使用 core / ledger-sqlite / testing）：

```bash
corepack pnpm run sync:ordarium   # 从同级 Ordarium checkout 打包五 tarball 入 vendor/ordarium/dist/
corepack pnpm install             # link: + workspace overrides 解析（pnpm-workspace.yaml）
```

（单包 git 依赖因 `workspace:*` 无法解析是 Ordarium 记录在案的已知限制；五 tarball 自洽性即其 `test:package` 验证的内容。公共发布后切换为 GitHub Release URL。）

## 三句不可违背的合同

1. **AttemptReport ≠ Evidence** —— Worker 自述的 "tests passed" 不产生证据；证据只来自确定性 Gate。
2. **LLM opinion ≠ Project State** —— Manager/agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交** —— 执行成功与当前可提交是两回事；stale 隔离绝不放松。
