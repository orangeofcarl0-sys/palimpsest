# 从封存轨迹复用定向测试方法

本轮从主线 `8e1e3098328a8d75758f50b884599206f4b547b7` 开始。验证的是一条经宿主核准的方法能否进入下一张工单的**首次测试选择**，以及模型有没有实测使用。上一轮接受的 `test:focused` 仍是历史项目候选，两次后续会话对它的调用均为零。本轮复用四条轨迹都观察到的底层做法，采用同一工作树和同一宿主构建隔离提示变量。

## 从轨迹到核准

| 封存轨迹 | 观察到的故障 | 观察到的恢复与反例 |
| --- | --- | --- |
| 初次维护 Palimpsest | 83→86，默认加载器写 `.vite-temp`，工具外层成功，内部退出 1 | 91→94，直接 runner 通过。121→124 验证学得的脚本。129→132 故意失败退出 1 |
| 初次维护强原生 DSH | 69→72，同一启动故障 | 77→80，直接 runner 通过。91→94 脚本通过。105→108 故意失败退出 1。第 12 笔 UNKNOWN 和未提交原稿沿用原封存 |
| 后续旧版 | 251→254，TS18048 在 Vitest 启动前中断。321→324，再现 `.vite-temp` | 337→340，runner 启动成功但断言失败。351→354，定向测试通过 |
| 后续接受版 | 199→202，`pnpm exec` 启动时写 `.local` 失败 | 215→218，直接调用本地 Vitest、runner 与禁用缓存后通过，无 `test:focused` 调用 |

离线重算把每组的真实调用和结果按 ID 对齐，以四个 OrganizationMemory `RUN_RESULT` 为来源。此处的运行结论指离线见证是否成立，原会话判定和用量缺项保留在各来源。`Procedure.prepare` 后先由独立准入端拒绝未批准的候选。宿主核对四个来源、同容器默认启动失败、定向测试通过和故意失败退出 1，再核准精确候选摘要并发布 `ACTIVE` 修订。内容是如何选用 runner 的说明，由已有 Procedure 保存出处和状态。

## 普通 DSH 与 SDK

普通 DSH 的部署可选配置 `focusedTesting`，包括可信宿主提供的 `storePath` 与完整 `procedure` 引用。启动业务会话时，宿主在第一条消息前调用同一只读选择器。打包 `/product` 消费者在首次构造测试命令前调用 `installed.focusedTesting.read()`。两边得到相同的 `{ procedure, head, argv }`。无配置或不适用时，SDK 返回 `null`，DSH 会话沿用原消息。

读取要求当前 ACTIVE 版本与宿主选择逐字段相同，且此版本带定向 Vitest 能力标识。目标检出必须是 Linux 上的 Palimpsest、Node 24+、本地 Vitest 4.1.10、依赖目录不可写、`vitest.config.ts` 受 Git 跟踪且相关文件未改动。选择器只返回固定 argv，Work 权限仍由原有授权持有。SDK 消费者选择测试路径并观察退出码，DSH 通过既有 shell 工具执行并记录结果。撤回 Procedure 后，后续选法读取即不再提供该版本。

记录分为两份事实。`PALIMPSEST_FOCUSED_TEST_OFFER` 记录宿主给了什么方法和看到的 HEAD，工具 `callId` 及实际输出记录模型运行了什么。直接本地 argv、等效命令、只用 runner、使用历史包入口分别识别。构建先失败、加载器启动失败、断言失败和测试跑通分别计数。首次通过窗口包含发出该次测试及此前的请求，取测试结果出现前的轨迹用量。该窗口不要求它是最终提交的验证。

## 零付费资格

核准的 Procedure 为 `prc-1966931f7a21b77663b7cff1c4129b76` 第 0 版，完整摘要 `f76d9724545e81b6867f9f9b155f56d485a363a8ab07cd8146bf3d9879ad014e`。原始四条轨迹摘要、调用 ID、离线见证、候选和准入理由可从核准记录重算。宿主以只读方式打开 Procedure 库。[核准记录](../../research-evidence/pnwf-software/2026-11-21/focused-method/approval.json)

外部消费者离线 `npm install` 实际打包的 SDK，并从 `/product` 读到与普通 DSH 相同的引用及 argv。执行返回 0，既有测试 9/9。未提供库、摘要错误、已撤回、清单被改动、依赖目录缺失或可写六项均返回空。默认启动失败的原日志、正常运行和故意失败退出 1 均保留。[外部消费者](../../research-evidence/pnwf-software/2026-11-21/focused-method/sdk.log) · [容器反例与日志](../../research-evidence/pnwf-software/2026-11-21/focused-method/mock)

两条普通 DSH Mock 各 4 笔模拟请求，全部对账，实际付费 0 笔。带方法组第 1 笔跑通选择的命令，无提示组第 1 笔默认启动失败、第 2 笔恢复。两边的脚本化候选均独立验收 5/5、回归 10/10，完成类型检查、提交和 `DELIVER` 后自然退出。构建、架构、公共 API 检查通过，Episode、Procedure、Basis Admission 三个定向套件共 53 个测试通过。[Mock 机器结果](../../research-evidence/pnwf-software/2026-11-21/focused-method/mock/qualification.json)

## 工单与定向验收

新工单修复 `DELIVER` 工件出处提示。原代码把 HEAD 漂移、无法确认 HEAD 和 Git 工件读取失败误报成未提交修改。验收覆盖这三种情形、真实脏文件，以及已提交、缺失和未跟踪的旧行为。独立评分文件仅在宿主副本中出现。两个真实会话使用普通 DSH、同一主线 Git SHA、同一只读依赖镜像、同一业务工单，各自全新会话与账本。WITH 的第一条业务请求附有方法，WITHOUT 走相同入口但无方法选择配置。模型自行决定如何诊断、测试和收尾。

沿用 OpenCode Go `deepseek-v4.1-flash`、DSH `0.2.1-rc.5` 和 `paid-usage-only`。每会话 64 笔、30 分钟，单笔 240 秒，金额及总 token 不封顶。用量未知时停止后续格的准入。Mock 与真实运行入口分别只接收新输出目录，以及新输出目录加已通过的 Mock 目录。实验候选提交留在各自隔离成果。

```sh
node node_modules/typescript/bin/tsc -b
node scripts/pnwf/software/focused-maintenance-run.mjs <new-mock-directory>
node scripts/pnwf/software/focused-maintenance-run.mjs <new-live-directory> <qualified-mock-directory>
```

## 真实配对轨迹

### 带方法组

宿主在首条业务消息中提供绑定 `8e1e3098` 的方法。第 1 笔读取 Pulse，第 2 到 17 笔查找出处提示、相邻测试和 Git 版本。模型还检查本地引用、reflog 与上游是否可达，`git ls-remote` 在隔离网络中无法解析 GitHub。第 18 笔才第一次运行测试，调用 170→173 直接采用建议的 argv，既有测试 9/9。此前没有尝试默认加载器或 `pnpm exec`。首次通过发生在轨迹起点后 126.934 秒，前缀用量为 53,831 fresh、612,480 cache read、0 cache write、8,411 output，合计 674,722 tokens。

第 25 笔已启动测试，新增回归的断言仍失败。夹具将 HEAD 移回旧提交后，工件字节也相对该提交变脏。模型在集成夹具中保留 HEAD 漂移时工件未确认、再次读取时报告脏文件的断言，另用定向用例检查漂移说明。第 27 笔复测 10/10，第 28 笔跑过 30 个相关测试并通过类型检查，第 30 笔提交 `1485452e706413df8b021324acedc5b270f16932`。第 32 笔记录绑定该提交、覆盖两文件的 `DELIVER`，第 33 笔收尾后自然退出。四次定向 argv 调用均有按 ID 配对的结果，其中一项是断言失败，启动失败为零。宿主在确切提交上独立验收 5/5、定向回归 10/10、类型检查通过。33 笔全部对账，1,616,104 tokens，容器运行记录 325.676 秒。[真实轨迹与候选](../../research-evidence/pnwf-software/2026-11-21/focused-method/live/WITH)

### 无提示组

第 1 到 10 笔也从 Pulse、源码、历史和交接记录着手。第 11 笔 107→110 调用 `pnpm exec vitest`，在创建 `/home/principal/.local` 时返回 EACCES。第 12 笔定位本地二进制，第 13 笔 123→126 直接调用默认 Vitest，又因 `.vite-temp` 无法创建而失败。第 14 到 16 笔检查 Vite 缓存和共享依赖路径，第 17 笔 155→158 用工作区内可写目录替换 `node_modules` 的整目录链接，再逐项指回共享依赖。第 18 笔 163→166 用默认加载器通过既有测试 9/9。首次通过前未使用核准的 runner 命令。该窗口为 73,401 fresh、809,600 cache read、0 cache write、5,912 output，合计 888,913 tokens。

第 28 笔遇到同类断言失败，随后追到 Pulse 会先重读工件。第 30 笔把集成夹具改为第 3 次读 Git blob 时触发 HEAD 漂移，第 31 笔通过 10/10，保留了集成路径中的漂移提示断言。第 36 笔通过 40 个相关测试，第 37 到 38 笔处理临时 `node_modules.optlink` 并恢复依赖入口。第 39 到 41 笔修改了提示与回归，第 42 笔再次搭建可写依赖入口，第 43 笔重新通过 40 项验证，第 46 笔恢复原依赖链接。第 47 笔提交 `d5d4b92e70c13ac598cf7f33c12afeb1f528ccc7`，第 49 笔记录绑定候选两文件的 `DELIVER`，第 50 笔自然退出。整条轨迹没有使用核准的 runner 命令。确切提交独立验收 5/5、定向回归 10/10、类型检查通过。[真实轨迹与候选](../../research-evidence/pnwf-software/2026-11-21/focused-method/live/WITHOUT)

### 从开工到首次通过

| 指标 | 带方法 | 无提示 |
| --- | ---: | ---: |
| 首次发出测试的请求 | 18 | 11 |
| 测试启动失败 | 0 | 2 |
| 首次通过时的请求数 | 18 | 18 |
| 到首次通过的轨迹耗时 | 126.934 秒 | 97.686 秒 |
| Fresh input | 53,831 | 73,401 |
| Cache read | 612,480 | 809,600 |
| Cache write | 0 | 0 |
| Output | 8,411 | 5,912 |
| 用量合计 | 674,722 | 888,913 |

带方法组从首次测试就执行已核准 argv，零启动失败。它把发出测试前的 17 笔用在工单调查上，对照组在第 11 到 17 笔尝试和修复环境。两组第 18 笔同样完成首次通过。带方法组的首次通过晚 29.248 秒，窗口用量少 214,191 tokens（24.1%）。

前缀输入差从启动失败之前就已出现。无提示组第 8 笔的 handoff 搜索返回 61,931 字节，第 9 笔 fresh input 为 19,754，之后单笔 cache read 从 44,416 增至 64,128。带方法组也查了 Git 历史，较大的两次输出为 29,709 和 27,156 字节。两组首笔 cache read 都为零。该样本观察到的用量差混合了两条调查路径、工具输出进入后续上下文和实际环境排查。方法被采用与零启动失败有直接证据。用量和耗时效果仍受这组行为差异影响。

### 完整交付与使用量

| 指标 | 带方法 | 无提示 |
| --- | ---: | ---: |
| 请求数 | 33 | 50 |
| Fresh input | 72,138 | 110,416 |
| Cache read | 1,525,120 | 3,687,040 |
| Cache write | 0 | 0 |
| Output | 18,846 | 26,335 |
| 用量合计 | 1,616,104 | 3,823,791 |
| 容器运行记录 | 325.676 秒 | 445.820 秒 |
| 业务验收 / 公开定向测试 | 5/5 · 10/10 | 5/5 · 10/10 |
| 仅修改允许的两文件，提交干净 | 是 | 是 |
| 确切提交的 `DELIVER`，自然退出 | 是 | 是 |

两边各有一次真实断言失败，回归处理各有覆盖。无提示组保留了通过调整 blob 读取时机触发的集成漂移提示断言。带方法组对其他未识别的观察说明也报告出处未确认，无提示组的默认分支仍报脏文件。冻结判分覆盖已知原因，两个候选的交付质量在冻结范围内一致。

完整运行中带方法组少 17 笔、2,207,687 tokens，快 120.144 秒。用量差中 1,993,496 tokens 出现在首次通过之后，约占 90.3%。那一段包含可写依赖目录重复搭建与清理、不同的回归修订和更长的上下文。这个配对支持将核准方法用于该类只读环境的首次测试选择，说明它能绕开已实测的两个启动故障。请求、用量和总耗时的幅度属于这一次配对。

两组 83 笔共 5,439,895 tokens 全部对账，新 `UNKNOWN` 为 0。离线复算重新按调用 ID 配对工具结果，并通过 OpenCode Go 回放唯一用量四元组与顺序，把两个会话分别绑定到 33 和 50 个终态请求。历史四条原判及先前已封存的 `UNKNOWN` 使用原始记录。候选各保存在独立 Git bundle 中。[运行矩阵](../../research-evidence/pnwf-software/2026-11-21/focused-method/live/matrix.json) · [逐请求复算](../../research-evidence/pnwf-software/2026-11-21/focused-method/recount.json)

```sh
node scripts/pnwf/software/focused-maintenance-recount.mjs research-evidence/pnwf-software/2026-11-21/focused-method
```
