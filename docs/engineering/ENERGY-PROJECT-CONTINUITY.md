# Energy 项目跨会话交付

本阶段从 `112a7b50c25639ec5586afd170e9f7f311c561ba` 开始。用一个持续变化的项目检验直接交付、正式执行、所有者接受和后续接续。Palimpsest 的三个真实会话通过后，同阶段运行强原生 DSH 对照。

## 输入和判据

两组从同一 Git 对象开始。目录初始只有 `fixtures/psvr/energy-deployment` 的原始来源和共同的项目合同。T1 要求首版六项成果。T1 通过后，宿主注入 `updates/2026-11-06/hf-capacity-correction.csv`。这份模拟供应商更正只修改 Harbor Flats 的 S-1080 在 +42 °C 的容量，900 kW 降至 600 kW。站点要求仍为 620 kW，走廊图纸仍为 1,250 mm。North Ridge 的选型和独立证书记录继续有效。

| 判据 | T1 | T2 接受后 |
| --- | --- | --- |
| North Ridge | K-900 | K-900 |
| Harbor Flats | S-1080 | K-900 |
| 总价 | USD 485,000 | USD 536,000 |
| Harbor Flats 交期 | 9 周 | 14 周 |
| Harbor Flats 计划安装起点 | 2027-01-07 | 2027-02-11 |

公开检查验证文件格式。宿主从具体提交读取成果，在独立目录应用更正并重算业务判据，验证证书文件 blob 和 North Ridge 安装及调试日期。T3 的摘要须引用已接受 HEAD、更正来源和仍待审批的决定，并从该 HEAD 单独提交。

## 执行边界

每个 Session 有独立 DSH home、固定 Provider 路径和单会话账本。Docker 实际镜像、权限、挂载和 Git 对象通过当次探针验证。Worker 使用相同镜像的独立容器与独立 Git 对象库，取得正式 Attempt 的上下文和确切基线。它通过已有 Worker 结果合同报告，宿主确认退出、结果 SHA 和写范围后把提交导回 Attempt，由产品观察、结算和执行门禁。Windows Worker 默认入口仍执行其原有门禁。

T2 前，所有者按完整 SHA 接纳 Palimpsest 的执行基线。T2 后，各组提交候选的业务核验结果与完整 SHA，等待所有者逐案核准。Palimpsest 由现有 Promotion 产生接受 HEAD，原生组快进到核准的 Git 版本。T3 的接受凭据由宿主只读提供。签批操作与模型容器分开。

真实会话使用 `deepseek-flash` 和 DSH `0.2.1-rc.5`，`paid-usage-only` 按终态用量记账。每个 Session 允许 64 次请求和 30 分钟，单请求等待上限 240 秒。Worker 和原生子任务计入同一会话窗口。金额和总 token 上限为 `null`。终态用量不明时封闭账本并保存现场。

## 运行与复算

在已经构建产品的 checkout 运行以下命令，Windows 上使用 Docker 可挂载的 C 盘独立目录。每次资格运行使用新目录。

```powershell
node scripts/pnwf/energy/run.mjs --action=qualify "--run=$trial"
node scripts/pnwf/energy/run.mjs --action=live --arm=P --session=T1 --execute "--run=$trial"
node scripts/pnwf/energy/run.mjs --action=basis "--approve=$approvedBasis" "--run=$trial"
node scripts/pnwf/energy/run.mjs --action=live --arm=P --session=T2 --execute "--run=$trial"
node scripts/pnwf/energy/run.mjs --action=accept --arm=P "--approve=$approvedCandidate" "--run=$trial"
node scripts/pnwf/energy/run.mjs --action=live --arm=P --session=T3 --execute "--run=$trial"
```

原生组用 `--arm=F` 依次执行 T1、T2、`accept` 和 T3。候选签批前核对 `operator-review.json` 或 `candidate.json`。会话证据由 `result.json`、`request-accounting.json`、`request-observations.jsonl` 和各 DSH stream 的 `session_attribution.mjs` 输出组成。完整原始 stream 保存在本机运行目录。报告分别列文件存在、业务正确、提交持久化、正式结算、适用的接受和自然退出，按全周期统计调用、用量、返工和人工等待。Mock 的计量单位是合成字节，单独保留。

用 `node scripts/pnwf/summarize_energy.mjs $trial` 从本机收据重新生成汇总 JSON。主会话以 Host 或原生 Headless 的启动事件提供的 Session ID 绑定。原生子任务可能和主会话记录同一个初始工作目录，文件排序无法区分两者。

## 2026-11-09 零付费资格

两个组的三个 Session 都自然退出。35 笔 Mock 请求全部结算，27 个工具结果都配对到调用。逐请求四项用量和 DSH 轨迹按容器角色对账通过。P 的 T2 有 13 笔 Principal 请求和 3 笔独立 Worker 请求。F 的 T2 有 5 笔 Principal 请求和 2 笔原生 Subagent 请求。

| 组别 | T1 请求 / 秒 | T2 请求 / 秒 | T3 请求 / 秒 | 结算与接受 |
| --- | --- | --- | --- | --- |
| Palimpsest | 3 / 47.0 | 16 / 89.1 | 4 / 46.5 | Worker 提交经 `COMPLETED`、`VERIFYING` 和门禁 `PASS`，记录 `WAIT_FOR_OPERATOR`，经模拟签批晋升后由 T3 接续 |
| 强原生 DSH | 2 / 11.3 | 7 / 15.0 | 3 / 11.9 | Subagent 留下独立 Git 候选，模拟签批后快进，由 T3 接续 |

资格测试拒绝了旧基线 SHA 和错配候选 SHA。实际容器通过保护文件、只读挂载、外部路由和 Git 基线探针。回归覆盖错基线、脏树、越界提交、终态用量缺失和调用结果配对。开发过程中，早期 T2 实测到 Worker 结算后任务仍为 `ACTIVE`，此时 `WAIT_FOR_OPERATOR` 被拒绝。最终 Mock 从既有调度入口推进到 `VERIFYING` 后记录等待结论。Mock 用时包含启动、探针和轮询，供复现执行过程。[机器证据](../../research-evidence/pnwf-energy/2026-11-09/continuity.json)

## 真实 Palimpsest T1

模型先读 `pulse` 和原始资料，逐项写出六份成果。首版选用 North Ridge 的 K-900 和 Harbor Flats 的 S-1080，总价 USD 485,000。它另外记录了证书有效期、海拔降额待确认、报价期限和成本范围。六项成果全部持久化于 `4cf360d5620fa10df5022c777aa0ed83c312a80a`，Work 中没有新增任务和 Attempt。

37 个工具结果均能配对。模型提交后先尝试 `WAIT_FOR_OPERATOR`，产品以当前没有待接受候选为由拒绝。下一次结论是 `DELIVER`，产品记录交付后会话自然退出。主会话用时 199.8 秒，DSH 轨迹跨度 171.2 秒。19 笔请求全部结算，共 **535,044 tokens**，其中 fresh input 22,009、cache read 491,776、cache creation 0、output 21,259。

原始独立判分失败。技术、成本和进度表的站点键使用 `North Ridge` 和 `Harbor Flats`，旧检查器只认 `NR` 和 `HF`，下发的场景合同没有限定缩写。保留原始结果及其摘要，仅在宿主的判分副本归一化两组确切等价名称，并拒绝歧义和重复站点。以同一个 Git 提交、同一来源和原有业务规则离线复算，**45/45** 检查通过。原始结果与复算结果分开登记，新增付费请求为 0。

续作目录为 `C:/Users/66494/AppData/Local/Temp/pnwf-energy-qualified-20261109-165601`。它复用原始种子、模型、提示词、更正和镜像，原始轨迹保留于 `C:/Users/66494/AppData/Local/Temp/pnwf-energy-20261109-163324`。T2 执行基线为 `8041871314136d417b285a800265858757463f68`，相对于 T1 只新增容量更正。所有者已核准此 SHA。首次复资格在 F 组 T3 的本地 Mock 身份握手失败，发生在任何请求前。补强握手后，两组 Mock 于 17:02 完整通过，保留已批准的基线对象和原始 T1 轨迹。[机器证据](../../research-evidence/pnwf-energy/2026-11-09/continuity.json)

## 真实 Palimpsest T2

17:03:25，签名 Operator 通过 `DIRECT_BASIS` 接纳已批准的 `8041871314136d417b285a800265858757463f68`，记录事件 6。从提交送审到执行基线接纳共 930.4 秒，所有者的回复在送审后约 13 至 62 秒内到达，其余时间用于本地复资格和接纳操作。

1. Principal 读取更正和首版六项成果。直接调用 `begin` 被 worktree 部署拒绝，随后 `plan` 声明 `revise-hf-capacity` 并调用 `delegate`。它把六份成果全部列入 Work 写范围，也把 Work 作业 ID 传给了原生 `job_output`，收到未知作业错误。
2. 第一个 Worker 在独立容器中读到降额，选定两站 K-900，总价 USD 536,000，并提交 `109ef58eabde723fd41f139f3ad1d7229e0689cb`。它还改写了 `vendor-compliance.md` 的说明，结构化证书状态和日期未变。宿主只允许五个受影响文件，因此以 `WORKER_RESULT_OUTSIDE_SCOPE` 拒绝导入。这个范围比 Principal 给 Worker 声明的范围窄，分歧在 Worker 完成 25 笔请求后才显现。
3. Principal 查到没有可结算结果。第一次 `relay` 缺少 `relayRoute`，第二次 `takeover` 被 `NO_SETTLEABLE_DELTA` 拒绝，因为被拦截的提交留在独立副本。`successor` 关闭原 Attempt，并在同一基线启动第二个 Worker。第二个 Worker 在独立副本已有改动，主会话在 64 笔上限触发后终止，Worker 退出码为 137。

T2 的 93 次工具调用中有 92 次配对结果。记录了 3 次工具错误、1 次领域拒绝和 2 次 Worker 宿主失败。第一个 Attempt 为 `CANCELLED`，第二个在持久化状态中仍为 `RUNNING`，其进程已终止。没有新的 `WAIT_FOR_OPERATOR` 或 Promotion，最新 `DELIVER` 属于 T1。两个真实会话都完成了账本和轨迹的逐请求分项对账。

| 会话或角色 | 请求 | Fresh input | Cache read | Cache creation | Output | 总用量 | 宿主耗时 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P T1 | 19 | 22,009 | 491,776 | 0 | 21,259 | 535,044 | 199.8 秒 |
| P T2 Principal | 30 | 23,115 | 810,752 | 0 | 7,310 | 841,177 | — |
| P T2 Workers | 34 | 38,052 | 744,320 | 0 | 24,494 | 806,866 | — |
| P T2 合计 | 64 | 61,167 | 1,555,072 | 0 | 31,804 | 1,648,043 | 315.0 秒 |

两个 Worker 分别结算 684,159 和 122,707 tokens。真实运行累计 **83 笔请求、2,183,087 tokens**，均已结算。T2 拒绝了第 65 笔请求，停止时未结算数为 0。

### 拒绝候选的离线复核

从 `109ef58eabde723fd41f139f3ad1d7229e0689cb` 的独立副本生成诊断提交 `a6779302c3f2e1e25b413adf7ee707f4398fa1f3`。唯一处理是从批准基线恢复 `deliverables/vendor-compliance.md`，其余五份 Worker 成果保留原 blob。离线判分 **45/45**，确认两站 K-900、总价 USD 536,000、Harbor Flats 交期 14 周和 North Ridge 的原计划。诊断提交只存在于试验目录，不进入正式 Attempt 和 Promotion。[诊断与轨迹证据](../../research-evidence/pnwf-energy/2026-11-09/continuity.json)

真实闭环停在 Palimpsest T2。已有证据覆盖首版直接交付、明确基线接纳、真实 Worker 修订、越界拦截和请求上限。T3 接续与强原生 DSH 真实对照的启动条件尚未满足。两组的完整流程和子任务计量已有 Mock 证据。
