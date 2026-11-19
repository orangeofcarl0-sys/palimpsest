# 按任务选用能力：夜班回放与运费修订首轮配对

**里程碑三已启动；本轮完成四格零付费资格，真实运行止于第一格，没有形成完整真实配对。** 软件 P 的 Principal 自己实测出了旧候选对 S 的误报。它查过维护者登记，未发起联系，也未提交修订。第 15 笔请求在 240 秒处超时，用量未知，按事前合同关闭其余三格的准入。这个已启动的失败保留在分母，里程碑二继续开放。[真实运行矩阵](../../research-evidence/pnwf-task-selection/2026-11-19/live-summary.json)

## 试验怎样区分选路和交付

四个会话都从主线 `6d8f90c1` 的宿主启动。同域两组取得相同 Git 基线和逐字相同的业务提示。P 使用普通 Palimpsest DSH，F 使用强原生 DSH。两边都可读原始资料、运行测试、提交 Git、调用 Subagent 和 Workflow；软件两边还可向上一班维护者询问绑定 SHA 的实测。P 可另外读取项目状态、记录贡献、调用隔离 Worker。交付供审和实际批准是两个事件，本轮任务授权到提交供审。里程碑二继续开放。[冻结协议](../../scripts/pnwf/task-selection/protocol.md)

| 领域 | 相同起点 | 宿主如何判分 |
| --- | --- | --- |
| 软件 | 夜班候选 `4f80c3bd5d606e2a2192fd56badb4a138d139ee2`。两次原始终端采集分别有独立来源，一次发生重绘，一次抑制过期帧。 | 从最终 Git 对象分别替入 P、S，用原命令检查退出、复现标志与倒退明细；比较既有采集、预约、服务等 blob，并核对交接稿。 |
| Energy | 已接受的 `bfe377abf16649f977cafa49a7494a820f38dd60`，宿主只追加承运通告，得到 `31723de4147f7ab54c1e71c1813ae84d4f9bf1d3`。 | 逐站重算原价、运费和合计，交叉核对推荐正文、结构化数据、来源和风险说明。对原技术、排程、证书交付以及输入逐 blob 核验。 |

Energy 的反例是旧风险稿把报价或运费变动推广到两个站点。新增修订仅对 Harbor Flats 的单批征收 USD 7,500。沿用旧选型时，North Ridge 的 USD 268,000 不变，Harbor Flats 增至 USD 275,500，项目为 USD 543,500；修改技术、排程或认证文件反而需要额外理由。软件缺陷则需要区分终端记录的事件含义与一段旧代码的实际行为。两类任务给模型不同的求证机会，但一域一对不足以估计领域效应。[独立成本判分](../../scripts/pnwf/task-selection/energy.mjs) · [软件原判分](../../scripts/pnwf/software/night-review/fixture.mjs)

## 零付费资格

四组均通过独立验收并自然退出。软件两组各 9 笔合成请求，实际在隔离容器接续上一班会话，获得 P/S 测量后由 Principal 修订；Energy 两组各 6 笔，原生子任务读取承运通告、回传站点和补充费，Principal 修改报价。两域旧版均被新验收拒绝。账本和原始调用可从封存重新生成，Mock 脚本指定的动作单独计作运行资格。首次归档重放发现临时仓库只有 detached HEAD，已修正验证器建立临时检出分支；原四个 Mock 和计量记录直接复算通过。[资格矩阵](../../research-evidence/pnwf-task-selection/2026-11-19/mock/matrix.json) · [逐组结果](../../research-evidence/pnwf-task-selection/2026-11-19/mock-summary.json)

## 真实轨迹：谁发现了什么

软件 P 只有一条 Principal 流，38 个调用全部与结果配对。15→16 读取项目 Pulse；34–36 读取合同与两份原采集；77 读旧回放；97→100 核对两份输入的摘要与差异。105→106 调用 `fleet_register`，看到了可联系的上一班；整条轨迹的 `fleet_contact`、原生子任务、Workflow 和正式 Worker 均为 0。它选了读取轻量上下文、随后亲自查档和做实验。登记查询与实际求证分开计数。[逐项调用和原始结果](../../research-evidence/pnwf-task-selection/2026-11-19/live/software-P/trajectory.json)

131→134 在原候选回放 P，输出显示 p17 的序号 40 发生实际倒退。139→142 将候选复制到临时目录，替入原始 S 采集，得到 `reproduced:true` 和同一条 p17/40 倒退；该行标记的是抑制。**本次首先在模型会话中实测反例的是 Principal。** 它进一步在 143→146 用上一班版本检验两份输入：旧维护者版本在 S 上通过，在 P 上失败。这里复用了维护者留下的 Git 成果，现场的实验与判断由本轮 Principal 完成。其后读取协议、服务与测试，未观察到写入项目交付物，也没有同伴回执或采纳后的文件变化。[Git 与宿主独立复核](../../research-evidence/pnwf-task-selection/2026-11-19/live/software-P/result.json)

| 真实格 | 独立验收与保留 | 返工与人工干预 | 请求与用量 |
| --- | --- | --- | --- |
| 软件 P | 供审候选为空；现场 HEAD 等于基线，Git 工作区干净，旧成果完整。宿主重放的是旧版，P 通过、S 失败。没有 DELIVER，未自然退出。 | 交付物写入 0、提交 0、已写成果返工 0。进程内人工提示、修复或批准 0；停止后做了一次宿主离线恢复。临时副本中的两次实验未写入主工作区。 | 15 笔准入，14 笔确认，1 笔 UNKNOWN。容器开始至退出共 7 分 57.672 秒，包含启动、检测与等待。 |
| 软件 F | 未启动，独立验收和保留均无真实观测 | 未启动 | 0 笔 |
| Energy F | 未启动，独立验收和保留均无真实观测 | 未启动 | 0 笔 |
| Energy P | 未启动，独立验收和保留均无真实观测 | 未启动 | 0 笔 |

14 笔确认用量均以唯一用量四元组绑定原始 DSH 消息和已结算请求。fresh input 56,574、cache read 380,544、cache creation 0、output 11,492，已知合计 **448,610 tokens**。第 15 笔 `6b2e3e74-b670-4e60-9094-9e5559c878c4` 只有准入记录，没有 Provider 终态；SQLite 中状态为 `UNKNOWN / PROVIDER_TIMEOUT`，该笔和全会话的总量均为空。本轮没有重抽或将缺失用量填零。[原账本](../../research-evidence/pnwf-task-selection/2026-11-19/live/software-P/request-ledger.sqlite) · [逐笔网关观测](../../research-evidence/pnwf-task-selection/2026-11-19/live/software-P/out/REVIEW/request-observations.jsonl)

宿主停止账本后，容器退出码为 137，外层 Node 进程又报告 `write EPIPE` 并退出 1，常规的最终 `run.json` 未写出。封存保留原始未完成矩阵与 SQLite 中仍为 RUNNING 的会话行。另存的离线恢复结果关联了 STOPPED 总账、Docker 终态、原始压缩流、Git bundle 和独立重放；未把恢复报告当成运行时回执。中断的确切管道写入位置没有独立定位。[启动时矩阵](../../research-evidence/pnwf-task-selection/2026-11-19/live/launch-matrix.json) · [容器终态](../../research-evidence/pnwf-task-selection/2026-11-19/live/software-P/container-stop.json)

目前可以确认模型在有复核入口时也能选择独立实验并抓住错误。没有已提交成果可评估这次发现是否改善交付。两个域均缺完整真实对照，质量、返工、人工和用量的组间差值不可估计，默认选路仍待验证。Mock 结果描述的是执行资格。

## 复算

在装有 Node 24、Git、Docker 和冻结资格镜像的仓库根目录执行。归档校验读取 Git bundle、原始 DSH 流、调用 ID、逐请求账本及宿主测量，不连接模型服务。

```powershell
$e = 'research-evidence/pnwf-task-selection/2026-11-19'
node scripts/pnwf/task-selection/archive.mjs --verify "$e/mock"
node scripts/pnwf/task-selection/archive.mjs --verify "$e/live"
node scripts/pnwf/task-selection/compare.mjs "$e/live" "$env:TEMP/task-selection-recount.json"
```
