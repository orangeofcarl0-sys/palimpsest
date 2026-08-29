# SDK 指南

本指南面向将 Palimpsest 嵌入自有运行时的开发者：框架/宿主作者、自定义执行器作者、需要耐久多 agent 编排的应用。API 细节见 [api-reference.md](api-reference.md)。

## 1. 导入面

| 路径 | 内容 | 用途 |
|---|---|---|
| `palimpsest-dsh` | schema、domain、state、scheduler | 合同核心：仅依赖 `node:sqlite` |
| `palimpsest-dsh/advanced` | effects、evidence、select、allocate、telemetry、tools、`installPalimpsest` | 完整嵌入面 |
| `bin.palimpsest` | CLI | 与工具面同源的命令入口 |

`ProjectController` 是 SDK 的核心对象；`installPalimpsest` 是 DSH 宿主的唯一必需入口。

## 2. 嵌入

### DSH 宿主

```ts
import { installPalimpsest } from "palimpsest-dsh/advanced";

const installed = installPalimpsest(hostCtx, { projectId: "my-project" });
const unregister = installed.register(hostCtx);  // 注册 9 个工具
await installed.dispose();
```

### 直接构造

```ts
import { EventStore, TaskPolicy } from "palimpsest-dsh";
import { createPalimpsestEffects, FakeGitPort, ProjectController } from "palimpsest-dsh/advanced";

const store = new EventStore("state.sqlite", { clock: () => new Date().toISOString() });
const effects = createPalimpsestEffects({ databasePath: "ops.sqlite", git: new FakeGitPort("c".repeat(40)) });
const controller = new ProjectController({
  store,
  effects,
  projectId: "p",
  policy: new TaskPolicy({
    policy_id: "default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
  }),
  clock: () => new Date().toISOString(),
});

controller.start({ projectId: "p", goal: "…", tasks: [/* TaskSpec */] });
controller.step();
```

## 3. 执行模型

| 模型 | 入口 | 适用 | 完成判定 |
|---|---|---|---|
| 命令执行器 | `pumpCommandAttempts` / `runTurn` | 任务结果由命令退出码决定 | 命令退出码 |
| claim/report 协议 | `claim` → worker → `report` | 任务需要实际工作 | worker 自述（非证据），随后由 `gate` 取证 |

规则：

- `claim(attemptId)` 返回隔离工作区并将尝试置为 RUNNING；envelope 是 worker 的完整输入。
- `report` 的四种终态：completed / failed / cancelled / expired；过期返回使用 `reportLate`（记录为 STALE）。
- 证据仅由 `controller.gate` 或门禁求值产生。

### 声明治理

门禁、角色槽位、阶段图与选拔判官全部上链声明（构造器不再接受内存配置）；最新声明胜出，未声明即 fail-closed：

| 方法 | 作用 |
|---|---|
| `declareGate(gate, declaredBy)` | 注册/取代门禁定义（`GATE_DEFINED`） |
| `declareRoleTable({ roles, hardCap, declaredBy })` | 声明角色槽位表；未声明角色在认领/分配时被拒 |
| `declareStageGraph(graph, version)` | 声明任务阶段图；占用状态必须仍可达终态，否则一票否决 |
| `declareJudge({ judgeId, kind, declaredBy })` | 声明选拔判官；未声明时 `selectCandidate` 拒绝执行 |

`start()` 自动声明 genesis 角色表与默认阶段图（现行管线逐字声明化）。更换拓扑——新增角色、重命名阶段——只需再声明一次，无需改代码。

## 4. 错误处理

| 类别 | 行为 |
|---|---|
| 合同/结构错误（非法 payload、非法状态转换、revision 冲突） | fail-closed，写入被拒绝，状态不变 |
| 确定性失败（门禁非零退出、worker 报告 failed） | 终态化并进入批次重试 |
| 不确定结果（派发后失联、崩溃点在效果落地前后） | 不得终态化；由 Ordarium reconcile 收敛 |

`status()` 不因调度校验失败而抛出：调度器拒绝推进时 `resume.action` 报告 `blocked` 及原因。

## 5. 确定性约束

- 所有写入必须经 `EventStore.append`；不要直接写业务表。
- 时钟与身份注入；测试使用 `FakeClock`/`ManualClock` 控制时间。
- 修改事件或序列化结构的提交必须通过 `test/parity.fixture.test.ts`（与基线 fixture v2 逐字节一致，含 genesis 阶段图声明）。
- 新增字段遵循工程规格 §9.2 的加法可选字段规则（缺省省略序列化、解析器保留未知可选字段）。

## 6. 测试

```bash
corepack pnpm run build
corepack pnpm exec vitest run
```

`FakeGitPort` 提供 `queueGateOutcome` / `setGateOutcome` 用于脚本化门禁结果；`@ordarium/testing` 的 `FaultInjector` 与 `ManualClock` 用于崩溃注入与租约过期测试。
