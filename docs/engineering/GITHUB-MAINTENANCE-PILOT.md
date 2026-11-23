
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
