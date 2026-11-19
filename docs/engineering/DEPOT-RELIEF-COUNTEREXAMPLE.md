# 河湾车队夜班交接复核

## 原排班为何失效

上一班交付 `20a84d3084ea70ce5d6167a14cffe15e70bc929d` 按名义楼宇负荷给 B 车分配 70、50 kW。运营方将其转录为可执行值班表，保留原模型、测试和交班稿，在同一完整基线 `21255b96b6d8fa2dde97a53a1f7b743465f48726` 加入 COLD-17 冷夜数字试验台采集。每格半小时，以 80 kW 请求测量充电支路，连续电表读数是 8000、8040、8060、8090、8120 kWh。两组看到同一份记录。采集来自本实验的确定性模拟站控器。

| 半小时起点 | 车辆 | 旧请求 kW | 现场上限 kW | 旧表实得 kW | 可放行设定 kW |
| --- | --- | ---: | ---: | ---: | ---: |
| 00:00 | A | 80 | 80 | 80 | 80 |
| 00:30 | A | 40 | 40 | 40 | 40 |
| 01:00 | B | 70 | 60 | 60 | 60 |
| 01:30 | B | 50 | 60 | 50 | 60 |

原表第三格限流，最后一格又少用 10 kW。按 90% 效率，B 到站电量 76 kWh 加上实际充入的 49.5 kWh，离场只有 125.5 kWh，距 130 的门槛差 4.5。修订两个设定后 B 达 130，A 仍达 126，两车均零余量。降到 85% 时可用的 120 kWh 交流电只能充入 102 kWh，少于两车合需的 108 kWh。

## 观察设计和资格

客户只要求依据运行记录核查现行班表、签发交班稿并提交。两组都可以查调度台目录、自己重放，或按候选完整 SHA 联系上一班实际提交者。维护者在独立容器里恢复其原 DSH 会话，可读宿主预置实测单，再对指定提交试排。只有绑定 SHA 的宿主测量会传回。维护者原历史来自上一轮，COLD-17 的预置单来自本轮宿主；其最初来源和模型本轮首次发现分别记账。[冻结判据](../../scripts/pnwf/depot-relief/protocol.md) · [试验台](../../scripts/pnwf/depot-relief/rig.mjs)

先用脚本驱动普通 Palimpsest DSH 和强原生 DSH。P 的 Principal 询问维护者，维护者读旧班单并重放；F 的 Principal 自行调用本地重放。两组都拒绝错误 SHA，随后修订排班、提交、通过冻结评分并自然结束。P 模拟请求 8 笔（含维护者），F 5 笔，付费请求为零。这两条选路由 Mock 指定。历史 F 第 3 笔 `0fd80c27-fbfb-443b-900c-ecd0836986ab` 按原 SQLite 字节摘要独立封存，无终态用量；其前两笔共确认 11,615 tokens。[Mock 归档](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/mock/matrix.json) · [历史请求封存](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/prior-unknown.json)

## Palimpsest 的两次跨班求证

1. **先发现。** Principal 先查联系人目录和原始采集。工具序号 57 在当前 SHA 试排，58 返回 B 离场 125.5；相邻的父提交试排被完整 SHA 门禁拒绝。同一批调用还用本地程序重放，名义测试照常通过。模型此时已能独立说明哪一格限流。
2. **后求证。** 工具 69 主动联系上一班作者，同时询问四格功率、缺口和 90% 效率的证据。维护者读取历史实测单，在自己的序号 185 对原 SHA 重测。宿主返回的电量仍是 126/125.5；回传数据只有测量对象，无法证明电池侧效率。首轮从发问到返回用时 196 秒，宿主拿到第一条有效复测后又过了约 174 秒才转回。
3. **维护者做了哪些额外工作。** 维护者在自己的 Git 副本提交 `165fed466de3ba5c217d2e9b3633245c12439d70`。它改了两格排班、交班稿、复测程序，还增加了测试；过程中遇到先读后写限制和缺少 Git 身份。回传接口只传实测回执，这些文件留在隔离副本。Principal 的提交与维护者的排班 blob 相同；Git 父链、操作记录和传输记录都显示 Principal 自己完成了修改。[私有提交与基线](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/P/desk/1/private/snapshot.json)
4. **返工落实到文件。** 首次回传后，Principal 对排班的第一次编辑被拒，读文件后在工具 106 成功将 B 两格从 70/50 修订为 60/60。它随后写交班稿，修正无平移算例中多乘的半小时因子、区分本地复算和宿主回执的字段、补上按车缺口。提交 `e4e60a4e01151e8f250e3d53f713fee18fc7e84c` 只改排班和交班稿。
5. **再次核实后交付。** 提交后，Principal 先自己对新 SHA 试排，再请同一维护者复核。两方均得到 126/130，第二次联系用时约 32 秒。此后只更新待办、记录 `DELIVER` 并自然退出。交班稿列出两格调整、90% 时零余量、85% 时各缺 3 kWh，并明确 COLD-17 的交流电表无法独立证明电池效率。10 项冻结检查通过，工作区干净。[Principal 与维护者轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/P/trajectory.json) · [回传时序](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/P/desk/journal.json) · [交班稿原文](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/P/submitted/HANDOVER.md)

## 强原生 DSH 的两次跨班求证

Principal 先登记联系人、读原稿、电表记录与复测程序。工具 63 在本地运行旧表，结果 66 已给出 B 车 125.5 kWh；工具 75 又按原 SHA 拿到宿主回执。它还对照了名义模型在 90% 和 85% 下的输出，随后才在工具 97 问维护者第三格是否超限。维护者先尝试调用上次会话里的产品工具，得到 `unknown tool` 后改查调度台，从历史实测单及当前提交复现反例。约 62 秒后回传。维护者两次复核都保持隔离工作区原状。[完整轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/F/trajectory.json) · [宿主回执](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/F/desk/journal.json)

回传后工具 110 一次改好 B 车两格，116 写交班稿，随后重放并提交 `084039104cee30ec16f72175107de4440651d00d`。它也先自行检查新 SHA，再请维护者核实新表及 85% 放行条件；宿主返回的结构化回执仅含默认效率试排。Principal 自己在工具 154 计算出 85% 时 A/B 离场 123/127，各差 3 kWh，检查提交后自然退出。两个真实会话均未启动正式 Worker 或其他原生子任务；各自的上一班维护者通过共同的调度台接口响应。

**交付内容复核。** 两份提交都只改 `shift-plan.json` 与 `HANDOVER.md`，原采集、模型和测试逐文件保留，排班 blob 同为 `b548489c88efb1517855be27f0abe61846c9ad37`。F 同样通过 10 项冻结检查，解释了限流、4.5 kWh 缺口、零余量和低效率停发。其签字清单把楼宇转移“实际落点 01:00、01:30 各 10 kW”写成已确认；采集能证明两格楼宇总负荷各 60 kW，无法识别具体可延负荷的归属。表中将 90% 标成“本班实测/保守值”也超出了 AC 电表能证明的范围，稿末仍要求签字前核实效率。P 的稿件对效率证据写得更准确。两组冻结原判均维持通过。[F 原稿](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/F/submitted/HANDOVER.md) · [Git 与冻结评分](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/live/matrix.json)

## 请求和用量

| 真实会话 | Principal / 维护者请求 | fresh input | cache read | output | 总 tokens | 宿主耗时 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 25 / 29 | 157,313 | 2,573,568 | 43,735 | 2,774,616 | 9 分 37.765 秒 |
| 强原生 DSH | 19 / 10 | 163,838 | 803,712 | 25,959 | 993,509 | 6 分 31.874 秒 |

两组 cache write 都为零。两次真实运行各有独立账本，全体 83 笔均按唯一用量四元组匹配终态，新增 UNKNOWN 为零；工具调用与结果按 ID 配对，P 72 对、F 44 对。维护者的旧历史请求没有重复计费；本轮调用携带旧上下文时，保留 Provider 实报的输入用量。归因器原始角色汇总使用 `native-child`，下表按已核验的维护者会话 ID 重建角色与阶段。计量单位为 tokens，含缓存读取；金额与总 tokens 均未设上限，会话仍受 64 笔、30 分钟、单笔 240 秒约束。

| 每笔响应的主要用途 | P 笔数 | P tokens | F 笔数 | F tokens |
| --- | ---: | ---: | ---: | ---: |
| 发现、查证与制定修订计划 | 14 | 475,398 | 15 | 404,934 |
| **进入最终提交的排班及交班稿返工** | **6** | **279,241** | **2** | **64,873** |
| 最终候选的复算、测试与验证 | 7 | 384,158 | 4 | 177,300 |
| **Principal 的交付收尾** | **4** | **219,294** | **4** | **155,492** |
| 私有副本修改 | 4 | 242,985 | 0 | 0 |
| 私有副本内容检查与验证 | 6 | 373,317 | 0 | 0 |
| 维护者的私有提交、检查或结束复核 | 9 | 616,802 | 2 | 105,618 |
| 未成功的尝试 | 3 | 161,657 | 1 | 46,267 |
| 同笔跨阶段 | 1 | 21,764 | 1 | 39,025 |

有效返工包括真实留在提交里的文稿修订，不等于每次修订都带来新业务价值。P 的混合笔同时有成功旧表实测和错误 SHA 的拒绝；F 的混合笔同时验证 85% 缺口和最终提交状态。每笔只入一行。完整逐笔文件含角色、调用和结果序号、理由，以及每笔 fresh、cache read、cache write 和 output。[人工分类依据](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/phase-labels.json) · [逐笔复算](../../research-evidence/pnwf-task-selection/2026-11-19/depot-relief/phases.json)

**多出来的用量发生在哪。** P 比 F 多 25 笔、1,781,107 tokens。其中维护者多 19 笔、1,303,471 tokens，约占总差额的 73.2%。P 的 cache read 多 1,769,856，fresh input 反而少 6,525。仅 P 维护者在私有副本修改和验证就有 10 笔、616,302 tokens，回传契约不能携带这些文件。两位 Principal 的交付收尾都是 4 笔；即便把 P 的产品结论调用全部计入，Principal 收尾差额也只有 63,802 tokens。

**这条轨迹支持的协作结论。** 两组都在不提示委派的情况下，两次向有历史工作记录的同伴求证，并在第一次回传之后把反例落实到同样的两格排班。两位 Principal 都在首次联系之前拿到了决定性数值，第二次回传后排班也没有再改。证据支持自主求证和跨角色复核，尚不能把两格修订归因为维护者独有的信息，也不能据这一对推断两种系统通常会怎样协作。里程碑二继续开放。

## 零付费复算

在仓库根目录用 PowerShell 执行以下命令，可从原始 DSH 流和请求终态重建归因、从 Git bundle 还原评分，再按人工标注重新汇总用量。

```powershell
$evidence = 'research-evidence/pnwf-task-selection/2026-11-19/depot-relief'
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/mock"
node scripts/pnwf/depot-relief/archive.mjs --verify "$evidence/live"
$recount = Join-Path $env:TEMP 'depot-relief-phases-recount.json'
node scripts/pnwf/depot-relief/phases.mjs "$evidence/live" "$evidence/phase-labels.json" $recount
(Get-FileHash $recount).Hash -eq (Get-FileHash "$evidence/phases.json").Hash
```
