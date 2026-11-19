# 河湾夜班调度：保护旧材料与另存实测回执

## 冻结任务与交付边界

本轮真实运行仅限普通 Palimpsest DSH。项目从原表 `341e19e288de9f561f85fcb66a7a910ff6f3e143` 启动。Principal 收到上轮同一份中文业务目标。文件义务放在调度部署的工具契约中，具体回执随实测调用返回。文件名可见，较晚采集的寄存器、功率和旧表缺口仍由维护者掌握。因此本轮可以观察实测如何影响排班；主动联系的频率不能与没有归档指引的部署直接比较。

| 文件义务 | 路径与验收 |
| --- | --- |
| 允许改、必须改、必须存在 | `shift-plan.json`、`HANDOVER.md` 和独立的 `operations/duty-2340.json`。宿主从提交检查净差异、普通文件和内容变化。 |
| 必须保留 | 基线其余九个文件全部核对 Git 模式与 blob，包括 `operations/desk.md`、`operations/retest.mjs`、`operations/cold-cycle.json`、模型、原测试、工况和项目说明。 |
| 回执来源 | 单独解析所提交的 JSON，按它标明的完整实测 SHA 读取宿主持久记录，逐字段核对。它可以绑定修订前的受测班表；文件义务回执另绑定最终交付 SHA。 |

普通 DSH 的直接 `conclude DELIVER` 在调用原 Episode 入口前，使用与正式 Work 相同的 `inspectWorkRevision` 和 `requireWorkRevision`。拒绝时返回原因、路径及下一步。直接交付的检查阶段为 `PREVIEW`，Episode 继续按原规则判断并记录交付。独立的十项业务评分沿用原版。文件义务摘要为 `7cfd7145e07912e193d1f12be2603bba65c0a291b28c0d6b5776b44ce3a5a30e`。[宿主声明与核验](../../scripts/pnwf/depot-shift-log/materials.mjs) · [DSH 接入](../../scripts/pnwf/depot-shift-log/product-entry.mjs)

## 两份历史提交与零付费资格

回归从历史 Git bundle 检出 P 的 `e9353b6928fa93554905b960588177c39271aae5` 与 F 的 `1542584d87561fd46f3b29a0dd2a5a3c17327064`。两份原提交的冻结业务判分均为 **9/10**；新检查看到两份操作资料均变化，原始采集 blob 均保留。分别恢复说明和复测脚本，文件检查即通过。两份历史另存件都是回执摘要，按本轮新增的完整回执要求会被拒绝。另行测试了篡改采集、缺少另存件以及用旧 SHA 提交当前工作树。[历史回归](../../scripts/pnwf/depot-shift-log/materials.test.mjs) · [历史对比与原判](DEPOT-RECEIPT-DELIVERY.md)

资格 Mock 使用真实容器、普通 DSH 工具和持久回执。首次回传模拟丢失，再问同一 SHA 取回同一份实测。Principal 故意改写操作说明，工具调用 53 的结果 54 拒绝交付，报 `PROTECTED_FILE_CHANGED` 并点名文件。恢复说明、另存完整回执后，调用 73 的结果 74 记录 `DELIVER`，自然退出。冻结业务验收 10/10，18 项文件检查通过，17 笔模拟请求全部结算，付费调用为零。开发时第一次 Mock 的交付陈述过短，既有 Episode 规则拒绝；合格 Mock 使用说明实际依据的陈述。[资格轨迹与回执](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/mock-observation.json)

## 真实轨迹：从证据到交付

1. Principal 阅读旧材料、运行原测试与复算脚本，并向同一 SHA 发起公开试排和维护者复核。公开结果 64 得到 126/130 kWh；调用 65 询问 21:00 记录是否适用。维护者在自己的轨迹结果 186 首次读到私有记录并实测。Principal 结果 66 首次出现晚班记录及其摘要。宿主的联系与回传快照中，原表均为 A 80/40、B 70/50 kW；较晚条件下 B 实际只能取 50/50，离场 121，差 9 kWh。
2. 收到回执后，Principal 自行核算；调用 103 改两格，117 提交班表 `8fcf289c04b72ef467d988a15cec2543c5d1dd30`。调用 125 请求对这一新 SHA 复核，结果 126 确认实际四格 80/40/50/70，离场 126/130，两车余量为零。调用 131 把第二份完整回执另存，137 写交班稿。两个维护者副本分别留下自己的提交；宿主通过回执传递实测，Principal 的三次提交均可从交付 bundle 单独重放。
3. 提交 `510e5fb9` 归档回执和交班稿。读回后，Principal 又澄清 B 车 70 kW 充电的具体时段，以 `d5ae2d3395dc0380e4df65be0b9c8cf819247f86` 完成交付。结果 182 显示班表 blob 与受测提交相同。唯一一次交付调用为 195，结果 196 为 `RECORDED`，之后自然退出。Principal 的 30 次工具调用、维护者的 41 次调用均已按 ID 配对。[调用、结果和角色用量](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live-observation.json)

**最终 Git 核验。** 原始采集、旧说明、旧复测程序的基线和交付 blob 分别为 `33b0baed7bca0d9221fae7cfecc0b1857009aa76`、`9f01488fa2203313c065e622a7b354559fc08706`、`bbf16f84c150ba6592d784c778392fec77bc0b77`。全部九份保护文件均保留 Git 模式和 blob。班表 blob 为 `7e136dd9f9597aeb94e5353e03c287e7089bb197`，另存的 JSON 与维护者对 `8fcf289c` 签出的持久实测逐字段相等。共用检查 18/18，独立冻结业务评分 10/10，工作区干净。[完整文件回执与评分](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/matrix.json) · [交班稿原稿](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/P/submitted/HANDOVER.md) · [另存回执](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/P/submitted/operations/duty-2340.json)

交班稿给出了 90% 效率下的零余量及 85% 下双车停发。原稿还将可延楼宇负荷具体移至 01:00 写作实测事实。返回 Principal 的回执给出了充电功率上限与离场电量，未独立标识楼宇中哪一个负荷发生了转移。这是稿件证据表述的局限，冻结判分原样保留。

## 同一基线的请求、用量与耗时

| 真实会话 | 冻结评分 | Principal 笔 / tokens | 维护者笔 / tokens | 合计笔 / tokens | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 上轮 Palimpsest | 9/10 | 37 / 1,767,613 | 23 / 1,460,608 | 60 / 3,228,221 | 15:59.221 |
| 历史强原生 DSH | 9/10 | 37 / 1,544,875 | 18 / 1,204,747 | 55 / 2,749,622 | 15:37.437 |
| 本轮 Palimpsest | **10/10** | 25 / 910,138 | 30 / 2,004,567 | 55 / 2,914,705 | 11:16.154 |

本轮使用 OpenCode Go `deepseek-v4.1-flash`。Principal 与维护者共享每会话 64 笔、30 分钟、单请求 240 秒的窗口，按终态用量记账，金额和总 tokens 均无上限。55 笔全部匹配，UNKNOWN 为零。Principal 的 fresh input / cache read / output 分别为 56,616 / 828,160 / 25,362。维护者分别为 **83,734 / 1,896,320 / 24,513**，两者的 cache write 均为零。此处比较 tokens，未推算货币金额。

**维护者的支出发生在哪里。** 按恢复会话的两张复核单切分，原表复核 19 笔、1,146,975 tokens，修订表复核 11 笔、857,592 tokens。两次首次有效试排分别由回复序号 206 和 347 发起。每次发布实测以后才生成的后续回复合计 26 笔、1,787,759 tokens，占维护者用量 89.2%。其工具记录包括继续查旧采集摘要、改写私有文件、运行测试、尝试并完成私有提交。两份私有提交都留在维护者副本。第二次求证因复用同一维护者会话而排队，从发问至启动约 118 秒。[逐笔归因](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/P/trajectory.json) · [宿主联系与回传时序](../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/P/desk/journal.json)

与上轮 P 相比，本轮少 5 笔、313,516 tokens，少用 4 分 43.067 秒。其中 Principal 少用 857,475 tokens，维护者多用 543,959 tokens。与历史强原生同为 55 笔，本轮多用 165,083 tokens，完整保留了两份当时被改写的旧材料。单次同基线复跑验证了这份材料契约可以随直接交付执行；模型调用数和缓存差异不足以估计普遍的成本收益。

## 离线复算

```powershell
$evidence = 'research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations'
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-shift-log/materials.test.mjs scripts/pnwf/depot-shift-log/receipt-store.test.mjs
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/mock"
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/live"
$recount = Join-Path $env:TEMP 'depot-materials-recount.json'
node scripts/pnwf/depot-shift-log/observe.mjs "$evidence/live" $recount
(Get-FileHash $recount).Hash -eq (Get-FileHash "$evidence/live-observation.json").Hash
```
