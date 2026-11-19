# R7 签发时按请求功率逐格核验

上轮两组都把 B 车 01:00 和 01:30 设为 70/70 kW。01:00 的站控上限是 50 kW。模拟车辆在限幅后确实达到 130 kWh，但请求比上限高 20 kW。此前的签发入口只核验提交与文件义务，P 因此能够记录 DELIVER。原两份提交和各自 6/10 的判分已纳入回归。[原轨迹与逐项判分](DEPOT-TRANSFERABILITY.md)

新回执为每个时段列出请求 kW、上限 kW、实际 kW 和超限 kW。宿主从当前完整 SHA 读取班表，从冻结基线读取适用的 23:40 上限；候选自填的回执无法覆盖它们。只要一个时段超限，签发返回 `REQUEST_POWER_EXCEEDS_LIMIT`、全部违规时段和修订动作。候选可以提交并作为台架试件。合法班表仍须通过原文件义务，并在放行单引用含相同班表 blob 的完整 SHA。门禁本身不提供私有车端电量或业务答案。[签发校验](../../scripts/pnwf/depot-transfer/release-power.mjs) · [历史提交回归](../../scripts/pnwf/depot-transfer/release-power.test.mjs)

双方可通过 `depot_release_check` 预检当前提交。P 记录 DELIVER 前使用同一门禁。会话结束后，宿主对最终 HEAD 再核验一次，F 的自然退出与业务签发分别记账。模型能主动联系隔离维护者；其 SHA 绑定回执也显示请求超限会导致拒签。21:00 本席工具的结果标明工况，只供复测。[冻结协议](../../scripts/pnwf/depot-transfer/release-protocol.md)

## 零付费资格

Mock 脚本先提交 70/70 kW 草案。P 的 DELIVER 和 F 的签发预检均在轨迹 23→24 收到拒绝。两组随后提交 50/70 kW 班表，向维护者复测该提交，并按 126/124 kWh 签发 A GO、B HOLD。两个最终 HEAD 均通过独立 10/10 和签发门禁，自然退出。P 用 9 笔模拟请求，F 用 8 笔，付费调用为零。历史两份 6/10、跨 SHA 重试、多时段超限、伪造候选回执和引用旧班表均有独立回归。[两组 Mock 归档](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/mock/matrix.json)

## 真实模型怎样处置拒绝

**Palimpsest。** Principal 在原表上主动调用签发预检（75→76）。首个拒绝点名 01:00 要求 70 kW，上限和实际均为 50，超 20 kW。它又联系上一班维护者核对原表（105→106），看到 B 车仅有 121 kWh。随后提交 `4802b23c`，把 B 的 01:00/01:30 从 70/50 改为 50/70 kW。该版本的预检（137→138）通过功率检查，但因还没有完整放行单和更新的交班稿被拒。维护者对同一 SHA 返回新净量 126/124 kWh（141→142）。Principal 将 A 余量 0、B 缺 6 和 B 停发写入放行单，85% 时两车均停。最终 `3f7575373992a5efb9f8df59a9f8c64611d24678` 通过预检（169→170），记录 DELIVER（215→216），自然退出。11 份原始材料逐条保留，冻结 10/10。两次复核回传后均为零请求。[轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/live/controller-P/trajectory.json) · [提交与评分](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/live/controller-P/observation.json)

**强原生 DSH。** Principal 最初拿旧回执所指的 SHA 做试排与签发预检（71→72、73→74），收到当前 HEAD 不匹配的反馈。换用当前基线后，本席旧工况仍算出 126/130，但签发预检明确拒绝 01:00 超限 20 kW（77→78），维护者也实测原表只能到 126/121（83→84）。模型提交 `6c6999a0`，将 B 改为 50/70 kW。新版本的晚班实测给出 B 为 124（125→126），预检列出了仍待交付的放行单和交班稿（127→128）。对同一 SHA 再问时读回了已存回执（135→136）。最终 `af47bfbf81ab93813f9350223118ee2c513b6ddd` 签发 A GO、B HOLD，85% 时两车均 HOLD。模型对最终 HEAD 做了通过的签发预检（195→196），又请维护者复测一次（199→200），自然退出。11 份原件保留，冻结 10/10。[逐次调用](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/live/controller-F/trajectory.json) · [交班原稿](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/live/controller-F/submitted/HANDOVER.md)

两组都在签发草案前主动预检，都收到了可以定位到时段的拒绝。修订后的 21:00 本席试排仍报超限；该采集的上限与 23:40 不同，不能将其算作对正确最终工单的签发拒绝。两组均用适用的晚班回执签发。真实会话没有尝试对超限工单强行记录 DELIVER；该拦截由 P Mock 和两份历史提交回归直接验证。

## 用量与上轮对比

| 组别 | 冻结分 | 请求 | 总 tokens | 维护者请求 / tokens | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| P 上轮 | 6/10 | 53 | 2,619,300 | 12 / 669,449 | 16:39.438 |
| P 本轮 | 10/10 | 29 | 1,161,303 | 5 / 246,585 | 8:10.874 |
| F 上轮 | 6/10 | 48 | 2,385,152 | 4 / 191,538 | 10:33.495 |
| F 本轮 | 10/10 | 31 | 1,289,851 | 7 / 339,855 | 8:16.294 |

本轮两个 Principal 各用 24 笔，P 为 914,718 tokens，F 为 949,996 tokens。两者请求数的差异全部来自复核。P 启动两次维护者；F 启动三次，其中最后一次针对与修订版本具有相同班表 blob 的交付 HEAD。P 维护者用量为 fresh 52,069、cache read 191,872、output 2,644；F 分别为 52,119、285,952、1,784。两者 cache write 均为零，五次复核在回传后均为零请求。两组新增 60 笔、2,451,154 tokens，全部结算。

与各自上轮相比，P 少 24 笔、1,457,997 tokens，F 少 17 笔、1,095,301 tokens。此前两组都围绕超出允许范围的请求继续试排并签发 70/70；本轮两组看到拒绝后都保留了合法的 50/70。F 本轮维护者用量反而增加 148,317 tokens，总量下降主要来自 Principal。在这一对样本中，轨迹能核对拒绝、改表和交付的顺序，单次前后对照不能独立估计该修复的平均节省量。[修复前后按调用 ID 的对比](../../research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/comparison.json)

## 零付费复算

```powershell
$root = 'research-evidence/pnwf-task-selection/2026-11-20'
$archive = "$root/r7-release-power"
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/case.test.mjs scripts/pnwf/depot-transfer/release-power.test.mjs
node scripts/pnwf/depot-transfer/run.mjs r7-verify $archive
$out = Join-Path $env:TEMP 'r7-release-power-comparison.json'
node scripts/pnwf/depot-transfer/release-comparison.mjs $archive "$root/depot-transfer" $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$archive/comparison.json").Hash
```
