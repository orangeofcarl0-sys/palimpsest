# gRPC Fleet 修订 · 自主协作与宿主重启接续

2026-11-19 · 产品起点 `88621e34dbb707766d1f16c565d9631c314dc94e` · 普通 DSH

## 任务与判据

Fleet 试点从同一份已接纳的修订基线 `fbeb8958f4405688b13f37dbdec330157a660ab0` 开始。它含首版实现和日期为 11 月 10 日的消费者更正，仍能复现旧行为。在旧服务上向 site-a 发请求，显式零值和字段省略各得到零帧，状态均为 OK。更正要求按原顺序返回前三条。业务提示交代了成果、保留范围、交接所需证据和发布审批人，模型自己选择如何工作。[变更提示](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/mock/prompt.txt) · [预先约定的判据](../../.research-alignment/00_research_contract.md)

| 观测 | 认可的依据 |
| --- | --- |
| 主动协作 | Principal 自行请求另一参与者，轨迹能找到真实子会话或正式 Worker |
| 收到反例 | 能指明来源、实际请求、旧版观测和返回给 Principal 的记录 |
| 采纳并修改 | 贡献决定或可定位的实际回应，随后发生相关工件变动，并有前后独立验证。供应商更正、Principal 自测及宿主验收分别标明 |
| 项目接续 | 接受事件绑定完整 SHA。关闭原宿主后，新会话按项目记录作答，侧栏和 Workspace 各自显示同一 SHA、记录 ID、正文及来源 |

独立判分从确切 Git 对象启动服务，单独的容器通过 HTTP/2 核对七类请求的每一帧、顺序和最终状态，同时运行原项目公开测试。服务、集成测试和迁移说明须更新，服务单测允许更新。协议、wire codec、客户端和 REST 测试逐个比对 blob。旧候选、判分器和历史轨迹留在宿主侧。每次实际会话使用新的 DSH home 和独立逐请求账本，所有角色共用 64 笔、30 分钟、单笔 240 秒的窗口，金额和 token 均按量记账。[探针](../../scripts/pnwf/software/probe.cjs) · [执行入口](../../scripts/pnwf/software/autonomy.mjs)

## 零付费资格

Mock 的 Principal 调用原生 `subagent`。实际启动的子会话用仓库客户端分别请求零值、缺省，在原版观察到 `[0,0]` 并返回发现。Principal 读到实测值、登记贡献，记录 `ACCEPT_AS_CANDIDATE`，随后应用预制补丁并提交。独立观测变为 `[3,3]`，公开测试 18 项通过。Mock Operator 通过现有 `DIRECT_BASIS` 接受 `45211c60a81da3b87d8e25e46afa8ffd89f47840`。修订用了 8 笔合成请求（Principal 6、子会话 2），新会话接续用了 3 笔，付费调用为 0。这条样本验证接线，模型的选择另由真实样本观察。[资格](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/mock/qualification.json) · [候选与决定](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/mock/candidate.json)

两个独立启动的 DSH Web 宿主各自生成新的观察周期 ID，在侧栏选中「项目版本」再打开「版本依据」，均能读到同一条 `pje-46854bad0b584c688482c109db97c82f`。Workspace 的 Overview 显示完整 HEAD，Assets 展开原始日志，可复查贡献决定 `ctd-fbda4e9e76f3d6dfbd0f4e9271e5c5fa` 及其正文。浏览器单独验证真实入口；新 DSH 模型会话使用自己的项目工具取得信息。[第一次读回](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/mock/ui.json) · [再次重启](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/mock/ui-restart.json)

## 真实修订的轨迹

只给业务目标后，OpenCode Go 的 `deepseek-v4.1-flash` 选择自己修订。只有一个 Principal 会话。它没有发起子会话、委派正式 Worker 或登记贡献，项目中的贡献决定为零。源码、测试和发布说明都发生了实质变化。输入反例可以追到 Fleet 更正和 Principal 自己运行的旧测试。这一条真实样本给出了独立发布修订的证据，自主吸收他人反证的判据仍待验证。[完整工具顺序、调用 ID 与最终答复](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/observations.json)

| 轨迹序号 | 模型所见与下一步 |
| --- | --- |
| 15–83 | 先读项目 Pulse，再读 Fleet 更正、首版迁移说明、服务、协议和测试。首次运行公开套件 17/17，通过的旧测试明确写出了零值与省略值各自返回空流。 |
| 91–134 | 八次编辑落在四个文件。服务处理默认值，服务单测用原始 HTTP/2 区分两种请求，集成测试走客户端，迁移说明引用带日期的更正，并解释为何保留协议中的旧注释。提交前跑出 18/18，逐个核对保护文件和完整 diff。 |
| 139–154 | Git 提交 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`，提交说明记载更正来源。模型从提交后的工作树再次跑出 18/18，并确认工作树干净。独立容器另测 7/7，保护文件的四个 blob 一致。 |
| 159–166 | 先请求 `WAIT_FOR_OPERATOR`，宿主返回当前没有正式待核准项。下一次调用改为 `DELIVER`，宿主记录直接交付，模型在最终答复中将发布批准留给所有者，随后自然退出。修订会话结束时项目正式 HEAD 仍是 `fbeb8958`。 |

以上序号只在该会话内有意义。轨迹工具统计器没有把组合 Bash 命令归入其专用 commits 计数，本次提交由 Git 对象、命令回执和事后工作树三者核对。[逐调用原判](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/out/CHANGE/attribution/0.timeline.json) · [候选判分](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/candidate.json) · [提交差异](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/candidate.patch)

真实修订耗时 208.216 秒。17 笔请求全部结算、36 次工具调用全部配对；1 次领域拒绝，无重复拒绝和失败作业。fresh input 为 45,672，cache read 为 448,256，cache write 为 0，output 为 10,332，合计 504,260 tokens。OpenCode Go 的 17 次回放均经唯一用量四元组匹配。Provider 的 cost 字段合计 0，allowance 合计 0.00863686，listCost 合计 0.01439478。Mock 的合成 token 使用另一套单位，不能用来估计真实交付费用。[逐笔账本](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/out/CHANGE/request-accounting.json) · [Provider 原始计量](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/out/CHANGE/request-observations.jsonl)

该会话向模型提供了 28 个工具，包含原生 `subagent`、`subagent_fork`、`workflow` 和产品 `palimpsest_contribute`、`palimpsest_work`。开场 Pulse 显示无待办和委派，且明确允许直接工作。Fleet 单条更正与两个可运行的旧测试已能定位缺口。本样本无法区分任务本身容易独立完成、产品引导与模型偏好各自的影响。[原始轨迹](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/runtime-CHANGE/sessions/--run-stage-world--/session-8a37c49e-af1a-48ca-9dc0-3cfff9b7170b/session.v4.jsonl.zstd)

## 真实项目的接受与接续

所有者按完整 SHA 核准 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`。隔离项目的 Work 事件 8 通过 `DIRECT_BASIS` 将正式 HEAD 从 `fbeb8958` 推进到该提交，项目修订号从 1 增至 2。批准前的日志只有模型的交付声明 `pje-ee0141283028401089832410680085bb`。批准后，独立发布核验程序才把 HTTP/2 实测值、Fleet 来源 blob 和贡献决定情况写进版本依据 `pje-d0c977aae7bb8bfeca9159f76e14a7d1`。从候选核验文件落盘到接受事件记录相隔 369.556 秒，其中包含人工核准等待与宿主接纳操作。[接受记录](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/acceptance.json)

关闭原宿主后，使用新 DSH home、新会话 ID 和独立账本启动接手者。提示没有提供答案、SHA 或日志 ID。模型先读 Pulse，再查项目日志、历史、概览和贡献列表，最后用 Git 核实当前 HEAD 和干净状态。最终答复给出完整接受 SHA、两条日志 ID、更正文件和来源 blob，复述两种请求由 0 帧变为按源顺序返回 3 帧，同时明确项目中没有被采纳的贡献者发现。会话自然退出，Git 和 Work 事件未变。[接续提示](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/accepted/prompt.txt) · [工具顺序与最终原文](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/observations.json)

接手者称其为“project-level/journal-recorded acceptance”。核对所有者记录，接受权限来自 Work 的 `DIRECT_BASIS` 事件，Journal 提供核验说明。模型正确识别出正式 Promotion 数量为零。Pulse 将旧 Episode 标为 `REOPENED`，列出项目修订、HEAD 和新日志三项变化。调用 `explain` 按 Episode ID 返回 `found:false / UNKNOWN`，按日志 ID 则找到正文，标为 `AGENT_INTERPRETATION`。这解释了接手者为何把版本依据也描述为 open question。该记录的原始类型是 `REFERENCE_NOTE`。两次查询都有工具结果，归因统计未将“找不到对象”算作工具错误。[原始接续轨迹](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/accepted/out/RESUME/attribution/0.timeline.json)

在空白浏览器中，从原生 DSH 侧栏点击 **Palimpsest → 项目版本 → 版本依据**，可看到完整 SHA 和核验正文。从同一项目的 **Workspace → Overview** 展开技术详情，再到 **Assets** 展开对应日志，可以看到同一 SHA、日志 ID、来源和正文。实际的采纳决定数为 0。将归档的 Git bundle 和 Work、Journal 两个 SQLite 数据库恢复到新目录，也可重新打开这个项目。模型工具读回和浏览器点击各有独立记录。[侧栏截图](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/screens/sidebar.png) · [Workspace 截图](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/screens/workspace.png) · [宿主读回](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/ui.json)

| 真实会话 | 请求 | Fresh input | Cache read | Cache write | Output | 总 token | 运行时间 | 成对工具调用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 修订 | 17 | 45,672 | 448,256 | 0 | 10,332 | 504,260 | 208.216 秒 | 36/36 |
| 接续 | 5 | 20,330 | 58,880 | 0 | 2,342 | 81,552 | 61.099 秒 | 9/9 |
| 合计 | 22 | 66,002 | 507,136 | 0 | 12,674 | 585,812 | 269.315 秒 | 45/45 |

22 笔均按唯一用量四元组和逐笔终态对账，未决请求为 0。两个会话的 Provider cost 字段合计 0，Go allowance 合计 0.01141566，listCost 合计 0.01902612。上表的运行时间不含核准和离线复算。[汇总与两个宿主观察周期](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/comparison.json) · [修订账本](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/out/CHANGE/request-observations.jsonl) · [接续账本](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/accepted/out/RESUME/request-observations.jsonl)

## 离线复算和打开项目

用 Node 24 在已构建的仓库根目录执行以下命令。归档工具校验每个文件的 SHA-256，并从原始多帧 DSH 流和逐请求账本重算真实样本已记录的请求绑定。指定一个全新目录可以恢复 Git、Work 和项目日志，宿主会在本地生成新的访问凭据。下面使用真实接受版本。把目录末尾改成 `mock` 可查看有贡献决定的正例。安装本项目依赖、DSH Web 和 Playwright Chromium 后，这些命令均可离线执行。[归档与复算](../../scripts/pnwf/software/autonomy-archive.mjs)

```powershell
$evidence = 'research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live'
$restored = Join-Path $env:TEMP ('fleet-readback-' + [guid]::NewGuid())
node scripts/pnwf/software/autonomy-archive.mjs --verify=$evidence --restore=$restored
node scripts/inspector/dsh-web.mjs --deployment="$restored/profile.json" --readback="$evidence/acceptance.json" --result="$restored/ui.json"
```
