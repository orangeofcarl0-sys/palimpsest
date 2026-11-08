# PNWF-CQ 按量记账续作

2026-11-08 分别执行一条 software 和 energy 续作。Owner 于 2026-11-07 授权启动付费模型调用，随后允许不设计费上限，并指定 energy 沿用 software 的记账和终止条件。两次都使用 `paid-usage-only`，金额和 token 总量上限均为 `null`。software 的开发基线是 `4d5d9704e902d33b1380bf5a1df85dc39541935b`。energy 从合入归因修复后的主线 `fdd5308bf45e699058ecae86fcfb573e250e4e69` 运行。两者的产品源码、Host 源码、依赖清单和锁文件一致，实际容器的镜像和八个 adapter 文件摘要一致。

两个独立 cohort 各自复制 PSVR-C A-2 的 Git 与 SQLite 状态，并使用各自的原始续作 prompt。会话最多 64 个请求、30 分钟，单请求等待终态最多 240 秒。两次均从旧任务 ACTIVE、原 Attempt RUNNING、episode conclusion 和 promotion 计数为零的状态开始。机械观察量包括请求结算、会话退出、Work 调用、episode conclusion、任务状态、promotion 与 HEAD。每个任务域各观察一条轨迹。

## 执行合同

Runner 校验新 cohort、准备的 World、会话时长与独立账本。实际 adapter 在首次请求前测量 `network=none`、uid、挂载、凭证环境、canary 与复制后 Git World。容器通过 stdio 桥发送消息，宿主固定转发到 DeepSeek Messages 的 `deepseek-flash`。宿主从 `DEEPSEEK_API_KEY` 或 DSH 凭证文件取 key。服务端工具在转发前拒绝。

SQLite 在每次转发前写入请求摘要和 `PENDING` 行。完整 `message_stop` 与最终 `message_delta.usage` 结算 fresh input、cache read、cache creation 和 output。异常中止将请求记为 `UNKNOWN` 并关闭准入，未结算总量用 `null` 表示。DeepSeek 的兼容路径在某些请求上可能扩展 `max_tokens`，流式记账以终态 usage 为准。[DeepSeek Anthropic API 文档](https://api-docs.deepseek.com/guides/anthropic_api/)

硬预算模式仍使用 R1 的 Mock 上界合同。真实 Provider 的硬上界资格保留 `PROVIDER_BOUND_UNQUALIFIED`。旧 5M cohort 的 5,190,778 tokens 和 INVALID 裁定归属 2026-11-07 的历史运行。

## 复现

使用已构建的仓库、可用的 Docker Linux engine、合格镜像与保留的 PSVR-C A-2 源状态。每次运行使用新目录及 cohort ID。带 `--execute` 的 `run_pnwf_live` 调用使用真实付费 Provider。

```powershell
node --test scripts/pnwf/qualification.test.mjs scripts/psvr/session_attribution.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fault tests failed' }
$stage = 'software' # 或 'energy'
$trialId = 'pnwf-paid-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
node scripts/pnwf/qualify_execution.mjs "--out=.aps-tmp/$trialId-qualification"
if ($LASTEXITCODE -ne 0) { throw 'Container qualification failed' }

$trial = Join-Path (Get-Location) ".aps-tmp/$trialId"
node scripts/pnwf/prepare_continuation.mjs --mode=paid-usage-only "--session=$stage" `
  "--cohort-id=$trialId" "--run=$trial" --max-requests=64 --wall-clock-ms=1800000
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed' }
$env:ALHS_CORE_RUN = $trial
$env:PNWF_BUDGET_DB = Join-Path $trial 'request-usage.sqlite'
$cohort = Join-Path $trial 'cohort.json'
$adapter = Join-Path (Get-Location) 'scripts/pnwf/container_adapter.mjs'
$gate = Join-Path $trial 'out/gate'
node scripts/pnwf/score_continuation.mjs "--run=$trial" "--cohort=$cohort" "--out=$trial/out/baseline.json"
if ($LASTEXITCODE -ne 0) { throw 'Baseline observation failed' }
node scripts/pnwf/run_pnwf_live.mjs --mode=paid-usage-only "--session=$stage" `
  "--cohort=$cohort" "--adapter=$adapter" "--out=$gate" --execute
node scripts/pnwf/score_continuation.mjs "--run=$trial" "--cohort=$cohort"
```

计费观察以 `out/<stage>/request-accounting.json` 的终态 usage 为源。`out/<stage>/qualification.json` 记录实际容器，`out/score.json` 汇总模型轨迹和产品事实。

## 2026-11-08 软件样本

起点为 `grpc-contract` ACTIVE、原 Attempt RUNNING，canonical HEAD 为 `453aa7f005edb7612cf4edc1d8ec3b68efed5b4d`。

会话从 00:47:50 到 00:52:41（北京时间），历时 4 分 51 秒，自然退出码为 0。DeepSeek 完成 27 个请求，全部结算。请求账本和 DSH 轨迹的 27 组终态用量逐请求一致。

| 用量 | Tokens |
|---|---:|
| Fresh input | 33,921 |
| Cache read | 934,912 |
| Cache creation | 0 |
| Output | 14,024 |
| **合计** | **982,857** |

产品记录了 `DELIVER` 结论（journal seq 4）及一次计划修订。三个原任务转为 STALE，原 Attempt 转为 CANCELLED。`complete` 调用为 0，`conclude` 调用为 1，promotion 为 0，canonical HEAD 保持 `453aa7f005edb7612cf4edc1d8ec3b68efed5b4d`。软件样本满足原机械主判据（1/1）。历史 A-2 收尾记录为 1,331,902 tokens，本次为 982,857 tokens。这里比较的是各一条轨迹的实测用量。

本地 build、架构和公共 API 检查通过，24 项请求故障测试通过，六个零付费容器场景通过。六个获资格的 Mock 容器和实际付费容器的镜像及 adapter 文件摘要一致，实际付费容器通过 16 项隔离检查，读取了 1 个复制后的 Attempt World。[机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/software.json)

运行前 Docker Desktop 因陈旧的 Unix socket 启动失败。排查依据为本机 backend 日志，退出失败的启动实例后备份了只包含零字节 socket 的运行时目录，随后使用原有资格镜像完成验证。原始运行数据留在 `.aps-tmp/pnwf-paid-2026-11-08-software`，机器证据保存请求计量、产品事实与原始文件摘要。

## 轨迹归因重算

DSH v4 把结果的调用 ID 存在 `message.toolCallId` 中。重算按 ID 配对了 31/31 个结果，同时支持旧格式的外层 `toolCallId`。两处 ID 冲突时保留未配对状态。原始机器证据中的 8 个文件摘要已核实，重算使用独立输出目录。[重算证据](../../research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json)

| 指标 | 原统计 | 重算 |
|---|---:|---:|
| 已配对结果 | 0/31 | 31/31 |
| 结果层错误 `toolErrors` | 0 | 0 |
| 领域拒绝 | 2 | 2 |
| 同因重复拒绝 | 1 | 0 |
| 失败作业 `jobFailures` | 未计 | 1 |
| 无进展调用 | 2 | 3 |

首次 `takeover`（调用 seq 147、结果 148）为 `UNCOMMITTED_WORK`。第二次（调用 seq 169、结果 170）发生在清理 CRLF 差异后，为 `NO_SETTLEABLE_DELTA`。两次都返回 `NOT_READY`，原因不同。重复计数比较工具动作、目标、路由和拒绝原因。

探针由 Bash 调用 seq 117 发起，结果 seq 119 记录 `ERR_STREAM_WRITE_AFTER_END` 和转入后台的通知。随后同一作业在 seq 127 被终止。失败归到原 Bash 调用，后续 `job_kill` 仍是成功的清理动作。无进展计数按调用去重。作业失败与结果层错误各有计数。

原始流离线重算仍为自然退出、982,857 tokens、`DELIVER`、promotion 0 和主判据 1/1。4 项归因回归覆盖了新旧格式配对、原因区分、异常后终止和重复计数，原有 24 项请求测试也通过。可对已存在的试验目录执行以下命令。

```powershell
$trial = Join-Path (Get-Location) '.aps-tmp/pnwf-paid-2026-11-08-software'
$recount = Join-Path $trial 'out/attribution-recount'
node scripts/pnwf/score_continuation.mjs "--run=$trial" "--cohort=$(Join-Path $trial 'cohort.json')" `
  "--out=$(Join-Path $recount 'score.json')" "--attribution-dir=$(Join-Path $recount 'timeline')"
```

## 2026-11-08 Energy 样本

本地运行从 11:16:54.486 到 11:19:31.538（北京时间），历时 157.052 秒，退出码为 0。DSH 的单轮轨迹占 126.927 秒。29 个 DeepSeek 请求全部结算，账本与轨迹的四类终态用量逐请求相符，合计 987,987 tokens。实际运行容器在首个模型请求前通过 16 项隔离检查和 1 个复制后 Attempt World 预检，网络为 `none`。本轮重新通过 24 项请求测试、4 项归因测试及本地构建。六个零付费容器场景沿用 software 的同镜像、同 adapter 资格记录。[Energy 机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

起点为 `decision-package` ACTIVE、原 Attempt RUNNING，canonical HEAD 为 `e631160f03d40709a9f9b67746ecd8e7708c2f81`。结论记录在 journal seq 4。原 Attempt 转为 CANCELLED，原任务转为 STALE，项目修订为 1，`complete` 和 `finalize` 调用各为 0，`conclude` 调用为 1，promotion 为 0。canonical HEAD 保持在起始提交，工作树干净，机械主判据 1/1。该状态的历史 A-2 收尾记录为 1,901,695 tokens。[Energy 机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

### 可见行动与结果

以下秒数从 DSH 轮次开始计，`seq` 为原始事件序号。归因只使用可见调用、结果、作业和产品事件。

| DSH 时间 | 事件 | 观测 |
|---:|---|---|
| 2.6–22.6 秒 | `pulse`、Git、两次 `check.mjs`、源材料与六份交付件、日期重算（seq 15–102） | canonical 的默认和最终检查分别通过 40、46 项断言。模型交叉核对 −18 °C 设计低温、1,050 mm 实测通道、供应商证书与有效报价，复核两站 K-900 和设备加运费 536,000 美元的样本结论。14 周从 2026-11-05 推到 2027-02-11，安装和调试分别按假设推到 02-25 和 03-04。 |
| 29.0–49.6 秒 | `status`、复制 World 的最终检查、`workers`、差异核验和清理（seq 107–158） | 复制 World 同样通过 46 项断言。预检报 17 个修改路径，World 的 basis 与 HEAD 相同。模型用 `--ignore-cr-at-eol` 核对后只还原复制 World 的这批已跟踪文件。离线将源 World 的 17 个文件逐字节与 Git blob 对比，确认差异均为 CRLF。`workers` 在本次 Host 中观察到 0 个作业，旧执行者退出仍是未观测事实。 |
| 51.316 秒 | `relay takeover`（163 → 164） | `NOT_READY / NO_SETTLEABLE_DELTA`。清理后 World 无可结算增量，`resultCommit=null`。 |
| 75.675 秒 | `plan(tasks:[], changeClass: metadata_only)`（175 → 176） | `quiescence_required`。尝试移除仍处于 ACTIVE 的任务时，其 RUNNING Attempt 仍未关闭。该响应标记为结果层错误。 |
| 78.992–80.339 秒 | `relay successor`（181 → 182），重试 `plan`（187 → 188） | `SUCCESSOR_READY` 将 Attempt 关闭并把任务变为 READY。随后空任务图获准，SQLite 依次记录 `ATTEMPT_CANCELLED`、`TASK_READY`、`TASK_STALE` 和 `PROJECT_REVISED`（event 10–13）。两次 `plan` 都提供了 `changeClass`，实际修订一次。 |
| 93.443–126.927 秒 | `readiness`（193 → 194）、提交与源材料核对、验证 journal（233 → 234）、`conclude`（239 → 240）、退出（246） | `readiness` 报无可处理任务并返回 `CONTINUE_WORK`。模型核对了提交中的六个交付件及未改动的输入，记录引用说明。`conclude DELIVER` 验证六件均已跟踪且提交于原 HEAD，返回 `RECORDED`、`mayEnd=true`。交付明确保留支出审批。 |

原始流、逐请求用量、评分和本机归因文件摘要见机器证据。完整 trajectory 保留在 `.aps-tmp/pnwf-paid-2026-11-08-energy`。离线复核时可将前一节的 `$trial` 指向该目录，并继续把 `--out` 与 `--attribution-dir` 指向独立重算目录。

## Software 与 energy 对比

| 归因或结果 | Software | Energy |
|---|---:|---:|
| 请求 / DSH 轮次 | 27 / 1 | 29 / 1 |
| 调用结果配对 | 31/31 | 43/43 |
| 产品调用 | 13 | 14 |
| Bash / 原生 `read` / `job_kill` | 17 / 0 / 1 | 16 / 13 / 0 |
| 领域拒绝 / 同因重复 | 2 / 0 | 1 / 0 |
| 结果层错误 / 失败作业 | 0 / 1 | 1 / 0 |
| 无进展调用 | 3 | 2 |
| `plan` 尝试 / 实际修订 | 1 / 1 | 2 / 1 |
| 旧任务转 STALE / 旧 Attempt 转 CANCELLED | 3 / 1 | 1 / 1 |
| `DELIVER` 检查的已提交文件 | 8 | 6 |
| DSH 轮次 / 外层运行（秒） | 260.505 / 291.006 | 126.927 / 157.052 |

**验收方式。** 两条轨迹都先用 `pulse` 接收 Host 给出的项目和执行状态，再独立检查 canonical 及复制的 Attempt World。software 用 `node --test` 验证 gRPC 迁移，canonical 与 Attempt 均通过 26 项测试，修订后又跑了一次 canonical 测试。它还构造了额外 HTTP/2 协议探针，首次在 GET 请求流已结束后写入数据，报 `ERR_STREAM_WRITE_AFTER_END` 并挂起。模型终止该作业，修正探针后验证了包括错误 Content-Type、GET、压缩标志和截断帧在内的六个边界用例。energy 则交叉读证书、报价、现场测量、设备容量、工期与风险文档，并重算日期。13 个原生 `read` 中有同一步并行发出的读取，这解释了为什么工具调用差 12 个而请求只差 2 个。

**拒绝与恢复。** Software 在第一次 `takeover`（147 → 148）才拿到 `UNCOMMITTED_WORK`，清理 15 个 CRLF 路径后第二次拿到 `NO_SETTLEABLE_DELTA`（169 → 170）。它随后成功走 `successor`（175 → 176），再一次完成空任务图修订（187 → 188）。Energy 把 CRLF 核验和清理做在首次 `takeover` 之前，直接遇到 `NO_SETTLEABLE_DELTA`。它随后先尝试改计划，被 `quiescence_required` 阻断，再换到 `successor` 后重试。两条轨迹各有两次受阻的产品调用。差异在于 software 两次都得到领域状态，energy 的第二次是结果层错误。Software 另有一次作业级失败，计入无进展调用后为 3 次。Energy 为 2 次。

**停止条件。** 两条轨迹的 `successor` 都携带 `declareExecutorAbandoned=true`，这是 principal 在无本地观察的情况下作出的声明。Software 在 `successor` 后收到可开启任务的 `TASK_STARTED` 建议，选择以已验证的 direct outcome 退役旧图。两条轨迹在修订后均收到 `readiness CONTINUE_WORK` 及无可处理任务的说明，随后各自依据已提交证据执行 `conclude DELIVER`，以 `mayEnd=true` 收尾。两次的 `complete`、`finalize`、新 Git 提交和 promotion 计数均为 0。观测支持模型能在这两份复制状态中辨认并交付既有成果，且记录了它们各自绕开错误顺序或失败探针的成本。

### 用量与时间

| 终态用量 | Software | Energy | Energy − Software |
|---|---:|---:|---:|
| 结算请求 | 27 | 29 | +2 |
| Fresh input | 33,921 | 31,412 | −2,509 |
| Cache read | 934,912 | 944,512 | +9,600 |
| Cache creation | 0 | 0 | 0 |
| Output | 14,024 | 12,063 | −1,961 |
| **Tokens 合计** | **982,857** | **987,987** | **+5,130** |

Energy 总量高 0.52%，主要来自多读的 9,600 个 cache tokens。两次缓存读取分别占总量的 95.12% 和 95.60%，平均每请求 36,402 和 34,069 tokens。两条按量记账轨迹合计 56 个结算请求、1,970,844 tokens，未结算请求均为 0。这里保留 Provider 的 token 分类，货币费用取决于各类别的账单费率。

按发起第一次 `relay` 与被接受的 `plan` 所在的模型请求切分，计数包含边界步骤发出的模型用量。前面工具结果的上下文随下一次请求计量。

| 模型步骤区间 | Software 请求 / tokens | Energy 请求 / tokens |
|---|---:|---:|
| 首次 `relay` 之前（两者均为步骤 1–16） | 16 / 425,798 | 16 / 417,338 |
| 首次 `relay` 至接受 `plan`（分别为步骤 17–23、17–21） | 7 / 341,386 | 5 / 194,709 |
| 接受 `plan` 后 | 4 / 215,673 | 8 / 375,940 |

Energy 在首次 `relay` 前已清理复制 World，接受 `plan` 后又读取 overview、journal、状态并复查源材料。Software 的失败探针也位于首次 `relay` 前，从调用到首个 Bash 结果等了 120.016 秒，作业到终止共 121.500 秒。两条 DSH 轮次相差 133.578 秒，前述等待占差值约 90%，扣除这段等待仍相差 13.562 秒。两次起始工作图、证据材料和缓存上下文各异，比较范围为这两个实测样本。[Software 重算](../../research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json) · [Energy 机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

## 退役计划后的 readiness 引导

Software 的 seq 204 与 energy 的 seq 194 都处在修订后的状态。旧任务已从计划移除并转为 STALE，原 Attempt 为 CANCELLED，已提交产物位于干净的仓库 HEAD。原 `readiness` 从无可处理任务推导出 `CONTINUE_WORK`，引导模型重新规划或开始任务。紧随其后的 `conclude DELIVER` 分别在 seq 210 和 seq 240 通过了 episode 校验。[Software 重算](../../research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json) · [Energy 机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

修复后的 `readiness` 在这个状态返回 `SEMANTIC_JUDGEMENT`，列出退役任务声明的产物与所处提交。如果模型确认产物满足当前目标，`next` 提示 `palimpsest_work action=conclude intent=DELIVER`，并携带自己的判断陈述及产物路径。产物需要存在于干净工作树和当前提交，episode 的阻塞事实取自 `conclude` 使用的 pulse。已有当前 `DELIVER` 记录时，提示用现有结论回复。真正的交付仍由 `conclude` 重新读取事实、校验并写入 journal。Operator 仍负责验收和 promotion。[实现](../../src/application/work_outcome.ts)

回归用实际 Git 和 SQLite 分别重建 software 的三项依赖任务、七个声明产物，以及 energy 的单项任务、六个声明产物。两条用例经过 `successor` 和空计划修订，在旧代码上复现 `CONTINUE_WORK`，在新代码上收到 `DELIVER` 提示并成功记录结论。另覆盖缺失产物、只有未提交产物、随后提交的 direct outcome，以及退役后仍有开放任务。这些是确定性产品回归，新增付费请求为 0。[回归用例](../../test/pnwf_product.test.ts)

离线复核还使用两份原始 Work SQLite 的备份、原 HEAD 的 Git 克隆和各自 `readiness` 前的 journal 前缀（software 至 seq 3，energy 至 seq 2）。前缀链摘要与原记录逐条相符。正常工具在两份副本上均返回 `SEMANTIC_JUDGEMENT` 和 `conclude DELIVER` 提示。随后调用 `conclude`，均返回 `RECORDED` 和 `mayEnd=true`，software 的八项与 energy 的六项 Git 产物证明均与原交付记录的提交及文件摘要一致。原始数据库的 SHA-256 在离线复核前后相符。

## Readiness 修复后的真实模型复跑

2026-11-08 从合入 PR #236 的主线 `e5312cc5d81b5ada6f4a1015f8d00f9c557beb85` 重新复制两份 PSVR-C A-2 原始状态。Software 于 13:58:22–14:01:35 运行，energy 于 14:01:36–14:04:37 运行（北京时间）。每条使用独立的 `paid-usage-only` cohort 和账本，固定 `deepseek-flash` 与 DSH `0.2.1-rc.5`，上限为 64 次请求、30 分钟会话和 240 秒单请求等待，金额与 token 总量上限均为 `null`。逐案例核对了原始 prompt 摘要、初始 Work 状态、World 的 basis/HEAD/脏路径及 29 项工具目录。原始 Work 和 journal 数据库的摘要在复跑前后相符。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

Docker 首轮 Mock 在绑定 `F:` 时停止，实际请求数为 0。随后在 `C:` 的同提交副本中按锁文件安装并构建，readiness、应用工厂和入口的构建摘要与工作区相符。镜像与八个 adapter 文件摘要和修复前相同。28 项请求和归因测试、六个零付费容器场景均通过，两条实际容器各在首个模型请求前通过 16 项检查与一项复制 World 预检。宿主绑定路径是本轮执行条件的一处差异。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

### 退役、readiness 与退出

采用新提示的观察判据是，模型在成功退役后查询 `readiness`，收到显式 `conclude DELIVER` 提示，随后在新的模型步骤中发出该调用。两条复跑的退役后查询均为 **0**，因此提示采用情况为 `NOT_EXERCISED`。两条各自在旧 Attempt 尚未关闭、以及走 `successor` 后任务已 READY 但尚未退役时查询 `readiness`，两次都得到 `CONTINUE_WORK`。退役后的可见路径一致，都是一次 Bash 验证、一次 `conclude DELIVER`、一条最终答复。两个 `conclude` 均返回 `RECORDED`、`mayEnd=true`，随后自然退出，交付回执后工具调用均为 0。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

| 轨迹 | 退役结果 | 退役后的 `readiness` | 后续可见行动 | 退出 |
|---|---:|---|---|---|
| Software 修复前 | seq 188 | seq 204 `CONTINUE_WORK` | 测试和 journal 在查询前完成，查询后直接 `conclude`（209 → 210） | seq 216 自然 |
| Software 复跑 | seq 232 | 0 次，最后一次结果在 seq 226 | `node --test` 26 项通过（237 → 240），`conclude`（245 → 246） | seq 252 自然 |
| Energy 修复前 | seq 188 | seq 194 `CONTINUE_WORK` | 查询后七次状态、证据和 journal 调用，再 `conclude`（239 → 240） | seq 246 自然 |
| Energy 复跑 | seq 238 | 0 次，最后一次结果在 seq 232 | 最终检查 46 项断言通过并核对摘要（243 → 246），`conclude`（251 → 252） | seq 258 自然 |

两个复跑都保留原 canonical HEAD，原 Attempt 转为 CANCELLED，三项 software 任务及一项 energy 任务转为 STALE，`complete`、`finalize` 与 promotion 均为 0，机械主判据为 2/2。Software 的八项产物证明与修复前相符。Energy 六项原交付证明的提交和文件摘要也相符，另把既有现场测量记录加入本次交付清单。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

### 行为与用量变化

| 指标 | Software 修复前 → 复跑 | Energy 修复前 → 复跑 |
|---|---:|---:|
| 结算请求 | 27 → 29 | 29 → 26 |
| 调用结果配对 | 31/31 → 41/41 | 43/43 → 46/46 |
| 产品调用 | 13 → 11 | 14 → 12 |
| Bash / 原生 `read` / `job_kill` | 17 / 0 / 1 → 21 / 9 / 0 | 16 / 13 / 0 → 25 / 9 / 0 |
| 领域拒绝 / 同因重复 | 2 / 0 → 1 / 0 | 1 / 0 → 2 / 1 |
| 结果层错误 / 失败作业 | 0 / 1 → 1 / 0 | 1 / 0 → 0 / 1 |
| 无进展调用 | 3 → 2 | 2 → 3 |
| DSH 轮次（秒） | 260.505 → 162.069（−98.436） | 126.927 → 150.026（+23.099） |
| 外层运行（秒） | 291.006 → 193.718（−97.288） | 157.052 → 181.012（+23.960） |
| 退役后调用 / 请求 | 4 / 4 → 2 / 3 | 9 / 8 → 2 / 3 |
| 退役到发出 `conclude`（秒） | 10.513 → 5.666 | 34.555 → 6.147 |
| 退役到 `DELIVER` 回执（秒） | 24.092 → 19.150 | 40.271 → 18.014 |
| 退役到退出（秒） | 28.450 → 22.798 | 46.588 → 24.281 |
| 退役后 tokens | 215,673 → 205,260 | 375,940 → 167,422 |

**Software。** 复跑继续以 26 项测试及自制 HTTP/2 探针验证迁移，探针一次完成。它增加了源代码、文件清单和部署状态读取，并探查容器中的 `sqlite3`。在核对并清理复制 World 的 CRLF 差异后，第一次 `relay` 因漏传 `relayRoute` 返回结果层错误（205 → 206），接着 `takeover` 返回 `NO_SETTLEABLE_DELTA`（211 → 212），`successor` 成功（217 → 218）。修复前的失败探针等待 120.016 秒。把这段等待从旧轮次扣除，旧轮次为 140.489 秒，复跑仍多 21.580 秒。复跑节约的总时长主要反映避开该等待，两条轨迹采用了不同的核验和清理顺序。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

**Energy。** 复跑在 canonical 和 Attempt World 分别通过最终检查后尝试 `successor`。前两次（113 → 114、151 → 152）都被同一组写域外修改阻止。模型核对 `--ignore-space-at-eol` 和字节摘要，中途用 `HEAD:sites.md` 漏掉 `sources/` 目录，Bash 以 128 退出（调用 197、作业 199、结果 200）。用正确路径重查后，它通过 `git add` 刷新了复制 World 中内容一致的写域外路径，暂存区无差异，剩余七个修改路径在任务写域内。第三次 `successor` 成功（221 → 222）。相比修复前，退役前增加 45.406 秒，退役后缩短 22.307 秒。`conclude` 本身的响应耗时由 5.716 秒增至 11.867 秒，模型发出交付调用的时间仍明显提前。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

| 终态用量 | Software 修复前 → 复跑 | Energy 修复前 → 复跑 |
|---|---:|---:|
| Fresh input | 33,921 → 45,587（+11,666） | 31,412 → 34,172（+2,760） |
| Cache read | 934,912 → 1,332,992（+398,080） | 944,512 → 1,018,880（+74,368） |
| Cache creation | 0 → 0 | 0 → 0 |
| Output | 14,024 → 16,222（+2,198） | 12,063 → 14,875（+2,812） |
| **Tokens 合计** | **982,857 → 1,394,801（+41.91%）** | **987,987 → 1,067,927（+8.09%）** |

两次复跑共 55 个已结算请求、2,462,728 tokens，未结算请求为 0，账本和 DSH 的四类终态用量逐请求相符。两条轨迹的总用量都增加，增量主要来自退役前的缓存读取。该阶段的 cache read 在 software 为 726,912 → 1,133,824，在 energy 为 581,632 → 857,856。Energy 的平均每请求用量从 34,069 增至 41,074 tokens，因此请求少了三次，总用量仍增加。退役后的用量按成功空计划结果之后的模型步骤归集，包含结论回执后的最终回复。这组对比每种状态只有一次复跑，且两条都绕过了退役后的 `readiness`，因此观察到的耗时和用量差属于整条轨迹。新提示的可达性仍由上一节的确定性回归和离线复核支持，真实模型采用仍待观测。[复跑证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

复跑的压缩原始轨迹、归因时间线、账本、结算快照和 Work/journal 数据库已按文件摘要归档至本地 `.aps-tmp/pnwf-paid-2026-11-08-readiness-software` 与 `.aps-tmp/pnwf-paid-2026-11-08-readiness-energy`。分析使用已有归因脚本，复跑以外新增付费请求为 0。

## 退役状态下的 Readiness 定向观察

2026-11-08 在 `5588cf9da6189dbe2b7cb121a188677b13113713` 上，从上一节两次复跑的退役状态各复制一个新 World 和 Work 数据库。Software 保留三项 STALE 任务，energy 保留一项 STALE 任务，原 Attempt 均为 CANCELLED，修订均为 1。新 journal 按原链摘要重放 seq 1–2，交付从空状态开始。两条用各自的新账本、运行目录和 DSH 会话，沿用 `paid-usage-only`、`deepseek-flash`、DSH `0.2.1-rc.5`、64 次请求、30 分钟会话和 240 秒单请求等待。金额与 token 总量上限均为 `null`。[定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

传入的人工 prompt 为 `First, call palimpsest_work with action=readiness.`。原始流 seq 8 还包含正常 Host 自动添加的 `pulse` 引导，另有 DSH 的运行时上下文。两份零付费容器检查均在下一模型请求中观察到 `SEMANTIC_JUDGEMENT` 和 `conclude DELIVER` 提示。28 项脚本测试通过，两条真实会话各自通过 16 项隔离检查和复制 World 预检。执行复用 `C:` 上的构建副本，镜像、关键构建文件及 adapter 摘要与修复后复跑一致。[Host 引导](../../host/dsh/lib/project_hint.js) · [定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

### 调用顺序与退出

两条真实轨迹的首个工具调用均为 `readiness`（seq 15 → 16）。结果在步骤 1 给出 `SEMANTIC_JUDGEMENT`，列出原 HEAD 及已提交的声明产物，并提示确认目标后调用 `conclude DELIVER`。Software 在步骤 2 查询 `pulse`。Energy 在步骤 1 的同一模型响应中也发出了 `pulse`，它属于看到 readiness 结果前的同批动作。两条各自检查产物后，在后续模型步骤调用 `conclude DELIVER`，写入 journal seq 3。两个回执都为 `RECORDED`、`mayEnd=true`，各有一条最终答复，随后自然退出。回执之后的工具调用均为 0。[定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

| 观测 | Software | Energy |
|---|---:|---:|
| `readiness` 结果，DSH 起点后 | seq 16，5.407 秒 | seq 16，5.140 秒 |
| 从提示到 `conclude` 之间的后续步骤工具调用 | 27 | 13 |
| `conclude DELIVER` 调用 → 回执 | 165 → 166，步骤 19 | 95 → 96，步骤 9 |
| 提示到 `conclude` 调用 / 回执 | 74.588 / 86.488 秒 | 32.490 / 43.164 秒 |
| 产物证明 | 7 | 6 |
| DSH 轮次 / 外层运行 | 95.292 / 125.309 秒 | 51.583 / 82.136 秒 |
| 结论回执到 DSH 轮次结束 | 3.397 秒 | 3.279 秒 |

Software 验证 gRPC 提交、26 项 `node --test`、迁移与 REST 兼容性相关源码。Python 依赖探测因 `ModuleNotFoundError` 退出（调用 101、作业 103、结果 104），归因计为 1 次失败作业。它改用本地 Node 服务和 HTTP/2 探针，取得探针结果后终止后台服务，再交付 7 项声明产物。Energy 核对两站原始资料和现场测量，默认与最终检查分别通过 40、46 项断言，另用脚本复算成本和工期，再交付 6 项声明产物。两份交付产物的提交和文件摘要都与上一节相应记录一致。两条的领域拒绝和结果层错误均为 0。[定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

### 用量与证据范围

| 指标 | Software | Energy | 合计 |
|---|---:|---:|---:|
| 结算请求 | 20 | 10 | 30 |
| 归因调用配对 | 29/29 | 16/16 | 45/45 |
| Fresh input | 27,262 | 21,233 | 48,495 |
| Cache read | 505,984 | 188,544 | 694,528 |
| Cache creation | 0 | 0 | 0 |
| Output | 8,777 | 4,692 | 13,469 |
| **Tokens 合计** | **542,023** | **214,469** | **756,492** |

30 组请求的四类终态计量与 DSH 轨迹逐请求相符，未结算请求为 0。提示之后的模型步骤分别用掉 530,354 和 202,767 tokens，包含结论回执后的最终答复。两条均保留原 canonical HEAD 和退役状态，Work 事件列表及负载摘要一致，`plan`、`relay`、`complete`、`finalize` 与 promotion 均为 0。[定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

这组结果覆盖**指定先查 readiness 后的提示采用**，两种状态各观察一次。上一节从旧任务仍在的原始状态复跑，两次都直接交付，退役后的 `readiness` 调用为 0。这两组分别记录指定触发后的行为与原始续作中的工具选择。真实流、归因时间线、请求账本和数据库已归档至本地 `.aps-tmp/pnwf-paid-2026-11-08-readiness-hint-software` 与 `.aps-tmp/pnwf-paid-2026-11-08-readiness-hint-energy`。[定向观察证据](../../research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)
