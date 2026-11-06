# 证据台账

统一根：[2026-11-07](../research-evidence/pnwf-cq-r1/2026-11-07/)。历史 paid cohort 原始证据保持原位，未改写。

| 记录 | 状态/意义 |
|---|---|
| container/ | 诊断失败：DSH 原生扩展遇 tmpfs noexec；零 Mock 请求 |
| container-native-fix/ | 修复后的 DSH 与坏 alternates 正反例通过 |
| container-faults/ | 诊断记录：430k 阈值未触发下一请求拒绝，不变量仍满足 |
| container-final/ | 六组最终实际容器场景通过；包含逐请求计数/拒绝、实际资格和 Git 观察 |
| budget-tests.log | 20 项请求控制故障测试；精确命令见报告 |
| product-tests.json / .log | 11 文件初轮 97/98；原 Head 禁止读 Git 的职责断言发现回归 |
| product-followup.json / .log | 职责修复后只重跑受影响的 Basis 与 Head owner 两文件，20/20 PASS |
| basis-vertical-final.json | 最终 Head 规则下的真实子进程纵向事件证据 |
| engineering-checks.log | 构建、架构、公共 API 和格式检查 |

不把失败诊断覆盖为成功。最终报告明确批次与修复前后差别，不声称 Windows 全量测试已排除所有回归。
