# 维护接班中的新证据 · Palimpsest 与强原生 DSH

## 工单与冻结条件

主线 `712ccf0f2a1f10ba2c87bce0143eed717dcb1144` 的 handoff 把 #298 的真实写回列为待合入、待启用。接班工单要求核对下一步，只提交 `handoff.md` 的修订。旧决定直接取自该 Git 对象。随后可读的材料是 #302 合入记录、#298 Issue 和 Bot 评论的 GitHub 读回、绑定原决定与评论摘要的离线复验。公开写回和真实模型准入分别核对。

沿用正式维护窗口。每个会话有独立账本和全新 DSH home，最多 256 笔、60 分钟，单笔 240 秒，按量记账，金额和总 token 上限为空。真实路由为 OpenCode Go `deepseek-v4.1-flash`。容器版本沿用 #298 正式试点的 DSH `0.2.1-rc.5`，两组使用相同镜像摘要、原工单、源提交和业务提示。按同一候选 SHA 检查提交差异和冻结证据。隔离世界从确切主线对象稀疏检出。Palimpsest 冷读项目 Journal、短索引和资产检查点。强原生 DSH 用耐久的工单文件、原生工具及同一份版本化复验。接班起点是历史真实工单与原交接。两条实跑各启动一次接班会话，Palimpsest 在新隔离项目从原提交重建草案检查点后重开同一项目库。#298 正式运行位的原账本与准入继续按既有停点读回。

原判 `REJECTED / persisted-candidate`、冻结 0/4、续修第 16 笔 UNKNOWN、离线草案 1/4 和待准入 ID 来自既有现场。真实查询只读取公开 PR 和 Issue。试验候选只在隔离世界保存。

## 零付费资格

| 入口 | 结果 |
| --- | --- |
| #298/#299 归档 | 18 项运行通过，另一个全量安装 Mock 选跑项跳过。两份账本摘要一致，原续修派发仍为一次。模拟失去首次评论确认后重启，仍只有一条评论，无重复写回。旧运行位写回被拦截。 |
| 无 Git、无 A2A 设备评审 | 14 项冻结检查通过。三场共 17 笔模拟请求全部结算并自然退出。恢复原工作簿，拒绝错检查点与旧回执，B5 由 A 改为 B 并结清，原资料保留。另有 7 项定向测试通过。 |
| 接班配对 | 两个隔离世界各 3 笔 Mock，候选各通过七项文件与内容验收并自然退出。短索引拒绝历史版本。监工只执行一次复验，重开数据库仍读回同一回执，错绑定与重复投递均拦截。 |

#298 首次重放将已同步的本地记录配给空的模拟远端，未进入预期的首次 POST 测试。使用只读源 Slot 另制 SQLite 副本，只清除该模拟投递的本地状态和发布凭据，原案与账本照原字节使用。设备首次运行未显式指定 DSH 默认权限预设，使用容器既有 `workspace-write` 与 `approval: never` 配置后通过。配对试跑先补齐原安全探针需要的 README 与 package.json，再修正 Mock 从序号 0 开始。各初次结果单独保存在运行根目录。TypeScript 构建、架构与公共 API 核查通过。

## 真实结果

| 会话 | 冻结验收 | 提交 | 交付与退出 | 请求 | Fresh input | Cache read | Cache write | Output | 总 tokens | 会话耗时 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Palimpsest | 7/7 | `cc03b4294bbc7dda09c6846ade27cb20ec1273b8` | 记录 DELIVER，自然退出 | 22 | 88,695 | 1,263,488 | 0 | 14,861 | 1,367,044 | 189.200 秒 |
| 强原生 DSH | 6/7 | `93f587bf0fb2e0208b339fb52c6b3c2cb742e004` | 提交后自然退出 | 17 | 131,056 | 1,357,056 | 0 | 16,229 | 1,504,341 | 168.710 秒 |

两组各 35 次工具调用，调用与结果按 ID 全部配对，各有一个 Principal 会话。39 笔真实请求均按唯一用量四元组绑定账本和回放，新增 UNKNOWN 为零。版本复验在宿主离线完成，复核模型用量为零。两个候选均是同一完整主线 SHA 的直接后继，只改 `handoff.md`。从各自 Git 对象读出提交原稿，Palimpsest 的交付回执绑定相同完整候选和原稿 SHA-256。强原生的交付以 Git 提交和退出为准。[机器复算](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair/comparison.json) · [原判](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair/live-matrix.json)

### 首次有效动作与反例采纳

这里把首次有效动作定义为读回带基线的**原工单**，另记取得反例、首次改稿、实际提交。时间以各自 DSH 回放开始为零，表中的会话总耗时另包含容器启动后的初始化和退出。

| 轨迹点 | Palimpsest | 强原生 DSH |
| --- | --- | --- |
| 读回原工单 | 第 3 笔 `36→40`，10.244 秒。之前第 1 笔 `15→16` 查了 Pulse，第 2 笔核对目录与 Git。 | 第 2 笔 `35→38`，6.496 秒。一个 Bash 调用批量读工单和新材料。 |
| 取得反例 | 第 4 笔 `45→48/46→49/47→50`，评论在 14.520 秒读到，复核并列的冷重放与 PR 合入对象。 | 同为第 2 笔 `35→38`，在同一工具结果看到评论、PR 和冷重放。 |
| 首次改稿 | 第 9 笔 `97→98`，71.524 秒。随后按摘要、运行位、当前停点和证据行分段更新。 | 第 13 笔 `187→190`，135.927 秒。此前反复用 grep、sed、Git 对象找历史上下文，部分历史路径仅在完整提交树可读。 |
| 提交与收尾 | 第 18 笔 `163→166` 提交，第 20 笔 `183→184` 查 readiness，第 21 笔 `189→190` 记录 DELIVER。提交时为 138.954 秒。 | 第 16 笔 `211→214` 提交并检查干净状态，156.033 秒。第 17 笔自然结束。 |

先发现反例的是宿主的版本绑定复验。它从实际公开评论和已封存的状态读回确认 `publication-still-pending=false`，两组读到的是同一份证据。两位 Principal 均独立采纳这份反例，撤销“等待首次写回”的动作，改为“写回已完成，准入所有者核对旧停点后决定是否续修”。两组都保留活动安装 `166cf7c6`、原 `REJECTED`、第 16 笔 UNKNOWN、1/4 和同一待准入事项。两条轨迹均未开启新的模型复核。Palimpsest 首次读工单与反例较晚，动笔和提交较早，正式收尾分别占第 20、21 笔，会话总耗时还包含启动与状态读回。[P 原稿](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair/P/handoff-submitted.md) · [F 原稿](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair/F/handoff-submitted.md)

强原生原判的失分是 `publicationEvidence`。它正确写明评论已发布、保留对应文件及其摘要，也在轨迹中读取了评论原文，但最终 Git blob 省去了具体公开评论 ID `7124721202`。因此业务决定正确，公开证据仍需要再展开一层，原判保留为 6/7。两份原稿都使用隔离世界里的 `evidence/` 短路径。仓库 handoff 使用归档内的真实相对路径和公开评论链接。[公开评论](https://github.com/orangeofcarl0-sys/palimpsest/issues/298#issuecomment-7124721202) · [原稿 Git 差异](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair/F/candidate.patch)

### 为什么请求较多但用量较低

Palimpsest 多 5 笔请求，耗时多 20.490 秒，fresh input 少 42,361，cache read 少 93,568，总用量少 137,297。两边工具调用数相同，使用方式不同。Palimpsest 用 13 次 Bash、10 次读文件、2 次 grep、7 次定点编辑和 3 次产品状态或交付调用。强原生的 35 次工具调用全部走 Bash，通常在一笔模型请求里合并几次输出。强原生在第 4 笔前收到 129,927 字节工具回显，该笔 fresh input 41,531，其中包括较宽的 handoff 与项目资料扫描。Palimpsest 同样有宽读，第 4 笔前回显 66,910 字节，该笔 fresh input 20,538。Palimpsest 首请求工具清单还多 21,188 字节。差异更符合读取范围、每笔合并的输出和收尾方式共同影响用量。短索引已在开场呈现，模型随后还是主动查了 Pulse 和正文。检查点由宿主冷读核对，这次工作区已有确切原稿。样本各一条，索引、检查点与监工的各自净贡献仍待单独对照。[逐笔归因与回放](../../research-evidence/pnwf-software/2026-11-27/maintenance-cold-pair)

这次最明确的收益是把已完成的公开写回与仍阻断的执行准入分别交接，双方都能做到。Palimpsest 额外保留了可直接复查的评论编号和候选绑定的 DELIVER。两组的证据输入相同，数据支持冷接班时的采纳与交付比较。里程碑二仍需真实参与者自主发现并传播新的反例。

## 复算入口

运行证据根目录 `F:/Codex_Work_Space/Palimpsest/experiments/runs/maintenance-cold-pair-20261126170242`。冻结完整模型输入、独立复验摘要、Mock 与真实候选、逐请求账本、原始回放以及 Git 差异均按各阶段保存。配对入口是 `scripts/pnwf/software/maintenance-cold-pair.mjs` 的 `freeze`、`mock` 和 `live`。真实启动前核对设备、归档和配对三份资格。历史归档原本的两份请求账本及原试点 Slot 由只读输入提供。实跑结果使用仓库既有归因与逐请求回放匹配。

运行目录的 pair-v3/frozen-runner.mjs 保留开跑时源码字节及冻结摘要。仓库入口只整理了末尾换行和一项未使用的导入。

## PR #303 发布结清

所有者已核准并按 rebase 合入，发布已结清。送审 feae96bde35909eacb86450c17ac42087ef73f9a，主线 73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad。文件树相同 94af6e02d70a081fb107ee06bc770b5aa55f77ef。主线 4/4 工作流、15/15 jobs 通过，见 https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878125806、https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878125898、https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878125820、https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/45878126203。原样保留 Palimpsest 7/7、强原生 6/7。#298 第 16 笔 UNKNOWN，草案 1/4，continue-6bae11aa94c5acf4265833da 仍 WAITING_FOR_ADMISSION。
