# 执行资格设计

本轮不进行物理仿真或付费模型实验。比较对象为既有失败机制与确定性故障注入，不以模型自然语言质量作为终点。

| 场景 | 干预 | 预期签名 |
|---|---|---|
| recorded-worlds | 正确复制状态；Mock 执行 status tool round trip | 两 session ENDED，4 POST，2 成功 tool result，精确计数，零预留 |
| broken-alternates | 改回不可用 Windows 路径 | 第一 POST 前拒绝；energy NOT_STARTED |
| large-request | session ceiling 200,000 / soft 199,000 | 首请求上界超过额度；零 POST |
| late-usage-next-request | ceiling 400,000 / soft 399,000；晚 150 ms usage | 首次准入并结算；第二次预留拒绝；energy 不运行 |
| interrupted-stream | message_stop 前断流 | 保留整笔预留，cohort STOPPED |
| large-response | Mock 输出 300,000 字符，大于请求 max_tokens | Mock 422；gateway 视 usage 未知、保留预留 |

20 项轻量故障测试另覆盖并发进程、会话/总额度分别约束、缺失计数与配置、超时、身份/端口、旧 JSON 和任意 adapter。预算只用安全非负整数；Mock 单位是精确字节合成计数，不能换算模型费用。

阈值校准：初轮 430,000 未使第二次请求越过 soft ceiling（103,835 + 319,523 < 429,000），控制不变量成立；保留失败注入记录，最终选 400,000 使首次可准入而第二次必须拒绝。没有修改 guard 来迎合预期。

产品负例：权限缺失/agent 角色/提交前失效，promotion CONFLICT，提交前 HEAD 变化，准入后漂移，初始 IN_SYNC。纵向正例使用真实 Node 子进程，依赖任务经过正常 TASK_READY 调度，再从 promotion HEAD 启动。
