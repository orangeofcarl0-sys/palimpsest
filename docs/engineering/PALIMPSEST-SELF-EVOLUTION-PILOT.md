# Palimpsest 自主维护与版本接班首轮

实施从 `198d6293` 开始。首个维护版本的产品源码冻结在 `07ab5aad7f77a2fd67f426c80e5215cf3f2bc6de`。本轮检验封存结果到自主维护的半程，以及候选构建从独立验收到实际接班的半程。[自主维护规划](../product/PALIMPSEST-SELF-EVOLUTION.md)

## 输入与可见性

首轮只给维护目标及 `evidence/` 路径。模型可以看两条原始冷交接流、原提交、项目权威状态、账本和参照样本。原有无提示 7/7、带方法 5/7 以及缺新评审 `DELIVER` 全部保留。原始 `.zstd` 流另解码成等义的 JSONL，保留事件的调用 ID、顺序和返回值，供会话自行读取。[原始运行归档](../../research-evidence/pnwf-software/2026-11-22/continuity-reuse/live)

隔离检出引用逐路径复制的 Git 源码对象，核验所选树的 blob 和文件模式。维护分支从一个独立根提交开始，原仓历史、报告与现成人工补丁留在宿主侧。封存材料通过只读挂载提供。独立验证器和 Mock 参考补丁不进入真实会话。旧版运行代码、可写候选仓及验证副本各自隔离。

## 从封存到安装切换

试点在宿主侧使用单个耐久维护队列，复用既有 Campaign 唤醒身份。命令将封存结果交给队列，普通 DSH 按持久唤醒启动。队列只做证据投递、会话准入和版本绑定，维护选题、假设、测试与候选由会话生成。重复投递按同一身份去重。用量不完整时，队列关闭后续准入。这个试点运行位置由本地启动器持有，按封存事件启动会话。

独立判据在真实运行前固定。它从两个原始 gRPC 候选恢复同一 Git 基线和项目状态，以同一脚本化回复模拟提交后自然收尾，再观察 `DELIVER` 是否发生，与实际候选 SHA 和 blob 是否相符。脏工作、需要等待与已记录结论另行验证。宿主从候选 Git 对象重新构建，运行现有 Episode、Direct 到 Governed 和 Basis Admission 定向套件，并在隔离副本读取旧维护项目。模型自写测试和独立验收各有证据。

构建摘要绑定打包字节的 SHA-256 与实际载入文件逐项 SHA-256。接班使用同一镜像和普通 DSH 入口，先检查旧写入者已静止、原状态摘要及审核的构建，再让新安装物在隔离状态副本中读回原项目。授权绑定候选 SHA、构建和独立验收。所有者接受通过既有 Direct Basis Admission 持久化，启用新安装物使用有状态的版本切换。中断恢复只能回到已经核对的状态点，存在新写入时保留现场并停止自动回退。

## 零付费资格结果

最终资格共 9 条普通 DSH Mock、35 笔模拟请求，全部对账并自然退出，实际付费 0 笔。旧版在两个原现场都停于提交和最终回复，历史 Journal 中的旧结论仍保留。参考构建在两边都让同一 Mock Principal 新记录绑定原候选的 `DELIVER`。脏工作和开放问题两组各 3 笔，自然退出且无新结论。已有结论组只记录原 Mock 调用的一条，收尾未重复触发。[机器复算](../../research-evidence/pnwf-software/2026-11-22/self-evolution/recount.json) · [独立探针](../../research-evidence/pnwf-software/2026-11-22/self-evolution/mock/candidate-probes/checks.json)

首个封存唤醒实际启动了 4 笔 Mock 会话。它读到持久证据条目，经隔离工作区提交 `5d5e7396e7155c6ab978bc312c295c67a6cb497c` 并记录结论。重复封存只保留一次投递，第二写入者被拦截。独立定向回归 21 项通过。Mock 所有者通过 Work 事件 6 接受相同 SHA。新安装在新 DSH home 读到前代证据，5 笔完成 `14a7a128de2e2054093c541962cb43e5ae3e9309`、记录 `DELIVER`、自然退出。[资格](../../research-evidence/pnwf-software/2026-11-22/self-evolution/mock/qualification.json) · [接班记录](../../research-evidence/pnwf-software/2026-11-22/self-evolution/mock/successor.json)

另测 9 条故障检查。错候选和错构建核准被拒绝。准备后重新打开存储仍指向旧版，错误安装物和读回失败不能完成激活。修复中断后允许使用同一状态点恢复，旧切换尝试也无法完成新的激活。重复激活保持幂等。尚未写入时能回到前代，观察到状态推进则停止自动回退。初次并行试运行出现一次本地 Mock 网关等待超时，未准入请求。最终资格采用顺序探针。[故障与恢复](../../research-evidence/pnwf-software/2026-11-22/self-evolution/mock/faults.json)

## 真实首轮

封存信号 `campaign-wake-4b0cad805e26bd80c98bb2288e95e701` 唤醒一次普通 DSH。运行使用 `07ab5aad` 源码投影，隔离 Git HEAD `082f77a9a4602d1eb5a2d9be1260186fa41c4a61`，运行构建摘要 `d1d7a5bfc6688370d72c21a675cb5af31d84ca24356b1af38321341654dd9a8b`。会话只收到维护目标与封存位置，无后续人工提示和代写。它先查 Pulse，独立沿 Git bundles、调用结果与 SQLite 所有者记录追查两条冷交接。工作环境包含当时仓库已有的维护探针。模型自己从源码找到该探针，并在第 26 笔 257→260 复现 4/6，失败项为有干净直接提交时继续建议做工、已有结论后仍未指向该结论。[真实轨迹](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/first/session.json)

第 40 笔 373→374 进行首次源码修改。第 48 到 49 笔新增普通 Work 的回归，覆盖未改、脏草稿、提交后交付建议、记录后的回执复用及再修改场景。第 51 笔 443→446 首测 9/10，定位到未跟踪路径可能按目录回传。它收窄断言后第 53 笔 461→464 通过 10/10，随后第 54 笔 469→472 通过 43 项周边回归。第 57 笔 493→496 恢复带既有交付的真实项目状态，确认回执复用。到第 61 笔复跑旧探针为 6/6。轨迹中没有委派，79 个工具调用和结果都按 ID 配对。

第 58 笔启动后台全量测试。随后又改了两处文案与分支，在第 61 笔 524→527 的定向复测遇到 `spawnSync git EAGAIN`，第 62 到 64 笔读取作业。样本原判保留这一现场。第 65 次尝试在准入处被原 64 笔限制拦截，接受的 64 笔全部有终态用量。没有 Git 提交或新 `DELIVER`，也没有自然退出。原稿保留在 `src/application/work_outcome.ts` 和 `test/alhs_episode_convergence.test.ts`。唯一运行写入者已退出，稳定位置仍指向 `082f77a9…`。未形成可核准的候选，下一张真实工单没有准入。[原始停止记录](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/first/out/MAINTAIN/run.json) · [未提交原稿](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/first/working.patch)

| 阶段 | 请求 | Fresh input | Cache read | Output | 总用量 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 查档、定位与旧版复现 | 1–39 | 187,181 | 4,177,408 | 17,903 | 4,382,492 |
| 初版修复、回归和修正测试 | 40–54 | 16,698 | 2,921,472 | 8,698 | 2,946,868 |
| 复验旧现场、后续修改与等待测试 | 55–64 | 16,877 | 2,095,232 | 6,555 | 2,118,664 |
| 合计 | 64 | 220,756 | 9,194,112 | 33,156 | 9,448,024 |

会话耗时 546.272 秒，cache write 为零，`UNKNOWN` 为零。第 40 笔才开始改源码，第 54 笔已有通过的成组验证，后续十笔仍用于加验和测试作业观察，提交与交付没有留在窗口内。原始现场、“提交后由谁触发再观察”与手动查询 readiness 是三个可分别检验的对象。实际原稿改动集中在后者。[逐请求复算](../../research-evidence/pnwf-software/2026-11-22/self-evolution/recount.json)

## 未提交原稿的独立复验

在隔离副本上逐字节应用原稿，保留起始 HEAD。从旧版和原稿分别运行同一公开 readiness 探针，得到 **4/6 → 6/6**。原稿的 Episode、Direct 到 Governed 和 Basis Admission 三个套件共 22 项通过。单独串行运行现场报 `EAGAIN` 的 `pnwf_product` 套件，15 项均通过。现场并行测试失败仍按原轨迹保留，本轮没有全量测试通过的证据。[复验结果](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/offline/offline-recheck.json) · [串行复测](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/offline/draft-pnwf-product.json)

用原稿编译产物再启动两次普通 DSH Mock。两份原状态都只走到提交和最终回复，分别 3 笔并自然退出，新 `DELIVER` 为 0。原稿改善了显式查询 readiness 时的动作建议。在原始冷交接路径中两组都没有做该查询，一次性宿主仍在首轮回复后退场，因而同一收尾故障仍可复现。复验新增付费请求为零，原稿未补写提交、会话结论或工作日志。[收尾重放](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/offline/draft-replay/checks.json)

本轮已经观察到从封存材料自行调查、选择旧探针、编写新回归并修订代码。证据还指出两处未走通的环节。故障归因停在 Work 提示，原样本的宿主结束路径尚未关闭。后段全量测试与复验挤占了候选提交窗口。没有真实候选进入核准，真实稳定版接班和下一张工单仍待验证。里程碑二保持开放。

## 运行合同与复验命令

开放真实会话前必须通过零付费资格。真实会话使用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5` 及 `paid-usage-only`。每会话 64 笔和 30 分钟，单笔 240 秒，金额与总 token 上限为空。后继会话等待同一候选完整 SHA 和构建摘要获得明确核准。

```sh
node scripts/pnwf/software/self-evolution/run.mjs qualify <new-mock-directory>
node scripts/pnwf/software/self-evolution/run.mjs live <new-live-directory> <qualified-mock-directory>
node scripts/pnwf/software/self-evolution/run.mjs continue <live-directory> <owner-approval.json>
node scripts/pnwf/software/self-evolution/run.mjs recover <live-directory>
node scripts/pnwf/software/self-evolution/verify-draft.mjs <live-directory> <new-offline-output>
node scripts/pnwf/software/self-evolution/recount.mjs research-evidence/pnwf-software/2026-11-22/self-evolution
```

`recover` 用于恢复尚未激活的切换，验证前代快照摘要及写入者状态。候选验收及实测报告分别记录启动、持久化、到达的工具链、独立证据与实际退出。

## 从请求上限停点接续原稿

从 `1c0807c3` 接续实现。宿主逐字节核对前代的轨迹、64 笔账本、停止回执、原稿、核心项目库和运行构建。只接续已静止且请求全部结算的 `REQUEST_LIMIT` 停点。继续使用 `07ab5aad` 的安装物、同一项目和原 Git HEAD，把 16 个已检查点化的 SQLite 库与原稿装进新的隔离工作区。未提交改动经 `git diff --binary` 逐字节复核，恢复时保留未提交状态。以前代唤醒为依据登记新的唤醒身份，重复投递沿用同一调用。实跑使用原宿主维护位置，旧账本和会话终态原样留档。[前代检查点副本](../../research-evidence/pnwf-software/2026-11-22/draft-resume/checkpoint)

新普通 DSH home 可读原冷交接档案、前代原始调用流、停机账本和未提交原稿。业务提示只给维护目标和证据位置。原稿续作及获准后的接班会话各有独立新账本，最多 256 笔、30 分钟，单笔 240 秒，金额和总 token 上限为空。原始真实会话的限制仍记录为 64 笔。

### 原稿接续 Mock 资格

最终资格从原停点恢复 16 个 SQLite 文件和原稿，沿用隔离 HEAD `082f77a9a4602d1eb5a2d9be1260186fa41c4a61`。普通 DSH 从新的 home 查到前代记录并提交参考候选。两条原现场正例都绑定准确 Git 工件的 `DELIVER`，三个收尾反例通过，定向回归 22 项通过。模拟核准后，新安装物从同一项目读回记录并提交下一项工作。本轮资格共 7 条 Mock、29 笔模拟请求，付费为零。[资格](../../research-evidence/pnwf-software/2026-11-22/draft-resume/mock/qualification.json) · [接班](../../research-evidence/pnwf-software/2026-11-22/draft-resume/mock/successor.json)

先前一次真实准入在启动会话前发现 SQLite 行与 JSON 对象的表示差异，按差异拒绝，未准入付费请求。最终资格从实际停点库的副本重开并与原归档比对，验证了正常恢复，同时拒绝历史用量有缺失、不同退出原因、改写原限制和停点请求数错配。单独离线验证新账本接受 256 笔并拒绝第 257 笔，前代 64 笔账本摘要不变。[账本边界](../../research-evidence/pnwf-software/2026-11-22/draft-resume/mock/metering-boundary.json) · [恢复点](../../research-evidence/pnwf-software/2026-11-22/draft-resume/mock/prior-stop.json)

### 真实续作与终态

新会话从同一维护位置启动。第 2 笔 25→26 读出前代唤醒 `campaign-wake-4b0cad805e26bd80c98bb2288e95e701` 和本次唤醒 `campaign-wake-6cf7b4ecfc1a4962eaca793e21f8bc7d`，第 3 到 13 笔查原稿、冷交接材料和上次调用流。第 16 到 20 笔编译并运行继承的回归，第 26 笔 225→228 用继承原稿重放已有 `DELIVER` 的 case-3，已经得到指向既有结论的 `SEMANTIC_JUDGEMENT`。本次采纳了前代对手动 readiness 的解释。第 27 笔仅调整源码注释，第 32 笔 51 项相关测试通过。通过隔离 Git 对象把提交和停点原稿对比，唯一新增差异是该注释，继承的测试没有改动。[轨迹](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/first/session.json) · [相对原稿的差异](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate-extra/from-draft.patch)

第 34 笔 287→290 提交 `91b5bc0ca6690d673118af3d753056b26a7ab460`，工作树干净。第 35 笔查仍在运行的 `07ab5aad` 宿主 readiness，得到 `CONTINUE_WORK`。提交后的源码副本第 38 笔通过 22 项回归，第 40 笔通过手动 readiness 探针。模型随后记下自己的发现，于第 42 笔 345→346 主动记录 `DELIVER`，第 43 笔自然退出。交付回执的两个路径、完整 SHA 和 Git blob 摘要均复验一致。46 个工具调用与结果均已配对。[候选差异](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/first/candidate.patch) · [工件绑定](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate-extra/delivery-binding.json)

| 真实会话 | 请求数 / 上限 | Fresh input | Cache read | Output | 总用量 | 容器秒数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 原停点 | 64 / 64 | 220,756 | 9,194,112 | 33,156 | 9,448,024 | 546.272 |
| 本次续作 | 43 / 256 | 98,176 | 2,693,376 | 17,472 | 2,809,024 | 301.332 |

两次会话分别记账，cache write 均为零，均无 `UNKNOWN`。续作在请求和时间窗口还有余量时自然结束。在它记录的结论中，目标是 case-3 的 readiness 与既有回执读回。原 64 笔因请求上限停止的原判保持原样。[原判](../../research-evidence/pnwf-software/2026-11-22/self-evolution/live/first/out/MAINTAIN/run.json) · [续作用量](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/first/out/MAINTAIN/request-accounting.json)

### 独立验收与发布决定

从 `91b5bc0c…` 独立构建，摘要为 `27cddb5c5bba7334ca64e9ea68a4de4b66b32304e95f8a9dd33e69d813e82699`。新构建能一致读回原维护状态，22 项定向回归、手动 readiness 6/6 和 `pnwf_product` 串行 15 项通过。两份原冷交接正例各 3 笔，均在提交后直接回复并自然退出，新 `DELIVER` 为 0。三个收尾反例维持原结果。本次续作的 `DELIVER` 发生于模型主动调用 `conclude` 后，它证明了本次提交的持久化与终态。原来两个会话的触发缺口仍能独立复现。[确切候选核验](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate.json) · [两份原现场重放](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate-probes/checks.json) · [手动查询复验](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/candidate-extra/results.json)

本轮续作用轨迹核对模型的测试与结果，沿用定向验收，模型可自行决定是否另写维护报告。两份原现场复验仍是发布门禁，候选未通过。维护位置继续使用 `082f77a9…` 及 `07ab5aad` 的原安装物，核准请求、版本激活与下一张真实工单均未产生。Mock 接班与真实拒绝均已归档。[维护位置](../../research-evidence/pnwf-software/2026-11-22/draft-resume/live/slot.json) · [复算](../../research-evidence/pnwf-software/2026-11-22/draft-resume/recount.json)

```sh
node scripts/pnwf/software/self-evolution/run.mjs resume-qualify <new-mock-directory> <stopped-live-directory>
node scripts/pnwf/software/self-evolution/run.mjs resume <new-live-directory> <qualified-mock-directory> <stopped-live-directory>
node scripts/pnwf/software/self-evolution/run.mjs continue <resume-live-directory> <owner-approval.json>
node scripts/pnwf/software/self-evolution/recount.mjs research-evidence/pnwf-software/2026-11-22/draft-resume
```

## 验收拒绝回执触发同项目接续

从 `c7509663` 接续。独立验收为每份未通过的正例生成回执，保留预期工件、实际记录和完整重放轨迹的摘要。每份回执绑定被拒候选的完整 SHA、构建与验收摘要。宿主把同一候选的回执一次送入原维护项目的持久队列，重复投递沿用同一唤醒。发布要求原会话自然结束、用量完成对账、所有写者退出，并核对稳定安装物。基础设施异常与未知用量关闭这条接续入口。

本轮从主存档核验 `91b5bc0ca6690d673118af3d753056b26a7ab460` 的两份拒绝结果，保留原 64 笔触限和 43 笔续作的原判。宿主以原安装物 `07ab5aad` 启动全新 DSH。工作树检出被拒候选，项目记录的已接受基线仍是 `082f77a9a4602d1eb5a2d9be1260186fa41c4a61`。前一次续作遗留的 16 个项目库和正式交付回执一并读回，新的 Journal 记录以同一唤醒引用两份验收回执。原报告、失败重放和调用序列以只读文件提供。业务提示只要求定位缺口、设计验证并提交。

新会话仍用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5` 和独立按量账本，最多 256 笔、30 分钟、单笔 240 秒。金额与总 token 上限为空。新提交按被拒候选计算净改动，再从完整 Git 链独立构建和复验。两份正例、反例与定向回归通过，且候选使用原项目状态读回成功后，按完整候选和构建摘要提交所有者核准。新的功能拒绝会生成可复核的队列记录，一次真实运行的资源合同只覆盖获准的会话。

```sh
node scripts/pnwf/software/self-evolution/run.mjs reject-qualify <new-mock-directory> <rejected-live-directory>
node scripts/pnwf/software/self-evolution/run.mjs reject <new-live-directory> <qualified-mock-directory> <rejected-live-directory>
node scripts/pnwf/software/self-evolution/run.mjs continue <rejection-live-directory> <owner-approval.json>
node scripts/pnwf/software/self-evolution/recount.mjs research-evidence/pnwf-software/2026-11-22/rejection-retry
```

### 零付费资格

7 条普通 DSH Mock 共 29 笔模拟，付费为零。新会话从 `91b5bc0c` 读到同一次唤醒及两份回执，验证原档可读、挂载只读后提交参考修订。候选的两份原现场正例皆记录了绑定工件的 `DELIVER`，脏文件、未解阻塞和已有结论三个反例符合原判，22 项定向测试通过。Mock 按完整 SHA 和构建摘要核准后，新安装物同项目读回并提交下一项工作。[资格](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/mock/qualification.json) · [接班](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/mock/successor.json)

宿主验证实际原运行位、未确认用量、空回执、错候选、错构建、错停止状态及错请求数。重开 SQLite 后能读取同一个待处理唤醒，修改封存摘要被拒绝，结束后重投未再次开工。原 64 笔与原 0/2 的归档分别复算一致。[唤醒侧日志](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/mock/slot.json) · [两份原回执](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/mock/receipts)

### 真实接续与 UNKNOWN 停点

原维护位置持久化了 `campaign-wake-c4b3e6011498935a1c1514b8a13ae1d1`，关联前次 43 笔会话、被拒候选和两份回执。原安装物 `07ab5aad` 从全新 DSH home 启动，保持已接受基线 `082f77a9…`。宿主启动前读回 `91b5bc0c` 的 Git HEAD、新 Journal 中的两份回执引用，以及前次 `DELIVER` 的原事件。[接续入队](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/incoming-wake.json) · [项目读回](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/first/intake.json)

账本仅准入第 1 笔 `2a6bec23-e478-40f2-b6dd-214e3a27613b`，没有可核对的终态用量，记为 `UNKNOWN / UPSTREAM_UNCERTAIN`，总量未知。Docker 从启动到退出用时 26.434 秒，状态为退出码 137。停机时外层桥接报 `write EPIPE` 并退出 1，原始运行没有写出常规 `run.json`。原始 SQLite、WAL、准入事件和压缩流保留，离线观察另存。[停止观察](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/interruption.json) · [桥接错误](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/host-exit.json)

轨迹到达首笔请求头和上下文，模型回复与工具调用均为零。因此能确认宿主已投递回执，尚无模型读取、定位、试验或改动的观察。停止时工作树干净，HEAD 仍为 `91b5bc0c`，Journal 中只有继承的上一轮交付事件。本轮没有新增候选，未开始两份原现场的候选复验、核准、换版或后继真实工单。原 64 笔触限、前一次真实续作的 43 笔和 0/2 仍按各自原档保留。[离线复算](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/recount.json)

宿主按已退出容器和原账本确认中断，回收失效写租约，在原运行位持久化 `USAGE_UNCONFIRMED`。前两次唤醒和原安装物原样保留。桥接收尾现处理 Docker 写管道异步错误，把错误交给适配器记录停止及计量状态。定向回归和 55 项 CI 中的 Node 测试通过，从核验过的旧运行位副本复跑的 7 条 Mock、29 笔也全通过，覆盖两份原现场正例、三个反例及接受后接班。补跑实际付费为零，真实原停点保持封存。[恢复前](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/slot-before-interruption.json) · [阻断记录](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/live/slot.json) · [桥接修复后的资格](../../research-evidence/pnwf-software/2026-11-22/rejection-retry/mock-fix/qualification.json)
## 持久队列自动派发

从 `817070da` 接续。宿主把唤醒和经摘要绑定的工作输入在同一个 SQLite 事务里入队。消费者按顺序读取待处理事件，领取单写租约，从生产该回执的候选与已检查点化的项目状态启动新 DSH。候选、安装物、两份复验回执和前一账本的终态均在派发前核对。最初的历史输入使用封存证明，后续候选从同一运行的真实验收产物生成证明。

模型结束并封存提交后，宿主先完成独立复验，再记入队列结果。符合条件的拒绝产生子事件，消费者继续派发。重开后先处理未登记结果的已结算工作，已入队子事件按同一 ID 去重，已领取且终态不明的会话保留原现场。校验中断可重做独立验收，模型请求维持原账本。单一宿主消费者租约防止同一验证目录被并发写入。

合格候选等所有者以完整 SHA 与构建摘要核准。宿主核对接班状态，换版和下一张工单入队在同一事务提交。核准已持久化而安装切换尚未完成时，重开运行会继续核对并派发。后继会话使用晋升后的安装物、同一项目状态与新账本。

首笔历史 `UNKNOWN` 及其原运行位仍按 `817070da` 的封存保留。本轮从已结算的 `91b5bc0c` 候选建立独立的会话准入和账本，新的 `UNKNOWN` 仍关闭后续准入。真实会话沿用按量记账、256 笔、30 分钟、单笔 240 秒，无金额和总 token 上限。模型提示只给维护目标和封存材料位置。

```sh
node scripts/pnwf/software/self-evolution/run.mjs loop-qualify <new-mock-dir> <historical-rejected-dir>
node scripts/pnwf/software/self-evolution/run.mjs loop-live <new-live-dir> <qualified-mock-dir> <historical-rejected-dir>
node scripts/pnwf/software/self-evolution/run.mjs loop-resume <campaign-dir>
node scripts/pnwf/software/self-evolution/run.mjs loop-approve <campaign-dir> <owner-approval.json>
node scripts/pnwf/software/self-evolution/recount.mjs research-evidence/pnwf-software/2026-11-22/maintenance-queue
```

### 零付费队列资格

最终资格为 13 条普通 DSH Mock、49 笔模拟请求，零付费。第一轮使用脚本化候选重现两份原现场的 0/2，自动提交拒绝回执。第二轮从第一轮提交启动，沿用同一项目和原安装物，使用独立账本。参考修订通过两份原现场和三项反例。Mock 所有者核准后，宿主切换到该构建，队列自动派发下一张工单，核对读回和独立提交。随后用全新宿主进程重开，队列与运行位摘要一致，所有完成的事件只派发一次。[资格](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/mock/qualification.json) · [重开记录](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/mock/cold-restart.json)

首次接班复验在已激活、工单已入队时发现，消费端重复创建了准备好的状态目录。故障时队列保持 `PENDING`，没有新请求。修订后消费者原样读回目录及配置，完整接班复验通过。另用零付费故障注入核对并发消费者拒绝、重复回执折叠、篡改输入拒绝和换版入队失败时的事务回滚。原 64 笔、43 笔以及第一次 0/2 和 UNKNOWN 的归档复算结果保持一致。[目录读回回归](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/prepared-reopen.json) · [事务回归](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/atomic-queue.json)

### 新账本真实续作

第一轮在第 3 笔读取两份入队拒绝回执，随后查看封存的调用和上轮差异。模型选择给 continuity pulse 增加直接交付引导，补充已有结论与新状态的测试，另写并运行了独立的 pulse 探针。第 60 笔提交 `e08811016221653d4b3cb1d9337693e9ec0e9678`，第 64 笔主动记录 `DELIVER`，第 66 笔自然退出。89 个工具调用全部配对。66 笔终态用量完全对账，共 9,750,002 tokens，其中 fresh 223,132、cache read 9,486,848、output 40,022，容器会话耗时 531.336 秒。[提交差异](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/3/first/candidate.patch) · [轨迹](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/3/first/session.json)

候选的两份独立正例仍为 0/2，各 3 笔自然退出，均未出现提交后的收尾机会。模型的修改作用于显式查询 pulse 时的提示，原现场在提交前已完成这次查询，提交后直接回复。三个反例、22 项定向测试和同项目状态读回均通过。[独立复验](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/3/candidate-probes/checks.json)

真实宿主在同一运行中自动处理了这两份新结果。`REJECTION_PUBLISHED` 记录 `e0881101` 的失败，1.084 秒后 `WAKE_DISPATCHED` 记录子事件 `campaign-wake-4a915479954985f4cf77630ec53eea9c` 的领取。第二轮从这个候选与第一轮项目库重新启动，使用全新 DSH 和账本，加载的仍是原稳定安装物。[队列事件](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/slot.json)

第二轮读到新拒绝和历史回执。模型把直接收尾做成 pulse 和 continuity 工具中的结构化状态，编写 delivery-required 探针并反复复验已有结论与阻塞情形。第 63 笔提交 `cd6ef14d708c2fb19a9c9887c3b511f5d454c899`，第 66 笔记录 `DELIVER`，第 68 笔自然退出。96 个工具调用全部配对。68 笔用量完全对账，共 12,914,238 tokens，其中 fresh 260,898、cache read 12,615,936、output 37,404，容器会话耗时 524.971 秒。[提交差异](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/4/first/candidate.patch) · [轨迹](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/4/first/session.json)

第二轮的两份原现场仍为 0/2。结构化状态只在调用相应工具时可见，两份重放都在提交后直接结束。22 项定向测试、三个反例和项目读回通过。宿主再次从独立复验生成并消费拒绝回执，从 `cd6ef14d` 启动第三轮。[第二轮独立复验](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/4/candidate-probes/checks.json)

第三轮通过 shell 读取了拒绝回执及两份会话的实际记录。模型设计了工件级交付探针，调整直接交付工件和状态表示，并在第 69 笔运行相关套件、第 70 笔用新探针检查被拒候选。该轮 112 个工具调用全部配对，Git HEAD 仍为 `cd6ef14d`。九个已跟踪文件和一份未跟踪的探针存为原稿，未产生新提交、未记录本轮 `DELIVER`，尚未进入候选复验。[停点轨迹](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/5/first/session.json) · [原稿](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/5/first/working.patch) · [未跟踪探针](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/5/first/untracked.tar.gz)

第三轮第 71 笔 `4bcfa3c8-b6c5-4faa-acca-9bc26b7f7a39` 为新的 `UNKNOWN / UPSTREAM_UNCERTAIN`。前 70 笔的账本和轨迹用量一致，确认 16,734,447 tokens，其中 fresh 316,018、cache read 16,377,984、output 40,445。全轮严格归因保留未通过，不能确定实际总量。容器会话 480.461 秒，退出码 137，宿主写出常规停止和账本记录，并将运行位置为 `USAGE_UNCONFIRMED`。[新停止账本](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/r/5/first/out/MAINTAIN/request-accounting.json) · [原 UNKNOWN 独立引用](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/prior-unknown.json)

新运行共准入 205 笔，204 笔确认 39,398,687 tokens，三轮 cache write 均为零。两次真实的拒绝到派发均由消费者完成，真实安装物仍为 `07ab5aad`。两个候选各自冻结为 0/2，第三轮原稿停在独立验收之前。没有核准请求、真实换版或后继工单。[队列](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/live/queue.json) · [离线复算](../../research-evidence/pnwf-software/2026-11-22/maintenance-queue/recount.json)
