# 河湾夜班：什么情况下值得对修订版再求证

两张工单使用相同的业务提示，面向同一充电模型。模型接手时，原表的晚班实测已经归档，B 车在 90% 效率下只能到 121 kWh，距放行线 130 kWh 还差 9。决定性区别只出现在回执的适用范围。两组都能查档、修改班表、提交候选和联系在独立副本工作的维护者。

| 冻结条件 | R4（固定上限） | R7（车端调节器） |
| --- | --- | --- |
| 起始回执的承诺 | 时段上限可跨设定复用，90% 车端换算有效 | AC 上限可复用，车端净量仅对所测序列有效 |
| 同一业务修订 | B 的 01:00 / 01:30 从 70/50 调为 50/70 kW | 相同 |
| 车端独立核验 | A 126、B 130 kWh，均可有条件放行 | 新序列触发模拟调温，辅助电表增加 6 kWh。A 126 可放，B 124、缺 6，停发 |
| 机会成本 | 可据原回执计算；额外联系仍记录业务分和耗时 | 本地名义模型无法观测这笔能耗，复核能推翻双车放行决定 |

R7 没有在原表上预埋可读的“停发”答案。资格用例对两棵 Git 树逐项比较，只有原回执文件不同。去掉适用范围文字，两份原回执完全相等。仅改文档并提交不会触发调温；两次公开试排在相同修订设定上也相等。6 kWh 属于冻结的模拟车辆台架模型，宿主在确切 Git 对象上生成车端读数。Principal 看到的回执须以自己工具调用的实际结果为准。[工单与评分实现](../../scripts/pnwf/depot-transfer/case.mjs) · [隔离与对照用例](../../scripts/pnwf/depot-transfer/case.test.mjs)

实验分开记录三个问题。第一，最终提交中的班表、逐车决定和余量是否正确；第二，引用的数据是否适用于最终班表；第三，谁主动寻求了新观测、哪份回执确实到达、随后写进了什么。模型提前猜中停发、在缺数据时暂缓、实测后更正先前结论、实测后首次形成正式决定，分别按证据解释。机器人执行脚本的 Mock 只验证运输、计量和验收链。[冻结判据](../../scripts/pnwf/depot-transfer/protocol.md) · [基线、提示和镜像封印](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/frozen.json)

## 四格零付费资格

| 工单 / 组 | 独立验收 | 总模拟请求 | 维护者请求 / 模拟 tokens | 从证据到提交 |
| --- | ---: | ---: | ---: | --- |
| R4 Palimpsest | 10/10 | 5 | 0 / 0 | 引用原表回执，提交 A、B 放行，记录 DELIVER |
| R4 强原生 | 10/10 | 4 | 0 / 0 | 相同的逐车放行决定，引用同一原表 SHA |
| R7 强原生 | 10/10 | 6 | 1 / 214,307 | 改两格并提交候选，取得新台架净量后签发 A 放行、B 停发 |
| R7 Palimpsest | 10/10 | 7 | 1 / 214,307 | 相同的净量和放行决定，记录 DELIVER |

四格均自然退出。两个 R7 Mock 的工具结果 32 都收到修订 SHA 的 AC 上限和 B 车辅助表两次读数。候选中当时只有修订班表，未签发逐车决定；37→40 的提交首次将 124 kWh、负 6 kWh、B HOLD 写入放行单，同时更新交班稿。两位维护者的回传后请求和用量均为零。Mock 每位维护者的 214,307 是恢复会话下的合成计量，四格付费调用均为 0。[逐格结果、回执和复核用量](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/comparison.json)

## 真实运行的停止位置

按冻结顺序先运行 R4 Palimpsest。Principal 读取了原回执（50→55），完整看到了 B 车原表净量 121 kWh 及上限可复用的说明。随后查阅维护者名录（73→74），并用自己的公开试排对原表做了交叉检查（75→76）。查询名录未启动维护者，本席试排使用的是 21:00 数据。完整轨迹没有联系、委派或写入操作，18 次工具调用均配到结果。

该格第 7 笔请求达到 240 秒，Provider 没有给出终态用量。请求 `32b9ae4e-3fad-4e5f-81da-283dbd539ba5` 封存为 UNKNOWN。6 笔已结算请求都来自 Principal：fresh 24,413、cache read 68,992、cache write 0、output 3,756，共 **97,161 tokens**。维护者 **0 笔、0 tokens**。会话耗时 **7:01.165**，由宿主停止。最终 HEAD 仍为 `234b5326c1c94595a23407ada5f92fa5b8c9ca52`，工作区干净；没有新放行单或 DELIVER。冻结 2/10，仅保护原件和范围两项通过。未联系维护者只反映停止时的状态，不能判定模型已经选择独立签发。[双端计量与停止事实](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/envelope-P/out/REVIEW/request-accounting.json) · [逐次调用](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/envelope-P/trajectory.json)

第一批真实矩阵在该 UNKNOWN 后关闭准入，当时 R4 强原生、R7 强原生、R7 Palimpsest 均未启动。[原批次停止记录](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/matrix.json)

## 当前账号探针与后续三格

11 月 20 日 00:14（北京时间），宿主通过实验使用的同一网关向 OpenCode Go 发出一笔流式请求。模型 `deepseek-v4.1-flash` 返回 `record_probe(7)`，宿主计算得 8，生成与该调用 ID 配对的工具结果。探针仅用一笔请求，结果在本地配对。网关往返 2.538 秒，HTTP 200，响应以 `message_stop` 结束。Provider 和 SQLite 均记录 fresh input 299、cache read/write 各 0、output 40，共 339 tokens，未决 0。探针单独计量。原 R4-P 的 240 秒超时继续保留 UNKNOWN。[单笔回放与终态计量](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/probe/probe.json)

**R4 强原生**在原表上联系维护者（145→146），复得 A/B 离场 126/121 kWh。Principal 把 B 的两格从 70/50 改为 50/70 kW，在 `193c52cc` 提交班表后再次联系维护者（181→182），得到 126/130。随后在 `2c5d25cc` 提交放行单、交班稿和回执，90% 时双车 GO、85% 时双车 HOLD。冻结 10/10，自然退出，耗时 8:11.767。两次复核均成功，但决定所需数值在固定上限合同下已经可以从首份回执算出。两次复核合计占 7/33 笔、350,385/1,258,159 tokens（27.8%），回传后均零请求。Principal 的 46 次和维护者的 16 次工具调用均配到结果。[提交、联系顺序与角色计量](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/envelope-F/observation.json)

**R7 强原生**在 `6762d9c0` 提交 B 的 50/70 kW 候选并主动求证。维护者回传 126/124 kWh（115→116），其中 B 比要求少 6 kWh。Principal 随即把 01:00 从 50 提回 70，保留 01:30 的 70，并请维护者实测新序列（129→130）。台架确实把交流输出限为 50/70，辅助表没有增加，B 达到 130；该回执也明确记录 `withinLimits: false`，因为首格请求比允许值高 20 kW。第三次联系（159→160）读回同 SHA，第四次（181→182）对最终班表提交 `4f995e52` 取得回执。模型在放行单中签发双车 GO，在交班稿中解释了受限方案的 6 kWh 反例和自己依赖限幅的处置。

冻结验收保留 **6/10**。班表、离场量、余量、B 放行四项失败；保护文件、写范围、提交和低效率等项通过。该格观察到了维护者的实测改变后续班表，也观察到了 Principal 为争取放行而接受超限设定。最终班表与回执所测 blob 一致，证明引用可追溯；能由台架限幅执行，仍不足以满足工单的设定上限。最终 HEAD 为 `4fd15bbd`，自然退出，耗时 10:33.495。48 笔全部结算，Principal 44 笔、2,193,614 tokens，维护者 4 笔、191,538 tokens。四次联系共三次启动维护者，各次回传后均零请求。[调用、逐项评分与 Git 记录](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/controller-F/observation.json) · [模型提交的交班原稿](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/controller-F/submitted/HANDOVER.md)

**R7 Palimpsest**先复核原表（97→98），再提交 50/70 kW 修订表（`73af740f`）。维护者回传 126/124 kWh（117→118），由此确认 B 无法按这张表放行。Principal 又试了 50/80、70/70、70/80、80/80 四组 B 车设定。四个版本的实测回执均显示请求超出窗口；70/70 和 80/80 在限幅后达到 130 kWh。它选择 70/70，将 B 的 01:00 格从 50 提为 70，在 `72116e8f` 的复核回执（221→222）后提交双车放行单和交班稿。最终 `5de198ab` 记录 DELIVER 并自然退出，耗时 16:39.438，冻结 **6/10**，失分项与强原生相同。11 份原始材料的 Git 条目全部保留。[候选与逐项验收](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/controller-P/observation.json) · [交班原稿](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/controller-P/submitted/HANDOVER.md)

同一 R7 基线下，两边都主动求证，最先带回 6 kWh 反例的是隔离维护者。两边都用反例改了班表，随后又接受了依赖站控限幅的设定，结果同为 6/10。Palimpsest 比强原生多用 5 笔、234,148 tokens 和 6:05.943。其中 Principal 少 3 笔、243,763 tokens，维护者多 8 笔、477,911 tokens。额外开销集中在更多候选实测，未换来更高交付分。本样本只覆盖一次完整的 R7 配对。R4-P 的停止发生在签发前，R4 无法比较两种方式完成同一工单的成本。

| 真实组 | 准入 / 已结算 | 已确认 tokens | 维护者请求 / tokens | 联系尝试 / 收到回执 / 新启动复核 | 冻结分 |
| --- | ---: | ---: | ---: | ---: | ---: |
| R4 Palimpsest（原批次） | 7 / 6 | 97,161，另 1 笔 UNKNOWN | 0 / 0 | 0 / 0 / 0 | 2/10 |
| R4 强原生 | 33 / 33 | 1,258,159 | 7 / 350,385 | 3 / 2 / 2 | 10/10 |
| R7 强原生 | 48 / 48 | 2,385,152 | 4 / 191,538 | 6 / 4 / 3 | 6/10 |
| R7 Palimpsest | 53 / 53 | 2,619,300 | 12 / 669,449 | 11 / 7 / 7 | 6/10 |

恢复的三个会话共 134 笔、6,262,611 tokens，全部结算并自然退出。每位维护者在有效回传后均为零请求。探针另外计 339 tokens。四格合计已确认 6,359,772 tokens，原 R4-P 的第 7 笔继续 UNKNOWN，整轮总用量仍未知。[两批次合并对比](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/comparison.json)

回执投递数按 Principal 轨迹中的调用 ID 和工具结果复算，再逐份与宿主 RETURN 日志对照。冻结的 R7-P 观察器按 SHA 和问题文本找第一次调用，在同一参数被拒后重试成功时，把三个后来的成功结果放进了 `extraContacts`。合并对比中的 `contactCalls` 保留了 11 次调用各自的结果，其中 4 次因 SHA 与当前检出不符被拒、7 次收到回执。原始观察文件和冻结分仍可复算。[原始轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/controller-P/trajectory.json)

## 离线复算

```powershell
$archive = 'research-evidence/pnwf-task-selection/2026-11-19/depot-transfer'
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/case.test.mjs
node scripts/pnwf/depot-transfer/run.mjs verify $archive
$out = Join-Path $env:TEMP 'depot-transfer-comparison.json'
node scripts/pnwf/depot-transfer/compare.mjs $archive $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$archive/comparison.json").Hash
$resume = 'research-evidence/pnwf-task-selection/2026-11-20/depot-transfer'
node scripts/pnwf/depot-transfer/run.mjs verify-resume $archive $resume
node scripts/pnwf/depot-transfer/compare.mjs $archive $out $resume
(Get-FileHash $out).Hash -eq (Get-FileHash "$resume/comparison.json").Hash
```
