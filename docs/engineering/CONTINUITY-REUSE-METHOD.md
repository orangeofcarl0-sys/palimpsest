# 自改进接回里程碑二 · 冷交接放行复核

工单来自 gRPC 冷交接积压。既有真实冷启动在已接受版本上看得到旧 Episode ID，按该 ID 查询却返回 `UNKNOWN`，发布核验也被列成待调查问题。生产代码后来修复了读回路径，本轮回到这张维护工单留下的放行判断，核对下一位维护者会怎样使用新证据。试验评审的初始 `HOLD` 由真实旧故障起草，原本的 Operator 接受始终保留。[原故障及修复](CONTINUITY-HANDOVER-DOGFOOD.md) · [封存的真实接续](GRPC-AUTONOMOUS-CONTINUITY.md#真实项目的接受与接续)

## 冻结的任务与验收

- 宿主沿用 `3883ae73` 的普通 DSH 启动与产品构建。工单检出从原样接受的 gRPC `95b83e71ee9a37041b9918b5e8b797eebabf69c9` 派生，只加一份携带历史依据的 `MAINTENANCE-REVIEW.md`。两组恢复相同 Work 和 Journal，分别使用新 DSH home、独立账本和同一初始评审提交。
- 业务提示只要求复核当前是否可以接续，作 `READY` 或 `HOLD` 决定，留下当前依据并保留旧资料。唯一可修改的交付是评审原稿。两组都能自行使用正常 Continuity 查询，也都能按接受 SHA 向维护复核台索取已实测的只读回执。复核没有写入、接受或发布能力。
- 提示组启动时看到一条从旧故障和冷重放提炼的已核准 Procedure。方法要求对照旧决定的当时基线与所有者接受版本，并在适用时用绑定 SHA 的当前证据复核。提示不含具体回执、结果、工具名或分工。按实际调用判断是否查档、是否向维护者求证及其先后。
- 宿主独立核对活跃决定、完整接受 SHA 与 Work `DIRECT_BASIS` 事件 8、旧 `UNKNOWN` 和当前 `REOPENED`、核验日志及来源文件、待办分类、维护与发布权限边界。旧依据区块逐字节保留。Git 净变化限评审一文件，原 Work 和 Journal 前缀保持，`DELIVER` 必须绑定最终评审提交。
- 冻结条件为 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5`、按量记账、每会话 64 笔和 30 分钟、每请求 240 秒，金额和总 token 上限为空。此次先运行无提示组，以对调上一轮的执行先后。出现终态用量 `UNKNOWN` 时按原合同关闭后续准入。

## 独立反例

旧真实会话查询用调用号 `call_ccfc97275a064338a47c1acb` 关联 `UNKNOWN`。独立复核者从同一原始归档恢复接受 SHA，再启动宿主。旧 Episode 用裸 ID 和带类型 ID 都可查询，状态为 `REOPENED`。Work 事件 8 仍是正式接受，核验日志仍可查询，开放问题为零。未知 ID 控制项仍返回 `UNKNOWN`。四个原交付工件与原记录摘要一致，18 项协议和 REST 公开测试全部通过。已封存的旧事件及记录保持原样。这份实际冷重放是回执来源，`READY` 只涉及当前维护接续。

## 零付费资格

评审基线为 `1444de6ce289197a1d12b0b04d2caa36c1d79355`。正式核准的方法为 `prc-f5714dc42fa2d6503a1abac25de9d40a@0`，摘要 `1bf0ea42319d1a4caf133ebb685171d415361cb17f44c521fc9b3bf603eb337c`。未核准的同一候选先遭拒。继承的 HOLD、错接受 SHA、改写旧依据和缺核验链接均被定向反例拦截。克隆从 Git blob 还原文本，避免 Windows 换行转换让原迁移文件在 Linux 被误认为工作树变更。[核准及原稿](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse)

两条普通 DSH Mock 各六笔，均 7/7、只修改评审、绑定候选 `DELIVER` 后自然退出。无提示组第 2 笔自行查询旧 Episode，第 3 笔读核验日志。提示组第 2 笔用旧基线求证遭 `ACCEPTED_SHA_REQUIRED`，第 3 笔用正确的接受 SHA 获得复核回执。两组都保留原 Work、Journal 前缀与历史原判。合计新增付费请求为零。[Mock 矩阵](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/mock/matrix.json)

```sh
node scripts/pnwf/software/continuity-reuse/run.mjs mock <new-mock-directory>
node scripts/pnwf/software/continuity-reuse/run.mjs live <new-live-directory> <qualified-mock-directory>
```

## 真实配对

### 无提示组

第 1 笔读 Pulse，第 2 到 4 笔确认检出、读旧评审、归档关联文件和 Fleet 更正。第 5 笔主动用 `95b83e71…` 向独立维护复核者求证，同一笔也直接查询 Journal、核验日志和旧 Episode。回执与调用按 ID 配对为 57→58。随后的 61→62 与 63→64 分别给出 `OBSERVED_SOURCE` 的核验记录与 `REOPENED` 的旧结论。这些查询在同一个模型请求中发起，模型是主动取得反例的人，独立复核者在会话前完成实测。直接查询与复核回执共同支撑修订。[无提示原轨迹](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live/WITHOUT)

第 6 笔另行核对四个工件摘要并执行 `node --test`，18/18。第 7 笔把 `MAINTENANCE-REVIEW.md` 的现行判断从 HOLD 改为 READY，正文写入完整回执 ID、接受事件、旧 `UNKNOWN` 调用及核验记录。第 9 笔提交 `d6e5558d8c08fe10ddfbba356f8f5ae8757ab50d`。仅此一文件变化，旧依据区块逐字节一致，Work 和 Journal 原记录保留。内容独立验收 7/7，第 10 笔后自然退出。会话只在回复中说明已提交，缺少新评审的 `DELIVER`，保留原终态未完成判定。[评审原稿](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live/WITHOUT/review-committed.md)

### 带方法组

第 1 笔读 Pulse，第 2 到 4 笔查看检出、Git 引用、原评审、迁移文档和文件，并跑一遍公开测试。第 5 笔自行查出核验日志 `OBSERVED_SOURCE`（69→70），再按旧 Episode ID 取得 `REOPENED` 和 Work 事件 8（71→72）。发现来自 Principal 的直接查档。它未调用维护者回执工具，也未向子任务委派。第 7 笔另从接受提交的 `git archive` 重跑公开测试，18/18。它按提示中的做法区分了旧基线与接受版本，单条轨迹无法确定这些动作由提示引起。[提示组原轨迹](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live/WITH)

第 9 笔将评审改为 READY，第 11 和 13 笔调整表述、证据和范围，第 15 笔提交 `b5835cd22955dd33a96975c634dba4fba01246af`。提交只改评审，旧依据区块、原 Work 和 Journal 仍在。第 17 笔自然退出，同样没有记录新评审的 `DELIVER`。冻结原判 5/7 保留。逐项读回表明，正文准确引用了核验日志，Fleet 更正文件名只在保留区块出现，未写入现行判断的证据链。正文说明旧 `UNKNOWN` 不再是活跃阻塞，仍没有明确交代核验日志是否占用待办或当前开放问题为零。两项分别是来源引用位置与现行待办结论的缺项。[评审原稿](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live/WITH/review-committed.md)

### 对照结论

| 观测 | 无提示 | 带方法 |
| --- | --- | --- |
| 针对原 HOLD 的首次有效复核 | 第 5 笔，主动取得独立回执，同笔直接查档 | 第 5 笔，自行查档 |
| 提交中的决定 | HOLD → READY，引用维护者回执与本地核验 | HOLD → READY，引用本地查档与接受树测试 |
| 原依据、原 Work 接受与迁移文件 | 保留 | 保留 |
| 冻结内容判分 | 7/7 | 5/7 |
| 提交与自然退出 | 是 | 是 |
| 新评审的 `DELIVER` | 缺失 | 缺失 |
| 确认请求 | 10 | 17 |
| Fresh input | 31,114 | 44,106 |
| Cache read | 180,992 | 477,952 |
| Cache write | 0 | 0 |
| Output | 7,020 | 11,707 |
| 总用量 | 219,126 | 533,765 |
| 容器运行耗时 | 127.071 秒 | 172.256 秒 |

无提示组在没有求证指令的情况下取回了独立证据，并把回执 ID 和结论写入实际交付。它也在同一请求中安排直接查档，因此这次交付同时有两个证据来源。带方法组完成了独立重查，没有发生同伴证据回流。这一对样本观察到了**自主求证和引用独立实测的成果修订**。复核由会话前的宿主维护者重放，两个真实会话各只有一个 Principal，复核账本新增模型请求为零。这轮仍缺少另一名模型 Worker 的自主发现和完整接续结论，里程碑二保持开放。方法保持本轮范围，现有证据未显示扩大启用的收益。

两组确认 27 笔、752,891 tokens，均按 OpenCode Go 回放的唯一用量四元组及顺序重新对账，新用量 `UNKNOWN` 为零。旧 Episode 的原 `UNKNOWN` 保留在历史归档。复算同时核对了原流调用 ID、确切 Git 提交、Work 事件和 Journal 前缀。[真实运行矩阵](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live/matrix.json) · [离线复算](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/recount.json)

```sh
node scripts/pnwf/software/continuity-reuse/recount.mjs research-evidence/pnwf-software/2026-11-22/continuity-reuse
```

## 提交后的收尾引导与同基线复跑

从发布主线 `07ab5aad` 检查了两份原始流、候选 Git 和 Work、Journal。无提示组的提交调用 95→98，随后回复 102。带方法组的提交调用 153→156，另读了文件差异、保留区块和干净状态，随后回复 172。两组都没有调用 Work `readiness` 或 `conclude`，也没有新增 Journal 结论。初次 Pulse 发生在修改和提交前。普通 DSH 一次性会话在第一轮模型回复并落盘后关闭，缺少获得提交后状态提示的机会。旧 7/7、5/7 及缺 `DELIVER` 的记录继续按原判保存。

把原候选恢复后的定向探测还发现，两边手动读取 Work `readiness` 都会返回 `CONTINUE_WORK`，理由是没有正式任务。Work 现对无计划、干净、相对项目基线存在净差异的直接提交返回 `SEMANTIC_JUDGEMENT`。它列出条件性的 `DELIVER` 下一步。已有当前交付结论时，它指向该结论。

普通 DSH 一次性 Principal 会话也会在原业务轮落盘后观察 Git 和当前项目状态。只有本轮 HEAD 含可见的新增版本差、工作区干净、提交与启动基线及项目基线相容，且没有当前或本轮新结论、执行任务或交付阻塞时，宿主才给一次收尾提示。提示绑定当时完整 HEAD，将业务是否达标和应记录的结论交给模型。收尾后使用原退出路径。两组的业务提示、复核证据、评分器和资源窗口沿用原样，两组共有这项修复，差别仍是已核准方法是否可见。

离线回归从两条原始流找出成功提交、最终回复和缺失结论，并恢复各自的原 Work、Journal 与确切 Git 候选。两份原现场都触发新提示。未改动、脏文件、开放工作、已有当前结论和观察期间 HEAD 漂移均跳过。Mock 刻意先提交并回复，只有收到绑定 SHA 的宿主提示后才调用 `conclude`，用来区分启动时主动结论与收尾提示的效果。

### 零付费复验

真实配对准入前，两组 Mock 各 7 笔模拟请求、内容 7/7。每组只收到一次提示，在全会话第 6 笔写入绑定候选的 `DELIVER`，第 7 笔回复后自然退出。真实配对沿用同一冻结运行版本。其间补测发现，全新 `OPEN` Episode 会标作 `current`，即使还没有结论。最终代码检查实际结论是否存在，两个历史样本均为已重开的 Episode，此改动不改变它们的触发判断。最终代码又用两组零付费 Mock 验证了一次，成绩仍为各 7/7、均正式交付并自然退出。两版编译和宿主文件的差异限于 readiness 与收尾提示的这项判断。四个 Mock 会话实际付费请求为零。[历史复现](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/closeout-regression.json) · [准入矩阵](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/mock/matrix.json) · [最终代码资格](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/open-episode-qualification/recount.json) · [两版差异](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/open-episode-extension.patch)

### 两条真实轨迹

**无提示组。** 第 3 笔读 Fleet 更正与迁移文档，第 4 笔核对项目档案。第 5 笔主动以接受 SHA `95b83e71…` 向维护复核台查询旧 Episode 和核验记录（69→70），同笔运行公开测试并比对受保护 blob。回执报告同 SHA 上旧 Episode 已可读、状态为 `REOPENED`、开放问题为零。第 7 笔将 HOLD 改为 READY，在现行评审写入回执 ID、Work 事件 8、核验日志 ID、Fleet 更正路径及四份工件摘要。第 10 笔提交 `091996b1703790dc28fd6a8e16467d78ed3667f0`（119→122）。首轮回复后收到收尾提示（133），第 12 笔调用 `conclude DELIVER` 获得 `RECORDED`（136→137），第 13 笔回复后自然退出。[原稿与轨迹](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/live/WITHOUT)

**带方法组。** 第 3 到 4 笔读原评审、Fleet 更正和接受树。第 5 笔主动以同一接受 SHA 查询独立回执（55→56），第 7 笔另行用 `explain` 取得核验日志的 `OBSERVED_SOURCE`（77→78），并运行公开测试。第 8 笔写入 READY，引用完整回执 ID 和 Work 事件 8，说明已重开的旧结论属于历史依据。第 10 笔提交 `008a480efed94d6400a9240498a9d9148072ceaf`（99→102）。首轮回复后收到提示（113），第 12 笔调用 `conclude DELIVER` 获得 `RECORDED`（116→117），第 13 笔回复后自然退出。[原稿与轨迹](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/live/WITH)

两组的变更都限 `MAINTENANCE-REVIEW.md`，18 项公开测试通过。原 Work 接受事件和 Journal 前缀完整，两组各新增一条 `DELIVER`。复算从 Journal 读出完整候选 SHA 和工件摘要，从 Git bundle 读取同一 blob 后重算一致。维护复核者的实测来自会话前的同 SHA 冷重放，真实会话各只有一个模型 Principal，维护复核额外模型请求为零。两组都把回执写进实际提交，因此观察到了主动求证和证据采纳。这个样本尚未验证另一个模型 Worker 自主发现并回传反例。[逐请求与工件复算](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/recount.json)

### 冻结判分和用量对照

| 观测 | 原无提示 | 本轮无提示 | 原带方法 | 本轮带方法 |
| --- | ---: | ---: | ---: | ---: |
| 首次有效证据 | 第 5 笔，独立回执与直接查档 | 第 5 笔，独立回执 | 第 5 笔，直接查档 | 第 5 笔，独立回执 |
| 冻结内容判分 | 7/7 | 6/7 | 5/7 | 5/7 |
| 新评审 `DELIVER` | 缺失 | 第 12 笔 | 缺失 | 第 12 笔 |
| 提交与自然退出 | 是 | 是 | 是 | 是 |
| 已对账请求 | 10 | 13 | 17 | 13 |
| Fresh input | 31,114 | 40,963 | 44,106 | 34,668 |
| Cache read | 180,992 | 320,384 | 477,952 | 259,712 |
| Output | 7,020 | 10,341 | 11,707 | 7,086 |
| 总用量 | 219,126 | 371,688 | 533,765 | 301,466 |
| 容器耗时（秒） | 127.071 | 185.829 | 172.256 | 139.021 |

- 无提示组的冻结判分器要求发布授权边界出现在同一行，原稿将 `release authorization` 拆在相邻两行。离线仅合并这一个换行可复算为 7/7，原 Git blob 与冻结 6/7 保留。带方法组明确说明了授权边界，但只在保留区列出 Fleet 更正完整路径，并向保留区追加了两条新证据和一行结论。原保留区仍逐字节存在于该区前缀，冻结规则要求区块整体相等，所以 `oldUnknownPreserved` 与 `verificationTraceable` 两项保留失败。旧样本的 7/7 与 5/7 完全保留，未用新结果覆盖。
- 两组实际各用两个请求完成提示后的收尾，仅第一个请求调用工具。无提示组收尾用量 78,275 tokens（fresh 3,481，cache read 74,112，output 682），带方法组 65,738（fresh 3,499，cache read 61,568，output 671）。业务轮各 11 笔，分别为 293,413 和 235,728 tokens。四条真实样本的 cache write 均为零。本轮共 26 笔、673,154 tokens，没有 `UNKNOWN`，模型请求与账本按唯一用量四元组和顺序严格配对。[真实矩阵](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/live/matrix.json) · [离线分段归因](../../research-evidence/pnwf-software/2026-11-22/cold-closeout/recount.json)
- 两条真实轨迹都在收到绑定 SHA 的提示后完成了原本遗漏的动作，证明这次修复接通了该收尾路径。方法组这次主动求证，原方法组只自行查档。当前每格一次，没有理由把这项选路变化或用量差归因于方法提示。两组仍有冻结内容缺项，正式结论和自然退出单独记账。里程碑二继续开放。

```sh
node scripts/pnwf/software/continuity-reuse/run.mjs mock-closeout <new-mock-directory>
node scripts/pnwf/software/continuity-reuse/recount.mjs research-evidence/pnwf-software/2026-11-22/cold-closeout
node scripts/pnwf/software/continuity-reuse/recount.mjs research-evidence/pnwf-software/2026-11-22/cold-closeout/open-episode-qualification
```
