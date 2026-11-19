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

真实矩阵在第一个 UNKNOWN 后按合同关闭准入，R4 强原生、R7 强原生、R7 Palimpsest 尚未启动。当前没有完整的真实配对，不能用该格比较两组的路线、反例采纳率或成本。[矩阵准入与四格状态](../../research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/matrix.json)

## 离线复算

```powershell
$archive = 'research-evidence/pnwf-task-selection/2026-11-19/depot-transfer'
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/case.test.mjs
node scripts/pnwf/depot-transfer/run.mjs verify $archive
$out = Join-Path $env:TEMP 'depot-transfer-comparison.json'
node scripts/pnwf/depot-transfer/compare.mjs $archive $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$archive/comparison.json").Hash
```
