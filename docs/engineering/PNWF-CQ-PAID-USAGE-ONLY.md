# PNWF-CQ 按量记账续作

2026-11-08，开发基线为 `4d5d9704e902d33b1380bf5a1df85dc39541935b`。Owner 于 2026-11-07 授权启动付费模型调用，随后允许不设计费上限。本次选择 `paid-usage-only`，金额和 token 总量上限均为 `null`。

实验选用一条 software 续作，复制 PSVR-C A-2 的 Git 与 SQLite 状态，使用原始续作 prompt。会话最多 64 个请求、30 分钟，单请求等待终态最多 240 秒。实验开始时 `grpc-contract` 为 ACTIVE，原 Attempt 为 RUNNING，canonical HEAD 为 `453aa7f005edb7612cf4edc1d8ec3b68efed5b4d`，episode conclusion 和 promotion 计数均为零。机械观察量为请求结算、会话退出、Work 调用、episode conclusion、任务状态、promotion 与 HEAD。单个样本的观察范围是这份状态和这一条模型轨迹。

## 执行合同

Runner 校验新 cohort、准备的 World、会话时长与独立账本。实际 adapter 在首次请求前测量 `network=none`、uid、挂载、凭证环境、canary 与复制后 Git World。容器通过 stdio 桥发送消息，宿主固定转发到 DeepSeek Messages 的 `deepseek-flash`。宿主从 `DEEPSEEK_API_KEY` 或 DSH 凭证文件取 key。服务端工具在转发前拒绝。

SQLite 在每次转发前写入请求摘要和 `PENDING` 行。完整 `message_stop` 与最终 `message_delta.usage` 结算 fresh input、cache read、cache creation 和 output。异常中止将请求记为 `UNKNOWN` 并关闭准入，未结算总量用 `null` 表示。DeepSeek 的兼容路径在某些请求上可能扩展 `max_tokens`，流式记账以终态 usage 为准。[DeepSeek Anthropic API 文档](https://api-docs.deepseek.com/guides/anthropic_api/)

硬预算模式仍使用 R1 的 Mock 上界合同。真实 Provider 的硬上界资格保留 `PROVIDER_BOUND_UNQUALIFIED`。旧 5M cohort 的 5,190,778 tokens 和 INVALID 裁定归属 2026-11-07 的历史运行。

## 复现

使用已构建的仓库、可用的 Docker Linux engine、合格镜像与保留的 PSVR-C A-2 源状态。每次运行使用新目录及 cohort ID。带 `--execute` 的 `run_pnwf_live` 调用使用真实付费 Provider。

```powershell
node --test scripts/pnwf/qualification.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fault tests failed' }
$trialId = 'pnwf-paid-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
node scripts/pnwf/qualify_execution.mjs "--out=.aps-tmp/$trialId-qualification"
if ($LASTEXITCODE -ne 0) { throw 'Container qualification failed' }

$trial = Join-Path (Get-Location) ".aps-tmp/$trialId"
node scripts/pnwf/prepare_continuation.mjs --mode=paid-usage-only --session=software `
  "--cohort-id=$trialId" "--run=$trial" --max-requests=64 --wall-clock-ms=1800000
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed' }
$env:ALHS_CORE_RUN = $trial
$env:PNWF_BUDGET_DB = Join-Path $trial 'request-usage.sqlite'
$cohort = Join-Path $trial 'cohort.json'
$adapter = Join-Path (Get-Location) 'scripts/pnwf/container_adapter.mjs'
$gate = Join-Path $trial 'out/gate'
node scripts/pnwf/score_continuation.mjs "--run=$trial" "--cohort=$cohort" "--out=$trial/out/baseline.json"
if ($LASTEXITCODE -ne 0) { throw 'Baseline observation failed' }
node scripts/pnwf/run_pnwf_live.mjs --mode=paid-usage-only --session=software `
  "--cohort=$cohort" "--adapter=$adapter" "--out=$gate" --execute
node scripts/pnwf/score_continuation.mjs "--run=$trial" "--cohort=$cohort"
```

计费观察以 `out/software/request-accounting.json` 的终态 usage 为源，`out/software/qualification.json` 记录实际容器，`out/score.json` 汇总模型轨迹和产品事实。

## 2026-11-08 软件样本

会话从 00:47:50 到 00:52:41（北京时间），历时 4 分 51 秒，自然退出码为 0。DeepSeek 完成 27 个请求，全部结算。请求账本和 DSH 轨迹的 27 组终态用量逐请求一致。

| 用量 | Tokens |
|---|---:|
| Fresh input | 33,921 |
| Cache read | 934,912 |
| Cache creation | 0 |
| Output | 14,024 |
| **合计** | **982,857** |

产品记录了 `DELIVER` 结论（journal seq 4）及一次计划修订。三个原任务转为 STALE，原 Attempt 转为 CANCELLED。`complete` 调用为 0，`conclude` 调用为 1，promotion 为 0，canonical HEAD 保持 `453aa7f005edb7612cf4edc1d8ec3b68efed5b4d`。软件样本满足原机械主判据（1/1）。轨迹共有 31 个工具调用，其中 2 次领域拒绝，含 1 次重复拒绝。历史同状态记录为 1,331,902 tokens，本次为 982,857 tokens。这里比较的是各一条轨迹的实测用量。

本地 build、架构和公共 API 检查通过，24 项请求故障测试通过，六个零付费容器场景通过。六个获资格的 Mock 容器和实际付费容器的镜像及 adapter 文件摘要一致，实际付费容器通过 16 项隔离检查，读取了 1 个复制后的 Attempt World。[机器证据](../../research-evidence/pnwf-cq-paid/2026-11-08/software.json)

运行前 Docker Desktop 因陈旧的 Unix socket 启动失败。排查依据为本机 backend 日志，退出失败的启动实例后备份了只包含零字节 socket 的运行时目录，随后使用原有资格镜像完成验证。原始运行数据留在 `.aps-tmp/pnwf-paid-2026-11-08-software`，机器证据保存请求计量、产品事实与原始文件摘要。
