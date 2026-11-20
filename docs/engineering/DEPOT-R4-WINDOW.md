# R4 晚班调度：为什么签发前还要核对未用功率

上轮两个真实会话分别提交了 `900856f6` 和 `70ade1b8`。两份放行单均通过原签发门禁，业务评分均为 **6/10**。它们把 B 车的 01:00 请求从 70 降到 50 kW，却保留 01:30 的 50 kW。在各自选择的班表上，维护者确实测得 B 离场 121 kWh。被漏掉的是同一窗口还有 20 kW 可排；半小时增加 10 kWh 交流电量，按 90% 效率恰能补齐 9 kWh 缺口。两份旧原稿、原判以及更早的 2/10 和第 7 笔 UNKNOWN 均保留。[上轮逐次复核与交付原稿](DEPOT-R4-RELEASE-POWER.md)

## 适用条件与签发

R4 的 23:40 实测给出已包含当班负荷和平移影响的交流上限。使用该证据须匹配冻结的冷夜工况、四格半小时、两车在场窗口和 20 kW 预约平移。此时再取旧楼宇负荷推算与实测值的较小值，会在最后一格重复扣减可用功率。21:00 本席工具仍按旧采集给出原始测量，两组看到相同的适用说明。输入仓库、用户业务目标和台架测量未变。

签发从当前 Git 提交读取请求功率，从冻结基线读取实测上限与原表窗口。窗口不匹配时拒绝套用证据；窗口相符时分别核对超额和少排，返回车、时段、可用功率、请求功率与差额。对两份历史 6/10 提交，新的预检都定位到 B 车 01:30 的 50/70 kW，少排 20 kW。旧门禁的通过回执仍可按原版本复算。业务判分独立核对班表、离场电量、余量和放行单；单独修正班表而保留旧 HOLD 放行单仍会扣分。[冻结协议](../../scripts/pnwf/depot-transfer/window-protocol.md) · [历史提交回归](../../scripts/pnwf/depot-transfer/window.test.mjs)

## 验证与真实轨迹

七项定向回归通过，包括两份原 6/10、旧 R4 的 2/10 与 R7 的旧超限案例。P Mock 经 DELIVER、F Mock 经签发预检收到两次真实工具拒绝，依次修复超限与少排，最终均沿用原回执签发、10/10、自然退出。两组各用 9、8 笔模拟请求，均未启动维护者。两组资格经离线核验后才启动付费实验。[Mock 矩阵](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/mock/matrix.json)

**Palimpsest。** Principal 先读班表（32→38）和晚班原始回执（60→65）。原始数值已可供它推算缺额。第一条显式给出 01:30、B、请求 50、可用 70、未用 20 的工具结果是 Principal 主动调用的签发预检（105→106），当时还没有维护者回传。Principal 随即修改两格（118→119），写交班稿和 B GO 放行单（124→125、130→131），提交 `894bd956d4bdf20dc0f7259ef586a42167665131`。它在同一 SHA 上同时核对旧本席、签发工具和晚班维护者；本席工具仍返回旧负荷下的 126/121，晚班实测返回 126/130（160→161）。Principal 增加了修订回执和交班稿引用，保留了原先的逐车决定。最终提交 `77ed57ce7edfd8e4309bdb299bbb4c54313a0a9a` 又获得一次 126/130 确认（188→189），215→216 记录 DELIVER，自然退出。两次复核均在回传后零请求。[P 轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/live/envelope-P/trajectory.json) · [P 提交与评分](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/live/envelope-P/observation.json)

**强原生 DSH。** 109→110 的签发预检先明确列出最后一格少排 20 kW，随后 Principal 才联系维护者核对原表（115→116）。维护者测得原表 126/121，确认原表不能按请求执行。Principal 按晚班上限自行复算 90% 与 85%（125→128），改表（156→157），写出 A/B 126/130、余量 0/0、90% GO/GO、85% HOLD/HOLD 的原稿（162→163），并提交 `9a3b4daa68ac0103938c96227c88e0845bf1acfc`。修订表复核（200→201）发生在 B GO 已提交之后，实测确认了 126/130。随后只在交班稿补记复核，最终提交 `e27b456af2e8e2dccde611016441d4dfc2f88a39`，224→225 预检通过后自然退出。原表的确认发生在决策前，可能加深模型对晚班记录的信任；没有证据表明维护者首次提出了修订方案或推翻已有决定。[F 轨迹](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/live/envelope-F/trajectory.json) · [F 提交与评分](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/live/envelope-F/observation.json)

两组均通过签发和独立 10/10，十一份保护材料逐 blob 保留，放行单都沿用原表证据 SHA。两组都直接把 B 的 70/50 改成 50/70。真实轨迹中没有先提交 50/50、遭少排拒签、再修正的事件；这条补救路径由两份历史提交与两组 Mock 验证。本轮相对上轮的业务决定从 HOLD 变为 GO；在本轮各自会话内，两份放行单的第一次落笔已经是 GO。

### 请求、维护者用量与耗时

| R4 真实会话 | 业务分 | 总请求 / tokens | 维护者请求 / tokens | 维护者 fresh / cache read / output | 会话耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| P 上轮 | 6/10 | 34 / 1,546,268 | 3 / 144,794 | 49,850 / 93,952 / 992 | 12:08.479 |
| P 本轮 | 10/10 | 26 / 886,298 | 2 / 95,490 | 94,227 / 0 / 1,263 | 6:21.582 |
| F 上轮 | 6/10 | 23 / 823,305 | 3 / 146,907 | 50,665 / 94,464 / 1,778 | 5:17.156 |
| F 本轮 | 10/10 | 33 / 1,173,376 | 6 / 314,524 | 58,463 / 250,624 / 5,437 | 9:48.276 |

本轮共 59 笔、2,059,674 tokens，全部能按请求对账。维护者共 8 笔、410,014 tokens，cache write 均为零。P 的两次确认各用 1 笔（46,668、48,822 tokens）；F 的原表复核先读仓库、资料和 Git 历史再实测，用了 5 笔、256,004 tokens，修订版确认用了 1 笔、58,520 tokens。双方都联系了两次，复核成本差异主要出在 F 的第一次。四次回传后均为零请求。与上轮相比，P 少 8 笔、659,970 tokens；F 多 10 笔、350,071 tokens。业务得分提高与用量降低是两个独立结果。[按角色和调用 ID 的对比](../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/comparison.json)

## 如何区分契约缺口、任务特例和模型能力

| 层次 | 本例可定位的现象 | 证据能支持的判断 |
| --- | --- | --- |
| 通用契约 | 两份旧提交都通过了“是否超限”，却没有满足“在车辆窗口最大化可用充电量”。同时出现了新实测和旧估算，两份交班稿叠用了两者。 | 对有时效和适用条件的数据，工具要标明来源、适用范围及它替代哪条估算。用户明确提出的目标应与合法性分开验收。两份原提交可以确定性复现这两种检查的差别。 |
| 领域特例 | R4 站型、20 kW 平移、半小时、90% 效率，以及 B 车恰好缺 9 kWh。 | 本工单允许比较每个在场时段的请求与实测上限。若车辆已满、有电价或跨车共享功率等约束，需按该任务重新定义可用功率与验收目标。R7 有序列记忆，原表回执也不能外推到修订版车端净量。 |
| 模型选路 | 上轮两个 Principal 都主动联系了维护者，但只送测自选的 50/50；维护者对该班表的测量正确。 | 这里可观察的是有无构造 50/70 替代方案、何时求证、回执改变了什么。看到签发工具给出的缺额后修正、在看到缺额前自行计算、收到维护者新反例后改判，这三种路径应分别计数。 |

Mock 验证工具链，模型能力判断只采真实轨迹。两组共用同一模型、相同业务输入与工具说明，每组各一次，且同时改变了证据说明和签发校验。这种配对可以复核本次的行为顺序，无法拆分两项改动各自的因果贡献，也不能估计同类任务上的发生率。

此前几类问题也应按可复现的边界归因。R7 将请求功率与限幅后实际功率混用，R4 把满足上限当成满足调度目标，都能用固定 Git 提交复现，属于宿主可以确定性修复的契约缺口。维护者超时重试能否读回同一 SHA 的测量、回传后是否继续产生请求，属于执行和投递契约。旧 R4 第 7 笔在期限内缺少终态用量，账本只能记 UNKNOWN；这条记录不能用于评估模型会不会接着完成工单。剩下的能力问题才是：工具给出的信息已经够用时，模型会不会提出有区分力的替代方案、知道哪一次再测值得付出成本。R7 的车端反例和 R4 的确认性复测为这项能力提供了两个不同的观察点。[R7 放行证据](DEPOT-R7-RELEASE-POWER.md) · [维护者退出与复核用量](DEPOT-REVIEW-EXIT.md) · [R4 原停止现场](DEPOT-TRANSFERABILITY.md)

## 离线复算

```powershell
$day = 'research-evidence/pnwf-task-selection/2026-11-20'
$a = "$day/r4-window"
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-transfer/case.test.mjs scripts/pnwf/depot-transfer/release-power.test.mjs scripts/pnwf/depot-transfer/r4-release.test.mjs scripts/pnwf/depot-transfer/window.test.mjs
node scripts/pnwf/depot-transfer/run.mjs r4-window-verify $a
node scripts/pnwf/depot-transfer/run.mjs r4-verify "$day/r4-release-power"
$out = Join-Path $env:TEMP 'r4-window-comparison.json'
node scripts/pnwf/depot-transfer/release-comparison.mjs $a "$day/r4-release-power" $out
(Get-FileHash $out).Hash -eq (Get-FileHash "$a/comparison.json").Hash
```
