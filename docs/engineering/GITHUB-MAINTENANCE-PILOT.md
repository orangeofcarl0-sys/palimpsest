
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
