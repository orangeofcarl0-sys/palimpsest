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
