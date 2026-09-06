# 可视化编排面规格（只读图投影 + 控制映射，Context 之外的第二呈现基座）

> **Spec ID**：`PLMP-VIS-1` / `PLMP-VIS-2` ｜ 状态：**已交付**（2026-09-07 `3d75416`，出口 SDS-19）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；术语隔离红线以 03 `[SDS-18]` 为准；素材母体＝用户愿景表述（易用/可视/可控；"像笔记软件管理知识图谱一样可视化管理多 agent 信息流工作流"，2026-09-07）。本文＝编排状态可视化的**内核侧数据与控制契约**；客户端渲染（dshweb / dshtui / dsh-winui）为适配线，不在本文范围。
> **修订记录**：`VIS`＝初版冻结（2026-09-07）：四项用户裁决（VIS-1/2 内核面先行、双图主形态＝计划图+运行时间线、渲染器为同一契约的适配器）；图投影形状、事件游标、控制映射表、验收 VIS-A01–A07。

---

## 0. 立项与边界

愿景三需求：**易用、可视、可控**。本规格只做内核侧两件事：

1. **VIS-1 只读投影面**——把既有投影（任务/attempt/证据/晋升/清单/遥测）重整为图渲染所需的 nodes+edges+timeline，纯只读，零契约触碰；
2. **VIS-2 控制映射面**——把图上的控制动作 1:1 映射到既有 9 工具/CLI 同源的 controller 方法，零新语义。

**渲染器适配原则**：一个数据契约、三个客户端（dshweb 图面板、dshtui ASCII 图、dsh-winui 描述符面板）。内核不感知任何客户端；宿主接入细节（ui-slots/描述符/网关端点）按宿主 alpha.5 契约另行核验（dsh-winui 项目已有同类审计方法），不进本文。

**为什么这层很薄**：palimpsest 的全部 agent 工作状态已是事件溯源投影——任务图 `depends_on` 即边、attempt 即工作徽章、证据即支持关系、上下文清单（CTX-2 requirement 四类）即每个 agent 的信息流接线表。可视化 = 投影重整 + 渲染，不需要新内核机制。

## 1. 形状

### 1.1 图投影（VIS-1，纯函数式只读投影）

```ts
interface OrchestrationGraph {
  project: {
    projectId: string;
    revision: number;
    goal: string;
    paused: boolean;
    /** 单调游标（事件计数 + 项目修订复合）：客户端据此廉价轮询（未变则跳过重渲染）。 */
    cursor: number;
  };
  /** 双图之一：计划图。节点 = 任务；边 = depends_on（信息流主干）。 */
  tasks: ReadonlyArray<GraphTask>;
  promotions: ReadonlyArray<GraphPromotion>;
}
interface GraphTask {
  taskId: string;
  objective: string;
  state: "READY" | "ACTIVE" | "VERIFYING" | "SATISFIED" | "FAILED" | "STALE";
  role: string;
  dependsOn: readonly string[];
  writePaths: readonly string[];
  requiredArtifacts: readonly string[];
  attempts: ReadonlyArray<GraphAttempt>;
}
interface GraphAttempt {
  attemptId: string;
  state: "READY" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED" | "STALE";
  /** 归因（若 claim 时宿主供给）：渲染为 worker 徽章与成本标注。 */
  attribution?: { readonly model: string; readonly cost: number } | undefined;
  /** 证据 id 列表（支持关系渲染为刻痕）。 */
  evidence: readonly string[];
  contextManifest?: string | undefined;
  /** 双图之二：运行时间线。该 attempt 的关键事件人话摘要序列（含重试链）。 */
  timeline: ReadonlyArray<{ readonly at: string; readonly label: string }>;
}
interface GraphPromotion {
  promotionId: string;
  attemptId: string;
  state: "PREPARED" | "COMMITTED" | "FAILED";
}
```

硬规则：

- **术语隔离红线（机器守门）**：投影 JSON 不得含 `event_id`、`event_digest`、哈希链字段；用户语言只有 goal/task/attempt/verified（`[SDS-18]`）。`task_id`/`attempt_id`/`evidence_id` 属用户语言（`resume` 先例）。`cursor` 为不透明轮询游标（数值），非事件暴露。
- **时间线人话化**：`timeline[].label` 为渲染层直用的摘要（如 "claim → 工作提交 a7b577d"？——**否**：短哈希也不出。应为 "已认领" / "工作已提交" / "门禁证据已记录" / "已晋升"）。
- **确定性**：同库状态双调用全等（除时间戳字段外的结构确定性；时间戳来自事件本体，天然确定）。
- **重试链可见**：同任务多 attempt 按 event 序排列，STALE/EXPIRED 徽章化——双图之时间线判据的数据基础。

### 1.2 控制映射（VIS-2，1:1 零新语义）

| 图上动作 | 控制操作 | 精确调用的既有方法 |
|---|---|---|
| 暂停 / 恢复 | `pause(reason)` / `resume(reason)` | `controller.pause` / `controller.resume` |
| 推进（机械臂） | `run(maxSteps, attribution?)` | `controller.runTurn` |
| 单步 | `next()` | `controller.step` |
| 认领 | `claim(attemptId?)` | `controller.claim`（缺省走 tournament 选优，同 CLI） |
| 记录证据 | `gate(attemptId, predicate, exitCode, command?)` | `controller.gate` |
| 上报 | `report(attemptId, status, summary, commit?)` | `controller.report` |
| 晋升 | `promote(gateId)` | CLI promote 等价路径（`promoteWhenGatePasses` + 真实 expectedHead） |
| 修订计划 | `plan(proposal)` | `controller.plan`（ARCH 校验面先行，见 18 号） |

硬规则：每个控制操作**恰好**调用一个既有 controller 方法（映射表测试在案）；权限与审批留给宿主面；工具/CLI 面零改动。

## 2. 无兼容层

- 纯加法：新只读投影 + 新控制映射；`status`/7 工具冻结集/事件契约零触碰。
- 不引入 SSE/WebSocket——传输归客户端（宿主客户端自有通道）；内核只供 `orchestrationGraph()` + 游标，轮询即实时（图小，全量刷新成本可忽略）。
- 渲染器适配器不在内核仓；内核对客户端零依赖（依赖方向红线）。

## 3. 验收

| ID | 判据 | 断言 |
|---|---|---|
| VIS-A01 | 投影完备一致 | 演示状态 → 图节点/边/状态与 `status` 同源一致；双调用确定性 |
| VIS-A02 | 双图数据齐备 | 计划图（depends_on 边）+ 每attempt 时间线（created/claimed/工作提交/证据/晋升序列，重试链可见） |
| VIS-A03 | 术语隔离 | 投影 JSON 键集合无 `event_id`/`event_digest`/任何哈希字段（机器断言） |
| VIS-A04 | 只读性 | 投影调用前后事件数与 snapshotDigest 不变 |
| VIS-A05 | 控制映射 1:1 | 每控制操作恰调用一个既有方法（映射表测试）；pause→gate→promote 经 surface 走通全循环 |
| VIS-A06 | 修订可见 | plan 修订后图反映新 revision 任务集 |
| VIS-A07 | 归因徽章 | 带归因 claim 的 attempt 渲染数据含 model/cost；无归因缺席（键不存在） |

交付出口：全量 `pnpm check`；03 SDS bump；00/01 登记行；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-VIS-1/2）：四项用户裁决（内核面先行、双图主形态、渲染器适配原则、单契约三客户端）；图投影/游标/控制映射/验收 VIS-A01–A07。 |
| 2026-09-07 | 交付（`3d75416`，出口 SDS-19）：全部验收通过（41 文件 / 237 测试），03/00/01/索引登记完成。归因徽章语义按 ALC-1 精确化：徽章为在途事实，gate 判定恰好消费一次（VIS-A07 断言含"报告≠消费"）。 |
