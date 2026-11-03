# S09 — 可安装、可继续、可审阅的产品候选

依赖 S02/S03/S04/S05/S06/S07；可提前做骨架。目标：普通使用者不需要成为核心开发者。

### S09-R01 — 正常安装与环境诊断

提供与现有 CLI/Host 对齐的 setup/doctor/init 路径，安全生成 profile/database paths。exact CLI 命名由 S02 决策，不能把规范中的逻辑动词冒称现成命令。检查 Node/DSH/Ordarium/工具/sandbox/permissions/provider 配置，不读取或打印密钥。干净环境安装按锁文件可复现；不自动删除用户 profile 目录。

### S09-R02 — 项目初始、继续、审阅、恢复的统一入口

CLI/DSH/已有 web 至少一条普通人可完成的主路径，另外的正式入口保持语义一致。review 显示提案来源/精确变更/未决要求，approve/decline 真实落到 existing authority；不能在 UI 上改一个 badge 假装接受。继续项目时自然显示状态与下一步。expert 原接口仍可用但不淹没默认目录。

### S09-R03 — 文档与实测成熟度一致

README/user-guide/architecture/sdk/API/package dependencies/示例一致。特别修正没有实际覆盖的“任意中断完整恢复”“恰好一次”“所有证据均确定性正确”“mode 属性已被 host 执行”等强保证。文档写支持范围、前置条件、未验证处与失败恢复。不能为了吸引用户把 research branch 的能力写成 main 已具备。

### S09-R04 — 数据迁移与旧用户兼容

实现必要的 versioned additive migration，dry-run/backup/restore/idempotency 测试；old event replay 无歧义。未资格历史 evidence 不直接赋予新认证。明确升级前后 changed default tool surface，保留 expert profile 的兼容方式。对真实用户库默认不自动 migration，先诊断/批准。

### S09-R05 — 限制与资源可见

把当前功能的边界写进 doctor/status：ordinary Session persistence、job crash durability、read confinement、cross-peer availability、model budget 与 authority。预算停止时保留成果和下一步，不把未完成变完成。使用成本按报告 token 与账单类别区别，未知费用清楚未知。

### S09-R06 — 实际交付而非文档外壳

产出可安装 RC tarball/bundle、版本/commit/tree/依赖清单、用户入口、两个可复制示例、升级/rollback/recovery guide。只生成本地制品与非公开 release candidate，不发布 registry/release、不改 main。单项目默认例子不应要求 peer 配置；双项目例子检验真实 peer 分别运行。

### S09-R07 — 形成最小用户验收脚本

从干净安装开始，以非专家流程执行 create/continue、读一条新 source、提议并批准、完成工作、审阅接受、中断/恢复、读取负面结论、一次协作。不得在说明中要求查询 SQLite、修改 event 或手工写 JS 才完成。遇到缺 authority 要正常提示并保留工作，不伪造审批。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S09-01 | S09-R01 | 干净 package install+doctor，无隐含开发机绝对路径/凭据 |
| T-S09-02 | S09-R02 | 普通入口能够完成实际 approve/accept/recover，语义与 CLI 一致 |
| T-S09-03 | S09-R03 | claim-to-evidence 文档检查，已知限制没有被夸大 |
| T-S09-04 | S09-R04 | 旧数据 dry-run/迁移/重复执行/恢复可靠，旧证据不被升级权威 |
| T-S09-05 | S09-R05 | unsupported/missing/blocked 可解释；没有空白死路 |
| T-S09-06 | S09-R06 | RC install smoke、profile sample 和 dependency pin 可复查 |
| T-S09-07 | S09-R07 | 没有私有 API/SQL 操作的用户脚本完整跑通 |

**退出：** 一位没有读过架构的使用者能按文档复现主路径；研发仍可能待模型比较，但产品不再只存在于 research rig。
