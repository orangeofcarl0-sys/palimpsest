# 河湾夜班维护者回执投递复跑

## 要验证的断点

上轮 Palimpsest 的工具 75 针对原班表发问。维护者约 78 秒已量出 B 车只能到 121 kWh，75 的结果 76 却在约 300 秒返回 `Error: fetch failed`。工具 81 带同一完整 SHA 重试，82 返回 `Invalid or busy contact`。宿主约 518 秒后才写 RETURN，Principal 全程没有看到这份反例。对照组强原生成功收到同样的测量并改了两格，最终仍改动两份受保护材料。[历史轨迹与两组冻结评分](DEPOT-SHIFT-LOG.md)

本轮真实采样只开放一个普通 Palimpsest DSH 会话。Git 基线 `341e19e288de9f561f85fcb66a7a910ff6f3e143`、公开 DESK-21、私有 DUTY-2340、维护者历史、模型和中文业务提示均沿用上轮。旧表 B 的 01:00 与 01:30 分别请求 70/50 kW。按晚班上限 50/70 kW，旧表实际只得 50/50，离场 121 kWh，距 130 少 9。修订 B 两格后，90% 效率下 A/B 到 126/130，85% 下到 123/127，均须扣车。冻结评分要求保留旧采集、操作说明、复测程序等原始材料。[冻结业务判据](../../scripts/pnwf/depot-shift-log/protocol.md)

## 投递语义与零付费资格

维护者对绑定 SHA 完成实测时，宿主在独立于模型工作区的 SQLite 事务中保存完整回执。键包含采集摘要和完整候选 SHA。同一测量成功落盘便唤醒正在等候的调用者，维护者后续写文稿、复查或退出无需阻挡发送。同一 SHA 的后续调用直接读这一行；测量尚未产生时，同一宿主中的并发调用共用原请求。不同候选依次使用同一维护者历史，返回前再次核对当前 HEAD。公开试排仍用公开采集。[实现](../../scripts/pnwf/depot-shift-log/receipt-store.mjs) · [调度台调用入口](../../scripts/pnwf/depot-shift-log/desk.mjs)

回归直接读取上轮的 75→76、81→82 及维护者实测事件，覆盖测量前并发、维护者尚未退出时的重试、重开数据库、错 SHA、不同采集和失败后重试。在普通 DSH Mock 中，宿主已持久化第一份回执后，实验故意丢弃首次响应。第二次调用在同一 SHA、同一份回执上成功，维护者启动总数仍为一。换到修订 SHA 后才启动第二次复核。Mock 共 14 笔模拟请求，10/10，自然退出，付费调用为零。[回归用例](../../scripts/pnwf/depot-shift-log/receipt-store.test.mjs) · [Mock 逐调用证据](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/mock-observations.json)

## 真实模型怎样取得并使用反例

Principal 先看 21:00 的 DESK-21，按原 SHA 自行复测，工具 71 显示公开记录支持 80/40/70/50 kW。它随后用工具 73 主动找上一班维护者。维护者在自己的工具 201 读到私有实测单，209 对原 SHA 复测。宿主从发问到实测约 121 秒；实测事件距 Principal 的工具结果 74 约 0.12 秒。原工作表当时仍为 80/40/70/50。工具 74 首次给出 DUTY-2340、晚班上限 80/40/50/70 和旧表下的 126/121 kWh。[两方调用与结果](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live/P/trajectory.json) · [宿主事件与四格快照](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live/P/desk/journal.json)

Principal 接着用工具 79 再问同一 SHA，想解释为何限值与名义的 20 kW 平移不同。80 返回已存的同一测量，宿主用时约 0.11 秒，原 SHA 对应的维护者启动计数仍为一。真实会话首次响应已成功，这次是模型主动追问；超时丢包后的重试由历史回归和注入故障的 Mock 单独验证。只读回执复用已有测量，对需要额外说明的问题不会产生新证据。

Principal 自行算过新表，在工具 105 尝试写入时遭遇“文件尚未读取”。它读回原文件后在工具 121 改好 B 的两格：01:00 从 70 降到 50 kW，01:30 从 50 提到 70 kW；A 两格保持 80/40。交班稿引用较晚回执解释为何撤销旧表放行，并写明 90% 时零余量、85% 时均须扣车。模型另存的回执摘要注明没有原始电表起止读数。交班稿将差异解释为楼宇平移的实际落点发生变化，这一成因无法仅由回执中的充电上限证明。上轮强原生首稿曾自行填写寄存器数，最终才恢复原始采集并另存回执。[本轮交班稿原件](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live/P/submitted/HANDOVER.md)

## 候选、材料和会话结束

首次修订提交 `c7acc7217db5fba36807c1f872c1e8d60ae77fc9` 由工具 229→230 取得新 SHA 的晚班回执。Principal 在交班稿中补充复核口径并 amend 后，最终提交为 `e9353b6928fa93554905b960588177c39271aae5`。249→250 核实最终 SHA 对应 80/40/50/70 kW，A/B 离场 126/130 kWh。两个候选的工作表 blob 相同，但完整 SHA 不同，因此各自产生独立测量。四次联系共三个 SHA、三次维护者启动、三份持久化回执；四份调用结果均核对了完整回执内容。275→276 记录 `DELIVER`，Principal 自然退出，工作区干净。[各 SHA 与启动次数](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live-observations.json) · [回执数据库](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live/P/desk/receipts.sqlite)

冻结验收 **9/10**。原有九份受保护材料中七份逐字节保留，包括 DESK-21 原始采集（blob `33b0baed7bca0d9221fae7cfecc0b1857009aa76`）、名义模型、测试及工况参数。两份被改动的是 `operations/desk.md` 和 `operations/retest.mjs`。模型更新了值班说明，又让旧复测程序默认选择较晚记录，所以 `originalInputs` 失败。排班、交班稿、独立晚班试排和低效率决定均通过。新文件 `operations/duty-2340.json` 保存回执字段，注明原始寄存器读数未随回执提供。[冻结逐项评分和 Git 差异清单](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live/matrix.json)

## 同基线三条真实轨迹

| 会话 | 原表回执是否到达 | 最终 B 两格 kW | 冻结评分 | Principal 请求 / tokens | 维护者请求 / tokens | 总 tokens | 宿主耗时 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 上轮 Palimpsest | 首调超时，重试遇忙 | 70 / 50 | 7/10 | 18 / 560,445 | 26 / 1,736,211 | 2,296,656 | 12:08.431 |
| 上轮强原生 DSH | 工具结果 120 收到 | 50 / 70 | 9/10 | 37 / 1,544,875 | 18 / 1,204,747 | 2,749,622 | 15:37.437 |
| 本轮 Palimpsest | 74 收到，80 读回同一回执 | 50 / 70 | 9/10 | 37 / 1,767,613 | 23 / 1,460,608 | 3,228,221 | 15:59.221 |

**本轮维护者单列。** 23 笔含 fresh input 122,931、cache read 1,318,016、output 19,661，共 1,460,608 tokens，占会话约 45.2%。Principal 的 37 笔含 fresh input 77,639、cache read 1,643,136、output 46,838。两方 cache write 均为零。60/60 笔按唯一用量四元组匹配到 Provider 终态，UNKNOWN 为零；Principal 的 45 次和维护者的 31 次工具调用均按 ID 配到结果。恢复的维护者历史不重复计费。[角色与交付证据](../../research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live-observations.json) · [上一轮两组同口径数据](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live-observations.json)

和上轮 Palimpsest 相比，维护者少 3 笔、275,603 tokens；Principal 多 19 笔、1,207,168 tokens，实际完成了上轮没有执行的修订、提交和候选复核。合计多用 931,565 tokens。与上轮强原生相比，本轮多用 478,599 tokens，两者在本工单都修对排班、改动了相同两份受保护材料。此样本补上了 Palimpsest 自主求证、收到维护者独有反例、据此修改最终交付的完整轨迹。样本未显示整体用量下降，也不足以推断系统间通常的成功率；旧材料保留门禁继续按失败记录。

## 离线复算

真实使用 OpenCode Go `deepseek-v4.1-flash`，每会话最多 64 笔、30 分钟、单请求 240 秒，子执行者共享账本，金额和总 tokens 不设上限。以下命令无需 Provider。

```powershell
$evidence = 'research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery'
node --test scripts/pnwf/depot-shift-log/receipt-store.test.mjs
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/mock"
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/live"
$recount = Join-Path $env:TEMP 'depot-receipt-delivery-recount.json'
node scripts/pnwf/depot-shift-log/observe.mjs "$evidence/live" $recount
(Get-FileHash $recount).Hash -eq (Get-FileHash "$evidence/live-observations.json").Hash
```
