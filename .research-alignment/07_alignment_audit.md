# 对齐审计

| 检查 | 判定 | 依据 |
|---|---|---|
| 问题、干预、边界明确 | pass | 00 合同；报告 §1/§7 |
| 机制有可观察的执行过程 | pass | 请求预留先于 POST；实际 container canary；beforeCommit |
| 数学与代码对应 | pass | C/R/b 与 SQLite 状态、两级额度；安全整数 |
| 每个机制有近端观测 | pass | 03 观测点；refusals、Mock 次数、Git 观察、事件/PID |
| 正反例和故障签名明确 | pass | 02 设计；断流/超时/大请求/并发/坏数据/权限/HEAD |
| 替代解释有区分测试 | pass | 旧 JSON/HTTP 200 不算资格；DSH 启动不代替 tool result |
| 数值与运行语义分开 | pass | 字节合成计数、精确 usage、无真实 tokenizer/费用外推 |
| 物理正确性与网格收敛 | not applicable | 无物理模型/数值离散；只验证执行控制合同 |
| 失败记录与校准保留 | pass | noexec 与 430k 未触发反例均留档 |
| 主张有具体证据 | pass | 04 台账、05 矩阵、报告 §5；最终测试结果以文件为准 |
| 结论不超出被测范围 | pass | paid blocked；原 cohort INVALID；跨 Host/外部 Git race 仍有限制 |
| 可复现性 | partial | 测试和命令齐备；真实容器复现还依赖本机 retained recorded sources 与既有 image |

最强可建立结果：Mock 的有界请求通过真实 DSH 容器，故障注入在正确边界拒绝；Direct 经 Operator 准入后的确定性治理链可运行。

最重要未解条件：真实 Provider 的可执行计费上界与新 owner 授权。任何 paid 执行仍禁用。最终产品 follow-up 20/20 PASS；初轮 97/98 保持原记录，不能写成单批全绿。
