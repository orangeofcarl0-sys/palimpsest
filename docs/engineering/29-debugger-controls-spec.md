# Debugger 控制面 v1 规格（任务级断点挂起）

> **Spec ID**：`PLMP-DEBUG-1` ｜ 状态：**已交付**（2026-09-07；演进线 G8 批次①，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §7；验收 DBG-A01–A05 全绿〔51 文件 / 305 测试〕+ 浏览器冒烟：挂起/放行按钮与 held 徽章、held 任务在推进中保持 READY）
> **权威序**：控制映射以 17 号 VIS-2 为基（1:1 委托、加法式扩面）；调度以 27 号为准；系统设计与 SDS-4 例外以 03 号为准。
> **总纲**：调试器控制逐项立项、逐项回答七问（是否改 canonical / 是否产事件 / 是否 revision 敏感 / 是否需证据 / 是否需宿主批准 / 是否 crash-safe / 是否触 Ordarium）。本批次只落**任务级断点挂起（hold）**——七问全能诚实回答的最小原语。

## 1. Scope：任务级 hold（断点）

### 1.1 七问裁决

| 问 | 裁决 |
|---|---|
| 改 canonical？ | 不改 ProjectIR/任务状态机——hold 是调度门，被挂任务保持 READY/BLOCKED 原态 |
| 产事件？ | **是**：新事件 `HOLD_SET {task_id, reason, declared_by}` / `HOLD_CLEARED {task_id, reason}`（EVENT_TYPES 34→36；控制面必须可审计，故上账） |
| revision 敏感？ | hold 按 task_id 锚定，跨 plan 修订存活（治理动作、账上可见）；不绑定 revision（控制面非数据面） |
| 需证据？ | 否（纯调度门，非结果判定） |
| 需宿主批准？ | serve token 门内（与既有控制同权限面）；宿主策略可另加 |
| crash-safe？ | hold 是投影表（`task_holds`，M6）——重启经 projector 重建，before/after durable 语义与既有声明事件同款 |
| 触 Ordarium？ | 否（零外部副作用） |

### 1.2 语义

- `HOLD_SET`：task 必须已在 ProjectIR 声明；同 task 重复 set＝覆盖 reason（投影 upsert，事件链保留全史）。
- `HOLD_CLEARED`：必须存在 hold；清错＝fail-closed。
- 调度：READY 激活与 BLOCKED 解锁扫描**跳过被 hold 任务**（held READY 不激活、held BLOCKED 不解锁；其余任务不受影响——与项目级 PAUSED 互补：PAUSED 停全项目，hold 停单任务）。
- VIS：`GraphTask.held?: boolean`（加法式，缺省省略）；控制映射加法式扩面 `holdSet(taskId, reason)` / `holdClear(taskId, reason)`（恰委托一个新 controller 方法，17 号纪律）。

### 1.3 批次内其他控制的裁决（不做，理由登记）

- **cancel activation**：已有路径——`report(workerStatus:"cancelled")` → `ATTEMPT_CANCELLED`（既有事件/状态机）；不新增面。
- **retry activation**：调度已自动重试（批次失败→TASK_READY 回退，预算内）；手工 force-retry 需绕预算＝治理面扩展，推迟。
- **fork / replay from checkpoint**：replay 已由事件链确定性 + fixture 覆盖；fork＝新项目副本独立立项（内核扩展队列）。
- **bypass / force route / inject message**：依赖 Router/typed-edge 语义（未立项）；推迟。

## 2. 合同触点 / 迁移 / digest

- **EVENT_TYPES** 34→36（新事件类型不动既有事件字节；canonical 键序 ⇒ 既有 fixture/digest 零扰动；新事件仅新项目产生）。
- **M6**：`task_holds` 投影表（新表、空表基线；既有库前向迁移；parity/replay fixture 不含 HOLD 事件 ⇒ 逐字节不变）。
- GraphTask 加法式 `held?`；控制面加法式两 op。**无版本 bump、无 fixture 再生**（SDS-4 例外论证同 27 号）。

## 3. 验收

| 项 | 断言 |
|---|---|
| DBG-A01 | hold set/clear 落账 + 投影；store 关闭重开后 hold 仍在（crash-safe）；重复 set 覆盖 reason、事件链保留 |
| DBG-A02 | 调度：held READY 任务在并发容量内也不激活；release 后激活；held BLOCKED 不解锁；其余任务照常 |
| DBG-A03 | fail-closed：对未声明 task setHold 拒；无 hold clearHold 拒 |
| DBG-A04 | VIS：`held` 徽章投影正确（缺席省略）；术语隔离守门原样 |
| DBG-A05 | serve 控制：holdSet/holdClear 经控制面 1:1 委托；零外部副作用 |
| 浏览器 | live 冒烟：挂起任务 → 机械推进不激活 → 放行 → 激活；held 徽章可见 |

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-DEBUG-1，G8 批次①）：任务级 hold（HOLD_SET/HOLD_CLEARED + M6 task_holds + 调度门 + VIS held + 控制面两 op）；批次内其余控制（cancel=既有 report(cancelled) 路径、retry=自动回退、fork/replay/bypass/inject）的推迟裁决与理由登记。 |
| 2026-09-07 | **交付**：EVENT_TYPES 34→36（HOLD_SET/HOLD_CLEARED + normalizeEventPayload 两 case）+ M6 `task_holds` 投影表 + projector upsert/delete + 调度 READY/BLOCKED 双门跳过 held + `controller.setHold/clearHold`（先验声明、clear 需在持）+ VIS `GraphTask.held` + 控制面/serve `holdSet/holdClear` 两 op + 面板挂起/放行按钮与徽章；DBG-A01–A05 全绿（含 store 重开重建 hold 的 crash-safe 断言、 held-BLOCKED 依赖满足仍不解锁的完整晋升驱动）；既有 301 项原样绿＝零扰动实证；浏览器冒烟通过。 |
