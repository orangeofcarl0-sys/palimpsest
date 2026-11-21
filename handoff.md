# HANDOFF — Palimpsest / palimpsest-sr1

> 给接手本项目的 agent。**先读完本文件，再动代码。**
> 本文件是活文档：每次重要更改（合并 PR、修改权限/结算语义、新增证据、改变测试基线、消耗或新增付费预算、变更 DSH 版本）后，必须同步更新本文件并在同一次提交中提交。

---

## 0. 30 秒版本

- 拒绝回执接续从 `c7509663` 落地。两份原现场失败回执绑定 `91b5bc0c`，由原维护位置一次投递。7 条普通 DSH Mock、29 笔、实际付费 0，验证了重复投递、恢复、独立 2/2 和 Mock 接班。真实用 `07ab5aad` 从被拒候选启动，第 1 笔 `UNKNOWN / UPSTREAM_UNCERTAIN` 停止，桥接另报 `EPIPE`。Git 未推进，原运行位阻断后续准入。原 64 笔、43 笔和 0/2 分别保留。[接续报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#验收拒绝回执触发同项目接续)

- 原稿接续从 `1c0807c3` 落地。最终 7 条普通 DSH Mock、29 笔模拟，实际付费 0，验证了前代 16 个项目库、原稿、重复唤醒、独立验收和 Mock 接班。真实用 `07ab5aad` 新会话接续，43/256 笔，提交 `91b5bc0c` 并记录 `DELIVER` 后自然退出。相对原稿只有一处注释差异。手动 readiness 6/6，两份原现场重放仍缺新 `DELIVER`，冻结门禁未过，未进入核准或启动下一张真实工单。原 64 笔原判和账本未变。[续作报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#从请求上限停点接续原稿)

- 自主维护与接班试点从 `198d6293` 落地。9 条普通 DSH Mock、35 笔全对账且零付费，验证封存唤醒、互斥、状态读回、安装切换和失败恢复。用 `07ab5aad` 实跑仅给维护目标和原档，Palimpsest 自行复现、写回归并修了手动 readiness。64 笔触限时仍未提交、无 `DELIVER`、未自然退出。原稿离线 6/6，37 项定向测试通过，但两份原现场重放仍缺新 `DELIVER`。没有待核准的真实候选和后继真实会话，里程碑二保持开放。[首轮报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md)

- 冷交接收尾修复从主线 `07ab5aad` 开始。原两组提交后直接回复，未调用 Work `readiness` 或 `conclude`。普通 DSH 一次性会话会在干净的新直接提交且无交付阻塞时提示一次，Work `readiness` 对同类无计划现场提示模型判断并记录 `DELIVER`。真实复跑两组均在第 5 笔主动取得并采纳同一独立冷重放回执，第 12 笔记录绑定候选的 `DELIVER`，第 13 笔自然退出。内容冻结判分为 6/7、5/7，历史 7/7、5/7 和缺结论保留。本轮 26 笔全对账，里程碑二继续开放。[复跑报告](docs/engineering/CONTINUITY-REUSE-METHOD.md#提交后的收尾引导与同基线复跑)

- 两轮受控自改进的实现、路线图、Mock、真实轨迹及评审原稿已随 [PR #293](https://github.com/orangeofcarl0-sys/palimpsest/pull/293) 合入主线 `1b476032`。首轮 CI 发现部署配置引入 Procedure 实现，已改为只校验引用字段。修复后的送审 `008c55b3` 通过 16/16 项检查，合入后三个提交的文件树逐一一致。两份离线复算与原归档逐字节一致，普通 DSH 与打包 SDK 补验通过，新增付费请求 0。冷交接仍为 7/7 与 5/7，两组缺新评审 `DELIVER`，里程碑二继续开放。[发布检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/293/checks) · [定向测试方法](docs/engineering/PALIMPSEST-FOCUSED-METHOD.md) · [冷交接对照](docs/engineering/CONTINUITY-REUSE-METHOD.md)

- 自改进回到里程碑二。两条真实普通 DSH 会话从同一 gRPC 冷交接评审基线 `1444de6c` 把 HOLD 改为 READY。无提示组第 5 笔主动取同一接受 SHA 的独立冷重放回执并直接查档，在提交中引用回执，冻结 7/7。带方法组第 5 笔自行查档，全程未索取回执，冻结 5/7。两组只改一份评审并自然退出，原工件、接受事件及旧 Episode `UNKNOWN` 保留，两组都缺新评审的 `DELIVER`。27 笔全对账，新用量 UNKNOWN 为零。里程碑二继续开放。[路线图](docs/product/PROJECT-ROADMAP.md#自改进回到真实项目) · [原稿与复算](docs/engineering/CONTINUITY-REUSE-METHOD.md)

- 首轮受控自改进从 `8e1e3098` 完成。对四条原始轨迹按调用 ID 重算后，宿主核准只读依赖环境下的定向 Vitest Procedure `prc-1966931f7a21b77663b7cff1c4129b76@0`，摘要 `f76d9724545e81b6867f9f9b155f56d485a363a8ab07cd8146bf3d9879ad014e`。普通 DSH 在首条业务消息前选择，打包 `/product` 消费者通过同一读取入口取到 argv 并执行 9/9。撤回、错摘要、清单变化和不适用环境均拒绝提供。两组 Mock 通过，8 笔模拟、0 付费。[核准、反例和复算入口](docs/engineering/PALIMPSEST-FOCUSED-METHOD.md)

- 新 `DELIVER` 出处提示维护工单用同一主线、两个全新普通 DSH 会话做有无方法对照。带方法组第 18 笔按核准命令首次运行即通过，启动失败 0 次。无提示组遇到 `.local`、`.vite-temp` 两次失败，改用可写依赖入口，也在第 18 笔首次通过。首次通过用量为 674,722 对 888,913 tokens，耗时为 126.934 对 97.686 秒。完整会话 33 对 50 笔，1,616,104 对 3,823,791 tokens，均独立验收 5/5、提交、记录 `DELIVER` 并自然退出。83 笔全部对账，新 `UNKNOWN` 为零。两个候选及历史原判均保存。[真实轨迹与对比](docs/engineering/PALIMPSEST-FOCUSED-METHOD.md#真实配对轨迹)

- 自维护运行脚本、两轮真实轨迹、核准记录与对比报告已随 [PR #291](https://github.com/orangeofcarl0-sys/palimpsest/pull/291) 合入主线 `cb7effd4`。送审 `494973cc` 的 16 项检查全部通过，合入文件树与送审版本一致。发布时离线复算四条轨迹并核对账本，新增付费请求 0。[发布检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/291/checks) · [报告与复算](docs/engineering/PALIMPSEST-SELF-MAINTENANCE.md)

- 自维护真实试点从 `02a5160c` 开始。Palimpsest 和强原生 DSH 均由 Principal 自己复现 Vitest 只读故障并写出定向入口。Palimpsest 18/18 笔已结算，独立复验 20/20、失败断言退出 1，记录 `DELIVER` 后自然退出。所有者核准完整 SHA `072ff2e6defdb4ff3b1f08be340bd3c931ab7ae9`。强原生第 12 笔 240 秒超时，保留未提交原稿、非自然退出及 `UNKNOWN`，11 笔已确认 233,067 tokens。所有者另外批准独立封存该笔并用新 cohort 对照旧版与接受版，第二张工单聚焦无任务直接交付的 readiness。[自维护报告](docs/engineering/PALIMPSEST-SELF-MAINTENANCE.md#真实自维护配对) · [独立 UNKNOWN](research-evidence/pnwf-software/2026-11-21/self-maintenance/live/prior-unknown-F-12.json)

- 新会话中旧版 `02a5160c` 与接受版 `072ff2e6` 都提交了无任务直接交付的 readiness 修复，独立判据均 6/6。旧版 52 笔、5,012,151 tokens、635.731 秒，自然退出但缺 `DELIVER`。接受版 35 笔、2,195,469 tokens、489.568 秒，记录 `DELIVER` 后自然退出。两边各有一次测试启动重试。接受版从 `pnpm exec` 失败恢复到直接调用 Vitest，未调用新增 `test:focused`，因此总用量差额无法归因到该入口。两组新账本全部结算，候选留在隔离成果。[复用对照](docs/engineering/PALIMPSEST-SELF-MAINTENANCE.md#复用与用量对照) · [机器对比](research-evidence/pnwf-software/2026-11-21/self-maintenance/followup/comparison.json)

- 重启交接追溯修复与真实对照已合入主线 `ec80486a`。两条真实会话均触及 64 笔上限，未提交、未自然退出，各由一个 Principal 完成。离线复验保留 Palimpsest 11/15、强原生 9/15。128 笔全部结算，新增 UNKNOWN 为零。强原生桥接 `EPIPE` 和离线对账均留档。[PR #289](https://github.com/orangeofcarl0-sys/palimpsest/pull/289) · [轨迹、原稿与复验](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#真实模型配对)

- 已在维护分支修复重启后的交接追溯。同一 gRPC 档案可按旧 Episode ID 读取原结论、工件与重开原因，并从 Work 追到当前核准。发布核验仍可查询，真正待办继续出现在 Pulse 和 readiness。历史轨迹保留旧 `UNKNOWN`。[工单与复验](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md)

- R4 拆分对照已合入主线 `2c29e90c`。四条真实会话均签发、10/10、自然退出。说明组两位 Principal 均在求证原表后自行识别 B 车 01:30 少排 20 kW。提示组两条轨迹都是预检先点名。三格在修订表复测前已写出 B GO。提示组强原生在收到 130 kWh 的修订表实测后首次写出 GO。135 笔全数结算。[PR #287](https://github.com/orangeofcarl0-sys/palimpsest/pull/287) · [逐次求证及原稿](docs/engineering/DEPOT-R4-GUIDANCE.md)

- R4 窗口利用率修复已合入主线 `55eeaa3b`。两组真实会话均通过签发，业务评分各 10/10，并自然退出。P 记录 DELIVER。两位 Principal 都主动预检，签发预检首先明确指出 B 车 01:30 少排 20 kW。两组均改用 50/70 kW，并在收到修订表实测回执前提交 B GO，复核确认了已有决定。两份旧 6/10、更早的 2/10 与第 7 笔 UNKNOWN 均保留。[PR #285](https://github.com/orangeofcarl0-sys/palimpsest/pull/285) · [调用顺序与用量](docs/engineering/DEPOT-R4-WINDOW.md)

- R4 签发契约已合入主线 `b8a7d27b`。两组 Mock 均为 10/10。真实 Palimpsest 和强原生 DSH 均通过签发并自然退出，独立业务评分各 6/10。两组均选 B 车 50/50 kW，三次联系维护者仍未用足最后一格。R7 在 50/70 的修订实测中取得改变放行依据的 6 kWh 反例。旧 R4-P 的 2/10 和第 7 笔 UNKNOWN 继续封存。[PR #283](https://github.com/orangeofcarl0-sys/palimpsest/pull/283) · [逐次复核与原稿](docs/engineering/DEPOT-R4-RELEASE-POWER.md)

- 任务选路试点、夜班复核和 R7 签发契约已随 [PR #281](https://github.com/orangeofcarl0-sys/palimpsest/pull/281) 合入主线 `f1c1424a`。送审的 16 项检查全部通过。历史 UNKNOWN 和两组 R7 的 6/10 原判保留，本轮 R7 Palimpsest 与强原生 DSH 均为 10/10。发布和复算新增付费请求 0。[两轮逐组对比](research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/comparison.json)

- R7 签发按各时段的请求功率判定，明确给出限幅后的实际 kW 和超限幅度。两份旧 6/10 原稿均被拒。新 P/F 各自遇到 01:00 超限 20 kW 的拒绝，提交 B 车 50/70 kW，实测 B 缺 6 kWh，签发 A GO、B HOLD，均为 10/10 并自然退出。P 记录 DELIVER。60 笔全部结算。[拒绝、交付与复核成本](docs/engineering/DEPOT-R7-RELEASE-POWER.md)

- 夜班真实矩阵已运行四格。原 R4-P 在第 7 笔超时，保留 UNKNOWN、2/10。当前账号工具探针 339 tokens 对账通过后，余下三格自然退出、134 笔全部结算。R4 强原生 10/10。R7 两组都主动取得 B 车少 6 kWh 的反例，随后提交了依赖限幅的 70/70 kW 设定，因超过请求上限均为 6/10。P 记录 DELIVER。[轨迹、独立评分和用量](docs/engineering/DEPOT-TRANSFERABILITY.md)

- 夜班同基线真实复跑提交 `621f341f2caa3e8837742df969efa39f3d808a09`，10/10、文件义务 18/18，DELIVER 后自然退出。原表晚班回执已送达，维护者回传后 0 请求；Principal 自算并提交 B 车 50/70 kW，未请求修订表回执。九份旧材料完整。旧第 15 笔 UNKNOWN 已独立封存，原 5/10 保留。[两次完整交付对比](docs/engineering/DEPOT-REVIEW-EXIT.md#同一基线再跑一次一次维护者复核后完成交付)

- 夜班维护者实测回传后的收尾已修复。同基线真实原表复核从回传后 16 笔降至 0 笔，DSH 在 2 毫秒后自然结束。Principal 收到反例并算出 B 应改为 50/70 kW，第 15 笔请求超时 UNKNOWN，停在原表，未提交、无第二份回执，冻结 5/10。合格 Mock 完成两次自然退出和同 SHA 缓存重试。[报告与复算](docs/engineering/DEPOT-REVIEW-EXIT.md)

- 夜班调度真实 P 从同一基线接到两次 SHA 绑定回执，将 B 01:00/01:30 从 70/50 改为 50/70 kW。最终 `d5ae2d3395dc0380e4df65be0b9c8cf819247f86` 记录 DELIVER 并自然退出。冻结业务 10/10，共用文件义务 18/18，九份旧材料和原始采集完整，晚班实测另存。两份历史 9/10 保留。[轨迹、保护文件和维护者用量](docs/engineering/DEPOT-MATERIAL-OBLIGATIONS.md)

- Palimpsest 已在同一夜班基线接到维护者独有的 9 kWh 反例，并把 B 车 01:00/01:30 从 70/50 改为 50/70 kW。同一原 SHA 的第二问复用持久化回执，未再启动维护者。最终提交 `e9353b6928fa93554905b960588177c39271aae5` 取得 126/130 kWh 的晚班回执，记录 DELIVER 并自然退出。冻结 9/10：原始采集保留，旧操作说明和复测程序被修改。[回执修复、三条轨迹与用量](docs/engineering/DEPOT-RECEIPT-DELIVERY.md)

- 21:00 的车队记录允许旧表放行，维护者独有的 23:40 记录揭示 B 车少 9 kWh。真实两组均主动联系维护者。P 的联系超时、重试遇忙，未收到测量，保留旧表并记录 DELIVER，冻结 7/10。强原生收到回执，将 B 01:00 从 70 改 50、01:30 从 50 改 70，修正首稿中未经观测的电表读数，冻结 9/10（仍改了旧说明和复算程序）。均自然退出，里程碑二继续开放。[报告与 Git 复算](docs/engineering/DEPOT-SHIFT-LOG.md)

- 冷夜调度两组都先自行复现旧表 B 车缺 4.5 kWh，再主动找上一班维护者复核原表与修订表。两位 Principal 各自把 B 车 01:00 的 70 kW 和 01:30 的 50 kW 都改为 60 kW，提交、通过 10/10 并自然退出。P 维护者另做了一份私有提交，宿主回传测量回执。83 笔全部结算。里程碑二继续开放。[轨迹、同伴贡献及阶段用量](docs/engineering/DEPOT-RELIEF-COUNTEREXAMPLE.md)

- 三张冻结工单的 P/F 真实对照从 `3c44aba8` 启动，6 格实际运行，5 格自然退出，4 格有模型提交。编辑稿两边内容均可用，F 留在工作区；站牌两边行为 7/7、冻结原判各 8/11；调度 P 为 8/8，F 第三笔超时。六格均由单一 Principal 执行。77 笔准入、76 笔结算，确认 1,847,332 tokens，整轮总量未知。上轮软件第 15 笔已独立归档。[真实轨迹、质量与用量](docs/engineering/TRANSIT-DESK-LIVE.md)

- 里程碑三新增三张用户工单，分别面向旅客编辑、站牌维护者和车队调度员。三题 × 普通 Palimpsest DSH / 强原生 DSH 共六条脚本化 Mock 自然退出，35 笔模拟请求、29 对工具调用与结果。编辑题另有从一条来信自行上网找来源的入口，本轮完成取材与宿主验证。里程碑二继续开放。[任务、原稿与复算](docs/engineering/TRANSIT-DESK-USER-TASKS.md)

- 里程碑二保持开放，三的首轮试点已从主线 `6d8f90c1` 启动。夜班回放与 Energy 单站运费修订的四个 Mock 均通过；真实软件 Palimpsest 的 Principal 自己在副本复现了 S 误报，未委派、未提交。第 15 笔请求超时且用量 UNKNOWN，按合同停在首格。强原生软件和 Energy 两格均未启动，尚无真实配对结论。[报告](docs/engineering/TASK-SELECTION-PILOT.md) · [分格记录](research-evidence/pnwf-task-selection/2026-11-19/live-summary.json)

- 夜班实验已由 [PR #278](https://github.com/orangeofcarl0-sys/palimpsest/pull/278) 合并到主线 `b2360950`。上一班维护者在独立副本工作，只能向 Principal 返回绑定候选 SHA 的宿主实测回执。Mock 两组通过，真实自主组没有联系维护者，两位 Principal 均自行修订、记录 `DELIVER` 并自然退出。两个真实交付各通过 P/S 2/2；上一轮两个 0/2 原判保留。[轨迹对比与复算](docs/engineering/FLEET-ISOLATED-REPLAY-REVIEW.md) · [真实证据](research-evidence/pnwf-software/2026-11-19/night-isolated/live-summary.json)

- 夜班跨班复核已完成。真实自主组从 `4f80c3bd` 主动联系上一班回放维护者；Principal 先发现 P/S 档案差异，原维护者在临时副本实测 S 仍误报，随后直接修改共享工作区，Principal 复核并补交。单人组独立查档。两组自然退出，都修正了底层倒退计数，也都用 S 覆盖 P 并反转了 `--require-anomaly` 语义，冻结验收均为 0/2。[报告](docs/engineering/FLEET-NIGHT-REPLAY-REVIEW.md) · [两个候选与轨迹](research-evidence/pnwf-software/2026-11-19/night-review/live-summary.json)

- Fleet 夜班已接入普通 DSH 的档案查询和按 SHA 试排。四格 Mock 后完成重绘/抑制 × 开放协作/单 Principal 的真实配对。四条均取得可行试排、记录 `DELIVER`、自然退出。两个开放协作的 Principal 均独立完成，真实轨迹中没有同伴反例采纳。四份原回放均成功；翻转最后一个终端事件后，重绘单人组仍误报倒退。[报告与复算](docs/engineering/FLEET-NIGHT-SHIFT-PAIR.md)

- gRPC 接续已随 [PR #278](https://github.com/orangeofcarl0-sys/palimpsest/pull/278) 发布到主线 `9bdc8ef5`。[PR #277](https://github.com/orangeofcarl0-sys/palimpsest/pull/277) 的唯一提交 `e3f63313` 与该主线提交的完整文件树相同。核对后已关闭 #277，远端分支 `codex/grpc-autonomous-continuity` 已删除。新场景从已接受服务衍生四站、两窗口的资源分配。三名 Mock 原生子会话交回各自测量，三项贡献被采纳；真实样本由单一 Principal 合成正确的两轮清单。14 笔请求均已对账，真实候选 `7c5cef3989b394b69191a43104c8fa8cdaa21bf2` 已提交供审。[场景、轨迹与复算](docs/engineering/FLEET-ROLLOUT-SYNTHESIS.md)

- 路线图第二个里程碑已完成同一 gRPC 案例的首个业务提示样本。Mock 的原生子会话实测反例，Principal 记录采纳并修订；真实模型选择独立完成，HTTP/2 7/7、公开测试 18/18。所有者按完整 SHA 核准 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`，Work 事件 8 记录接受。宿主重启后，全新模型会话、DSH 侧栏及 Workspace 均找到同一版本和核验日志；真实模型的贡献链为空。两会话均自然退出。[报告](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md) · [接受记录](research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/acceptance.json)

- DSH 侧栏工作检查器已在主线 `a7751302` 发布。从 **Palimpsest** 打开当前项目，点任务看谁负责、谁在执行和已有成果。固定时间点可回看交接，选择 Work 事件可按账本序号重建当时的关系。可视化设计文档、交互样例和实机回归随同发布。[PR #275](https://github.com/orangeofcarl0-sys/palimpsest/pull/275) · [使用说明](docs/user-guide.md#dsh-侧栏工作检查器) · [设计与来源](docs/product/visualization/PLAN.md)

- OpenCode Go gRPC T3 复跑证据已由 [PR #273](https://github.com/orangeofcarl0-sys/palimpsest/pull/273) 发布到主线 `e4f037b8`，16/16 项检查首次通过。证据来自主线 `77f2d87e`、同一核准 HEAD `4639ae44` 的普通 DSH 会话。只提交评审 `ccb07d36`，记录 `DELIVER` 后自然退出，13/13 笔请求自动归因、25/25 对工具配对。冻结 v2 保留 11/12，同一原稿离线复核 12/12、HTTP/2 7/7、公开测试 18/18。历史原判及 402/400 `UNKNOWN` 逐字节保留，本次发布新增付费请求 0。[报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#语义与归因修复后的真实-opencode-go-t3) · [轨迹与账本](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/release-ci.json)

- 真正的仓库在 **`F:/Codex_Work_Space/Palimpsest/palimpsest-sr1`**。父目录 `F:/Codex_Work_Space/Palimpsest` **不是 Git 仓库**，不要在那里工作。
- `main` 是唯一常驻分支。日常保留一条工作分支，并行工作上限为三条。分支归并、R3-A2 导入与历史引用恢复入口见 [分支清单](docs/engineering/repository/ACTIVE-BRANCHES.md)。
- 主线归因改写、切换后 CI 和旧 SHA 查找见 [§2](#主线归因与-sha-映射)。
- 共用 Work 修订契约已通过 [PR #259](https://github.com/orangeofcarl0-sys/palimpsest/pull/259) 发布到 `e42b9ef7`。Attempt 持久绑定宿主签发的四类文件义务。Worker 预检、Principal 结算与接管、普通 DSH 和 `/product` 共用绑定完整基线和候选 SHA 的回执。gRPC 与 Energy 各两条 T2 均按 SHA 接受并从新实例读回。发布复跑四条均通过，新增付费请求 0。[契约](docs/engineering/WORK-REVISION-CONTRACT.md) · [零付费资格](research-evidence/pnwf-work-revision/2026-11-10/qualification.json) · [发布记录](research-evidence/pnwf-work-revision/2026-11-10/release-ci.json)
- 普通 DSH 共用任务义务的两条真实 T2 已通过 [PR #261](https://github.com/orangeofcarl0-sys/palimpsest/pull/261) 发布到 `b1e9d90a`。两名正式 Worker 均查看预检并结算，门禁 PASS，Principal 均自然退出。Energy 记录 `WAIT_FOR_OPERATOR`，gRPC 在 `VERIFYING` 回复待审但未写等待结论。所有者按完整 SHA 核准后分别晋升至 `c950736d` 和 `bfe377ab`。90 笔已结算、2,482,369 tokens，实验止于 T2 接受。[报告](docs/engineering/WORK-REVISION-LIVE-T2.md) · [发布记录](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/release-ci.json)
- 结算后的 readiness 修复已通过 [PR #263](https://github.com/orangeofcarl0-sys/palimpsest/pull/263) 发布到 `2d741933`。gRPC 和 Energy Mock 均从 `ACTIVE / COMPLETED` 推进至 `VERIFYING` 并记录等待后退出。真实 gRPC 同基线复跑按 `readiness → next → conclude WAIT_FOR_OPERATOR` 自然退出，47 笔全部对账。候选核准后离线晋升至 `4639ae44`。[修复与复跑](docs/engineering/WORK-REVISION-LIVE-T2.md#结算后-readiness-修复与-grpc-同基线复跑) · [发布记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/release-ci.json)
- 真实 gRPC T3 已通过 [PR #265](https://github.com/orangeofcarl0-sys/palimpsest/pull/265) 发布到 `b3c3de40`。普通 DSH 从晋升 HEAD `4639ae44` 接续，只提交 `MIGRATION-REVIEW.md`（`12fbb83c`），记录 `DELIVER` 后自然退出。13 笔全部对账，两轮冻结原判和逐项内容复核均已归档。[T3 对比与原稿](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#结算引导修复后的真实-grpc-t3) · [发布记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/release-ci.json)
- gRPC T3 语义验收和交付提示已通过 [PR #267](https://github.com/orangeofcarl0-sys/palimpsest/pull/267) 发布到 `02940a03`，16/16 项检查首次通过。新版认可默认值同义表述，仍要求每条 Reading 独占一帧。两轮冻结原判保留。同一接受 HEAD `4639ae44` 的最终 Mock 完成 12/12 项核验，记录 `DELIVER` 并自然退出。真实 T3 首笔收到 Provider HTTP 402，终态用量未知，按原条件停止，未产生摘要。[报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#grpc-t3-语义验收与同一接受版本复跑) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/release-ci.json)
- OpenCode Go 路由与真实 gRPC T3 证据已通过 [PR #269](https://github.com/orangeofcarl0-sys/palimpsest/pull/269) 发布到 `d5a423af`，16/16 项检查首次通过。HTTP 402 与 HTTP 400 分别保留 `UNKNOWN`。修正后带工具探针结算 375 tokens，同基线 Mock 通过。真实 T3 从 `4639ae44` 提交 `f30c6644`、记录 `DELIVER` 后自然退出，14 笔全结算、27 对工具调用全配对。两轮冻结原判、本轮 11/12 与归因失败及离线复核均保留。[报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#带工具探针通过后的-opencode-go-t3) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/release-ci.json)
- gRPC T3 验收修复由 [PR #271](https://github.com/orangeofcarl0-sys/palimpsest/pull/271) 合入主线 `c9347e24`，送审 SHA 的 16 项检查首次通过。用同一 Git 对象和原压缩流离线复算，摘要 12/12，OpenCode Go 缺 ID 的 14 笔请求按唯一用量四元组全部归因，27/27 对工具调用核对通过。`f30c6644` 的 `DELIVER` 和自然退出得到原证据支持。原 11/12、归因失败、两轮冻结原判与 402/400 `UNKNOWN` 保留，新增模型请求 0。[复算报告和命令](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#同一-grpc-t3-原稿与轨迹的离线复算) · [机器证据](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-offline-acceptance.json) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-offline-acceptance-release-ci.json)
- 自提交先启用仓库 `commit-msg`。主线逐个检查 PR 引入的提交归因，发布使用 rebase 合并。 [归因门禁](docs/engineering/repository/COMMIT-ATTRIBUTION.md)
- `DELIVER` 工件 SHA 修复、项目路线图和 gRPC 迁移双组 Mock 资格已通过 [PR #253](https://github.com/orangeofcarl0-sys/palimpsest/pull/253) 发布。送审 head 的 16 项检查均成功，主线发布点为 `d34f34b4c528f7aa7788a1b7192c789dc73b790c`。六个会话均自然退出，38 笔 Mock 请求全部结算，新增付费调用 0。真实配对另行使用获准的资源合同。 [资格报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md) · [发布与 SHA 对照](research-evidence/pnwf-software/2026-11-10/release-ci.json)
- 2026-11-10 从主线 `268f14f9` 执行首组 gRPC 真实诊断配对。两组 T1 原判分保留，经所有者批准按原提交独立复核后分别启动 T2。Palimpsest 正式委派被写范围拦截，改走原生子任务加 `relay takeover`，记录 `WAIT_FOR_OPERATOR`。强原生直接使用 Git worktree 加 Subagent。两个 T2 的独立探针均通过，候选都修改了要求保留的 proto blob，均未进入核准，两组均未启动 T3。四个会话自然退出，140 笔真实请求、232 对调用与结果已复核。Palimpsest T2 切换前的故障排查占 26 笔请求、1,356,253 tokens 和 220.798 秒。[真实配对报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#真实诊断配对) · [机器证据](research-evidence/pnwf-software/2026-11-10/live-pair-150630/evidence.json) · [用量审计](research-evidence/pnwf-software/2026-11-10/live-pair-150630/usage-audit.json)
- 真实配对的宿主驱动、轨迹、四个 Git bundle 和用量审计已通过 [PR #255](https://github.com/orangeofcarl0-sys/palimpsest/pull/255) 发布。送审 head 的 16 项检查均成功，主线发布点为 `415f8bc48fd9019a0347e0f4c718c2775803d624`。发布核验的六会话 Mock 回归全部通过，新增付费请求 0。[发布与 SHA 对照](research-evidence/pnwf-software/2026-11-10/live-pair-150630/release-ci.json)
- gRPC T2 写范围和拒绝回传复跑从 `52451a07` 接续。六会话 Mock 通过。两组从原 T2 SHA 重跑，均保留四个保护 blob。P 正式 Worker 结算和门禁 PASS，核准 `35f2fb69557e1965ef1e88f723fb600b9e9f0ae3` 后晋升为 `7deda735afa4ef97e71dd14b5ab4b48131e1e872`。F 保留原检出守卫失败，离线通过后按所有者核准从原基线副本接受 `5346a2f606b85962b8a12e8cca706ad8efe658b5`。两组真实 T3 各提交一份评审并自然退出。冻结评分均为 `SOFTWARE_REVIEW_MISSING zero or omitted`，原稿和逐项复核均已归档。P T2 少 17 笔和 1,475,868 tokens，F 多 6 笔和 272,722 tokens。全轮 106 笔已结算，186 对调用与结果复核通过。[复跑报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#t2-写范围与拒绝回传复跑) · [机器证据](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/evidence.json)
- gRPC T2 范围修复、双组 T2/T3 轨迹、Git bundle 和摘要原稿已通过 [PR #257](https://github.com/orangeofcarl0-sys/palimpsest/pull/257) 发布。送审 head 的 16 项检查首次全部成功，rebase 后主线发布点 `55e3238713da6dcd838a1d4157570fcb4383dff4`。发布复核的六会话 Mock 通过，39 笔模拟请求，新增付费请求 0。[发布与 SHA 对照](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/release-ci.json)
- 2026-11-09 在 `codex/energy-project-continuity` 启动同一 energy 项目的三会话实验。首轮两组 Mock 资格 6/6。真实 Palimpsest T1 交付 `4cf360d5620fa10df5022c777aa0ed83c312a80a` 后自然退出，19 笔请求共 535,044 tokens。独立判分修复站点全名与缩写的等价归一化后，同提交离线复算 45/45，通过时新增付费请求为 0。所有者已核准 T2 基线 `8041871314136d417b285a800265858757463f68`。[报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md) · [机器证据](research-evidence/pnwf-energy/2026-11-09/continuity.json)
- Energy 首轮真实 T2 因 Worker 改写证书被宿主拦截。修复统一了 Work 与宿主的五文件范围，证书保持逐字节不变。后续两次观察分别为原生 Subagent 偏离（业务复核 45/45，缺少正式结算）和正式 Worker 结算后 Principal 达到 64 笔上限（业务 45/45，缺少等待结论）。[T2 报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-写范围修复与复跑)
- 等待式变体的 Palimpsest 真实闭环 3/3：T2 正式 Worker 候选 `e2bc1a424a30123213708990394fc8b19e18c445` 获所有者核准，Promotion 后 HEAD 为 `7aed12ea8618533c7acba5b1c8a4f60e8c1c97ce`；T3 从该 HEAD 提交采购摘要 `02fdf9c3aa3e2821e7fe32f82bd7e3b768baf234` 并自然退出。[复验报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#等待与结算引导的定向复验)
- 强原生 DSH 真实闭环也为 3/3。所有者核准 `ba95fd0e384b1523170ebc41d125b072fd94941e` 后原生组快进到该 SHA，T3 从该版本提交摘要 `7ee3971ab8348a1c028a05520bc797cc8672c9b0` 并自然退出。[对比报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#配对结论) · [机器证据](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json)
- 逐请求复核 136/136。Palimpsest 多 28,457 fresh input，差额集中在 T1、T2；其中首请求差 9,005，后续差 19,452。T2 Worker 的大额请求紧跟整包和 diff 回读。两组缓存占比不同，不能仅用总 tokens 推断费用。[轨迹分析](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#fresh-input-为什么更多)
- T2 上下文三变体从已批准基线独立复跑。回执和定向回读候选 45/45、门禁 PASS，经所有者按完整 SHA 核准后已分别晋升。短版 Pulse 组首次直接展开全文，原试验记未采用，业务和门禁离线通过。新三组 87 笔已结算，连旧对照共 117 笔逐一绑定。 [独立对照](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-上下文干预的独立对照)
- 回执与定向回读从各自晋升 HEAD 跑完真实 T3，各提交一页摘要并记录 `DELIVER` 后自然退出。定向回读严格判分 PASS。回执的数据正确，遗漏更正文件名而未过原判分。25 笔请求全部结算。 [T3 接续与原稿](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#两个晋升版本的真实-t3)
- T2/T3 上下文实现、两份摘要原稿、轨迹和报告已通过 [PR #251](https://github.com/orangeofcarl0-sys/palimpsest/pull/251) 合入主线。送审 head 16/16，rebase 后发布点 `478d6b33879d2d64ac9f03aa70a1b57586ce9b67`。回执 T3 仍为 `REVIEW_CONTENT_MISMATCH`。 [发布与 SHA 对照](research-evidence/pnwf-energy/2026-11-09/t2-t3-release-ci.json)
- Energy 范围修复、真实对照与轨迹分析已通过 [PR #249](https://github.com/orangeofcarl0-sys/palimpsest/pull/249) 发布。确切 head 的 16 项检查全部成功，rebase 后落地为 `08c6c6e847cd94cf662ba45e10e0a49e6b753eac`。[发布检查与 SHA 对照](research-evidence/pnwf-energy/2026-11-09/release-ci.json)
- Bench 树与 README 导航已合入主线，改写后对应提交为 `234be03cd82de55455a8a316fec66b8886d26cf9`。合并前 14/14 个 CI job 通过。导航入口见 §4。[PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242)
- Software 和 energy 的 readiness 定向观察证据、报告和 handoff 已合入主线，改写后对应提交为 **`666b4446c0649b7a3f425f1291fff99b6f97a2bf`**。合并前 14/14 个 CI job 通过。[PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239)
- 本地 `main` 被另一个 worktree 占用：`F:/Codex_Work_Space/DSH plugin/palimpsest-repo`。**不要**在这个 worktree 里 `git switch main`，也不要 reset/clean 其他 worktree。
- 按量记账续作和轨迹归因修复已通过 [PR #232](https://github.com/orangeofcarl0-sys/palimpsest/pull/232) 合并。新工作从确认的主线开分支。
  ```bash
  git fetch origin
  git switch -c codex/<your-branch> origin/main
  ```
- 最近完成：PNWF-CQ-R1 请求前预算预留、实际容器/World 资格、Mock 身份隔离、Operator/Head 最终复核、Direct→真实子进程 Worker→Settlement→Promotion→依赖续作。
- PR #230 的 14 个 CI job 首次运行全部成功：Linux 4,981 PASS / 33 SKIP、E2E 38/38、预算故障 20/20、Windows Host Boundary 通过。四个依赖外部 Host 的 gate 按既有环境条件跳过执行，不属于实测通过；详见 §5。
- `package-smoke` 遇到连续的 Ordarium 发布包下载 504 时，最后一次安装尝试通过 GitHub 官方资产 API 获取原包并核对锁文件 SHA-512。验收范围见 §5。
- Owner 于 2026-11-07 授权付费调用，2026-11-08 允许不设计费上限。本轮使用显式 `paid-usage-only` 模式，按终态 usage 记账并保留实际容器资格要求。历史 5M cohort 的结果和本轮实验范围见 §6。
- 2026-11-08 software 续作自然退出，27 个真实请求全部结算，共 982,857 tokens。记录 DELIVER，三项旧任务退役，HEAD 保持起始提交，promotion 为 0。主判据 1/1。
- 软件轨迹重算配对 31/31 个结果，两次 `NOT_READY` 原因分别为 `UNCOMMITTED_WORK` 和 `NO_SETTLEABLE_DELTA`。失败探针作业 1 次，同因重复拒绝 0 次，无进展调用 3 次。[重算证据](research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json)
- 2026-11-08 energy 沿用记账和终止条件，29 个请求全部结算，共 987,987 tokens。归因配对 43/43，`takeover` 被 `NO_SETTLEABLE_DELTA` 拒绝，过早 `plan` 触发 `quiescence_required`，转 `successor` 后修订并记录 DELIVER。自然退出，主判据 1/1。[对比报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md) · [Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)
- 修复两条轨迹在退役后收到的 `readiness CONTINUE_WORK`。退役计划的声明产物已提交且 episode 无交付阻塞时，`readiness` 返回 `SEMANTIC_JUDGEMENT`，提示模型确认成果后调用 `conclude DELIVER`。[修复与回归](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导)
- 从修复后的主线各复跑一条 software 和 energy。两条均在退役后验证并直接 `conclude DELIVER`，随后自然退出。两条退役后 `readiness` 调用均为 0，新提示采用情况为 `NOT_EXERCISED`。本轮 55 个请求全部结算，共 2,462,728 tokens。[复跑对比](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#readiness-修复后的真实模型复跑) · [机器证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)
- 从已退役、尚无交付的两份状态做定向观察。两条都先查 `readiness`、收到新提示，在后续模型步骤记录 `DELIVER` 并自然退出。人工 prompt 只要求先查，Host 自动附加常规 `pulse` 引导。30 个请求全部结算，共 756,492 tokens。[定向报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察) · [机器证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

---

## 1. 项目定位与入口

Palimpsest 是“可信项目资产 + 自发性 agent 协作”的 DSH Host 产品层。核心不是再造 agent runtime，而是让真实项目事实（Git、Work、Evidence、Promotion、ProjectIR、Episode）成为模型可正确使用的行动依据。

主要入口：

| 入口 | 路径 |
|---|---|
| 产品安装/组合 | `src/product.ts`, `src/install.ts`, `src/composition/` |
| DSH 工具适配 | `src/adapters/dsh/` |
| Work 域与状态解释 | `src/domain/work_state.ts`, `src/work/`, `src/application/` |
| Controller（热点） | `src/tools/controller.ts` |
| 连续性/Pulse | `src/project_continuity/`, `src/project_pulse/` |
| CLI | `src/cli.ts`, `src/cli_product.ts` |
| 研究证据 | `research-evidence/` |
| 工程报告 | `docs/engineering/` |

---

## 2. 当前 Git / 分支状态（2026-11-22，最近同步）

拒绝回执接续仍在 `codex/cold-handover-closeout`，父基线 `c7509663`。真实接续工作头为 `91b5bc0ca6690d673118af3d753056b26a7ab460`，稳定安装物仍由 `07ab5aad` 构建，维护项目基线为 `082f77a9a4602d1eb5a2d9be1260186fa41c4a61`。已验证退出并离线封存，运行位持久化 `USAGE_UNCONFIRMED`。本轮未产生可送审的 Git 提交。[入队记录](research-evidence/pnwf-software/2026-11-22/rejection-retry/live/incoming.json) · [当前运行位](research-evidence/pnwf-software/2026-11-22/rejection-retry/live/slot.json)

原稿接续沿用 `codex/cold-handover-closeout`，父基线 `1c0807c3`。新旧真实会话使用相同产品源码 `07ab5aad`、基线 `082f77a9a4602d1eb5a2d9be1260186fa41c4a61` 和宿主维护位置。续作提交 `91b5bc0ca6690d673118af3d753056b26a7ab460` 的构建摘要 `27cddb5c5bba7334ca64e9ea68a4de4b66b32304e95f8a9dd33e69d813e82699` 供复核拒绝结果，核准和激活记录均为空。稳定位置仍指向原安装物。[核验](research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate.json) · [运行位](research-evidence/pnwf-software/2026-11-22/draft-resume/live/slot.json)

自主维护实施在 `codex/cold-handover-closeout` 从 `198d6293` 接续。真实产品源码来自 `07ab5aad`，只投影允许的源码对象进入隔离 Git 根 `082f77a9a4602d1eb5a2d9be1260186fa41c4a61`。`e47b7c10` 作宿主参考和 Mock 候选，未挂入真实会话。真实终态仍指向隔离根，本轮原稿单独存 `working.patch`。[源码映射](research-evidence/pnwf-software/2026-11-22/self-evolution/live/source.json) · [真实运行位](research-evidence/pnwf-software/2026-11-22/self-evolution/live/slot.json)

本轮工作分支 `codex/cold-handover-closeout` 从主线 `07ab5aad7f77a2fd67f426c80e5215cf3f2bc6de` 接续。真实配对保持同一评审基线 `1444de6ce289197a1d12b0b04d2caa36c1d79355` 和已接受版本 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`。两组候选 `091996b1703790dc28fd6a8e16467d78ed3667f0`、`008a480efed94d6400a9240498a9d9148072ceaf` 都只改一份评审，各自保存 Git bundle 与正式结论工件摘要。[归档](research-evidence/pnwf-software/2026-11-22/cold-closeout)

自改进发布提交为 `1b47603263ec46ac248b47eb21fdcf167dbb8728`。原发送审的 `3883ae73`、`af0b91cc`、`008c55b3` 依次对应主线的 `1db38264`、`0232bf76`、`1b476032`。送审与主线完整树同为 `1f99af87dcb3d4b9d90f5b9c6e9611457e533762`。需要恢复实验当时的宿主与脚本时，可用 `git fetch origin refs/pull/293/head` 取得原始提交链，再从 `af0b91cc` 查看冷交接环境。主线可直接运行归因复算。[发布 PR](https://github.com/orangeofcarl0-sys/palimpsest/pull/293)

冷交接自改进配对当时使用 `codex/self-improvement-method` 的宿主 `3883ae73`。两组实验项目从评审基线 `1444de6ce289197a1d12b0b04d2caa36c1d79355` 启动，原 Work 接受版本为 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`。评审候选保存在各自的归档 Git bundle。[冻结合同](docs/engineering/CONTINUITY-REUSE-METHOD.md#冻结的任务与验收)

主线 `6bf50e90` 上开展的冷启动交接修复通过 PR #289 发布。送审 head `7fed1d273c74ac30d71212b3ef9ebefa119ecd08` 的 16 项 CI 均通过，合入点为 `ec80486ab1542027e22c26a978e7984212d4b9b0`，两端完整 Git 树均为 `26f46e04494ec8a4ec9966b14cabf65c7363aa7a`。工单、参考修复与实跑归档三笔提交分别对应 `6cc98a6e`、`c8f2d521`、`ec80486a`，逐笔核对文件树与提交标题。50 份归档文件通过摘要核验，两条轨迹从原流和账本重算一致。本次发布新增付费请求为零。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/289/checks) · [机器对比](research-evidence/pnwf-software/2026-11-21/cold-handover/live/comparison.json)

R4 说明与提示拆分对照从主线 `e639e549` 开始，实验基线为 `234b5326c1c94595a23407ada5f92fa5b8c9ca52`。PR #287 的送审提交 `f65a7fa47a87f9641e84645263cecf68b0c8b427` 通过全部 16 项检查，线性合入主线为 `2c29e90c22ab0161eefaeda9c296d324cd0ee6db`。两端完整 Git 树同为 `294beab5861ff7394c883e8497ab9c5fbbf86e8f`。312 份新增归档包含两轮 Mock、四条真实轨迹、Git 证据、归档中断和恢复记录。发布核验通过九项定向回归，离线重算的对比 JSON 与封存件逐字节一致，新增付费请求 0。旧 6/10、2/10 与第 7 笔 UNKNOWN 均保留。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/287/checks) · [冻结条件](research-evidence/pnwf-task-selection/2026-11-20/r4-split/frozen.json) · [恢复封印](research-evidence/pnwf-task-selection/2026-11-20/r4-split/recovery/seal.json)

R4 窗口利用率发布从主线 `dda9cde8` 接续。PR #285 送审提交 `9438cc68f7d3eec511c50b2e254fcc1acbe619c1` 的 16 项检查全部通过，线性合入主线为 `55eeaa3bab12a891548b0e3408aaf9be51d11d66`。两端完整 Git 树均为 `0de2d14700edd71f89aee445508984b94eb3a5f0`，包含 101 份 R4 窗口实验归档文件。发布时以归档的 Git、轨迹和账本离线复算两组 Mock 和两条真实轨迹，重新生成的对比 JSON 与封存文件逐字节一致。实验基线为 `234b5326c1c94595a23407ada5f92fa5b8c9ca52`，本次发布新增付费请求 0。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/285/checks) · [合同与源码封印](research-evidence/pnwf-task-selection/2026-11-20/r4-window/frozen.json)

R4 发布从主线 `a819db59` 接续。PR #283 送审提交 `14f7e888222279ae249cc303634c6002a8e6b23f` 的 16 项检查全部通过，线性合入主线为 `b8a7d27b9cba0d736f1bf126350afc545d4a1703`。两端完整 Git 树均为 `2ebc7f1b65c81fc069cd9d038ab4ff62f4461182`，涵盖契约、轨迹、账本、Git bundle、报告和实验 handoff。发布时重新离线生成的 R4/R7 对比文件与封存文件逐字节一致，新增付费请求 0。实验项目的基线为 `234b5326c1c94595a23407ada5f92fa5b8c9ca52`。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/283/checks) · [冻结输入与运行窗口](research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/frozen.json)

### 任务选路试点发布

PR #281 从 `6d8f90c10ef3511c444cfeca36ed5d61287de16a` 线性合入 12 个提交。送审 HEAD 为 `cc01483b1dd31e25fcbcb7862a405ceeb96eeeae`，发布 HEAD 为 `f1c1424aab2f56fe53779678410a091e8e793309`。逐提交核对了文件树、作者身份和时间、提交说明及线性父链。两端最终树均为 `c1556ca2f98f99f0371cedbe5c4db9e9dabca3d5`，覆盖脚本、Mock 与真实轨迹、Git bundles、账本、报告和实验 handoff。远端工作分支已在合并后自动删除。[合并记录](https://github.com/orangeofcarl0-sys/palimpsest/pull/281)

早期复算脚本按送审时的 SHA 读取封存源码。完整克隆若未获取证据标签，运行 `git fetch origin tag evidence/task-selection-pilot-cc01483b`，即可解析原始 12 个提交。下列实验记录继续使用运行当时的 SHA。隔离项目的候选 SHA 可从各自归档的 Git bundle 读取。[证据标签](https://github.com/orangeofcarl0-sys/palimpsest/tree/evidence/task-selection-pilot-cc01483b) · [离线复算命令](docs/engineering/DEPOT-R7-RELEASE-POWER.md#零付费复算)

### 试点运行时的分支与基线

R7 功率签发修复从本地 `codex/task-selection-pilot` 的 `705d1be2` 接续。两席仍使用完整实验基线 `d221aafd3e597dde63f951d65c1005ec2a7c90fa`。[本轮封印](research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/frozen.json)

矩阵恢复工作在本地 `codex/task-selection-pilot` 从 `1577b2c2` 接续。本地 `origin/main` 引用为 `6d8f90c1`。新批次使用原工单基线、提示、评分器、镜像与终止条件，只对尚未运行的三格开放准入。[续跑封印与准入记录](research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/matrix.json)

两种回执适用范围试点在 `codex/task-selection-pilot` 从 `889ba56b` 接续。R4 的双方实验基线均为 `234b5326c1c94595a23407ada5f92fa5b8c9ca52`，R7 均为 `d221aafd3e597dde63f951d65c1005ec2a7c90fa`。两条基线的旧表和原始量测相同。[运行前封印](research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/frozen.json)

本轮在本地 `codex/task-selection-pilot` 从 `4503598d` 复用了已通过的 Mock，实验项目仍从 `341e19e288de9f561f85fcb66a7a910ff6f3e143` 启动，新旧 cohort 分开记账。[新归档](research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit-rerun/)

维护者自然退出一轮从产品 `a4d88df6` 接续，本地沿用 `codex/task-selection-pilot`。隔离项目基线及停机 HEAD 都是 `341e19e288de9f561f85fcb66a7a910ff6f3e143`。[实验归档](research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/)

本地工作分支 `codex/task-selection-pilot` 从产品提交 `91dc8787` 接续。夜班材料保护复跑沿用实验 Git 基线 `341e19e288de9f561f85fcb66a7a910ff6f3e143`；历史两份 9/10 均保存在原归档。[独立证据目录](research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/)

回执投递修复从本地 `codex/task-selection-pilot` 的 `d70eebc0` 接续，实验仓库基线仍是 `341e19e288de9f561f85fcb66a7a910ff6f3e143`。两组历史对照封存在原目录。本轮使用单独的[回执投递证据目录](research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/)。

调度晚班私有实测单实验沿用本地 `codex/task-selection-pilot`，从产品提交 `072d4231` 接续。两组实验项目起点均为 `341e19e288de9f561f85fcb66a7a910ff6f3e143`。本地记录的 `origin/main` 为 `6d8f90c1`。[判据与数据来源](scripts/pnwf/depot-shift-log/protocol.md)

冷夜调度复核沿用 `codex/task-selection-pilot`，从产品提交 `ee8b2fb5` 接续。本地 `origin/main` 引用为 `6d8f90c1`。实验项目从同一个 `21255b96` 运行，隔离仓库的提交及私有复核记录见[本轮报告](docs/engineering/DEPOT-RELIEF-COUNTEREXAMPLE.md)。

真实三工单配对沿用 `codex/task-selection-pilot`，运行起点为 `3c44aba89fc9837619c5d22b2545b1e77a445f2b`。实验项目的候选与产品分支分别记录，完整候选 SHA 见[六格证据](research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/comparison.json)。

用户工单扩展沿用本地 `codex/task-selection-pilot`，接续试点提交 `ace35d39`；旧试点付费现场与其冻结协议可按原提交复算。

| 项 | 值 |
|---|---|
| 仓库 | `F:/Codex_Work_Space/Palimpsest/palimpsest-sr1` |
| gRPC 接续提交 | 送审 `e3f63313e127c72ce010dff544b0f48c9bab801d` 与主线 `9bdc8ef5c63afb18c9f33de645a2cd0497d5c40c` 的 Git tree 均为 `21c68ad2cf3535c12d75dad9508a1f8df1531128`。截至 `0f28f476`，#277 涉及的源码、测试、报告和 86 个归档路径都与送审版相同；后续有变动的三个路径为 `.gitattributes`、研究合同和本 handoff。 |
| 选路首对试点 | 本地工作分支 `codex/task-selection-pilot` 起点为 `6d8f90c10ef3511c444cfeca36ed5d61287de16a`。软件基线 `4f80c3bd`，Energy 新基线 `31723de4`，本轮仅首个真实软件会话启动。 |
| 夜班历史实验 | 夜班隔离复核发布点为 `b23609505a4f4ce8fa2ee523f500902bdd8cc84d`。两组实验工作区的基线均为 `4f80c3bd`。GitHub 已在合并后删除远端送审分支。 |
| `origin/main` | 夜班发布送审 HEAD `3c489b3b2a2bf02134494d34567611635a866844`，对应主线 `b2360950`。六个提交的文件树逐一相同。后续交接提交用 `git fetch origin` 和 `git rev-parse origin/main` 核对。 |
| [PR #275](https://github.com/orangeofcarl0-sys/palimpsest/pull/275) | 从 `4e291944` 送审的 7 个提交经 rebase 合入主线。原生检查器 `e7c6f68a` 对应 `abba2519`，交互与样式的送审 HEAD `311f101e67076f6ed68541216421c1360e6dde19` 对应 `a77513024a0c847a1a7bf5a76aa4a5a38648e827`。逐项核对文件树、作者和提交消息一致，远端 `codex/project-visualization-plan` 已自动删除。[检查结果](https://github.com/orangeofcarl0-sys/palimpsest/pull/275/checks) |
| [PR #273](https://github.com/orangeofcarl0-sys/palimpsest/pull/273) | `codex/grpc-t3-opencode-v2` 已 rebase 合并，送审 `981891a693ce2e270911cce6128292a341830d18` 对应发布 `e4f037b868c7c36a65aa28396e2f25f8b5fbdf5b`。前后文件树、作者和消息一致，远端工作分支已自动删除。[检查及 SHA 对照](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/release-ci.json) |
| [PR #271](https://github.com/orangeofcarl0-sys/palimpsest/pull/271) | `codex/grpc-t3-offline-acceptance` 已 rebase 合并，基线 `33495ed1a06772780f3dba09ec8de7680f49c551`，送审 `78e473d666bce41aeb265c326f8ad7c3800953cd`，发布 `c9347e24b4bbd6440444cdc763f6bf7f7a85b31c`。合并前后文件树、作者和提交消息相同，远端分支已自动删除。[检查和 SHA 对照](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-offline-acceptance-release-ci.json) |
| [PR #269](https://github.com/orangeofcarl0-sys/palimpsest/pull/269) | `codex/grpc-t3-opencode-go` 已 rebase 合并，送审 `1612688882ae90e90480988a0f78d309b567715d` 的 16/16 项检查通过。四个提交的文件树、作者、提交消息和线性父链逐一核对，远端工作分支已自动删除。探针与真实会话使用的宿主实现 `9fe4bd62` 对应主线 `92dd887e`。[检查与 SHA 对照](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/release-ci.json) |
| [PR #267](https://github.com/orangeofcarl0-sys/palimpsest/pull/267) | `codex/grpc-t3-review-semantics` 已 rebase 合并，送审 `c2ed9dd2649abdef62b6e2da4cbfa3fc13fae7f9` 的 16/16 项检查通过。合并前后文件树、作者和提交消息一致，远端工作分支已自动删除。[检查与 SHA 对照](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/release-ci.json) |
| [PR #265](https://github.com/orangeofcarl0-sys/palimpsest/pull/265) | `codex/grpc-settled-readiness-t3` 已 rebase 合并，送审 `68df9f8b6d68f4de51b495158147b4028d895ca4` 的 16/16 项检查通过。合并前后文件树、作者和提交消息一致。远端工作分支已自动删除。[发布记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/release-ci.json) |
| [PR #263](https://github.com/orangeofcarl0-sys/palimpsest/pull/263) | `codex/settled-worker-readiness` 已 rebase 合并，远端分支自动删除。精确 head `85e5a8c4e637d9228deb9b95e980d159104fd95b` 的 16/16 项检查成功。真实运行使用 `57638dad88fdba00c30b6be85107086866e09dcf`，对应主线修复提交 `c2c51db99a258d051c33e592ad2ef364089f0c1a`。送审和主线的文件树、作者与消息逐一核对。[发布与 SHA 映射](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/release-ci.json) |
| [PR #261](https://github.com/orangeofcarl0-sys/palimpsest/pull/261) | `codex/work-revision-live` 已 rebase 合并，远端分支已自动删除。精确 head `633a907b39f91dab3fb1f900ded08b42e198570f` 的 16/16 项检查成功，合并前后文件树、作者和消息一致。候选与接受 SHA 仍指向各自实验 Git 对象。[完整发布记录](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/release-ci.json) |
| [PR #259](https://github.com/orangeofcarl0-sys/palimpsest/pull/259) | `codex/work-revision-obligations` 已 rebase 合并。精确 head `e499b3965f83caaedddbbbc2e480c422d41dd1f4` 的 16/16 项检查成功。三个提交的文件树、作者和消息逐一核对。历史轨迹、核准记录和冻结原判逐字节核对。[完整 SHA 映射与检查](research-evidence/pnwf-work-revision/2026-11-10/release-ci.json) |
| [PR #257](https://github.com/orangeofcarl0-sys/palimpsest/pull/257) | `codex/grpc-t2-scope` 已 rebase 合并，远端工作分支自动删除。精确 head `3e23a0aca84267d9543cab5e802c3446e495dcc6` 的 16/16 项检查成功。合并前后文件树、作者和提交消息一致。强原生检出守卫失败、离线核准和两组 T3 冻结原判均保留。[发布证据](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/release-ci.json) |
| [PR #255](https://github.com/orangeofcarl0-sys/palimpsest/pull/255) | `codex/grpc-live-pair` 已 rebase 合并，远端工作分支已自动删除。送审 head `b86b352cd7aec0b3748046b4aaefb0a294fc7189` 的 16/16 项检查成功，主线提交的文件树、消息和归因已核对。[发布证据](research-evidence/pnwf-software/2026-11-10/live-pair-150630/release-ci.json) |
| [PR #253](https://github.com/orangeofcarl0-sys/palimpsest/pull/253) | `codex/project-roadmap` 已 rebase 合并，远端工作分支已自动删除。送审 head `94b59b20a566fa9e621727da89359d6d4a011129`，16/16 项检查成功。路线图送审提交 `fdfad589bf4eb7aab6aa4271a095de28fb36bf40` 对应主线 `fd4fa79e8c0ec2873ae1c43a3783864c0d179c42`。两次 rebase 的文件树与消息逐一核对，资格封存保留实验起点 SHA。[发布证据](research-evidence/pnwf-software/2026-11-10/release-ci.json) |
| [PR #251](https://github.com/orangeofcarl0-sys/palimpsest/pull/251) | `codex/energy-t2-context` 已 rebase 合并，远端工作分支自动删除。检验 head `1c578d34c1603aac8a667bdc356747a43d6b9f74`，16/16 项成功。主线依次为 T2 `1caa0db7eedbcf2efe8a7209014360b34420ee39`、核准与晋升 `f3ee25ef1f2fc9471bc26d915d0e96e9a14f06d9`、T3 `478d6b33879d2d64ac9f03aa70a1b57586ce9b67`。三组文件树和消息逐一核对。 [完整 SHA 与 CI 证据](research-evidence/pnwf-energy/2026-11-09/t2-t3-release-ci.json) |
| [PR #249](https://github.com/orangeofcarl0-sys/palimpsest/pull/249) | `codex/energy-project-continuity` 已 rebase 合并；检验 head `e7ea59861c8b002c7b74571840f5cb44363f12f7`，16/16 项成功。原 3 个提交与新主线提交的文件树和消息逐一核验一致，[完整 SHA 对照](research-evidence/pnwf-energy/2026-11-09/release-ci.json) |
| PR #227 | MERGED at `1766a794a52fcdda323331429b6881d2b1dc8636`；CI 全绿（unit / e2e / host-boundary / gates / package-smoke） |
| PR #230 | MERGED at `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`；被检验 head `b1554f89ecfa0dacf98e7f52b3ddc677600da051`；14/14 check jobs SUCCESS，执行范围见 §5 |
| PR #231 | MERGED at `4d5d9704e902d33b1380bf5a1df85dc39541935b`，PR 与合并后主线均为 14/14 check jobs SUCCESS |
| PR #232 | MERGED at `fd341c1b9cd4c7c245e0f2ee79d3269b83118f24`，已验证 head `8ceb48f2f0a8f1cba957d3b55198b1772b52ff04`，14/14 check jobs SUCCESS |
| PR #233 | MERGED at `fdd5308bf45e699058ecae86fcfb573e250e4e69`，同步 #232 的发布 handoff，14/14 check jobs SUCCESS |
| PR #234 | MERGED at `dbaaa0e6f2b03a1c4a7c6b322a8ae9404c28c44e`，已验证 head `98806d74310882d0bd237fce35a4fcefe25780b5`，14/14 check jobs SUCCESS |
| PR #235 | MERGED at `c827ef055a381988737c4e44c690f206447218dc`，同步 energy 交付记录，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| PR #236 | MERGED at `e5312cc5d81b5ada6f4a1015f8d00f9c557beb85`，修复退役后的 readiness 引导，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| PR #237 | MERGED at `987bab01f8aaaf04954eaedb434409b7a15c2631`，已验证 head `7402e5f37c4464d81baa6f111218043a913d48c8`，14/14 check jobs SUCCESS |
| PR #238 | MERGED at `5588cf9da6189dbe2b7cb121a188677b13113713`，同步复跑发布 handoff，PR 和合并后主线均为 14/14 check jobs SUCCESS |
| [PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239) | MERGED at `00c5f46d69683ee75f3b74d44f184c0b7a19ac23`，已验证 head `ba2a245d7114df55d510da27f9ee9c1e02b22e04`，14/14 check jobs SUCCESS |
| [PR #240](https://github.com/orangeofcarl0-sys/palimpsest/pull/240) | MERGED at `86483ad40ef2659935a4085fd11025de768f4fc1`，同步 handoff 和 504 重试，合并前 14/14 check jobs SUCCESS |
| [PR #241](https://github.com/orangeofcarl0-sys/palimpsest/pull/241) | MERGED at `0f7dc1308060d6880eb8dbdc65581fe8e5ebf2b4`，发布包 504 恢复路径通过 PR 与主线 14/14 个 CI job |
| [PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242) | MERGED at `ca3e67661730f157acafe2c999afbac5b83459b2`，已验证 head `1f75c1cf2599a82bac680f6dbf4ae2bff6df33d8`，14/14 check jobs SUCCESS |
| 分支恢复 | 项目目录下 `branch-archives/2026-11-08-1560db0/` 保存清理前的 Git bundle、已验证镜像及原引用清单 |
| 工作树 | 本次交付提交后应 clean；以 `git status --short` 为准 |
| Node / pnpm | Node `24.14.1` / pnpm `11.21.0` |
| 平台 | Windows，PowerShell；Docker 中 Linux / DSH 0.2.1-rc.5 |

注意：`package.json` 声明 Node `>=24.15.0`，本机是 `24.14.1`，pnpm 会打 engine warning；当前构建/测试可用，但不要据此升级依赖或忽略其他 engine 错误。

### 主线归因与 SHA 映射

2026-11-08 从 `87e14286ff5ab50f2a6678340f8f4c2f734e75c1` 切换到上表的归因改写基线。21 个测试署名提交的作者与提交者沿用 `orangeofcarl0-sys` 的 Git 姓名和邮箱，10 个 G10 提交移除了 Claude 共同作者尾注。逐一核验了 1,139 个提交的文件树和父链。854 个提交获得新 SHA，285 个保留原 SHA。171 个旧签名随提交改写失效。9 个历史标签保留原对象与指向，其中 6 个仍可追溯到带 Claude 尾注的原提交。

切换后恢复了 `main-protection` 的原始规则和空放行列表。改写基线的三套工作流共 14/14 个 job 成功，R0 中 4 个依赖外部 DSH 的实测步骤按原环境条件跳过。[主线保护](https://github.com/orangeofcarl0-sys/palimpsest/rules/23655367) · [Linux unit / e2e](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882339) · [R0 Gates](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882338) · [Windows Host Boundary](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42490882351)

CI 通过后，GitHub 贡献图与具名 Contributors API 均只列出 `orangeofcarl0-sys`。逐一核对了 GitHub 对上述 31 个提交的署名。[Contributors](https://github.com/orangeofcarl0-sys/palimpsest/graphs/contributors)

查找旧 SHA 时，用完整原 SHA 查询 TSV 的第一列，第二列是新主线上文件树相同的提交。表中只列出 854 个改写提交。上表的历史 PR、CI 记录和归档实验保留当时的实际 SHA。新导航和源码链接使用改写后的 SHA。[提交映射](repository-audit/main-rewrite-2026-11-08.tsv)

本机回溯原提交对象使用已验证的完整 bundle `../branch-archives/2026-11-08-before-attribution-rewrite-87e1428/original-main.bundle`，其中 `refs/audit/original` 指向切换前的主线。

### 提交归因门禁

共享校验器和本地 hook 已通过 PR #246 合入 `1d76b2798e84691dff207ebbf08d4f61e9c1e119`。本检出已配置 `core.hooksPath=.githooks`。新克隆按归因门禁文档启用 hook。[PR #246](https://github.com/orangeofcarl0-sys/palimpsest/pull/246) · [归因门禁](docs/engineering/repository/COMMIT-ATTRIBUTION.md)

`main-protection` 强制 GitHub Actions 发布的 `commit-attribution`，并保留 `unit` 和 `e2e`。PR 必须基于最新主线，通过 rebase 合并。线性历史规则拦截手工合并提交，`main-publisher` 仅允许仓库所有者通过 PR 发布。记录新验收结果时取 rebase 后的主线 SHA。[主线保护](https://github.com/orangeofcarl0-sys/palimpsest/rules/23655367) · [发布权限](https://github.com/orangeofcarl0-sys/palimpsest/rules/26806204)

远端负向验证用 `--no-verify` 把混合大小写共同作者尾注和未授权邮箱写入中间提交，PR 的最后一个提交干净。主线版校验器在该 head 上报告失败并指出两项违规。修复后的 PR #247 全绿，通过合并 API 以精确 head 执行 rebase，落地为 `8418571d1e42e9cf7a391c1c1c39ce425aab1410`。实际提交消息与通过检查的候选一致。发布者规则可能让 `gh pr merge` 的预检显示 `BLOCKED`，按文档使用已实测的合并 API。[远端拒绝记录](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42507662604) · [PR #247](https://github.com/orangeofcarl0-sys/palimpsest/pull/247)

---

## 3. 已合并的产品语义（不要回退）

### 3.1 Work / 状态

- `status` 与 `readiness` 必须使用同一组 attempt/direct-outcome 事实。
- `readiness` 对零差分必须说：
  - 没有可结算候选增量（no settleable candidate delta）
  - 正式完成未就绪（formal completion not ready）
  - 用户实际成果需另行评估（assess the actual outcome separately）
- 绝不能把“正式 Attempt 无增量”说成“用户实际工作尚未完成”。
- 未提交修改必须先于零差分检查。
- `WorkAttemptLiveness` 的词汇是 `ACTIVE | EXITED | UNKNOWN | UNOBSERVED`；**没有** `NEVER_STARTED`。
- 本 Host 无 Invocation 记录 = `UNOBSERVED`，不是“Worker 从未启动”，也不是“上一个 writer 已停止”。
- Principal 结算无 Invocation 的 world 时归属 `UNATTRIBUTED`；不得声称观察到 worker exit。

### 3.2 行动指导

- `status.nextAction` 是机械合法性；`status.nextAction.semantic` 是业务判断（是否需要继续/退休/CHECKPOINT）。
- 不要把 Scheduler 的合法 `next` 改成“应该退休”；只显示两类事实。
- 零差分 + Direct Commit Ahead：`NO_SETTLEABLE_DELTA` / `SEMANTIC_JUDGEMENT`，不得推荐重复 `complete`。
- 普通初始 `IN_SYNC` 不证明 Direct 成果。相等 Head 只有在 canonical approval 与 Direct basis revision 成对存在时才显示该语义提示。
- 退役后通过 `readiness` 核对被移除任务的声明产物、当前提交和 `conclude` 共用的 episode 阻塞事实。产物已提交且无阻塞时给出 `SEMANTIC_JUDGEMENT` 与 `conclude DELIVER` 路径，当前 `DELIVER` 已记录时引导回复。
- `readiness` 在 `ACTIVE` 已结算、调度下一步确为该任务的 `TASK_VERIFYING` 时提示 `next`，随后记录 `WAIT_FOR_OPERATOR`。候选可读性和工件以正式结算 SHA 核对，暂停时先查调度状态，避免重复 `complete`。

### 3.3 Plan / Invalidation

- `metadata_only` / `backward_compatible` + `changedIds` **不会**产生 typed invalidation；normal tool 会拒绝这种误导性调用。
- 只有 `behavior_change` / `contract_breaking` 产生 typed invalidation。
- 普通退休 = 在 quiescent 时提交 `tasks: []` 的 graph revision，不是 metadata invalidation。
- `planReconciled` 的 final owner 会重检 invocation ledger；任务要 stale 时若有 OPEN invocation，必须 `quiescence_required` 拒绝。
- 不要削弱 Adapter 的 worker 保护，也不要只依赖 Adapter 快照。

### 3.4 Journal 投影

- `REFERENCE_NOTE` 不等于 open question。
- 带 `relatedRefs.kind === "commit"` 的验证记录、`episode:` / `relay:` provenance 的产品记录，是 recorded observation，不进入 `openQuestions`。
- 无结构化来源的 `REFERENCE_NOTE` 仍保持保守，进入 open questions；真正的 `OPEN_QUESTION` 永远保留。

### 3.5 Direct → Governed（operator-mediated basis admission）

- Direct commit 默认只是 repository outcome，不是 governed result。
- 未经 operator admission：
  - `status` 显示 `DIRECT_HEAD_AHEAD`
  - `prepareMutatingWork` 抛 `HEAD_BASIS_MISMATCH`
  - 不得写 `ATTEMPT_COMPLETED` / `PROMOTION_COMMITTED`
- 合法入口：`palimpsest basis admit`（Operator CLI，不是模型工具）
  - 验证签名 Ed25519 operator credential（`OperatorAuthorityPort`）
  - Controller final owner 也必须通过部署配置的 `OperatorAuthorityPort`；任意 operator 字符串、缺失端口、agent 角色均拒绝
  - 目标必须是 checked-out HEAD、clean worktree、当前 ProjectIR head 的 descendant、promotion state 严格 `IN_SYNC`（`CONFLICT` 不得绕过）
  - task graph 必须不变（head-only）
  - 写 `MANUAL_APPROVAL_RECORDED` + `PROJECT_REVISED`，保留任务 reauthorize 到新 basis
  - 仍然只有一个 head owner：`ProjectController.planReconciled`
- 该 admission **不是** artifact acceptance，不是 promotion，不会产生 Worker Result。
- 本地 signed credential 不是 IdP/SSO；需要远程身份时由部署提供自己的 `OperatorAuthorityPort`。
- 同一 `appendAtomic` 的 `beforeCommit` 复核权限、HEAD、工作树和 promotion state；变化则整批回滚。原生 Git 观察留在 `unseen_inputs.ts`，注入 Head 规则。
- Git/SQLite 不是跨系统原子事务；最后读 Git 之后的外部漂移仍可能发生，已有执行 `HEAD_BASIS_MISMATCH` 拒绝后续工作。
- 零付费纵向验证已经覆盖两个真实 Node Worker、两次结算、一次 gate-gated promotion 和依赖任务从 promotion HEAD 续作；不等于真实模型自主闭环。

### 3.6 Execution world

- 自定义 Git port 的 world path 必须被 result exporter 尊重；`gitRepositoryWorldPort` 接受 `worldDir`。
- 复制 attempt world 时，`.git/objects/info/alternates` 必须是**相对路径** `../../../../../.git/objects`；绝对 host 路径在容器中会失效。
- `prepare_continuation.mjs` 仅准备新目录；实际 adapter 在本次 principal 容器内检查每个 live World 的对象、alternates、diff/status 和产品 observation，第一 Provider 请求前必须通过。

---

## 4. 关键文件索引

### 产品

- `src/domain/work_state.ts` — `WorkAttemptLiveness`, `WorkNextAction`, `semantic`, `explainWorkState`
- `src/work/read_model.ts` — status facts、`UNOBSERVED`、open-invocation 与 Direct approval/revision 观察；不构造 admission 事件
- `src/work/head.ts` — Head admission 规则与提交前 fence；通过注入观察复核，不直接读取 Git
- `src/work/plan_revision.ts` — plan invalidation/quiescence/receipt 构造；仍由 Controller 原事务写入
- `src/work/unseen_inputs.ts` — 只读 canonical Git basis 观察
- `src/application/work_outcome.ts` — readiness 与 finalize
- `src/application/work_settlement.ts` — principal completion 文案/归属
- `src/adapters/dsh/normal.ts` — normal work tool 描述与 plan/complete 行为
- `src/adapters/dsh/common.ts` — principal-safe status projection（含 semantic）
- `src/project_continuity/service.ts` — journal/openQuestions 投影
- `src/tools/controller.ts` — `planReconciled`、head advance、final-owner quiescence
- `src/cli_product.ts` / `src/cli.ts` — `basis admit`
- `src/deployment/execution_world.ts` — world export / `worldDir`
- `src/composition/core.ts` — Git port/world root 组合

### 测试

- `test/pnwf_product.test.ts` — PNWF direct/governed 产品行为
- `test/pnwf_cq_action_coherence.test.ts` — CQ-A/B/C/D/E + TOCTOU
- `test/pnwf_cq_direct_governed.test.ts` — Direct→Governed 边界反例
- `test/pnwf_cq_basis_admission.test.ts` — 10 项：权限/CONFLICT/HEAD race/初始提示/CLI/真实子进程纵向链
- `test/lean_work_execution_world.test.ts` — custom Git port world root
- `test/odpe_outcome.test.ts`, `test/pwrs_relay.test.ts`, `test/pc1v1_next_action.test.ts` — 关键回归

### 报告 / 证据

- [Bench 树](docs/engineering/README.md#bench-树) — 发布门禁、八条研究线和证据入口，含 software 与 energy 的用例、续作起点和两种 readiness 观察。
- `docs/engineering/PNWF-CQ-RESULT.md` — 本阶段完整报告（含无效 cohort 与超支）
- `docs/engineering/PNWF-CQ-R1-QUALIFICATION.md` — 本轮零付费资格、边界和复现；§5 区分初轮失败与修复后回归
- `docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md` — 按量记账合同、software 与 energy 的模型行为、拒绝、恢复和用量对比
- [Energy 三会话闭环](docs/engineering/ENERGY-PROJECT-CONTINUITY.md) — 首版交付、更正后的 Work 修订与晋升、原生对照；[机器证据](research-evidence/pnwf-energy/2026-11-09/)
- `research-evidence/pnwf-cq-paid/2026-11-08/` — 修复前后与定向观察共六条按量记账轨迹的逐请求用量、归因与原始文件摘要
- `research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json` — 修复后两条真实复跑、逐请求对账、退役窗口与前后对比
- `research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json` — 已退役且交付未记录状态的定向观察，含提示、调用顺序和逐请求对账
- `research-evidence/pnwf-cq-r1/2026-11-07/` — 新预算测试、六组实际容器、产品回归、纵向事件与诊断失败留档
- `research-evidence/pnwf-cq-r1/2026-11-07/release-ci.json` — PR #230 的被检验 head、合并 SHA、远程检查与明确跳过项；独立于发布前的 `verification.json` 快照
- `docs/engineering/PNWF-LIVE-TRAJECTORY.md` — 上一阶段 live trajectory 分析
- `research-evidence/pnwf-cq/2026-11-06/` — 确定性 evidence + 真实 host direct-governed
- `research-evidence/pnwf-cq/live/2026-11-07/` — **INVALID / OVER BUDGET** 容器 cohort
- `research-evidence/pnwf/live/2026-11-06/` — 上一阶段已授权 real-model cohort

### 脚本

- `scripts/pnwf/run_direct_governed_host.sh` — 真实 DSH Direct→Governed（含 operator CLI）
- `scripts/pnwf/isolation_gate.mjs` — 旧独立 canary；其 JSON 不是当前 runner 的执行许可
- `scripts/pnwf/container_adapter.mjs` — 容器内 principal session adapter
- `scripts/pnwf/energy/run.mjs` / `scripts/pnwf/summarize_energy.mjs` — 三会话资格、按 SHA 执行接受与可复算证据
- `scripts/pnwf/analyze_energy_trajectory.mjs` — 离线按 Provider 响应 ID 绑定请求，统计工具清单和 fresh 峰值之前的结果
- `scripts/pnwf/energy/context-variants.mjs` / `revision-review.mjs` — 三个独立 T2 干预及绑定 Git 对象的回执和文件展开。上面的归因脚本用 `--t2-context` 对照旧 T2 和新试验
- `scripts/pnwf/prepare_continuation.mjs` — 复制 recorded state + 相对 alternates
- `scripts/pnwf/score_continuation.mjs` — 机械评分（stream/ledger/exit/domain refusals）
- `scripts/psvr/session_attribution.mjs` — 逐调用归因
- `scripts/pnwf/execution_budget.mjs` / `bounded_provider.mjs` — 硬预算 Mock 预留与显式付费按量记账。请求先登记，终态结算，未知保留并停止准入
- `scripts/pnwf/container_runtime.mjs` / `container_bridge.mjs` / `world_preflight.mjs` — 本次实际容器资格、network=none 的固定 stdio 出口、World 验证
- `scripts/pnwf/qualify_execution.mjs` / `qualification.test.mjs` — 真实容器六场景与 20 项轻量故障测试
- `scripts/lhape/provider_proxy_tcp.mjs` — 兼容文件名，旧凭证环境启动方式现已拒绝；不能继续无预算转发

---

## 5. 验证命令与当前基线

`self-evolution/run.mjs reject-qualify` 从原档和运行位核对候选、两份失败回执及 16 个项目库，可传经核验的旧运行位副本作零付费复验。`reject` 在资格一致后用原安装物触发同项目工作。桥接处理竞争写入错误并让适配器写终态，55 项 CI 中的 Node 测试与桥接修复后的 7 条 Mock、29 笔均通过。旧桥接的实跑保留未写常规终态的事实，可用 `self-evolution/interruption.mjs` 校验停止观察、释放失效写租约和封存 `USAGE_UNCONFIRMED`。[最终零付费资格](research-evidence/pnwf-software/2026-11-22/rejection-retry/mock-fix/qualification.json) · [离线复算](research-evidence/pnwf-software/2026-11-22/rejection-retry/recount.json)

`self-evolution/run.mjs resume-qualify` 和 `resume` 使用已结算的旧停点。续作资格从停点 SQLite 副本读回、精确恢复原稿并拒绝用量未知、错停止原因、改动历史上限和旧请求数错配。独立账本测试确认第 257 笔拒绝。真实候选 22 项定向回归、6 项 readiness 和 15 项 `pnwf_product` 通过，原冷交接正例 0/2。[恢复证据](research-evidence/pnwf-software/2026-11-22/draft-resume/live/draft-restoration.json) · [离线复算](research-evidence/pnwf-software/2026-11-22/draft-resume/recount.json)

自主维护从 `scripts/pnwf/software/self-evolution/run.mjs qualify <new-dir>` 启动。Mock 门禁通过两份原候选正例、三项收尾反例、状态与版本切换、九项恢复反例，参考候选 21 项既有与新增测试通过。真实未提交稿通过旧探针 6/6、22 项三套件与 15 项 `pnwf_product` 串行复验，重放两份原现场仍缺新 `DELIVER`。构建、架构、公共 API、34 项请求准入与归因测试通过。[独立资格](research-evidence/pnwf-software/2026-11-22/self-evolution/mock/qualification.json) · [逐请求复算](research-evidence/pnwf-software/2026-11-22/self-evolution/recount.json)

收尾回归恢复两条历史真实流和原候选，核对提交、最终回复、缺记录和新建议。真实准入 Mock、最终代码复验各两会话，每会话 7 笔模拟、7/7、一次收尾提示，绑定候选 `DELIVER` 后自然退出，新增付费请求为零。最终代码将无结论的 `OPEN/current` 与已有结论的状态区分。复算 `node scripts/pnwf/software/continuity-reuse/recount.mjs research-evidence/pnwf-software/2026-11-22/cold-closeout` 核对账本、调用 ID、Git blob、Journal，并区分 DSH 每轮 step 与会话全局请求号。[回归复算](research-evidence/pnwf-software/2026-11-22/cold-closeout/recount.json) · [最终代码复验](research-evidence/pnwf-software/2026-11-22/cold-closeout/open-episode-qualification/recount.json)

冷交接放行复核从同一原归档实测 `UNKNOWN` 反例及修复后的读回。四个工件摘要一致，公开测试 18/18。两组零付费 Mock 各 7/7、共 12 笔，分别覆盖直接查档及错 SHA 拒绝后从独立维护者取回执。离线复算从原始流配对工具调用、从 Git bundle 读评审、逐行核对 Work 与 Journal。[资格与证据](docs/engineering/CONTINUITY-REUSE-METHOD.md#零付费资格)

交接实跑资格两组均通过 15/15，基线只通过 5/15，显示验收能复现两处已知产品症状。原稿独立构建通过，定向测试 P 21 项、F 27 项。宿主资格与归因 34 项通过。[资格](research-evidence/pnwf-software/2026-11-21/cold-handover/mock/matrix.json)

重启交接追溯在同一真实 gRPC 档案上通过两次冷启动。原生 DSH 侧栏与 Workspace 均读回当前版本和核验记录。四份原工件按 Git blob 核对摘要，Work 和 Journal 原始事件逐行核对。[离线命令](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#离线复现命令)

R4 拆分对照的九项定向回归和四格 Mock 通过。对相同草案的宿主拒绝决定一致，说明组隐藏少排诊断，提示组隐藏新增的优先级说明；已同时核对工具描述及两种签发入口的可见响应。四格各 10/10，P 每格 9 笔、F 每格 8 笔模拟请求，维护者均为零。[复算命令](docs/engineering/DEPOT-R4-GUIDANCE.md#离线复算)

R4 窗口定向回归 7 项通过。旧两份 6/10 的完整 SHA 均能复现 01:30 少排 20 kW。两组 Mock 分别走 DELIVER 或签发预检，均经历超限拒签、少排拒签、最终签发，10/10 自然退出。P/F 各用 9/8 笔模拟请求，维护者均为零。[离线复算](docs/engineering/DEPOT-R4-WINDOW.md#离线复算)

R4 签发定向测试合计 5 项。两组 Mock 经实际签发入口验证超限拒签、引用原回执通过，均为 10/10。历史 R7 的对比 JSON 重算后字节摘要一致，旧 R4 的停止批次与恢复批次可分别复算。[构建、回归和离线复算命令](docs/engineering/DEPOT-R4-RELEASE-POWER.md#离线复算)

在项目根运行 `node --test scripts/pnwf/depot-transfer/{case,release-power}.test.mjs`（PowerShell 中分别列出两条文件路径）。两组历史 6/10 原提交均触发 01:00 超限 20 kW 拒绝。零付费 Mock 分别 9 / 8 笔、各 10/10；完整离线复算见 [签发报告](docs/engineering/DEPOT-R7-RELEASE-POWER.md)。

恢复批次用 `run.mjs verify-resume <原归档> <新归档>` 核对探针与 SQLite、旧四格 Mock、两批次真实归档和候选 Git。合并对比逐次核对联系的调用 ID、回执和拒绝，可离线复算。[完整命令](docs/engineering/DEPOT-TRANSFERABILITY.md#离线复算)

回执适用性工单可用 `node --test scripts/pnwf/depot-transfer/case.test.mjs` 检查原表、仅改文档和修订班表三个反事实。四格 Mock 全部 10/10、自然退出，22 笔模拟请求。矩阵复算入口为 `node scripts/pnwf/depot-transfer/run.mjs verify research-evidence/pnwf-task-selection/2026-11-19/depot-transfer`。[判据与证据](docs/engineering/DEPOT-TRANSFERABILITY.md)

旧第 15 笔可从 SQLite 和网关日志独立复算。新档案复算包含按调用 ID 配对、Git 保护项、回执、维护者退出及逐角色用量。[离线命令](docs/engineering/DEPOT-REVIEW-EXIT.md#第-15-笔独立封存与新会话的复算)

以 `node --test scripts/pnwf/depot-shift-log/review-trial.test.mjs` 回放上轮 26 笔尾部开销及 SHA 绑定。Mock 和真实归档可按独立账本、两个 DSH 流、Git bundle 离线复算。[命令与计时口径](docs/engineering/DEPOT-REVIEW-EXIT.md#如何复算)

运行 `node --test scripts/pnwf/depot-shift-log/materials.test.mjs scripts/pnwf/depot-shift-log/receipt-store.test.mjs` 可从历史 P/F 的完整提交复现操作资料变化，并检验超时重试。新归档还核对九份材料的 Git 模式和 blob、另存 JSON 与实测数据库，以及 Principal 的实际工具结果。[完整复算命令](docs/engineering/DEPOT-MATERIAL-OBLIGATIONS.md#离线复算)

运行 `node --test scripts/pnwf/depot-shift-log/receipt-store.test.mjs` 可复放上轮超时/遇忙重试的完整 SHA。普通 DSH Mock 还注入首次响应丢失，检查重试时实际启动次数和回执内容。归档复算见[本轮报告](docs/engineering/DEPOT-RECEIPT-DELIVERY.md)。

晚班私有实测单沿用归档复算入口 `node scripts/pnwf/depot-relief/archive.mjs --verify <archive>`，按新场景区分公开试排与维护者试排。逐角色用量及回执可用 `node scripts/pnwf/depot-shift-log/observe.mjs <archive> <output.json>` 重算。[报告及复算目录](docs/engineering/DEPOT-SHIFT-LOG.md)

冷夜交班复核的零付费复算入口为 `node scripts/pnwf/depot-relief/archive.mjs --verify research-evidence/pnwf-task-selection/2026-11-19/depot-relief/mock`，将末尾改为 `live` 可重验已封存的真实轨迹、Git 评分与回执。逐笔阶段归因命令见[报告](docs/engineering/DEPOT-RELIEF-COUNTEREXAMPLE.md)。

- 六个真实会话的 Git、冻结评分、逐笔用量和工具调用由 `scripts/pnwf/transit-desk/live-evidence.mjs --verify` 离线核对，两个站牌提交另以旧实现复验新增测试。[命令与证据](docs/engineering/TRANSIT-DESK-LIVE.md#零付费复算)

- `node scripts/pnwf/transit-desk/qualify.mjs` 从新建 Git 项目复算四个输入版本的基线、参考交付与反例。六条 DSH Mock 另可从 bundle、请求账本和原始会话离线复验。[复算命令](docs/engineering/TRANSIT-DESK-USER-TASKS.md#交给执行者与复算)

两域各一对零付费 Mock：软件使用原 P/S 命令及独立复核回执，Energy 复用已接受方案并追加 Harbor Flats 每批 USD 7,500 的承运通告，原生子任务可自行查档。四份 Mock 交付全部通过，30 笔合成请求全部对账。真实停止样本以 SQLite、原始 DSH 流和容器退出状态独立复算。[冻结判据](scripts/pnwf/task-selection/protocol.md) · [复算入口](docs/engineering/TASK-SELECTION-PILOT.md#复算)

gRPC 接续归档在 `0f28f476` 离线复算通过，Mock 清单 43 项、真实清单 40 项。真实所有者核准、Work 事件 8（`PROJECT_REVISED`，`DIRECT_BASIS`）及 Git bundle 的 candidate / accepted 引用指向同一提交 `95b83e71ee9a37041b9918b5e8b797eebabf69c9`。真实 RESUME 压缩原始流的序号 39→40 按 `call_ccfc97275a064338a47c1acb` 配对，查询 `episode:episode-e7050e9ddf64ccebde7f08f6` 返回 `found:false`、`standing:UNKNOWN`。[核准记录](research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/acceptance.json) · [调用与结果](research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/accepted/out/RESUME/attribution/0.timeline.json) · [复算入口](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md#离线复算和打开项目)

[发布 CI](https://github.com/orangeofcarl0-sys/palimpsest/pull/278/checks) 在送审 HEAD 上 16/16 通过。发布复算核对了上轮真实与本轮 Mock、真实两组的轨迹、Git 和 P/S 原判，以及独立副本的原采集与绑定回执。独立副本资格覆盖错 SHA、自报结果、维护者发起 DELIVER、写入隔离及只读 P/S。Mock 共 13 笔合成请求，真实镜像中回算了两笔绑定原候选的 P/S 实测；构建与 44 项定向回归通过。两组归档均含 Git bundle、按调用 ID 配对的结果及独立双现场判分。[复算指令](docs/engineering/FLEET-ISOLATED-REPLAY-REVIEW.md#复算)

跨班复核的普通 DSH Mock 实际恢复上一班的会话 ID、核对原压缩流字节前缀，并单独结算恢复后的两笔请求。配对的 10 笔合成请求对应两个通过 P/S 判分的提交，付费调用 0。已运行构建与 41 项既有计量、归因和夜班回归。两份 Git bundle、角色轨迹和现场判分的复算命令见[跨班复核报告](docs/engineering/FLEET-NIGHT-REPLAY-REVIEW.md#复算)。

夜班档案和按 SHA 试排的定向回归 3/3、计量与提供方回归 30/30、归因回归 8/8，TypeScript 构建通过。四格普通 DSH Mock 用 54 笔合成请求验证检查点、子会话、越界时序、旧 SHA 及预约冲突恢复，付费调用为零。各组的原始 DSH 流、结算、Git bundle 和以提交为输入的隔离回放可分别复算。[复算入口](docs/engineering/FLEET-NIGHT-SHIFT-PAIR.md#复算)

自主 gRPC 本地验证包括构建、架构及公共 API 检查、30 项检查器与项目语义单测、15 项归因与摘要回归、4 项 Workspace 浏览器测试和原生侧栏交互回归。封存含逐笔账本、压缩会话流、Git bundle、Work/Journal 快照和两个界面的读回结果。从归档新建本地项目的命令见[复算与恢复](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md#离线复算和打开项目)。

PR #275 的 15 个 CI job 和独立的 `commit-attribution` 状态首次全部通过。Linux 单测通过 5,112 项、跳过 33 项，浏览器 E2E 38/38，Windows Host Boundary 的四项验证全部通过。R0 的 D2、D4、D5 外部 DSH 执行及 D5 重复运行四个步骤按环境条件跳过。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/275/checks) · [主线 CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44346795814) · [主线 Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44346796036)

本地在同一送审 SHA 通过 6 组定向测试共 59 项，并运行 `node scripts/inspector/dsh-web.mjs --smoke`。隔离项目的第二个宿主在 DSH 窗口打开时登记并认领任务，验证实时新增、固定期间的新观察计数、历史回查、关系聚焦、键盘搜索、深浅主题和 390 像素窄屏。轮询后再次读取账本，序号一致。该实机回归的模型请求数为 0。[复验脚本](scripts/inspector/dsh-web.mjs)

PR #273 的 15 个 job 和独立的 `commit-attribution` 状态首次全部通过。Linux 单测、浏览器 E2E、包安装和 Windows Host Boundary 均通过。R0 的四个外部 DSH 执行步骤按环境条件跳过。发布时从 Git bundle 独立校验原稿、重新读取冻结评分、从原始 DSH 流复算 13 笔逐步归因。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/273/checks) · [发布提交主线 CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44262466177) · [主线 Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44262465879)

主线 `77f2d87e` 的同基线 Mock 通过 12/12，4 笔全结算，自然退出，付费 0。真实 T3 后从原提交快照独立验证 HTTP/2 7/7、公开测试 18/18，原 DSH 流归因复算与同一 SQLite 逐笔一致。评分与归因脚本的 11 项定向回归通过。[Mock](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/qualification.json) · [同一 SHA 审计](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/same-sha-audit.json)

PR #271 送审 SHA 的 15 个 job 和独立的 `commit-attribution` 状态首次全部通过。Linux 单测、浏览器 E2E、包安装验证及 Windows Host Boundary 均通过。R0 的四个外部 DSH 执行步骤按环境条件跳过。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/271/checks) · [发布提交的主线 CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44253430580) · [主线 Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/44253430462)

gRPC T3 离线验收、PNWF、轨迹归因与提交归因共 59 项脚本测试串行通过。覆盖表格列与承接句、缺少逐条成帧、四项用量精确匹配、缺字段、重复四元组、ID 冲突和顺序错配。并行验证中一次既有账本测试抽到 Node `fetch` 禁用的环回端口，串行复测通过。TypeScript 构建、架构及公共 API 检查通过。[复算方法](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#同一-grpc-t3-原稿与轨迹的离线复算)

OpenCode Go 的宿主固定路由与终态用量新增定向回归。43 项 PNWF 脚本测试通过，含模型漂移、用量缺失、冲突、请求结构和 HTTP 拒绝的用例。构建、架构与公共 API 检查通过。真实运行前及收敛请求字段后的两次同基线 Mock 均通过 12 项摘要检查、4 笔模拟请求结算及自然退出。[运行前资格](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-t3-053356/qualification.json) · [收敛后资格](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-t3-053356/normalized-qualification.json)

2026-11-18 gRPC T3 语义验收回归在 PR #267 的 CI 通过。PNWF 脚本测试 37/37，Linux 单测 5,108 项通过、33 项跳过，浏览器 E2E 38/38，Windows Host Boundary 通过。R0 的四个外部 Host 步骤按环境条件跳过。本地 Work、Episode 和 Direct→Governed 定向测试 20/20，构建、架构和公共 API 检查通过。同一核准 HEAD 的最终 T3 Mock 通过，4 笔模拟请求全部结算，公开测试 18/18。[发布检查](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/release-ci.json)

### 必跑

```bash
cd F:/Codex_Work_Space/Palimpsest/palimpsest-sr1
pnpm build
pnpm architecture:check
pnpm architecture:check-public-api
```

Energy T2 范围修复：`node --test scripts/pnwf/energy/contract.test.mjs scripts/pnwf/qualification.test.mjs scripts/psvr/session_attribution.test.mjs` 通过 33/33；构建、架构和公共 API 检查通过。回归包含委派前拒绝六文件计划、Worker 上下文范围检查、证书越界、错 SHA 接受，以及在一次宿主查询中等待结算并提示下一动作。

最终等待式变体的两组 Mock 6/6，29 笔请求全部对账，付费请求为 0。真实会话在通过相同的零付费资格之后才启动。Energy 范围与等待回归纳入常规 CI 的 `unit`。

T2 上下文试验的定向测试通过 35/35，补充错基线、错候选、缩写 SHA、越界文件、脏工作树和短版 Pulse 展开回归。既有 Work/Head 验收集本轮通过 7 文件 61/61，构建、架构及公共 API 检查通过。三个干预的复跑 Mock 9/9 会话、57 笔请求全部对账，付费 0。首轮的两次 Git 索引锁竞争作为零付费失败保留。 [方法与证据](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-上下文干预的独立对照)

两个已接受版本的 T3 专项资格各通过一次 Mock，共 8 笔模拟请求，均提交并记录 `DELIVER` 后自然退出。互换晋升 HEAD 两次均被拒于会话准备前。定向回归通过 35/35。并行复核有一次账本断言期望 `STOPPED`，实际收到 `OPEN`，单独重跑全套通过。原三会话的 136 笔归因可按原输出复算。 [T3 接续资格](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#两个晋升版本的真实-t3)

PR #249 合并前有 15 个 job 和 1 个独立的 `commit-attribution` 状态，全部成功。Linux 全量 5,101 通过 / 33 跳过、浏览器 E2E 38/38、Windows Host Boundary 通过。四个依赖外部 DSH 的步骤未配置宿主，按原条件跳过。[PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/249/checks) · [合并后主线 CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42605621931) · [主线 Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42605621573)

PR #251 的 15 个 job 和精确 head 的 `commit-attribution` 状态全部成功。Linux 全量 5,101 通过 / 33 跳过，浏览器 E2E 38/38，Windows 的四项边界 conformance 检查通过。R0 中 D2、D4、D5 和 D5 可靠性的真实宿主步骤按条件跳过。 [PR 检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/251/checks) · [发布点主线 CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42647207683) · [发布点主线 Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42647207656)

gRPC T2 写范围复跑通过两个软件策略测试、26 项定向产品回归和六个实际容器 Mock 会话。CI 的 `unit` 纳入软件策略测试，覆盖委派前拒绝过宽声明和接管时拒绝受保护文件的注释改动。[资格封存](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/mock-qualification.json)

PR #257 的 15 个 job 和独立 `commit-attribution` 状态全部成功。Linux 全量 5,104 通过、33 跳过，浏览器 E2E 38/38，Windows Host Boundary 通过。R0 四个外部 DSH 宿主步骤按原环境条件跳过。[检查与执行范围](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/release-ci.json)

### 验收集（顺序执行，避免 Windows 并行超时）

共用修订契约的定向套件通过 55 项。覆盖委派前错基线与过宽声明、Worker 与接管校验、最终写账漂移、错核准、串行与并发重复提交，以及重启后的持久复授权和历史回放。构建、架构、公共 API、外部打包安装和 37 项 Node 脚本回归通过。最终版本的旧三会话兼容回归为 gRPC 6/6（39 笔 Mock）和 Energy 6/6（29 笔 Mock）。[验证记录](research-evidence/pnwf-work-revision/2026-11-10/verification.json) · [复现步骤](docs/engineering/WORK-REVISION-CONTRACT.md#零付费复现)

发布 CI 修复了 DSH 适配器的依赖和文件长度回归，把结算重放与 Worker 上下文归回各自所有者，并将 Controller 行数上限收紧至实测的 4,810 行。本地架构与 Work 回归通过 319 项。PR 的 Linux 测试 5,108 项通过、33 项跳过，浏览器 E2E 38 项通过，Windows 边界、归因和打包安装检查通过。R0 的四个外部 Host 实测步骤按工作流条件跳过。发布复跑的普通 DSH 39 笔 Mock 请求全部对账，打包 SDK 两条均从新实例读回已接受版本。[发布验证](research-evidence/pnwf-work-revision/2026-11-10/release-ci.json)

真实复跑沿用主线产品实现，构建、架构和公共 API 通过，轨迹配对与两领域脚本回归共 13 项通过。新旧四条共 160 笔按 Provider 响应 ID 对账。新两条的 118 对调用全部匹配。gRPC 保留冻结消息别名拒绝和首次复核输出错误，在离线副本对同一候选重算 7/7 与 18/18。Energy 独立判分 45/45。两份候选和晋升 Git 树一致。[轨迹证据](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/trajectory-comparison.json)

发布时从原始轨迹离线复算，归因输出与封存一致。两份 Git bundle 独立检出后均能核对候选树与接受树。PR 的 Linux 测试 5,108 项通过、33 项跳过，浏览器 E2E 38 项通过，归因、打包安装和 Windows 边界检查通过。R0 四个外部 Host 实测步骤按现有条件跳过。[发布验证](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/release-ci.json)

结算后 readiness 修复通过 37 项产品回归、13 项脚本回归及构建、架构、公共 API 检查。gRPC 和 Energy 普通 DSH Mock 各验证无显式任务 ID 的 `ACTIVE` 引导、`VERIFYING` 引导及结论允许自然结束，22 和 20 笔 Mock 请求已对账，付费为 0。[资格封存](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/qualification.json)

发布 CI 的 Linux 测试 5,108 项通过、33 项跳过，浏览器 E2E 38 项通过，Windows 边界、归因和打包安装检查通过。R0 四个外部 Host 实测步骤按现有条件跳过。发布复核复算了 47 笔请求、77 对调用与结果，并从 Git bundle 核对候选和晋升树。[发布验证](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/release-ci.json)

```bash
npx vitest run --fileParallelism=false \
  test/pnwf_cq_action_coherence.test.ts \
  test/pnwf_cq_direct_governed.test.ts \
  test/pnwf_cq_basis_admission.test.ts \
  test/pnwf_product.test.ts \
  test/pc1v1_next_action.test.ts \
  test/pwrs_relay.test.ts \
  test/lean_work_execution_world.test.ts
```

本轮原验收集为 **7 files / 57 tests**。扩大回归的初轮为 11 files / 97 PASS / 1 FAIL（Head owner 不得读取 Git 的职责断言）；修复后受影响的 Basis/Head 两文件 **20/20 PASS**，其他 78 项在原批次通过。不要把它写成单次 98/98。architecture 0 violations；public API 0 missing/changed/added；构建通过。

补充命令：

```powershell
node --test scripts/pnwf/qualification.test.mjs
node scripts/pnwf/qualify_execution.mjs --out=<新的证据目录>
node node_modules/vitest/vitest.mjs run test/pc1v1_operator_identity.test.ts test/w_revision_safe.test.ts test/x_project_head.test.ts test/architecture/sr2b2_head_owner.test.ts --maxWorkers=1 --fileParallelism=false
```

结果：20/20 请求故障测试；6/6 实际容器场景；16/16 实例 canary。容器复现需要现存 PSVR recorded sources 和本地 image；不自动下载或伪造源数据。可用镜像 digest：`sha256:ebf870ae77228fa819a332add9d0ba9f1aefc404c0088ea3f6bb28030a0adef0`。

2026-11-08 的本地按量记账验证通过 24/24 请求测试（原 20 项和新增 4 项）、6/6 零付费容器场景、build、architecture 与 public API 检查。Mock 与付费容器使用相同镜像及 adapter 文件摘要。实际付费容器通过 16/16 canary 和复制 World 预检。[机器证据](research-evidence/pnwf-cq-paid/2026-11-08/software.json)

轨迹归因修复后，4/4 归因测试及 24/24 请求测试通过。CI unit job 运行 `node --test scripts/psvr/session_attribution.test.mjs`。真实轨迹离线重算通过 8 个原始文件的摘要验证，原始计量和产品事实与重算一致。评分器的 `--out` 与 `--attribution-dir` 可为重算指定独立目录。[重算证据](research-evidence/pnwf-cq-paid/2026-11-08/software-attribution-recount.json)

Energy 执行前重新通过 24 项请求测试、4 项归因测试和 build。六个零付费容器场景沿用同镜像及八个 adapter 文件摘要的既有资格，实际 energy 容器独立通过 16 项检查和复制 World 预检。两条轨迹的终态用量与账本逐请求一致。[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

`test/pnwf_product.test.ts` 增加 software 和 energy 退役状态的正常工具回归，并覆盖产物缺失、未提交及仍有开放任务的边界。两份计划在旧版复现 `CONTINUE_WORK`，修复后提示 `conclude DELIVER`。六个相关测试文件共 59 项通过，构建、架构和公共 API 检查通过。另用原始 Work SQLite、Git 与 journal 前缀的独立副本离线复核，两条轨迹均能记录 `DELIVER`，8 项和 6 项产物证明与原记录一致。新增付费请求 0。[回归用例](test/pnwf_product.test.ts) · [离线复核](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导)

真实复跑在 `e5312cc` 重新通过 28 项脚本测试、构建、六个零付费容器场景，以及两次各 16 项实际隔离检查。首轮 `F:` 绑定失败发生于 Mock 请求前，随后改用 `C:` 的同提交执行副本，关键构建文件、镜像和 adapter 摘要相符。[复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

定向观察在 `5588cf9` 构建并通过 28 项脚本测试。两个 Mock 用独立副本验证下一模型请求带有 `readiness` 新提示，付费请求 0。两条真实会话分别通过 16 项隔离检查和一项复制 World 预检，原始 Work 与 journal 摘要在复制和运行前后相符。[定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

R3-A2 导入保留三项原始提交及冻结的用例、资格计划和运行证据。本地 TypeScript 构建与两个定向测试文件共 116 项通过。历史资格结论为四组 `UNQUALIFIED`。[资格结果](docs/engineering/R3-A2-SENTINEL-PORTFOLIO-RESULT.md)

PR #242 的 14 个 job 首次运行全部通过。Linux CI 通过 28 项脚本测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与真实下游安装通过，D2、D4、D5 与 D5 reliability 步骤因外部 DSH 环境未配置而跳过。Windows Host Boundary 和 clean-env 通过。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204750) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204837) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42481204867)

PR #239 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与 package-smoke 通过。D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 的 R1-H 为 17 PASS，R1-HR 为 45 PASS / 2 LIMIT，R1-HC 为 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960362) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960372) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42463960477)

`00c5f46` 的主线 CI 与 handoff PR #240 的首个提交均在 `package-smoke` 下游安装时遇到 Ordarium 发布包下载 HTTP 504。现有三次安装尝试已把 pnpm 的 `ERR_PNPM_FETCH_504` 纳入可重试错误，验收仍要求真实安装成功并验证公共入口。404 等确定性解析错误继续直接报错。[主线失败日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42464959904/attempts/1) · [PR 首次失败日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42465099471)

PR #240 的最后一次安装尝试通过，`00c5f46` 的失败 job 单独重跑后也通过。`86483ad` 的主线 `package-smoke` 在三次 CI 运行中均耗尽安装重试，终态均为 Ordarium 发布包下载 504。若第二次安装仍遇到这个终态，最后一次尝试改用 GitHub 官方资产 API 下载同一发布包，逐包校验 `pnpm-lock.yaml` 的 SHA-512 后才更新临时消费者配置。后续实际安装、治理会话及七个公开入口检查均已在独立临时目录验证。[历史主线重跑](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42464959904/attempts/2) · [连续 504 日志](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42466550587/attempts/3)

PR #237 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,985 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 和 package-smoke 通过，D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 的 R1-H 为 17 PASS，R1-HR 为 45 PASS / 2 LIMIT，R1-HC 为 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082427) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082437) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42454082407)

PR #234 的 14 个 job 首次运行全部通过。Linux CI 通过 24 项请求测试、4 项归因测试、4,981 项 Vitest 测试（33 项跳过）、38 项 E2E，以及架构和公共 API 检查。R0 六个 E gate 与 package-smoke 通过，D2、D4、D5 与 D5 reliability 的 gate 步骤因缺少外部 DSH 环境而跳过。Windows Host Boundary 通过，R1-H 17 PASS，R1-HR 45 PASS / 2 LIMIT，R1-HC 26 PASS / 1 LIMIT，clean-env 通过，各组 0 FAIL。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214180) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214270) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42444214078)

PR #232 在 14/14 个 job 成功后合并。Linux CI 通过 28 项脚本测试、4,981 项 Vitest 测试（33 项跳过）与 38 项 E2E 测试，架构和公共 API 检查通过。R0 六个 E gate 与 package-smoke 实际通过。D2、D4、D5 与 D5 reliability 的 gate 步骤按现有外部 Host 条件跳过。Windows Host Boundary 通过。[Linux CI](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438699006) · [R0](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438698982) · [Windows](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42438698980)

轻量请求故障测试已接入 CI unit job。PR #230 在 head `b1554f89ecfa0dacf98e7f52b3ddc677600da051` 上的三套工作流、14 个 job 首次运行全部成功，无需重跑或放宽断言。2026-11-07 全绿后合并为 `b7460f3785406ba8ad3c1a4a5f19f275a38813ad`。

| 远程验证 | 实际结果 | 运行 |
|---|---|---|
| Linux CI | 预算故障 20/20；Vitest 423 PASS / 2 SKIP 文件，4,981 PASS / 33 SKIP 测试；E2E 38/38；构建、architecture、public API 通过 | [42309132630](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132630) |
| R0 | 六个 E gate 与 package-smoke 实际通过；D2/D4/D5 与 D5 reliability 因未配置外部 DSH 环境而跳过执行，绿色 job 不等于这些 gate 实测通过 | [42309132640](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132640) |
| Windows Host Boundary | R1-H 17 PASS；R1-HR 45 PASS / 2 LIMIT；R1-HC 26 PASS / 1 LIMIT；clean-env 10 PASS；architecture / public API 通过，均 0 FAIL | [42309132623](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/42309132623) |

Windows 既有残余边界仍明确保留：HR-39b 不保证多个 ACTIVE world 的原生代码互读隔离；HR-33 不保证兄弟 world 名称的元数据保密；HC-27 当前 confidential profile 串行化 ACTIVE worker，不支持并行 ACTIVE confidential worker。此次 CI 没有把 LIMIT 改成 PASS，也没有运行付费模型。

机器发布记录为 [release-ci.json](research-evidence/pnwf-cq-r1/2026-11-07/release-ci.json)。它只记录上述 PR head 的检查和产品合并；后续交接提交的 CI 以对应 PR 为准，不能复用旧 head 的绿灯。

本机 PATH 过长，cmd/pnpm 子进程可能报找不到 node/tsc。仅在当前进程临时缩短 PATH，或用 `node node_modules/typescript/lib/tsc.js -b`、`node node_modules/vitest/vitest.mjs`；不要修改全局环境或为此升级依赖。

### 架构约束

- `src/tools/controller.ts` LOC ratchet **4830**；不要提高上限。Controller 只保留薄封装，规则放回相应 owner；不能为了 LOC 把写入规则塞进 `read_model.ts`。
- `architecture:check` 的 hotspot 也约束 fanOut（controller 上限 39）。
- 不要把新逻辑塞进 Controller 来“省文件”。

### 本地 Windows 全量 suite 的历史失败

此前全量 `npx vitest run` 在本地出现约 100+ failures，历史归因包括：

- 30s timeouts under parallel load（PNWF/PWRS/PC1/LHAPE/CI3 等；顺序跑会过）
- dirty-tree historical guards（`ad_verification_integration` 要求 protected paths 无 `git diff HEAD`；提交后会过）
- 缺少本地 `python`（`inplace_execution`）
- DSH version drift（全局 `0.2.2-rc.1` vs 合格 `0.2.1-rc.5`）
- Windows cleanup / junction EACCES（R3 historical evidence guards）

**不要**用放宽断言来让全量变绿。先用顺序验收集确认产品路径。

本轮远程 Linux 全量结果已单独列于上表；它不代表这些本地 Windows 历史问题已经逐项消除。远程 Windows 工作流验证 Host Boundary，并不执行完整 Vitest suite。

### 真实 Host

```bash
bash scripts/pnwf/run_direct_governed_host.sh
node scripts/pnwf/isolation_gate.mjs --base="$HOME/pnwf-isolation" --json="$HOME/pnwf-isolation/isolation-gate.json"
```

DSH 合格版本：`@deepseek-ai/dsh@0.2.1-rc.5`，当前位于：

```text
C:\Windows\TEMP\dsh-021\node_modules\@deepseek-ai\dsh\lib\bin.js
```

全局安装可能是 `0.2.2-rc.1`（HR-27 drift）。脚本支持：

```bash
PNWF_DSH_BIN=... PNWF_DSH_MODULES=... bash ...
```

不要为了省事直接升级 DSH；升级必须重新验证 host boundary。

---

## 6. 付费模型实验状态（重要）

2026-11-22 拒绝回执接续沿用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5` 和 `paid-usage-only`，窗口为 256 笔、30 分钟、单笔 240 秒，金额与总 token 无上限。第 1 笔 `2a6bec23-e478-40f2-b6dd-214e3a27613b` 是唯一准入请求，无终态用量，状态为 `UNKNOWN / UPSTREAM_UNCERTAIN`。Docker 启动到退出为 26.434 秒，退出码 137，外层写管道 `EPIPE` 后退出 1。原 SQLite、WAL 和压缩轨迹原样留档，独立记录总量未知。[停止观察](research-evidence/pnwf-software/2026-11-22/rejection-retry/live/interruption.json)

2026-11-22 原稿续作用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5` 和原按量记账。新会话 256 笔、30 分钟、单笔 240 秒，金额和总 token 无上限。43 笔全部对账，fresh 98,176、cache read 2,693,376、cache write 0、output 17,472，总量 2,809,024 tokens，容器耗时 301.332 秒，`UNKNOWN` 为零。原 64 笔账本和停止原判保持不变。[续作账本](research-evidence/pnwf-software/2026-11-22/draft-resume/live/first/out/MAINTAIN/request-accounting.json)

2026-11-22 自主维护首轮用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5`、`paid-usage-only`。沿用 64 笔、30 分钟、单笔 240 秒，金额与总 token 无上限。64 笔全部配对，fresh 220,756、cache read 9,194,112、cache write 0、output 33,156，合计 9,448,024 tokens。546.272 秒时按 `REQUEST_LIMIT` 停止，无新 UNKNOWN。第二张工单保持未准入。[终止账本](research-evidence/pnwf-software/2026-11-22/self-evolution/live/first/out/MAINTAIN/request-accounting.json)

2026-11-22 冷交接收尾复跑沿用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5`、每会话 64 笔和 30 分钟、单请求 240 秒、按量且无金额或总 token 上限。无提示 13 笔、371,688 tokens、185.829 秒，带方法 13 笔、301,466 tokens、139.021 秒。两组各有后续 2 笔收尾，分别 78,275 与 65,738 tokens，维护复核本身新增模型请求 0。共 26 笔完全配对，无新 `UNKNOWN`。[分段用量](research-evidence/pnwf-software/2026-11-22/cold-closeout/recount.json)

2026-11-22 冷交接方法配对沿用 OpenCode Go `deepseek-v4.1-flash`，每会话 64 笔、30 分钟，单请求 240 秒，按量且无金额和总 token 上限。无提示 10 笔、219,126 tokens，带方法 17 笔、533,765 tokens。27 笔全部重绑终态。独立维护者为宿主冷重放，额外模型请求 0。[账本与归因](research-evidence/pnwf-software/2026-11-22/continuity-reuse/recount.json)

2026-11-21 交接工单使用 OpenCode Go `deepseek-v4.1-flash`，每组 64 笔 / 30 分钟 / 单笔 240 秒，按量。P/F 各结算 64 笔，分别 8,652,014 和 11,687,736 tokens，无子任务与未知用量。F 的 `REQUEST_LIMIT` 与终态 usage 由停止容器和原账本离线证明。[对账与用量](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#用量选路与停止现场)

R4 同基线拆分对照已结束。说明组 P/F 分别 31/30 笔，提示组 P/F 分别 34/40 笔；合计 5,482,302 tokens，其中维护者 27 笔、1,363,997 tokens。本轮新增 UNKNOWN 为 0。首条真实会话完成后遇到维护者副本归档故障，已在离线副本恢复，重新通过四格零付费资格后仅启动其余三格。[归档恢复与账本](docs/engineering/DEPOT-R4-GUIDANCE.md#资格与归档恢复)

R4 窗口复跑沿用 OpenCode Go `deepseek-v4.1-flash`、每组 64 笔 / 30 分钟 / 单笔 240 秒，按量、无金额上限。P 26 笔、886,298 tokens；F 33 笔、1,173,376 tokens，共 59 笔全部结算。两组各发起两次维护者复核，分别消耗 2 笔、95,490 tokens 与 6 笔、314,524 tokens，四次回传后均为零请求。[真实配对与前后对照](research-evidence/pnwf-task-selection/2026-11-20/r4-window/comparison.json)

R4 签发配对从同一基线新开两场，OpenCode Go `deepseek-v4.1-flash`，原 64 笔 / 30 分钟 / 单笔 240 秒合同，金额不限。P 34 笔、1,546,268 tokens，F 23 笔、823,305 tokens；共 57 笔全部结算。维护者分别 3 笔、144,794 与 3 笔、146,907 tokens，六次送达后均零请求。旧 R4-P 第 7 笔未知用量未并入。[两场账本和归因](research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/comparison.json)

R7 签发修复真实配对共 60 笔、2,451,154 tokens，全部对账。P 为 29 笔，维护者占 5 笔、246,585 tokens；F 为 31 笔，维护者占 7 笔、339,855 tokens。P/F 终态 HEAD 分别为 `3f757537`、`af47bfbf`，均从同一 R7 基线启动。[修复前后逐组对比](research-evidence/pnwf-task-selection/2026-11-20/r7-release-power/comparison.json)

11 月 20 日 OpenCode Go 工具探针 1 笔、339 tokens、2.538 秒。恢复的 R4-F、R7-F、R7-P 共 134 笔全部结算，6,262,611 tokens，新增 UNKNOWN 为零。探针单列，旧 R4-P 第 7 笔仍无终态。[探针及三格对账](research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/comparison.json)

回执适用性试点真实首格 R4-P 准入 7 笔，6 笔确认 97,161 tokens，另 1 笔 UNKNOWN，总量未知。维护者 0 笔，耗时 7:01.165。[账本与原始证据](research-evidence/pnwf-task-selection/2026-11-19/depot-transfer/live/envelope-P/)

新 cohort 23/23 笔，834,217 tokens，16:17.669；Principal 21 笔、740,581，维护者 2 笔、93,636。前次完整交付为 55 笔、2,914,705 tokens、11:16.154。上一次中断的第 15 笔单独保持 UNKNOWN，原轮总量仍未知。[独立未知用量记录](research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit-rerun/prior-unknown-15.json)

维护者退出复跑为一条真实 P。14/15 笔已结算，确认 440,879 tokens；Principal 10 笔、248,610，维护者 4 笔、192,269。另有一笔 PROVIDER_TIMEOUT，整轮用量未知。总耗时 12:24.244，重算未新增请求。[逐份回执与计量](research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/comparison.json)

旧材料保护复跑一条真实 P，55/55 笔、2,914,705 tokens、11 分 16.154 秒，新增 UNKNOWN 0。其中 Principal 25 笔、910,138 tokens；维护者 30 笔、2,004,567 tokens。合格 Mock 17 笔模拟请求。强原生比较沿用既有封存。[本轮逐笔证据](research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live-observation.json)

回执投递复跑仅开一格真实 P：60/60 笔、3,228,221 tokens，UNKNOWN 0。Principal 37 笔、1,767,613；维护者 23 笔、1,460,608。耗时 15 分 59.221 秒。强原生比较使用上轮封存。14 笔 Mock 为零付费。[逐角色与逐次回执](research-evidence/pnwf-task-selection/2026-11-19/depot-receipt-delivery/live-observations.json)

晚班私有记录实验共 99/99 笔、5,046,278 tokens，新增 UNKNOWN 0。P 的 Principal 18 笔、560,445 tokens，维护者 26 笔、1,736,211；F 的 Principal 37 笔、1,544,875，维护者 18 笔、1,204,747。此前各笔 UNKNOWN 保持原封存。[逐角色用量和回传](research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live-observations.json)

冷夜调度新 cohort 共确认 3,768,125 tokens，UNKNOWN 0。P 54 笔、2,774,616 tokens；F 29 笔、993,509 tokens。上轮调度 F 第 3 笔按原始 SQLite 单列 UNKNOWN，不纳入新账本。运行合同、角色与有效返工、收尾用量见[逐笔复算](research-evidence/pnwf-task-selection/2026-11-19/depot-relief/phases.json)及[旧笔封存](research-evidence/pnwf-task-selection/2026-11-19/depot-relief/prior-unknown.json)。

三工单沿用原 64 笔、30 分钟、单笔 240 秒的按量合同。P 52/52 已结算，1,478,731 tokens；F 25 笔准入、24 笔确认 368,601 tokens。调度 F 第 3 笔 `0fd80c27-fbfb-443b-900c-ecd0836986ab` 无终态，总量未知，已按原条件停止。上轮软件第 15 笔是不同 cohort、不同请求，未计入本轮。[新账本](research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/depot-charge-F/request-ledger.sqlite) · [旧笔独立归档](research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/prior-unknown.json)

选路首轮第 1 格已停止：15 笔准入，14 笔结算 448,610 tokens；第 15 笔 `6b2e3e74-b670-4e60-9094-9e5559c878c4` 为 `UNKNOWN / PROVIDER_TIMEOUT`。全会话总量未知。窗口仍为 64 笔、30 分钟、单请求 240 秒，无金额或总 token 上限。剩余三格没有消耗，原 cohort 关闭。[原账本与逐笔请求](research-evidence/pnwf-task-selection/2026-11-19/live/software-P/request-ledger.sqlite)

本次发布新增付费调用 0。夜班隔离配对按既有 64 笔、30 分钟、单请求 240 秒运行，金额和总 tokens 无上限。真实自主组候选 `848f8e63dd95dacdd19ebaca9b5e158009b8e980`，44 笔、2,805,802 tokens；单人组 `7d6b8bf1176e3b6843c0e732146ff9dec21a5c3e`，37 笔、2,335,223 tokens。81 笔全部结算，UNKNOWN 0。[逐会话汇总](research-evidence/pnwf-software/2026-11-19/night-isolated/live-summary.json)

2026-11-19 夜班回放复核共 97/97 笔、8,642,844 tokens、UNKNOWN 0。自主组 Principal 22 笔、原维护者 31 笔，共 4,211,190 tokens；单人组 44 笔、4,431,654 tokens。原维护者历史用量未重复计入。两组分别提交 `fc6aa6253d9b0c97105c1791fc878909e04fb4c1` 和 `3993ece58bbc484ff6a66916d1bb15313f780ba6`。[分角色核对](research-evidence/pnwf-software/2026-11-19/night-review/live-summary.json)

2026-11-19 夜班四格共 130/130 笔归因，fresh input 306,112、cache read 6,117,760、output 118,409，共 6,542,281 tokens。相加耗时 36 分 25.209 秒。每格使用独立新会话与账本，64 笔、30 分钟、240 秒单笔，金额与总 token 按量。四条试排的最终方案 blob 一致；宿主未签发生产批准。[逐会话用量、调用与版本](research-evidence/pnwf-software/2026-11-19/night-shift-pair/live-comparison.json)

2026-11-19 自主 gRPC 样本沿用 OpenCode Go 和普通 DSH。修订 17 笔、504,260 tokens，接续 5 笔、81,552 tokens，共 22/22 笔归因、585,812 tokens。运行耗时合计 269.315 秒，批准等待与接纳操作另计。Mock 全程 11 笔合成请求，付费调用 0。[分析和复算命令](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md)

### 修复前按量记账

Owner 于 2026-11-07 授权启动付费模型调用，2026-11-08 允许不设计费上限，随后明确授权一条同条件的 energy 续作。software 和 energy 分别使用全新单会话 cohort、独立账本及 `--mode=paid-usage-only`。金额与 token 总量上限为 `null`，每轮最多 64 次请求、30 分钟，单请求等待终态最多 240 秒。[执行与复现](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md)

Software 续作实际执行 4 分 51 秒，27 个请求全部结算，共 982,857 tokens（fresh input 33,921，cache read 934,912，cache creation 0，output 14,024），逐请求与 DSH 轨迹一致。记录 DELIVER、任务退役及原 Attempt 取消，HEAD 保持起始提交，promotion 为 0，主判据 1/1。

Energy 续作实际执行 157.052 秒，29 个请求全部结算，共 987,987 tokens（fresh input 31,412，cache read 944,512，cache creation 0，output 12,063），逐请求与 DSH 轨迹一致。记录 DELIVER、`decision-package` 转 STALE、原 Attempt 转 CANCELLED，HEAD 保持 `e631160`，promotion 为 0，主判据 1/1。两次按量记账运行合计 56 个已结算请求、1,970,844 tokens，未结算请求为 0。[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json)

### Readiness 修复后的按量复跑

Owner 授权从两个原始状态各重跑一条，沿用金额与 token 总量上限 `null`，每条 64 次请求、30 分钟会话与 240 秒单请求等待。两个新 cohort 各复制原状态和 prompt。Software 29 个请求、1,394,801 tokens，energy 26 个请求、1,067,927 tokens。本轮 55 个请求全部结算，共 2,462,728 tokens，终态账本逐请求与 DSH 相符。修复前后四条按量记账轨迹累计 111 个结算请求、4,433,572 tokens。[复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json)

两次复跑均退役旧图并记录 `DELIVER`，自然退出，主判据 2/2。修复前后的 DSH 时间为 software 260.505 → 162.069 秒，energy 126.927 → 150.026 秒。两条从退役到退出的时间缩短，且两条都跳过了退役后的 `readiness` 查询。归因结果把整条轨迹变化与新提示采用分开记录。[复跑对比](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#readiness-修复后的真实模型复跑)

### 退役状态下的 Readiness 定向观察

Owner 授权从两份已退役、交付尚未记录的状态各跑一条真实续作。新 journal 保留源 seq 1–2，人工 prompt 只要求先查 `readiness`，常规 `pulse` 引导来自 Host。两条都在步骤 1 收到新提示，在步骤 19（software）和步骤 9（energy）记录 `DELIVER`，随后自然退出。两条从起点保留原 HEAD、退役任务和 Work 事件。[定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json)

两次沿用 `paid-usage-only` 和原终止条件。Software 20 个请求、542,023 tokens，energy 10 个请求、214,469 tokens。30 个请求全部结算，共 756,492 tokens，逐请求用量与 DSH 相符。六条按量记账轨迹累计 141 个结算请求、5,190,064 tokens。[定向报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察)

### Energy 三会话项目

每个 Session 独立 cohort 和 DSH home；真实 T1 从原轨迹复用。仍用 `deepseek-flash`、DSH `0.2.1-rc.5` 和 `paid-usage-only`。每轮 64 笔、30 分钟、单请求 240 秒，Worker 和原生 Subagent 计入同一窗口，金额和总 token 不设上限。

两个未送审复跑合计 111 笔、3,613,879 tokens，全部结算。原生路径偏离为 47 笔、1,502,063 tokens；正式 Worker 成功结算但 Principal 达到请求上限的轨迹为 64 笔、2,111,816 tokens。[路径偏离](research-evidence/pnwf-energy/2026-11-09/scope-route-observation.json) · [请求窗口停止](research-evidence/pnwf-energy/2026-11-09/scope-request-stop.json)

两个完整周期均通过：Palimpsest 61 笔、1,555,257 tokens、520.9 秒，含复用的 19 笔 T1；强原生 DSH 75 笔、1,690,107 tokens、565.6 秒。候选就绪到接受分别为 101.5 秒、269.3 秒，独立于模型时间。本轮新增 228 笔、6,324,199 tokens，含两个未送审复跑，全部结算。[账本、归因和接受记录](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json)

发布前离线分析再次按 Provider 响应 ID 核对 136 笔成功周期请求，未产生付费调用。P 总输入少 112,087，fresh 多 28,457；T2 占差额 16,043。主会话工具清单、后续大回显和缓存命中均有观测；各输入块的独占 miss 未测。[逐请求归因](research-evidence/pnwf-energy/2026-11-09/trajectory-attribution.json)

### Energy T2 上下文独立对照

基线 `8041871314136d417b285a800265858757463f68` 已核准，三个变体按量记账，沿用 64 请求、30 分钟、单请求 240 秒。新增 **87 笔、1,980,317 tokens**，含主动取全文的短版 Pulse 观察，未确认用量为 0。三组 fresh / cache read 依次为 51,666 / 619,520，41,617 / 807,296，35,140 / 373,632。旧 T2 对照计量独立。 [对比证据](research-evidence/pnwf-energy/2026-11-09/t2-context-variants.json)

- 回执候选 `8e8af7cc510f471e7a0b75ea6d878217307ace93` 晋升到 `caaeb4f1fa8f01681019ba38894dbab43db3222f`，定向回读候选 `027a4dc1e75fdd83ab8e81e32679664e5c5d467a` 晋升到 `3bf8da0006f9c1f72b057a1906afe4f0ba0942a1`。两次均按所有者核准的完整 SHA 绑定 Promotion，候选树和晋升后的 Git 树相同，证书 blob 与基线一致。晋升新增模型请求为 0。 [候选与接受](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#验收用量和展开)
- 短版 Pulse 原始结果 `BRIEF_PULSE_NOT_OBSERVED`，实测 `detail: full` 一次。离线复核候选 `21e05594218352978005764d6a1786f26bf406c3` 的门禁 PASS、业务 45/45，保存为诊断。短版将同一回显离线从 12,716 缩到 8,195 字节。 [验收和审批](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#验收用量和展开)

### Energy 两个接受版本的 T3

- 回执从 `caaeb4f1fa8f01681019ba38894dbab43db3222f` 提交摘要 `5d0ab8d6b841acc7a2e5f582e7ce4c97fb4a6b13`，14 笔请求，21,836 fresh、356,992 cache read。原判分 `REVIEW_CONTENT_MISMATCH`。摘要日期、容量、配置、成本、工期和审批事项通过内容核对，缺更正文件名。 [原稿](research-evidence/pnwf-energy/2026-11-09/t3-receipt-procurement-review.md)
- 定向回读从 `3bf8da0006f9c1f72b057a1906afe4f0ba0942a1` 提交摘要 `c9951ce3a911cc55e140c4aab2195e3a32c4ec0c`，11 笔请求，20,643 fresh、274,304 cache read，严格判分 PASS。 [原稿](research-evidence/pnwf-energy/2026-11-09/t3-read-plan-procurement-review.md)
- 两条 `DELIVER` 后均自然退出。各只改采购摘要，新增 25 笔、689,857 tokens，逐请求归因 25/25，未确认用量为 0。两组首笔输入相同，差异出现在后续工具序列。T3 专项资格收据在各原始目录的 `t3-qualification.json`，用 `--t3-context` 复算。 [T3 证据](research-evidence/pnwf-energy/2026-11-09/t3-context-continuation.json)

### gRPC T2 写范围复跑与 T3

两组从各自原 T2 基线各复跑一次，按核准 SHA 接受后启动 T3。四个真实会话共 106 笔、2,993,030 tokens，全部结算，186 对工具调用和结果已复算。T2 前后对比和审批等待分列于报告。[复跑报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#t2-写范围与拒绝回传复跑) · [账本与轨迹](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/evidence.json)

### 共用 Work 义务真实 T2

原按量记账窗口为每会话 64 笔、30 分钟、单请求 240 秒，金额和总 token 不设上限。gRPC 44 笔、1,364,811 tokens，Energy 46 笔、1,117,558 tokens，未确认用量为 0。各自同基线旧对照为 40 和 30 笔。Energy 虽多 16 笔，fresh input 下降 4,758，cache read 增 362,496，容器会话耗时相近。两条均未使用原生子任务或接管，Owner 核准后离线晋升。未启动 T3。[报告](docs/engineering/WORK-REVISION-LIVE-T2.md)

结算引导修复后，从 gRPC 原基线复跑一条真实 T2，沿用同提示、镜像、判分器和窗口。47 笔、1,492,257 tokens 全部对账，77 对调用匹配。Principal 在 `ACTIVE / COMPLETED` 读到新引导，调用 `next` 和 `conclude WAIT_FOR_OPERATOR`，自然退出且无重复结算。候选 `be05447e061a23157ed04e3ee4b27ec7f571e94e` 经核准晋升至 `4639ae44d78e7c1f9f5269876fa333a99bff770f`，候选和晋升树一致。[轨迹](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/trajectory-comparison.json) · [核准记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/acceptance.json)

随后从该晋升 HEAD 接续一条真实普通 DSH T3，原按量记账窗口和冻结提示、判分器保持一致。13 笔、361,849 tokens 全部结算，22/22 对工具调用与结果匹配。较上轮普通 DSH 少 1 笔、22,573 tokens 和 6.719 秒。接受记录只读，评审为接受 HEAD 的直接子提交，两个公开测试运行均 18/18，记录 `DELIVER` 并自然退出。冻结评分仍停在 `zero or omitted`，离线核对保留原稿未明确写出每条 Reading 一帧的事实。[轨迹与内容审计](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/trajectory-and-review-audit.json)

### gRPC T3 同基线语义验收复跑

2026-11-18 从核准 HEAD `4639ae44d78e7c1f9f5269876fa333a99bff770f` 启动一条普通 DSH 真实 T3。保持 `paid-usage-only`，64 笔、30 分钟、单请求 240 秒，金额与总 token 无上限。首笔收到 `PROVIDER_HTTP_402`，1 笔登记、0 笔结算、1 笔未知，实际用量未知。容器 28.863 秒后因 `usage_unobservable` 停止，退出码 137。没有工具调用、摘要提交或交付结论。原始 DSH 流和 SQLite 保留在 `%TEMP%/pnwf-grpc-review-semantics-20261118-035705`。[运行合同](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/contract.json) · [真实账本](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/request-accounting.json)

随后只读核对确认原请求仍未结算，并核对到 DeepSeek 当前余额不可用及所选 OpenCode Go 凭据的模型目录请求返回 401。准入仍待原 DeepSeek 单笔账单或 Provider 回执，以及选定路由的终态用量验证。同一接受 SHA 和停写状态副本已核对，新会话尚未启动。[对账报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#http-402-对账与复跑准入)

所有者随后明确允许将旧 402 留在独立 cohort。用当前 ZCode Provider 配置跑通 OpenCode Go 一笔最小请求，并从同一接受 HEAD 启动真 T3。两条新账本独立，最小请求全结算 50 tokens，真实 T3 首笔 HTTP 400 后使用未知用量规则停止，登记 1、结算 0、未知 1。旧 402 和两轮冻结原判逐字节保留。[OpenCode Go 报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#opencode-go-同一接受版本的真实-t3)

随后所有者也允许将 HTTP 400 独立留档。修正后工具探针和真实 T3 使用两个新 cohort。探针 1 笔、375 tokens，工具结果按调用 ID 在本地配对。真实 T3 14 笔、458,889 tokens 全结算，0 未决，194.233 秒。只提交评审，记录 `DELIVER` 后自然退出。两次历史停止的 SQLite 与归档均核对为 `UNKNOWN`，没有并入本轮账本。[历史停止核对](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/prior-stops.json) · [真实账本](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/request-accounting.json)

同一 OpenCode Go 路由在 `77f2d87e` 复跑，新增真实 13 笔、371,181 tokens、147.050 秒，未决 0。相比此前同核准 HEAD 样本少 1 笔、87,708 tokens 和 47.183 秒。Provider 的余额扣款字段合计 0，Go allowance 字段合计 0.01274861，上一条为 0.008199。Mock 与离线复核新增付费调用 0，历史 402/400 未合并入本 cohort。[逐笔账本](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/request-accounting.json) · [对比](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json)

### 2026-11-07 历史 cohort

| 项 | tokens |
|---|---:|
| 非 cohort adapter smoke（`CONTAINER_SMOKE`） | 1,495,807 |
| software session | 1,720,995 |
| energy session | 1,973,976 |
| **实际总计** | **5,190,778** |
| 原授权 | 5,000,000 |
| **超支** | **+190,778** |

- 2026-11-07 容器 cohort：**0/2 primary**，两次都 budget killed，`complete=0`、`conclude=0`、task ACTIVE、attempt RUNNING、promotions=0、head 未动。
- 结果 **INVALID**：
  1. 复制的 attempt world alternates 曾是绝对 Windows 路径，在 Linux 容器失效（已修为相对路径）。
  2. budget watchdog 看不到 in-flight usage；provider proxy 没有 pre-call token cap，导致超 ceiling。
  3. smoke 因 mock 端口被占用误打真实 proxy，1,495,807 tokens 已计入，未隐藏。
- 证据：`research-evidence/pnwf-cq/live/2026-11-07/`。
- PNWF-CQ-R1 新增付费调用 **0**；历史金额、INVALID 裁定和原始证据不变。

### 执行条件

1. 按量记账使用全新单会话 cohort 和 SQLite ledger。Runner 核对会话、请求次数和时长配置，容器 adapter 检查本次实际 uid、网络、挂载、canary 和 Git World。
2. 转发前持久登记 `PENDING`。完整终态响应结算 fresh input、cache read、cache creation 和 output。断流或用量缺失记 `UNKNOWN`，停止 cohort 并保留记录。
3. 付费路由由宿主固定为 DeepSeek Messages 与 `deepseek-flash`，凭证由宿主读取。容器经固定 stdio 出口发请求，服务端工具由代理拒绝。
4. 同一版本先通过零付费故障测试和实际容器验证。要求硬预算时，继续使用有界合同，并为真实 Provider 单独证明上界。当前真实 Provider 的硬预算资格仍为 `PROVIDER_BOUND_UNQUALIFIED`。

---

## 7. 已知未解决问题 / 建议下一步

真实拒绝回执接续确认了同项目投递、稳定安装物、被拒候选和新 DSH 的启动。首笔 UNKNOWN 截断了模型诊断，未观察到模型回复、工具调用、候选、核准或换版。两份原现场的 0/2 仍属于前一次续作。真实版本接班和里程碑二保持开放。[停止现场与复算](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#真实接续与-unknown-停点)

原稿接续实跑已走到读前代记录、复验、提交、`DELIVER` 和自然退出。两个端到端正例仍未通过。模型围绕已经有结论的 case-3 验证 handoff，把首轮的手动 readiness 修复作为交付，本轮相对原稿只新增注释。原来两条会话提交后没有再查 readiness，普通一次性宿主没有给出新结论机会。真实接班保持条件式准入，里程碑二继续开放。[独立验收](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#独立验收与发布决定)

自主维护试点能把封存事件投递给普通 DSH，并已在 Mock 用独立合格构建接班。真实首轮的发现与修订发生在模型内，但修订只覆盖手动查询 readiness。两个原现场中的模型均未查询，原一次性宿主结束路径仍可复现。第 40 笔才开改，第 54 笔已有成组通过的验证，后段扩展测试和等待耗尽请求窗口。真实接班要求独立接受的候选及后继实际工作，也继续分别核对其他模型是否提供了被采用的反证。[真实停点与复验](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#未提交原稿的独立复验)

冷交接原配对保留缺 `DELIVER` 的 7/7 与 5/7。本次两组均主动求证、引用独立实测并提交修订，随后正式交付并自然退出。无提示组 6/7 是授权边界跨行触发的判分缺项，带方法组 5/7 仍有当前来源路径与保留区约束两项缺失。复核证据由宿主预先冷重放，同伴模型的自主发现和反馈闭环仍待验证。每格一次，方法提示对选路和用量的收益仍不明确，里程碑二继续开放。[真实配对结论](docs/engineering/CONTINUITY-REUSE-METHOD.md#冻结判分和用量对照)

真实交接样本显示长期调查和测试环境开销可以耗完整个请求窗口，P/F 首次改源码分别已用到第 44/36 笔。两组初次启动 Vitest 都遇到只读依赖目录的配置缓存写入。F 找到 runner 加载器，P 在排查中耗尽。另有原生容器停止后桥接 `EPIPE` 导致常规终态文件缺失。原稿与停止现场独立封存，均未形成已提交的可发布候选。[原稿与停止点](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#用量选路与停止现场)

交接追溯修复已发布。结论解释中的当前版本依据 Work 的已有接受事件，同时保留历史交付判断及其原基线。早期没有记录工件摘要或 Work 核准的项目按现有证据读回。原始轨迹与回归可并列核对。[验收与复算](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#交付验收)

R4 证明了在原数值、原表实测与证据优先级说明均可见时，两位 Principal 能在没有少排提示的情况下修正末格。四格都主动求证了原表和修订表，仍未观察到单凭说明跳过求证的行为。每格一次，历史对照的签发门禁亦有变化，不能估计两项干预各自的平均收益。[对照边界](docs/engineering/DEPOT-R4-GUIDANCE.md)

窗口修复已把可确定的来源选择与少排检查纳入签发。两组都采纳了预检指出的缺额；本轮没有观察到维护者首次提出反例并改变 B 的放行决定。里程碑二保持开放。本例支持把数据适用性和目标验收视作可复用的契约问题；模型是否能在工具未点名缺额时自行提出有价值的替代方案，仍需独立证据。[归因边界](docs/engineering/DEPOT-R4-WINDOW.md#如何区分契约缺口任务特例和模型能力)

R4 的 50/50 合法但使 B 少充 9 kWh。两组都把旧楼宇负荷模型与晚班已生效的逐格上限叠用，复核已选班表未发现漏用容量。当前按 SHA 签发验证请求合法性，服务质量由独立验收记录；里程碑二保持开放。本轮不能支持“模型会按证据适用范围决定是否再测”的判断。[R4 与 R7 的放行决定](docs/engineering/DEPOT-R4-RELEASE-POWER.md#复核成本与决策收益)

R7 首次配对两边都签发了超限班表，各 6/10；修复后两边均主动处理拒绝、采纳受限新班表的车端实测并交付 10/10。本轮表明该契约能引导两种执行方式正确签发，此样本未显示 Palimpsest 相对强原生的质量优势。R4-P 的原超时仍限制固定上限场景的比较，里程碑二保持开放。

本轮真实 P 完成了“原表一次求证、Principal 自算修订并交付”的路径。修复版本中，两份实测回执都送达且两次复核回传后都零请求的组合已在 Mock 验证，在真实样本中仍待观察。

真实原表复核已证实回传后零新增请求、自然退出；修订表复核及最终交付在本轮仅由 Mock 跑通。超时前 Principal 计算出正确两格和余量，Git 保留原表。上轮 10/10 原判继续保留。[真实停止点](docs/engineering/DEPOT-REVIEW-EXIT.md)

夜班旧材料保护在本次 P 复跑中通过。仍需区分维护者实测和其隔离副本内的额外工作：两次有效实测发布后的 26 笔回复合计 1,787,759 tokens。交班稿对楼宇负荷具体转移时段的表述超出返回回执直接证明的内容。里程碑二继续开放。[报告](docs/engineering/DEPOT-MATERIAL-OBLIGATIONS.md)

本轮已观察到 P 收到私有反例并据此修订的实证。上轮首次调用超时和重试遇忙的失败记录继续保留。该轮留下的旧材料保护问题是：当时的 P 与此前强原生均修改了 `operations/desk.md` 和 `operations/retest.mjs`。成功投递来自单工单复跑，里程碑二保持开放。[三轨对照](docs/engineering/DEPOT-RECEIPT-DELIVERY.md)

上一轮有一条维护者独有反例改变实际交付的强原生轨迹。旧版 Palimpsest 发问时的完整 SHA 正确，首次有效实测在约 78 秒生成，Principal 调用约 300 秒时失败，宿主约 518 秒后记 RETURN。判断采纳须按调用结果与工作区写入核对。强原生虽恢复原始采集，仍修改受保护文件。[两条原始轨迹与评分](docs/engineering/DEPOT-SHIFT-LOG.md)

此前共享采集的冷夜调度观察到双方自发寻求同伴确认。该轮两位 Principal 在同伴回答前都自行观察到了决定性缺口。P 维护者私有测试与提交未进入交付；F 交班稿中关于可延负荷实际落点及效率的表述超出电表可证明的范围，见[逐项复核](docs/engineering/DEPOT-RELIEF-COUNTEREXAMPLE.md)。

- 三张工单的真实轨迹尚无同伴贡献链，里程碑二继续开放。编辑 F 的工作稿未提交，站牌两组的冻结布局拒绝和业务复验并存，调度 F 在数值产出前中断。该域的两组完整交付与成本差值尚不可估。[样本边界](docs/engineering/TRANSIT-DESK-LIVE.md#交付与用量对照)

- 三张新工单已具备真实选路对照的业务材料。本轮六条 Mock 的交付路径由脚本指定，开放网络检索版本只验证了参考交付。实际的选路、谁找到反例及其是否改变交付，均需真实轨迹与候选差异。上一轮 UNKNOWN 仍按原合同停留在软件首格。

- 选路试点未形成两域的真实配对；当前资源合同在终态用量未知时停止后继会话。原宿主另报 `write EPIPE`，未写常规最终回执；账本已停止，独立核对保留会话行 RUNNING 的现场。真实模型有亲自实测的反例，未观察到采纳或交付。[停止现场与归因](docs/engineering/TASK-SELECTION-PILOT.md)

- 隔离复核回执驱动采纳已有脚本化 Mock 证据。真实自主组本次选择自行查档，独立识别并修正问题；本次没有同伴回执被真实 Principal 采纳。两组修改前都没有在原 SHA 上跑出 S 的误报，原缺陷由宿主独立验证。[发现与采纳的归属](docs/engineering/FLEET-ISOLATED-REPLAY-REVIEW.md)

- 上轮[重绘单人原稿](docs/engineering/FLEET-NIGHT-SHIFT-PAIR.md#重绘现场的单-principal)保留原误报。此前共享工作区的真实求证暴露了两处边界：档案来自并列模拟现场却有相同标识，维护者在被咨询时能写 Principal 的工作区并记录项目结论。两组均把上一班 S 当作唯一真本。本次独立副本实验已冻结两个来源、原始材料及命令对“异常”的定义。单人组轨迹还读到了 Git FETCH_HEAD 源路径里的场景名。[逐项复核](docs/engineering/FLEET-NIGHT-REPLAY-REVIEW.md)

- gRPC 真实样本的贡献和采纳决定均为零。接续者成功查到核验日志，但 `explain` 直接查已重开的 Episode ID 返回 `UNKNOWN`，版本依据也出现在 Pulse 的 open questions 中。该条记录原类为 `REFERENCE_NOTE`，正式接受由 Work 事件 8 证明。[逐项读回](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md#真实项目的接受与接续)

- Work 历史按项目账本序号重建，跨重启可查。侧栏打开期间每 1.5 秒采样，保留最近 90 次现场变化。Worker 作业和 DSH 调用只能从实际运行它们的宿主观察，重启后现场观察重新积累。本轮在 DSH `0.2.2-rc.2` 验证了这些视图的切换。[使用与复验](docs/user-guide.md#dsh-侧栏工作检查器) · [时间与来源边界](docs/product/visualization/PLAN.md)
- 组织修订、工作世界和动态关系已可按绑定来源查看。成员集合轮廓、多入口身份导航与人因对照仍属设计工作。gRPC 与 Energy 的历史材料及五时点样例供复核。[结构与交叠](docs/product/visualization/STRUCTURE-AND-OVERLAP.md) · [工作面样例](docs/product/visualization/prototype/structure.html)

上轮 gRPC 的 `CONTINUE_WORK`、重复完成拒绝和缺等待结论均保留。修复后的真实复跑已走通结算到等待结论。原生 `job_output` 与 Work 作业 ID 的误用在本轮仍出现一次，随后用 `work workers` 恢复。[调用序列](docs/engineering/WORK-REVISION-LIVE-T2.md#结算后-readiness-修复与-grpc-同基线复跑)

下一轮的实施顺序与判据见路线图。下列条目记录相应的剩余风险和证据。[项目发展路线图](docs/product/PROJECT-ROADMAP.md#下一轮实施顺序)

1. **真实 Provider 的硬预算资格**
   - 请求前预留、Mock 身份和实际容器故障链已实现并验证。
   - DeepSeek 兼容路径的 `max_tokens` 不能直接视为已证明上界；真实输入 token 上界也需明确证明。
   - `PROVIDER_BOUND_UNQUALIFIED` 约束硬预算模式。Owner 允许的按量记账实验使用 §6 的独立合同。

2. **跨 Host settlement 残余风险**（P1）
   - 无 Invocation 记录时，principal 仍可结算；产品只保证 `UNATTRIBUTED` 与不声称退出。
   - 若要机械拒绝，需要显式 principal-authored declaration 或 durable writer marker；不要新增通用 liveness runtime。

3. **Operator identity federation**（P2）
   - 当前是本地 Ed25519 bearer credential；不是 IdP/SSO。
   - 远程部署应提供自己的 `OperatorAuthorityPort`。

4. **真实模型产品闭环**（P1）
   - `77f2d87e` 的真实 gRPC T3 验证了 OpenCode Go 缺 ID 自动归因和 `DELIVER` 自然退出。新版前三条规则位于表格两行，v2 仍从正文子句匹配新版规则，冻结评分因此保留 11/12。同一提交的内容和服务行为复核通过，评分脚本仍存在新版表格漏判。[原判](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/result.json) · [同一 SHA 复核](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/same-sha-audit.json)
   - 修正路由的 OpenCode Go T3 已真实交付并自然退出。后续离线修复以同一原稿和压缩流通过 12/12 项摘要检查及 14/14 笔归因。语义评分扩展到首版表格列和同段承接句，请求归因在封存的 OpenCode Go 单一 Principal 流上接受唯一四元组，歧义拒绝。真实原判、两轮冻结原判和两个独立的 `UNKNOWN` 停止现场均保留。[离线复算](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#同一-grpc-t3-原稿与轨迹的离线复算)
   - gRPC T2 写范围复跑保留了四个保护 blob。Palimpsest 走正式 Worker，强原生组的主工作区检出切换仍触发守卫，候选经离线核准后从原基线副本接受。两组 T3 均提交并自然退出，冻结原判均失败。离线核对区分了措辞差异与原稿未明确覆盖的协议边界。[软件试点](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#t2-写范围与拒绝回传复跑)
   - 两种状态各一次定向观察证实，指定先查 `readiness` 后，模型收到新提示，并在后续步骤记录 `DELIVER` 和自然退出。原始状态的两条修复后复跑都在退役后直接验证并交付，退役后查询 `readiness` 为 0。两组保留各自的起点和触发条件。[定向观察与原始状态复跑](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役状态下的-readiness-定向观察)
   - Energy 在 RUNNING Attempt 下用 `metadata_only` 移除任务，收到 `quiescence_required`，随后按 `successor` → `plan` 恢复。Software 的失败探针是另一个层级的作业错误。两种恢复顺序及耗时见对比报告。
   - Energy 等待式变体已完成真实 Worker、结算、按 SHA 晋升和 T3 接续，强原生对照也完成。默认业务提示曾引发原生委派偏离；仅指定 Work 路径时又在结算后耗尽请求。后续产品验证可关注正式 Worker 的完成通知和 Work 作业 ID 提示；真实成功轨迹仍有一次把 Work ID 传给原生 `job_output` 的错误。
   - T2 回执组 Worker 以回执替代大段修订 diff，Principal 仍读取一次完整 diff 加一次文件展开。定向回读组 Principal 略去结算后 diff，Worker 的细粒度编辑增多。短版 Pulse 的真实默认值采用和用量收益仍待观测。四组角色数相同，首笔缓存命中已存在差异。 [轨迹分解](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#如何解释缓存差异)
   - 两条接续 T3 的 `DELIVER` 回执中，摘要内容摘要值匹配实际 Git blob，`commit` 字段却指接受 HEAD。交付持久化已另外由 Git 子提交核实。回执组读过更正文件但成文漏引精确文件名，严格 T3 判分保留失败。 [T3 核验](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#摘要提交和退出)

5. **外部原生 HEAD 并发**
   - 提交前读取以前的变化可阻止并回滚；最后一次 Git 读取后的外部变化不能与 SQLite 原子封锁，后续执行 fence 会拒绝漂移。

6. **文档/证据一致性**
   - 历史报告为 `PNWF-CQ-RESULT.md`；当前资格为 `PNWF-CQ-R1-QUALIFICATION.md`。历史 §6 已统一为先 NOT_EXECUTED、后 EXECUTED/INVALID 的时间线。
   - 证据目录不要事后修改原始 stream/state；新增分析放新目录或新文件。

---

## 8. 交接同步协议（必须遵守）

### 何时更新本文件

每次**重要更改**后，在同一次 commit 中更新本文件。重要更改包括：

- 合并/回滚 PR
- 修改 Work/Attempt/Settlement/Promotion/ProjectHead 权限语义
- 修改 `status` / `readiness` / `nextAction` 的模型可见语义
- 新增或改变付费实验、预算、authorization、cohort
- 改变 DSH 版本、isolation image、host boundary
- 改变测试基线（新增/删除 acceptance tests，已知失败归因变化）
- 发现并修复影响真实项目执行的产品缺陷

### 更新哪些 section

至少更新：

- §0 30 秒版本
- §2 Git 状态（`origin/main`、当前分支、工作树）
- §5 验证基线（如果测试数变化）
- §6 预算状态（如果发生任何付费调用）
- §7 未解决问题
- §9 变更日志（追加一行）

### 变更日志格式

```markdown
| 日期 | 变更 | 证据/PR | 备注 |
|---|---|---|---|
| 2026-11-22 | 由验收拒绝回执唤醒同一维护项目 | [报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#验收拒绝回执触发同项目接续) | Mock 接班通过，真实首笔 UNKNOWN，桥接断管原样保留，运行位阻断后续准入 |
| 2026-11-20 | 任务选路试点与 R7 签发契约发布到主线 `f1c1424a` | [PR #281](https://github.com/orangeofcarl0-sys/palimpsest/pull/281) | 16/16 项检查通过，12 对提交文件树一致，历史 UNKNOWN 与 R7 两份 6/10 保留，本轮两组均 10/10 |
| 2026-11-07 | PR #227 merged: PNWF-CQ + basis admission | 1766a79 | 容器 cohort INVALID/over budget |
```

### 提交要求

- 本文件与代码/证据一起提交；不要只在本地改。
- 如果只更新 handoff，使用 `docs(handoff): ...`。
- 不要把本文件放进 `research-evidence/` 或临时目录。

---

## 9. 变更日志

| 日期 | 变更 | 证据/PR | 备注 |
|---|---|---|---|
| 2026-11-22 | 补齐已结算请求上限停点的原稿接续 | [报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md#从请求上限停点接续原稿) | Mock 接班通过。真实 43 笔提交、记录结论并自然退出，两份原现场仍缺新 `DELIVER`，未启动核准或后继 |
| 2026-11-22 | 落地首轮自主维护、封存唤醒与稳定版接班资格 | [报告](docs/engineering/PALIMPSEST-SELF-EVOLUTION-PILOT.md) | Mock 接班通过，真实 64 笔触限并留原稿，手动 readiness 6/6，宿主原故障仍可复现，未进入核准 |
| 2026-11-22 | 将自改进目标推进到 Palimpsest 自主维护与稳定版接班 | [规划](docs/product/PALIMPSEST-SELF-EVOLUTION.md) | 冷交接原档作为首个自主验收，连续接班尚待验证 |
| 2026-11-22 | 修复冷交接提交后的 DSH 收尾与直接交付 readiness | [报告](docs/engineering/CONTINUITY-REUSE-METHOD.md#提交后的收尾引导与同基线复跑) | 两条原轨迹回归，两轮零付费 Mock。真实复跑均主动取得并采纳回执、第 12 笔记录 `DELIVER`、第 13 笔自然退出，6/7 和 5/7，26 笔全对账 |
| 2026-11-22 | 发布两轮受控自改进实现、路线图和归档到主线 `1b476032` | [PR #293](https://github.com/orangeofcarl0-sys/palimpsest/pull/293) | 16/16 项检查通过，三个提交的树逐一一致，原判与缺新 `DELIVER` 保留，发布新增付费请求为零 |
| 2026-11-22 | 从真实 gRPC 冷交接工单验证核准方法与自主求证 | [报告](docs/engineering/CONTINUITY-REUSE-METHOD.md) | Mock 7/7、7/7，真实 7/7、5/7，两组均缺新评审 DELIVER，27 笔全对账 |
| 2026-11-21 | 在真实交接维护工单上配对实跑 | [报告](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md#真实模型配对) | 各 64 笔均结算，两个工作区原稿各 11/15、9/15 |
| 2026-11-21 | 交接追溯修复与实跑档案发布到主线 `ec80486a` | [PR #289](https://github.com/orangeofcarl0-sys/palimpsest/pull/289) | 16/16 项 CI，送审与落地的三笔提交文件树逐笔一致 |
| 2026-11-20 | 修复 Palimpsest 重启后的交接追溯 | [工单与复验](docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md) | 旧 Episode 可查，绑定 Work 核准，日志仍可查，零模型请求 |
| 2026-11-20 | 同一 R4 工单拆分证据优先级说明与签发少排提示 | [四格逐笔对比](research-evidence/pnwf-task-selection/2026-11-20/r4-split/comparison.json) | 四份交付各 10/10；11 次复核，从未推翻已有 B GO |
| 2026-11-20 | R4 拆分对照及恢复记录合入主线 `2c29e90c` | [PR #287](https://github.com/orangeofcarl0-sys/palimpsest/pull/287) | 16/16 项通过，核验送审与主线完整树相同 |
| 2026-11-20 | R4 窗口利用率修复与配对证据合入主线 `55eeaa3b` | [PR #285](https://github.com/orangeofcarl0-sys/palimpsest/pull/285) | 16/16 项通过，送审与落地树相同，两组均 10/10，旧判分与 UNKNOWN 保留 |
| 2026-11-20 | R4 签发核对晚班实测适用范围及窗口内未用功率 | [窗口复跑](docs/engineering/DEPOT-R4-WINDOW.md) | 两份 6/10 补回归，双 Mock 与真实各 10/10；真实 59 笔全部结算，旧 UNKNOWN 保留 |
| 2026-11-20 | R4 签发契约与配对证据合入主线 `b8a7d27b` | [PR #283](https://github.com/orangeofcarl0-sys/palimpsest/pull/283) | 16/16 项通过，送审与发布树一致，两组签发、业务各 6/10，旧 2/10 和 UNKNOWN 保留 |
| 2026-11-20 | R4 签发支持在原窗口内沿用原表回执，完成两组 Mock 和真实配对 | [R4 签发报告](docs/engineering/DEPOT-R4-RELEASE-POWER.md) | Mock 各 10/10，真实各 6/10，57 笔全部结算，旧 2/10 和 UNKNOWN 保留 |
| 2026-11-20 | R7 请求超限拒签，两份 6/10 回归及双 Mock 通过，同基线真实配对 | [签发报告](docs/engineering/DEPOT-R7-RELEASE-POWER.md) | P/F 均 10/10，主动改表，60 笔全部结算 |
| 2026-11-20 | 当前账号工具探针对账通过，按原顺序跑完其余三格 | [两批次对比](research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/comparison.json) | R4-F 10/10，R7-F 和 R7-P 各 6/10，134 笔全部结算 |
| 2026-11-20 | 夜班 R4/R7 可外推与序列相关两种工单冻结，完成四格 Mock | [报告](docs/engineering/DEPOT-TRANSFERABILITY.md) | 真实首格第 7 笔 UNKNOWN，2/10，当时其余三格未启动 |
| 2026-11-19 | 单独封存上次夜班第 15 笔 UNKNOWN，普通 DSH 同基线真实复跑完成 | [报告与复算](docs/engineering/DEPOT-REVIEW-EXIT.md) | 10/10，1 份维护者回执，DELIVER，自然退出，23 笔全结算 |
| 2026-11-19 | 维护者有效实测回传后自然结束；停止归因支持双会话 | [证据与报告](docs/engineering/DEPOT-REVIEW-EXIT.md) | 原表回传后 0 请求，真实第 15 笔 UNKNOWN，冻结 5/10 |
| 2026-11-19 | 夜班调度复用文件义务，实测回执独立归档；原 P/F 两份 9/10 进入回归 | [报告与复算](docs/engineering/DEPOT-MATERIAL-OBLIGATIONS.md) | Mock 通过，真实 P 10/10，自然退出，55 笔全部对账 |
| 2026-11-07 | PR #227 merged：PNWF-CQ action coherence、UNOBSERVED liveness、plan invalidation、journal 投影、isolation gate、评分修正、operator basis admission | `1766a79` | CI 全绿 |
| 2026-11-07 | 容器 cohort 执行 | `research-evidence/pnwf-cq/live/2026-11-07/` | **INVALID / +190,778 over budget**；禁止继续付费 |
| 2026-11-07 | 新增本 handoff；PR #228 merged | `7658527` | 活文档 |
| 2026-11-07 | 同步 origin/main 到 handoff merge；说明 SHA 需现场核实 | `docs/handoff-sync` | 防止把快照当永久基线 |
| 2026-11-07 | PNWF-CQ-R1：请求前预算预留、Mock/实际容器/World 资格；Operator/HEAD 复核与职责归位；真实子进程纵向治理链 | `docs/engineering/PNWF-CQ-R1-QUALIFICATION.md`；`research-evidence/pnwf-cq-r1/2026-11-07/` | 新增 paid calls 0；20 项预算测试、6 组容器场景；真实 Provider 仍 BLOCKED |
| 2026-11-07 | Owner 授权推送、创建 PR、跟进并修复 CI、全绿后合并及更新 handoff；另明确授权启动付费模型调用 | 本轮用户指令 | 新付费授权有效；尚无新量化 ledger，Provider 技术资格仍 BLOCKED，发布/CI paid calls 0 |
| 2026-11-07 | PR #230 在 14/14 CI job 成功后合并；同步真实 merge SHA、Linux 全量/E2E/Windows 结果和跳过项 | [PR #230](https://github.com/orangeofcarl0-sys/palimpsest/pull/230)；`b7460f3`；`release-ci.json` | 首次 CI 无失败、无重跑；四个 Host-dependent gate 未执行；新增 paid calls 0 |
| 2026-11-08 | Owner 允许不设计费上限，新增显式按量记账，执行一条 software 续作 | `PNWF-CQ-PAID-USAGE-ONLY.md`，`research-evidence/pnwf-cq-paid/2026-11-08/software.json` | 24 项请求测试、6 个零付费容器场景通过。27 个付费请求，982,857 tokens，自然退出，主判据 1/1 |
| 2026-11-08 | 修复 DSH 调用归因并离线重算 software 轨迹 | `software-attribution-recount.json`，`PNWF-CQ-PAID-USAGE-ONLY.md` | 31/31 配对，2 次不同原因拒绝，1 次失败作业，无进展调用 3 次，新增付费调用 0 |
| 2026-11-08 | 合并按量记账续作与轨迹归因修复，记录发布检查 | [PR #232](https://github.com/orangeofcarl0-sys/palimpsest/pull/232)，`fd341c1` | 14/14 CI job 成功，四个 Host-dependent gate 步骤跳过 |
| 2026-11-08 | 执行 energy 续作并用修复后的归因脚本对比两条轨迹 | [对比报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md)，[Energy 证据](research-evidence/pnwf-cq-paid/2026-11-08/energy.json) | 29 个已结算请求，987,987 tokens，主判据 1/1，43/43 结果配对 |
| 2026-11-08 | 合并 energy 证据、对比报告和 handoff，补录合并提交及检查 | [PR #234](https://github.com/orangeofcarl0-sys/palimpsest/pull/234)，`dbaaa0e` | 14/14 CI job 首次成功，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 修复退役计划的 readiness，引导模型核对已提交产物并记录 DELIVER | [回归用例](test/pnwf_product.test.ts)，[报告](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md#退役计划后的-readiness-引导) | software 与 energy 状态回归，新增付费请求 0 |
| 2026-11-08 | 在 #236 主线从原始状态各复跑一条 software、energy，归因比较修复前后 | [复跑证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-rerun.json) | 55 个请求，2,462,728 tokens，主判据 2/2，退役后查询 readiness 0/2 |
| 2026-11-08 | 合并复跑证据、修复前后对比报告和 handoff，同步实际合并提交与检查 | [PR #237](https://github.com/orangeofcarl0-sys/palimpsest/pull/237)，`987bab0` | 14/14 CI job 首次通过，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 从已退役、尚无交付的状态定向观察新提示采用 | [定向观察证据](research-evidence/pnwf-cq-paid/2026-11-08/readiness-hint-live.json) | 2/2 首查、2/2 后续 DELIVER 与自然退出，30 个请求、756,492 tokens |
| 2026-11-08 | 合并 readiness 定向观察证据、报告和 handoff，补录实际合并提交与 CI | [PR #239](https://github.com/orangeofcarl0-sys/palimpsest/pull/239)，`00c5f46` | 14/14 CI job 首次通过，四个外部 DSH gate 步骤跳过 |
| 2026-11-08 | 同步发布 handoff 并补齐 `package-smoke` 的 HTTP 504 重试 | [PR #240](https://github.com/orangeofcarl0-sys/palimpsest/pull/240)，`scripts/release/consumer-smoke.mjs` | Ordarium 发布包下载 504 使用原三次尝试上限，真实下游安装为通过条件 |
| 2026-11-08 | 持续 504 时通过 GitHub 官方资产 API 恢复 `package-smoke` | [PR #241](https://github.com/orangeofcarl0-sys/palimpsest/pull/241)，`0f7dc13` | PR 与主线 CI 均为 14/14，主线核验四个原包的 SHA-512 后完成真实下游安装 |
| 2026-11-08 | 合并 Bench 树及 README 导航，登记实际合并点与 CI 范围 | [PR #242](https://github.com/orangeofcarl0-sys/palimpsest/pull/242)，`ca3e676` | 14/14 CI job 首次通过，核对 59 个链接与 87 个证据阶段，四个外部 DSH 步骤跳过 |
| 2026-11-08 | 归并工作分支，导入 R3-A2 冻结证据并归档其余独有历史 | [分支清单](docs/engineering/repository/ACTIVE-BRANCHES.md)，R3-A2 tip `10a5978` | 恢复验证 411 个引用，R3-A2 定向测试 116 项通过 |
| 2026-11-08 | 改写主线提交归因，核验 Contributors 并更新导航 | [归因与 SHA 映射](#主线归因与-sha-映射) | 归档原始主线和标签 |
| 2026-11-09 | 安装提交归因门禁并启用主线必需检查 | [归因门禁](#提交归因门禁) | 本地 hook、精确 PR head 检查、rebase-only 发布 |
| 2026-11-09 | 统一 energy T2 五文件写范围并完成等待式真实闭环与原生对照 | [报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md)，[证据](research-evidence/pnwf-energy/2026-11-09/scope-rerun.json) | 定向测试 33/33、最终 Mock 6/6、真实 6/6；本轮新增 228 笔、6,324,199 tokens |
| 2026-11-09 | 按 Provider 响应 ID 复核 energy trajectory，分解 fresh input 差额 | [分析](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#fresh-input-为什么更多)，[逐请求归因](research-evidence/pnwf-energy/2026-11-09/trajectory-attribution.json) | 136/136 绑定；首请求 +9,005、后续 +19,452；新增付费 0 |
| 2026-11-09 | 独立复跑 T2 回执、定向回读和短版 Pulse | [对比](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-上下文干预的独立对照)，[机器证据](research-evidence/pnwf-energy/2026-11-09/t2-context-variants.json) | Mock 9/9；新增真实 87 笔；两候选待核准，短版未采用 |
| 2026-11-09 | 按所有者核准的完整 SHA 分别晋升回执和定向回读候选 | [接受记录](research-evidence/pnwf-energy/2026-11-09/t2-context-variants.json) | 两次 `PROMOTION_COMMITTED`，Git 树与证书复核通过，新增模型请求 0 |
| 2026-11-09 | 从两个晋升 HEAD 分别接续真实 T3 | [报告](docs/engineering/ENERGY-PROJECT-CONTINUITY.md#两个晋升版本的真实-t3)，[机器证据](research-evidence/pnwf-energy/2026-11-09/t3-context-continuation.json) | Mock 2/2；真实新增 25 笔；均提交并自然退出，严格判分 1/2 |
| 2026-11-09 | 发布 Energy 范围修复、真实三会话对照与轨迹分析；同步实际合并点 | [PR #249](https://github.com/orangeofcarl0-sys/palimpsest/pull/249)，`08c6c6e8` | 精确 head 16/16；保留 rebase 前后 SHA 对照与主线工作流链接 |
| 2026-11-09 | 发布 Energy T2/T3 上下文试验与两份模型摘要原稿 | [PR #251](https://github.com/orangeofcarl0-sys/palimpsest/pull/251)，[合并及检查记录](research-evidence/pnwf-energy/2026-11-09/t2-t3-release-ci.json) | 16/16；主线 `478d6b33`，回执 T3 原判分与两份摘要 blob 已核验 |
| 2026-11-10 | 确立长期项目的三个产品里程碑和下一轮试点 | [路线图](docs/product/PROJECT-ROADMAP.md)，[研究合同](.research-alignment/00_research_contract.md#长期项目的协作与适应) | 先复核交付 SHA 与 gRPC 双组零付费闭环，Energy 用于回归和第二领域复验 |
| 2026-11-10 | 修复 `DELIVER` 工件 SHA 并完成 gRPC 接续资格 | [报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md)，[机器证据](research-evidence/pnwf-software/2026-11-10/qualification.json) | 6/6 Mock 自然退出，正式 Worker、原生子任务和接受后接续均核验，新增付费调用 0 |
| 2026-11-10 | 发布路线图、交付 SHA 修复和 gRPC 资格并核对合并结果 | [PR #253](https://github.com/orangeofcarl0-sys/palimpsest/pull/253)，[发布证据](research-evidence/pnwf-software/2026-11-10/release-ci.json) | 送审 head 16/16，主线发布点 `d34f34b4`，两次 rebase 的 SHA 对照已记录 |
| 2026-11-10 | 运行 gRPC 真实配对，核对正式委派、接管和原生子任务 | [报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#真实诊断配对)，[证据](research-evidence/pnwf-software/2026-11-10/live-pair-150630/evidence.json) | 两组均止于 T2 写范围门禁，四会话自然退出，140 笔用量完整 |
| 2026-11-10 | 发布 gRPC 真实诊断配对及用量审计 | [PR #255](https://github.com/orangeofcarl0-sys/palimpsest/pull/255)，[发布记录](research-evidence/pnwf-software/2026-11-10/live-pair-150630/release-ci.json) | 16/16，主线发布点 `415f8bc4`，T1 原判分和离线复核、T2 越界记录均归档，两组 T3 未启动 |
| 2026-11-10 | 修复 gRPC T2 写范围与拒绝回传，复跑 T2 并接续 T3 | [复跑报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#t2-写范围与拒绝回传复跑)，[机器证据](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/evidence.json) | Mock 6/6，真实 106 笔全部结算，保留强原生检出守卫失败、离线核准与两份 T3 冻结原判 |
| 2026-11-10 | 发布 gRPC T2 写范围修复及 T2/T3 复跑证据 | [PR #257](https://github.com/orangeofcarl0-sys/palimpsest/pull/257)，[发布记录](research-evidence/pnwf-software/2026-11-10/scope-rerun-163507/release-ci.json) | 16/16，主线发布点 `55e32387`，两份摘要 blob 与各自 Git bundle 逐字节核对 |
| 2026-11-10 | 实现 gRPC 与 Energy 共用的任务义务、候选回执及按 SHA 接受 | [契约](docs/engineering/WORK-REVISION-CONTRACT.md)，[资格](research-evidence/pnwf-work-revision/2026-11-10/qualification.json) | 普通 DSH 和外部 SDK 各覆盖两个 T2，新增付费请求 0 |
| 2026-11-10 | 发布共用 Work 修订契约并复跑资格 | [PR #259](https://github.com/orangeofcarl0-sys/palimpsest/pull/259)，[发布记录](research-evidence/pnwf-work-revision/2026-11-10/release-ci.json) | 16/16，主线发布点 `e42b9ef7`，四条零付费资格复跑通过，历史证据逐字节保留 |
| 2026-11-10 | 共用任务义务的两条真实 T2 复跑与按 SHA 接受 | [报告](docs/engineering/WORK-REVISION-LIVE-T2.md)，[对比证据](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/trajectory-comparison.json) | 90 笔全部对账，两个候选核准并晋升，保留 gRPC 缺等待结论 |
| 2026-11-10 | 发布共用 Work 义务的两条真实 T2 | [PR #261](https://github.com/orangeofcarl0-sys/palimpsest/pull/261)，[发布记录](research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/release-ci.json) | 16/16，主线发布点 `b1e9d90a`，原会话、冻结评分和离线复核分别保留 |
| 2026-11-10 | 修复已结算任务的 readiness 并同基线真实复跑 gRPC T2 | [报告](docs/engineering/WORK-REVISION-LIVE-T2.md#结算后-readiness-修复与-grpc-同基线复跑)，[结论与退出](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/readiness-exit.json) | 两领域 Mock 通过，真实 47 笔已对账，记录等待并按核准 SHA 晋升 |
| 2026-11-10 | 发布结算后 readiness 修复和 gRPC 复跑证据 | [PR #263](https://github.com/orangeofcarl0-sys/palimpsest/pull/263)，[发布记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618/release-ci.json) | 16/16，主线发布点 `2d741933`，历史缺项、本轮冻结评分和同 SHA 离线复核保留 |
| 2026-11-10 | 从 readiness 修复后的晋升 HEAD 接续真实 gRPC T3 | [报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#结算引导修复后的真实-grpc-t3)，[证据](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/trajectory-and-review-audit.json) | 13 笔全部对账，只提交评审，记录交付后自然退出，冻结原判保留 |
| 2026-11-14 | 发布真实 gRPC T3 与逐项内容复核 | [PR #265](https://github.com/orangeofcarl0-sys/palimpsest/pull/265)，[发布记录](research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/release-ci.json) | 16/16，主线 `b3c3de40`，Linux 5108 项通过、33 项跳过，浏览器 E2E 38 项通过 |
| 2026-11-18 | 修复 gRPC T3 摘要语义验收与交付提示，同一核准 HEAD 复跑 | [报告](docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#grpc-t3-语义验收与同一接受版本复跑)，[轨迹和原判对照](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/trajectory-and-review-audit.json) | 最终 Mock 12/12、4 笔全结算并自然退出。真实首笔 HTTP 402，1 笔用量未知后停止，两轮冻结原判保留 |
| 2026-11-18 | 发布 gRPC T3 语义验收和交付引导，同步 handoff | [PR #267](https://github.com/orangeofcarl0-sys/palimpsest/pull/267)，[发布与检查记录](research-evidence/pnwf-work-revision/2026-11-18/review-semantics-035705/release-ci.json) | 16/16 首次通过，主线发布点 `02940a03`，原判、用量未知及 Mock 证据逐字节核验 |
| 2026-11-18 | 只读核对 DeepSeek HTTP 402 和备用 OpenCode | [对账记录](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-provider-reconciliation.json) | 原用量仍未知，DeepSeek 余额不可用，旧 OpenCode 配置返回 401，新增推理请求 0 |
| 2026-11-18 | 将旧 402 独立保留，接入并验证 OpenCode Go | [最小请求账本](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-t3-053356/opencode-probe.json) | 当前 ZCode 配置，`deepseek-v4.1-flash` 单笔 50 tokens，终态用量和 SQLite 一致 |
| 2026-11-18 | 从同一核准 HEAD 复跑 OpenCode Go gRPC T3 | [轨迹对照](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-t3-053356/trajectory-and-review-audit.json)，[账本](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-t3-053356/request-accounting.json) | 同基线 Mock 通过，真实首笔 HTTP 400，1 笔未知后停止，接受 HEAD 未变化 |
| 2026-11-18 | 旧 HTTP 400 保留未知并独立留档，验证修正路由后复跑真实 T3 | [探针](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json)，[轨迹和离线复核](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/trajectory-and-review-audit.json) | 探针 375 tokens；真实 14 笔、458,889 tokens，`f30c6644` 交付并自然退出；原自动判分与归因失败保留 |
| 2026-11-18 | 发布 OpenCode Go 路由与真实 T3，补录发布检查和 SHA 映射 | [PR #269](https://github.com/orangeofcarl0-sys/palimpsest/pull/269)，[发布记录](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/release-ci.json) | 16/16 首次通过，主线发布点 `d5a423af`，原稿、两个 UNKNOWN 账本及原判与补证逐字节核验 |
| 2026-11-18 | 修复 T3 旧空流语义及 OpenCode Go 缺 ID 归因 | [离线复算](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-offline-acceptance.json) | 同一 `f30c6644` 得 12/12，原轨迹 14/14，账本合计 458,889 tokens，新增模型请求 0 |
| 2026-11-18 | 发布 gRPC T3 离线验收修复并同步 handoff | [PR #271](https://github.com/orangeofcarl0-sys/palimpsest/pull/271) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/grpc-t3-offline-acceptance-release-ci.json) | 16/16 检查首次通过，主线发布点 `c9347e24`。原 11/12、原归因失败、两轮冻结原判和 402/400 UNKNOWN 逐字节保留 |
| 2026-11-18 | 从 `77f2d87e` 复跑同核准提交的真实 OpenCode Go gRPC T3 | [结果](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/result.json) · [对比](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/trajectory-comparison.json) | `ccb07d36` 记录 DELIVER 并自然退出，13 笔全结算并归因。原 11/12，新增缺项为新版表格前三条，离线复核 12/12 |
| 2026-11-18 | 发布 OpenCode Go gRPC T3 复跑证据并同步 handoff | [PR #273](https://github.com/orangeofcarl0-sys/palimpsest/pull/273) · [发布记录](research-evidence/pnwf-work-revision/2026-11-18/opencode-go-v2-t3-152704/release-ci.json) | 主线发布点 `e4f037b8`，16/16 项首次通过。保留本轮 11/12、同一 SHA 离线复核、历史原判和 402/400 UNKNOWN，本次发布新增付费请求 0 |
| 2026-11-18 | 盘点 65 个源码目录，调研 dsh-layerfs 与多 Agent 可视化，提出项目历程读面 | [系统与来源](docs/product/visualization/SYSTEMS.md) · [调研](docs/product/visualization/RESEARCH.md) · [规划与离线原型](docs/product/visualization/PLAN.md) | 设计基线 `4e291944`。样本取自既有归档，产品接入与人因验收待实施 |
| 2026-11-18 | 交接回放成为档案原型首页，七步呈现实际角色、交接物与接续凭据 | [交接原型](docs/product/visualization/prototype/index.html) · [阅读设计](docs/product/visualization/PLAN.md#一份工作如何交到下一位手里) | 支持逐步选择、连续播放、暂停与静态阅读，使用原有封存 |
| 2026-11-18 | 依 dsh-layerfs 的宿主位置及工作对象重订可视化规划 | [位置与形式](docs/product/visualization/RESEARCH.md#工作视图在宿主里的位置) · [会话内布局和状态样例](docs/product/visualization/PLAN.md#一个时点的布局) | 首个验收改为在 DSH 会话里判断并行与待办。已核对槽位源码和真实归档，本次产物为设计 |
| 2026-11-18 | 调研组织、世界、格点动作和交叠集合，制作五时点交互样例 | [文献与两组 Git 复算](docs/product/visualization/STRUCTURE-AND-OVERLAP.md) · [格点图与成员表](docs/product/visualization/prototype/structure.html) | 组织与边界四组回归 47/47。下一项资格为 DSH 原生挂载、授权读面和可读性对照 |
| 2026-11-18 | 会话样例可播放交接、固定观察对象并在当前时点循线回看旧动作 | [回放与查证语义](docs/product/visualization/STRUCTURE-AND-OVERLAP.md#四时间选择和可见范围) · [交互样例](docs/product/visualization/prototype/structure.html) | 窄屏同屏显示人物和两个世界，减少动效时可静态阅读。使用原五个合成时点 |
| 2026-11-18 | 原生 DSH 侧栏接入当前项目，时间线驱动实时图与账本截面 | [操作](docs/user-guide.md#dsh-侧栏工作检查器) · [实机回归](scripts/inspector/dsh-web.mjs) · [宿主观察](host/dsh/lib/inspector/observe.js) | 在打开的 DSH 中登记并认领任务，核对实时新增、固定后续到达、返回现场、早期无此尝试与只读轮询。未启动付费模型 |
| 2026-11-19 | 打磨原生关系图、局部聚焦、时间线和对象检查 | [操作](docs/user-guide.md#dsh-侧栏工作检查器) · [实机回归与截图入口](scripts/inspector/dsh-web.mjs) | 真实 DSH 检查深浅主题、390 像素双列、键盘搜索与完整 ID，核对回溯和筛选后的连线数与当前投影一致 |
| 2026-11-19 | 发布可视化设计、DSH 侧栏工作检查器和交互回归 | [PR #275](https://github.com/orangeofcarl0-sys/palimpsest/pull/275) · [CI](https://github.com/orangeofcarl0-sys/palimpsest/pull/275/checks) | 送审 `311f101e` 的 16/16 项检查首次通过，主线发布点 `a7751302`。7 个提交的内容和归因均已核对 |
| 2026-11-19 | 从 `88621e34` 验证 gRPC 自主修订与重启接手 | [报告与离线恢复](docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md) · [真实轨迹](research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/observations.json) | Mock 有贡献采纳，真实模型独立完成，按完整 SHA 接受后两端读回 |
| 2026-11-19 | 夜班隔离复核与同基线真实对照 | [报告](docs/engineering/FLEET-ISOLATED-REPLAY-REVIEW.md) | Mock 验证按 SHA 回传；真实两组自行完成，各 2/2，81 笔已对账 |
| 2026-11-19 | 发布 Fleet 夜班场景、隔离复核与对照证据 | [PR #278](https://github.com/orangeofcarl0-sys/palimpsest/pull/278) · [16 项检查](https://github.com/orangeofcarl0-sys/palimpsest/pull/278/checks) | 送审 `3c489b3b` 对应主线 `b2360950`。上轮两组各 0/2，本轮各 2/2，自主组联系维护者 0 次 |
| 2026-11-19 | 核对 gRPC 接续提交并关闭重复 PR | [#277](https://github.com/orangeofcarl0-sys/palimpsest/pull/277) · [#278](https://github.com/orangeofcarl0-sys/palimpsest/pull/278) | 完整树一致，核准与旧 Episode 查询原判保留，已删除对应远端分支。新增付费调用 0 |
| 2026-11-19 | 开始按任务选用能力首轮配对 | [冻结判据](scripts/pnwf/task-selection/protocol.md) · [报告](docs/engineering/TASK-SELECTION-PILOT.md) | 四个 Mock 通过，首个真实会话因 UNKNOWN 停止；保留自测反例和零提交现场 |
| 2026-11-19 | 扩展旅客查证、站牌与车队调度工单；另备开放检索入口 | [报告](docs/engineering/TRANSIT-DESK-USER-TASKS.md) | 六条 DSH Mock；新增付费请求 0 |
| 2026-11-19 | 从三张冻结工单运行六个真实会话 | [报告](docs/engineering/TRANSIT-DESK-LIVE.md) | 5 格自然退出，4 格提交，114 对工具调用结果；调度 F 有 1 笔 UNKNOWN |
| 2026-11-19 | 冷夜调度：上一班实测反例与两组真实自主求证 | [报告与用量复算](docs/engineering/DEPOT-RELIEF-COUNTEREXAMPLE.md) | 两个 Mock、两个真实交付通过。真实两组均两次联系维护者，83/83 笔对账，旧调度 F 第 3 笔独立封存 |
| 2026-11-19 | 晚班私有实测反转公开放行 | [报告](docs/engineering/DEPOT-SHIFT-LOG.md) | 两个 Mock 通过。真实 P 回执未送达、保留原表 7/10，F 收到后调整 B 两格 9/10；99 笔用量均确认 |
| 2026-11-19 | 实测即持久化并按 SHA 投递；模拟丢包、真实 P 复跑 | [报告与复算](docs/engineering/DEPOT-RECEIPT-DELIVERY.md) | 同 SHA 重试只启动一位维护者。真实 P 修对两格，9/10、自然退出，60 笔已对账 |

---

## 10. 给下一个 agent 的最短路径

1. 读本文件 §0–§3 和 [项目发展路线图](docs/product/PROJECT-ROADMAP.md)。
2. 按路线图确认本轮验收场景。运行边界查 [执行资格](docs/engineering/PNWF-CQ-R1-QUALIFICATION.md) 与 [按量记账](docs/engineering/PNWF-CQ-PAID-USAGE-ONLY.md)。
3. 按 §2 核对当前分支与工作树。新工作先 fetch，再从当前主线开 `codex/` 分支。
4. `pnpm build && pnpm architecture:check && pnpm architecture:check-public-api`。
5. 跑 §5 的顺序验收集。
6. 付费实验按 §6 选择执行合同。按量记账使用新的准备目录和账本，并实测本次容器资格。
7. 改完代码/证据后更新本文件并提交。
