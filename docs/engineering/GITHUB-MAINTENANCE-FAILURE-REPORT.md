# GitHub 自维护失败调查与 #298

## 原现场

| 记录 | 原结果 |
| --- | --- |
| #299 首个容器预检 | 模型请求为零，原用量状态为 UNCONFIRMED |
| #299 原尝试 | 候选 `e1d0bac52dfa9586f45d5b399248b9dc815853c5`，67 笔结算，缺候选绑定 DELIVER，原判 REJECTED |
| #299 续修和接班 | 候选 `5143e0b71d1c5631acc901cb5e4a74a44aa6543e`，PR #300 合入后以 `166cf7c693953322abecd369bfab2eb1c574b45a` 冷启动，复测通过 |
| #298 原尝试 | 候选 `a6743b69ee0259834516a97980e5a06a087f2494`，自然退出，121 笔全部结算并绑定，15,247,187 tokens，原判 REJECTED / `persisted-candidate` |

#298 原工作树干净，提交存在于封存 bundle。原候选留存门禁因五文件外的两项修改拒绝。独立复核分别记录了以下结果。

| 层次 | 观察 |
| --- | --- |
| 写范围 | `run.mjs` 的变更仅把新依赖纳入源码摘要，经授权加入续修。CLI 的持久授权登记也越界，并涉及认领顺序和双授权来源，另记待审事项。 |
| 提交归因 | 真实 Git 对象的作者与提交者邮箱均超出允许值。轨迹中可见提交命令显式覆盖了工作区已配置的身份。 |
| 收尾 | 第 118 笔读取 status，看到原 Work 仍为 READY。第 119 笔 DELIVER 被拒，第 120 笔 CHECKPOINT 成功。最后自然退出。原会话没有调用 readiness。 |
| 冻结业务探针 | 对同一候选离线复算为 0/4。额度比较、持久委托形状和派发资格接口与冻结消费者不兼容。这个结果是独立复核，原驻留验收停止在候选留存门禁。 |

#298 案例绑定封存摘要 `2f4e1b45e8cbf7c7eb6023faf1dc3cd2d5619d9d1937cc7d7bbc508dfb9fec45`。原账本分项为 fresh input 204,955，cache read 14,949,248，cache creation 0，output 92,984。原运行的 167 个配对工具调用和 21 个测试调用保存在 F 盘封存现场。

## 持久调查与续修

调查和付费 Work 使用同一维护 Slot 的持久记录。事务保存案例、结论、续修路由和接班读回。监工在隔离的 Git 或资产副本上复验。待审事项写入项目 Journal，短索引保留来源引用。原 Work 保持终态。续修使用独立 Work、同一 Issue、固定候选草案和单次授权，重复出现的阻塞码会关联前案并暂停同类续修。

#298 的原提交只供调查和提取草案。普通 DSH 运行在已接受的 `166cf7c6` 安装上，恢复六项授权差异、新 Work 以及原项目 CHECKPOINT。冻结探针与凭据保存在宿主。机制变更与续修候选分别送审。[宿主契约与复算入口](GITHUB-MAINTENANCE-PILOT.md#持久失败调查)

## 零付费资格

- 案例 `failure-33fbf41c8a38ed14751308b30a583c5bee2fb64a4f421280724931200d5f7acd` 的原现场复算保留 121 笔账本及四项独立发现。封存尚未登记、复验已写入未确认、续修已登记未确认三个位置中断后，重开运行位只产生一次续修派发和一份原案调查回执。第二个消费者未取得常驻租约。
- 普通 DSH Mock 使用接受版的安装物，恢复六文件草案和 CHECKPOINT。7 笔皆结算，提交了 Mock 候选 `636ade5e24bbd69ca4b90c139c22210104b069a5` 和绑定的 DELIVER 后自然退出。冻结探针仍为 0/4，复现原业务不兼容，系统记录 `PAUSED_REPEAT`。此结果验证结清与重复失败路由。
- #299 从 `166cf7c6` 重新核对已接受工件和原 DELIVER，独立复验通过。无 Git 设备评审从封存 SQLite 读出真正的工作簿检查点，与归档工作簿逐字节一致，错版本读回被拒。#299 的零请求预检现场复算为 `ZERO_REQUESTS`，没有 UNKNOWN 项。
- 从续修检查点的副本读回原案例 Journal 记录，DSH 短索引为 2,203 字节，能按同一版本读取。错版本返回 `PROJECT_INDEX_VERSION_MISMATCH`。
- 既有 GitHub 双会话资格 8/8。两个普通 DSH Mock 各结算 5 笔，分别冷启动合入后的安装，读回同一项目并复测通过。双会话回执为 `0390636429a1955e8a866c95ac5cd802715f9814312ed49697d01d337a7662c8`。
- 零付费资格回执为 `5f85589a0455b8a9542038b81a5b01c5ccf0e85fb224c936e87c755dd3608690`，运行代码树摘要为 `41b14c47572f401ffc653dd863440855a79b6425ca2926c38853d7afa8f1d541`。构建、架构、公共 API 和定向回归通过，机制初次送审头的 GitHub CI 为 16/16。本机额外运行的 Windows 全量 Vitest 出现失败后停止，独立 GitHub CI 完整运行。[独立送审 PR #301](https://github.com/orangeofcarl0-sys/palimpsest/pull/301)

## 真实续修

运行位使用 `166cf7c693953322abecd369bfab2eb1c574b45a` 和构建 `39d90d732df686c3bbef529697391420e0fd8d2e4579c544bc01ea8543fff799`。续修 Work 为 `repair-4f421280724931200d5f7acd`，派发时消费单次准入回执 `8cb52af449e55700893c83906342cf384515a7cbf6aa98ec2db98da14023241c`。OpenCode Go `deepseek-v4.1-flash` 沿用 256 笔、60 分钟、单笔 240 秒和按量记账。会话从启动到停止 303.680 秒。

| 请求 | 模型动作或结果 |
| --- | --- |
| 1–4 | 读回同一项目的 Pulse，查看暂存草案、归档、Git 身份和范围。首次测试因缺编译产物失败。 |
| 8–9 | 构建 TypeScript，随后原有准入测试 6/6，GitHub 维护测试 7 项通过、1 项跳过。这两次测试在改写前发生。 |
| 13–15 | 改写 `standing-admission.mjs`，在 `slot.mjs` 增加容量和消费判定，再读回 Slot。 |
| 16 | 账本只保留准入事件，上游请求错误记为 `UPSTREAM_UNCERTAIN`，缺终态用量。宿主以 `usage_unobservable` 终止容器，退出码 137。 |

真实会话没有产生新提交，停止时检出 HEAD 是接受基线。六项授权内草案仍在，重新改了其中两项。最后可见结论仍是继承的 CHECKPOINT，轨迹没有新 DELIVER 或自然退出。验收因用量阻断暂停，未进入候选 PR 流程。

| 用量 | 已确认 |
| --- | ---: |
| 结算请求 | 15 |
| fresh input | 113,010 |
| cache read | 883,584 |
| cache creation | 0 |
| output | 27,967 |
| tokens 合计 | 1,024,561 |

32 个工具调用皆可按调用 ID 配对。离线复算把前 15 笔按唯一用量四元组绑定到 DSH 回放。第 16 笔继续为 UNKNOWN，全会话原归因为 INCOMPLETE。现场没有可用于细分上游请求错误的 HTTP 状态和终态用量。


## 未提交草案的离线复验

将封存的 `working.patch` 应用到固定 `166cf7c6` 的隔离工作树，在同一冻结镜像执行宿主探针和公开定向测试。草案摘要为 `6eb6258687ff745d2a639eed2b273218665b94b1c99053e93bb8bb226779f31f`，六路径与准入一致。原会话停机以及全场归因原判照存。

- 冻结探针 **1/4**。新 `windowWithin` 通过有限额度用例。跨重启和撤销两个用例都停在 `STANDING_ADMISSION_GRANT_INVALID`。独立的 UNKNOWN 与越界用例仍在合法正控制处读取到空决策。
- 公开回归 **11 通过、2 失败、1 跳过**。公开窗口测试与新实现的参数顺序不合。两轮派发用例在第二轮遇到 `SESSION_AUTHORIZATION_REQUIRED`。
- 隔离复算没有新增付费请求。结果及日志摘要在真实运行位的 `offline-draft/receipt.json`。草案复验作为补充证据，真实 Work 保留 `PAUSED / USAGE_UNCONFIRMED`。

## 真实停机回执与重启

宿主自动持久化停机案例 `failure-d7d5cf0cd490dd79e64817fdaf4c284e6b13cbc12853e1df50364403503b10f9` 和调查回执 `fc14925e4350af1899020bf0e42636862f9860d9fe07b995dd83db385e5f512d`。调查记录非自然退出、脏工作树、真实 UNKNOWN，以及冻结探针在原会话内未执行。原始停止与离线观察各自有出处。重启同一真实运行位后，回执和两份账本的 SHA-256 一致，续修派发仍只有一次，新增付费请求为零。

真实现场的可复算材料留在 F 盘 `experiments/pilot-inputs/r298`。入口为 `resident-status.json`、`settled-prefix.json`、`restart-readback.json`，工单目录保存 `failure-evidence.json`、`investigation.json` 和 `session/working.patch`。原 121 笔现场在原封存运行位，继续保留原 `REJECTED` 与冻结 0/4 复核。

## 停机草案的持久接续

从同一个真实停机案例恢复六文件草案。原案例 `failure-d7d5cf0cd490dd79e64817fdaf4c284e6b13cbc12853e1df50364403503b10f9`、调查回执和两份账本沿用原值。历史补证绑定原档案、补丁 `6eb6258687ff745d2a639eed2b273218665b94b1c99053e93bb8bb226779f31f` 和未跟踪文件归档摘要。Slot 建立待复验记录 `6ecc3e8685212ba881c85d1c9ac6c199af8c213a1021aa9c5e72c355f8cd35d0`。

首次领取在 Docker 的 F 盘绑定挂载阶段停止，待办仍可从 SQLite 读回。现有容器正在使用 F 盘映射。续跑用 Docker API 把固定 Git bundle、补丁、未跟踪文件归档和冻结探针复制进一次性卷，在容器内校验摘要后按只读挂载复验。新进程从同一待办恢复，登记一次复验和一次交接。

- 六项改动路径都在原准入范围内，`run.mjs` 仍匹配原精确编辑规则。冻结探针 **1/4**，公开回归 **11 通过、2 失败、1 跳过**，与此前手工复算一致。
- 下一张工单 `continue-6bae11aa94c5acf4265833da` 绑定草案与复验回执 `12cff2f90349572683abf34b5f60d172bdc7cfbbf44a474cad36f5a6a2fb6610`。剩余验收为冻结探针、公开回归和候选绑定 DELIVER。状态 `WAITING_FOR_ADMISSION`，阻断 `USAGE_UNCONFIRMED`。
- 重开宿主后，从原 Slot 读回同一工单、同一回执和同一份项目 Journal Opportunity。两份账本摘要一致，原 Attempt 仍为 STOPPED，派发次数为 1，新增付费请求为 0。
- 旧的短索引只取最早三条未决事项，真实续修项排在第五。短索引改为优先显示最新三条。用项目状态副本冷启动，`Resume stopped draft for #298` 排在 `open` 首位，旧索引版本被拒。
- 构建、架构、公共 API 和新增定向回归通过。零付费切点测试覆盖封存未登记、复验写入未确认、交接写入未确认，以及错案例、错补证和越界文件。

可复算材料位于 F 盘 `experiments/pilot-inputs/r298/durable-draft-proof`。核心入口为 `attestation.json`、`resumed-replay.json`、`restart-readback.json` 和 `dsh-index-readback.json`。[离线接续入口](GITHUB-MAINTENANCE-PILOT.md#停机草案的离线接续)
