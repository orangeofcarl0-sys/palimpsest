# 架构

本文描述 Palimpsest 的系统结构、核心合同与设计决策。API 细节见 [api-reference.md](api-reference.md)。

## 1. 总体结构

```text
┌─ 接入层 ─────────────────────────────────────────────┐
│ DSH 工具（9） │ CLI（bin） │ 技能（SKILL）            │  三条入口，同一控制器
├─ 编排层 ─────────────────────────────────────────────┤
│ ProjectController（生命周期/调度/执行/证据/晋升/状态） │
│ Scheduler（decide/commit 纯决策与提交分离）            │
├─ 治理层 ─────────────────────────────────────────────┤
│ Gate DSL │ 失效演算 │ 证据图 │ 锦标赛选择 │ 分配器     │
├─ 合同层 ─────────────────────────────────────────────┤
│ schema（canonical digest） │ domain（状态机/校验）     │
│ state（EventStore/投影/快照）                          │
├─ 副作用层（Ordarium）────────────────────────────────┤
│ 五个 Safe Action │ SqliteLedger │ reconcile 恢复      │
└───────────────────────────────────────────────────────┘
```

依赖方向自上而下单向；`state` 不依赖 `scheduler`；DSH 渲染概念不进入控制器（SDK 纪律）。

## 2. 三条核心合同

1. **执行报告 ≠ 证据**。worker 自述仅进入报告的 summary 字段；证据由确定性命令产生并绑定主体摘要。
2. **LLM 意见 ≠ 项目状态**。项目事实只能由证据驱动的事件变更；agent 判断是提议。
3. **迟到成功 ≠ 可提交**。尝试绑定创建时的项目版本；过期结果标记 STALE，不可复活。

## 3. 概念模型

| 概念 | 定义 |
|---|---|
| ProjectIR | 项目的不可变版本化快照；`plan` 生成新 revision，历史不覆盖 |
| TaskSpec / 任务图 | 任务声明：目标、依赖、写路径、必需产物、可选角色与技能提示 |
| Attempt | 任务的一次隔离执行，绑定创建时的项目版本 |
| TaskEnvelope | 尝试的完整输入：目标、写路径、命令白名单、网络策略、租约、技能提示 |
| EvidenceAtom | 确定性命令的证据：谓词、命令、退出码、主体摘要 |
| GateDefinition | 声明式门禁：对证据集合的确定性布尔求值（PASS/FAIL/INCOMPLETE） |
| 晋升 | 将通过门禁的候选结果合并进正式状态 |

## 4. 存储模型

| 存储 | 角色 |
|---|---|
| `palimpsest.sqlite` | 编排真相：项目应发生什么（事件日志、投影、快照） |
| `operations.sqlite` | 副作用事实：实际发生了什么、是否恰好一次（Ordarium 共享账本） |

事件写入管线（六段，单事务原子）：结构校验 → 规范化 → 幂等查重 → revision 前置 → 聚合校验 → 提交并延伸哈希链。重复请求返回原事件，不重复入账。

数据库配置：WAL 强制启用、`busy_timeout=5000`、`synchronous=FULL`、外键开启。多进程可同时打开；长批量循环建议单进程执行。

## 5. 确定性

- canonical JSON + SHA-256（键按码点排序、禁浮点、NFC、显式 null；请求与事件双摘要）。
- 与冻结 Python 基线（`fixtures/replay/baseline-v1.json`）逐字节一致，作为持续校验的机器门。
- 时间与身份注入：不读取系统时钟；事件幂等键由 `actionKey`/`stableEntityId` 确定性生成。
- 调度器决策拆分为纯函数 `decide()`（零写入）与 `commit()`；预览与实际提交字节一致。

## 6. 副作用映射（Ordarium）

| 动作 | Action | Effect profile |
|---|---|---|
| 创建工作区 | `palimpsest.worktree.create` | idempotent(durable) |
| 提交 | `palimpsest.git.commit` | reconcilable |
| 晋升合并 | `palimpsest.git.promote` | reconcilable |
| 门禁命令 | `palimpsest.gate.command` | readOnly |
| worker 派发 | `palimpsest.worker.dispatch` | guarded |

崩溃恢复语义：合并前后崩溃经 reconcile 收敛——已落地则不重做，未落地则补做，结果为恰好一次。

## 7. 并发控制

- 单活动任务不变量：同一时刻至多一个任务处于 ACTIVE/VERIFYING。
- 角色槽位在认领时准入（默认 implementer 2、软上限 8、硬上限 20）。
- 批次激活：任务启动时按候选上限并行创建尝试；失败批次自动重试直至预算耗尽。

## 8. 错误分类

| 类别 | 处置 |
|---|---|
| 合同/结构错误 | 拒绝整个写入，状态不变 |
| 确定性失败 | 终态化（ATTEMPT_FAILED/TASK_FAILED/PROMOTION_FAILED），进入重试或作废 |
| 不确定结果 | 不终态化；重启后经 reconcile 收敛 |

宿主权限拒绝视为用户否决：不重试原调用，任务作废或修订计划。

## 9. DSH 模式兼容

9 个工具均声明结构化 `mode`（`read-only` / `mutating`）。只读面为 `palimpsest_status` 与 `palimpsest_preview`：plan 模式下允许的全部操作，保证零事件写入。宿主权限层可直接依据该字段放行或拒绝。
