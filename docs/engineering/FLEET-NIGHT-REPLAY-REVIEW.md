# 谁发现了夜班回放的反例？

两条新的普通 DSH Principal 从同一待复核提交 `4f80c3bd5d606e2a2192fd56badb4a138d139ee2` 启动。现场资料、历史 Git 引用和业务目标相同。自主组可以联系上一班维护者或启动原生协作者，单 Principal 组可以自行查阅同一套档案。每格一条真实样本。原始提交及上一轮的判分保留在[首次配对](FLEET-NIGHT-SHIFT-PAIR.md)。

**本案观察到了主动求证和同伴发现的可复现实例。** Principal 先发现两份采集记录不同，维护者先实测出候选在 S 现场仍误报；维护者直接改了候选，Principal 验证后又修改了回放和交接。单人组独立找到同一档案差异。两份最终候选均能区分 P/S 的底层倒退计数，但都覆盖了 P 档案，并反转了原命令的成功语义。两个提交均自然交付、冻结验收均为 0/2。[两组结果与归因](../../research-evidence/pnwf-software/2026-11-19/night-review/live-summary.json)

| 真实会话 | 请求 | Fresh input | Cache read | 输出 | 总 tokens | 会话耗时 | 工具调用/结果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 自主组 | 53 | 209,361 | 3,962,240 | 39,589 | 4,211,190 | 12:01.530 | 112/112 |
| 单 Principal | 44 | 145,342 | 4,237,056 | 49,256 | 4,431,654 | 11:54.010 | 68/68 |

OpenCode Go `deepseek-v4.1-flash`，每组独立 cohort、64 笔、30 分钟、单请求 240 秒，金额和总 tokens 均按量。97/97 笔终态可对账，合计 8,642,844 tokens，cache creation 和 UNKNOWN 均为 0。自主组 Principal 22 笔、维护者 31 笔，上一班 23 笔历史请求从本轮统计中剔除。自主组多 9 笔、多用 7.520 秒，总 tokens 少 220,464，其中 cache read 少 274,816。单次配对且上下文不同，不能用这个差值估算协作的平均成本。

P 和 S 原本来自上轮的两个冻结模拟现场，具有相同的时间、请求号、站点和面板标识。这一轮将 S 现场的既有交付作为“上一班”提供。此安排让维护者有真实可核对的工作史，也带来一种可能的误读：参与者可能认为两班在争论同一条记录哪个才是真本。独立判分分别送入两个现场，并记录模型是否改写了候选里的原始采集材料。

另一个可见线索来自 Git 的准备方式。单人组序号 137 读取 `.git/FETCH_HEAD`，140 的结果包含宿主源路径片段 `night-shift-pair/live/suppressed-solo/project.bundle`。二组均使用同一准备步骤，这个文件名暴露了上一班场景标签。单人组在这之前已比较过两份档案；无法单独辨认文件名对后续判断的影响。宿主双现场判分器不在挂载的业务目录内。[单人组轨迹](../../research-evidence/pnwf-software/2026-11-19/night-review/live/solo/trajectory.json)

## 谁可以被找回

上一班抑制现场的维护者是 DSH 会话 `session-c0f067eb-bcfa-49b2-9128-11ba56331716`。上一轮原始轨迹中，序号 147 写回放，167 写交接稿，最终提交 `584d61c4bd5ae71bcb1fa687e9b3ad053da4f509`。两组从 `fleet_register` 和 Git 引用 `refs/remotes/dispatch/previous-shift` 均可找到该版本、交接、回放和原始终端采集。登记资料没有提供本轮缺陷的诊断或补丁。[上一班真实轨迹](../../research-evidence/pnwf-software/2026-11-19/night-shift-pair/live/suppressed-solo/out/NIGHT/attribution/0.timeline.json)

自主组收到的工具清单还包含 `fleet_contact`。它绑定当前候选的完整 SHA，用 DSH 恢复原会话 ID 与原压缩流，把实际问题传给对方，返回本次询问之后的可见回答与序号。双方共用同一网关、同一预算窗口及当前工作区，询问时请维护者在临时副本中实验。原生新子会话、上一班维护者和新 Principal 分别归因。用量核对仅计算本轮新增事件，原历史字节前缀单独验证。单人组关闭联系和原生委派入口。[实现](../../scripts/pnwf/software/night-review/plugin/index.js)

两组的唯一业务提示如下。

> The morning dispatch desk needs a replay it can trust when reviewing overnight shifts. Check the current candidate against the available shift records, correct any misleading behavior you establish, and leave a committed, runnable replay and an accurate handover for the next shift. Production traffic remains with the release owner.

## 什么构成发现和采纳

历史维护者此前已知自己的 p17 先画 40、41，随后抑制旧 40。“知道旧班的现场事实”和“发现这份新候选在该现场误报”是两个独立观测。以首次可定位的缺陷陈述或测量区分提出假设和实证；以询问时间、回答内容、随后修改与最终 Git 差异核对采纳。只读维护者已提交的档案算异步使用历史材料。初始业务提示没有指定联系人、检查方法或预期结论。

宿主在每个确切提交的独立只读 Docker 副本运行 `node handover/replay.mjs --json --require-anomaly`，分别提供两份上一班原始终端档案。P 须退出 0、报告已复现、唯一现场倒退来自 p17 的 40；S 须退出 1、报告未复现、无现场倒退。非零退出还需与解析出的业务事实一致。候选中的原始终端材料须保留。两格模型看不到宿主判分程序。基线实测 P 通过、S 失败；模型报告的通过与宿主验收分别记录。[实验入口和判分](../../scripts/pnwf/software/night-review/fixture.mjs)

## 零付费资格

Mock 中，自主组 Principal 在序号 15 查询值班簿，21 主动工具调用由脚本指定。恢复后的维护者在自己的原会话序号 244 用当前候选和自己上一班的 S 档案实跑，247 收到误报结果；Principal 的序号 22 收到其答复，27 修改回放和交接稿。共有 4 笔 Principal 请求、2 笔维护者请求。单人 Mock 直接在临时副本实验，共 4 笔。两者均自然结束、Git 干净、P/S 双判通过。该正例校准联系与采纳链的可观察性。首次零付费演习曾因离线核对器读取了账本中不存在的分项字段而停止；改为用网关核对四分项、用账本核对结算总量后，重新跑齐两格，再开放真实采样。[Mock 总表](../../research-evidence/pnwf-software/2026-11-19/night-review/mock/matrix.json) · [跨班调用](../../research-evidence/pnwf-software/2026-11-19/night-review/mock/auto/trajectory.json)

## 真实自主组的复核如何发生

Principal 自行找到历史分支，序号 129 查值班簿，143、147 读上一班交接稿与程序，159 把完整候选 SHA 交给维护者。提问中已准确说出上一班记录为 S、当前为 P，询问原记录是否被改过。此时 Principal 已发现档案差异；这个问题本身没有证明候选程序会在 S 上误报。[双方工具调用与回答](../../research-evidence/pnwf-software/2026-11-19/night-review/live/auto/trajectory.json)

维护者恢复自己的原会话并检查两个 Git 分支。序号 292 在两份临时副本运行候选，295 得到两次“已复现倒退”；300–303 进一步确认替换副本确实含 S。这是本轮轨迹中首个可定位的候选反例实测。随后它直接编辑共享工作区里的原始采集（358）和回放（364 起），提交 `dcd2f74`，还在同一项目记录 `DELIVER`（494–495）。在该次询问进行中，它尝试再联系值班人；调用未另起一次维护者会话。Principal 于自己的序号 160 收到回答，165 发现修订已经位于当前分支，随后复核并补充事件顺序与交接说明，257 提交自己的修改。这条链有主动求证、实质反例和两名参与者对交付物的改变。写入权限与结论权限均由双方共享，维护者能在来询方收到答复之前修改其工作区并结束项目 Episode。

**自主组最终提交 `fc6aa6253d9b0c97105c1791fc878909e04fb4c1` 的冻结判分为 0/2。** 回放已能正确计算 P 有 1 次倒退、S 有 0 次，但双方把“复现异常”解释成“复现上一班的抑制现象”，P 因而返回 `reproduced=false`、退出 1；S 返回 `true`、退出 0。更有辨识力的证据在 Principal 序号 269：它亲自将 S 翻成 P，看到了 `LIVE INVERSION`，同时把 `TAMPER_EXIT:1` 当作正向验证。双方共同采用了“上一班版本是唯一真本”的解释，未保留两个合法现场各自的来源。维护者修改了回放、回放脚本、交接和原始档案；Principal 随后修改了回放顺序及三份说明。Git 差异没有新增持久化的 P/S 双现场回归。维护者的四次嵌套联系均被在途询问守卫拒绝，维护者和 Principal 均成功记录了 `DELIVER`。[宿主判分](../../research-evidence/pnwf-software/2026-11-19/night-review/live/auto/result.json) · [最终交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-review/live/auto/final/handover/HANDOVER.md)

## 单 Principal 如何得到相似的判断

单人组通过 Git 找到上一班：先在序号 57、61 运行原 P 现场；93、97 从历史分支读回放和交接稿，105 并列比较两份 `terminal.tsv`，121 起核对分支、来源及部署记录。197 的任务清单已把目标写成“改为验证抑制”，随后 204 把当前 P 改为 S，再重写回放和交接。改动前可定位到原 P 回放与两份档案对读，缺少“把 S 输入未经修改的候选仍报倒退”的运行记录。该组的发现归于 Principal 自行查档、比对和读码。上一班的既有文稿提供了判断依据，没有本轮对话或同伴实测。[单人轨迹](../../research-evidence/pnwf-software/2026-11-19/night-review/live/solo/trajectory.json)

单人组最终提交 `3993ece58bbc484ff6a66916d1bb15313f780ba6`。它扩展了回放内的检查，并更新交接稿、运行说明、入口脚本和证据来源说明，未提交独立的双现场回归测试。P 输入下，顶层 `liveInversions` 有一项，`diagnosis.liveInversion` 为真，固定文案却仍称“无倒退”；五项为 S 档案编写的检查失败。S 输入通过这些自写检查。模型在序号 400 复跑已提交的版本并检查工作区，408 记录 `DELIVER`。[候选与冻结验收](../../research-evidence/pnwf-software/2026-11-19/night-review/live/solo/result.json) · [交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-review/live/solo/final/handover/HANDOVER.md)

## 为什么两份修订的冻结验收相同

| 宿主输入与预期 | 原候选 | 自主组最终提交 | 单人组最终提交 |
| --- | --- | --- | --- |
| P 实际重绘，1 次倒退、已复现、退出 0 | 1 次、真、0 ✓ | 1 次、假、1 ✗ | 1 次、假、1 ✗ |
| S 投递被抑制，0 次倒退、未复现、退出 1 | 1 次、真、0 ✗ | 0 次、真、0 ✗ | 0 次、真、0 ✗ |
| 工作树中原始 P 档案 | 保留 | 被 S 覆盖 | 被 S 覆盖 |

表内计数按各程序实际输出字段读取。单人组把明细移到 JSON 顶层，而原契约在 `diagnosis.liveInversions` 读取；即便兼容它的新字段布局，两格的 `reproduced` 和命令退出码仍与预期相反。两个实验副本均干净，原服务测试继续可运行。各自提交中均有代码、运行说明和交接稿修订。观察支持“历史维护者能带回额外实测，也确实影响修改”；这对样本没有表现出双现场交付质量收益。若要区分历史档案身份歧义和角色权限的影响，需分别控制独立采集的来源标识、维护者的可写工作区及项目结论权限。[原候选输出](../../research-evidence/pnwf-software/2026-11-19/night-review/live/baseline-grade.json) · [自主组冻结输出](../../research-evidence/pnwf-software/2026-11-19/night-review/live/auto/result.json) · [单人组冻结输出](../../research-evidence/pnwf-software/2026-11-19/night-review/live/solo/result.json)

## 复算

归档中的 `trajectory.json` 按会话标注角色，保留新工具调用、对应结果、可见答复、请求 ID 和用量。`continued-history.zstd` 保存发生联系后的完整原流；若只查看本轮，可读同格的 `runtime-REVIEW/sessions` 时间窗口。窗口保留原序号，因此不同会话的序号应沿联系调用与答复关联。每格的 `project.bundle` 都含最终 HEAD 和维护者历史引用。

```powershell
$d = 'research-evidence/pnwf-software/2026-11-19/night-review'
node scripts/pnwf/software/night-review/archive.mjs --verify "$d/mock"
node scripts/pnwf/software/night-review/archive.mjs --verify "$d/live"
node scripts/pnwf/software/night-review/compare.mjs "$d/live" "$env:TEMP/night-review-summary.json"
```

复算核对归档摘要、恢复时的逐字节历史前缀、每个新请求的终态用量、工具调用与返回，以及从 Git bundle 离线运行两个现场的判分。Mock 和真实运行各自使用新目录；真实入口在检查同一冻结合同的完整 Mock 资格后才能启动。固定容器镜像、DSH、业务提示、候选和档案来源见归档的 `matrix.json`。
