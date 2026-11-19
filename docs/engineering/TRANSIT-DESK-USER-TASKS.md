# 旅客服务与夜班调度 · 三张用户工单

三位用户各自有一个需要据交付物采取的行动。车站开通线索来自公开机构记录，站牌与车队采用合成运营数据。三题可单独分发，模型只读对应项目及工单，题面不指定独立作业、查证、委派或复核。参考交付与独立评分都留在宿主。

| 用户与决定 | 拿到什么 | 用什么反例检验判断 |
| --- | --- | --- |
| 旅客服务编辑要决定能否发布“开站当晚可全程搭轨道到航站楼” | [截稿任务](../../fixtures/psvr/transit-desk/public-brief/TASK.md)、五份带原文链接的资料卡。交付中文旅客说明、短研判和逐项来源登记 | “直接连接机场”可能只指抵达换乘站；市交通局转述、运营方回顾和截止日之后的印证，分别能证明什么？ |
| 站牌值班维护者要修复一宗确实发生在模拟线路上的漏车投诉 | [故障工单](../../fixtures/psvr/transit-desk/departure-board/TASK.md)、现网查询函数、最小线路数据和能通过的白班测试。交付兼容修复、复现测试、交班说明 | 周五服务日 24:12 和周六临时服务 00:19 同属乘客的查询窗口。取消的周六服务又必须排除。 |
| 车队夜班主管要决定两辆车明早能否按时出车 | [调度工单](../../fixtures/psvr/transit-desk/depot-charge/TASK.md)、楼宇负荷、车辆到离场和电池参数。交付可执行模型、四格功率表、最低平移量和放行意见 | 全夜可交付电量等于需求，第一辆车仍会在离场时缺电；降低效率后再检查同一措施。 |

## 查证线索怎样落实

查证时把原句拆成三个可以分别证伪的问题：哪项设施在哪一刻对公众开放，开通时最后一段由什么工具完成，自动捷运当时处于什么状态。资料卡保留签发者、日期、编辑摘记和链接，正文数字和结论均可回到原文。下面是本次取材路径，供复查和扩充资料库。

| 查找线索 | 找到的记录 | 编务处理 |
| --- | --- | --- |
| 从“新站直达”宣传回溯发行者 | 6 月 5 日 LADOT 周报引用 Metro；6 月 6 日 Metro 开站公告区分轨道线路、巴士和未来捷运 | 把转述归回同一消息源，区分开通预告、仪式与乘客可实际使用的服务。[LADOT](https://ladot.lacity.gov/dotnews/weekly-update-june-05-2025) · [Metro](https://www.metro.net/about/media-relations/now-boarding-metros-lax-metro-transit-center-station-officially-opens-connecting-communities-bringing-faster-easier-travel-for-angelenos-visitors/) |
| 在后续运营公告中找向公众开放的确切时间 | 6 月 13 日 Metro 的公交调整通告回顾当地 6 月 6 日 17:00 开放 | 区分乘客进站时间与新闻发布日期。[运营公告](https://thesource.metro.net/metro-bus-service-changes-to-reduce-wait-times-and-improve-transit-connections-begin-sunday-june-22/) |
| 沿“谁负责最后一段”向机场运营方求证 | 7 月 2 日 LAWA 的旅行指引说明 C/K 线与免费穿梭巴士的换乘，并交代自动捷运施工状态 | 截稿日当天旅客可采用的路线有另一运营方直接说明。未取得实际捷运首载日期。[机场指引](https://www.lawa.org/news-releases/2025/break-free-travel-stress-lax-enhanced-technology-and-pro-tips-smooth-july-fourth) |
| 检查回顾性资料能否用于当时决策 | Metro 的百日乘客报道发布于 9 月 12 日 | 保留为截止日反例。它不能充当 7 月 2 日编辑已经掌握的证据。[百日回顾](https://thesource.metro.net/rider-stories-from-the-first-100-days-at-lax-metro-transit-center-station/) |

同一条来信有两个可运行的入口。三题配对使用冻结的中文摘记，重跑时双方读到相同资料。[参考旅客说明](../../scripts/pnwf/transit-desk/reference/public-brief/brief.md)

另用 `prepare public-discovery` 即可创建只含来信和交付格式的空白编辑项目。执行者用可联网的研究工具自行找网页，记录实际查询词、发布者、发布日期、访问日期、URL、逐条判断及排除依据。宿主接受其他来源，检查引用存在且在截止日前发布，编辑逐条打开原文核对是否真的支持判断。这一入口已有本轮公开检索形成的参考交付与正反例资格；六条 DSH Mock 的资料环境均为离线。[外采来信](../../fixtures/psvr/transit-desk/public-discovery/TASK.md) · [本轮检索和来源登记](../../scripts/pnwf/transit-desk/reference/public-discovery/evidence.json)

## 两个可执行的验收

**站牌。** 宿主用同一份导出函数查询七个窗口。覆盖临时增班、取消服务、跨午夜查询、实际发车时刻落在左右边界、另一站与不存在的站、跨年 47:59:59 及同时发车的 ASCII 排序。还把新交付的回归测试放回旧实现执行，验证投诉可复现。输入使用已归一化的 UTC，仅覆盖题面列出的服务日语义。[交班实例](../../scripts/pnwf/transit-desk/reference/departure-board/HANDOVER.md) · [GTFS 服务日和时刻定义](https://gtfs.org/documentation/schedule/reference/)

**充电调度。** 每格电池净增量为交流充电功率 × 0.5 小时 × 效率，功率同时受充电机和扣除楼宇负荷后的接入上限约束。每车在自己的离场时刻验电量。90% 效率、低温且不平移时，A 最多得到 45 kWh，离场缺 9 kWh；另一车可达标。把 00:30 的 20 kW 楼宇负荷延至 01:30，移动的交流电量是 10 kWh。充电表 80、40、70、50 kW 可同时达标，下界由 A 的缺口给出。85% 时整夜最多交付 102 kWh，低于所需 108 kWh。宿主另外改变效率、可平移上限、低温附加值和充电机额定值；核对物理约束，接受其他等价可行的分配。[交班实例](../../scripts/pnwf/transit-desk/reference/depot-charge/HANDOVER.md)

## 交给执行者与复算

需要 Git、Node 24，以及本机已拉取的 [Node 镜像](https://hub.docker.com/_/node)。镜像摘要固定在 [宿主入口](../../scripts/pnwf/transit-desk/run.mjs) 和机器证据中。以下命令从仓库根执行，准备命令要求目标目录尚不存在。将创建的仓库和其中的 `TASK.md` 交给执行者。新测试使用顶层 `*.test.mjs`，辅助模块使用顶层 `.mjs`。

```sh
node scripts/pnwf/transit-desk/run.mjs prepare departure-board ./board-world
node scripts/pnwf/transit-desk/run.mjs grade departure-board ./board-world <完整候选SHA>
node scripts/pnwf/transit-desk/qualify.mjs
pnpm run build
node scripts/pnwf/transit-desk/mock.mjs <新的零付费运行目录>
node scripts/pnwf/transit-desk/archive.mjs --verify research-evidence/pnwf-task-selection/2026-11-19/transit-desk/mock
```

其余两个任务 ID 为 `public-brief` 和 `depot-charge`。评分先检验固定基线的祖先关系和原始输入，随后只读确切提交。JS 在无网络的只读容器中执行，答案和预期值留在宿主。**自动通过后仍须按原稿审阅**：旅客第一段是否能直接发布、资料来源是否与句意相符、未证实项是否清楚；维护者能否照说明复现两趟车；主管能否按班表调度并在低效率时作出正确决定。把评语与完整 SHA 一起记录。候选只交结构化正确的表格、却在正文给出相反意见时，交付仍应拒绝。

## 怎么观察按任务选用能力

同题同基线，P 使用带产品的 DSH，F 使用强原生 DSH。对每条真实轨迹记录发现反例的角色、首次获得的具体证据、是否主动寻求复核、回传证据、采纳前后文件差异。编辑题可查哪条来源改变了已拟的发布措辞，软件题可查哪一次查询使回归新增断言，调度题可查哪一车的离场缺口改变了放行意见。单人直接交出合格结果同样计入分母。只打开资料、请求帮助、或两人说出相似结论，都不足以归因“他人的发现改变了交付物”。对照同时记录独立验收、额外修订、人工干预、自然退出和逐笔用量。

## 本轮结果

| 冻结工单 | P 模拟请求 / 工具调用 | F 模拟请求 / 工具调用 | 对交付原稿的核对 |
| --- | ---: | ---: | --- |
| 旅客说明 | 6 / 5 | 5 / 4 | 先给可发布路线；实际开放时刻、机场接驳、捷运状态均可回到当时的来源，另说明后来的回顾超出截稿日。 |
| 午夜站牌 | 7 / 6 | 6 / 5 | 交班命令能重现同一窗口的跨服务日班次。候选测试在原实现上失败，修复后通过。 |
| 夜班调度 | 6 / 5 | 5 / 4 | 原稿给出正常、低温、允许平移及效率下降时的决定。90% 时可执行调度，85% 时须调整出车计划。 |

六条会话从同题相同基线分别启动，均提交并自然退出。35 笔模拟请求对账，29 对工具调用与结果可从原始会话重建。P 三条均记录 DELIVER，F 三条从 Git 读回原稿。逐文件与参考交付比对后，两个入口的实际交付内容一致。另用宿主对四个入口分别送入未完成基线、参考件和故意出错的候选。四个参考件都通过对应自动项，四个基线及四个错误候选都被拒绝。Mock 按脚本直接工作，其请求差额是预设步骤造成的。新增真实模型请求为零。上一轮第 15 笔 UNKNOWN 的停机记录仍归原实验。

[六条会话及完整 SHA](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk/mock/summary.json) · [宿主正反例](../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk/controls.json) · [此前首轮真实试点及停止现场](TASK-SELECTION-PILOT.md)
