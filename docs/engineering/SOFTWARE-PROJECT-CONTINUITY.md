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
