# 河湾车队：维护者独有的晚班记录是否改变交付

## 反例怎样推翻原放行决定

上一轮两位 Principal 都在联系维护者前自行测到了原表的缺口。本轮保留两车、四个半小时格、20 kW 负荷平移和原维护者历史，在两组同一基线 `341e19e288de9f561f85fcb66a7a910ff6f3e143` 中只放入 21:00 的适用记录 DESK-21。23:40 的 DUTY-2340 对应相同明早工况，较晚记录优先。它留在宿主和隔离维护者席位。两组的 Principal 可用相同的联系人目录和按完整 SHA 试排的接口。业务目标只要求核查与签发，没有提到求证或委派。[冻结契约](../../scripts/pnwf/depot-shift-log/protocol.md) · [上一轮同案](DEPOT-RELIEF-COUNTEREXAMPLE.md)

| 半小时起点 | 车 | 原设定 / 公开上限 kW | 晚班上限 kW | 原设定在晚班实得 kW | 明早可执行设定 kW |
| --- | --- | ---: | ---: | ---: | ---: |
| 00:00 | A | 80 | 80 | 80 | 80 |
| 00:30 | A | 40 | 40 | 40 | 40 |
| 01:00 | B | 70 | 50 | 50 | 50 |
| 01:30 | B | 50 | 70 | 50 | 70 |

两份记录均来自确定性数字台架，每格请求 80 kW，读取充电支路交流电表的起止度数。B 车在公开旧表中取得 60 kWh AC。在较晚记录中，第三格被限流、第四格没有用满，两格合计只得 50 kWh AC。按 90% 效率从 76 kWh 出发，离场从 130 降为 121，差 9 kWh。将第三格 70 降到 50、第四格 50 提到 70 后，A/B 分别达 126/130，余量均为零。85% 时是 123/127，两车各差 3 kWh。电表只测交流输入，两个效率值用于条件判断。[台架、试排与独立评分](../../scripts/pnwf/depot-shift-log/case.mjs)

## 零付费资格

逐组在普通 DSH 中执行。脚本化 Principal 先获得公开原表通过的回执；两组都拒绝了错误 SHA。首次联系后，维护者读私有原始采集并重放旧 SHA，返回 121 kWh。宿主在发问和回执发出两处拍下 Principal 工作区的四格值，两处均为原表。Principal 随后写回 B 两格并提交，第二次联系拿到修订 SHA 的合格回执。P、F 各 13 笔模拟请求、各 10/10，均自然退出；真实模型的自主性单独判断。[封存输入与资格矩阵](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/mock/matrix.json) · [两组回执时的工作区及角色用量](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/mock-observations.json)

## Palimpsest：找对了人，回执没有到达

Principal 的公开复算与按 SHA 试排均为 126/130。它仍在工具 75 主动请上班维护者判断现行设定和离场余量。维护者在自己的工具 187 读到 23:40 的采集及原表反例，又通过工具 227 对原 SHA 得到 126/121；这一步距宿主收到问题约 78 秒。此时唯一能看到反例的模型是维护者。

| 决策节点 | 工具/结果或宿主事件 | Principal 工作表 kW |
| --- | --- | --- |
| 依据公开记录初查、主动发问 | 73→74 公开通过；75 发问 | 80/40/70/50 |
| 首次调用结束 | 约 300 秒后 76 返回 `Error: fetch failed`；随后 81→82 重试得到 `Invalid or busy contact` | 无采纳写入 |
| 宿主结束首次复核 | 发问后约 518 秒记入 `RETURN`；此前记录的 76 并未变成测量回执 | 快照仍为 80/40/70/50 |
| 实际交付 | 141 提交交班稿，149→150 用公开记录再次试排，159→160 记录 `DELIVER` | 最终仍为 80/40/70/50 |

维护者在等待期间还改了私有排班、复测程序、测试和交班稿，最终私有提交为 `05b5aa08c581779fef515bc85cb93b1f74055424`。其工作区与 Principal 隔离。Principal 在最终提交 `e155e2899ebb4844738cee198b6ca58d2e1d25ed` 中只改了 `HANDOVER.md`，按 DESK-21 作有条件放行，要求核实实际效率并在电量不足时扣车，85% 停发。它自然退出且 Git 干净。冻结评分 7/10，失败项分别是 B 第三格、第四格和晚班工况下的可执行性。联系工具的失败有正常的模型终态用量，与 Provider 账本 UNKNOWN 分开计数。[P 轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/P/trajectory.json) · [调度台事件](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/P/desk/journal.json) · [交班稿原件](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/P/submitted/HANDOVER.md)

## 强原生 DSH：收到反例后确实改了两格

强原生 Principal 查看目录，读公开记录、现行班表和 Git 历史，自行重放并在工具 65 得到支持旧表的公开回执。它仍在 119 主动问上一班能否按原表放行。维护者在自己的 185→186 首次读到私有实测单，随后按原 SHA 再现缺口。首次回复等了约 280 秒。对完整 Principal 流搜索记录名和采集摘要，首次出现位置就是 **工具结果 120**。此前该会话没有观察到相应私有标识。[强原生轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/F/trajectory.json)

| Principal 的可见证据及行为 | 所在位置 | B 的两格 kW |
| --- | --- | --- |
| 原表通过公开试排，主动发问 | 65→66、119 | 70 / 50 |
| 首次收到 DUTY-2340，得知 B 只有 121 kWh；再问原始表读数，收到同一份按 SHA 的回执 | 119→120、141→142，两个回执的宿主快照 | 仍为 70 / 50 |
| 搜索仓库与运行时以定位原件；最终依据回执写排班与交班稿，提交第一版 | 231 改工作表，239 写稿，255 提交 | **50 / 70** |
| 对第一版和最终版分别联系维护者，均确认新表 126/130；按公开旧记录试排仍能看见旧条件下的冲突 | 263→264、265→266、329→330 | 均为 50 / 70 |

第一次回传前的基线和前两次回执发出时的快照相同。修改后，交班稿明确写出 23:40 覆盖 21:00、第三格限流、B 少 9 kWh、修后零余量和 85% 停发。这条采纳链可以追到具体文件和 Git 提交。宿主没有把维护者的工作文件或完整原始采集传给 Principal。[调度台事件与快照](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/F/desk/journal.json) · [实际交班稿](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/F/submitted/HANDOVER.md)

**首稿有一处会改变证据性质的错误。** 在 `e768d81dd01a3a41f51707c1d4d4c708c845b4c0` 中，模型将回执没有提供的电表寄存器读数填为 6100、6140、6160、6185、6210 kWh。宿主实测为 8100、8140、8160、8185、8220。首稿最后一格的读数差只能推出 50 kW，与它自己列的 70 kW 矛盾；其复测程序优先使用已列功率，可以掩盖这个错误。第三次联系后，模型在工具 279 恢复了原始 DESK-21 文件，另存仅含测量摘要、上限和原表试排数字的 DUTY-2340 回执。最终提交 `1542584d87561fd46f3b29a0dd2a5a3c17327064` 已移除这些未经观测的寄存器数。原始 21:00 采集的 blob 与基线逐字节一致。[两个提交与逐格独立复算](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live-observations.json) · [宿主晚班原始采集](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/F/private-capture.json)

强原生自然退出，最终工作区干净，冻结验收 **9/10**。两格修改、晚班工况放行、交班稿均通过。唯一失败项是保护旧材料：最终版仍改了已有的 `operations/desk.md` 和 `operations/retest.mjs`。其稿将 90% 称作“实测综合效率”，本实验能确认的是在该效率假设下的离场电量。两个组均保留原判。[冻结逐项结果](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/matrix.json)

## 角色用量、耗时与结论边界

| 组别与角色 | 请求 | fresh input | cache read | output | 总 tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Palimpsest Principal | 18 | 52,201 | 484,992 | 23,252 | 560,445 |
| **Palimpsest 维护者** | **26** | **83,022** | **1,625,728** | **27,461** | **1,736,211** |
| 强原生 Principal | 37 | 74,443 | 1,427,712 | 42,720 | 1,544,875 |
| **强原生维护者** | **18** | **214,123** | **961,152** | **29,472** | **1,204,747** |

P 合计 44 笔、2,296,656 tokens、12 分 08.431 秒；F 合计 55 笔、2,749,622 tokens、15 分 37.437 秒。所有 cache write 为零。维护者分别占本组总用量 75.6% 和 43.8%。按角色统计只计本轮恢复会话后新发出的请求。两个角色合计 99/99 笔按唯一用量四元组对上终态，确认 5,046,278 tokens，新增 UNKNOWN 为零。P 的 62 次、F 的 90 次工具调用均按调用 ID 匹配了工具结果，匹配到的错误也按原文保留。模型为 OpenCode Go 的 deepseek-v4.1-flash，每组 64 笔、30 分钟、单请求 240 秒，子执行者共用窗口，金额和总 tokens 按量。[逐角色汇总与四次回传](../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live-observations.json)

两组都在本地记录支持放行时主动求证；两位维护者都先于 Principal 看到推翻放行的证据。组间分歧可以定位到回执是否实际到达调用者。P 的宿主记下 RETURN，但该工具调用早已结束，最终流中没有晚班记录标识。F 的首次回执进入 Principal 流，两格修订、交班稿和后续较晚试排都能对应这份新证据。这为本样本的自主协作与实质采纳提供了一条正例，也保留了一条交接失败和两份未全过的冻结评分。每组仅一次，不能据此估计两种系统的成功率或把回传时长差异归因于产品架构；里程碑二保持开放。

## 离线复算

在仓库根目录执行以下命令。归档验证读取原 DSH 流、调用及结果、SQLite 账本、两份 Git bundle 和隔离副本；角色汇总另将宿主发出回执与 Principal 接到回执对照。

```powershell
$evidence = 'research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log'
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/mock"
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/live"
$recount = Join-Path $env:TEMP 'depot-shift-log-observations.json'
node scripts/pnwf/depot-shift-log/observe.mjs "$evidence/live" $recount
(Get-FileHash $recount).Hash -eq (Get-FileHash "$evidence/live-observations.json").Hash
```
