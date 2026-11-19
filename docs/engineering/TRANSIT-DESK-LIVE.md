# 三张冻结工单的真实选路对照

六个会话都启动了，五个自然退出，四个留下 Git 提交。两位编辑都独立查证并改稿，只有 P 提交。两位维护者都修好了午夜漏车，七个行为探针全过，因测试文件布局相同而同获冻结 8/11。调度 P 给出可执行方案，F 的第三笔请求超时，留下两笔已知用量和一笔 UNKNOWN。六条轨迹均未观察到向同伴委派或采纳同伴反例。[逐会话对照](#交付与用量对照)

## 试验边界

实验从 `3c44aba89fc9837619c5d22b2545b1e77a445f2b` 接续。每题按 P（普通 Palimpsest DSH）、F（强原生 DSH）的顺序运行。同题两组的 Git 基线、业务提示与各自既有 Mock 逐字核对。P 可用正式 Worker 和项目工具，两边均有原生 Subagent、Workflow、Git 和本地测试。每个组新建 DSH home、容器内项目及会话账本。旅客编辑台两组看到相同的五份冻结资料卡。模型看不到判分器或参考交付。没有向模型指定协作次数、对象、结论或路径。[冻结材料与 Mock 资格](TRANSIT-DESK-USER-TASKS.md)

计量使用 OpenCode Go 的 `deepseek-v4.1-flash`。一个会话最多 64 笔、30 分钟，单笔最多 240 秒，子任务共享窗口，金额和总 token 不设上限。逐笔核验 Provider 终态和 DSH 消息，再按调用 ID 核对每个工具结果。计量未知时保留已确认小计和缺失项，同时停止后续会话。上轮第 15 笔属于旧 cohort `863153d2-7878-4cae-8f75-4772d4fe3a56`。该笔有准入记录、无终态，原因是 PROVIDER_TIMEOUT，实际用量为 null。其前 14 笔确认 448,610 tokens。按本次授权单独归档，旧账本及其合计未知状态照原样保留。[单笔归档及原账本摘要](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/prior-unknown.json)

## 观察口径

- 发现反例需要轨迹中实际读到资料、执行查询或算出离场缺口。工单已经写明的问题只算输入。结论能定位到首次写稿时，且之前只有并行读取时，记录这一可证的上界。
- 主动向原始资料求证、向另一个执行者请求复核、自行复算分别记录。采纳同伴发现需要能把返回内容连到后续的测试、模型或交班稿改动。
- 返工按已写成果的实质改写逐案记录，包括同一提交之前的改写。重复读文件、重复测试、无效编辑和提交数另述。会话中人工指点或解围单列。
- 文件存在、冻结自动项、业务原稿、Git 持久化、产品结论和自然退出分别核对。每题每组只有一条轨迹，组间差值只描述该样本。费用和 token 分开，cache read、fresh input、cache write、output 均取 Provider 终态用量。

## 旅客编辑台

两位 Principal 都主动尝试向运营方求证。P 的调用 25 试连 Metro 主页，F 的 45、49、53 分别请求开站稿、服务变更公告和机场通知。容器均返回 DNS 解析失败；两组实际用来成稿的是随工单交付的五张资料卡。两位均自行认出同一个反例：轨道只到换乘站，进航站楼仍须换乘。两份稿件均辨明开放时刻、两条线路、接驳免费、APM 尚未运营和百日回顾超出截稿日。没有观察到委派、同伴回传或同伴采纳。

- **P** 在 33–39 读取工单与资料卡，71、73 首次分别写出旅客稿和证据表。91 再改正文，点明开站稿与后续公交公告同属 Metro，LAWA 能独立佐证接驳与 APM 状态。文稿还区分了已知路线和缺乏当晚时刻表的细节。105 提交，121 以完整 SHA 记录 DELIVER。1 次内容补写，1 个提交，冻结 9/9。[轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/public-brief-P/trajectory.json) · [提交原稿](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/public-brief-P/submitted/brief.md)
- **F** 在 31–35 读五张卡，外部查询失败后于 65 重读。73、75 形成初稿。97 把“接驳路线由两家印证”与“免费由 LAWA 明确”分别表述，99 明确 LADOT 转述的是 Metro 公告。两次内容改写。89 的状态已显示两份新文件未跟踪，109 做最终检查后自然退出，HEAD 仍是同题基线。工作稿经结束后只读复制，在独立仓库复算 9/9；真实会话提交数为 0。原 HEAD 的冻结检查仅原始输入一项通过。[轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/public-brief-F/trajectory.json) · [退出时原稿](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/public-brief-F/working-draft/brief.md) · [离线评分与来源](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/public-brief-F/draft.json)

## 午夜站牌

**P。** 用户已经指出两类午夜班次。Principal 在 47 自行运行旧白班测试和投诉命令，白班通过、查询只返回 X3，由此实证 R7 漏车。62 改查询，68 在原测试文件追加用例，74 得到两趟车。第一次测试通过后，96 为读取可选日历补了空值保护，102 自造跨日数据探测 47:59:59、次日班次和窗口端点。117 提交，133 记录 DELIVER。没有委派或同伴采纳；修复后的主动加固 1 次，无因失败回滚的提交。

冻结规则把原来的 `board.test.mjs` 作为保护输入，并只把另起的测试文件视为新增回归。P 因追加在原文件而失去三项，原判 **8/11**；七个独立站牌查询全过。对同一 SHA 的补充复验中，未改动的旧白班断言单独通过，实际提交的测试 **7/7** 通过，切回旧实现后其中 **4/7** 失败，包含投诉本身。原件含一条旧测试、六条新增测试；模型结论中“新增 7 项”的数量多算了原测试。[逐步轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/departure-board-P/trajectory.json) · [同一 SHA 的交叉复验](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/departure-board-P/board-review.json)

**F。** 23–29 读接口、原实现、原测试与班次，49 直接改查询，55 在原测试文件增加午夜和跨午夜两个例子。61、65 首次运行测试与投诉查询，观测的是修复后的两趟车；没有同会话旧实现复现。85 用自造数据核对 47 小时班次与日期例外；101 更正注释，说明最早可重叠的服务日是前一天。实现仍多扫一天，未影响这七个窗口的输出。107 提交并自然退出。已写成果有一次注释修订，没有同伴回传或功能性返工。原判同为 **8/11**，原因也是原测试 blob 改变及未另起测试文件。补充复验确认原白班断言通过，候选测试 **3/3**，还原旧实现后两项新增测试均失败。两份交班稿均给出可复现命令和两趟车的实际班次。P 多留下四条持久测试，F 的 47 小时边界只在临时命令中查验。[轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/departure-board-F/trajectory.json) · [同一 SHA 的交叉复验](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/departure-board-F/board-review.json)

## 车队低温调度

**P。** 31 读取车辆、窗口和楼宇负荷，56 写模型，62 首次实算 90% 和 85%。90% 时，A 的两格只剩 80、20 kW，电池净增 45 kWh，离场 117 kWh，离 126 kWh 差 9。B 在另一窗口可以达标。把 00:30 的 20 kW 楼宇负荷推迟到 01:30，实际搬移 10 kWh 交流电量，两车均刚好达标。85% 时全夜最多交付 102 kWh，少于共需的 108 kWh。这组数字由 Principal 自己取得。

70 写测试，76 暴露 85% 用例的测试辅助函数仍用 90%。84、90 引入效率参数并改断言，批量替换又误改 90% 用例；104 精确改回，110 测试 5/5。两次失败带来两轮测试修订，涉及三次成功的文件修改，模型文件只写了一次。124 又在临时脚本中核对 192 个参数组合，报告 0 个不匹配；这是模型的会话内自检。148 将 A 车受限时段从初稿错误的 01:00–01:30 改为 00:30–01:00，154 提交，162 记录 DELIVER。交班稿给出四格功率表 80、40、70、50 kW、最小平移及效率边界。冻结的六个模型场景也均通过，总分 **8/8**。[轨迹](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/depot-charge-P/trajectory.json) · [交班原稿](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/depot-charge-P/submitted/HANDOVER.md)

**F。** 15 列工作区，23–26 读取说明、工单、夜班数据和包信息，五个工具结果均可配对。第 3 笔请求 `0fd80c27-fbfb-443b-900c-ecd0836986ab` 有准入、无终态，240 秒后记为 PROVIDER_TIMEOUT，DSH 同时报告 STREAM_CLOSED。前两笔确认 11,615 tokens。没有可观察到的数值结论、求助、文件写入或提交。停止后 HEAD 仍是基线且工作区干净，基线仅原始输入项通过。完整归因的用量资格为 false；单独将两条有终态的消息与 Provider、SQLite 逐笔配对，第三笔的 actual 与 usage 均保留 null。这次中断截断了业务观察，无法判断 F 若完成会采取何种调度或能否达标。[原账本](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/depot-charge-F/request-ledger.sqlite) · [可观察轨迹与缺失请求](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/depot-charge-F/trajectory.json)

## 交付与用量对照

耗时从宿主启动该会话至退出或停止，含隔离预检和等待。fresh、cache read、output 均为 tokens，已结算请求的 cache write 全为 0。一次请求可发出多个工具调用。

| 工单 / 组 | Git 与冻结判分 | 准入 / 结算 | fresh | cache read | output | 确认小计 | 耗时 | 调用结果对 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 编辑 P | 已提交，9/9 | 13/13 | 29,697 | 239,232 | 14,046 | 282,975 | 4:44.915 | 22 |
| 编辑 F | 未提交；退出时工作稿离线 9/9 | 9/9 | 24,222 | 99,456 | 12,612 | 136,290 | 3:39.775 | 22 |
| 站牌 P | 已提交，8/11；行为探针 7/7 | 17/17 | 34,818 | 357,120 | 14,668 | 406,606 | 4:33.151 | 22 |
| 站牌 F | 已提交，8/11；行为探针 7/7 | 13/13 | 25,147 | 180,480 | 15,069 | 220,696 | 4:06.903 | 19 |
| 调度 P | 已提交，8/8 | 22/22 | 50,785 | 707,200 | 31,165 | 789,150 | 7:42.210 | 24 |
| 调度 F | 停止，未提交；总量未知 | 3/2 | 5,864 | 5,504 | 247 | 11,615 | 4:15.543 | 5 |

六格均实际启动，5 格自然退出、4 格留下模型自己的 Git 提交。P 三格均记录 DELIVER。六条轨迹只有 Principal，114 对工具调用与结果都能绑定；两边均未发出 Subagent、Workflow 或正式 Worker 委派。外部网页尝试、本地执行、参数反例和改稿都能看到，来自另一角色并改变产物的贡献链为 0。运行中人工提示、代改、核准或重抽均为 0；离线保存草稿、复跑测试和复核计量发生在会话结束后。里程碑二继续开放；里程碑三已观察到按任务变化的单人查证和检验行为，尚不能据此判断模型能否在有协作收益时选对协作路径。

前两对均自然退出。P 与 F 分别用了 30 和 22 笔、689,581 和 356,986 tokens。P 多 332,595 tokens，其中 cache read 多 316,416，fresh 多 15,146，output 多 1,033。编辑与站牌首请求的 fresh 在 P 分别为 10,669、10,638，在 F 为 5,294、5,519；P 有额外项目工具和显式 pulse、conclude 调用。编辑组工具对数相同，但 P 多四笔请求。站牌 P 还拆分了任务列表、检查和提交后复验。这里可分清新增输入和重读上下文的数量；单次固定顺序配对无法把全部差额因果归给某一个工具或缓存策略。

三题合计 77 笔准入、76 笔结算，已确认 **1,847,332 tokens**，整轮总量未知。P 为 52/52、1,478,731 tokens；F 为 25/24、已确认 368,601 tokens。调度 F 截断，因此三题合计不能当作完成相同工作量的成本比。已结算各笔的 Provider 账单来源均为 go，返回的 cost 字段均为 0；listCost 与套餐额度记录另见逐笔观察，无法据此确定未知请求的费用。[比较数据](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/comparison.json) · [会话矩阵及结论](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/matrix.json)

## 零付费复算

从仓库根运行以下命令。归档含完整 Git bundle、冻结提示、原始 DSH 流、Provider 准入与终态、会话状态、逐笔绑定和提交原稿。站牌的追加诊断沿用冻结容器，分别以实际提交和原实现执行模型提交的测试；两组冻结分数独立保留。编辑 F 的诊断 SHA 只标识离线读取的工作稿。

```powershell
$d = 'research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live'
node scripts/pnwf/transit-desk/live-evidence.mjs --verify $d
node scripts/pnwf/transit-desk/review-board.mjs "$d/departure-board-P" --verify
node scripts/pnwf/transit-desk/review-board.mjs "$d/departure-board-F" --verify
node scripts/pnwf/transit-desk/compare-live.mjs $d
node scripts/pnwf/task-selection/partial.mjs --verify research-evidence/pnwf-task-selection/2026-11-19/live
```
