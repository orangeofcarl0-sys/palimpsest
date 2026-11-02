# S07 — 正常 DSH Host、隔离、持久运行和成本控制

依赖 S00/S01。目标：默认可重复安装运行，真实安全边界和资源控制先于模型试验。

### S07-R01 — 已安装能力为准

读取本地 DSH/Ordarium 版本与实际插件。不能把新 upstream README 当旧安装版的证明。提供 doctor 报告 Session persistence、native subagent、filesystem/bash executor、permission、sandbox enforcement、network/proxy、数据库与 path view。缺能力给 actionable diagnostic，不无声退回更宽权限。

### S07-R02 — 权限在执行层而非文字层

模型允许读当前工作资料、写自己被授权的 execution world；Inbox 只读、test oracle/未来事件不可读、其他条件目录不可读、凭据与 runtime admin 状态不对模型工具开放。Bash 和 read/write/edit provider 一并检验；测试 symlink、间接 helper、环境变量、子进程、跨 workspace。只用 synthetic secrets，禁止输出真实密钥。

sandbox 与能力模式不同：普通 Git worktree 不是 OS sandbox；bwrap/容器/现有 DSH sandbox 可作为成熟 adapter。无法满足要求的目标平台应明确 unsupported，不能宣称通用跨平台隔离。只支持一条安全 happy path也胜过假支持，但安装需清楚。

### S07-R03 — 正常 Host 生命周期

Principal running、idle、waiting-review、interrupted、uncertain 的用户状态来自真实 owners。Attention/Delegation 的消息 queued、delivered、consumed、acted-on 分开；`activation:none` 不称主动唤醒。旧 session 关闭后未消费结果通过已有 durable path 或 resume inspection 可发现；非持久 job 真实报告 interrupted。

### S07-R04 — 保守可用的在线资源账

从真实 Session usage events 记录 provider/model/session/turn/counter version，input/output/cache 分项去重。累计计数与 delta 不混；resume 不重复计费；子 Agent 计入父 campaign；provider 缺usage 标 unknown 并限制启动。预算 gate 管理 launch + in-flight reserve + pair reservation；停止必须真实终止合格进程及其 child tree，保存最后证据。不能把 24M 默认建议当 owner 付款批准。

### S07-R05 — 成本与进度分离

记录 time-to-first-useful-action、模型 active time、工具执行时间、review wait、空等待、retry 与实验观察开销。cache Token 不按全价推断成本。日志应足够解释 126 次工具调用的摩擦，但不默认暴露整个内部数据库给模型。

### S07-R06 — 崩溃恢复与外部效果分开

进程 crash/restart、网络异常、重复消息、长任务超时和取消全覆盖。Session 能恢复不意味着原业务方向仍正确；resume 重新检查 currentness。外部 effect uncertain 由 S01 formal recovery，对话恢复不自动重发不可逆动作。

### S07-R07 — 单一可支持默认环境与可替换 backend

先把一个明确 supported stack 做完整（如已安装 DSH + Linux/WSL2 隔离），其余平台有能力检查和明确信息。不要在本期建设跨云 Runtime。Git 仍是第一实现，接口保留独立 world 及 immutable artifact 的适配；只有测到性能瓶颈才考虑更换 substrate。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S07-01 | S07-R01 | doctor 从实际 runtime 输出版本和已组成能力，missing 不被声明可用 |
| T-S07-02 | S07-R02 | Bash/fs/child/symlink 边界测试通过；synthetic secret 不可读，Inbox 不可写 |
| T-S07-03 | S07-R03 | delivered 与 consumed 区分，idle/pending 能在新 Session 正确读取 |
| T-S07-04 | S07-R04 | usage duplicate/delay/resume/child 被准确计数；启动保留 pair 预算 |
| T-S07-05 | S07-R04 | Windows/Linux 实际采用的进程树 stop 有测试，不仅发送信号 |
| T-S07-06 | S07-R05 | wall-clock 不把 evaluator wait 记为模型推理；费用缺失不编造 |
| T-S07-07 | S07-R06 | restart 不重复外部效果，cancel/late result 不越权生效 |
| T-S07-08 | S07-R07 | supported install 可复现，unsupported profile fail-fast 且给修复方式 |

**退出：** 正常运行资格可机械检查，任何真实模型 trial 前可自动 gate；额度/权限缺失阻止 trial，不能阻止后续包与代码交付。
