# 呈现适配线规格（serve 通道面 + 共享图面板 + 终端图 + WinUI 描述符契约）

> **Spec ID**：`PLMP-WEB-1` / `PLMP-WEB-2` / `PLMP-TUI-1` / `PLMP-WINUI-1` ｜ 状态：**冻结**（2026-09-07，五项用户裁决入场；交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：数据/控制契约以 `17-visual-orchestration-spec.md`（PLMP-VIS-1/2）为准；架构提案面以 `18-architecture-modes-spec.md`（PLMP-ARCH）为准；宿主接入模型以 dsh-winui `EXTENDING.md` 三路模型（路 A 命令/工具/网关端点、路 B 数据描述符、路 C 回退打开插件 Web 界面）与 `audits/alpha5-contract-analysis.md` 通道契约为准；术语隔离红线 `[SDS-18]` 延伸到全部呈现面。
> **修订记录**：`WEB/TUI/WINUI`＝初版冻结（2026-09-07）：五项用户裁决（**serve 先行＋宿主内通路并行**、**React + React Flow**、**手搓 V1＝图上直接编辑**、交付顺序**面板→TUI→WinUI**、自动架构入口＝向主代理会话预填架构师指令〔设计定案〕）；验收 WEB-A01–A06 / TUI-A01 / WINUI-A01。

---

## 0. 立项与边界

愿景三需求（易用/可视/可控）的**呈现侧**。数据与控制的内核契约已交付（17/18 号），本规格只做适配：**一个面板、三条通路、一个终端 UI**——

```
              ┌── 共享图面板（WEB-2，一次构建）──────────────┐
              │ 双图 + 架构栏 + 控制就地化 + 手搓编辑        │
              └──┬─────────────┬─────────────┬─────────────┘
   通路① 独立 serve   通路② 宿主内网关      通路③ winui 描述符
   palimpsest serve   插件网关端点+静态资产   session.panel（数据+命令引用）
   localhost+token    （外部门控：公共 DSH    + 路 C 回退打开完整面板
   （今天可跑）         manifest，P0 审计件）  （实装主体在对侧仓）

   + PLMP-TUI-1：palimpsest tui —— 同一契约的 ANSI 双图 + 键位控制（仓内）
```

**边界（仓内 vs 跨仓 vs 外部）**：

| 件 | 归属 |
|---|---|
| `palimpsest serve`、共享图面板、`palimpsest tui`、描述符**生成器** | 本仓交付 |
| dsh-winui 的 `session.panel` 实装 | 对侧仓（dsh-winui 项目，跨仓协作件） |
| dshweb 原生挂载（插件静态资产/面板机制） | **P0 审计件**——依赖公共 DSH manifest / alpha.5 契约核验（复用 dsh-winui 审计方法）；机制存在→面板挂原生壳，不存在→URL 打开（路 C 先例同构） |

**无 daemon 原则边界声明**：serve 是**附加呈现面，不是编排守护**——编排真相在账本，serve 进程死对项目零影响，重开即重投影；单写者纪律与 CLI 相同（同一时刻一个前端驱动编排，多读者无碍）。

**自动架构入口（设计定案）**：面板"从需求生成"按钮 = 向主代理会话**预填架构师指令**（架构师就是主代理，对话是它的工作台）→ 提案 JSON → 面板校验 → 人话卡片确认 → 声明。控制权全程在人；独立 serve 部署下无会话可填，按钮降级为"生成架构师指令并复制"。

## 1. 形状

### 1.1 PLMP-WEB-1 通道面（serve）

```text
palimpsest serve [--port N] [--host H] [--token T]
  缺省：绑 127.0.0.1，端口固定缺省值，token 随机生成并打印（每次启动不同）；
  --host 显式才可放开绑定面。全部端点要求 token（Authorization: Bearer 或查询参数）。
```

| 端点 | 语义 | 委托 |
|---|---|---|
| `GET /api/health` | `{ok, cursor}` | orchestrationGraph 游标 |
| `GET /api/graph?cursor=N` | `{graph, changed}`——游标未变 `changed:false`（廉价轮询） | `orchestrationGraph()`（VIS-1） |
| `POST /api/control/<op>` | op ∈ pause/resume/next/run/claim/gate/report/plan/promote；body＝参数 JSON | VIS-2 控制映射面，**1:1 零新语义** |
| `POST /api/proposal/validate` | body＝ProjectProposal → `{diagnostics}` | ARCH 校验器 |
| `POST /api/proposal/declare` | 校验空诊断才声明（start/plan 既有通道）→ `{eventType}` | ARCH 声明面 |
| `GET /`（及静态资产） | 共享图面板 bundle | WEB-2 产物 |

硬规则：**术语隔离延伸到 HTTP 面**——响应 JSON 零 event_id/哈希（数据层 VIS-A03 已守，本层复检）；错误以人话呈现（`{error}`），技术细节留在账本；宿主内部署时同形状端点挂 `/api/gateway/…`、鉴权换宿主 `dsh-auth-*`（形状不变，鉴权换源）。

### 1.2 PLMP-WEB-2 共享图面板

- **技术栈（用户裁决）**：React + React Flow（力导向布局），构建产物＝静态 bundle（`dist/web/`），由 serve 静态供给；构建链独立于内核 `tsc -b`（`build:web` 单独 script，`pnpm check` 保持内核范围不被面板构建拖累）。
- **双图（用户裁决）**：计划图主视图（任务节点按状态着色 READY/ACTIVE/VERIFYING/SATISFIED/FAILED/STALE + `depends_on` 信息流边 + attempt 徽章）＋ 时间线侧栏（选中任务/attempt 的人话时间线，重试链可见）。
- **架构栏**：预设流水线模板卡片（参数化阶段）/ "从需求生成"（预填架构师指令，见 §0）/ 手搓模式。
- **手搓编辑 V1（用户裁决：图上直接编辑）**：连线建依赖、节点面板编辑 title/writePaths/requiredArtifacts/gateId → 产出 `ProjectProposal` → 面板内校验 → 人话 diff 确认 → declare。非法提案零落账（数据层守门）。
- **控制就地化**：选中节点详情面板（attempt 徽章/证据/清单/遥测）+ 控制按钮（pause/resume/next/run/gate/promote）→ `/api/control`。
- **鉴权交互**：首次打开输入 token（存 localStorage）；401 → 重新输入。

### 1.3 PLMP-TUI-1 终端图

`palimpsest tui`：ANSI 双图（任务树状态着色 + 选中 attempt 时间线窗格）+ 键位（`p`/`r` 暂停恢复、`n` 单步、`q` 退出；V1 只读为主 + 暂停/恢复/单步三个控制键）；**零新依赖**（手写 ANSI，不引 TUI 框架）；数据/控制进程内直调 VIS-1/2 面（不经 HTTP）。

### 1.4 PLMP-WINUI-1 描述符契约

- `session.panel` JSON（路 B）：状态用数据描述（任务/attempt 人话摘要、状态、游标），行为用**命令引用**（斜杠命令名，函数不跨进程）；完整图交互走路 C 回退打开面板 URL。
- 本仓交付：描述符 schema + 生成器（`orchestrationGraph() → panel JSON`，纯函数）；实装主体在 dsh-winui 仓（跨仓协作件，登记于边界表）。

## 2. 无兼容层

- serve/面板/TUI/描述符生成器全部加法；VIS-1/2 与 ARCH 面零改动（纯复用）。
- 面板构建链独立（`build:web`），不触碰内核构建与 `pnpm check` 范围。
- 通路②被公共 DSH manifest 门控——不为其预写宿主侧代码（外部门控在案，形状已冻结：同端点换鉴权源）。

## 3. 验收

| ID | 判据 | 断言 |
|---|---|---|
| WEB-A01 | 只读面同源 | `GET /api/graph` 与进程内 `orchestrationGraph()` 一致；游标未变 `changed:false` |
| WEB-A02 | 控制面全循环 | 经 HTTP 走 pause/resume/next/gate/report/promote 全循环（真 rig + token）；无 token 401 |
| WEB-A03 | 提案面 fail-closed | validate 诊断与进程内一致；declare 非法提案零落账（事件数不变） |
| WEB-A04 | 呈现面定位 | kill serve → 账本零影响（事件数/snapshotDigest 不变）；重启重投影一致 |
| WEB-A05 | 安全缺省 | 缺省绑 127.0.0.1；token 每次启动随机 |
| WEB-A06 | 面板供给 | `build:web` 产出 bundle；`GET /` 返回 200 HTML 引 bundle；bundle 渲染源零 event_id/哈希 |
| TUI-A01 | 同源 + 键位 | tui 帧渲染与 graph 同源（任务状态/时间线标签）；pause/resume/next 经 VIS-2 面落账 |
| WINUI-A01 | 描述符纯数据 | 生成器输出为纯数据 + 命令引用（schema 断言：无函数/无代码跨进程） |

交付出口：全量 `pnpm check`（内核）+ `build:web` 产出 + serve 集成测试；03 SDS bump；00/01 登记行；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-WEB-1/2 + PLMP-TUI-1 + PLMP-WINUI-1）：五项用户裁决（serve 先行＋宿主并行、React+ReactFlow、手搓 V1 图上直接编辑、面板→TUI→WinUI、自动架构入口＝主代理会话预填）；端点形状、面板蓝图、验收 WEB-A01–A06 / TUI-A01 / WINUI-A01。 |
