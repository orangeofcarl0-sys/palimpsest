
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
