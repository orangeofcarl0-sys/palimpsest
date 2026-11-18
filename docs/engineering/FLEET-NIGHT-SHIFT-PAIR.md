# 夜班档案与按 SHA 试排 · 普通 DSH 配对观察

2026-11-19。产品起点 `df18e762`。四条真实会话使用同一初始提交 `71643fe7fe7536d4d493e8905c704f767eb67c92`、同一业务提示和独立的新 DSH home。目标是完成夜班交接，留下可运行回放、已提交的交接稿和可行方案的试排凭据。没有在业务提示里指定角色、分工、工具顺序、诊断答案或根因。[场景设计](FLEET-NIGHT-SHIFT-DESIGN.md) · [运行入口](../../scripts/pnwf/software/night-shift/run.mjs)

## 对照条件

**两个允许自主协作的现场都由一个 Principal 完成。** 两格均无主动复核请求、子会话或可归给另一参与者的反例，四格均提交交接、取得可行试排、记录 `DELIVER` 并自然退出。模型确实根据第二班档案改变了初评；只有脚本化 Mock 观察到他人的测量进入了交接稿。四份真实回放对各自原现场均成功，单行反事实检验发现其中一份会把抑制误报为重绘。[真实逐调用对照](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live-comparison.json) · [逐提交回放结果](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/replays.json)

| 因素 | 实际处理 |
| --- | --- |
| 现场 | 公共材料和 Git 树相同。五个宿主侧档案中只有终端记录的最后一个事件码不同。重绘现场 p17 显示 40、41、40，抑制现场显示 40、41。两边 p23 均无捕获。 |
| 自主协作 | 普通 DSH 保留原生 Subagent、fork、Workflow、Git、shell 与项目工具。是否寻求另一参与者复核由模型决定。 |
| 单 Principal | 在同一 DSH profile 禁用原生子会话及 Workflow 入口，检查实际请求工具清单、会话流数。保留相同档案、试排、编辑和本地验证能力。 |
| 计量 | OpenCode Go 的 `deepseek-v4.1-flash`，固定 PNWF 容器。每条会话 64 笔、30 分钟、每请求 240 秒。子会话使用同一账本，金额和总 tokens 按量。 |
| 顺序 | 重绘自主、抑制单人、重绘单人、抑制自主。每条先结算并核对账本，再启动下一条。每格一次，时段与 Provider 缓存条件可能有差异。 |

`fleet_desk` 是普通 DSH 工具。隔离容器经既有固定 stdio 桥访问宿主。模型侧可见工作区、项目状态与 DSH 工具；现场开关和第二班原始档案位于宿主私有目录。检查点核验当前完整 SHA、基线祖先和已提交的初评；档案核对冻结摘要；试排从确切 Git 对象读取 `handover/proposal.json`，返回提交、blob、可行性及原因。后续若只提交了说明，报告分别核对最终 HEAD 和方案 blob。试排的生产批准状态为 `unissued`。[工具与端口](../../scripts/pnwf/software/night-shift/port.mjs) · [宿主核验](../../scripts/pnwf/software/night-shift/case.mjs)

## 零付费资格

四个格子均在真实容器和普通 DSH 内走完全程，自主组各启动一个真实原生子会话，单人组均只有 Principal。四次早查档案和四次使用旧 SHA 试排均收到拒绝。每格先对 06:10Z 的占道草案收到冲突，再对修改后的提交取得可行回执。两条脚本化子会话查到终端事实，Principal 收到所测结果后修订交接稿。四条自然退出，2 × 15 + 2 × 12 = 54 笔合成请求，付费调用 0。[资格记录](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/mock/matrix.json) · [逐调用对照](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/mock-comparison.json)

## 真实样本的配对结果

| 现场与权限 | 请求 | Fresh input | Cache read | 输出 | 总 tokens | 会话耗时 | 工具调用/配对结果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 重绘 · 自主 | 36 | 81,368 | 1,772,160 | 28,638 | 1,882,166 | 9:03.389 | 65/65 |
| 重绘 · 单人 | 34 | 74,744 | 1,479,808 | 33,658 | 1,588,210 | 9:48.651 | 49/49 |
| 抑制 · 自主 | 37 | 83,939 | 1,983,488 | 35,227 | 2,102,654 | 10:41.039 | 73/73 |
| 抑制 · 单人 | 23 | 66,061 | 882,304 | 20,886 | 969,251 | 6:52.130 | 49/49 |
| 合计 | 130 | 306,112 | 6,117,760 | 118,409 | 6,542,281 | 36:25.209 | 236/236 |

130 笔终态用量均能绑定回放，UNKNOWN 为 0，cache creation 为 0。耗时按各次容器会话的起止时间计；账本未提供货币金额。重绘自主组多 2 笔、293,956 tokens，少用 45.262 秒；抑制自主组多 14 笔、1,133,403 tokens，多用 228.909 秒。可观察的开销包括抑制自主组自己修复一次回放失败、编写单列的诊断文档及多次复查。两条自主组均无子会话请求；工具清单、模型自行选择的步骤、服务端缓存和运行顺序都可能影响单格差值，每格一条不足以估计开放协作的平均代价。[原始计量与会话](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/matrix.json)

四条会话均选择 06:10Z 暂停 Birch、Cedar 使用备用通道，均有两次可行试排，未发生 Mock 中的预约冲突。八份宿主回执都绑定确切的提交，生产批准均为 `unissued`。最后一次试排和最终提交在四格都指向方案 blob `ecae06b26fc502431682e550d048766d5aac7226`。抑制单人组还对最终 HEAD 本身做过试排，其余三组在最后一次试排后仅补交回执文件。四份交接稿均保留 p23 的观测缺口。两种现场都做相同安排，诊断和可运行回放才区分出它们如何处理不确定性。

## 重绘现场的自主组

Principal 在序号 95、101 分别在缺少 SHA 和使用起始 SHA 时尝试登记初评，均收到拒绝。它随后写下初评 `a48ad05c`。序号 161 登记成功，167–175 自行调齐五份档案。序号 205 写回放、211 执行，227 提交；249 已取得可行回执，269 才写最终交接稿。283 对该稿所在的 `1e5e3e0b` 再次试排，最终 `85c06eb6` 仅补入回执。319 的 `work:conclude DELIVER` 获得记录，随后自然退出。实际 trace 只有 Principal，读档、运行程序和修改交接稿都能定位到它。[逐调用时间线](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/redraw-auto/out/NIGHT/attribution/0.timeline.json) · [交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/redraw-auto/final/handover/HANDOVER.md)

初评把重试列为假设。终端记录显示 p17 的确从 41 回画到 40，p23 无采集；交接稿将业务决定收窄到暂停 Birch、Alder 继续、06:10Z Cedar 保留通道。原稿对“终端对所有投递一律重绘”的机制推断超出了这一次重试能证明的范围。离线运行提交的程序成功；仅把最后一个 `P` 换成 `S`，回放中的倒退消失，两个针对重绘现场的断言随之失败。该结果证明原始终端行实际参与了判断。

## 抑制现场的单 Principal

序号 89 先写初评，103 以 `772735df` 登记，109–117 查询五份档案；147 写回放，153 写排班，167 写交接稿。它把“到达网关的旧读数”与“显示屏上出现的旧读数”分开，核对 p17 只画了 40、41，p71 属于训练屏，Alder 的 p04、p09 可以合法显示同一读数。它保留 p23 为未知，选择 06:10Z 暂停 Birch、让 Cedar 使用通道。与上述重绘样本形成对照：相同安排有不同的现场依据。181 对方案提交、213 对附加回执后的最终提交分别取得可行回复。225 记录交付。两次核验都在交接正文成形之后。[原稿](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/suppressed-solo/final/handover/HANDOVER.md) · [调用与结果](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/suppressed-solo/out/NIGHT/attribution/0.timeline.json)

抑制单人组提交的原回放成功；把抑制行换成绘制，四项检查失败，其中包括 p17 单调性和对重试的抑制。程序非零退出，结构化失败项反映新输入，但输出里的 `diagnosis.liveBehaviour` 仍是固定的“已抑制”措辞。接班人要看失败项才能正确解释这个反例。

## 重绘现场的单 Principal

序号 73、87 在初评完成前登记失败，101 写初稿，115 登记成功。121–129 查档，143 已按 `20952aa3` 取得可行试排。模型随后写回放（165）、运行说明（215）和最终交接（221），243 再对 `46d555c9` 试排，279 调用交付。它同样正确识别 p17 倒退与 p23 缺测，最终 `4f80c3bd` 写入回执，方案 blob 一致。[原稿](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/redraw-solo/final/handover/HANDOVER.md) · [时间线](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/redraw-solo/out/NIGHT/attribution/0.timeline.json)

**这份回放会在抑制现场误报。** 已提交的终端数据与档案逐字节相同。在隔离副本把 `22:03:17 p17` 的 `P` 改成 `S`，带 `--require-anomaly` 的原程序仍退出 0，输出 `reproduced: true`。代码按面板遍历所有终端行，直接用序号与先前最高值比较，遗漏了“这次确实绘制”的条件。这是宿主在模型退出后的离线发现，模型在该次会话里没有收到这个反例。[回放原稿](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/redraw-solo/final/handover/replay.mjs) · [独立复算输出](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/replays.json)

## 抑制现场的自主组

Principal 在 141 写初评，155 登记，161–169 独自查齐档案。199 写回放，205 首跑非零退出；它在 213、219 把 `.mjs` 中的 CommonJS 加载及目录定位改成可运行的写法，225 重跑成功。这是自己运行程序得到的错误反馈。233 和 239 写诊断与交接，并未调用同伴。275 取得可行试排后，295 把预约信息写入交接；309 对新的 `92531f58` 重验，315 补记回执，最终 HEAD 为 `8db72b6f`，343 记录交付。可辨认的影响分别来自自己的失败作业和排班台回执。[时间线](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/suppressed-auto/out/NIGHT/attribution/0.timeline.json) · [交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/suppressed-auto/final/handover/HANDOVER.md)

离线重跑通过原服务 18 项测试和档案断言。把 `S` 换成 `P` 后，程序从档案读出了 40、41、40，原先针对抑制现场的序列断言失败。这项事后检查与重绘单人组形成具体对照。一次样本能指出哪份交付需要修订；两条自主组都没有求助，现有数据无法判断一次真正的同伴复核能否发现该缺陷。[原结果与反事实输出](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/replays.json)

## 复算

使用下列命令可离线核对原样本。最后一步需要本机已有封存指定的容器镜像，回放时关闭外部网络、只读挂载候选，并在独立副本里替换单行的 `P/S`。输出同时保留原程序的退出码、标准输出与错误流。

```powershell
$archive = 'research-evidence/pnwf-software/2026-11-19/night-shift-pair'
node --test scripts/pnwf/software/night-shift/case.test.mjs scripts/pnwf/software/night-shift/port.test.mjs
node scripts/pnwf/software/night-shift/archive.mjs --verify "$archive/mock"
node scripts/pnwf/software/night-shift/archive.mjs --verify "$archive/live"
node scripts/pnwf/analyze_night_shift.mjs "$archive/live" "$env:TEMP/night-shift-comparison.json"
node scripts/pnwf/replay_night_shift.mjs "$archive/live" "$archive/replay-plan.json" "$env:TEMP/night-shift-replays.json"
```

离线核对覆盖封存文件摘要、原始 DSH 流、逐笔用量、Git bundle、试排版本与方案 blob。自主寻求复核需能追到主动调用和实际参与者。证明反例影响成果还需追到对方的具体发现、接收方读取或回应，以及之后发生的测试或交接稿变动。只有宿主预约冲突时，归为对外部业务反馈的修订。

重新演习整套零付费执行链可运行 `node scripts/pnwf/software/night-shift/run.mjs --mode=mock --run=<全新目录>`。普通 DSH 运行环境、固定镜像及本地已构建的产品包按 PNWF 的既有方式提供。原始会话可从每格的 `runtime-NIGHT/sessions` 读回，业务版本可从同格的 `project.bundle` 提取。
