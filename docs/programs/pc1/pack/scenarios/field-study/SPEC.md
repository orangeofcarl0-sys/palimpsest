# 场景 B — 三地点空气观测研究的可行方案与独立复核

**合成测试场景；设备、站点、数据和价格均为虚构，仅用于软件/Agent 研究。**

## 项目任务

给三个虚构站点设计一个可比较的 PM2.5 观测研究。要求至少连续 14 个重叠观测日、各站≥90%有效数据、目标测量不确定性不超过 ±3 µg/m³，在有限设备/电力/网络/总预算条件下提出可执行、可验证的研究方案。不能通过放宽目标制造可行性。

初始日期 T1=2026-03-02T09:00Z；T2=2026-03-09T09:00Z。这个历史模拟时间与实际模型运行时间分开。

## 三类互补贡献

- Design researcher：形成候选研究方法与部署方案，解释可比较性和科学限制。
- Evidence reviewer：核查实验材料、量纲、测试覆盖，指出哪些主张是真实观测、厂商声明或未知。
- Delivery analyst：成本、能源、网络、交期、资源和故障备选。

这些是任务职责，不强制创建新 canonical TaskRole。优先使用既有 analyst/scout/verifier 配置或原生 DSH subagent。至少两个真实独立执行者才能做 behavioral synthesis claim；工程阶段可 deterministic 验证协议。

## 信息演化

T1 可见 base 数据：设备 brochure、低湿 lab samples、三个站点条件、初始预算 7200 元虚构币、各项固定成本。

T2 可见：新的独立 field validation；明确 field reference 单位为 mg/m³，需要与 sensor µg/m³换算；高湿下 Echo 有系统性偏差。另有 test-owned operator 的预算上限变为 6000 的指令；目标不变。无关 newsletter 同时到达。

一份基于 T1 的旧设计在 T2 后迟到返回，系统不能因 report 正常完成就直接接受它。旧低湿实验仍对它覆盖的条件有价值；不能将它全部删除或用 T2 证明“过去一直错误”。

## 需要的智能合成

最终方案应将独立发现接入设计：不能只拼三份报告。说明候选选择、校准/质量控制、成本、时序、是否满足目标、条件化风险和需要 owner 决定的事项。

允许多个合理结论。可以提出在条件满足时的混合设备方案，也可以因验证不足暂不批准现场部署并提出最小补证工作。机械 rubric 只检验硬约束，不能用预定措辞强迫唯一答案。

## 权限

field report 是外部候选来源，读取不等接受；预算指令由场景控制器以明确 test-owned operator 路径应用，不能凭文件自称授权。部署外部真实设备不存在，本实验不产生现实采购/网络写入。

## 匹配与独立性

F 使用等价材料和普通 DSH Subagent/文件；P 保留相同原生能力并增加项目资产/acceptance。三个角色可以按自己目标选择材料；不能人为剥夺 F 的关键发现。分析 source independence，采购摘要对 brochure 的复述不能算独立验证。

## Holdout

运行前由独立 fixture generator 用固定 seed 生成未用于开发的变体：预算、站点湿度边界、库存或来源单位改变。变体不能只是改名字而答案完全相同。至少包括一项确实不可行的变体与一项无关变化变体。Oracle 保持隐藏，评分前冻结；不得观察 P 结果后挑有利 seed。

## 交付物

`study-plan.md`、机器可核对的 `plan.json`、source/evidence refs、未决问题及批准请求。JSON 字段仅为场景 evaluator 的输出格式，不是新增产品 canonical data model。

## 领域评价与机制评价分开

实际 Work 接受与来源审批来自产品日志；领域可行性来自公开数据计算和独立评审。研究任务可以以有充分依据的 infeasible/needs-verification 结束，不能因为没有 deploy-now 的方案就自动失败。
