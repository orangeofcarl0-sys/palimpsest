# Palimpsest 项目历程可视化规划

2026-11-18 · 设计基线 `4e291944fd355adf3ff4fbb864401dfd1edb35d9` · **状态为提案，附可操作的档案原型。**

建议在现有 Project Workspace 里增加「项目历程」。读者先看业务目标、已接受版本、最新交付和当前需要谁判断，再从版本或待办进入协作历史、文件与原始回执。**接手者应从哪份成果继续，凭什么信任它，还有什么需要处理？** 这是首页需要回答的问题。 [打开离线原型](prototype/index.html) · [65 个源码目录及现有界面](SYSTEMS.md) · [dsh-layerfs 等方案的调研](RESEARCH.md)

## 谁要读什么

| 读者与情境 | 第一眼要能回答 | 深入时打开 |
| --- | --- | --- |
| 项目所有者，刚回到项目 | 当前正式接受到哪个版本？最近还有什么交付？是否有人等我？ | 显示完整 SHA 的候选与接受记录、义务和例外。已有权威入口负责正式操作。 |
| 接手的 Principal 或工程师 | 哪些成果仍然适用？为什么之前停在这里？下一步有无待解决条件？ | 原基线、变更文件、保留 blob、决定及采用情况、Episode 的已记录结论。 |
| 调查协作成效的人 | 谁实际执行？贡献改变了哪个决定或文件？比上一轮多花在哪里？ | 按角色与会话展开的调用/结果、拒绝与恢复、版本差异、用量与耗时。 |
| 调试宿主的人 | 状态停在任务、进程、验证、批准还是记账？ | 观察来源与时间、Attempt、job、call、Provider request 及恢复证据。 |

## 四个相互定位的视图

| 视图 | 首屏与读法 | 展开方式 |
| --- | --- | --- |
| **项目总览** | 一句话目标，已接受版本，最近交付，谁待办。显示「观察截至」或档案标签。若有待审，在同一处呈现候选、门禁、未知项和下一步。历史接受和当前待办按时点展示。 | 点版本跳到精确文件和接受凭据。点待办进入该 Attempt 的事件。多项目沿用现有作用域，每次只打开已获访问的项目。 |
| **协作历程** | 按 Episode/Session 分段，段内按实际角色排泳道。重大事件用「发起委派、结算、请求核准、晋升、交付、退出」等动词。失败固定可见。提供同内容的有序列表。 | 选择事件显示调用 ID、结果、原因、恢复及下一步。长段先折叠如「同一对象轮询 8 次」，可还原完整顺序。相邻事件若仅有时间先后，在列表中排序。 |
| **版本与成果** | 分列依据、候选、核准的候选、晋升后 Head、后续交付。Direct 的工件显示 `commit:path`。修订的四类文件义务、保留和作废资产分列。版本默认短显，明细可读全值。 | 点某个 SHA 固定该版本，按路径打开原件和 diff。点「仍沿用」看前后 blob 和当时的义务。点击关系可辨别 Git 亲缘、相同 tree、Promotion 映射或 Episode 引用。 |
| **证据与对比** | 每个结论有记录主体、目标版本、方法与结果。原判、同 SHA 的离线复核和协议测试并列。用量按会话与角色核对。 | 打开原始证据、配对方法和未绑定项。切换运行或变体后保留比较条件。标签与展开使用键盘，完整文本表可替代所有图。 |

首页复用 Workspace 的目标和资产，受控图沿用 Work/MultiGraph，证据深读可进入 Proof Vault。DSH 可在会话输出旁提供同对象的只读定位。CLI/TUI 可输出同一组字段。首版原型展示总览、版本节点、T2/T3 事件详情、两次 T3 用量及历史未知样本，可在本地直接打开。现有产品入口和拟新增入口可对照系统清单。[Workspace](../../../web/src/project_workspace/ProjectWorkspaceView.tsx) · [多图读面](../../../src/application/projection_types.ts) · [原型](prototype/index.html)

## 阅读语法

- **先给结论对应的对象。** 例如「`be05447e` 的 15 项文件义务通过」，比单独写「通过」多给了读者范围。冻结判分、同 SHA 复核、门禁、结算、接受和自然退出各有一行。一个红色结果不会遮住其他事实。无须正式接受的 Direct 交付在该栏显示「不适用」。
- **谁说、谁做、谁接受各自落名。** 角色简称后可查真正的 Session/Attempt/Actor。没有作业观察时显示「本宿主未观察」，作业退出后写「已退出」及原因。模型的文字「已交付」保留为发言，`DELIVER` 看 Episode，文件看 Git，退出看进程。
- **有限的图形词汇。** 默认单列版本卡和按会话分组的事件。展开图时，实线有带来源的明确关系，顺序由位置表示。自述关系可选虚线并标「自述」，冲突与缺失用文字和图标说明。父提交边和核准映射各有文字。颜色以外保留符号、状态词与表格，整张图可用键盘逐项查看。
- **不让回放冒充现场。** 固定旧版本时顶部持续显示「截至 / 回放」，实时追加显示有多少新事件，保留阅读位置。耗时用可比时钟。事件序号只在其所属流内比较。原件按需加载并使用对应版本。带敏感数据的正文遵守原披露范围，默认摘要可读。

## 一个样本要能讲清楚的事情

原型沿实际接受凭据接起 11 月 10 日 gRPC T2 和 11 月 18 日 T3。它们分属两个 cohort。中间八个日历日不能算作模型耗时或人工审批等待。下表四个提交角色用完整值锁定。[T2 接受记录](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/acceptance.json) · [T3 继承的接受凭据](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/acceptance.json)

| 项目版本 | 证据能回答的问题 |
| --- | --- |
| 执行基线 `fbeb8958f4405688b13f37dbdec330157a660ab0` | 正式 Worker 获准基于哪次更正修订，允许动哪四个路径。 |
| 结算候选 `be05447e061a23157ed04e3ee4b27ec7f571e94e` | 回执阶段为 SETTLED，文件义务 15/15，门禁 PASS。冻结评分原样拒绝 `SOFTWARE_PROTO_RPC_CONTRACT`，同 SHA 独立 HTTP/2 7/7、公开测试 18/18。 |
| 晋升后 Head `4639ae44d78e7c1f9f5269876fa333a99bff770f` | 所有者核准候选后产生正式接受记录，候选和晋升结果同 tree。T3 把该 Head 作为 Episode 基线。 |
| T3 交付 `ccb07d36f14e059d537892fed8c4ed4cd4413cf2` | 仅提交 `MIGRATION-REVIEW.md`，为接受 Head 的子提交，回执指向此处的工件。原判 11/12。离线在同一原稿第 26、27 行找到新规则，复核 12/12。此轮记录的正式接受版本仍指 T2 的晋升。 |

调查 T2 时，先看到 Principal 与 Worker 两条执行泳道。Worker 有一次非零退出的 Bash 作业并恢复，Principal 有一次用 Work ID 查原生作业的工具错误。正式 Worker 后来成功结算。`readiness` 的 229→230 明确给出 `ACTIVE / COMPLETED`，235→236 推进 `VERIFYING`，241→242 记录 `WAIT_FOR_OPERATOR`，进程自然退出。随后由 Operator 核准该候选。调查 T3 时只出现 Principal 执行泳道。129→130 记录 `DELIVER`，38.658 秒后进程退出。13 笔请求、25 对工具调用、147.050 秒分别标上单位与来源。[T2 轨迹分析](../../engineering/WORK-REVISION-LIVE-T2.md#结算后-readiness-修复与-grpc-同基线复跑) · [T2 收尾事件](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/readiness-exit.json) · [T3 轨迹比较](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json) · [同 SHA 复核](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/same-sha-audit.json)

另用两个反例检查通用性。Energy 的 `de0b02e1` 变更五个部署成果、保留证书 blob，业务审查关心总价 536,000 美元、14 周交期以及 45/45 项检查。界面必须从「供应商证书仍有效」直接定位到保留项。强原生 gRPC T2 虽产出可用候选，却触发 `T2_CHANGED_CANONICAL_WORLD_BEFORE_APPROVAL`，之后从干净副本按确切 SHA 离线接受。原失败与后续批准应同时可读，正式 Work 的结算栏在原生组显示「不适用」。[Energy 候选](../../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/candidate.json) · [Energy 接受](../../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/acceptance.json) · [强原生检出守卫与离线核准](../../engineering/SOFTWARE-PROJECT-CONTINUITY.md)

## 数据合同与集成边界

第一版从两类输入组装**只读、可重建**的视图。在线输入经 `composition → application → HTTP` 暴露所有者已有读面。离线输入从获准的归档清单显式导入少量字段。两者都带来源与依据，浏览器不直接读数据库、任意宿主路径或会话 home。产品轨迹的四个 owner plane 继续沿用。Git、Provider 与实验评分放在单独的证据引用里，保留各自的语义。[Trajectory 读端口](../../../src/trajectory/ports.ts) · [关系与核验等级](../../../src/trajectory/refs.ts) · [组装示例](../../../src/composition/trajectory.ts)

| 读模型所需事实 | 权威读取及关联键 | 缺失、漂移与隐私处理 |
| --- | --- | --- |
| 项目现况和可见范围 | 能力发现、Workspace 和 Pulse 提供 projectId、ProjectIR 修订、Head 及各所有者 sourceBasis | 首次无项目、可选服务未安装、无访问权、读取失败、旧快照各有呈现。读面权限先于列表计数与摘要。换项目或披露范围使缓存失效。 |
| 工作与协作关系 | 事件链、AttemptReport、执行关联窗口、Journal/Contribution、投影的规范对象引用。保留所有者内序号、摘要与关系强度 | 同名、同路径和相近时间不建因果边。只收到消息、尚未采纳时停在「已收到」。跨页固定 basis vector 与 cursor，漂移标注并重新观察。 |
| 文件、结算与接受 | `revision.readReceipt` 的 Attempt、basis、candidate、receiptId 与 phase，以及 Promotion 事件的 source / expected / resulting Head 和 Git 的 commit、tree、path、blob | PREVIEW 可供查看，SETTLED 从持久报告读取。仅匹配核准凭据和既有 Promotion 才展示正式接受。原始 Git 对象缺失、HEAD 漂移、同名文件变更均显式报出。 |
| 会话行为 | 读取 DSH/宿主已有的可见动作和进程终态。按项目、cohort、session、角色、流摘要及 call ID 配对到结果或作业终态 | 挂起调用、工具错误、领域拒绝、作业非零和宿主失败分别计数。无调用 ID 且无法按既有归因规则确定时标为未配对。主界面仅展示可观察动作和结果。 |
| 请求与用量 | 归因脚本优先匹配响应 ID，缺响应 ID 时仅使用可唯一绑定的用量四元组。终态账本按 cohort 和请求关联。按角色加总 fresh、cache read、cache creation、output | 歧义、缺终态显示 UNKNOWN 并列出已确认小计。402/400 属于各自 cohort，不折算为零、不摊入 T3。分别记录会话墙钟、工具耗时、人工等待，重叠区间不相加。 |
| 内容验收 | 独立判分工件绑定场景、协议/判分器版本、commit、blob/摘要与原文位置。人工或离线复核另有方法和时间 | 同一提交可同时保有多个结论。跨版本、原生和 Palimpsest 的制度差异显示为不适用。权限过滤后缺失的正文展示披露状态。 |

首个 API 改动应在现有 `/api/application/surfaces` 协商能力，通过窄只读适配器暴露历程摘要与按引用展开。现有 `/api/project/workspace`、`/api/project/history` 和五种图投影可直接复用。新增字段、路由名和分页协议在第一阶段用真实归档敲定。本提案没有公布新 SDK 合同。缓存键至少包括项目、授权视图、投影版本、所有者依据和页位置。缓存只存过滤后的投影。详情返回未解析/冲突来源，刷新时不透传模型提示、凭据或未披露的原文。读取任何页均不触发验证、结算、晋升或模型请求。[现有适配器矩阵](../../engineering/architecture/APPLICATION-ADAPTER-MATRIX.md) · [依据向量](../../../src/trajectory/contract.ts) · [产品修订端口](../../../src/product.ts) · [逐请求归因](../../../scripts/psvr/session_attribution.mjs)

## 实施顺序与验收

| 阶段 | 纵向交付 | 合入前可证伪的条件 |
| --- | --- | --- |
| 1 · 离线阅读 | 在现有 Web 的 Workspace 下接入一条归档读面，以本原型为任务样本。提供项目总览、可定位的版本链、事件列表和来源链接。 | 固定两份 gRPC 归档，离线复算四个 SHA、15 项义务、229→230 / 235→236 / 241→242 与 T3 129→130。独立展示 11/12、12/12、两次 UNKNOWN。不同 cohort、角色和重复导入均可验证。 |
| 2 · 在线接续 | 加能力协商和只读详情，用普通 DSH 的 gRPC 与 Energy Mock 及新宿主重启验证同一份事实。沿用当前 Work/MultiGraph/Proof 深读入口。 | 读者可查证 Energy 五项变化、未变证书、完整核准 SHA。错基线、错批准 SHA、读取漂移、回执 PREVIEW、未观察执行、未安装及跨项目访问均有独立回归。验证读页前后权威账本无新增效果。 |
| 3 · 协作调查与运行比较 | 增加按角色展开的调用、修复前后或原生对照、证据链上的分支发现和采纳链接。按需提供只读 DSH 定位。 | 强原生守卫失败与后续核准同屏。两个不同原因的 NOT_READY、独立的失败作业、恢复和重复轮询计数可复算。缺失引用不会生成采纳边，歧义用量不能进入确认合计。 |

**可读性验收先做对照。** 招募 6 名读者，覆盖所有者、接手工程师和运行调查者。用现有 Workspace/报告作基线，把同难度两套问题交叉分配，轮换界面顺序，记录每题首答、耗时、走错位置与援助。核心题包括找到下一会话应从哪份 SHA 开始，指出是谁核准，解释为何已交付却仍是 11/12，找出未修改的 Energy 证书，以及分辨谁的用量未知。目标为各核心题至少 5/6 人独立答对、找到接受版本的中位时间 ≤30 秒、两次操作内看到该版本原始证据。把候选误作接受、把 UNKNOWN 读成 0、把离线复核读成原判通过，均需改版后重测。这些是拟定门槛，尚无人因实测。

**工程验收配合真实规模。** 桌面和 390px 窄屏、键盘、可见焦点、屏幕阅读器的事件列表、缩放和无色图例均要覆盖。用同一归档重复导入核对顺序和摘要。另做 1,000 个事件、50 个分支的合成压力输入，保留所有拒绝与来源，可用分页或虚拟列表。记录参考机器与浏览器，建议首屏本地 p95 ≤2 秒、详情切换 p95 ≤200 毫秒。与人因指标分开验收。后续代码变更接入现有 Workspace/MultiGraph/Proof E2E 和轨迹权限/页完整性回归。首版可完全使用既有归档与 Mock。[Workspace E2E](../../../e2e/project-workspace.spec.ts) · [多图 E2E](../../../e2e/multigraph.spec.ts) · [Proof E2E](../../../e2e/proof-vault.spec.ts) · [分页完整性](../../../test/trajectory_h1_page_integrity.test.ts) · [来源披露](../../../test/trajectory_h0_source_privacy.test.ts)

## 本次已核对的范围

逐项目录核对覆盖 65/65。Chromium 在 1400px 桌面和 390px 窄屏打开原型，核对了 12 个可查看记录、11 个不同的原始来源链接、8 项两轮指标、文件义务展开、键盘定位和断网下的本地文件操作。界面中的候选、接受、交付 SHA 和回执 ID 均与归档一致。原型为该案例的静态资料摘录，原始来源链接指向同一仓库中的文件。[档案原型](prototype/index.html) · [比较原据](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json)

当前主线的 TypeScript 与 Web 构建通过，架构与公共 API 检查通过。Workspace、MultiGraph、Proof Vault 三组既有浏览器 E2E 共 8/8 通过。它们验证了准备复用的现有入口。新增在线读面、历史大样本负载和真实读者的完成时间属于后续验收。
