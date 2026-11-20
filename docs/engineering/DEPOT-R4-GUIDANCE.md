# R4：读懂晚班证据与收到签发提示，分别能带来什么

上轮两位 Principal 都主动预检，宿主首先明确指出 B 车 01:30 少排 20 kW，两组均在修订表回执送达前提交 B GO。仅凭那一轮，无法判断哪一项信息影响了改表。本轮从主线 `e639e549` 接续，四格都从 `234b5326c1c94595a23407ada5f92fa5b8c9ca52` 启动，用户提示沿用原业务工单。[上轮对比](DEPOT-R4-WINDOW.md) · [本轮冻结协议](../../scripts/pnwf/depot-transfer/split-protocol.md)

| 模型可获得的信息 | 说明组 | 提示组 |
| --- | --- | --- |
| 原始班表、两份记录、原表 SHA、各格请求和上限 | 相同 | 相同 |
| 工具与本席试排新增的晚班实测替代旧负荷推算说明 | 有 | 无；仍能自行阅读冻结档案中的适用范围 |
| 签发结果对 01:30 未用 20 kW 的显式点名 | 隐藏缺额字段；仅少排时要求复查工单 | 显示时段、车辆、请求、可用和未用 kW |
| 超限拒签、少排拒签、SHA 与原件保护、独立评分 | 相同 | 相同 |

说明组的预检仍提供可自行做差的逐格数值。两种条件都能查档、联系同一维护者，也都必须提交合法且用满窗口的班表。这里比较的是**增加优先级说明**或**增加缺额提示**后，模型在什么时点作出可见判断。看到两个数、明确算出其差、实际增加末格功率、签发 B GO 分开记录；未写出的推理无法从轨迹认定。

历史两端提供了参照：两项均未新增时，P/F 都提交了 B 车 50/50，测得 121 kWh 后签发 HOLD，各 6/10；两项同时开启时，都在预检点名后改为 50/70，算得 130 kWh 并签发 GO，各 10/10。历史第一轮采用旧签发门禁。新两组使用相同的严格门禁，按说明 P/F、提示 F/P 顺序各跑一次；模型输出的变异、运行顺序和缓存差异限制了因果比较。[早期原判](DEPOT-R4-RELEASE-POWER.md) · [上轮双开启](DEPOT-R4-WINDOW.md)

## 说明组怎样使用未点名的数据

**Palimpsest。** Principal 首次预检（85→86）收到了 01:00 超限的诊断及逐格原数值。全程没有收到 01:30 的少排提示。它先请维护者核对原表，问题明确问到 01:00（101→102）；返回的 126/121 对应原表。随后 Principal 按晚班上限复算（118），把 B 的 70/50 改为 50/70（126），写入 B GO（128），并在交班稿（134）明确说明将 20 kW 移到 01:30。这是有原表复核参与、未获缺额点名的显式识别。

首版正确决定已提交在 `a5823d8c`。维护者对修订版复核（164）后，Principal 补了交班稿中的核验说明，重写提交为 `c2a884fd6e73d9814c977d47ba6615bb18543564`，再请维护者确认最终版（186）。两次修订表实测均为 126/130，B 保持 GO。首个修订 SHA 在最终提交的父链之外，核对决定时使用了当次送测前保存的 Git bundle。[调用序列](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/priority-P/trajectory.json)

**强原生 DSH。** 首次预检（75→76）只点名 01:00 超限。Principal 请求维护者核对晚班记录，第一次使用归档 SHA 被拒（85→86），换用当前基线后取得原表 126/121（91→92）。这份实测提供原表的事实。Principal 随后将 B 改为 50/70（132→133），首次写出的放行单就是 B GO（138→139）。交班稿（144→145）明确比较了末格原请求 50 与可用 70，解释了这半小时为何恰能补齐 9 kWh。在提交 `dc79f4117835639200c62c61542bf649b35baa27` 后才复核修订表（168→169）；返回 126/130，业务决定与最终提交均未变。两条说明组轨迹均在宿主始终隐藏少排诊断的条件下明确识别并修正了差额，两组也都先求证了原表。[F 调用序列](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/priority-F/trajectory.json) · [F 交班稿](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/priority-F/submitted/HANDOVER.md)

## 提示组在点名前后做了什么

**Palimpsest。** 在查档、读 Git 和本席试排之后，预检（79→80）首先明确指出 B 车末格少排 20 kW。此前可见轨迹没有计算或指出这一差额。Principal 接着请维护者实测原表（97→98），修表，并在交班稿（131→132）写明按 90% 效率 A/B 均可放行、B 离场 130 kWh。提交 `8c1e818c` 已含这份稿和新班表。预检发现放行单文件缺失（145→146），维护者随后实测修订 SHA（147→148），确认 126/130。Principal 再单独写入放行单（163→164），最终记录 DELIVER（245→246）。只看 `release.json` 的创建时间会把复核误判成首次决策；交班稿已经留下了可核验的 B GO。[P 轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/hint-P/trajectory.json) · [P 提交与评分](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/hint-P/observation.json)

**强原生 DSH。** 点名前的可见操作是查档、核对 Git 来源及本席试排，没有显式计算或改表。预检 89→90 首次给出 B 车 01:30 未用 20 kW。Principal 随后在向维护者核对原表时主动提出把 20 kW 移到末格（107→108），改表并单独提交 `ba67379c`（120→121、126→129）。旧本席在修订表上仍给 126/121，维护者返回 126/130（138→139）。之后才第一次写出 B GO（144→145）。这次实测参与了首次签发；当时没有一份 B HOLD 草稿或提交被推翻。两次后续复核（168→169、288→289）均确认已提交的 GO。模型多次回读本席和签发门禁、另存回执并修订交班稿，最终 HEAD 为 `8a206b08029486e3f7e0a15345f5d974211edca4`。[F 轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/hint-F/trajectory.json) · [F 提交与评分](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/hint-F/observation.json)

## 四条轨迹的交付与用量

四份提交均为 10/10。A 的两格为 80/40 kW，B 的两格为 50/70 kW；90% 效率下，A/B 离场电量为 126/130 kWh，均恰好达到要求，85% 效率下两车均 HOLD。四格均保留 11 份受保护原件、取得适用的签发依据并自然退出，两条 Palimpsest 会话均记录 DELIVER。两名说明组 Principal 都在读取原数值并求证原表后自行算对。提示组两人都是在预检点名后才留下明确识别的证据。三格在复测修订表之前已有 B GO 的文字或放行单，提示组强原生在复测之后才写出首次 GO，四格均未发生已记录的 HOLD 改为 GO。[逐格提交、账本及调用序号](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/comparison.json)

| 条件 / Principal | 总请求 | 总 tokens | 会话耗时 | 返回实测次数 | 维护者请求 | 维护者 fresh / cache read / output | 维护者总 tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 说明 / Palimpsest | 31 | 1,173,446 | 7:02.620 | 3 | 8 | 101,289 / 296,704 / 2,418 | 400,411 |
| 说明 / 强原生 DSH | 30 | 1,016,887 | 6:41.610 | 2 | 8 | 59,019 / 355,200 / 3,981 | 418,200 |
| 提示 / Palimpsest | 34 | 1,432,685 | 9:48.523 | 2 | 4 | 2,966 / 185,088 / 868 | 188,922 |
| 提示 / 强原生 DSH | 40 | 1,859,284 | 11:33.945 | 4 | 7 | 10,242 / 343,808 / 2,414 | 356,464 |

总量包含维护者。四格合计 135 笔、5,482,302 tokens，全部结算。11 次实测使用 27 笔、1,363,997 tokens，每次返回后维护者新增请求均为零。说明组的两位 Principal 共用 45 笔、1,371,722 tokens，提示组为 63 笔、2,746,583 tokens；同期维护者分别为 818,611 和 545,386 tokens。提示组本次用量差异主要出在 Principal，尤其是强原生在改表后的多次核验与交付收尾。tokens 含缓存读取，未换算金额。各格只观察一次，不能据此估计长期节省率或哪个框架更优。

## 资格与归档恢复

首次四格 Mock 均验证了对应的工具说明和可见拒签响应，业务分各 10/10。九项定向回归通过。第一条真实会话结束后，归档工具发现前两份维护者副本保有 detached HEAD、index 和 objects，但缺少 Git 识别仓库所需的 refs 目录。恢复只在离线副本补建空目录，并核验 HEAD 对应的提交对象。原副本、送测试件、账本和会话原稿保留。第一次修订归档代码的 Mock 因引用了错误的局部变量中断，现场单独保存。运行前后的宿主源码摘要分别归档，输入、工具处理、判分和费用合同沿用冻结版本。[原始封印](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/frozen.json)

## 离线复算

修正归档后在新目录重跑四格零付费 Mock，全部通过；首条真实会话从原账本及 Git 对象离线恢复，只启动余下三格真实会话。两轮 Mock、四条真实轨迹和上轮 R4 均可独立复算。更早的 R4 两份 6/10、2/10 与第 7 笔 UNKNOWN 保留原记录。[恢复封印](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/recovery/seal.json) · [首条维护者副本核验](../../research-evidence/pnwf-task-selection/2026-11-20/r4-split/live/priority-P/desk/offline-copy.json)

```powershell
$day = 'research-evidence/pnwf-task-selection/2026-11-20'
$a = "$day/r4-split"
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/guidance.test.mjs scripts/pnwf/depot-transfer/window.test.mjs scripts/pnwf/depot-transfer/r4-release.test.mjs scripts/pnwf/depot-transfer/release-power.test.mjs scripts/pnwf/depot-transfer/case.test.mjs
node scripts/pnwf/depot-transfer/run.mjs r4-split-verify $a
node scripts/pnwf/depot-transfer/run.mjs r4-split-verify "$a/recovery/qualification"
$out = Join-Path $env:TEMP 'r4-split-comparison.json'
node scripts/pnwf/depot-transfer/release-comparison.mjs $a "$day/r4-window" $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$a/comparison.json").Hash
```
