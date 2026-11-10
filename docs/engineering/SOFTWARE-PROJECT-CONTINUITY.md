# gRPC 迁移三会话资格

2026-11-10 · 路线图基线 fdfad589bf4eb7aab6aa4271a095de28fb36bf40

## 交付回执

工件观察器每次核验当前完整 HEAD，用该提交和路径读取 Git blob，然后复查 HEAD。成功回执的 SHA 与摘要由同一次 Git 对象读取绑定。脏文件、读不到 Git 对象或观察期间 HEAD 漂移时，回执报告工作树中的文件，提交字段为空。Episode 的基线继续由项目 Head owner 提供。缺少现场文件时，仍可由已完成 Attempt 的结果提交提供正式候选工件。[实现](../../src/composition/continuity.ts) · [同一 Host 的回归](../../test/alhs_episode_convergence.test.ts) · [Attempt Result 回归](../../test/pwrs_relay.test.ts)

离线复算 Energy 两份历史 T3 原稿时，核对原封存摘要、接受 HEAD 与摘要 Git blob，并从原发布树提取严格评分器。回执组仍为 **REVIEW_CONTENT_MISMATCH**，定向回读组仍为 **PASS**。两份原稿与发布 blob 逐字节一致。[原始结果](ENERGY-PROJECT-CONTINUITY.md#摘要提交和退出) · [离线复算记录](../../research-evidence/pnwf-software/2026-11-10/energy-review-recount.json)

## 冻结场景

两组复制同一份 REST 种子提交。T1 完成 gRPC 迁移并提交。宿主只在 T1 后新增 Fleet 更正，要求零值或省略 limit 返回前三条可用读数。T2 允许四个写路径。server、集成测试和 MIGRATION.md 必须变更，server 测试可变更。宿主按 blob 比对 proto、wire codec、gRPC client 和 REST 测试。T3 只允许提交 MIGRATION-REVIEW.md，须引用确切接受 HEAD 和更正路径，说明默认行为、兼容边界与核验结果。[冻结合同与业务提示](../../scripts/pnwf/software/contract.mjs)

宿主从被测完整 SHA 提取 Git blob，在无外网容器中运行服务和公开测试。独立探针在另一进程通过仅有回环的网络命名空间发送原始 HTTP/2 gRPC 请求。探针自行编码字段和解码帧，不加载候选的 client 或 wire codec。显式零值和省略字段分别发送。正数 2、6 检查原顺序和限制，unary 核对一帧内容，两个未知站点调用核对 NOT_FOUND 状态。评分器及参考产物留在模型容器之外。[宿主评分器](../../scripts/pnwf/software/score.mjs) · [原始探针](../../scripts/pnwf/software/probe.cjs)

## 两组零付费资格

P 为 Palimpsest，F 为强原生 DSH。六个会话均用 DSH `0.2.1-rc.5`、独立 cohort 和全新 home，Mock 会话窗口为 180 秒。两组共 38 笔请求全部结算，30 对工具调用与结果按 ID 配对。正向会话观察到的拒绝和失败作业均为 0，付费调用为 0。[资格封存、用量和六项事实](../../research-evidence/pnwf-software/2026-11-10/qualification.json)

| 会话 | 文件存在 | 业务正确 | Git 持久化 | 正式结算 | 适用的接受 | 自然退出 | 请求 / 工具配对 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P T1 | 通过 | 通过 | 通过 | 不适用 | 不适用 | 是 | 3 / 2 |
| P T2 | 通过 | 通过 | 通过 | 门禁 PASS | 退出时待核准，随后晋升 | 是 | 17 / 15 |
| P T3 | 通过 | 通过 | 通过 | 不适用 | 晋升 HEAD 已核对 | 是 | 4 / 3 |
| F T1 | 通过 | 通过 | 通过 | 不适用 | 不适用 | 是 | 2 / 1 |
| F T2 | 通过 | 通过 | 通过 | 不适用 | 退出时待核准，随后快进 | 是 | 9 / 7 |
| F T3 | 通过 | 通过 | 通过 | 不适用 | 核准 HEAD 已核对 | 是 | 3 / 2 |

两组 T1 在旧规则下 7/7，换用新规则后只在显式零值和省略字段两项被拒。两组 T2 在新规则下 7/7，在旧规则下同两项被拒。四次公开测试各通过 10 项。T2 候选实际变更 server、集成测试和迁移说明。proto、wire codec、gRPC client 和 REST 测试的 blob 都与各自基线一致。

P T1 与 T3 均记录 `DELIVER`。P T2 接纳 Fleet 更正所在的 `503b2a733c3cd0f897f316f78349a8ae0ae28eb8` 为正式基线，随后经历 Work 计划、委派、观察结算与运行门禁。Principal 发出 13 笔请求，独立 Worker 发出 4 笔，归入同一账本。候选 `38dc32c50fc25214a5327cfdab5b14043dcd923e` 通过门禁后，Principal 记录 `WAIT_FOR_OPERATOR` 并退出。宿主按完整候选 SHA 执行 Mock 核准，晋升 HEAD 为 `15349edbeab2366f95eb791b88d549be22f4ff3e`。T3 的 Episode 基线指向该晋升 HEAD，摘要工件回执指向 `9db5c01536e2a31197a387a5d38d78aa3a426a1a`，摘要哈希可从该提交的 blob 复算。

F T2 由原生 Subagent 在独立 worktree 提交 `734925e3c945433b2accc1d20879dd7481d8ee50`。6 笔 Principal 请求和 3 笔子任务请求归入同一账本。宿主按该 SHA 核准并快进。F T3 从核准 HEAD 提交 `11d8ba7072201beeeb8cb0e6a0b9c396f0c6732f`。两份 T3 都只改一份评审摘要，均明确写出接受 SHA、更正路径、默认值变化、兼容边界和测试结果。

## 拒绝与失败现场

| 故障注入 | 观察到的结果 |
| --- | --- |
| Worker 基线改用种子 SHA | 运输端口在分配隔离执行副本前返回 `WORKER_REQUEST_BASIS_MISMATCH` |
| 候选在三个必改文件外另改 README | 正式运输所用的结果校验器拒绝该确切提交，返回 `SOFTWARE_RESULT_OUTSIDE_SCOPE` |
| 用 T2 基线 SHA 签批候选 | 两组均返回 `CANDIDATE_APPROVAL_SHA_MISMATCH`，T3 目录尚未创建 |
| 读取评分资料 | 每个 Principal 和正式 Worker 的实际挂载均无评分资料，私有探针读取被拒绝。T1 的实际 Shell 同时检查项目中没有 `expected/` |
| 模拟 Provider 不返回终态用量 | 账本进入 `UNOBSERVABLE_USAGE`，保留一笔未决预留。下一会话被 `COHORT_STOPPED` 拒绝，维持 `NOT_STARTED` |

保留了越界候选的完整 Git 对象和缺失用量的账本快照。[越界候选](../../research-evidence/pnwf-software/2026-11-10/rejected-scope.bundle) · [账本快照](../../research-evidence/pnwf-software/2026-11-10/missing-usage-accounting.json)

最终运行完整现场在 `C:/Users/66494/AppData/Local/Temp/pnwf-software-20261110-025855`。此前的独立调试目录保留了失败现场，包括 Mock 网关测试的密钥长度校验、软件 Worker 入口的 DSH Host 导出漏传、流式夹具测得 119 ms 时被 120 ms 阈值拦截，以及 Windows 不能直接解析原生 worktree 的容器内绝对路径。修复分别使用随机会话密钥、完整转发现有 Host API、给公开计时断言留一个帧间隔的余量，以及在宿主显式绑定 worktree 的 Git 管理目录。独立 HTTP/2 探针仍按实际帧数、内容、顺序和状态评分。

## 复算

先构建产品，使用已有的 PNWF 隔离镜像。从仓库执行以下命令，Windows 使用 Docker 可挂载的新目录。

~~~powershell
pnpm run build
$run = Join-Path $env:TEMP ('pnwf-software-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node scripts/pnwf/software/run.mjs --action=qualify "--run=$run"
~~~

每个会话单独保存账本 SQLite、请求观测、DSH 轨迹、调用配对、隔离检查及结果。直接运行归因入口可以从任一保留的 DSH stream 重新生成时间线。正式 Worker 的 DSH stream 在该 Attempt 的独立 home。资格汇总保留每笔 ADMITTED 和 TERMINAL、用量分项、调用 ID 与两端序号、失败作业以及六项验收。评分结果包含实际帧的站点、功率与时间戳。Git bundles 保存被测的确切提交，可与报告的 SHA 及 blob 逐一核对。[归因入口](../../scripts/psvr/session_attribution.mjs) · [运行入口](../../scripts/pnwf/software/run.mjs)

证据目录的 `traces/` 保存原始压缩轨迹。对账时用 `node scripts/psvr/session_attribution.mjs <stream.jsonl.zstd> <out-prefix>` 重建调用与结果，再与 `qualification.json` 中同角色的调用 ID、序号和账本用量核对。用 `git clone <project.bundle> <replay-dir>` 取出完整项目树，再按记录的 `commit:path` 读取对应 Git blob。Palimpsest 的晋升前候选由独立的 `P-candidate.bundle` 提供。

从归档的八条原始轨迹重算，30 对调用 ID 和两端序号逐一匹配。从归档 Git bundles 重跑，六个会话的评分与原记录逐项相同，越界候选仍被拒绝。本轮构建、架构、公共 API 检查均通过。Episode、Attempt Result、Direct 到 Governed 和 Basis Admission 共 33 项回归通过，PNWF 账本、Energy 复用合同与轨迹归因共 35 项测试通过。

脚本化 Mock 验证实际执行链，合成用量按 Mock 的字节口径记账。自主协作选择、真实用量、项目效果与净收益留给另行授权的真实配对。

## 真实诊断配对

从主线 `268f14f98099b10b181ec9dd1ea4e07ecbe43d31` 启动。两组使用相同 REST 种子树、三条业务提示、Fleet 更正、独立评分器和镜像，模型为 `deepseek-flash`，DSH 为 `0.2.1-rc.5`。宿主在启动前把这些输入与主线归档的 Mock 封存逐项核对。按量记账的执行条件为每会话 64 笔、30 分钟，单请求 240 秒。正式 Worker 与原生子任务计入所在会话。金额和总 token 上限均为空，任一已启动会话用量无法核对时关闭后续准入。

运行顺序为 P T1、F T1、P T2、F T2，再按各组完整候选 SHA 的核准顺序启动 T3。两组 T2 提示只要求独立执行、隔离副本和候选送审。Palimpsest 可选择正式 Work Worker，也保留原生协作工具。正式候选与 Git 候选的接受分别记录，业务判分、隔离、正式结算、`WAIT_FOR_OPERATOR` 和自然退出各自判定。T1 和 T3 的 `DELIVER` 及可取回工件 SHA 也独立核验。

完整运行保存在 `C:/Users/66494/AppData/Local/Temp/pnwf-grpc-live-20261110-150630`。每个会话保存请求前账本、终态用量、原始 DSH stream、按调用 ID 复算的时间线以及适用的 Git 和审批记录。[宿主运行入口](../../scripts/pnwf/software/live.mjs)

### T1 冻结评分和离线定位

Palimpsest T1 从 `continuity:pulse`（调用 15、结果 16）进入任务。它读原有 REST 服务、客户端和测试，自己实现迁移，没有委派。写完后多次执行公开测试，对客户端和服务端做局部修改。首次探索 shell 调用（17、20）出现一次非零退出，随后改用 Git 和文件树检查恢复。提交发生于调用 136，接着在 147 调用 `conclude DELIVER` 并得到 `RECORDED`。会话自然退出，七份回执均指向实际提交 `3dadc3a1df9cabf2fd40543f711e3720916e9447`，每个回执摘要都能从该提交的 Git blob 复算。Episode 基线保留 REST 种子 SHA。

冻结评分器在原样 proto 上返回 `SOFTWARE_PROTO_RPC_CONTRACT`，因为它匹配的入参消息名为 `SiteRequest` 和 `StreamRequest`，模型声明的是 `GetReadingRequest` 和 `StreamReadingsRequest`。业务提示和公开任务只要求方法、流式形态与提交后的字段号稳定。宿主对同一完整 SHA 的只读快照执行原 HTTP/2 探针，旧规则 7/7，公开测试 17/17。显式零值和缺省值都返回空流，正数 2 和 6 的帧内容与顺序正确，unary 返回一帧，两个未知站点调用返回状态 5。原评分拒绝和离线定位单独记录。

所有者批准 Palimpsest 从该原始 T1 SHA 继续。宿主把同义请求消息名纳入单独封存的复核，额外核对方法所属服务及消息字段编号。原评分和原始 Git 对象保留。T2 使用正式 Basis Admission 接纳首版与 Fleet 更正；只有在保留首版 proto blob 时，候选才适用同一别名复核。

强原生 T1 先用 shell 与 `read` 探索项目，随后直接实施，同样没有委派。一次 README 编辑失败（119、120），之后先读取再编辑。它做了三次公开测试、语法检查，并在调用 187 发起自己的原始 HTTP/2 检查，再提交 `4bdfe5da0b79f5ad699c22ccb12e95ec781dc8c0`（215、218）并自然退出。它额外更新了 README 的迁移说明和文件导航，原评分在检查交付文件集合时返回 `SOFTWARE_T1_ARTIFACTS_MISMATCH`。其 proto 也采用两种请求消息别名。同一 Git 提交的离线 HTTP/2 探针 7/7、公开测试 16/16，REST 代码和测试的 blob 保留。

| T1 | 模型请求 | fresh input | cache read | cache creation | output | 总 tokens | 容器会话秒数 | 配对调用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 18 | 11,660 | 532,864 | 0 | 28,467 | 572,991 | 257.956 | 24/24 |
| 强原生 DSH | 31 | 13,515 | 999,808 | 0 | 36,837 | 1,050,160 | 288.916 | 33/33 |

两个 T1 都由单个 Principal 执行，差额出现在同一会话内。强原生多 13 笔请求和 477,169 tokens，其中 466,944 为 cache read，fresh input 多 1,855。首笔缓存读取是 P 10,112、F 5,120，随后 F 的更多请求反复带上已缓存的上下文。F 多做文件树与环境探索、文档更新、codec 和客户端的后续检查。该轨迹支持重复请求和输入增长的解释，服务端跨会话缓存来源未知。两组的独立账本均无未决用量。

强原生 T1 经所有者核准后采用同样的原提交复核。准入差异限于已审阅的 README 导航；复核同时核对两个请求别名、消息字段号和实际线协议。强原生 proto 将 `watts` 声明为 `int64`，首版的固定读数可按相同 varint 字段验证，T2 仍须保留其确切 proto blob。

### Palimpsest T2 的正式委派与接管

Principal 先读取更正、现有代码和测试，尝试 `work:begin`（97、98），收到该部署只支持在地 bootstrap 的错误。接着用 `work:plan`（103、104）建立正式任务，选择六个写路径，额外纳入 proto 注释和客户端文档。调用 `work:delegate`（109、110）创建 Attempt。宿主实际记录 `SOFTWARE_REVISION_SCOPE_MISMATCH`，未启动正式 Worker。模型查询 shell 作业时收到 `unknown job`（115、116），`work:workers`（121、122）只显示 `FINISHED / NOT_READY`，没有回传拒绝原因。

从首次委派回复到原生 `subagent_fork`（359）前，Principal 又发出 26 笔请求、39 次工具调用，共 1,356,253 tokens，占 T2 全部 tokens 的 49.8%。这段轨迹查阅了作业、Attempt 副本、状态库、运行时文件和实现源码。随后原生子任务在同一个隔离 Attempt 中提交，Principal 查看差异、复跑测试，并调用 `work:relay takeover`（418、419）。结果为 `TAKEOVER_SETTLED`，产品记录 `MULTI_EXECUTOR`、`OBSERVED_EXIT` 和 `independenceEligible=false`。它再读 readiness（428、429），记录 `WAIT_FOR_OPERATOR`（436、437）后自然退出。正式 Worker 请求数为 0，原生子任务有 13 笔请求，与 Principal 的 44 笔使用同一账本。

候选 `fa671796ad0a8e2ff8d99901df3c1b43fd1af0dd` 已结算，正式 Head 仍为含 Fleet 更正的 `fbeb8958f4405688b13f37dbdec330157a660ab0`。原采集器只识别正式 Worker 回执和原生链接 worktree，因此报告 `NATIVE_CANDIDATE_WORKTREE_NOT_UNIQUE`。用产品的接管结算记录从 canonical Git 取回同一对象后，独立写范围校验返回 `SOFTWARE_RESULT_OUTSIDE_SCOPE`。候选改了六个文件，超出的 proto 和客户端变更均为注释，wire codec 与 REST 测试的 blob 保留。离线补测新规则 7/7、公开测试 18/18，文件范围判据失败。该候选未进入核准，Palimpsest T3 未启动。

### 强原生 T2 的独立执行

Principal 先读更正和既有实现，跑基线测试。它在调用 88 创建 `.worktrees/fleet-default-limit` 及独立 Git 分支，用本地 Git exclude 隔离该目录，再通过原生 `subagent`（96）把修订交给子任务。子任务提交后，Principal 回看 Git 差异、复跑测试，并通过原生客户端做定向调用检查。Principal 18 笔、子任务 16 笔，共用同一账本。该组没有 Work 结算步骤，候选分支和工作树在退出时均可核对，canonical HEAD 留在含更正的 `df4271d9a43c963ed386dc4de103dcfcf30f02f7`。

候选 `95a993390088c16f5bb029c9374b3fd581ee50c5` 只增加了一处越界修改。它在 proto 注释中改写零值和缺省值的含义，字段号与声明类型仍与首版一致。客户端、wire codec、README 和 REST 测试的 blob 都保留。独立新规则探针 7/7，公开测试 16/16，写范围返回 `SOFTWARE_RESULT_OUTSIDE_SCOPE`。会话自然退出，候选未进入核准，强原生 T3 未启动。

### 两条轨迹的差异

| T2 | 请求（Principal / 子任务） | fresh input | cache read | cache creation | output | 总 tokens | 容器会话秒数 | 配对调用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 57（44 / 13） | 89,764 | 2,606,464 | 0 | 29,342 | 2,725,570 | 431.360 | 114/114 |
| 强原生 DSH | 34（18 / 16） | 42,136 | 735,488 | 0 | 16,172 | 793,796 | 124.626 | 61/61 |

| 已执行 T1 和 T2 | 请求 | fresh input | cache read | output | 总 tokens | 容器会话累计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 75 | 101,424 | 3,139,328 | 57,809 | 3,298,561 | 11 分 29.316 秒 |
| 强原生 DSH | 65 | 55,651 | 1,735,296 | 53,009 | 1,843,956 | 6 分 53.542 秒 |

T2 的差额集中在 Principal。Palimpsest 比强原生多 26 笔 Principal 请求，原生子任务反而少 3 笔。正式委派之后到原生接管之前的排查贡献了 26 笔请求与 1,356,253 tokens。该段的缓存读取为 1,314,816，fresh input 为 32,635。两组已执行阶段的 cache read 占输入约 96.9%，Palimpsest 的额外消耗来自更多的重复上下文及排查带入的新内容。容器会话耗时包含启动和清理。T1 从进程退出到宿主写入授权复核记录的间隔分别为 370.046 秒和 546.057 秒，包含人工核准、离线验证及串行排程，单列于模型会话耗时之外。T2 候选均止于独立写范围检查。

两组都保留了已接受的 canonical 版本，子任务在隔离副本完成提交。正式路径的差异体现在 Palimpsest 先尝试受控委派，宿主拒绝六路径授权后，模型沿原授权的较宽 Attempt 范围完成接管。产品结算与 `WAIT_FOR_OPERATOR` 对实际过程给出了可核查证据，独立写范围门禁仍拒绝该结果。强原生直接委派，文件范围更窄，仍修改了 proto 注释。两份 T1 都曾把旧默认值写进 proto 注释。更正后这段注释过时，两个模型都选择修订它。可观察到的偏离集中在文档文字与 blob 保留条件，两个 T2 的实际 wire 行为均通过。

四个会话均自然退出。140 笔真实请求的终态用量逐一对账，232 对调用与结果按 ID 匹配。两条 T1 分别有一次 Bash 作业失败和一次编辑错误。Palimpsest T2 有两次工具错误，以及一次由 Worker 运输回执确认的宿主拒绝。强原生 T2 无工具或作业失败。两组 T2 的独立范围判据均失败，本次观测覆盖两组 T1 和 T2。它提供了一次受控路径选择与保留判据的诊断样本，T3 接续和完整项目周期差异仍未观测。[逐请求、调用配对、复核与 Git 证据](../../research-evidence/pnwf-software/2026-11-10/live-pair-150630/evidence.json)

### 用量审计

本样本的 Palimpsest T2 有明显的诊断开销。它使用了每会话 64 笔额度中的 57 笔，两组均由模型自然结束。按相同阶段比较，P T2 为 F T2 的 3.43 倍总 tokens 和 3.46 倍容器耗时。P T1 用量低于 F T1，累计差额因此由 T2 拉开。两组均在两会话内完成本次观察，累计缓存读取占输入都约 96.9%。累计请求多 10 笔，fresh input 多 45,773，cache read 多 1,404,032，output 多 4,800。账本记录的是用量分项，货币金额以 Provider 实际账单为准。

| P T2 Principal 分段 | 请求 | 工具调用 | fresh input | cache read | output | 总 tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 准备和委派 | 9 | 27 | 21,706 | 189,056 | 3,048 | 213,810 |
| 委派回复到切换原生子任务 | 26 | 39 | 32,635 | 1,314,816 | 8,802 | 1,356,253 |
| 原生执行期间的等待与复核 | 6 | 9 | 5,698 | 461,056 | 4,360 | 471,114 |
| 接管结算和结束 | 3 | 5 | 6,556 | 256,512 | 3,309 | 266,377 |

委派结果 110 到原生 fork 调用 359 相隔 220.798 秒。最大几份工具回显包括状态库查询 16,268 字节、完整 Pulse 12,022 字节，以及三次运行时源码读取各约 10–11 KB。它们出现在真实修改开始前，随后参与多次上下文重发。该段总量相当于两组 T2 总量差额的 70.2%，这是按已观测分段计数，无法据此计算删掉该段后的反事实用量。P 原生子任务的 418,016 tokens 与 F 的 338,148 tokens 相差 79,868，主要差额出在 Principal 对缺少具体原因的 `FINISHED / NOT_READY` 做排查。宿主回执中的写范围错误已明确，模型可见的作业状态只给出了通用结算状态。[分段、调用锚点和回显字节](../../research-evidence/pnwf-software/2026-11-10/live-pair-150630/usage-audit.json)

发布前从六条原始 DSH stream 重跑归因，并与归档的请求 ID、四类终态用量和 232 对调用与结果核对。再从四个 Git bundle 取回原提交，重现两个 T1 的冻结拒绝、两个 T2 的越界拒绝及四组独立 HTTP/2 帧和公开测试结果。三个宿主驱动版本的 SHA-256 已记录。将发布版 `live.mjs` 复制到临时目录，依次使用 `git -c core.autocrlf=false apply --unidiff-zero` 应用 `driver-to-p-recount.patch` 和 `driver-to-t1.patch`，可恢复两次早期执行的驱动字节。此次核验使用离线工具。

## T2 写范围与拒绝回传复跑

复跑从主线 `52451a07` 上的上一轮发布接续。P 和 F 的确切 T2 基线分别为 `fbeb8958f4405688b13f37dbdec330157a660ab0` 与 `df4271d9a43c963ed386dc4de103dcfcf30f02f7`。宿主从上一轮证据重建只含基线祖先的 Git 副本，并检查此前的越界候选对象不可读。P 从上次 T1 的已退出产品状态重新接纳同一个 T2 SHA。每个会话仍使用独立 cohort、全新 DSH home 和原 `paid-usage-only` 窗口。

两组得到同一条范围说明。允许修改 `service/grpc_server.js`、`test/integration.test.js`、`MIGRATION.md` 和可选的 `test/server.test.js`。proto、wire codec、客户端和 REST 测试的 blob 连注释一起保留。Palimpsest 在登记计划和派发前核验声明。Worker、Principal 完成和接管使用同一实际候选校验，结算再次核对被校验的完整 SHA。作业查询返回实际结算原因和宿主细节。

零付费资格的六个会话均通过。Palimpsest Mock T2 先收到越界拒绝，再用正确范围完成正式委派。另补测了已存在的宽授权、仅改 proto 注释的接管、校验后 HEAD 移动，以及真实 Work 作业失败原因通过 `workers` 返回。架构、公共 API、两个软件策略测试和 26 项定向产品回归通过。

### Palimpsest 真实 T2

Principal 在计划中声明了正确的四个路径，`delegate`（96、97）启动正式 Worker。Worker 使用 11 笔请求，提交 `35f2fb69557e1965ef1e88f723fb600b9e9f0ae3`，只改四个允许文件。独立新规则探针 7/7，公开测试 18/18，正式门禁 PASS，受保护 blob 全部与基线相同。冻结评分器仍保留首版请求消息名的原始判定，业务通过来自已获授权的同义消息复核。Principal 29 笔请求，记录 `WAIT_FOR_OPERATOR`（229、230）后自然退出。

本轮没有委派失败后切换原生子任务的排查窗口。委派回复 97 到 `workers` 结果 192 确认正式结算之间经过 82.998 秒，Principal 发出 13 笔请求，使用 471,591 tokens。这段有一次 `job_output` 查询未知 Work 作业的错误，另有状态和目录检查以及显式 shell 等待。该段保留为正式 Worker 等待与复核开销。上一轮失败排查窗口为 26 笔、1,356,253 tokens、220.798 秒。

### 强原生真实 T2

模型通过原生子任务（104、106）在独立 worktree 提交 `5346a2f606b85962b8a12e8cca706ad8efe658b5`。Principal 查看差异、计算四份保护文件摘要并复跑测试。随后它删除干净的临时 worktree，再把主工作区切换到候选分支（212、215），以便重复验证和展示候选。原 `master` 仍指向 `df4271d9a43c963ed386dc4de103dcfcf30f02f7`。原运行保留 `T2_CHANGED_CANONICAL_WORLD_BEFORE_APPROVAL`，会话自然退出并完成对账。Principal 和子任务分别用了 24 笔和 16 笔。

宿主从原候选 Git 对象离线核验，四个允许文件是全部差异，proto、codec、客户端及 REST 测试逐字节相同。独立新规则探针 7/7，公开测试 18/18。该复核把产物是否通过与原工作区切换分开记录。

### 同基线用量变化

| T2 | 请求 | fresh input | cache read | output | 总 tokens | 容器秒数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P 原运行 | 57 | 89,764 | 2,606,464 | 29,342 | 2,725,570 | 431.360 |
| P 本轮 | 40 | 61,317 | 1,175,296 | 13,089 | 1,249,702 | 202.826 |
| F 原运行 | 34 | 42,136 | 735,488 | 16,172 | 793,796 | 124.626 |
| F 本轮 | 40 | 45,882 | 999,424 | 21,212 | 1,066,518 | 152.391 |

P 少 17 笔、1,475,868 tokens（54.1%）及 228.534 秒（53.0%），正式 Worker 路径替代了上一轮的拒绝排查与原生接管。F 多 6 笔、272,722 tokens 和 27.765 秒，轨迹增加了保护文件摘要对照、等待和切换检出后的再次测试。两组合计少 11 笔和 1,203,146 tokens，两次 T2 复跑均无未决用量。范围提示在两组同时加强，Work 校验与回传只影响 P；每组一次复跑支持这条具体轨迹的对照。

### 核准与 T3

所有者分别批准了两个完整候选 SHA。P 使用原有 Promotion 从候选晋升到 `7deda735afa4ef97e71dd14b5ab4b48131e1e872`。F 在原 `master` SHA 的新副本中按核准候选快进，接受 HEAD 为 `5346a2f606b85962b8a12e8cca706ad8efe658b5`，原 T2 守卫失败及原始结果摘要保留。两组 T3 均从实际接受 HEAD 的全新会话启动。候选就绪到宿主执行接受的间隔为 P 794.741 秒、F 747.411 秒，含等待授权与串行排程，单列于模型耗时之外。

| T3 | 评审提交 | 请求 | fresh input | cache read | output | 总 tokens | 容器秒数 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | `f4b523902ceb55ca27426c4bb1b24e5b5f5d7fa7` | 14 | 21,998 | 352,768 | 9,656 | 384,422 | 120.472 |
| 强原生 DSH | `720b1756931abbec6418a4019d048cb2e0ba6b31` | 12 | 20,132 | 261,760 | 10,496 | 292,388 | 87.238 |

两组都只提交 `MIGRATION-REVIEW.md`，提交均是接受 HEAD 的直接子提交，公开测试的 18/18 可从各自工具结果复算。P 记录 `DELIVER`，回执把工件绑定到评审提交及其实际 blob 摘要。两组都自然退出。冻结评分均在 `SOFTWARE_REVIEW_MISSING zero or omitted` 停下。P 写的是 “an omitted limit and an explicitly zero limit”，F 用表头 “Zero or omitted”。两份原稿均明确引用接受 SHA 和更正文件，说明旧空流、新的前三条及顺序、正数限制、字段号和 REST 保留。F 明写 `GetReading` 为 unary，P 只写该调用保持原状。两份均未明确重述每条 Reading 一帧。原评分保持失败，离线审计逐项区分措辞和原稿未明确覆盖的边界。[T3 原稿与逐项审计](../../research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/t3-offline-audit.json)

本轮四个真实会话合计 106 笔已结算请求、2,993,030 tokens，归因复算匹配 186 对工具调用与结果。两份 T3 原稿、T2 和 T3 的四个 Git bundle、零付费资格及实际账本配对均已归档。[复跑封存与机器证据](../../research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/evidence.json)

## 结算引导修复后的真实 gRPC T3

2026-11-10 从主线 `a0daba3c` 启动一条全新普通 DSH T3。宿主复制停写的已接受 Git 和产品状态，核对 Promotion、原候选 `be05447e061a23157ed04e3ee4b27ec7f571e94e` 与接受 HEAD `4639ae44d78e7c1f9f5269876fa333a99bff770f`，两者树均为 `99c40069ae834cf71618e2a142010f10bef0df06`。容器内挂入只读接受记录。与上一轮普通 DSH T3 使用相同提示词、镜像和冻结评分器，继续使用 `deepseek-flash`、DSH `0.2.1-rc.5` 与 `paid-usage-only`。独立 cohort 的窗口为 64 笔、30 分钟、单请求 240 秒，金额与总 token 均无上限。 [冻结合同](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/contract.json) · [接受记录](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/acceptance.json)

| 调用 → 结果 | 轨迹核对 |
| --- | --- |
| 26 → 28 | 读取 `acceptance.json`，结果含完整接受 HEAD 和候选 SHA |
| 63 → 66 | 在接受 HEAD 运行公开测试，18/18 通过 |
| 109 → 112 | 只提交 `MIGRATION-REVIEW.md`，提交 `12fbb83cb79a0f42fef8c007a30a8dec9ac747cd` 的唯一父提交为接受 HEAD |
| 117 → 120 | 提交后再跑公开测试，18/18 通过，差异仍只有评审文档 |
| 125 → 126 | `conclude DELIVER` 返回 `RECORDED` 与 `session.mayEnd=true`，会话自然退出，退出码为 0 |

T3 没有创建新 Attempt 或 Promotion。Episode 基线仍是接受 HEAD，交付回执指向实际评审提交，工件 blob 为 `69ad8a99db056030c92a007bbc01e79c89fc3929`，SHA-256 与封存原稿一致。 [轨迹与 Git 核验](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/trajectory-and-review-audit.json) · [原稿](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/MIGRATION-REVIEW.md) · [Git bundle](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/accepted-and-review.bundle)

**冻结原判仍为 `SOFTWARE_REVIEW_MISSING zero or omitted`。** 原稿写明省略或显式零值旧时返回空流、新版按源顺序返回最多前三条，正数限制、REST、协议字段号、错误边界保持一致。它明确写出了 `GetReading` 为 unary，比上轮普通 DSH 的原稿更明确。两份原稿都没有明确写出 `StreamReadings` 每条 Reading 单独一帧。本轮两次公开测试均覆盖该项并通过，测试事实和原稿内容分别记录。冻结判分对两份原稿停在同一短语，离线复核记录各项文字和行为证据，保留两轮原判。 [冻结结果](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/result.json) · [上轮原稿与审计](../../research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/t3-offline-audit.json)

| T3 | 请求 | Fresh input | Cache read | Output | 总 tokens | 容器秒数 | 配对调用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 上轮普通 DSH | 14 | 21,998 | 352,768 | 9,656 | 384,422 | 120.472 | 27/27 |
| 本轮普通 DSH | 13 | 20,998 | 332,160 | 8,691 | 361,849 | 113.753 | 22/22 |
| 上轮强原生 DSH | 12 | 20,132 | 261,760 | 10,496 | 292,388 | 87.238 | 见上轮封存 |

本轮比上轮普通 DSH 少 1 笔请求、22,573 tokens 和 6.719 秒。两条普通 DSH 的 cache creation 均为 0，缓存读取占输入约 94%。本轮 Bash 从 17 次降至 12 次，文件读取从 5 次增至 7 次，省去了两次 glob。两条均读取接受凭据、直接提交、记录交付并自然退出。新旧普通 DSH 共 27 笔已按 Provider 响应 ID 与终态账本核对，本轮无未决用量、工具错误、领域拒绝或失败作业。两个样本各自读取不同的接受树，强原生行作为上轮参照。 [逐请求账本与对照](../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/trajectory-and-review-audit.json)

复现入口为 `scripts/pnwf/revision/review-t3.mjs`，需传入新运行目录、已停写的 T2 接受目录及上轮普通 DSH T3 目录。本次原始 DSH 流和 SQLite 保存在 `%TEMP%/pnwf-grpc-readiness-t3-20261110144632`。
