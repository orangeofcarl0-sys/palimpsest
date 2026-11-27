# 发布接班中的主动求证 · Palimpsest 与强原生 DSH

## 工单与独立验收

PR #303 的最后一份送审快照仍是 `OPEN / BLOCKED`，送审头的 16 项检查已绿，交接人仍需确认所有者核准、实际合入和主线验收。随后所有者核准完整送审 SHA `feae96bde35909eacb86450c17ac42087ef73f9a`，按 rebase 合入 `73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad`。两个提交的文件树同为 `94af6e02d70a081fb107ee06bc770b5aa55f77ef`。后来生成的主线回执记录实际合入 SHA 的 4/4 工作流、15/15 作业均通过。这些事实足以把发布记录从等签核推进到结清。正式运行位 #298 的用量阻断依然有效。[PR #303](https://github.com/orangeofcarl0-sys/palimpsest/pull/303) · [主线运行](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878125806)

这张工单来自上一轮实际发布、核验和 handoff 交接。主线原实验报告尚未收录精确发布记录，两组从同一完整基线出发，在原报告末尾补记当前决定、两个完整 SHA、文件树及主线 CI 来源。宿主独立核对七项事实，分别是干净且严格限于报告的直系提交、发布结清、两个完整版本、文件树一致、实际主线 CI、原 7/7 和 6/7，以及 #298 第 16 笔 `UNKNOWN`、草案 1/4 和原待准入工单仍有效。正文从候选 Git blob 读取。

## 证据可达性与运行窗口

两组接受同一业务提示，拥有相同的只读 `release_archive` 和 `release_contact`。会话启动时只有业务目标、旧记录的入口和工作树。Palimpsest 另外冷读同一项目的 Journal、短索引和 `handoff.md` 检查点。三个封存文件是原送审快照、实际合入读回及主线 CI，工具可以按记录 ID 直接读取。如果主动联系上一班维护者角色，宿主在独立 Git 副本和全新普通 DSH home 中启动该角色，使用同一会话账本，只能回传已查阅且绑定本轮基线的原始记录。角色依据上一班的真实档案重新调查。启动时两组均未收到复核回执。

冻结 DSH `0.2.1-rc.5`、同一容器映像和 OpenCode Go `deepseek-v4.1-flash`。每组独立 cohort，最多 256 笔、60 分钟，单请求 240 秒。按量记账，金额及总 token 无上限。有真实终态用量 `UNKNOWN` 则停止后续会话。Docker Desktop 本轮无法访问 F 盘绑定目录，容器临时挂载用 C 盘一次性工作区，源码与档案仍放 F 盘。

## 零付费资格

最终 Mock 两组均为 7/7，17 笔全部结算，付费 0，均自然退出。P 用 6 笔 Principal 请求与 6 笔独立维护者请求，验证错基线拒绝、未读证据拒绝、维护者从隔离副本查询并回传三个原始记录，随后提交并记录绑定候选的 `DELIVER`。F 用 5 笔，在普通 DSH 直接查询三个档案并提交。首次 F 盘挂载失败、检查点拒绝嵌套路径、复核容器预检挂载失败，以及中文结清表述被旧判据误拒的 Mock 均留在运行档案。最终冻结版沿用普通文件检查点和同一业务判据，认可‘已核准并按 rebase 合入’的有效表述。
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
