
# GitHub 自维护试点

这个宿主把 GitHub Issue 和 PR 关联到同一维护项目的原生 Work。测试查证和复测、维护候选、独立验收和换版各有回执。常驻宿主从 SQLite 读回项目、活动安装物和外部动作。在真实 GitHub 轮次中，Owner 按最新的精确候选 SHA 合入；运行位从实际合入的 Git 对象重建。

## 零付费资格

用已提交的分支头运行以下命令。需要 Node 24.15 或更新版本，以及本地 PNWF 容器镜像。运行目录应在 Docker Desktop 可访问的驱动器上，并为一个全新目录。

```powershell
node node_modules/typescript/bin/tsc -b
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs qualify <new-run-directory>
```

可用 `PALIMPSEST_GITHUB_IMAGE` 指定已封存的镜像摘要。资格使用本地 bare Git、模拟 GitHub、普通 DSH 和 Mock Provider。候选在真实 Git 副本提交，模拟所有者按候选树创建不同的主线 SHA。两次实际冷构建后，从被激活的新版本代码读回同一项目。回执 `qualification.json` 包含源树、候选、合入与安装物 SHA、账本摘要和 SQLite 事件。新资格绑定运行代码所在的 Git 树。

## 正式运行位

宿主侧 `serve <plan.json>` 需要以下输入。

| 配置 | 受信来源 |
| --- | --- |
| `scope` | 正式仓库 `orangeofcarl0-sys/palimpsest`、仓库 ID `1340337791`、`base: "main"`、归因集成 ID `15368`、独立 `publisher` Bot、唯一 `projectId`、`paid-usage-only` 与冻结 `window` |
| `root`、`archive` | 独立运行位与冻结证据目录。此处保存项目库、候选、验收和每场逐请求账本 |
| `initial`、`image`、`qualification` | 基础设施的实际主线完整 SHA、安装镜像摘要与同 Git 树零付费资格 |
| `grant`、`providerProbe` | 位于证据根的所有者委托与已结算的 OpenCode Go 探针。委托绑定仓库、项目、初始 SHA、工单 ID 顺序和资源窗口，每场重新核对 |
| `githubApp` | App ID、安装 ID 和证据根里的受控私钥。安装只覆盖正式仓库。授权范围为 Contents/Issues/Pull requests 可写与 Checks/Statuses 可读 |
| `author` | 仓库归因策略允许的提交 Git 姓名与邮箱 |
| `work` | 一条 `evidence` 和一条以首项为 `after` 的 `direct` 工单。每项提供 `id`、`title`、公开 `publicBody`、模型的 `goal`、文件名和 SHA-256 清单 `files`、顺序清单摘要 `evidence`、允许的 `paths`、必须提交的 `artifacts`、宿主独立 `probe`。证据发现项另给原结果文件名 `discovery` |

在安全的宿主文件中保存计划、私钥、模型配置、冷检出探针和原始证据。模型只看到选定的证据文件和标注为非授权来源的 Issue 回复，无 GitHub 凭据。公开同步使用计划中审定的文字和摘要。独立验收以退出码 1 表示原缺口可复现，以退出码 0 表示候选通过。

`inspect <plan.json>` 读取运行位活动版本与 Work 状态。到 `WAITING_FOR_OWNER` 时，从核验结果读取完整 PR 头和当前基线，走仓库既有正式合入规则。已合入的运行版本还需通过冷构建、实际读回和独立复测后才写回 Issue。由远端或本地中断造成的未确认动作显示在 Work 的等待依据中，先对账再继续。

## 首轮证据

A 的原运行保存候选 `248a97730fb3e74948d0b56239876fcd01bbee4a`，59 笔全结算，自然退出。原运行汇总为通过。逐调用复算确认实际 `pulse` 成功，结论字段为空。这个现场验证运行结束、候选保存和正式交付的分界。B 的历史准入候选 `3f306c02` 独立验收 12/14，有限委托曾接纳无上限窗口，合法回执重启后曾因字段错配无法消费。两份原判和此前 UNKNOWN 作为冻结输入。

## GitHub 检查关联

首次正式 PR #297 的送审头 2302c5cc 的 CI 16/16。读取 GitHub Checks API 时，PR 头有 15 个通过的 Actions check run，虚拟测试合并提交上有 0 个，归因 status 单独附着在 PR 头。门禁先固定仓库、当前基线与候选，再核对两种允许的 Git 关联和 Actions 身份，在回执写明实际检查所挂的 SHA。

## 已结算候选的续修

首项登记在原 Issue。宿主可用受信配置中的一次 `recovery` 接续已经完整结算、因缺候选交付回执而拒绝的 Work。配置绑定原候选、封存回执和检查点摘要、基于原候选的准备提交、Git bundle 与同源零付费资格。原 Attempt 和账本保留，续修使用独立账本并从同一项目状态启动。模型可在首项冻结的路径范围内继续修改，准备提交的范围独立固定。主线保持原基线，核准仍按 CI 通过的完整 PR 头执行。

## 候选验收打回

候选已经提交并记录候选绑定的交付，独立验收有失败时，维护 Work 进入 `RETURNED`。回执绑定 Work、Attempt、基线 SHA、候选 SHA、原账本档案和验收摘要。原 Attempt 的失败结论仍保存在 Slot。无法确认用量、写范围越界、归因不符合和缺交付回执继续走既有门禁。

| 回执路由 | 处理 |
| --- | --- |
| `RETEST_SAME_CANDIDATE` | 宿主确认缺失路径属于封存工单输入或基线中未变的归档。Evidence 恢复输入，用同一候选执行独立探针和公开回归。 |
| `REVISE_CANDIDATE` | 维护者接到候选失败回执。范围和验收契约保持一致时，宿主登记同一 Issue 的后继 Work，自动沿用原工单授权和剩余请求数。重复失败沿用调查暂停。 |
| `REVIEW_VALIDATION_CONTRACT` | 原基线的独立探针未复现预期缺口。Evidence 检查验收契约。 |

持有原运行位租约的宿主可对第一类回执执行零付费复验。将请求保存在受信档案目录里。

```json
{
  "work": "release-judge-rubric",
  "receipt": "<inspect 中的完整 reviewReturn.id>",
  "candidate": "<同一候选的完整 SHA>",
  "archiveRoots": ["research-evidence/pnwf-software/2026-11-27"]
}
```

```powershell
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs retest-return <plan.json> <request.json>
```

复验从相同 Git 对象和原冻结探针开始，只补入在基线和候选中 Git 树相同的指定归档。会话材料按原证据摘要核对，经只读卷提供给隔离测试。相同请求用持久回执去重。通过后同一候选进入 `QUALIFIED`，原结果从 `originalReview` 读回。后续发布继续遵循精确头、CI 与所有者核验。

### 打回自动准入与工单预算

新派发的工单持久记录原授权摘要及请求预算。冻结验收打回候选时，宿主沿用原 Issue、活动安装、完整基线、写范围、产物及验收，核对候选 SHA、打回回执、独立调查和原账本后生成续修。每次续修使用独立账本，累计扣除已结算请求。续修的授权仍受原授权有效期和撤销状态约束。重启按已落盘的准入和派发记录接续。旧授权历史缺少该绑定时，已有的单次续修流程继续适用。

同一工单累计 128 笔时，监工读取工作区进展及用量状态，保存一次观测回执。网关按剩余请求数执行累计 256 笔硬上限。每个会话沿用 60 分钟、每笔 240 秒及按量记账，金额和 token 无上限。已知剩余为零时暂停。仅在上一会话用量全结算且归因完整时继承余额。错版本、范围扩大和重复同类失败也会拦截。缺验收材料的同候选复验仍为零模型请求。

已停止的历史工单可以由受信宿主显式封存一笔用量未确认的请求，在新运行位恢复已复验草案。宿主先从只读旧账本核对已派发总数，再将工单 ID、已派发数和封存回执摘要写入原范围授权的 `carry` 字段。旧账本和停点保留。封存请求仍占一个名额，实际用量继续为 UNKNOWN。宿主在入队和发放准入时核对继承数，队列及后续打回沿用同一计数。新会话若再出现用量未确认，继续执行既有停机规则。

冻结探针的同类失败触发 `PAUSED_REPEAT` 后，受信宿主可核对离线复验并提交具体的预期与观察差异。回执绑定候选、基线、原拒绝、探针及复验摘要。恢复事件在原暂停结论之外单独记录，同一回执重启后只登记一次。模型收到相应的契约差异，宿主验收仍使用原冻结探针。后继 Work 沿用原授权、文件范围及剩余请求数。

### 从 `c4d21451` 自动领取 #305

试点宿主以主线完整 SHA、开放 Issue 及冻结工单筛选待办。#298 的 256 笔记录已经封存，余额为 0。#305 的旧候选 `07bbadde00cbd8382b19ff29b6a2cbd81d047bd9` 在旧基线上曾获离线复验 19/19，原验收 4/8 保留。当前主线仍可复现版本化 rubric 摘要缺失，旧候选补丁和复验回执作为跨版本交接证据交给新会话。选择和准入依据由试点宿主持久化，再进入已有的原生 Work、Slot 和预算继承。此轮 GitHub 接口只读。

| 证据 | 结果 |
| --- | --- |
| 零付费资格 | 定向回归 35 项通过、3 项跳过，覆盖重启去重、自动打回及余额继承。普通 DSH Mock 首轮 5 笔，续修自动以 251 笔余额启动，7 笔后通过独立验收并自然退出。 |
| 真实准入 | #305 继承 72 笔已结算请求，首个窗口 184 笔。每会话 60 分钟，单请求 240 秒，按量记账，金额无限额。 |
| 监工 | 本轮第 56 笔使工单累计达到 128。监工看到已修改但未提交的工作区，写入 `CONTINUE_WITH_PROGRESS`，没有额外模型请求。 |
| 真实会话 | 新增 78 笔均已结算并完成归因，95 个工具调用全部配对，耗时 9 分 14 秒。8,229,999 tokens 中 fresh input 160,692、cache read 8,032,000、output 37,307、cache creation 0。工单累计 150/256，剩余 106 笔。 |
| 候选和离线验收 | 会话只改并提交六个允许文件，候选 `8e4aed5e1747a44f41fa955387b3c0987523c0e7` 通过写范围、归因与冻结探针。带完整封存输入的回归为 19/19，只用 Git 跟踪档案时为 16 通过、3 跳过。 |
| 原运行终态 | DSH 自然退出，记录 `CHECKPOINT`。因没有绑定候选的 `DELIVER`，正式验收为 `REJECTED / candidate-bound-delivery`。失败调查已登记为 `REVIEW_REQUIRED`。重启后读回同一结果，仍只有一次消费和派发。 |

模型第 13 笔应用旧候选补丁，随后修订并测试。第 60 笔调用 `start`，工具提示需要委派到隔离写入位置；轨迹中没有 `delegate`。模型第 67 笔使用 Git 直接提交，第 69 笔 `complete` 返回 `NO_RUNNING_ATTEMPT`。第 70 笔 readiness 看见 `DIRECT_AHEAD` 却返回 `CONTINUE_WORK`。随后退役计划被静止检查拒绝，第 73 笔 `DELIVER` 明确列出 `ACTIVE` 任务和未观察到宿主作业的 `CREATED` Attempt。第 74 笔 `stop` 找不到宿主作业，第 77 笔记录 `CHECKPOINT`。这些事实把代码验收、收尾引导和未启动 Attempt 的处置问题分开。当时自动返回路径要求候选已记录 `DELIVER`。该原始运行位在独立调查后进入 `REVIEW_REQUIRED`，工单的 106 笔余额随停点保留。

#298 的旧草案、两轮 1/4、第 16 笔 UNKNOWN、256 笔硬停及原账本在本轮前后核对一致。运行脚本、候选 bundle、检查点、账本、原判和原始配对轨迹归档在 F 盘 `experiments/runs/maintenance-next-c4d21451-1795788329546`。[机器核验](../../research-evidence/pnwf-software/2026-11-27/maintenance-next-305/verification.json)

### 未派发 Attempt 的直接交付收尾

#305 第 60 笔预留了 Attempt，直到停机都没有 Worker 领取。直接提交已存在，但原 Work 同时把任务和预留 Attempt 都视为交付阻塞，`stop` 又只能处理在宿主可见的作业。现在宿主用同一份 `directRetirement` 观察向 SDK 状态、DSH 状态、readiness 和 `DELIVER` 拒绝提供收尾参数。只有一个普通 ACTIVE 任务和一个未领取的 CREATED Attempt、干净的直接后继提交包含所需工件且净差异在授权范围时，才给出该观察。正式文件义务继续由原结算与验收路径核验。计划模块从 Work 读取接口取任务状态与授权信封。DSH 适配器声明工具参数，应用层解析收尾观察。

Principal 核对产物后，通过 `plan` 提交 `tasks=[]`、`changeClass=metadata_only` 与原观察。宿主复核项目修订、Attempt 和完整候选 SHA，在同一 Journal 事务内记录取消、任务退役和计划修订。取消无租约、无 Attempt Report。已领取、HEAD 漂移、脏文件和越界会阻断撤销。如果工作区只准备了一半而撤销先提交，后到的领取会被事件门禁拒绝，Worker 拿不到写入位置。Principal 随后显式记录绑定同一提交的 `DELIVER`。这一链路仍由现有独立验收和发布门禁检查。

work-manager 从封存轨迹读取明确的 `DELIVER` 拒绝、单一未派发预留及随后的 `CHECKPOINT`。核对候选写范围和提交归因后，登记 `RETRY_CLOSEOUT`。独立调查确认用量已结算、归因完整且冻结探针通过后，才恢复原检查点和候选并沿用原工单余额准入。重启再读回已签发的准入，改变候选 SHA 则拒绝。自动化回归从已用 150/256 笔恢复 106 笔上限，并验证准入写入后重启仍只派发一次。#305 和 #298 的真实运行位及原判保留。

| 零付费验证 | 结果 |
| --- | --- |
| #305 原档隔离回放 | 两次打开同一检查点，观察一致。Attempt 变为 CANCELLED，任务变为 STALE，同一 `8e4aed5e1747a44f41fa955387b3c0987523c0e7` 得到 `DELIVER`。交付 blob 摘要一致，项目正式 Head 仍为 `c4d21451`。原现场封存摘要一致。 |
| 容器预检首轮 Mock | 旧预检对未领取预留要求物理工作区，0 笔停止于 `WORLD_MISSING`。修复后只对核验为可撤销的 CREATED 预留放行。 |
| 容器反例 | 在隔离的原检查点中登记同一 Attempt 为 RUNNING，再缺工作区启动，仍在 0 笔时被 `WORLD_MISSING` 拦住。 |
| 普通 DSH Mock | 按 106 笔窗口启动。第 1 笔 readiness、第 2 笔按返回观察退役、第 3 笔记录 `DELIVER`，第 4 笔自然退出。四笔全结算，模拟剩余 102 笔，真实 #305 仍为 106 笔。 |

本阶段覆盖从未派发与领取并发的边界。已派发后失联 Worker 的跨宿主恢复需要单独核验持久作业归属、写者失效及末次结果。运行脚本、账本和回执保存在 F 盘 `experiments/runs/worker-direct-closeout-305`。[核验记录](../../research-evidence/pnwf-software/2026-11-27/worker-direct-closeout/verification.json)

### 已派发 Worker 的跨宿主恢复

正式派发在调用 Worker 之前，把项目、原 Attempt、任务、派发实例、宿主启动标识、作业号和执行端口绑定写入项目 SQLite。同一 Attempt 的派发记录唯一。宿主重启后，`workers` 从数据库显示记录的归属、停写状态和已收到的候选。进程内的作业表仍用于当前宿主的轮询与停止请求。旧记录缺少派发绑定时，继续沿用原归因语义。

在接管时，`relay relayRoute=takeover` 可按 `attemptId` 绑定原尝试。只有原宿主已持久化有效结束回执，或同一执行后端的宿主侧 `recover` 返回与原派发完全一致的 `STOPPED`，才能接管。后端应保证该次派发已停写且不能重新启动。超时、连接断开、查无本地作业、Principal 的弃置声明和错归属回执均无法放行。后端未提供独立退出证据时，裸 DSH 子进程失联后保持待确认。当前恢复以可访问同一项目数据库与隔离工作区为前提。

有 Worker 结果时，结算仍绑定原 Attempt 和退出回执里的完整候选 SHA，继续经过 Git、写范围、基线、完成验证和接收边界。只有停写凭据时，Principal 可以结算自己核对过的成果，归因为 Principal 恢复。退出和结果先于结算持久化。若旧宿主的回调随后到达，同样的完整 SHA 读回原结算，其他候选不得覆盖原报告。已完成后的定向恢复直接读回报告，不再推进调度或写归因备注。

| 零付费 Mock | 观察结果 |
| --- | --- |
| 传输失联后重启 | 读回原派发，缺停写证明和错归属证明均拒绝。正确回执后在原 Attempt 结算。 |
| 旧回调晚到 | 第二宿主依据绑定回执先结算，旧回调读回同一候选。 |
| 仅证实停写 | 按 Principal 恢复归因结算，无独立 Worker 生产资格。 |
| 退出已落盘、结算前中断 | 新宿主用持久回执恢复原候选，原 Worker 归因保留。 |

每个场景都经再次重开并并发重复恢复。Worker 实际调用、`ATTEMPT_CREATED` 和 `ATTEMPT_COMPLETED` 各一次。#305 的 78 笔结算及归档摘要可重新计算，原拒绝、`CHECKPOINT` 和 106 笔余额照存。#298 的十份封存摘要一致。[零付费资格记录](../../research-evidence/pnwf-software/2026-11-28/worker-dispatch-recovery/verification.json)

### #305 从原 CHECKPOINT 结清

运行宿主由主线 `f46908ff95d2800cff37849c88a9053e4ffed662` 在原镜像冷构建，构建摘要为 `627bf560cf048f7d181820975c6f651b8c6c54e158a1780e46bb35d76b36daa0`。Work Manager 的单次续修入口调用现有 Slot 准入、派发和结算，按原账本继承 150 笔。恢复同一项目的原 `CHECKPOINT`、项目基线 `c4d2145161bd8231c38e418b9c709d14a31f7773` 和待交付候选 `8e4aed5e1747a44f41fa955387b3c0987523c0e7`。续修使用隔离 Slot，原运行位、原拒绝和历史监工回执保留。GitHub 仅用于读回当前主线和工单身份。

| 核验 | 观测 |
| --- | --- |
| 零付费 Mock | 准入落盘后重启。普通 DSH 4 笔全结算，按 readiness 退役并记录 `DELIVER`，自然退出。结算已落盘但队列尚未写回时结束进程。两次重开后仍只消耗一个准入、派发一次、结算一次和写入一次验收，账本摘要一致。 |
| 真实轨迹 | 第 1 笔读 Pulse，第 2 笔读 readiness 并核对候选。第 3–5 笔查档、核对摘要和 Git 对象，第 6 笔所跑的 7 项测试全部通过。第 7 笔使用 readiness 回传的参数撤销未派发预留并退役，第 8 笔复读 readiness，第 9 笔记录 `DELIVER`，第 10 笔自然退出。17 个工具调用全部配对，10 笔请求全部归因。 |
| 独立验收 | 原基线在冻结探针上退出 1，同一候选退出 0。六个原授权路径、提交归因和文件树 `48b3534da345525d5ff8559141462f4c25520af3` 核对通过。宿主普通公开回归 4 通过、3 跳过，挂封存输入的离线复验 19/19。交付事件 `pjer-9071fd6fba3dd4884a7b2c4a59ec7218` 的工件 SHA 和 blob 摘要与候选一致。 |
| 用量与重启 | 按量窗口上限为剩余 106 笔，60 分钟，单笔 240 秒。真实新增 10 笔全部结算，耗时 97.867 秒。267,247 tokens 中 fresh input 39,451、cache read 223,104、cache creation 0、output 4,692。累计 160/256，余额 96。原第 128 笔监工回执已核对，本轮未再次触发。冷重开复验账本摘要一致，派发和结算仍各一次。 |

原会话的 `REJECTED / candidate-bound-delivery` 和 `CHECKPOINT` 都照存。#298 的十份封存摘要逐项核对一致。Docker Desktop 的 F 盘绑定失败后改用 C 盘临时挂载，账本、状态、Git bundle、归因轨迹和重启日志归档在 F 盘 `experiments/runs/issue305-checkpoint-f46908ff`。[复算记录](../../research-evidence/pnwf-software/2026-11-28/issue305-checkpoint/verification.json)

### #305 已验收版本移植到主线

Work Manager 的离线移植入口按 #305 原工单授权读取已验收候选 `8e4aed5e1747a44f41fa955387b3c0987523c0e7`，在主线 `dfbaff49bd9ecfa46f90331559b7573c7b0984a0` 上重放为 `4b1b45c09f4fef7e3a92315ad333aeea13b72e37`。新旧基线的六个授权条目一致，移植提交只改这六个文件，结果的 Git blob 和文件模式逐项与原候选相同。另行提交报告、机器证据和 handoff。

- 在原冻结镜像中按完整 Git SHA 冷检出。原主线在冻结探针上退出 1，复现活动 rubric 摘要缺失。移植提交退出 0，探针输出摘要与原验收一致。
- 稀疏检出公开回归 4 通过、3 跳过。挂载原封存证据后，正式回归 19 通过、0 跳过、0 失败。验证容器禁用网络，新增付费请求 0。
- #305 原 `REJECTED / candidate-bound-delivery`、`CHECKPOINT`、续修 `DELIVER` 和账本原样保留。续修的交付回执继续绑定原候选。工单累计 160/256 笔，余额 96。前后核对 #298 十份封存摘要，全部一致。

[机器核验](../../research-evidence/pnwf-software/2026-11-28/issue305-main-port/verification.json)保存两侧 SHA、六文件对象、冻结探针和回归摘要。可复算运行脚本、Git bundle 和完整测试日志归档到 F 盘 `experiments/runs/issue305-main-port-dfbaff49`。

### #305 冷启动复验与 GitHub 结清

从已合入的 `f6401b734d20ad5b7fd45c5efb33cc4e2311aba3` 冷构建维护宿主，构建摘要为 `b692d52f37c1a21147baaeec82672def8690adccdaf79c992430201ff548c054`。Work Manager 的受信归档导入入口核对 PR #313 的核准 SHA、合入树、主线检查和六个文件条目。在新的运行位保留原 Work 的拒绝，从续修检查点接入现有激活及复验。按相同项目 ID 读回原 Journal 和 `DELIVER`，对实际主线重新执行原冻结探针，输出摘要与原候选一致。原主线 19/19 带档复验另有发布回执。

#305 原 `REJECTED / candidate-bound-delivery`、`CHECKPOINT` 和续修 `DELIVER` 照存，账本累计 160/256、未用余额 96。维护 App 由本地 `VERIFIED` 投递一条公开状态评论并以 `completed` 结清。重启按评论 ID 和关闭事件 ID 读回，写入 0 次。#298 的 GitHub 状态、评论、标签和十份封存摘要均一致。[结清评论](https://github.com/orangeofcarl0-sys/palimpsest/issues/305#issuecomment-7227473077) · [机器证据](../../research-evidence/pnwf-software/2026-11-28/issue305-cold-close/verification.json)

### 下一张维护工单 · 外部合入的归档候选接入 Work

开放列表仅 #298，已封存且余额为零。Work Manager 从本次实际结清选择本地工单 `archived-port-native-intake`。原生常驻流程不会从终态拒绝自行发现已合入的归档移植。把已合入 PR 交给缺少本地精确头验收的正常 CI 路径时，现有门禁返回 `MERGED_BEFORE_EXACT_HEAD_REVIEW`。独立复现脚本在 `f6401b73` 返回预期退出码 1。

拟补入持久的受信导入入口，在保留该门禁的基础上校验合入树、核准 SHA、六文件范围、原交付和原账本。相同输入重放应读回同一结果。普通 DSH 零付费 Mock 只提交一份复现夹具，5 笔全结算，4 个工具调用全部配对，记录绑定夹具的 `DELIVER` 并自然退出。重启仍只有一次派发和一份本地提案。提案未发布到 GitHub，新入口尚未实现，本轮新增付费请求 0。运行脚本、冷启动回执、轨迹和账本归档到 F 盘 `experiments/runs/issue305-cold-close-f6401b73`。

### ARCHMELD 对 Worker 恢复变更的静态复核

对 `f9047096…f46908ff` 的 `src` 稀疏副本运行本机 Windows 包 `0.1.0+dd124ca1`。公开源码核对到 `bf6e4a6f`，与实测包的构建身份分别记录。工具定位到派发、恢复和结算的跨文件关联。局部索引覆盖 517 个源文件，约 60 秒，账本与索引产物约 195 MiB。复核约 7.7 秒，原始 JSON 约 1.35 MiB，简报约 17 KB、51 项发现。输出标识 `verification=not_run`，并报告一个未映射文件，对应未索引的 handoff。部分标为 `context_only` 的条目在简报仍用了变更措辞，复核需回到具体源码和 Git diff。[ARCHMELD 文档](https://github.com/orangeofcarl0-sys/ARCHMELD/blob/bf6e4a6fd01010ebb5a4020dbfee96e1d2a79cde/docs/OPERATOR_GUIDE.md)

Palimpsest 现有架构检查覆盖依赖防火墙、热点上限、导入白名单和公开 API，实测均通过。ARCHMELD 适合由独立复核者按需查看状态机、持久存储和跨层改动。复核只向维护 Worker 交付绑定基线、候选、索引版本的少量源码引用，集中追问哪一处拥有状态、哪些旧路径可删除、重启后从哪个源读回。针对重复状态所有权或重复兼容路径，确认后再由现有断言和回归约束。索引保留在实验归档，原始工具结果可按摘要复算。

## 持久失败调查

拒绝或停机的 Work 保留原 Attempt 和判定。宿主将原记录、执行版本、基线、候选、项目检查点、账本和轨迹摘要绑定到同一案例。案例、调查回执、路由与接班读回在原 Slot SQLite 中分别登记。封存落盘、调查写完和后续工单登记都可在重启后补写确认。运行位沿用原常驻租约。

隔离调查从原始账本和配对轨迹复算收尾，从确切 Git 对象检查写范围和提交归因，从独立副本运行冻结探针。记录原正式阻塞，以及稍后复验观察到的其他事实。已有调用但无法归因、终态用量 UNKNOWN、零请求预检停止分别记录。真实准入继续受账本停机条件约束。离线调查可在付费阻断时进行。

授权范围明确的拒绝可以生成新 Work。同一 Issue 保留旧 Work，只有一个活动续修。新工单绑定原案例、调查回执、冻结验收和写入约束。后续同类失败会关联两份回执并暂停付费续修。工单没有对应的受信授权时会显示等待原因。Project Journal 按案例记录一次，Pulse 和短索引能找到它，详情保存在证据目录及 `inspect` 的 `failureCases`。

### #298 原现场复算和续修

用已提交的宿主代码和 F 盘冻结证据运行。三个路径输入分别是原运行计划、全新 Mock 目录、全新真实续修目录。真实目录和资格回执放在受信档案根内。

```powershell
node scripts/pnwf/software/self-evolution/github-failure-qualification.mjs qualify <old-plan.json> <mock-dir>
node scripts/pnwf/software/self-evolution/github-failure-qualification.mjs prepare <old-plan.json> <live-dir> <mock-dir>
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs serve <live-dir>/plan.json
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs inspect <live-dir>/plan.json
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs authorize-failure <live-dir>/plan.json
```

受信宿主在新 Work 排队后签发一次授权，绑定基线、工作范围、调查摘要和当前版本。续修从原封存 bundle 提取六个授权文件的差异，在 `166cf7c6` 的干净 Git 对象上形成未提交草案，并从该已接受版本的安装运行普通 DSH。新 Session 使用独立账本。原提交 `a6743b69`、原拒绝和项目检查点保存在现场，新候选以接受版本为 Git 祖先。额外允许的 `run.mjs` 变更仅限把依赖加入源码摘要。冻结探针留在宿主，候选通过 4/4、公开测试、归因、结算、提交和正式交付后才能由 App 建 PR。合入以所有者核准的精确候选 SHA 为准，接班读回绑定实际合入版本。

### 停机草案的离线接续

宿主封存停机案例时绑定工作区补丁、未跟踪文件归档和项目检查点。基础版本、活动构建、原 Attempt、调查回执、原工单契约和两份草案摘要共同确定续修材料。早期封存可用受信宿主提供的既有摘要补证，补证单独登记，原案例 ID、调查与判定照存。

同一 Slot 记录一次复验待办、确切回执和待准入工单。宿主在独立无网络的工作区复原最终草案字节，在测评前核对写范围、文件种类和精确编辑规则。Docker API 从宿主传入封存输入，容器在只读卷上复核摘要。验收记录引用现有的冻结探针和公开回归。范围拒绝或归档歧义形成 `REVIEW_REQUIRED` 回执，容器基础设施失败保留原复验待办，修复后可继续领取。

待准入工单在 `inspect` 的 `draftContinuations` 中显示，项目 Journal 登记对应的 Opportunity。短索引优先显示最近三条未决事项。它记录下一次拟复验的项目、确切 Git 基线、草案、回执及剩余验收项。实际模型派发仍受原用量阻断与新的受信准入约束。台账内已结算项和 UNKNOWN 均沿用原值。

```powershell
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs replay-draft <plan.json> <case-id> [attestation.json]
```

已入队的草案直接用案例 ID 恢复。历史草案首次入队时，`attestation.json` 位于受信封存目录内，绑定 `case`、`archive`、`files.patch` 及 `files.untracked`。种子和探针从已接受版本及原工单读取。此入口适用于已停止的原 Attempt，持有原常驻租约，只运行隔离复验和写回。

## Issue 与 PR 自动化纪律

GitHub 负责公开维护状态与送审；项目 Slot 继续保存 Work、Attempt、准入、账本、调查和发布。一个独立问题使用一个主 Issue。重跑、原拒绝、停机和草案复验沿该 Issue 追加依据。Issue 的绑定不签发模型准入。评论是非授权证据。

在既有 `plan.json` 顶层添加可选的 `issueDiscipline`。`root` 必须指向唯一获准同步的运行位，`authority` 是该运行位的固定名称。正式 #298 的 `work` 仍为 `standing-admission`，活动源取该 Slot。#299 可指定 `readOnly` 供对照。

```json
{
  "authority": "r298",
  "root": "F:/Codex_Work_Space/Palimpsest/experiments/pilot-inputs/r298",
  "issues": [
    {
      "number": 298,
      "id": 6565663490,
      "work": "standing-admission",
      "contract": "standing-admission",
      "criterion": "bounded-restart",
      "evidence": "https://github.com/orangeofcarl0-sys/palimpsest/blob/33fa071b3774358c55f527e172820556b9525bb1/docs/engineering/GITHUB-MAINTENANCE-FAILURE-REPORT.md"
    },
    {
      "number": 299,
      "id": 6565681318,
      "work": "delivery-readback",
      "contract": "delivery-readback",
      "criterion": "archived-delivery",
      "readOnly": true
    }
  ],
  "approvedProposals": []
}
```

```powershell
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs sync-issues <plan.json>
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs sync-issues <plan.json> --apply
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs propose-issue <plan.json> <proposal.json>
node scripts/pnwf/software/self-evolution/github-maintenance-cli.mjs publish-issue <plan.json> <approved-digest>
```

默认预览直接从只读 SQLite 连接计算，适用于封存运行位。显式应用复用该 Slot 的常驻租约和选定仓库的 App，仅同步公开状态。常驻宿主也可在长会话期间同步已提交状态。新提案由维护者从可信证据目录提供 `contract`、`criterion`、`caseId`、`finding`（首轮为 `FROZEN_PROBE`）、`title`、`expected`、`observed`、`acceptance` 和指向本仓库的公开 `evidence`。宿主核查独立复现回执，按问题键查重。所有者审阅公开正文后将当前提案摘要加入 `approvedProposals`，显式调用发布。已经核准的旧摘要随提案更新失效。公开 Issue 可由后续受信配置纳入 Work，沿用原调度和准入。

状态标签限于 `maintenance:queued`、`maintenance:active`、`maintenance:blocked` 和 `maintenance:pending-retest`。宿主更新自己的一条评论，记录责任角色、下一步及可公开的证据。排队等待准入和实际持租约运行分别取证。同步记录保留远端 ID、已投递摘要、待重试原因和远端冲突。遇到不确定的创建或关闭先读远端状态和 GitHub 时间线。人工关单、重开、已登记评论丢失或发现较新版本时交由监督者核对，从 `inspect` 的 `issueDiscipline` 字段定位。原 GitHub 讨论和人手标签由各自作者维护。

候选 PR 用普通关联引用。宿主读取候选范围内的 Git 提交消息，拦截自动关单引用，再推分支与创建 Draft。独立判据、精确头、基线、CI 结果和所有者完整 SHA 核准逐步绑定。CI 失败或头漂移从 Issue 状态可见。合入后据实际 Git 对象构建、读回同一项目并独立复验。纳管模式先写本地 `VERIFIED`，再同步结清回执，确认公开回执后按 `completed` 关闭。GitHub 暂时写回失败时，后继 Work 继续受既有前置、活动版本和准入限制。当前关闭回执与冷启动的实际发布源绑定。

### 2026-11-24 零付费复验

- #298 以正式 Slot 打开只读预览，读取前后文件摘要一致。原先的 `REJECTED / persisted-candidate`、第 16 笔 `UNKNOWN`、草案探针 `1/4` 和 `continue-6bae11aa94c5acf4265833da` 从同一快照取得。模拟 GitHub 创建评论后丢失确认，重启找到原评论并补上阻断标签。同内容再次同步零写入。复制的旧运行位尝试覆盖时被拒。重放前后两份正式账本摘要一致，续修派发记录仍为一次。#299 保留为已结清参照。[归档回放回执](../../research-evidence/pnwf-software/2026-11-24/github-automation-discipline/archived-issue-replay.json)
- 定向回归验证长会话中的实际派发、等待准入时的外部评论、CI 未完与失败、头漂移、冷构建读回失败、复验落账后写回中断，以及关闭确认丢失与人工重开。新 Issue 的旧提案摘要不得用于发布更新后的正文。
- 普通 DSH 双会话资格从精确 Git 对象构建，Mock Provider 各结算 5 笔。候选工件绑定 `DELIVER`、自然退出、模拟所有者合入、两次冷构建接班和独立复验均在资格回执中可核对。两个 Issue 各只有一条 Bot 结清评论。首个 F 盘挂载尝试在容器启动前失败。复跑借用 Docker Desktop 可绑定的临时目录，原档随后归回 F 盘。全轮付费请求为零。[双会话资格](../../research-evidence/pnwf-software/2026-11-24/github-automation-discipline/mock-qualification.json)
