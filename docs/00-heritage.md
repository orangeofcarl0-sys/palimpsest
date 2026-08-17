# 设计传承与权威来源

## 1. 本仓库是什么

本仓库是 **Palimpsest 复兴线**（2026-08-17 决议）的工程落点：以 DSH 插件形态重建 Palimpsest，作为 Ordarium 的典型产品。合同与教训从下列来源移植，**代码不移植**——Python 实现是可恢复的历史基线，不是本仓库的运行时依赖。

## 2. 权威来源

| 来源 | 位置 | 权威范围 |
|---|---|---|
| 规范 00–11（合同层） | `palimpsest-repo/docs/00-identity.md` … `11-phase0-2-unified-baseline.md` | 移植期间被逐条对照的合同文本；`02-contracts.md` 与 `11` 是 P0 的直接来源 |
| Python Runtime（冻结快照） | `palimpsest-repo/palimpsest/src/palimpsest/` | schema/domain/state 的行为参照；101 项测试定义了验收语义 |
| 唯一 replay fixture | `palimpsest-repo/palimpsest/fixtures/replay/baseline-v1.json` | 跨语言 parity 的黄金基准（本仓库 `fixtures/replay/` 为其逐字节副本） |
| 原始设计稿（非权威） | `palimpsest-repo/palimpsest/archive/raw-notes/` | 推导过程记录；与正式文档冲突时以正式文档为准 |
| Ordarium | https://github.com/orangeofcarl0-sys/ordarium | 副作用执行层的全部合同（docs/12–17） |

## 3. 移植纪律

- **合同不发明**：P0 的每个 schema 字段、状态转换、校验规则都来自冻结基线；如需偏离，必须先在本文档登记差异及其理由。
- **parity 是验收**：digest（canonical JSON + SHA-256）、事件哈希链、migration 身份（`PLMP` application_id、migration 1 checksum `ca8b417a…ff5ad9`）、snapshot digest 必须与 Python 输出逐字节一致，由测试机器把关。
- **失败关闭**：未知 `schema_version`/`payload_version`、损坏哈希链、漂移投影一律拒绝（docs/11 §5），无 historical bypass。

## 4. 已登记的实现差异

| 差异 | 理由 |
|---|---|
| `EventStore.append` 增加可选 `committedAt` 覆盖参数 | Python 侧确定性时间由 FakeClock 隐式提供；TS 侧显式传入原时间戳以支持 fixture 重放，语义等价 |
| `Error.cause` 以消息内联方式表达 | 运行时目标环境的 Error 构造器限制；错误类型与消息文本保持与 Python 对齐 |
| canonical int64 范围额外受 `Number.isSafeInteger` 收窄 | JS number 无法精确表示完整 int64；拒绝而非静默截断，失败关闭 |
| TaskPolicy 为 class 而非 pydantic model | TS 无隐式模型校验；digest 覆盖相同字段集，fixture 中 `trusted-default` policy digest 已验证一致 |

## 5. P1 起的来源

Ordarium 侧合同（effect profiles、Operations、live lease、reconcile 语义）以 Ordarium 仓库 docs/12–17 与 `evidence/` 为准；本仓库不复制其文本，只引用。
