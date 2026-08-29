# 工程档案（internal engineering records）

这里的文档是**内部工程过程记录**，不是产品文档。它们记录了本仓库如何走到今天：从冻结的 Python 基线移植（heritage）、产品基线定义、入口产品线（E1–E4）的规划与逐阶段审计、到系统设计规格（PLMP-SDS）的历次修订。

| 档案 | 内容 |
|---|---|
| `00-heritage.md` | 传承声明：权威来源（冻结 Python 基线、Ordarium 文档）与移植取舍 |
| `01-plugin-product-baseline.md` | 产品基线（P0–P3 阶段门、工具面冻结、非目标） |
| `02-entry-line-and-mode-compatibility.md` | E 线规划与 DSH 工作模式兼容矩阵（含逐阶段审计记录） |
| `03-system-design-spec.md` | 系统设计规格 PLMP-SDS（需求/不变量/追溯矩阵，修订流水在此） |
| `04-sdk-developer-guide.md` / `05-api-reference.md` | 早期 SDK 文档版本（现行版在 `docs/sdk-guide.md`、`docs/api-reference.md`） |
| `06-audit-remediation-design-spec.md` | **H 线设计规格（冻结）**：审计修复与架构上链——恢复器官、声明制判官、门禁/角色/阶段上链、自重构合同 |
| `07-ordarium-alignment.md` | **跨仓库协调权威（PLMP-ALN）**：Ordarium 演进 × 本仓库消费——真相归属地图、演进接口清单、pin bump 升级协议、半触达监护、双边诉求登记 |
| `08-telemetry-externalization-spec.md` | **telemetry 外置试点规格（PLMP-TLM）**：管理型 state kind 首消费——append-delta 主体形状、错误分类映射、无兼容层退役、验收 TLM-A01–A06 |
| `09-adaptive-allocation-spec.md` | **遥测驱动自适应分配规格（PLMP-ALC）**：R6→R5 闭环——宿主层归因、证据面结算、保守重映射与硬不变量、验收 ALC-A01–A11 |

面向用户与开发者的现行文档：仓库根 `README.md` → `docs/user-guide.md` → `docs/architecture.md` → `docs/sdk-guide.md` → `docs/api-reference.md`。

规格的现行状态（阶段、测试基线、不变量）以 `03-system-design-spec.md` 的**末次修订记录**为准；两处冲突时以工程档案中的规格为准，并应在下一次提交中修正现行文档。
