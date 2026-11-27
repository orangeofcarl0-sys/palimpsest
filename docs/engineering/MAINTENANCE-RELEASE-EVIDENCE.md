# 发布接班中的主动求证 · Palimpsest 与强原生 DSH

## 工单与独立验收

PR #303 的最后一份送审快照仍是 `OPEN / BLOCKED`，送审头的 16 项检查已绿，交接人仍需确认所有者核准、实际合入和主线验收。随后所有者核准完整送审 SHA `feae96bde35909eacb86450c17ac42087ef73f9a`，按 rebase 合入 `73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad`。两个提交的文件树同为 `94af6e02d70a081fb107ee06bc770b5aa55f77ef`。后来生成的主线回执记录实际合入 SHA 的 4/4 工作流、15/15 作业均通过。这些事实足以把发布记录从等签核推进到结清。正式运行位 #298 的用量阻断依然有效。[PR #303](https://github.com/orangeofcarl0-sys/palimpsest/pull/303) · [主线运行](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878125806)

这张工单来自上一轮实际发布、核验和 handoff 交接。主线原实验报告尚未收录精确发布记录，两组从同一完整基线出发，在原报告末尾补记当前决定、两个完整 SHA、文件树及主线 CI 来源。宿主独立核对七项事实，分别是干净且严格限于报告的直系提交、发布结清、两个完整版本、文件树一致、实际主线 CI、原 7/7 和 6/7，以及 #298 第 16 笔 `UNKNOWN`、草案 1/4 和原待准入工单仍有效。正文从候选 Git blob 读取。

## 证据可达性与运行窗口

两组接受同一业务提示，拥有相同的只读 `release_archive` 和 `release_contact`。会话启动时只有业务目标、旧记录的入口和工作树。Palimpsest 另外冷读同一项目的 Journal、短索引和 `handoff.md` 检查点。三个封存文件是原送审快照、实际合入读回及主线 CI，工具可以按记录 ID 直接读取。如果主动联系上一班维护者角色，宿主在独立 Git 副本和全新普通 DSH home 中启动该角色，使用同一会话账本，只能回传已查阅且绑定本轮基线的原始记录。角色依据上一班的真实档案重新调查。启动时两组均未收到复核回执。

冻结 DSH `0.2.1-rc.5`、同一容器映像和 OpenCode Go `deepseek-v4.1-flash`。每组独立 cohort，最多 256 笔、60 分钟，单请求 240 秒。按量记账，金额及总 token 无上限。有真实终态用量 `UNKNOWN` 则停止后续会话。Docker Desktop 本轮无法访问 F 盘绑定目录，容器临时挂载用 C 盘一次性工作区，源码与档案仍放 F 盘。

## 零付费资格

最终 Mock 两组均为 7/7，17 笔全部结算，付费 0，均自然退出。P 用 6 笔 Principal 请求与 6 笔独立维护者请求，验证错基线拒绝、未读证据拒绝、维护者从隔离副本查询并回传三个原始记录，随后提交并记录绑定候选的 `DELIVER`。F 用 5 笔，在普通 DSH 直接查询三个档案并提交。首次 F 盘挂载失败、检查点拒绝嵌套路径、复核容器预检挂载失败，以及中文结清表述被旧判据误拒的 Mock 均留在运行档案。最终冻结版沿用普通文件检查点和同一业务判据，认可‘已核准并按 rebase 合入’的有效表述。

发布归档保存两组 Mock 的原始回放、调用配对、逐请求账本、Git bundle 及原稿。P 有 Principal 和维护者两条流，F 有一条 Principal 流。[P Mock](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/mock/P/result.json) · [F Mock](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/mock/F/result.json)

## 真实配对

| 会话 | 候选 | 冻结判分 | 提交与结论 | 自然退出 |
| --- | --- | ---: | --- | --- |
| Palimpsest | `8c6737fe72a2d42ec025d5d2c24c359ea4737448` | 5/7 | 只追加原报告，`DELIVER` 绑定相同候选与报告摘要 | 是 |
| 强原生 DSH | `1dcb27823d9962d82c16ee1961c3b4deec500656` | 5/7 | 只追加原报告，普通 DSH 结束 | 是 |

两个候选均直接从 `73d01e4c` 派生，工作树干净，原报告内容逐字节保留。两组把发布下一步从等待签核改为结清，分别写明送审与合入版本、相同文件树及实际主线的四条 CI 运行。原实验 7/7、6/7 和 #298 旧停点保留。P 的 `DELIVER` 回执按完整候选 SHA、路径及 SHA-256 与 Git blob 核对通过。[P 提交原稿](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/live/P/report-submitted.md) · [F 提交原稿](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/live/F/report-submitted.md)

### 判分与离线复核

- `actualMainCi` 两份均原判拒绝。冻结文本匹配要求阿拉伯数字工作流计数。P 写明“四条运行”，列出全部四个运行 ID 和 15 个 job。F 表格列出全部四个工作流与运行 ID，并写明 15 项检查成功。两份原稿的 CI 主张都能用绑定 `73d01e4c` 的终态回执复核。
- `releaseClosed` 两份均原判拒绝。两份原稿都明确结清，且解释 `OPEN / BLOCKED` 是合入前快照，却均未写出 `rebase`。冻结项将明确合入方式和业务结清绑在一起，业务提示没有把合入方式列为显式必填，三份输入也没有独立的合入方式字段。按同一原稿核对，结清决定成立，方式遗漏保留。
- 两份原稿将 15 个送审 Actions 作业简写为 15 项检查。发布验收原档另有一项精确头的 `commit-attribution` 状态，完整送审门禁是 16 项。F 末段的“本次核对新增付费请求 0”未标明是历史发布核验的计量；这条真实 F 会话为 12 笔。原稿及原判照存。[同一 Git blob 内容复核](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/content-recheck.json)

### 判分器 v2 离线复算

从 `20f14eef` 将 `releaseClosed` 限定为发布确已结清的业务判断。`mergeMethod` 单列是否明写 `rebase`。这项描述不计入原业务目标的七项判据。两份原稿都正确结清，合入方式均记录为 `REBASE_UNSTATED`。

`actualMainCi` 从追加节识别明确标注的完整主线 SHA，逐一对照该主线 SHA 下的封存运行 ID、终态和所属作业。四条运行都要有主线 CI 引用。可以逐行列出，也可以写中文或阿拉伯数字计数。若正文提供计数，数量须与回执相符。只给计数、送审区的同名检查、错误的完整 SHA 或只有部分正确运行 ID 都无法通过。

| 会话 | 原候选 | 冻结原判 | v2 业务判据 | 合入方式 |
| --- | --- | ---: | ---: | --- |
| Palimpsest | `8c6737fe72a2d42ec025d5d2c24c359ea4737448` | 5/7 | 7/7 | 未载明 rebase |
| 强原生 DSH | `1dcb27823d9962d82c16ee1961c3b4deec500656` | 5/7 | 7/7 | 未载明 rebase |

复算直接从两个封存 bundle 取回相同的 Git 对象，核对父提交、允许路径、blob 与报告原始字节，从 `73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad` 绑定的封存资料确认 4/4 工作流、15/15 作业。冻结 `result.json`、原稿、轨迹和上一轮 7/7、6/7 按原档保存。#298 第 16 笔 `UNKNOWN`、草案 1/4 及待准入工单照存。复算新增付费请求 0。[v2 复算证据](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/offline-score-v2.json)

```powershell
node --test scripts/pnwf/software/maintenance-release-score.test.mjs
node scripts/pnwf/software/maintenance-release-rescore.mjs research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence
```

### 谁先取证，谁主动求证

下表时间从各自 DSH 轨迹起点计算，箭头标出工具调用和结果序号。

| 动作 | Palimpsest | 强原生 DSH |
| --- | --- | --- |
| 定位交接与旧决定 | 第 1 笔查 Pulse。第 2 笔 `29→30` 查目录，第 3 笔 `37→38` 取旧 OPEN/BLOCKED 快照，10.102 秒。 | 第 2 笔 `29→30` 查目录，第 3 笔 `35→36` 取旧快照，12.813 秒。 |
| 首先取得反例 | Principal 第 4 笔 `43→44` 读合入结果及 `45→46` 读主线 CI，12.672 秒取齐。 | Principal 第 3 笔 `37→38` 读合入结果及 `39→40` 读主线 CI，12.923 秒取齐。 |
| 主动联系维护者 | 第 7 笔 `73→74` 把档案 ID 当基线被拒。第 8 笔以完整 SHA 发出 `79→80`，71.987 秒收到三份已查阅原始资料。同笔的 `81→82` 将档案 SHA-256 当 Git 基线再次被拒。 | 第 5、6 笔 `63→64`、`69→70` 分别传了描述文本和档案 ID 加摘要，两次都被拒。维持自查路径，维护者未启动。 |
| 落笔与提交 | 第 11 笔 `107→108` 增加发布节，第 13 笔 `123→126` 提交，150.229 秒。第 14 笔查 readiness，第 15 笔 `141→142` 记录 `DELIVER`，第 16 笔收尾。 | 第 9 笔 `95→96` 增加发布节，第 11 笔 `111→114` 提交，103.690 秒。第 12 笔收尾。 |

P 的第一次联系已经能指出旧快照与 `MERGED` 的先后关系。F 第一次联系的原问题也同时列出了 `OPEN / BLOCKED`、合入主线 SHA 和 CI 成功。这说明两个 Principal 都先独立获得了能改变发布决定的证据，才试图找上一班确认。P 的维护者重新读原快照、合入和 CI，观测到同三份档案，回传后自然退出。回传的档案 ID、字节与直接查询一致，交付中的结清决定和版本事实均可追溯到联系前的查询。轨迹记录到成功的自主求证与交付，未观察到同伴提供新的反例并改变交付。

两组共四次联系因同一原因被拒。工具签名把 `basis` 声明为字符串，描述未明确要求当前完整 Git HEAD，拒绝也只回通用错误码。两边把记录名或 SHA-256 当成了 Git 版本。P 从已读记录中重试成功，F 保留自查结果。这一差异包含工具契约的影响，单对样本无法量化产品和模型各自的贡献。[P 求证记录](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/live/P/out/RELEASE/release-desk.json) · [F 求证记录](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/live/F/out/RELEASE/release-desk.json)

### 请求、用量和耗时

| 会话或角色 | 请求 | fresh input | cache read | cache write | output | 总 tokens | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest 合计 | 20 | 76,329 | 575,232 | 0 | 16,652 | 668,213 | 208.745 秒 |
| P Principal | 16 | 64,615 | 553,984 | 0 | 14,095 | 632,694 | DSH 170.129 秒 |
| P 维护者 | 4 | 11,714 | 21,248 | 0 | 2,557 | 35,519 | DSH 23.639 秒 |
| 强原生 DSH | 12 | 61,875 | 364,160 | 0 | 10,839 | 436,874 | 153.542 秒 |

会话耗时含容器启动和收尾，角色 DSH 时长重叠。P 成功的联系从调用到回传约 39 秒。P 多 8 笔、231,339 tokens 和 55.203 秒，维护者只占其中 4 笔、35,519 tokens。P Principal 自身多 4 笔、195,820 tokens，其中 cache read 增加 189,824。造成额外请求的轨迹动作包括 Pulse、重复查档和联系、readiness 与 `DELIVER`。本样本的协作复核确认了已经可用的证据，冻结内容得分与 F 相同。P 额外留下了可冷查的候选绑定结论。

32 笔终态均有账本，`UNKNOWN` 为零，工具调用与结果完整配对 51/51。旧分析器拒绝对多流使用 OpenCode Go 缺响应 ID 的回放回退。保留该原记录，离线再按 Principal、维护者各自的唯一用量四元组核对回放、准入顺序和终态，歧义不配对，32 笔全部绑定。上一轮 7/7、6/7 原判和 #298 第 16 笔 `UNKNOWN` 继续保存。[逐笔对账与调用顺序](../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/comparison.json)

## 复算

完整运行目录在 `F:/Codex_Work_Space/Palimpsest/experiments/runs/maintenance-release-evidence-1795755813991/run-v4`，早期 Mock 失败现场在同层试验根目录。仓库证据保存冻结摘要、两组零付费资格、原始输入、Git 工件与未改写轨迹。宿主另从 GitHub 只读核对 PR 实际合入及主线 CI，并从确切 Git 对象复核两个树一致。

```powershell
node scripts/pnwf/software/maintenance-release-recount.mjs research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence
```

运行入口 `scripts/pnwf/software/maintenance-release-evidence.mjs` 支持 `freeze <run> <上一轮发布档案>`、`mock <run>` 和 `live <run>`。运行环境固定在原基线，F 盘无法绑定时可把一次性浅克隆路径传给 `PALI_RELEASE_GIT_MOUNT`。离线复算和档案校验不调用模型。

## `release_contact` 基线契约修复与真实复跑

从主线 `3e9b28ae6b2aa0b926395f79079d6db44e104ca8` 修复宿主和工具。两组业务 Git 基线仍为 `73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad`，冻结档案、业务提示、DSH 镜像及计量窗口的摘要与上轮一致。每组仍使用独立账本，256 笔、60 分钟、单请求 240 秒，按量记账，金额和总 token 无上限。两组启动时没有收到复核回执。F 盘的 Docker 绑定仍不可用，容器使用一次性挂载，结束后整套现场移回 F 盘。

工具参数明示 `basis` 是交接开工时 `git rev-parse HEAD` 输出的完整 40 位 Git SHA。错基线单独返回 `REVIEW_BASIS_MISMATCH`、`expectedBasis`、核对命令和重试步骤。修订过工作区的调用者仍可使用该次交接的固定基线复查历史。错误基线在启动维护者之前被拒绝。非法问题使用独立错误码。

零付费回归按原调用 ID 取回 P 的 `73→74`、`81→82` 与 F 的 `63→64`、`69→70`。四个错误参数按原值重放。两场 Mock 分别用 13、12 笔请求验证有期望 SHA 和恢复步骤的两次拒绝，按返回的字段重试，同组只启动一个维护者。两组均收到三份档案、得分 7/7、自然退出，P 的候选有 `DELIVER`。相关 Node 测试 72/72，包含 6 项新增定向回归，架构和公共 API 检查通过。[原错误调用](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/mock-contact-cases.json) · [Mock 资格](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/qualification.json)

### 求证、采纳与交付

| 会话 | 上轮求证 | 本轮首次联系 | 本轮交付 |
| --- | --- | --- | --- |
| Palimpsest | 两次基线拒绝，一次回传 | 第 6 笔 `69→70` 传对完整 SHA，收到三份档案 | `138329df000d63a8e4d4d74a3790bae91b0326ed`，第 10 笔 `97→100` 提交，第 12 笔 `115→116` 记录候选绑定 `DELIVER`，自然退出 |
| 强原生 DSH | 两次基线拒绝，无维护者会话 | 第 6 笔 `73→74` 传对完整 SHA，收到三份档案 | `519105018b77233e2d878d96a168e7c4742a38c7`，第 11 笔 `117→120` 提交，随后自然退出 |

P 在第 3 笔 `33→34`、`35→36`、`37→38` 已直接读到三份档案。F 在第 4 笔 `51→52`、`53→54`、`55→56` 完成同样查档，联系的问题已列出送审 SHA、发布树和主线版本。两个维护者回传与 Principal 已读的档案 ID 和字节相同。P 第 8 笔 `83→84`、F 第 9 笔 `99→100` 开始追加发布节，将等待签核改为结清。交付中的完整版本、文件树、CI 和 #298 停点在直接查档阶段已有依据。轨迹支持这两次回执起到复核作用，未观察到回传引入新事实并改变交付字段。[P 原稿](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/live/P/report-submitted.md) · [F 原稿](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/live/F/report-submitted.md)

本轮冻结判分 P 为 6/7、F 为 7/7。P 附加节写了“文件树为同一”，现有 `treeEquivalence` 只匹配“一致”“相同”等词。独立读取送审和主线 Git 对象确认两树均为 `94af6e02d70a081fb107ee06bc770b5aa55f77ef`。保留这个冻结缺项，旧配对各 5/7、离线各 7/7 和 `REBASE_UNSTATED` 也照存。本轮两稿同样未明写 `rebase`。主线 CI 项两稿均通过。

### 复核用量与等待

| 会话 | 上轮请求 / tokens | 本轮请求 / tokens | 其中 Principal | 其中维护者 | 本轮耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 20 / 668,213 | 21 / 789,492 | 13 / 610,454 | 8 / 179,038 | 264.713 秒 |
| 强原生 DSH | 12 / 436,874 | 25 / 920,567 | 13 / 602,188 | 12 / 318,379 | 315.314 秒 |

| 维护者 | 到写入回执为止 | 写入回执之后 | 从联系到可读 | 写入到 Principal 收到 |
| --- | ---: | ---: | ---: | ---: |
| P | 7 笔 / 136,218 tokens | 1 笔 / 42,820 tokens | 94.943 秒 | 13.085 秒 |
| F | 9 笔 / 179,860 tokens | 3 笔 / 138,519 tokens | 158.160 秒 | 91.187 秒 |

P 的维护者查完归档后，又尝试读取浅克隆中缺失的历史对象，第 4 笔有一次 Git 作业失败，然后继续复查文件树与 handoff，在第 7 笔 `71→72` 写入回执。F 的维护者第 9 笔 `99→100` 写入回执，随后继续核对 Git 元数据、读 handoff 并查看轨迹样本，直到第 12 笔退出。当前 broker 等维护者自然退出才向 Principal 返回，因此 F 的 91.187 秒包含回传后的三笔请求和退出等待。

两边基线拒绝都从两次降至零，两个 Principal 合计从 28 笔降到 26 笔。完整配对仍从 32 笔增到 46 笔，增加 604,972 tokens，主要来自复核。本轮两名维护者合计 20 笔、497,417 tokens，占总用量约 29%。旧配对只有 P 启动维护者，4 笔、35,519 tokens。两组真实请求全部对账，调用与结果 75/75，无新增 `UNKNOWN`。原分析器的多流 OpenCode Go 限制照存，离线按角色和唯一用量四元组绑定 46/46 笔。[逐笔归因](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/comparison.json) · [求证和用量对比](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/contact-comparison.json)

全量原始现场位于 `F:/Codex_Work_Space/Palimpsest/experiments/runs/release-contact-basis-1795759747459/docker-staging/pair`。仓库中的对应归档可通过 `node scripts/pnwf/software/maintenance-release-recount.mjs research-evidence/pnwf-software/2026-11-27/release-contact-basis` 离线复算。原 #298 第 16 笔 `UNKNOWN`、草案 1/4 和待准入状态仍按既有归档。

## 树等价、回执即时投递与复跑

从 `42560749d9cb052e0197d306c1fe3872b6772287` 开工，P/F 仍用 `73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad` 的业务工作区。封存原档、业务提示、DSH 版本和镜像相同，真实会话沿用 256 笔、60 分钟、单笔 240 秒及按量记账。金额和总 token 无上限。两边仅收到原业务目标，可自由查档或联系上一班。启动时无预投回执。

宿主从完整送审和主线 Git 对象分别读取树，核对两个确切 SHA 与官方回执均指向同一树。报告中的共同树必须和这两个版本及正确的树摘要关联。两个提交 SHA 不同的陈述可以与树相同共存。否定树等价和与树无关的“一致”均在回归中拒绝。前一轮 P 6/7、F 7/7 保留，用上一轮相同 Git bundle 离线 v3 均为 7/7。[上一轮同一提交复算](../../research-evidence/pnwf-software/2026-11-27/release-contact-basis/offline-score-v3.json)

发布复核使用夜班场景的 SQLite `ReceiptStore`。回执身份由固定基线、档案清单摘要及去除首尾空白的请求生成。拒绝的基线或未查阅材料无法生成回执。有效 `release_return` 取宿主证据写入 SQLite，再兑现等待中的 `release_contact`，维护者工具收到该次回执的核验结果后结束 turn。相同请求可加入正在进行的复核，或读回已经提交的同一份回执。定向回归验证了进程退出前可读、数据库重开同一回执、错档案及错请求 ID 隔离，以及退出清理失败后的保存结果。

### 零付费资格

P/F Mock 分别 13/12 笔，付费 0。每组重放原来的两次错基线，回传指定 SHA 和恢复步骤，校验不读材料直接返回被拒。有效回执送达后维护者自动结束 turn，退出码为 0，回传后零请求。Principal 再次发出同一问题，收到完全相同的回执，两组均只启动一次维护者，冻结 7/7。回放证据单独记录 SQLite、回执 ID、重试命中及自然退出。[Mock 资格](../../research-evidence/pnwf-software/2026-11-27/release-receipt-delivery/qualification.json) · [时序证据](../../research-evidence/pnwf-software/2026-11-27/release-receipt-delivery/receipt-comparison.json)

### 真实投递与耗时

| 会话 | 从联系到回执入账 | 入账到宿主开始返回，修复前 → 后 | 入账到 Principal 工具结果 | 回传后请求，修复前 → 后 |
| --- | ---: | ---: | ---: | ---: |
| Palimpsest | 114.291 秒 | 13.085 秒 → 1 毫秒 | 17 毫秒 | 1 → 0 |
| 强原生 DSH | 198.950 秒 | 91.187 秒 → 1 毫秒 | 22 毫秒 | 3 → 0 |

P 的维护者在 `31→32` 回传，3 毫秒后记录 `turn/end completed`，Principal 从调用 `67→68` 取得回执。F 的对应调用是维护者 `143→144` 和 Principal `81→82`，维护者 1 毫秒后记录 `turn/end completed`。两位维护者均自然退出。按回执 ID 配对两条 DSH 流，再从 SQLite 读回同一载荷，可直接验证以上时差。真实样本各进行一次复核，缓存重试由 Mock 和数据库重开回归覆盖。

| 会话 | 真实请求 | 总 tokens | 维护者请求 / tokens | 会话总耗时 |
| --- | ---: | ---: | ---: | ---: |
| Palimpsest | 20 | 1,090,349 | 3 / 28,996 | 313.676 秒 |
| 强原生 DSH | 36 | 1,245,006 | 17 / 265,759 | 410.359 秒 |

56 笔全部对账，79/79 对工具调用与结果配对，新增 `UNKNOWN` 为零。原分析器的 OpenCode Go 多流限制照存，使用既有角色与唯一用量四元组复算。前一轮两位维护者回传后仍用 4 笔、181,339 tokens，本轮为零。全程反而比前一轮多 10 笔、625,296 tokens。两位 Principal 合计从 26 笔增到 36 笔，F 维护者在回传前就用了 17 笔。即时投递消除了回执可用后的等待和请求，形成回执及 Principal 自身的工作仍主导整场耗时。本次单配对保留各段实际用量，不把差额推断为一般产品收益。[逐笔归因](../../research-evidence/pnwf-software/2026-11-27/release-receipt-delivery/comparison.json)

### 交付与实跑判分

| 会话 | 候选 Git SHA | 冻结 v3 | 同一 Git 对象离线 v4 | 退出 |
| --- | --- | ---: | ---: | --- |
| Palimpsest | `4ea8e2f43f1ce1887fc30df2dbc9138221b6e755` | 5/7 | 7/7 | 候选绑定 `DELIVER`，自然退出 |
| 强原生 DSH | `96e6648c61b61c94d91ec88e313a94e76bcfdce5` | 5/7 | 7/7 | 提交后自然退出 |

两位 Principal 在联系前均已从档案查到三份原始资料。持久回执返回同一版本的三份资料，原稿都引用了回执作为复核来源。结清决定、实际主线和 CI 数据在联系前就可确定，轨迹未观察到新增证据改变这些交付字段。两组都只追加发布报告，保留 #298 第 16 笔 `UNKNOWN`、草案 1/4 及原待准入状态，合入方式依然单列为未明写 `rebase`。

真实运行时冻结的 v3 给两稿各 5/7。两个共同树都用表格和两个归档字段表达，旧 v3 只查找显式树等价语句。P 把送审和主线 CI 写在同一段，旧判据按段首排除了两句。F 的句子“两者不可混为同一次运行”里的“一次运行”被当成工作流计数。后续 v4 只做离线修正，识别有确切双来源的共同树表格，按句分离 CI 并排除该非计数量词。新增两份原稿回归以及缺运行 ID 和否定树的反例。原 Mock 原稿用 v4 回算仍各 7/7，最终相关测试 78/78。冻结 v3 实现、两组原判及原稿按原档留存，修正后没有新增真实模型请求。[本轮同一 Git 对象复算](../../research-evidence/pnwf-software/2026-11-27/release-receipt-delivery/offline-score-v4.json) · [冻结运行判分](../../research-evidence/pnwf-software/2026-11-27/release-receipt-delivery/live/matrix.json)

### 异步 PTC 对剩余等待的作用

本轮保留同一个 `release_contact` 接口。回执生成后已经可以立即交付，P/F 剩下的 114.291 / 198.950 秒主要发生在回执入账前。异步 PTC 适合把这一段与独立工作重叠。发起复核后先得到持久请求 ID，Principal 可以继续核对其他材料。需要结果时再按 ID 等待或读回，由同一份已入账回执恢复。若调用方没有独立工作，仍需等到回执就绪。

此前调研里的 DeepSeek Harness `wait_agent` 在一个根 PTC 调用内按输入 ID 去重唤醒，等程序结束后待处理输入才交给模型。Palimpsest 可沿用这一区分，把回执入账、通知就绪、Principal 读取及交付采纳分别记账，避免对一个已观察到的回执反复唤醒。下一步若比较异步路径，关键观测量是回执生成期间实际完成了多少独立工作，以及最后的等待和返工。[DeepSeek Harness 固定版本源码](https://github.com/deepseek-ai/deepseek-harness/blob/ddac967/packages/subagent/tool-subagent-control/src/wait-agent.ts)

原始现场已迁至 `F:/Codex_Work_Space/Palimpsest/experiments/runs/release-receipt-1795761324879/docker-staging/pair`。仓库证据中的压缩轨迹、持久回执、Git bundle 和运行账本可在不接入模型的情况下复算。
