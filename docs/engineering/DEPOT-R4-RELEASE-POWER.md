# 夜班调度 R4 与 R7：何时需要请维护者再测一次

## 原表可以支持哪项决定

两种站型的 23:40 原表回执读数相同。B 车在 01:00、01:30 请求 70/50 kW，第一格的交流上限为 50 kW，限幅后按 90% 效率离场只有 121 kWh，放行线为 130 kWh。签发端从候选 Git 对象读请求，从基线读逐格上限。原表作为测量证据仍有效；签发该表会收到包含时段、请求 70、实际 50、超额 20 kW 的拒绝。

| 修订后 B 车两格均为 50/70 kW | R4 固定时段上限 | R7 有序列记忆的车端调节器 |
| --- | --- | --- |
| 原表回执能推导什么 | 保持原半小时时段、两车窗口和 20 kW 平移后，可按新交流设定重算车端电量 | 可以推出交流请求合法；车端净量取决于修订后的序列 |
| B 车在 90% 工况的复算 | 起始 76 + (50 + 70) × 0.5 × 0.90 = **130 kWh**，余 0，GO | 同一名义值 130 kWh；修订版实测多出 6 kWh 辅耗，净 **124 kWh**，缺 6，HOLD |
| 再问维护者会增加什么证据 | 对同样结果的独立确认 | 决定 B 车能否放行的实测反例 |

A 车均为 126 kWh，余 0，可放行。85% 工况两车均 HOLD。R4 的旧回执路径核对归档 SHA、原表 blob 和候选运行条件，十一份基线材料受文件义务保护。两组均可预检当前 HEAD，P 的 DELIVER 与最终归档也复用该门禁。宿主单独核对业务分、实际证据来源、签发和自然退出。[冻结协议](../../scripts/pnwf/depot-transfer/r4-protocol.md) · [签发实现](../../scripts/pnwf/depot-transfer/release-power.mjs)

## 零付费资格

五项定向测试通过，包含旧 R4-P 2/10、旧 R4-F 合法提交和两份原 R7 6/10。普通 DSH 的两条脚本化 Mock 均先提交超限草案，实际收到拒签，再把 B 改成 50/70。两组均引用归档原表 `341e19e288de9f561f85fcb66a7a910ff6f3e143`，签发回执记为 `ORIGINAL_RECEIPT_REUSED`，冻结 10/10，自然退出。P 记录 DELIVER。P 用 7 笔模拟请求，强原生用 6 笔，均无维护者调用。两组 Mock 完成复算后才开放真实运行。[资格矩阵](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/mock/matrix.json)

## 历史观察

首次真实 R4-P 第 7 笔等待 240 秒后超时，6 笔确认 97,161 tokens；第 7 笔仍为 UNKNOWN，整场总量未知。没有候选提交，原判 2/10。旧 R4-F 在原表、合法修订各联系一次维护者，按实测的 126/130 签发，10/10；维护者用了 7 笔、350,385 tokens。本轮沿用两组各自原有的入口与同一 R4 基线。[历史停止账本](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/envelope-P/out/REVIEW/request-accounting.json) · [旧两批次轨迹](DEPOT-TRANSFERABILITY.md)

R7 的对照来自已签发的真实归档。P 在原表收到超限拒绝（75→76），再联系维护者（105→106）；改表后对修订 SHA 复核（141→142）。F 先复核原表（83→84），再测修订 SHA（125→126），同 SHA 再问读回缓存（135→136），最后又对仅增加交付文件的 HEAD 实测（199→200）。两组第一次收到修订实测时都还没有提交该版的放行单。随后两组都把 B 缺 6 kWh、HOLD 写入首次签发的决定。轨迹能证明反例进入交付；Git 中没有先签 GO 再撤销的过程。F 最后一次实测确认了已提交的决定。[R7 逐组分析](DEPOT-R7-RELEASE-POWER.md)

## 本轮真实 R4 如何签发

**Palimpsest，6/10。** 初次签发预检（91→92）指出原表 01:00 超限 20 kW，本席 21:00 试排（93→94）却给出 A/B 126/130。Principal 想确认明早该信哪份记录。它先拿归档原表 SHA 联系维护者，被要求使用当前 HEAD（103→104），换成基线后收到 23:40 的 126/121（109→110）。这是对原表的确认。

决定性的分歧出现在本地计算（115→116）。Principal 把 `night.json` 推算的楼宇负载上限与较新的晚班实测上限逐格取小值，在预约平移 20 kW 时算出 80/40/50/50。交班稿明确把晚班最后一格的 70 kW 又压成了“物理可用 50”。它在 `98ce21507762ed3d446c4a82382dbf431ddd24bf` 同时提交班表和 B HOLD。该表确实合法，B 也确实只有 121 kWh；少排最后一格的 20 kW，损失了 10 kWh 交流电量和 9 kWh 电池增量。按冻结工况还有足够余地让 B 达到放行线。[交班原稿](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/envelope-P/submitted/HANDOVER.md)

此后两次成功复核均发生在 B HOLD 已提交之后。231→232 实测 50/50，回传 126/121；Principal 增加修订回执与交班稿引用，班表和决定均未动。261→262 又测最终 HEAD 的相同班表，得到同一结果。有效送达 3 次，另有 2 次错误 SHA 联系未启动维护者。最终放行单沿用原表 SHA，宿主签发通过，277→278 记录 DELIVER 后自然退出。十一份原材料保留。独立评分扣在班表、净电量、余量和 B 的决定四项。三次维护者分别用 46,398、48,368、50,028 tokens，全部在回传前，回传后零请求。该模型向维护者问的是给定版本是否合规，返回的实测无法检验从未送测的 50/70 方案。[调用与结果](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/envelope-P/trajectory.json) · [逐提交记录](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/envelope-P/observation.json)

**强原生 DSH，6/10。** 77→78 已看到原表超限，79→80 的本席试排给出 126/130，81→82 的晚班原表实测给出 126/121。它同样把第四格的楼宇名义负荷与 23:40 上限叠加，在交班稿写明第四格建筑负荷 70、接入总容量 120、B 只排 50。模型先写交班稿（125→126）与 A GO、B HOLD 放行单（131→132），单独提交班表 `137a5347f5c709a2b671e9581c73923c4369ae4d`。预检 145→146 因还有未提交的文件而拒签。149→150 的修订实测确认 126/121，155→158 提交既有放行单。163→164 通过签发预检，165→166 又对最终 HEAD `70ade1b83e2b01ed0cd01dea9dd7f1644f9e459b` 复核。三次送达均启动了维护者，每次回传后零请求。放行单引用原表 SHA，十一份旧材料保留，自然退出。独立扣分项与 P 相同。第二次回传时 B HOLD 仍在工作区草稿中；只看提交时间会误以为它由这次复核首次提出。[F 调用与结果](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/envelope-F/trajectory.json) · [放行单与提交](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/envelope-F/observation.json)

## 复核成本与决策收益

| 真实会话 | 冻结分 | 全部请求 / tokens | 其中维护者请求 / tokens | 维护者 fresh / cache read / output | 会话耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| R4 Palimpsest | 6/10 | 34 / 1,546,268 | 3 / 144,794 | 49,850 / 93,952 / 992 | 12:08.479 |
| R4 强原生 | 6/10 | 23 / 823,305 | 3 / 146,907 | 50,665 / 94,464 / 1,778 | 5:17.156 |
| R7 Palimpsest（历史） | 10/10 | 29 / 1,161,303 | 5 / 246,585 | 52,069 / 191,872 / 2,644 | 8:10.874 |
| R7 强原生（历史） | 10/10 | 31 / 1,289,851 | 7 / 339,855 | 52,119 / 285,952 / 1,784 | 8:16.294 |

维护者 cache write 均为零。R4 新增 **57 笔、2,369,573 tokens**，全部结算；其中维护者 6 笔、291,701 tokens。P 和 F 都主动求证三次，都没有正式委派。P 多出的 11 笔全部来自 Principal（31 对 20）。复核送达后，P 另存了修订回执；F 提交已有草稿。两组的最后一次复核都测了班表 blob 相同、仅增加交付材料的 HEAD，没有改变逐车决定。[逐笔配对、角色用量与 Git 对比](../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/comparison.json)

**什么情况下再次求证有价值？** R7 修订版实测检验的是原证据回答不了的问题：升功率序列会额外耗掉多少车端电量。其结果把可放行的名义预测降到阈值以下，两组都在收到反例之后才写放行单。R4 的反事实可以直接检验：Mock 已在相同基线以原表回执签发 50/70，独立评分通过；旧 R4-F 还实际测过该表并得到 130。这轮两个 Principal 选择同时满足新旧上限，实测确认了它们选中的 50/50，无法判定还有没有更优设定。因而本次失败集中在如何处理相冲突的新旧资料，以及送测了哪个候选。签发回执准确回答了“这张表是否超限”，冻结业务评分另查“是否充分利用了可用充电量”。每种入口每站型只有一条本轮或历史轨迹，无法从这些样本估计平均协作收益。

## 离线复算

```powershell
$day = 'research-evidence/pnwf-task-selection/2026-11-20'
$a = "$day/r4-release-power"
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/case.test.mjs scripts/pnwf/depot-transfer/release-power.test.mjs scripts/pnwf/depot-transfer/r4-release.test.mjs
node scripts/pnwf/depot-transfer/run.mjs r4-verify $a
node scripts/pnwf/depot-transfer/run.mjs r7-verify "$day/r7-release-power"
$out = Join-Path $env:TEMP 'r4-release-power-comparison.json'
node scripts/pnwf/depot-transfer/release-comparison.mjs $a "$day/r7-release-power" $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$a/comparison.json").Hash
```
