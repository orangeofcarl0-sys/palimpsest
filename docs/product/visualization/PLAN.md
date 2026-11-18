# Palimpsest 多智能体协作可视化规划

2026-11-18 · 产品盘点基线 `4e291944fd355adf3ff4fbb864401dfd1edb35d9` · **会话内工作视图为设计提案。已有可运行样例为 gRPC 历史回放。**

用户刚在 DSH 的 Chat 交代完任务，下一刻就可能想看「谁接了哪一块，另一块还在等谁」。建议在**同一会话的标签行**提供「协作」和「成果」，分别对应 dsh-layerfs 的 Work 和 History。进入其中一页时，项目、会话和返回对话的位置都已确定。跨会话查成果从项目侧栏进入。原有七幕回放适合向后来人解释一次已结束的工作，继续作为历史样本使用。[位置与形式的上游依据](RESEARCH.md#工作视图在宿主里的位置) · [65 个源码目录及现有界面](SYSTEMS.md) · [gRPC 历史样例](prototype/index.html)

## 工作视图放在哪里

| 人此刻在做什么 | 宿主中的位置 | 这个位置负责什么 |
| --- | --- | --- |
| 新建或返回对话 | 新会话选项区显示项目选择，已有会话标题旁显示绑定项目 | 在发消息前确认工作归属。项目未绑定或不可见时显示相应状态。 |
| 在 Chat 交代任务，偶尔看进度 | 在同一标签行切到「协作」 | 中央区域用于查看本会话里并行的工作。只有确有事项需要当前用户判断时，标签旁才给出待办提示。切回 Chat 保有草稿和阅读位置。 |
| 一项工作已有结果，想看具体改动 | 同一标签行的「成果」，从选中的工作直接定位 | 查看该对象的来源、差异、采用情况与原件。继承的来源可早于当前会话，标出其所属会话。打开某次调用可转到 Trajectory 的对应记录，返回时仍选中原对象。 |
| 隔天来接项目，尚未打开任何会话 | DSH 项目侧栏或已有 Project Workspace | 跨会话查当前接受的版本、开放问题、可沿用的成果。点一次能回到产生它的会话，也能以有权使用的版本开始新会话。 |

dsh-layerfs 把 Work 和 History 注册到 `conversation.view`，标题、空白会话的项目选择和全局侧栏各用不同的宿主位置。Palimpsest 的实验版本 DSH `0.2.1-rc.5` 也声明了按 Session 呈现的 `conversation.view` 和可用时按 `callId` 打开检查器的 `inspectCall`。Palimpsest 当前发货的 bundle 注册 startup、tools、runner，独立 Web 已有 Project Workspace。新增会话视图需要 DSH Web 的客户端插件，还要把实际 Session 绑定到获准读取的项目和工作。槽位已核对到源码，安装、绑定和切页后的行为留给第一轮 Mock 验证。[LayerFS 的注册位置](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/client/src/client/index.ts) · [目标 DSH 的槽位契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/client/ui-conversation/src/client/contract/slots.ts) · [现有宿主](../../../host/dsh/cordis.patch.yml) · [现有 Web](../../../web/src/App.tsx)

## 屏幕上什么保持原位

**给工作对象一个位置，让执行者出现在对象旁。** 用户交待的是「修订 Fleet 默认上限」「核验供应商证书」或「查清一条反例」。以这些可辨认的事项命名工作行。每行显示当前执行者、最近一次被观察到的动作、产出的东西。如果在等，写出等谁、等什么。同一人先后做两项工作会出现在两处。两人先后处理同一件事，行保留，执行者和动作更新，前一位的贡献留在详情。

**「协作」让并行和等待同时可见。** 宽屏一侧给同目标下的各项工作留位置，中央给读者看选中对象本身。写代码时是文件与局部 diff，跑测试时是刚返回的测试行，做采购时是发生变化的报价行，查资料时是问题与引用原文。执行者署在相应改动旁。测试失败就在该行展开原因。等待时，旁边列出需要谁处理哪件东西。单人直接交付时只有对应事项。多人同时工作时，各项工作在一旁显示新变化，主视区保留用户的选择。几十项按目标折叠，待判断、失败及恢复仍可定位。窄屏点开事项进入详情，返回同一行。[任务与 Agent 的区分](../PALIMPSEST-INTERACTION-MODEL.md#2-the-core-invariant)

**「成果」沿着实际对象追来路。** 代码可有基线、候选和正式接受版本。调查可有问题、两份相互矛盾的发现和一个尚未作出的决定。图中的连接都带动词，如「从此版本派生」「交给评审」「在决定中引用」。不同层次的对象可点开看原件。顺序相邻的调用只出现在时间记录中。重试挂在原事项下，各自保留尝试和结果。跨会话的读回连到确切的接受记录。有多个仍在讨论的方案时，让这些方案并列。[关系依据](../../../src/trajectory/refs.ts) · [投递、读取与行动](../../../src/project_handoff/lifecycle.ts) · [贡献及采用记录](../../../src/project_contribution/types.ts)

**把交接画到接手的东西上。** 甲写出一份候选，乙审这份候选，丙随后使用核准版，三人的名字应出现在各自处理的对象和动作旁。若甲、乙只交换了消息，能查到的是发送、送达，以及有记录时的读取。第三人碰巧改了同名文件，界面需要额外的采用或版本引用才能把两件事连起来。系统结算和人的核准分开署名。长时间没新消息时显示最后观察时间，只有能据以确认阻塞的记录才写「在等谁」。[执行归属](../../../src/execution_association/contract.ts) · [交接状态](../../../src/project_handoff/lifecycle.ts)

**动效只说明刚发生的变化。** 新提交短暂点亮该工作行的候选，接手时在接收者旁出现同一对象的引用，核准后再移动项目的接受标记。停止动画仍能从文字、位置和形状读出同样的事实。点「跟随」可追最新活动，手动选中后固定视点，新事件以增量计数出现。断开连接时保留最后一次观察的时点。读档时标明「历史」，停在当时已知的事实。失败在对应工作处留下原因，恢复后并列显示后来成功的尝试。[上游 Work 的交互示例](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/TUTORIAL.md#work-now)

### 一个时点的布局

下面把真实 gRPC T2 固定在 Principal 已登记等待、所有者尚未核准的一刻。这是拟议的 DSH 布局。工作列表保留整件事，右侧内容随选择改变。

```text
DSH 会话   Fleet 默认上限修订                         项目  gRPC 迁移
Chat    Trajectory    [协作]    成果

本会话的工作                 service/grpc_server.js  ·  执行助手的候选 be05447e
▸ Fleet 默认上限修订          + const DEFAULT_STREAM_LIMIT = 3;
  等项目所有者核准            + const limit = request.limit === 0 ? DEFAULT_STREAM_LIMIT : request.limit;

                            执行助手已交回候选 · 修订负责人已登记等待
                            下一位  项目所有者       审阅候选
```

上图摘了候选与基线 `fbeb8958` 比较所得的两条新增行。实际读面按各自的 hunk 标行号、展开上下文。同一条工作在调用 229→230 时应显示「候选已结算，等负责人推进验证」，在 241→242 后才出现上述待办。点击「审阅候选」打开绑定该候选的详情，有权限的所有者由此进入既有核准流程。只有后来匹配的核准与 Promotion 落账，项目「成果」里才出现接受版本 `4639ae44`。八天后的新会话取用这个版本。这个例子检验界面能否让人判断**眼下轮到谁**。[归档 Git 对象](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/candidate-and-accepted.bundle) · [三次状态观察](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/readiness-exit.json) · [正式接受](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/acceptance.json) · [新会话的接受依据](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/acceptance.json)

### 换一种任务是否还能读

| 情境 | 「协作」里看什么 | 「成果」里留下什么 |
| --- | --- | --- |
| gRPC T3，单个 Principal 直接交付 | 一个实际执行者处理一份评审摘要 | 可点开的评审原稿、它引用的接受版本、交付回执。冻结判分与同一提交的复核分别在详情出现。[直接交付样本](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/result.json) |
| Energy T2，修订部署决策包 | 修改五份成果的执行者与待核准对象。选报价可直接看 Harbor Flats 的行小计从 217,000 美元增至 268,000 美元 | 总价从 485,000 美元增至 536,000 美元。选证书看沿用依据。证书有自己的位置，即使这一轮没有人重写它。[归档报价变更](../../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/candidate-and-accepted.bundle) · [文件回执](../../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/candidate.json) |
| 无代码的并行调查，假设示例 | 调查者甲找到支持证据，乙找到反例，两项都挂在同一个问题下。负责人可继续查证 | 两条发现各有来源。负责人采纳、拒绝或要求补证时，把决定连到具体发现。没有决定时显示「尚待判断」。[协作语义](../../../src/project_contribution/types.ts) |

## 谁要读什么

| 读者与情境 | 第一眼要能回答 | 深入时打开 |
| --- | --- | --- |
| 项目所有者，刚回到项目 | 当前正式接受到哪个版本？最近还有什么交付？是否有人等我？ | 显示完整 SHA 的候选与接受记录、义务和例外。已有权威入口负责正式操作。 |
| 接手的 Principal 或工程师 | 哪些成果仍然适用？为什么之前停在这里？下一步有无待解决条件？ | 原基线、变更文件、保留 blob、决定及采用情况、Episode 的已记录结论。 |
| 调查协作成效的人 | 谁实际执行？贡献改变了哪个决定或文件？比上一轮多花在哪里？ | 按角色与会话展开的调用/结果、拒绝与恢复、版本差异、用量与耗时。 |
| 调试宿主的人 | 状态停在任务、进程、验证、批准还是记账？ | 观察来源与时间、Attempt、job、call、Provider request 及恢复证据。 |

## 各视图复用哪些产品读面

| 视图 | 首屏与读法 | 展开方式 |
| --- | --- | --- |
| **项目总览** | 一句话目标，已接受版本，最近交付，谁待办。显示「观察截至」或档案标签。若有待审，在同一处呈现候选、门禁、未知项和下一步。历史接受和当前待办按时点展示。 | 点版本跳到精确文件和接受凭据。点待办进入该 Attempt 的事件。多项目沿用现有作用域，每次只打开已获访问的项目。 |
| **会话协作** | Work、执行关联和宿主观察提供事项、实际执行者和当前动作。原生子任务保留原生身份，正式 Worker 显示其 Attempt。Explore 或 Ask 显示实际登记的问题、发现或答复。 | 从选中事项打开局部事件、拒绝与恢复。可定位的调用返回本会话的 Trajectory。 |
| **版本与成果** | 分列依据、候选、核准的候选、晋升后 Head、后续交付。Direct 的工件显示 `commit:path`。修订的四类文件义务、保留和作废资产分列。版本默认短显，明细可读全值。 | 点某个 SHA 固定该版本，按路径打开原件和 diff。点「仍沿用」看前后 blob 和当时的义务。点击关系可辨别 Git 亲缘、相同 tree、Promotion 映射或 Episode 引用。 |
| **证据与对比** | 每个结论有记录主体、目标版本、方法与结果。原判、同 SHA 的离线复核和协议测试并列。用量按会话与角色核对。 | 打开原始证据、配对方法和未绑定项。切换运行或变体后保留比较条件。标签与展开使用键盘，完整文本表可替代所有图。 |

项目入口复用 Workspace 的目标和资产，受控图沿用 Work/MultiGraph，证据深读可进入 Proof Vault。DSH 会话页和项目页按相同的对象引用定位，分别保留本次活动和跨会话的阅读范围。CLI/TUI 可用有序行呈现同一组状态。[Workspace](../../../web/src/project_workspace/ProjectWorkspaceView.tsx) · [多图读面](../../../src/application/projection_types.ts)

### 一份工作如何交到下一位手里

仓库中的离线样例将七次有据可查的交接放在同一份目录。修订负责人把任务交给执行助手，助手将候选交回结算服务，负责人主动读取结算回执。随后负责人登记待审，所有者核准候选，接受版本进入项目档案。11 月 18 日的新会话从档案读取接受版本，最后把评审原稿存回项目。点击任一步，可看到交出方、接收方、两者之间的具体成果，以及支撑这一叙述的原件。[历史回放入口](prototype/index.html) · [工作与结算](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/result.json) · [核准与晋升](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/acceptance.json) · [接续与交付](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/result.json)

人、AI、系统和项目档案各有文字身份。查询回执和跨会话读取注明读取方与来源。登记等待画虚线，成果停在待审方之前，下一步才出现人的核准。回放由读者启动，可逐步选读、连续播放或暂停。动画速度只控制阅读节奏，真实耗时在运行对比里核对。开启系统「减少动态效果」时，以静态方向线、角色标签与成果名呈现相同信息。

## 阅读语法

- **先给结论对应的对象。** 例如「`be05447e` 的 15 项文件义务通过」，比单独写「通过」多给了读者范围。冻结判分、同 SHA 复核、门禁、结算、接受和自然退出各有一行。一个红色结果不会遮住其他事实。无须正式接受的 Direct 交付在该栏显示「不适用」。
- **谁说、谁做、谁接受各自落名。** 角色简称后可查真正的 Session/Attempt/Actor。没有作业观察时显示「本宿主未观察」，作业退出后写「已退出」及原因。模型的文字「已交付」保留为发言，`DELIVER` 看 Episode，文件看 Git，退出看进程。
- **有限的图形词汇。** 交接回放用有方向的线连接角色，标出交接物。虚线加「待审方」表达尚待处理的状态。事件凭据页另有版本卡和按会话分组的事件。自述、来源缺失和冲突逐条标明，未核实的关系不生成交接动画。父提交边和核准映射各有文字。图示有键盘可读的文字对应。
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

先用普通 DSH Web 验证原生挂载点与授权作用域。由宿主解析当前 Session 及已确证的子会话关联，再按项目权限获取事实。可复用 `/api/application/surfaces`、`/api/project/workspace`、`/api/project/history` 和已有图投影，缺少的只读字段按首轮验证结果补齐。缓存键至少包括项目、会话或项目级作用域、授权视图、投影版本、所有者依据和页位置。缓存只存过滤后的投影。详情返回未解析或冲突的来源，保留原披露范围。读取、筛选和回放都可用 Mock 验证权威账本及模型调用计数保持原值。[现有适配器矩阵](../../engineering/architecture/APPLICATION-ADAPTER-MATRIX.md) · [执行关联](../../../src/execution_association/contract.ts) · [依据向量](../../../src/trajectory/contract.ts) · [产品修订端口](../../../src/product.ts)

## 实施顺序与验收

| 阶段 | 纵向交付 | 合入前可证伪的条件 |
| --- | --- | --- |
| 1 · 会话内看工作 | 在普通 DSH Web 安装客户端，零付费 Mock 从 Chat 切到「协作」「成果」，同场注入两项并行工作、一次失败和恢复。用 gRPC 归档固定几个真实时点与期望状态。 | 新建、未绑定、切换两个会话、回到原草稿及原选中对象都可操作。固定 A 时，B 的更新可见且不抢焦点。229→230 和 241→242 显示不同的待办人。跨项目和未归属的活动不串入当前会话。 |
| 2 · 项目接续 | 在项目侧栏和 Workspace 打开同一成果，脱离原会话、重启宿主，再由新会话读回。用 gRPC、Energy 和一个只产生发现的 Mock 检验通用性。 | 可查证四个 gRPC SHA、15 项义务、Energy 五处修改与沿用的证书。未采纳的发现保留在问题下。错基线、错核准、来源漂移、PREVIEW、权限不足各有明确读面。查看原件不改变权威记录。 |
| 3 · 调查和复盘 | 从选中的成果深入轨迹、历史回放、用量和运行比较。使用原有 Work/MultiGraph/Proof 查看专门证据。 | T3 129→130、11/12 冻结判分、同 SHA 复核与两条 UNKNOWN 分别可查。两个不同原因的 NOT_READY、失败作业、恢复和折叠的轮询均可还原。 |

**可读性验收先做对照。** 招募 6 名读者，覆盖所有者、接手工程师和运行调查者。用现有 Chat/Workspace 和档案回放作参照，轮换同难度题的界面与顺序，记录首答、耗时、误入位置和援助。第一题在工作进行到一半才让人进会话，问「谁在做什么，什么卡住，轮到我了吗」。第二题在读 A 时让 B 更新，看能否发现变化并继续读 A。第三题关闭旧会话，让人找到新会话应接的版本和实际采用的依据。目标为每题至少 5/6 人独立答对、找到接受版本的中位时间 ≤30 秒、两次操作内看到依据。把等待误作已批准、把收到反例误作采纳，均需改版后重测。这些是拟定门槛，尚无人因实测。

**工程验收配合真实规模。** 桌面和 390px 窄屏、键盘、可见焦点、屏幕阅读器的事件列表、缩放和无色图例均要覆盖。用同一归档重复导入核对顺序和摘要。另做 1,000 个事件、50 个分支的合成压力输入，保留所有拒绝与来源，可用分页或虚拟列表。记录参考机器与浏览器，建议首屏本地 p95 ≤2 秒、详情切换 p95 ≤200 毫秒。与人因指标分开验收。后续代码变更接入现有 Workspace/MultiGraph/Proof E2E 和轨迹权限/页完整性回归。首版可完全使用既有归档与 Mock。[Workspace E2E](../../../e2e/project-workspace.spec.ts) · [多图 E2E](../../../e2e/multigraph.spec.ts) · [Proof E2E](../../../e2e/proof-vault.spec.ts) · [分页完整性](../../../test/trajectory_h1_page_integrity.test.ts) · [来源披露](../../../test/trajectory_h0_source_privacy.test.ts)

## 本次已核对的范围

逐项目录核对覆盖 65/65。Chromium 断网打开本地原型，逐步检查了七次交接的双方和交接物。六次转交中，上一幕的接收者都留在原位。七步均可打开凭据并返回同一步。另查了连续回放、暂停、从头播放和系统减少动态效果。在 320、390、768、1400 像素宽度逐步切换，控制按钮的位置稳定，页面可用键盘操作。[档案原型](prototype/index.html)

凭据核对覆盖 12 个可查看记录、11 个不同的原始来源链接、8 项两轮指标和文件义务展开。界面中的候选、接受、交付 SHA 和回执 ID 均与归档一致。这个案例使用静态资料摘录，链接可打开同一仓库中的原件。[结算与候选](../../../research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/candidate.json) · [比较原据](../../../research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json)

当前主线的 TypeScript 与 Web 构建通过，架构与公共 API 检查通过。Workspace、MultiGraph、Proof Vault 三组既有浏览器 E2E 共 8/8 通过。它们验证了准备复用的现有入口。新增在线读面、历史大样本负载和真实读者的完成时间属于后续验收。
