# 修复 Palimpsest 重启后的交接追溯

产品基线为主线 `6bf50e90dfad78c4eff668f369d5dd0c5d84564e`。这张工单来自已完成的 gRPC 真实模型接续。模型完成修订、所有者核准、宿主重启后，接班者可以看到接受版本，却无法按 Pulse 显示的旧结论 ID 查到结论，还得从项目日志判断一条验证记录是否是待办。项目仍是测试部署，缺陷和历史记录来自实际产品运行。[原始接续报告](GRPC-AUTONOMOUS-CONTINUITY.md#真实项目的接受与接续)

## 交给维护者的工单

> 我接手一个已有核准版本的项目，重启后 Pulse 说旧结论重新打开了，复制结论 ID 却查不到记录。已经核验的版本说明也出现在待调查问题里。请修复这段交接流程，让后来的人能从旧结论追到当时交付的版本、当前接受的版本及各自的来源，并看清眼下还有哪些问题需要处理。请用现有的归档项目复现，提交可维护的修复、回归测试和简短的维护说明，说明怎么验证旧项目与新项目。

随工单提供既有故障报告、报告引用的原始归档和复现命令。运行方在候选提交上独立验收。实施者自行决定从哪里查起、是否请人复核及如何实现。[既有故障报告](GRPC-AUTONOMOUS-CONTINUITY.md#真实项目的接受与接续)

## 现主线复现

从归档独立恢复 Git、Work 和 Journal，离线校验通过 40 个文件。两次冷启动均调用普通部署实际注册的 `palimpsest_continuity` 工具，得到以下相同结果。全程零模型请求。

| 项目事实 | 现主线输出 |
| --- | --- |
| 所有者已通过 Work 事件 8 接受 `95b83e71ee9a37041b9918b5e8b797eebabf69c9` | Pulse 读取该完整 SHA |
| 旧 `DELIVER` 使用上一项目基线 `fbeb8958f4405688b13f37dbdec330157a660ab0`，已交付工件实际指向 `95b83e71…` | Pulse 显示 `REOPENED`，指出修订、HEAD 和后续日志变化 |
| Pulse 展示旧结论 ID `episode-e7050e9ddf64ccebde7f08f6` | 按 `episode:` 来源引用查询返回 `found: false / UNKNOWN` |
| `pje-d0c977aae7bb8bfeca9159f76e14a7d1` 记录发布核验 | 按日志 ID 可读，归类为 `AGENT_INTERPRETATION`，进入待调查问题 |

源记录分别由 Work、Episode 和 Journal 持有。Work 的接受事件决定正式 HEAD，日志提供发布核验，Episode 记录旧的交付判断。这个工单允许实施者调查两种用户症状是否应分别解决，验收依据是来源、语义和可操作性。[Work 核准](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/acceptance.json) · [历史查询轨迹](../../research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/accepted/out/RESUME/attribution/0.timeline.json)

## 交付验收

- 两次冷启动各自读取同一份恢复状态。从 Pulse 给出的结论 ID 可以追到旧 `DELIVER`、当时的基线与工件以及它为何重新打开。纯 ID 和 Pulse 使用的带类型引用遵守同一查找语义。不存在的 ID 仍返回 `UNKNOWN`。
- 用户能追到正式接受的完整 SHA 和 Work 事件，以及相应的验证日志；原有工件仍可用 `commit:path` 取回。验证日志可检索，待办列表与就绪提示只要求处理真正未解决的事项。测试包含一条真正未解决的问题及一条缺乏依据的普通笔记。
- 主线旧数据库直接读回，历史记录保持原样。核对候选前后的 Git HEAD、接受事件及日志记录。覆盖普通 DSH 入口，并人工走一遍已有的侧栏与 Workspace 版本路径。发布说明包含回归入口和兼容影响。
- 若安排 Palimpsest 与强原生 DSH 对照，两组各在独立副本中使用同一维护者工单和归档。使用各自已有的调查和协作工具。交付按同一组用户操作验收。另记录实际协作者提供过什么证据、该证据是否改变补丁、测试或说明。单人提交也按相同验收记录。

## 离线复现命令

候选复验两次冷启动均通过，四份工件的 `git cat-file` 字节摘要与旧结论一致。恢复副本的 Work、Journal 事件与档案逐行一致，Git 保持核准提交且工作树干净。原生 DSH 侧栏和 Workspace 均显示同一接受 SHA 和发布核验记录。复验用本地宿主和浏览器，模型请求为零。

TypeScript、Web 构建、架构与公共 API 检查通过。Episode、Basis Admission、Worker 回传、状态引导、约束和检查器六个测试文件共 55 项通过。本地 Windows 串行执行回归，浏览器复验使用单独的恢复目录。

同一条命令可用于基线和候选。修复后，裸 ID 与 `episode:` 引用均返回历史结论、原基线、可取回的工件记录、重开原因及原 Journal 引用。当前基线在响应顶层的 `basis`，有可核对的 Work 记录时，`headAcceptance` 提供接受出处。本档案用 `DIRECT_BASIS` 的事件 8 和批准事件 7。只有初始 HEAD 的项目返回 `headAcceptance: null`。

提交绑定的核验日志仍可按 Journal ID 查到，标为 `OBSERVED_SOURCE`，即观测到日志及其来源。日志本身不产生核准。真实 `OPEN_QUESTION` 和缺少结构化依据的普通笔记继续进入待调查列表。兼容既有 `commit` 引用和写入归档时使用的 `git_commit` 完整 SHA；历史项目可直接读取原库。

```powershell
node node_modules/typescript/bin/tsc -b
$evidence = 'research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live'
$restored = Join-Path $env:TEMP ('fleet-cold-read-' + [guid]::NewGuid())
node scripts/pnwf/software/autonomy-archive.mjs --verify=$evidence --restore=$restored
if ($LASTEXITCODE) { throw 'Archive restore failed' }
$env:PALIMPSEST_DOGFOOD_PROFILE = Join-Path $restored 'profile.json'
@'
import { launchDeployment, loadDeploymentProfile } from "./dist/src/advanced.js";
const deployment = launchDeployment(loadDeploymentProfile(process.env.PALIMPSEST_DOGFOOD_PROFILE));
try {
  const tool = deployment.installed.tools.find(({ name }) => name === "palimpsest_continuity");
  let calls = 0;
  function read(args) {
    const callId = "readback-" + ++calls;
    return tool.execute(args, {
      name: tool.name, callId, rootCallId: callId, arguments: args,
      signal: new AbortController().signal,
    });
  }
  const pulse = await read({ action: "pulse" });
  const id = pulse.episode.conclusion.conclusionId;
  const note = "journal:pje-d0c977aae7bb8bfeca9159f76e14a7d1";
  const results = [];
  for (const subject of [id, "episode:" + id, note, "episode:nonexistent-handover"]) {
    const { found, standing, episode, headAcceptance } = await read({ action: "explain", subject });
    results.push({ subject, found, standing, episode, headAcceptance });
  }
  console.log(JSON.stringify({
    head: pulse.basis.headCommit, state: pulse.episode.state,
    changedSince: pulse.episode.changedSince,
    questions: pulse.openQuestions.map(({ id }) => id),
    unresolved: pulse.episode.readiness.unresolvedQuestions, results,
  }, null, 2));
} finally {
  await deployment.close();
}
'@ | node --input-type=module
```

复验侧栏和 Workspace 的版本入口时，在上一步的恢复目录运行以下命令。普通工具的回归另覆盖找不到的 ID、另一轮结论之后的旧 ID、真正待办与缺乏依据的笔记。[工具回归](../../test/alhs_episode_convergence.test.ts) · [核准来源回归](../../test/pnwf_cq_basis_admission.test.ts)

```powershell
node scripts/inspector/dsh-web.mjs --deployment="$restored/profile.json" --readback="$evidence/acceptance.json" --result="$restored/ui.json"
```

## 真实模型配对

2026-11-21，两组从产品修复前的 `6bf50e90` 开始，提示就是本页工单加原始故障报告位置。每组有独立 Git、DSH home、cohort 和账本。Palimpsest 使用普通工具配置，强原生 DSH 使用原生 Git、Shell、Subagent 和 Workflow。冻结参考修复只用于脚本化 Mock。两组真实运行使用同一 Linux 工具链、OpenCode Go `deepseek-v4.1-flash` 和每组 64 笔、30 分钟、单笔 240 秒的按量合同。评估器在会话后从精确候选恢复原始 Git、Work 和 Journal，在隔离环境中运行两次冷启动和既有回归。[Mock 和冻结合同](../../research-evidence/pnwf-software/2026-11-21/cold-handover/mock/matrix.json)

首次 Windows 挂载资格在宿主执行 `git status` 时超时，两个初始格均为零请求。之后改用 Linux Git 卷，保留相同主线 Git 对象和原始输入。修复前基线的两轮读回共通过 5/15，脚本化 Mock 的两个参考候选均为 15/15，各 6 笔模拟请求并自然退出。

### Palimpsest 原稿

开场调用 Pulse（15→16）读取维护项目；之后主要用 Bash 阅读源码、测试和历史提交。按原始 SQLite 和 Git 恢复项目后，通过本地宿主复现问题（345→348）。首次可见代码修改发生在 441→444。它把历史结论、提交绑定的日志，以及当前 ProjectIR 版本加入 Continuity 投影。545→548 写下新增回归，553→556 执行测试，后面继续排查 Vitest 缓存配置。第 64 笔用量已结算，下一次准入触发请求上限。原工作区 HEAD 仍为 `6bf50e90`，保留五份源码修改及一份未跟踪的测试，未记录 DELIVER。轨迹中没有子会话或正式委派。[调用与结果](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/P/trajectory.json)

对原稿另建离线副本，原封应用工作区差异及新增测试。TypeScript 和 21 项测试通过，两次真实档案读回合计 11/15。旧 ID、原始工件与核验日志的待办分类已经修通。解释列出通用重开条件，漏掉旧结论在这个项目中的实际重开原因。当前版本来自 ProjectIR 和日志引用，解释没有给出独立 Work 接受事件。11/15 是离线原稿诊断，真实会话的提交与退出仍按请求上限终止记录。[原稿复验](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/P/working-grade.log)

### 强原生 DSH 原稿

模型用 Bash 核对 Git 来源、版本链接和 Continuity 入口，重放原归档（391→394），第 36 笔开始改源码（415→418）。它选择把交付版本和当前接受版本显示到 Episode 与侧栏关系图，并用已经存在的 `directOutcome.admittedDirectCommit` 判断直接接受版本。它修改了旧归档报告中的维护说明，扩展了两界面所用的数据和侧栏单元测试。551→554 新建交接回归。首次 Vitest 启动失败后，它以 runner 配置加载器重试成功（575→578），继续跑旧套件并补侧栏验证。最后一次操作仍在核对 `dist` 的 Git 路径，未提交。[调用与结果](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/F/trajectory.json)

原稿在隔离副本中编译通过，27 项测试通过，冻结读回 9/15。旧结论可按 ID 查询，核验日志仍可读并移出待办。按旧结论查到的是交付版本级引用，未逐项呈现四份原工件，且缺实际重开原因与 Work 接受事件号。原稿还改变了 Episode 的重开规则。当交付 SHA 等于接受版本并且其逻辑认为没有其他后续变化时，会消去修订与 HEAD 漂移造成的重开。这会改变历史结论的适用性解释，超出了工单要求的回查能力。UI 扩展在原稿中留档，复核只运行了侧栏单元测试。[原稿复验](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/F/working-grade.log)

### 用量、选路与停止现场

| 观测 | Palimpsest | 强原生 DSH |
| --- | ---: | ---: |
| 请求全部结算 | 64/64 | 64/64 |
| 工具调用与结果配对 | 85/85 | 94/94 |
| 首次源码修改对应第几笔 | 44 | 36 |
| Fresh input | 203,256 | 272,496 |
| Cache read | 8,414,976 | 11,362,304 |
| Cache write | 0 | 0 |
| Output | 33,782 | 52,936 |
| 总 tokens | 8,652,014 | 11,687,736 |
| 运行耗时 | 12 分 48 秒 | 约 17 分 21 秒 |
| 原稿离线读回 | 11/15 | 9/15 |
| 模型提交 / 自然退出 | 均未达成 | 均未达成 |

128 笔合计 20,339,750 tokens，新增 UNKNOWN 为零。实际各只有一个 Principal，两个模型均自行调查和修改。Palimpsest 使用产品工具读取一次 Pulse，随后用 Bash 调查和实现；强原生使用 Bash 完成全程。两组共有的交付环境摩擦是 Vitest 默认配置加载器试图在只读依赖目录写临时文件。Palimpsest 在请求耗尽前还在查原因，强原生尝试 runner 配置加载器后跑通并继续修改界面与文档。这个故障与模型在前 44/36 笔主要用来调查的开销分别记录。离线评估器已固定用 runner 配置加载器，从而衡量实际原稿。[机器对比](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/comparison.json)

两组均由请求上限停止。P 依照宿主终态记录。F 停止时桥接出现 `write EPIPE`，没有写出常规运行终态。F 的退出码 137 和耗时从停止容器读回，账本由 SQLite 离线快照读取，原会话行保持当时状态。保留 P 的初次逐笔归因失败。离线使用已有的唯一用量四元组归因，P/F 各 64 笔均与终态账本匹配。耗时的取值来源有差异，表中分别保留其口径。[F 停止观察](../../research-evidence/pnwf-software/2026-11-21/cold-handover/live/F/offline-observation.json)

两个原稿都显示模型能从真实仓库定位引用和待办分类。样本的主要缺口仍是历史结论、真实重开原因及正式接受来源的完整串联，以及在窗口内留下可交付的 Git 提交。两个模型在这次业务提示下都选择独立工作，样本尚未观察到合作及其对交付的影响。上一轮人工实现 `1aa69f60` 和原始 gRPC 轨迹各自保留。
