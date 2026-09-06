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
| `10-model-advisory-spec.md` | **模型推荐咨询面规格（PLMP-ALC-2）**：R6 bestModel 诚实门控接线——per-model 资格、零成本弃权、先验回退标注、验收 ADV-A01–A06 |
| `11-status-telemetry-view-spec.md` | **status 遥测视图规格（PLMP-TLM-2）**：遥测线的用户面——加法式 telemetry 节、人话格式、冷表缺席、术语隔离红线、验收 STV-A01–A03 |
| `12-context-brief-spec.md` | **Context Brief 规格（PLMP-CTX-1）**：知识闭环缺环的 C2 切片——事实/解释/冲突三层结构化压缩、冲突不平均红线、只读咨询面、验收 CTX-A01–A06 |
| `13-host-adapter-conformance-spec.md` | **Host Adapter conformance 规格（PLMP-CONF-1）**：G18 首宿主接入——握手字面量钉住、hostPort 全直通映射、runner 四场景、scratch 账本令、验收 CONF-A01–A04 |
| `14-context-retrieval-spec.md` | **Context 检索半边规格（PLMP-CTX-2）**：Requirement 编译器、GitPort 词法检索、canonical Manifest（新事件+M5+fixture v3）、Coverage、验收 CTX2-A01–A10 |
| `15-semantic-retrieval-spec.md` | **Semantic 检索通道规格（PLMP-CTX-3）**：EmbeddingPort 宿主注入 + 确定性哈希参考实现、collectWorktreeTexts 原料面、cosine top-k 接线、manifest.semantic 加法式字段、验收 CTX3-A01–A05 |
| `16-boot-pull-spec.md` | **Boot/Pull 上下文分发规格（PLMP-CTX-4）**：manifest 分发视图（boot 字节预算 + pull 句柄）、句柄语法三类、fetchContext 解析面、零契约触碰、验收 CTX4-A01–A05 |
| `17-visual-orchestration-spec.md` | **可视化编排面规格（PLMP-VIS-1/2）**：orchestrationGraph 只读投影（计划图+人话时间线，术语隔离机器守门）、控制映射 1:1、单契约三渲染器（dshweb/dshtui/dsh-winui）、验收 VIS-A01–A07 |
| `18-architecture-modes-spec.md` | **架构三模式规格（PLMP-ARCH-1/2）**：pipelinePreset + ProjectProposal 共享校验器（六类诊断）、声明只走 start/plan、主代理当架构师（零内嵌 LLM）、CLI architect 命令、验收 ARCH-A01–A05 |
| `19-renderer-adaptation-spec.md` | **呈现适配线规格（PLMP-WEB-1/2 + PLMP-TUI-1 + PLMP-WINUI-1）**：serveOrchestration 附加呈现面（127.0.0.1+随机 token、廉价轮询游标、kill 零影响）、React+ReactFlow 共享图面板（live/draft 双图、手搓图上编辑）、palimpsest tui（ANSI 零依赖）、sessionPanel 路 B 描述符、验收 WEB-A01–A06 / TUI-A01 / WINUI-A01 |
| `20-preset-library-spec.md` | **架构预设库规格（PLMP-ARCH-3）**：调研六系统→六条拓扑原型预设注册表（流水线/扇出-汇聚/角色层级/专家团/验证图/研究回路，lineage 注记名实关系）、零 LLM、角色 fail-closed、门禁只建议、serve 纯派生草稿端点 + 面板画布直出 + CLI --preset、验收 PRE-A01–A10 |

面向用户与开发者的现行文档：仓库根 `README.md` → `docs/user-guide.md` → `docs/architecture.md` → `docs/sdk-guide.md` → `docs/api-reference.md`。

规格的现行状态（阶段、测试基线、不变量）以 `03-system-design-spec.md` 的**末次修订记录**为准；两处冲突时以工程档案中的规格为准，并应在下一次提交中修正现行文档。
