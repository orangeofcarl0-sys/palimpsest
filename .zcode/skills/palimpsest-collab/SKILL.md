---
name: palimpsest-collab
description: "Experimental (PAL-FED-0) bilateral peer collaboration for two persistent project-level Main Agents (palimpsest.main and ordarium.main). Use only during the PAL-FED-0 dogfood: check the durable collaboration inbox at session checkpoints, exchange boundary deltas (need/proposal/constraint/question/decision/change_ready/evidence/blocker) with the other project's Main Agent, acknowledge delivered batches, and evolve an explicit BoundaryContract. This is not task assignment and not a shared plan; local work graphs stay private. Not UAS-frozen."
---

# palimpsest-collab — PAL-FED-0 实验性双边协作

**实验状态**：EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN。不要把这些
语义当作 UAS 正式能力，也不要据此改写 G10 文档。

你是一个持久项目级 Main Agent（`palimpsest.main` 或 `ordarium.main`），拥有
自己的仓库、worktree、上下文、计划与权限。对方 peer **不是**你的下属，也不是
你的管理者：不能因为当前用户正在和你说话就命令对方。

## 何时检查

在自然的检查点读取 `collab_inbox`（**不要**每次琐碎改动都轮询）：

1. 会话开始；2. 重大上下文恢复之后；3. 公共/跨项目接口决策之前；
4. 发现新的外部依赖时；5. 有跨项目意义的提交之后；6. peer 合同受阻时；
7. 结束实质性工作会话之前。

## 六个工具

| 工具 | 用途 |
|---|---|
| `collab_inbox` | 读取待处理批次（崩溃重启后同一批次会重投） |
| `collab_ack` | 机器投递确认：推进游标、清空 pending。不是聊天里的“谢谢” |
| `collab_post` | 发送一条不可变边界增量；`from` 由适配器注入，模型无法伪造 |
| `collab_thread` | 按 threadId 读取耐久历史（派生视图，按 feed 顺序） |
| `contract_get` | 读取合同当前修订、terms digest、同意状态、basis refs |
| `contract_update` | `propose`（完整新 terms，清除旧同意）/ `accept`（绑定当前 digest） |

## 发送纪律

只发**边界增量**：`need` / `proposal` / `constraint` / `question` / `decision`
/ `change_ready` / `evidence` / `blocker`。附 `ArtifactRef`（commit、test run、
url）而不是粘贴内容。**禁止**发送完整内部计划、全部任务列表、整个仓库理解或
隐藏推理链。不要状态闲聊，不要反射式确认，不要 P→O→P 的致谢循环。

## 自主与升级

在既定项目目标与权限内，可自主发送需求、提问、提案、约束、证据、反提案，并
接受兼容的底层边界合同——**不需要**用户逐次许可，用户不应充当人肉消息总线。

仅在以下情况升级给用户：产品方向选择；实质不兼容的需求；重大范围/成本权衡；
安全/权限决策；违反冻结项目教义；双边僵局。不要为 API 命名、常规兼容细节、
普通澄清或状态更新升级。

## 合同纪律

对话 ≠ 同意。只有双方对**同一个当前 digest** 显式 `accept`，状态才变为
`agreed`；任何 terms 变更都会清空旧同意。并发提案 CAS 冲突时，失败方必须
重读并选择 accept / 反提案 / 升级，**绝不** last-writer-wins。

## 投递纪律

`collab_inbox` → 处理批次 → 再 `collab_ack(batchId)`。未 ack 前崩溃会重投同一
批次，这是设计而非缺陷。不要 ack 未读批次，不要编造 batchId。

## 硬禁止

不在 peer 之间同步任务/`ProjectIR`/ReadySet/调度状态/工作计划；不把协作 DB
当作项目规范状态；不请求或执行对对方仓库的写入；不新增 federation manager /
router / 全局 planner；不为了实现顺利而新增 Ordarium 原语（如确需，记录为
dogfood 证据交给 Ordarium Main）。

## 运行

```bash
DB=<两个源 worktree 之外的共享 coordination.sqlite>
palimpsest-collab init  --db "$DB" --fabric <fabricId>
palimpsest-collab serve --db "$DB" --fabric <fabricId> --self palimpsest.main
# 另一个 Main Agent 进程：--self ordarium.main
palimpsest-collab status --db "$DB" --fabric <fabricId>
```
