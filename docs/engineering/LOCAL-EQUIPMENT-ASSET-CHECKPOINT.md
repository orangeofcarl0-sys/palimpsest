# 本地设备评审的资产检查点与协作试点

2026-11-22 · 普通 DSH · 零付费 Mock

两份输入沿用同一个设备评审目标与工作簿。公开资料充分时，Principal 直接留下建议。公开资料缺少联机工况时，Principal 留下待复核的问题。新 DSH 从项目状态恢复同一草案和问题，读取资料保管者的回执后更新实际单元格。项目目录没有 Git 仓库，部署关闭对等传输。[路线图](../product/PROJECT-ROADMAP.md#本地设备评审试点) · [冻结结果](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/result.json)

## 冻结的任务与权责

便携记录器在联机采集工况下至少连续工作 480 分钟。达到要求时优先考虑价格较低的型号。保留扫码枪沿用决定、原始数据和上一版工作簿。三个会话使用同一业务提示，普通 DSH 添加相同的项目接续前缀。具体求证对象、是否发起请求以及改哪些字段由可见资料驱动。[业务提示](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/inputs/prompt.txt) · [冻结输入与源码](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/frozen.json)

| 角色 | 能执行的动作 |
| --- | --- |
| Principal | 修改评审草案，保存和恢复声明的工作簿，记录待评审问题，根据新证据更新建议。 |
| 台架资料保管者 | 用单独的本地进程读取持有的原始记录，输入是具体问题与检查点。产出绑定项目、问题、检查点、角色和原始资料摘要的回执。 |
| 所有者 | 接受工作簿的正式版本。试点只交付草案。 |

充分组的公开记录包含联机实测，A、B 分别为 540、555 分钟，A 价格较低。缺口组公开资料为独立工作工况，无法用来判定联机时长。资料保管者持有的联机实测为 A 450、B 550 分钟，只有 B 达到要求。[公开资料](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/inputs/sufficient.json) · [持有人资料](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/inputs/bench.json)

## 原生检查点

部署指定 `localAssetCheckpoints.root` 和允许的文件名。普通 DSH 显示 `palimpsest_asset_checkpoint`，可保存、查询和按完整检查点 ID 恢复。实现从权威 ProjectIR 取当前修订与摘要，把普通文件的完整字节、元数据和最新指针写入项目的 SQLite 事务。再次保存相同版本得到同一 ID。读取内容期间或提交前有基线漂移时拒绝。恢复校验内容摘要、原基线和声明的路径，从完整暂存文件发布，遇到不同的现有草案时保留它。[检查点实现](../../src/project_workspace/local_checkpoints.ts) · [DSH 工具](../../src/adapters/dsh/project.ts)

待复核事项仍由 Project Journal 管理，通过关联指向确切检查点。冷启动读回草案前，运行目录中的原文件已被移开。新会话从检查点库还原 `.xlsx`，并读到 Journal 中未解决的同一事项。台架回执随后才生成。用于评审的工具限制在试点场景，原生资产工具与工作簿业务和本地复核协议解耦。当前资格覆盖显式保存的普通文件和同基线恢复。[复核请求](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/gap/review-request.json) · [状态库](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/gap/state)

## 零付费结果

三条普通 DSH 会话各用全新进程和独立 DSH home，依次结算 4、5、8 笔模拟请求，均自然退出。冻结判据 **14/14**，实际付费请求为 **0**。每个调用和返回均按 DSH 原始调用 ID 核对。产品报告传输关闭，三个运行阶段都无 Git 仓库，也未生成传输与游标数据库。错误检查点、覆盖不同草案和范围外路径均被拒绝。后续定向回归另核对旧基线及内容损坏的拒绝。[佐证与判分](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/result.json) · [定向回归](../../test/local_asset_checkpoints.test.ts)

| 会话 | 观测到的行为 | 工作簿状态 |
| --- | --- | --- |
| 资料充分 | 读到同工况实测后直接保存草案，未发起复核。 | A 建议，540 分钟，引用 `PUBLIC-P17`。 |
| 资料有缺口 | 保留 A 为待复核，保存草案后提出联机时长问题。 | A 待复核，实测单元格为空，保留来源 `VENDOR-STANDALONE`。 |
| 冷重启 | 第 2 笔恢复相同字节，第 3 笔读回同一待复核事项。第 4 笔读取绑定该检查点的回执，第 5 笔改工作簿，第 6 笔保存新检查点，第 7 笔结清事项。 | 指定记录器由 A 改 B（`B5`），状态由待复核改为建议（`C5`），写入 550 分钟（`D5`），引用该回执（`E5`）。扫码枪所在第 6 行保留。 |

以上是脚本化 Mock 的选路。它从实际工具结果判断工况与资料状态，评判器独立核对输入、恢复字节、回执来源和最终单元格。这轮验证执行链，真实模型是否会发现证据缺口并选择求证仍需单列观测。[直接会话](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/sufficient/initial/session.json) · [初稿会话](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/gap/initial/session.json) · [重启会话](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/mock/gap/resumed/session.json)

第一次冷读回时，试点适配器把 Journal 缺省的 `resolution` 误读为已解决。首跑记录已保存。修正读法后，复用原提示、工作簿、公开资料、持有人资料和相同判据。表格工具生成的中间检查文件由试点作者工具清理，最终工作区只保留声明的工作簿。[首次失败](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/first-attempt/mock-observations.json) · [原冻结记录](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review/frozen-original.json)

## 复算

TypeScript 构建、架构与公共 API 检查通过。检查点、部署、项目 Workspace、写入边界及 DSH 适配器共五个定向测试文件，38 项通过。构建使用 `node node_modules/typescript/bin/tsc -b`。完整运行需要已安装的普通 DSH，以及 `PALIMPSEST_SHEETS_NODE_MODULES` 指向表格运行依赖目录。归档复算读取工作簿摘要、原始 DSH 流与账本，使用 Node 即可。

```text
node scripts/pnwf/local-equipment/run.mjs --action=freeze --run=<new-directory>
node scripts/pnwf/local-equipment/run.mjs --action=mock --run=<frozen-directory>
node scripts/pnwf/local-equipment/verify.mjs research-evidence/pnwf-local-assets/2026-11-22/equipment-review
```

## 从 `4ae167a2` 实跑普通 DSH

两组配置了同一个起始工作簿和字节相同的业务目标，各自引用原冻结公开资料。Principal 通过评审工具操作草案，台架资料保管者只能依据一个已登记、绑定检查点的请求给出实测，正式接受归所有者。保留普通 `normal` Profile 的项目工具。试点关闭 shell、通用文件读写、子任务、工作流和联网搜索，公开资料由本地工具读入。项目目录无 Git 仓库，A2A 与入站泵均未配置。DSH 内置 Git 探测在该目录报无仓库，项目状态及验收均走本地文件与 SQLite。[运行合同](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/contract.json) · [启动与日志](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/)

先在同一角色工具范围重跑零付费 Mock，仍为 **14/14**，17 笔模拟全结算。真实会话使用普通 DSH `0.2.2-rc.5` 和 OpenCode Go `deepseek-v4.1-flash`。每会话为独立 `paid-usage-only` 账本，64 笔、30 分钟、单请求 240 秒，金额和总 token 均无上限。若有真正的待复核事项，计划从空草案目录和新 DSH home 冷启。只有请求、检查点和停写草案的摘要相合时，才由资料保管者发布回执。实跑按资料充分、资料有缺口、适用的冷接续顺序准入。[同配置 Mock](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/live-profile-mock.json) · [封存输入摘要](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/frozen.json)

| 组别 | 运行结果 | 草案与复核 |
| --- | --- | --- |
| 资料充分 | 53.494 秒。13 笔准入，12 笔结算，第 13 笔 `UNKNOWN / CLIENT_DISCONNECTED`。没有自然退出。 | 模型读对了公开联机数据，最终没有写表、保存检查点或登记待复核事项。B5 仍为原始 A，稿件内容停在上一版。 |
| 资料有缺口 | 按原合同未准入。 | 没有真实模型选路与回执采纳样本。 |
| 冷接续 | 未启动。 | 首场无持久化待复核事项，账本同时阻断了后续准入。 |

两份公开资料、台架原始记录、业务提示和上一版工作簿的摘要与冻结记录一致。首场留下的工作簿也与上一版逐字节相同，扫码枪沿用项保持原值。资料保管者未被启动，B5 未发生由回执驱动的变更。[停止结果](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/result.json) · [停点工作簿](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/equipment-review.xlsx)

### 模型如何用证据和求证

13 对工具调用与结果全部按调用 ID 匹配。第 3 笔调用 `equipment_review inspect`，读到了同工况的 `PUBLIC-P17`，A 540 分钟、B 555 分钟，价格分别为 190 和 260，门槛为 480 分钟。当时检查点与待复核事项均为空。第 7 笔的写入参数已明确写出按价格优先选 A，同时拟把 A 标为待复核。第 8 笔改为尝试写入 `建议`，仍选 A。这两次和第 9 笔都没有传 `minutes`，三次写入均被拒绝。第 12 笔询问 A 在联机工况下能否达到 480 分钟，但缺少已保存的检查点，请求没有登记。实际尝试了额外求证，台架人员没有收到问题。缺口组未启动，无法观测谁会发现该组缺少联机证据。[原始轨迹](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/session.jsonl.zstd) · [调用和参数](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/session.json)

其余五次拒绝均来自检查点工具。模型试了缺省 `path`、`.`、中文文件名和 `draft`。复核原工具目录可见，两种工具都只声明必填 `action`。评审写入在执行时要求 `minutes`，检查点在执行时要求确切路径。`inspect` 返回行值与摘要，在没有旧检查点时不提供声明的文件名。本轮预设权责也关闭了目录列表。模型读到了草案内容，所用接口没有返回文件名，写入错误也没有指出缺少 `minutes`。脚本化 Mock 直接提供了这些参数，因此 14/14 未覆盖这个可发现性缺口。[会话工具目录与拒绝](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/session.json) · [评审工具](../../scripts/pnwf/local-equipment/tools.mjs)

### 断开与计量

已确认 **129,825 tokens**，其中 fresh input 13,326、cache read 113,152、cache write 0、output 3,347。前 12 笔按准入、终态响应 ID 与 SQLite 对账。DSH 回放没有响应 ID，离线按顺序及唯一用量四元组把这 12 笔绑定到前 12 个模型步骤。第 13 笔的 DSH 流已有 seq 84、一次被拒绝的检查点调用以及归一化的 13,147 tokens。网关只有准入观察，缺 OpenCode Go 带账单字段的终态，故该数值仅作现场佐证，第 13 笔用量仍为 `UNKNOWN`，整场总用量未知。下一次 DSH 尝试在本机 gate 停止后显示 403，网关未登记第 14 笔，也没有上游 HTTP 403 记录。[账本](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/request-accounting.json) · [终态观察](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/request-observations.jsonl) · [离线复算](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/recount.json)

本机回环对照让模拟 SSE 先发完整用量与 `message_stop`，再延迟 400 毫秒结束 HTTP。完整读完时网关结算，客户端先断开时原实现记录 `CLIENT_DISCONNECTED` 与 `UNKNOWN`。这证明了一个可能造成该类停点的窗口。真实第 13 笔缺少原始上游 SSE 终态，无法确认同一顺序，也没有重试付费请求。[零付费回环对照](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/disconnect-control.json)

复算真实归档使用 `node scripts/pnwf/local-equipment/recount-live.mjs research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live`。保留原始 STOPPED 记录，资料缺口组和真实冷接续仍待验证。

## 从 `1afe9282` 修复工具契约并复跑

上一轮第 13 笔独立封存，核对原 SQLite、请求观察和轨迹摘要。旧账本保持 `STOPPED`，第 13 笔保持 `UNKNOWN / CLIENT_DISCONNECTED`，原 12 笔确认用量与整场未知总量单列。新会话用独立 cohort 与 SQLite。复跑启用 OpenCode Go 本地网关的结束帧顺序保护，收到完整上游响应和权威用量、持久化结算之后才转发 `message_stop`。缺终态依旧会记录 `UNKNOWN` 并关闭后续准入。每会话 64 笔、30 分钟、单请求 240 秒，金额及总 token 不限。[旧 UNKNOWN 独立封存](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/prior-unknown-13.json) · [网关回归](../../scripts/pnwf/qualification.test.mjs)

`equipment_review inspect` 现在即使草案尚未恢复也返回 `workbookPath`，可直接用于检查点工具。写表说明列出 `choice`、`status`、`minutes` 和 `evidence`。`minutes` 要明确给出实测整数或显式 `null`，遗漏时逐项返回缺失字段。三次历史拒绝按原参数进入回归，确认拒绝不动草案且能指出缺项。角色工具范围、五份输入、业务提示、Mock 模型、评判器和保管者逻辑沿用原封存。39 项工具、计量与归因回归通过。普通 DSH 零付费 Mock 14/14，三个会话 17 笔全结算。实际工具目录与 `inspect` 返回也在准入前核对。[工具回归](../../scripts/pnwf/local-equipment/tools.test.mjs) · [Mock 资格](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/live-profile-mock.json)

### 谁发现缺口，谁发起复核

两组 Principal 均在第 2 笔通过 `inspect` 取得确切文件名与公开记录，后续各自成功保存检查点并写表。资料充分组第 4 笔基于起始工作簿发起台架复核，第 9 笔才写入 A、待复核、540 分钟。它认可 `PUBLIC-P17` 的同工况数据与 A 的价格优势，同时因为上一版工作簿未填实测依据而要求额外确认公开记录。冻结判据认为公开资料已经足够直接给建议，这条真实轨迹选择了额外求证。[充分组首会话](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/sufficient/initial/session.json)

资料缺口组的 Principal 第 5 笔就在复核请求中指出 `VENDOR-STANDALONE` 的 720、690 分钟来自独立工作，无法核对要求的联机 480 分钟。它主动要求保管者给出同工况的 A、B 实测值，或明确说明没有该工况的记录。第 12 笔把 A 写为待复核，并给 `minutes` 显式传 `null`。因此最早识别所需证据缺失的是 Principal，台架角色尚未提供证据。[缺口组首会话](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/gap/initial/session.json)

两组都先保存原版并登记复核，然后才写入各自的评审正文。充分组第 13 笔、缺口组第 14 笔保存了新草案版本。旧请求继续指向起始版本。按旧请求读新草案被拒，按新草案重新提问又被现有开放请求门禁拒绝。缺口组还尝试恢复旧版，检查点保护了现有不同字节的草案。两组首会话都记录 `WAIT_FOR_EXTERNAL_EVENT` 后自然退出。[两份候选的调用顺序与版本](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/recount.json)

### 冷启动与 B5

两组都在空草案目录启动全新的普通 DSH，使用原业务提示和各自的持久项目状态。两场均在第 2 笔 `inspect` 读到同一旧请求，且当时没有物理草案。两场都在第 5 笔显式恢复停写时的最新版本，恢复结果的内容摘要分别与初稿归档 `48dea6b3…`、`63ac355d…` 一致。第 6 笔再次同时读回草案和原待复核事项。回执查询和重提仍分别被 `REVIEW_RECEIPT_BASIS_MISMATCH`、`OPEN_REVIEW_ALREADY_EXISTS` 拒绝。保管者只接收与停写草案版本一致的请求，因此两组都没有发布台架实测回执。[充分组冷接续](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/sufficient/resumed/session.json) · [缺口组冷接续](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/gap/resumed/session.json)

复验了四份模型原稿。两组 B5 都保留 A，C5 都为待复核。充分组 D5 记录公开实测 540 分钟，缺口组 D5 留空。冷会话更新了评审依据与待办说明，未采用台架实测改变选择，两场都再记录 `WAIT_FOR_EXTERNAL_EVENT` 并自然退出。扫码枪保留沿用，五份原输入逐字节保留。这个样本确认了真实冷启动能恢复本地资产与未决事项。草案更新后的旧请求继续存活，并挡住了新版本上的复核，因而缺少回执影响 B5 的真实样本。[充分组工作簿](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/sufficient/resumed/equipment-review.xlsx) · [缺口组工作簿](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/gap/resumed/equipment-review.xlsx) · [独立复算](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/recount.json)

### 用量与验证

| 会话 | 请求 | Fresh input | Cache read | Output | 总 tokens | 耗时（秒） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 充分首场 | 19 | 26,255 | 261,376 | 10,309 | 297,940 | 137.512 |
| 缺口首场 | 24 | 28,852 | 358,528 | 11,654 | 399,034 | 155.988 |
| 充分冷接续 | 16 | 32,134 | 258,688 | 10,701 | 301,523 | 139.795 |
| 缺口冷接续 | 14 | 29,682 | 212,352 | 9,670 | 251,704 | 123.388 |
| 合计 | 73 | 116,923 | 1,090,944 | 42,334 | 1,250,201 | 556.683 |

Cache write 为零，73/73 笔均有终态并绑定到模型步骤，79/79 对工具调用与结果按 ID 匹配。冷接续合计 30 笔、553,227 tokens。台架保管者未启动，新增 UNKNOWN 为零。执行全程采用无 Git 项目、禁用 A2A 的普通 DSH `0.2.2-rc.5`，每场独立 cohort 与新 DSH home。构建、架构、公共 API、CI 的 Node 测试组 60 项，以及检查点和部署 10 项都在本地通过。复算命令读取原始流与归档 SQLite。[运行合同](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/contract.json) · [逐笔复算](../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun/recount.json)

```text
node scripts/pnwf/local-equipment/recount-live.mjs research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun
```
