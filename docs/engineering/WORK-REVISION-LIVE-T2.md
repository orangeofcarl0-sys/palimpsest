# gRPC 与 Energy 的共用 Work 修订义务真实复跑

2026-11-10 从主线 `7f849be7058cb75992ba06fa226a0ff708b25111` 各运行一条普通 DSH T2。两条都由正式 Worker 产出已结算候选，文件义务和门禁均通过。Energy 记录了 `WAIT_FOR_OPERATOR`。gRPC 到达 `VERIFYING` 并告知用户待审，未写本轮等待结论。两条都自然退出，所有者随后分别核准完整候选 SHA，两份接受版本落在各自隔离副本。 [调用与逐请求对账](../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/trajectory-comparison.json)

## 执行合同和验收

- 各从原 T2 基线重放 T1 已停写的产品状态和原基线核准。沿用历史 T2 的业务提示，追加正式 Work 任务 ID 以绑定宿主签发的文件义务。Energy 旧提示已经明确 Work、等待和结论顺序。gRPC 追加的正式任务登记也明确了协作入口。模型没有收到要求 Principal 展开回执的额外提示，Worker 仍收到产品默认的预检工具引导。
- DSH `0.2.1-rc.5`、`deepseek-flash`、原容器镜像和 `paid-usage-only`。每条独立 cohort、全新 DSH home、最多 64 笔、30 分钟、单请求 240 秒，金额和总 token 上限均为空。Principal 与 Worker 归同一账本。先跑 gRPC，终态用量确认后启动 Energy。
- 按工具调用 ID 配对结果，分别统计领域拒绝、工具错误和失败作业。按 Provider 响应 ID 将每条轨迹请求绑定到终态账本，核对角色与四项 token。新旧四条的 160 笔请求全部绑定。新两条为 90 笔、118/118 对，未确认用量为 0。

| 场景 | 原基线 | 核准候选 | 晋升 HEAD |
| --- | --- | --- | --- |
| gRPC | `fbeb8958f4405688b13f37dbdec330157a660ab0` | `134f65dbf895e8dd5d3e19ea6316fde9db15e7e2` | `c950736d7d2005011c2d4bd071d8d5e6e2143118` |
| Energy | `8041871314136d417b285a800265858757463f68` | `de0b02e1ed08c649384056d3a3c2306cc961203a` | `bfe377abf16649f977cafa49a7494a820f38dd60` |

| 验收事实 | gRPC | Energy |
| --- | --- | --- |
| 工件存在、文件义务 | 4 个允许文件均更新，15 项回执检查通过，4 个保护 blob 及模式原样保留 | 5 个受影响成果均更新，16 项回执检查通过，证书 blob 及模式原样保留 |
| 业务正确 | 按既有消息别名复核，HTTP/2 7/7、公开测试 18/18 | 独立检查 45/45，两站均为 K-900、USD 536,000、Harbor Flats 交期 14 周 |
| 提交持久、正式结算 | Attempt 的结果 SHA、Worker 导入和 `SETTLED` 回执一致，门禁 PASS | 同一链路，门禁 PASS |
| 本轮等待、退出 | 自然退出，口头说明待审批，缺 `WAIT_FOR_OPERATOR` | `WAIT_FOR_OPERATOR` 持久记录后自然退出 |
| 核准和接受 | 所有者保留会话缺项，核准该 SHA 后离线晋升 | 所有者核准该 SHA 后离线晋升 |

gRPC 冻结判分器仍返回 `SOFTWARE_PROTO_RPC_CONTRACT`。准入基线本身包含已获核准的请求消息别名，候选的 proto blob 与基线一致。首次宿主别名复核因 `recount/scorer` 缺少父目录中断。原结果完整保留，修好输出目录后在独立位置对同一 SHA 完成既有别名复核，新增模型请求为 0。原会话仍记为缺等待结论，历史评分、核准和轨迹没有重写。两份晋升均由宿主在停写后的副本执行，候选树和晋升树相同。 [gRPC 原结果](../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/grpc/result.json) · [离线复核](../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/grpc/review-result.json) · [Energy 结果](../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/result.json)

## 委派、回执与拒绝恢复

### gRPC

Principal 在第 6 笔请求选择 Work 委派，旧同基线对照在第 9 笔委派。四个允许路径一次登记成功，未出现范围拒绝或接管。Worker 用 14 笔请求读原实现、修改 Server 和两份测试、更新迁移说明，并运行测试。提交后按产品提示调用 `palimpsest_worker_receipt`（125→126，3,167 字节，全部通过），然后报告 `READY_FOR_SETTLEMENT`（131）。宿主独立预检与正式结算回执一致。

Principal 把 Work job ID 传给原生 `job_output`（69→70），返回未知作业。它改用 `work workers`，并穿插查目录、Git 和等待命令。第三次 `workers`（193→194）看到 `FINISHED / SETTLED` 和 1,658 字节响应中的回执摘要。随后查 `results`、查看候选提交并独立跑 18 项测试。它未调用 `work receipt`，未按文件展开回执。

结算后调用 `readiness`（213→214）时，任务仍为 `ACTIVE`，Attempt 已 `COMPLETED`。返回 `CONTINUE_WORK` 和 `resultCommitted: false`，尽管同一候选已在 Work 回执中结算。接着 `complete`（221→222）因没有运行中的 Attempt 返回 `NO_RUNNING_ATTEMPT`。模型随后用 `next`（227→228）推进 `TASK_VERIFYING`，看到 `WAIT_OPERATOR_ACCEPT`，在最终回复中正确说明待审，但未调用 `conclude`。旧对照也曾看到 `CONTINUE_WORK` 并成功推进 `VERIFYING`，随后记录了等待结论。这一对观测定位了已结算到待审之间的提示分歧，无法单独归因本次省略结论。新轨迹 70/70 对调用，1 次工具错误、1 次领域拒绝、0 次失败作业和 0 次 Worker 宿主失败。

### Energy

Principal 同样一次登记成功，委派一名正式 Worker。Worker 首次尝试写 `cost-model.json`（55→56），原生编辑工具要求先读取。它随后读五个文件，重试写入成功，检查并提交五个受影响成果。Worker 查看 `PREVIEW`（143→144，3,500 字节，全部通过），再检查 Git 和 `node check.mjs --final`，然后报告完成（157）。证书保持原样，宿主预检与持久结算回执一致。

Principal 也把 Work ID 传给原生 `job_output`（85→86），遇到未知作业后回到 `workers`，穿插了三次 Bash 等待。第五次 `workers`（141→142）显示正式结算摘要，响应为 1,661 字节。它随后用 `run`（147）推进到 `VERIFYING`，用 Git 和公开检查复查内容，记录 `WAIT_FOR_OPERATOR`（177→178）后自然退出。Principal 未调用 `work receipt` 或按文件展开。新轨迹 48/48 对调用，2 次工具错误、0 次领域拒绝、0 次失败作业和 0 次 Worker 宿主失败。

两组 Worker 都使用了提交绑定的预检，Principal 都收到了同一回执 ID 的结算摘要，但仍额外用 Git 或测试核对候选。计划和候选均符合宿主义务，本次没有触发文件义务拒绝，也没有真实接管，相关反例仍由零付费资格覆盖。两条旧对照和两条新运行均出现原生 `job_output` 查询 Work 作业失败。旧 gRPC Worker 另有 2 次编辑工具错误，旧 Energy Worker 无工具错误。四条同基线对照均未发生 Worker 宿主失败或 Bash 作业失败。

## 请求、用量和耗时

| 场景 | 请求 P / Worker | Fresh input | Cache read | Cache creation | Output | 总 tokens | 容器会话秒数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gRPC 旧范围修复 | 40（29 / 11） | 61,317 | 1,175,296 | 0 | 13,089 | 1,249,702 | 202.826 |
| gRPC 共用义务 | 44（30 / 14） | 65,790 | 1,282,816 | 0 | 16,205 | 1,364,811 | 212.731 |
| Energy 旧等待式 | 30（18 / 12） | 52,093 | 691,584 | 0 | 18,011 | 761,688 | 231.001 |
| Energy 共用义务 | 46（25 / 21） | 47,335 | 1,054,080 | 0 | 16,143 | 1,117,558 | 230.754 |

- **gRPC 增 4 笔、115,109 tokens、9.905 秒。** Fresh input 增 4,473，其中 Worker 增 4,275。Worker 多 3 笔，使用了更多定向读取及提交后的回执步骤，运输含验证和导入从 66.876 秒增至 83.282 秒。Principal 虽提早三笔委派，委派至首次看到结算之间却由 13 笔增至 18 笔，看到结算后由 7 笔减至 6 笔。Cache read 占输入从 95.04% 到 95.12%。更早的越界接管样本用了 57 笔和 2,725,570 tokens，它衡量的还包括正式 Worker 启动失败后的长排查。
- **Energy 增 16 笔、355,870 tokens，耗时少 0.247 秒。** Principal 多 7 笔，全部出现在委派后至首次观察到结算之间，该段从 3 笔到 10 笔，其他两段仍为 9 和 6 笔。Worker 多 9 笔，运输含验证和导入却从 121.967 秒降到 114.482 秒。Principal fresh input 减 5,555，Worker 增 797，合计减 4,758。Cache read 增 362,496，读取占输入从 93.00% 到 95.70%。因此总量增加主要来自更多请求重复读取已缓存上下文。早期专用回执样本为 28 笔、690,357 tokens，另有不同的回读引导，不能直接归为共用契约的成本。

两条新会话共 **2,482,369 tokens**，其中 fresh input 113,125、cache read 2,336,896、output 32,348。容器会话耗时包含启动、工具执行和清理。离线判分、人工核准及晋升在会话窗口之外。从候选送审就绪到晋升记录分别为 163.736 秒和 117.075 秒，包含人工等待和宿主晋升。本轮每个领域只有一个新样本，提示、生成、上下文与等待行为均有差异，观测可核对到具体步骤，无法隔离回执功能的净计费影响。 [gRPC 旧同基线对照](SOFTWARE-PROJECT-CONTINUITY.md#t2-写范围与拒绝回传复跑) · [Energy 旧等待与回执对照](ENERGY-PROJECT-CONTINUITY.md#t2-上下文干预的独立对照)

## 复算

`scripts/pnwf/revision/live.mjs` 负责准备、单次付费运行、离线复核和按 SHA 接受。 `scripts/pnwf/revision/analyze.mjs` 读取新的试验目录和两条旧对照 T2 的原运行目录，复用调用 ID 配对结果，再逐笔绑定 Provider 响应 ID。归档中的账本、候选回执和两份 Git bundle 可独立核对候选和接受 SHA。原始压缩 DSH 流及 SQLite 位于本地停写运行目录 `%TEMP%/pnwf-work-revision-real-20261110122113`。本轮到 T2 核准接受为止。 [证据目录](../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113)
