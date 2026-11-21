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
