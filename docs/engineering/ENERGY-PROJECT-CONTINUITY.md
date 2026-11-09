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

首轮真实闭环停在 Palimpsest T2。已有证据覆盖首版直接交付、明确基线接纳、真实 Worker 修订、越界拦截和请求上限。两组的完整流程和子任务计量已有 Mock 证据。

## T2 写范围修复与复跑

场景合同定义五个可写文件，分别是技术容量、成本、进度、风险和推荐。两组的 T2 提示都明确要求从基线逐字节保留 `deliverables/vendor-compliance.md`。Palimpsest 在登记 Work 计划和启动委派前核对这五个路径。宿主在为 Attempt 分配 Worker 前核对实际的 `writeScope`，将证书保留要求交给 Worker，并用同一份列表核对提交 diff。业务判分从 Git 对象再次比对证书 blob。

Mock 首次提交与首轮真实失败相同的六文件声明，收到 `ENERGY_REVISION_SCOPE_MISMATCH` 后改成五文件计划。它还检查实际 Worker 提示包含完整写范围和证书保留要求。独立回归覆盖宽范围、缺项、重复项、现存范围不符的 Work 和越界提交。变更限定在 energy 场景的工具和宿主组合。

复跑沿用真实 T1 和已批准的基线 `8041871314136d417b285a800265858757463f68`。两组的初始 Git 树、供应商更正、T1 与 T3 提示、模型及按量记账窗口相同。运行合同记录旧 T2 提示摘要、修复后的范围，以及 Palimpsest T2 专用执行说明的摘要。此前的 T2 账本和轨迹保留在首轮目录。

```powershell
node scripts/pnwf/energy/run.mjs --action=qualify "--run=$trial" "--adopt-t1=$originalT1" "--reuse-basis=$approvedBasisRun" --commit=4cf360d5620fa10df5022c777aa0ed83c312a80a
node scripts/pnwf/energy/run.mjs --action=basis "--run=$trial" --approve=8041871314136d417b285a800265858757463f68
node scripts/pnwf/energy/run.mjs --action=live --arm=P --session=T2 --execute "--run=$trial"
```

### 首次范围修复后的路径偏离

第一次复跑的提示要求隔离执行，但没有指定执行入口。Principal 查过 Work 状态后另建 Git worktree，调用原生 Subagent 修订，再尝试 `conclude WAIT_FOR_OPERATOR`。当时没有已结算的 Work 候选，产品拒绝了这条结论。Principal 随后记录 `CHECKPOINT` 并自然退出。Work 无 Task 或 Attempt，宿主停止在 `GOVERNED_CANDIDATE_NOT_PENDING`。

原生子任务留下 `f838aec89655ddee74dd9f1b8a006fafe484b7ff`。离线判分确认五个文件的 diff、证书 blob `6ef5f2c8a1056ba280e9659a83179e4e3e56384c` 与基线相同，业务检查 45/45。它保留为路径偏离的诊断证据。原生子任务用了 17 笔请求，Principal 用了 30 笔，全部结算，78/78 个工具调用配对。子任务有 1 次 Bash 作业失败，随后仍完成提交；Principal 有 1 次领域拒绝。共 1,502,063 tokens（fresh input 57,132，cache read 1,409,408，cache creation 0，output 35,523），宿主耗时 263.5 秒。原始目录为 `C:/Users/66494/AppData/Local/Temp/pnwf-energy-scope-20261109-1730`。[路径偏离证据](../../research-evidence/pnwf-energy/2026-11-09/scope-route-observation.json)

为验证正式 Worker 路径，下一轮在 Palimpsest T2 的业务提示后加部署说明：通过 Work 登记与委派，结算后推进验证并记录 `WAIT_FOR_OPERATOR`。原生 DSH 仍使用共同的业务与范围要求，自选原生能力。两组共享判分与验收事实。路径说明和范围修复均属于这次干预，用量差异不能单独归因于范围修复。

### 明确 Work 路径后的零付费资格

六个 Mock 会话全部自然退出，36 笔 Mock 请求全部对账。Palimpsest 的 T2 为 14 笔 Principal 和 3 笔正式 Worker 请求，六文件计划被拒一次，五文件计划结算并通过门禁，再经模拟签批晋升。原生 T2 为 5 笔 Principal 和 2 笔原生 Subagent 请求，候选经模拟签批快进。两组 T3 均验证接受 HEAD 并提交摘要。范围、资格和归因三组回归共 32/32 通过，构建、架构和公共 API 检查通过。

| Mock 组别 | T1 请求 / 秒 | T2 请求 / 秒 | T3 请求 / 秒 |
| --- | ---: | ---: | ---: |
| Palimpsest | 3 / 49.1 | 17 / 101.0 | 4 / 42.3 |
| 强原生 DSH | 2 / 12.1 | 7 / 16.4 | 3 / 13.1 |

### 写范围验证通过，Principal 用尽请求窗口

真实复跑先用 `plan` 登记五个路径，再 `delegate` 一次。正式 Worker 独立修订并提交 `9c104a178807022c7cb20ea718c7bebb275872a6`。宿主观察到 Worker 自然退出、实际写范围为五文件、提交导入成功。Work 作业返回 `FINISHED / SETTLED`，持久化 Attempt 为 `COMPLETED`。同提交离线核对恰好五文件、证书 blob `6ef5f2c8a1056ba280e9659a83179e4e3e56384c` 未变、业务 45/45；隔离副本中的 `gate-release` 为 `PASS`。

Principal 在等待时运行了 21 次 Bash 调用和多次状态查询。它再次把 Work 作业交给原生 `job_output`，收到未知作业错误。看到结算后，它调用用于重开的 `continue`，因任务仍为 `ACTIVE` 被拒；接着调用 `complete`，收到 `NO_RUNNING_ATTEMPT`，因为 Worker 已结算。随后 `next` 成功推进到 `VERIFYING`。它又调用 `continue`，得到 `STALE_INSPECTION`，然后查结果。下一请求被原会话窗口拒绝；没有新的 `WAIT_FOR_OPERATOR`，也没有自然退出和 Promotion。

99 个工具调用全部配对。归因记录 1 次工具错误、2 次领域拒绝、0 次 Worker 宿主或 Bash 作业失败。`STALE_INSPECTION` 是单独保留的返回状态，未归入现有拒绝计数。64 笔请求全部结算，共 2,111,816 tokens，宿主耗时 238.9 秒。相较首轮的 64 笔，Worker 从 34 笔降至 19 笔，Principal 从 30 笔增至 45 笔。这轮已经验证范围与正式结算，产物仍停在未送审状态。原始目录为 `C:/Users/66494/AppData/Local/Temp/pnwf-energy-scope-work-20261109-093453`。[请求窗口停止证据](../../research-evidence/pnwf-energy/2026-11-09/scope-request-stop.json)

| 角色 | 请求 | Fresh input | Cache read | Cache creation | Output | 总用量 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Principal | 45 | 36,338 | 1,653,248 | 0 | 16,809 | 1,706,395 |
| 正式 Worker | 19 | 16,844 | 375,552 | 0 | 13,025 | 405,421 |
| 合计 | 64 | 53,182 | 2,028,800 | 0 | 29,834 | 2,111,816 |

### 等待与结算引导的定向复验

实验专用 Work 工具每次 `workers` 调用可在宿主内等待最多 45 秒，同一调用内读取实际的 Worker 作业状态，等待期间不发模型请求。只有观察到 `FINISHED / SETTLED` 才提示 `run`，之后由 Principal 在 `VERIFYING` 时调用 `conclude WAIT_FOR_OPERATOR`。它不替 Principal 推进调度或记录结论，也不改变会话终止、记账和接受门禁。该变体继续使用原已批准基线，单独记录结果和用量。

零付费再验证 6/6 个会话、29 笔 Mock 请求均通过。P T2 的 Principal 从前一轮 Mock 的 14 笔降至 7 笔，Worker 仍为 3 笔。一次 `workers` 调用观察到结算，接着 `run`、`conclude`，自然退出。P T1/T2/T3 宿主耗时分别为 47.7、91.3、42.8 秒，F 为 12.4、16.3、13.1 秒。增加等待回归后，定向测试 33/33。

### 真实 Palimpsest T2 通过并送审

真实 Principal 只登记一个五文件任务并委派一个正式 Worker。前两次 `workers` 等到查询窗口结束时 Worker 仍在运行，第三次观察到 `FINISHED / SETTLED`。Principal 随后调用 `run`，调度记录 `TASK_VERIFYING`；检查候选后调用 `conclude WAIT_FOR_OPERATOR` 并自然退出。Worker 及 Principal 共 58 个工具调用均配对。Principal 仍尝试过原生 `job_output`，被告知找不到 Work 作业；领域拒绝、Worker 宿主失败和 Bash 作业失败均为 0。

候选 `e2bc1a424a30123213708990394fc8b19e18c445` 为获批基线 `8041871314136d417b285a800265858757463f68` 的后继提交。五文件 diff、未改的证书 blob 和 `COMPLETED` Attempt 均已核验。门禁 `PASS`，独立业务 45/45，两站为 K-900、总价 USD 536,000、Harbor Flats 交期 14 周。送审时原 HEAD 仍在批准基线，尚未发生 Promotion。

宿主耗时 231.0 秒。30 笔请求全部结算，共 761,688 tokens，其中 52,093 fresh input、691,584 cache read、0 cache creation、18,011 output。Principal 为 18 笔、438,785 tokens；Worker 为 12 笔、322,903 tokens。相比上一条正式 Worker 复跑，Principal 从 45 笔降至 18 笔，Worker 从 19 笔降至 12 笔，宿主时间只少 7.9 秒。等待引导降低了轮询，但模型生成与缓存也不同。运行目录为 `C:/Users/66494/AppData/Local/Temp/pnwf-energy-scope-wait-20261109-095221`。

所有者核准了上述完整 SHA。Promotion 事件 18 将该候选对应到接受 HEAD `7aed12ea8618533c7acba5b1c8a4f60e8c1c97ce`；候选和晋升后 HEAD 的树都为 `e8c9dffac73835119dbc52b1c6359c8486234761`。从候选就绪到宿主记录接受共 101.5 秒，送审至观测到所有者回复的上界约 65 秒。该等待独立于模型会话耗时。

### 真实 Palimpsest T3 接续

全新 DSH home 读取只读接受凭据和晋升后的成果，也查阅首版成本及进度。唯一新增文件 `deliverables/procurement-review.md` 持久化于 `02fdf9c3aa3e2821e7fe32f82bd7e3b768baf234`，其父提交是接受 HEAD。摘要说明两站 K-900、总价增加 USD 51,000、Harbor Flats 晚 5 周，以及预算和采购仍需批准。没有新建 Attempt。Principal 记录 `DELIVER` 并自然退出，11/11 个工具调用均配对，错误和领域拒绝为 0。

T3 宿主耗时 90.1 秒，12 笔请求全部结算，共 258,525 tokens（fresh input 16,857、cache read 236,928、cache creation 0、output 4,740）。Palimpsest 的三个真实会话已达到验收，随后启动强原生 DSH 对照。

### 真实强原生 DSH T1

原生组从同一空白种子启动，收到相同 T1 提示。模型在读取来源后额外检查了 Git 历史和运行目录；两次范围过大的搜索进入后台，随后由模型终止。作业事件中有 4 个 `SIGTERM`，包括两次搜索和两条终止命令；无异常线索，未归入脚本的失败作业计数。模型回到任务合同，计算交期，写出六份成果并提交 `6583f27f336e2a5011700d5c6c321dcddc64291e`。宿主判分 45/45，初始选择和总价与 Palimpsest T1 相同。39 个工具调用全部配对，主会话自然退出。

宿主耗时 215.2 秒，25 笔请求共 488,109 tokens（fresh input 9,814、cache read 460,416、cache creation 0、output 17,879）。宿主随后注入同一更正，形成原生 T2 基线 `6324e396ec4eb6a5e7d59fa6d75f80274ad27268`。

### 真实强原生 DSH T2

Principal 读取更正、首版成果与 Git 历史，检查原分支和证书摘要，在独立 Git worktree 启动原生 Subagent。子任务提交到 `candidate` 分支，通过原生消息向 Principal 交回 SHA；Principal 用 `list_agents` 和 Git 检查结果。68 个工具调用全部配对，没有领域拒绝、工具错误或归因作业失败。原分支保持干净，会话自然退出。

送审候选为 `ba95fd0e384b1523170ebc41d125b072fd94941e`。独立判分 45/45，diff 恰好五文件，证书 blob `f61283360fcc95bf8a8ab61d38a1e6bc600d7017` 与本组基线一致。两组达到相同的业务判据，证书文件各自沿用本组首版。

宿主耗时 222.4 秒，32 笔请求全部结算，共 836,832 tokens（fresh input 36,050、cache read 763,776、cache creation 0、output 37,006）。Principal 为 21 笔、606,313 tokens，Subagent 为 11 笔、230,519 tokens。

### 真实强原生 DSH T3 接续

所有者核准 `ba95fd0e384b1523170ebc41d125b072fd94941e` 后，宿主把隔离副本快进到该 SHA，树 `74689743ffc2bcebbf0eb146f3d092501de0c22f` 与候选一致。候选就绪到记录接受为 269.3 秒，送审至观测到回复的上界约 247 秒。这段等待不计入模型会话时间。

新会话读取接受凭据，并用 Git 比较首版和修订版。它把采购摘要单独提交为 `7ee3971ab8348a1c028a05520bc797cc8672c9b0`，准确列出配置、增加 USD 51,000、晚 5 周和仍需批准的决定。归因配对 26/26。一次 Bash 检查因命令引用错误退出 1，模型换用带引号的 heredoc 复核后提交；失败作业计为 1，领域拒绝为 0。会话自然退出，宿主判分通过。

宿主耗时 127.9 秒，18 笔请求全部结算，共 365,166 tokens（fresh input 16,638、cache read 336,640、cache creation 0、output 11,888）。

### 会话验收与用量

| 会话 | 文件存在 | 业务判分 | 提交持久化 | 正式结算 | 接受 | 自然退出 |
| --- | --- | --- | --- | --- | --- | --- |
| P T1 | 六件 | 45/45，离线复算 | 是 | 不适用 | 不适用 | 是 |
| P T2 | 六件，五件修订 | 45/45 | 是 | COMPLETED，门禁 PASS | 按 SHA 晋升 | 是 |
| P T3 | 一页摘要 | 通过 | 是 | 不适用 | 从晋升 HEAD 启动 | 是 |
| F T1 | 六件 | 45/45 | 是 | 不适用 | 不适用 | 是 |
| F T2 | 六件，五件修订 | 45/45 | 是 | 不适用 | 按 SHA 快进 | 是 |
| F T3 | 一页摘要 | 通过 | 是 | 不适用 | 从已核准 SHA 启动 | 是 |

| 会话 | 请求 | Fresh input | Cache read | Cache creation | Output | 总用量 | 宿主秒 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P T1（复用） | 19 | 22,009 | 491,776 | 0 | 21,259 | 535,044 | 199.8 |
| P T2 | 30 | 52,093 | 691,584 | 0 | 18,011 | 761,688 | 231.0 |
| P T3 | 12 | 16,857 | 236,928 | 0 | 4,740 | 258,525 | 90.1 |
| P 周期 | 61 | 90,959 | 1,420,288 | 0 | 44,010 | 1,555,257 | 520.9 |
| F T1 | 25 | 9,814 | 460,416 | 0 | 17,879 | 488,109 | 215.2 |
| F T2 | 32 | 36,050 | 763,776 | 0 | 37,006 | 836,832 | 222.4 |
| F T3 | 18 | 16,638 | 336,640 | 0 | 11,888 | 365,166 | 127.9 |
| F 周期 | 75 | 62,502 | 1,560,832 | 0 | 66,773 | 1,690,107 | 565.6 |

两个完整周期合计 136 笔、3,245,364 tokens，逐请求与 DSH 轨迹分项对账通过。239 个工具调用全部配对。首版 P T1 复用原轨迹，计入周期，新增付费请求为 0。本轮通过的其余五个会话实际新增 117 笔、2,710,320 tokens；加上两次未送审复跑，**本轮实际新增 228 笔、6,324,199 tokens**。含本阶段首轮 T1 与首轮失败 T2，共 311 笔、8,507,286 tokens。所有请求的终态用量已确认。[等待式变体机器证据](../../research-evidence/pnwf-energy/2026-11-09/scope-rerun.json)

### 配对结论

- **执行与接受。** 两组均实现首版、五文件修订、所有者按 SHA 接受及全新会话接续。Palimpsest 额外留下 Work 的委派、结算、门禁和 Promotion 事件，明确区分候选 SHA 与接受 HEAD；原生组用独立 worktree、Subagent 和 Git 快进实现同一业务结果。人工决策为 P 两次（基线和候选）与 F 一次（候选）。无人工代写或中途调整窗口。
- **请求与用量。** 在这组完整周期中，P 少 14 笔请求、134,850 tokens（约 8.0%）。P 的 fresh input 反而多 28,457，cache read 少 140,544，output 少 22,763，两个组的 cache creation 都为 0。T2 的 P 正式 Worker 用 12 笔，F 原生子任务用 11 笔；P 的 Principal 用 18 笔，F 用 21 笔。原生组 T1、T3 的额外环境搜索也计入了周期。
- **耗时与恢复。** P 周期的会话用时少约 44.7 秒，P 的 T2 单独用时比 F 多约 8.6 秒；宿主秒包含容器和工具等待，两个候选的审批等待另计。P T2 的 `job_output` 查询错配仍出现一次，靠 Work 状态与调度继续；F T3 从一次本地探针失败恢复。未送审的复跑保留为独立观察，包含模型路径偏离、请求上限和对应返工用量。

这次配对验证了有五文件范围守卫、明确 Work 路径和等待帮助时的闭环。范围守卫解决了证书越界；两条早期复跑显示，默认路径选择和结算后推进仍会影响成败。缓存命中、会话历史和模型动作都不同，单次配对不支持一般性的成本或效率结论。
