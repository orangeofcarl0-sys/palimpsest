# PNWF-CQ-R1：零付费执行资格与产品边界收敛

日期：2026-11-07。开发基线：`6b021dda77ee8c3f8010db5071b0896aee7ab232`（#229 后主线）；工作分支：`codex/project-takeover-20261107`。

本轮回答两个问题：请求是否在发送前取得足够额度，实际运行容器是否具备隔离和可读的 Git World；Direct Basis Admission 是否只能在足够权限和当前性事实下发生。没有调用付费模型，也没有据 Mock 行为推断模型产品收益。

历史 2026-11-07 cohort 的 **5,190,778 tokens、超额 190,778、INVALID / OVER BUDGET、0/2 primary** 保持原判。其原始证据未修改。新资格通过也不能追认该历史运行。

## 1. 执行合同与上界

原问题是：usage 在响应末尾才出现，定时采样无法收回已经发出的请求。改动将准入放到实际转发请求之前；SQLite `BEGIN IMMEDIATE` 串行化多个进程的预留。

设已确认消耗为 `C`，未完成请求的预留之和为 `R`，待发送请求的可执行上界为 `b`。发送必须同时满足：

```
C_session + R_session + b <= softCeiling_session <= authorizedCeiling_session
C_cohort  + R_cohort  + b <= authorizedCeiling_cohort
```

在运行层面，未结束的请求会占用额度，因此其他请求不能再次使用它；数学上的 `R` 在 `execution_budget.mjs` 对应 `RESERVED/UNKNOWN` 行。在 `bounded_provider.mjs` 中，顺序固定为身份握手 → 计算上界 → 持久预留 → 上游 `request.end(body)`。最早可观测结果是预留行已经存在，而 Mock 尚未收到请求。终态完整 usage 才把预留变成 confirmed；中断、超时、缺少 usage、无法读取账本均保留不确定性并阻止继续。

本轮只资格化 **本地确定性 Mock**。其输入计数严格定义为请求体 UTF-8 字节数，输出计数为 content JSON 的 UTF-8 字节数，Mock 自己在响应前强制 `output <= max_tokens`。因此 `b = bodyBytes + max_tokens` 是该 Mock 合同的上界。这是合成计量单位，不是 DeepSeek tokenizer 或真实账单的证明。

**真实 Provider 状态为 `PROVIDER_BOUND_UNQUALIFIED`。** DeepSeek 官方兼容说明允许特定 thinking 主代理请求扩大 `max_tokens`；不能把既有兼容路径的参数当作已经证明的计费上界。该文档也说明末尾 `message_delta.usage` 应替代开头 usage，并计入 fresh/cache input/output。本轮解析器遵循末尾计数原则，但没有因此宣称真实 Provider 已获资格。[DeepSeek Anthropic API 官方说明](https://api-docs.deepseek.com/guides/anthropic_api/)

缺少、损坏或不完整的旧账本不会被重建成零费用。预算初始化仅用于明确新建的 Mock cohort，配置和 session 顺序需与 runner 的 cohort 完全匹配。上一会话未结束、失败、未知 usage 或预算拒绝，均阻止下一会话。`refusals` 保存拒绝时的请求上界、session/cohort 已用与预留及阈值。250 ms monitor 仅负责停进程；它不是预算边界。

## 2. Mock、实际 Adapter 与容器绑定

- Mock 使用新建随机端口、随机实例 ID 和 HMAC challenge。已有监听者即使返回 HTTP 200，也不能通过身份检查；固定端口被占用直接失败。
- Mock 专用路由为 `/pnwf-mock/v1/messages`，不转发到真实 API，不读取 owner 凭证。新 DSH home 只包含不可计费的本地占位 key；不复制凭证文件。
- runner 只接受仓库内实际 `container_adapter.mjs`。旧 `--isolation` JSON 不授予执行资格，普通 Host Adapter 不可替换它。
- 每个 session 创建新容器并检查 **该 container ID**：uid 1001、`network=none`、只读根、drop ALL capabilities、no-new-privileges、明确挂载集合。报告绑定 image digest、实际挂载/权限、adapter 文件 SHA-256。
- Principal 的网络命名空间无外部路由。唯一出口是 `docker exec` stdio 数据桥，host 侧固定转发到本地有预算的 endpoint。帧不能指定 host URL 或命令，principal 不持有 host session key。所有并发请求仍进入同一账本。
- 私有 harness canary 为 root 0700；principal 的 Node、shell、父目录和 `/proc/1/root` 读取均须拒绝，外部 scorer 的 root 读取须成功。另验真实 DSH 原生扩展、任务读写、Git、Node 编译/执行小夹具、无 Provider credential 环境变量。

这里信任 host runner、Docker daemon 和测试镜像；没有声称抵抗 host 管理员篡改文件、SQLite 回滚或内核逃逸。当前资格只覆盖被测镜像与配置，不能转授给任意镜像/adapter。

## 3. 复制 World 的可移植性

`prepare_continuation.mjs` 只写新运行目录，保留原 recorded state；相对 alternates 指向复制后的 canonical object store。实际 principal 容器在第一条 Provider 请求前执行 `world_preflight.mjs`：

1. canonical HEAD 必须等于 prepared manifest 的指定 commit，且 commit object 可读。
2. 每个 live attempt 必须有 World；逐一检查复制目录的真实 envelope basis 和 World result。
3. alternates 必须解析到当前复制仓库；逐项执行 `rev-parse`、`cat-file`、basis/result diff、porcelain status。
4. 安装真实产品并调用 `observeAttemptResult`，其 observed HEAD 必须和 Git 一致；保存状态观察。

成功路径中 DSH 本身还执行 normal `palimpsest_work action=status`，Mock 下一次请求必须包含成功的 status tool result。故意把 alternates 改回不可用 Windows 路径的反例，须在第一条 Mock POST 前失败，后续 energy session 保持 `NOT_STARTED`。

## 4. 产品边界修复

`OperatorAuthorityPort` 仍是同一个部署端身份端口；类型移至低层 domain，再从原 review 路径重导出，避免 Head owner 反向依赖 review 层。Controller 通过现有安装组合取得该端口，模型调用参数不能自行提供权限。最终 owner 对 operator 角色、promotion `IN_SYNC`、checked-out descendant commit、clean worktree、head-only graph 做验证。

`CONFLICT` 与其他非 `IN_SYNC` 状态拒绝 Direct Basis Admission。既有 `SYNC_REQUIRED` 仍要求先对齐真实 promotion。`appendAtomic` 新增 owner 的同步 `beforeCommit` 检查，使用原事务重读 Git HEAD、工作树、promotion state 和部署权限；失败时 approval、revision、task reauthorization 全部回滚。签名权限端口在每次授权时复核有效期。

故障测试在最靠近 commit 的现有 checkpoint 注入真实 `git commit`，证明变化发生在最终读取前时能回滚。**Git 与 SQLite 并非同一原子系统**：在最后一次 Git 读取之后，不合作的原生 writer 仍可改动 HEAD。已有 `HEAD_BASIS_MISMATCH` 会拒绝随后工作；另有“admission 后再漂移”的测试，但不宣称已消除这个外部并发窗口。

本轮纵向正例在首次 promotion 前准入 Direct basis。没有新增旧 promotion 历史的重锚协议；如果一次 Direct advance 使原事务内投影得到 `CONFLICT`，最终复核仍会拒绝，而不是清除历史。不能把该正例外推为任意既有 promotion 历史上的再次 Direct 准入。

`IN_SYNC` 只表示 Head 相等。只有 canonical 事件同时存在关联的 Direct approval 与 `PROJECT_REVISED`，才输出 admitted Direct 成果提示；新建普通 governed project 不再被误认为已有 Direct 成果。机械 scheduler 决策保持不变。

`read_model.ts` 保留事实读取、事件投影、open invocation 观察。Head admission 规则与事件构造归回已有 `work/head.ts`，原生 Git 观察由已有 `unseen_inputs.ts` 提供，并通过 Controller 注入；Head owner 仍不直接读取 Git。计划失效集合、quiescence 拒绝和 receipt 构造放入 `work/plan_revision.ts`。没有新增产品 Head writer、promotion ledger 或通用活性 runtime。

## 5. 验证与可证伪结果

证据根：[research-evidence/pnwf-cq-r1/2026-11-07](../../research-evidence/pnwf-cq-r1/2026-11-07/)。汇总为 [verification.json](../../research-evidence/pnwf-cq-r1/2026-11-07/verification.json)，包括源文件 SHA-256、分批测试覆盖与实际容器所记录 adapter 摘要的当前一致性检查。最终数值以该目录的机器结果为准。

| 层级 | 验收 | 证据 |
|---|---|---|
| 请求准入 | 上述 20 项故障测试全部通过 | `budget-tests.log` |
| 实际容器 | 6/6 场景通过；每个获资格的实际容器 16/16 canary，两个 recorded projects 各 1 个 World 可读 | `container-final/summary.json` 与各 session 的 qualification/accounting/run |
| 产品 | 11 文件初轮 97/98；Head 职责修复后受影响的 2 文件 20/20，其余 78 项在原批次通过 | `product-tests.json`、`product-followup.json` 及对应 log |
| 纵向治理链 | Direct → Operator admission → Node 子进程 Worker → settlement → gate PASS → promotion → head reconciliation → 依赖任务 READY → 第二 Worker；PASS | `basis-vertical-final.json` |
| 工程约束 | TypeScript build PASS；architecture 0 violations；public API 0 missing/changed/added；diff 检查 PASS | `engineering-checks.log` |

最终容器运行的具体观测如下。POST 是到达 Mock 的请求数，confirmed/reserved 为合成计数；未知 usage 的 confirmed=0 不能被解读为免费，必须同时看 reserved。

| 场景 | Mock POST | confirmed | reserved | 最终状态 |
|---|---:|---:|---:|---|
| recorded-worlds | 4 | 335,282 | 0 | 两 session ENDED，2 个成功 status tool result |
| broken-alternates | 0 | 0 | 0 | STOPPED；后续 NOT_STARTED |
| large-request | 0 | 0 | 0 | BUDGET_EXHAUSTED；后续 NOT_STARTED |
| late-usage-next-request | 1 | 103,835 | 0 | 103,835 + 319,523 > 399,000，第二 POST 前拒绝 |
| interrupted-stream | 1 | 0 | 359,731 | INTERRUPTED_RESPONSE；后续 NOT_STARTED |
| large-response | 1 | 0 | 359,731 | Mock 拒绝超上界输出；PROVIDER_ERROR；后续 NOT_STARTED |

纵向测试由真实 Node 子进程读取实际 basis、写限定 artifact 并提交；产品的工作派发与结算路径产生两个 `ATTEMPT_COMPLETED`，一个受 gate 约束的 `PROMOTION_COMMITTED`。第一 Worker 从准入 commit 启动，第二从 promotion 后 commit 启动；测试没有直接改数据库状态。依赖任务先由 scheduler 产生 `TASK_READY`，再发起工作。

跨 Host 回归仍要求本 Host 观测到 OPEN invocation 时拒绝结算；另一 Host 无记录时显示 `UNOBSERVED`，合法 principal 结算归属 `UNATTRIBUTED`。这保留了普通 principal-owned Work 的完成能力，也保留了“未知不等于旧 writer 已停止”的边界。

### 诊断运行与替代解释

- `container/`：首轮 DSH 原生扩展无法在默认 noexec tmpfs 加载，Mock 请求为 0。增加必要的 `/tmp exec` 并增加真实原生扩展 canary；rootfs 仍只读、caps 仍全部移除。
- `container-native-fix/`：修复后两个 DSH session 成功，坏 alternates 在请求前拒绝。
- `container-faults/`：扩展为 status tool round trip 后，430,000 的试验阈值没有触发“第二次请求拒绝”：103,835 confirmed + 319,523 bound < 429,000 soft ceiling。账本不变量成立，失败的是注入参数未跨阈值；最终用 400,000 / 399,000，使第一请求可准入、第二请求必须拒绝。该诊断保留，没有改写成控制失败或删掉。
- 产品初轮 1 项职责断言失败：把原生 Git 调用移进 Head owner 违反了既有 SR-2 合同。最终保留断言，把原生观察留在既有观察模块，通过可信组合注入事实；修复后 Basis/Head 的 20 项全部通过。没有把初轮结果改写成单批 98/98。
- 初轮测试的原始终端输出逐字节存于 `product-tests.raw.log.gz`；便于 diff 的 `product-tests.log` 仅去掉行尾空白。机器 `product-tests.json` 保持原始失败结果。
- “只是 DSH 启动成功”不是最终判据：另外检查成功 status tool result、Git 对象与产品观察、实际请求数、held reservation、拒绝时操作数和后续 session 状态。
- 这是确定性资格，不是统计效果实验；数值为所记录运行的精确整数，不提供模型收益、真实 tokenizer 误差或跨环境成功率的置信区间。

## 6. 复现

本机 Node 24.14.1（低于 package 声明的 >=24.15.0）、pnpm 11.21.0；Docker 镜像 `palimpsest-pnwf-isolation:local`，DSH 0.2.1-rc.5。镜像实测 digest 记录在每份 qualification 中。本机 PATH 过长会使 cmd 启动的 pnpm 子进程找不到 node；可在当前进程临时缩短 PATH，或直接运行本地 CLI：

```powershell
node node_modules/typescript/lib/tsc.js -b
node scripts/audit/module-architecture.mjs --check
node scripts/audit/module-architecture.mjs --check-public-api
node --test scripts/pnwf/qualification.test.mjs
node scripts/pnwf/qualify_execution.mjs --out=<新的证据目录>
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --fileParallelism=false <handoff.md 中的验收文件>
```

容器复现依赖本机尚存的 PSVR-C/energy recorded sources（见 `prepare_continuation.mjs`），脚本不会下载或伪造这些原始状态。目标目录已存在时拒绝覆盖。轻量 Node 故障测试和产品测试使用新建临时目录，独立于这些旧源数据。没有无休止重跑本地 Windows 全量套件；其历史失败未经本轮逐项排除，不宣称本地 Windows 全量回归全绿。远程 Linux 全量结果单列于 §8。

20 项轻量故障测试已接入 `.github/workflows/ci.yml` 的 unit job，使用纯本地 Mock，无凭证、无 Docker 依赖。发布前本地快照 `verification.json` 不含远程 CI；随后 PR #230 的远程验证和合并记录见 §8，原始快照未改写。

`scripts/lhape/provider_proxy_tcp.mjs` 保留兼容文件名，但旧的仅凭环境凭证启动方式已关闭。其他历史实验脚本也不能借该入口继续无预算转发。新结果以请求准入账本为执行控制真值；旧 `score_continuation.mjs` 只用于历史模型轨迹分析，不用于给 Mock 资格认定产品 primary endpoint。

## 7. 结论边界与下一条件

本轮可建立的结论限定为：被测 Mock 合同下的请求准入、实际隔离容器与 copied Worlds、窄产品权限/当前性规则和确定性治理链。没有建立真实 Provider 的可执行计费上界、付费实验有效性、模型自主行为收益、跨 Host 强静止性或 Git/SQLite 跨系统原子性。

Owner 已于 2026-11-07 明确授权启动付费模型调用，该授权记录于 `handoff.md` §6，不应再次请求同一权限。下一次付费运行仍需**全部**满足：具体 Provider/模型/兼容路径的输入与输出上界获得可执行资格；将新的具体 session/cohort ceiling 写入独立 ledger；同一 actual adapter/container 的零付费故障链通过。旧 5M 不可复用，当前尚无新量化 ledger。当前代码对所有 paid execution 保持关闭，新授权本身也不能覆盖技术资格缺失。

## 8. 远程发布验证（2026-11-07）

[PR #230](https://github.com/orangeofcarl0-sys/palimpsest/pull/230) 的被检验 head 为 `b1554f89ecfa0dacf98e7f52b3ddc677600da051`。三套工作流的 14 个 check job 首次运行全部成功，随后合并到 main，merge SHA 为 `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`。本轮远程检查无失败、无重跑，未修改断言或门槛来取得绿灯。

- [Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132630)：预算故障 20/20；Vitest 423 个文件通过、2 个跳过，4,981 项测试通过、33 项跳过；浏览器 E2E 38/38；构建、architecture 与 public API 通过。这是独立于 §5 本地分批回归的全量结果。
- [R0 gates](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132640)：六个 E gate 和 package-smoke 实际通过。D2、D4、D5 与 D5 reliability 的 job 成功，但 gate 执行因既有外部 DSH 环境条件而跳过；不能称为四项真实 Host 验证通过。
- [Windows Host Boundary](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132623)：R1-H 17 PASS；R1-HR 45 PASS / 2 LIMIT；R1-HC 26 PASS / 1 LIMIT；clean-env 10 PASS，均 0 FAIL。architecture / public API 通过。HR-39b、HR-33、HC-27 的并行 ACTIVE world 原生互读、元数据保密与并行能力限制保持披露，不因 job 成功而消失。

新增 [release-ci.json](../../research-evidence/pnwf-cq-r1/2026-11-07/release-ci.json) 保存 head、merge、job/step 结果与跳过原因。该记录不将后续提交的检查结果归给旧 head，也不覆盖原始本地或历史付费证据。发布与 CI 新增付费模型调用为 0；已记录的 owner 新授权继续有效。
