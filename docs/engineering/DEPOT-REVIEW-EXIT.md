# 夜班调度：实测回传后结束维护者复核

## 交付与复核各在哪一步结束

场景沿用 `341e19e288de9f561f85fcb66a7a910ff6f3e143` 的原表、同一份业务目标、原材料义务和独立十项业务判据。Principal 自行选择求证路径。回执只从隔离维护者对指定完整 SHA 的宿主试排产生。普通 DSH 的公开试排返回旧采集，仍供 Principal 判断和继续工作。

上一轮，宿主已经在 SQLite 按采集摘要和完整 SHA 持久化实测，也已将回执交回联系人；维护者的工具结果没有标记复核已完成。DSH 便再次请求模型，继续查档、测试并在私有副本提交。修复只安装在隔离维护者的工具注册处。成功的试排需要同时匹配请求 SHA、实测回执 SHA 和宿主交回通道的 SHA，才由该次工具执行调用 DSH 的 `concludeTurn()`。DSH 写入工具结果并自然结束当前 turn。公开试排、无效 SHA 和失败响应继续使用原行为。SQLite 仍在回传之前落盘，同一 SHA 的重试可读取持久回执；新 SHA 启动新的复核。主机返回、Principal 实际收到的工具结果、维护者正常结束和进程退出分别取证。[维护者工具](../../scripts/pnwf/depot-shift-log/review-trial.mjs) · [回传顺序](../../scripts/pnwf/depot-shift-log/desk.mjs)

## 回归与零付费资格

原始两次复核的有效结果位于维护者轨迹 208 和 355。之后的 16 笔和 10 笔请求全部有终态用量，分别为 1,003,094 和 784,665 tokens。新回归直接读取上轮封存的 DSH 流和账本，验证这 26 笔的归属，并用两份实测验证只有正确的成功交回能结束当前复核。既有超时重试、并发读取、宿主重启、跨采集隔离和两份 9/10 旧提交回归一起运行，六项测试通过。[上轮原判与档案](DEPOT-MATERIAL-OBLIGATIONS.md) · [轨迹回归](../../scripts/pnwf/depot-shift-log/review-trial.test.mjs)

资格 Mock 在相同 SHA 注入首次响应丢失。重试取得同一实测，原表只启动一位维护者；修订表另启一次。两个维护者 turn 都以 `completed` 结束且进程退出码均为 0，每次回传后均为零请求。按维护者自己的 DSH 时钟，两次工具结果到 turn 结束均为 3 毫秒。Principal 仍能在初次材料保护拒绝后恢复说明，通过 18 项文件检查与 10 项业务检查，记录 DELIVER 并自然退出。共 15 笔模拟请求，付费调用 0。[Mock 全部事实](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/mock/matrix.json)

## 真实会话：一份回执送达，第二次复核未启动

Principal 只收到冻结业务目标，使用 OpenCode Go `deepseek-v4.1-flash`，共享原窗口（64 笔、30 分钟、单笔 240 秒，金额与总 tokens 均无上限）。公开试排结果 76 得到 126/130 kWh。Principal 自行联系维护者，调用 81，结果 82 收到原表的晚班回执：B 两格实际为 50/50 kW，离场 121 kWh，低于 130 kWh 要求。维护者的有效试排在其独立轨迹的调用 217、结果 218。随后直接记录 step/end 219、turn/end 220（completed），进程退出码为 0。这份回执已持久化并交到 Principal；真实会话仅问了一次，同 SHA 丢响应重试由 Mock 覆盖。[轨迹和角色归因](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/live-observation.json)

收到回执后，Principal 搜索项目、检查 Git 历史和项目记录。调用 105 的结果 108 自行算出修后 B 两格 50/70 可达 130 kWh、90% 时双车均零余量、85% 时分别差 3/3 kWh。该计算只写到终端。下一笔模型请求达到 240 秒，按原合同停止；未写班表、未提交、未发起修订表复核，也未记录 DELIVER。宿主总耗时 **12:24.244**，Principal 进程因用量不可确认被停止。停止时 HEAD 等于基线，工作树干净；B 两格仍是 **70/50 kW**。九份旧材料的模式和 blob 均与基线相同，独立晚班回执保存在宿主 SQLite，项目中没有另存件，交班稿仍为原稿。冻结质量 **5/10**，上轮为 10/10。[冻结评分和 Git 证据](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/live/matrix.json) · [原表实测](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/live/P/desk/journal.json)

## 回传前后的维护者用量

| 真实复核 | 回传前请求 / tokens | 回传前耗时 | 回传后请求 / tokens | 回传后至 turn 结束 |
| --- | ---: | ---: | ---: | ---: |
| 上轮原表 | 3 / 143,881 | 41.505 秒 | 16 / 1,003,094 | 292.112 秒 |
| **本轮原表** | **4 / 192,269** | **91.176 秒** | **0 / 0** | **0.002 秒** |
| 上轮修订表 | 1 / 72,927 | 9.317 秒 | 10 / 784,665 | 83.877 秒 |
| 本轮修订表 | 未启动 | — | — | — |

同一原表的本轮复核在产出有效回执前多用了 1 笔、48,388 tokens 和 49.671 秒。回传后少用了 16 笔、1,003,094 tokens。原表复核全程因此从 19 笔、1,146,975 tokens 降至 **4 笔、192,269 tokens**。本轮维护者 fresh input 95,701、cache read 94,592、cache write 0、output 1,976，全在回传前。按宿主时钟，从启动到 RETURN 为 102.396 秒，RETURN 到复核进程正常退出为 1.380 秒。上轮第二次复核的尾部另有 10 笔，本轮没有相应真实复核，不能把这 10 笔算为实测节省。[同口径逐次、逐分项与九份文件 blob](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/comparison.json)

Principal 有 10 笔已结算、248,610 tokens（fresh input 39,786，cache read 193,280，cache write 0，output 15,544），另有一笔超时。全轮 **准入 15、结算 14、已确认 440,879 tokens**。第 15 笔 `4ea77f94-216f-42ae-ab53-1423dcb9fce1` 的终态用量为 UNKNOWN，整轮总用量未知。上轮两份回执、55/55 笔、2,914,705 tokens，11:16.154 完成交付。本轮可以核实首份回执回传后的开销已经消除，无法从这次提前停止的样本估算完整工单的节省。[逐请求账本](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/live/P/out/REVIEW/request-accounting.json)

停机后的首次归因因原分析器只接受一条 DSH 流而失败。已保留该异常与原矩阵，离线按会话、调用 ID 和唯一终态用量配对，同一笔只计一次；Principal 的 23 次、维护者的 11 次工具调用均配到结果。未知请求未补值。所有复算均使用这次运行的既有数据。[初次归因失败现场](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/original-live-matrix.json) · [离线双流归因](../../research-evidence/pnwf-task-selection/2026-11-19/depot-review-exit/live/P/trajectory.json)

## 如何复算

下列命令只读取本地档案。对比使用完整 DSH 工具调用 ID、回执所指 SHA 和独立账本绑定。发起有效试排的那一笔计入回传前。耗时的前段从 DSH 的 turn/start 到实测 tool/result，后段从该结果到 turn/end，两端均使用同一 DSH 时钟。宿主的启动、排队、RETURN 和进程退出另列。运行原矩阵的 `returnToTurnEndMs` 跨时钟相减，Mock 中有一项为 −57 毫秒。对比文件从同一 DSH 流重算 `resultToTurnEndMs`，表中采用该值。终态账本统计 fresh input、cache read、cache write 和 output。历史归档未记录进程退出的宿主时间，该列为 null。

```powershell
$root = 'research-evidence/pnwf-task-selection/2026-11-19'
$old = "$root/depot-material-obligations/live"
$new = "$root/depot-review-exit"
node node_modules/typescript/bin/tsc -b
node --test scripts/pnwf/depot-shift-log/review-trial.test.mjs scripts/pnwf/depot-shift-log/receipt-store.test.mjs scripts/pnwf/depot-shift-log/materials.test.mjs
node scripts/pnwf/depot-relief/archive.mjs --verify "$new/mock"
node scripts/pnwf/depot-relief/archive.mjs --verify "$new/live"
$recount = Join-Path $env:TEMP 'depot-review-recount.json'
node scripts/pnwf/depot-shift-log/compare-reviews.mjs $old "$new/live" $recount
(Get-FileHash $recount).Hash -eq (Get-FileHash "$new/comparison.json").Hash
```
