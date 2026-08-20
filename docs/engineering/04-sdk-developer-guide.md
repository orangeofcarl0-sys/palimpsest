# Palimpsest SDK 开发者指南

> 适用对象：框架/宿主作者、自定义执行器作者、需要耐久多 agent 编排的应用开发者。
> 原则：**简洁、全面、细节澄清**。完整规格见 docs/03；逐符号 API 见 docs/05；概念来历见 docs/00。

## 1. 你拿到的两个面

| 导入 | 内容 | 典型用途 |
|---|---|---|
| `import … from "palimpsest-dsh"` | 合同核心：`schema`（五 Schema/28 EventType/canonical digest）、`domain`（状态机/aggregate/policy/幂等）、`state`（EventStore/投影/快照/migration）、`scheduler`（decide/commit） | 深度嵌入：自己组 controller 之上的一切，或只消费合同核心做自己的编排 |
| `import … from "palimpsest-dsh/advanced"` | 嵌入面：`effects`（Ordarium 五 action/executor/git）、`evidence`（Gate DSL/invalidation/证据图）、`select`/`allocate`/`telemetry`、`tools`（ProjectController + 9 工具）、`installPalimpsest` | 绝大多数宿主：一个调用拿到完整控制器与工具面 |
| `bin.palimpsest`（副作用） | CLI：new/plan/next/preview/run/claim/report/gate/promote/pump/status | 无宿主场景；与工具面永远同源（同一 controller） |

两颗心智锚点：**`ProjectController` 就是 SDK 面**（docs/03 §5.1 的 21 个方法分六组）；`index.ts` 顶注释把它表述为"合同核心"，`advanced.ts` 表述为"嵌入面 + opt-in 路径"——`installPalimpsest` 是绝大多数人唯一的入口。

## 2. 五分钟嵌入

### 2a. 有 DSH 宿主（黄金路径）

```ts
import { installPalimpsest } from "palimpsest-dsh/advanced";

const installed = installPalimpsest(hostCtx as never, { projectId: "my-project" });
const unregister = installed.register(hostCtx); // 注册 9 个 palimpsest_* 工具
// 宿主 agent 现在可用 palimpsest_start / plan / next / preview / run / claim /
// report / gate / status 驱动整个编排循环。
await installed.dispose();
```

### 2b. 无宿主，直接构造（SDK 真面目）

```ts
import { EventStore } from "palimpsest-dsh";
import { TaskPolicy } from "palimpsest-dsh";
import { createPalimpsestEffects, FakeGitPort } from "palimpsest-dsh/advanced";
import { ProjectController } from "palimpsest-dsh/advanced";

const store = new EventStore("ops.sqlite", { clock: () => new Date().toISOString() });
const effects = createPalimpsestEffects({ databasePath: "ledger.sqlite", git: new FakeGitPort("c".repeat(40)) });
const controller = new ProjectController({
  store, effects, projectId: "p",
  policy: new TaskPolicy({ policy_id: "trusted-default", read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny", network_allowlist: [], timeout_s: 60, lease_s: 10,
    attempt_limit: 2, candidate_limit: 1 }),
  clock: () => new Date().toISOString(),
});

controller.start({ projectId: "p", goal: "ship the report", tasks: [{ task_id: "t-1", objective: "…", depends_on: [], write_paths: ["out"], required_artifacts: ["out/r.md"] }] });
controller.step();        // TASK_STARTED
const created = controller.step(); // ATTEMPT_CREATED
// 见 §6：两个执行模型
```

**三段式推进**：机械可判定部分用 `pumpCommandAttempts`/`runTurn`（确定性、命令执行器）；需要 LLM/工人判断的部分走 `claim`/`report`；判断依据看 `status().resume`。崩溃后一切从 `status()` 恢复（resume 区块自描述所需 ID）。

## 3. 概念模型（每条附"细节澄清"）

- **ProjectIR / revision**：项目真相的不可变快照。`plan` 产生新 revision，**历史永不覆盖**——旧版本与旧证据按绑定 revision 保存在事件库里。细节：manager 的意图只表现为"提议新 revision"，不是状态覆写（合同 2）。
- **attempt / TaskEnvelope**：一次隔离执行尝试；`envelope` 是 worker 的**全部输入**（objective、write_paths、allowed_commands、网络策略、`suggested_skills` 技能提示、租约/预算）。细节：envelope 校验进去讲，worker 只需读它。
- **AttemptReport ≠ Evidence**：worker 自述只能进 `summary`；**唯一产生证据的路径**是 `controller.gate` / Gate DSL 求值。细节：即使 gate 命令退出码也只是一次确定性采样的产物，绑定 subject digest（attempt）。
- **gate / promotion**：GateDefinition 是声明式、版本化、确定性布尔求值（PASS/FAIL/INCOMPLETE）；`promoteWhenGatePasses` 只放行 PASS，缺证据返回 `nextEvidenceNeeded`。细节：absence ≠ evidence of absence（INCOMPLETE ≠ FAIL）。
- **stale 隔离**：attempt 绑定创建时的 revision；迟到/过期结果四分类处置，**绝不复活**、绝不覆盖新状态（合同 3）。
- **decide / commit**：调度器决策拆成纯函数 `decide()`（零写入）与 `commit()`（append 管线）；`step()=commit(decide())`。细节：`preview()` 与 `runTurn` 都骑在 `decide()` 上，所以**预览与真提交字节一致**。

## 4. 确定性合同（吃了这碗饭就别往锅里吐口水）

- **canonical JSON + SHA-256 双 digest**：键按码点排序、禁浮点、NFC、显式 null；request/event 双摘要；哈希链。
- **跨语言 parity 是机器门**：`fixtures/replay/baseline-v1.json`（冻结 Python 生成的 15 事件）要求 TS 实现重算的 digest/哈希链/snapshot 逐字节一致。**你碰到序列化的任何提交都必须过这个门**（`pnpm exec vitest run test/parity.fixture.test.ts`）。
- **幂等**：`actionKey`/`stableEntityId` 决定论生成全部事件的幂等键；重复的 request 返回原事件而不是重复入账。细节：这是"多进程同时写"与"崩溃重放"不重复的根源。
- **时间**：不读系统时钟——时钟注入（Palimpsest 侧 `() => string`，Ordarium 侧 `() => Date`）。细节：测试用 `ManualClock`/`FakeClock` 复现跨天/租约过期。
- **存储并发**：WAL 强制、`busy_timeout=5000`、`synchronous=FULL`、append 单事务原子。细节：不要求单写者，但长批量机械循环请单进程进行。

## 5. 执行器协议（最容易写错的地方）

你有两套，理解边界：

| 模型 | 入口 | 适用 | 谁做"完成判定" |
|---|---|---|---|
| **命令执行器** | `pumpCommandAttempts` / `runTurn` / `palimpsest_run` | 任务=某条命令可判定（gate 命令即产物） | 命令退出码 → report（机械） |
| **claim/report 协议** | `claim` → 你的 worker → `report` | 任务需要真实工作（编码/写作/检索） | worker 自述（**不是证据**）→ 之后 `gate` 取证 |

- `claim(attemptId)` → 隔离 worktree（effects 创建）+ 租约 + `RUNNING`。
- `report(attemptId, { workerStatus, summary, … })` 四态：completed / failed / cancelled / expired；迟到结果走 `reportLate` → STALE。
- **边界铁律**：worker 判断与 gate 判断之间的空档，正是"自述≠证据"的落点。CLI 的 `pump` 把命令执行器的机械部分自动跑完（含失败批次重试），`runTurn` 再把"轮到 LLM 判断"的阶段（needs_worker / needs_promotion）显式交还给你。

## 6. 错误模型（三类、三种处置）

| 错误 | 处置 |
|---|---|
| 合同/结构错误（非法 payload、非法转换、revision 冲突） | **fail-closed**，拒绝整个 append，库不变 |
| 确定性失败（gate 非零退出、worker 报 failed、promotion 确定性拒绝） | 可 terminalize（ATTEMPT_FAILED / TASK_FAILED / PROMOTION_FAILED）→ 批次重试或作废 |
| 不确定结果（dispatch 后失联、崩溃点在效果落地前后） | **绝不 terminalize**；重启后经 Ordarium reconcile 收敛为"恰好一次"或"查明已落地" |

另外：宿主权限/hook 拒绝＝**用户否决**，不是错误——不原样重试；9 个工具带结构化 `mode`（`read-only`/`mutating`），read-only 面＝`palimpsest_status` + `palimpsest_preview`（plan 模式下全部允许的勘察面）。细节：`status()` 永不因调度器推进性校验崩溃——遇到 stale-world 时 `resume.action` 报告 `blocked`。

## 7. 与 Ordarium 的关系（调用，不重建）

- 五个 effect profile 已在插件里映射好：worktree.create=idempotent(durable)、git.commit=reconcilable、git.promote=reconcilable（Crash A/B→reconcile）、gate.command=readOnly、worker.dispatch=guarded。
- **双存储**：编排账（palimpsest.sqlite，事件真源）与副作用账（operations.sqlite，Ordarium 共享 ledger）各管一件事。插入项目的全部外部副作用都经 `controller.effects.actions.*`。
- 崩溃恢复不是你的工作：事件库可重放、effects 有 lease + reconcile。你该做的是**不把 uncertain 当失败**、不盲重试。

## 8. 测试：你的改动别砸机器门

```bash
corepack pnpm run build
corepack pnpm exec vitest run           # 27 文件 / 144+
corepack pnpm exec vitest run test/parity.fixture.test.ts   # 合同门
```

新字段/新事件走 docs/03 §9 变更控制：合同触点须 bump 版本 + parity 回归 + 迁移路径；**加法可选字段缺省省略可免 bump**（§9.2 例外，须在审计记录里明示）。

## 9. 路线图

- E 线（入口体验）全部交付：一句话闭环、装备化 worker（`suggested_skills`）、断点续跑（resume）、模式兼容（mode 声明）。
- S 线（SDK 拆包/多宿主）为提案制：本仓库的两级导出面即 SDK 预埋，拆包前不要把 DSH 渲染概念渗入 controller（docs/03 §2.4 纪律）。
