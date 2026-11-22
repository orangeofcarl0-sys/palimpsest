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
