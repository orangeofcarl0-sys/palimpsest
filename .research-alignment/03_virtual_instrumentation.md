# 观测点

| 位置 | 记录 | 用途 |
|---|---|---|
| 请求发送前 | SQLite request ID、digest、bound、RESERVED | 区分预准入与事后 watchdog |
| 拒绝点 | refusals 中 confirmed/reserved/bound/ceiling | 可重算拒绝不等式 |
| 响应尾部 | 最后 usage、message_stop；异常 reason | 区分完整结算与未知费用 |
| Mock 接收端 | attemptedRequests、accepted、calls、toolResults | 独立验证是否实际收到请求，以及 status 工具是否成功 |
| 实际容器 | container ID、image digest、uid、network、mounts、adapter SHA-256 | 资格不能借用其他实例的 JSON |
| 原生读取 | ALLOW/DENIED canary；root 外部读 | 同时验证可工作的环境和私有数据拒绝 |
| Git World | basis/result、alternates、diff、status、产品 observation | 定位复制对象失效与产品读取失配 |
| 产品事务 | 事件类型、project head、task envelope；前 commit 注入 | 区分回滚、后续漂移检测与跨系统原子性 |
| 真 Worker | 独立 PID、开始 HEAD、结果 commit、写入文件 | 证明真实进程与业务状态之间的因果链 |

观察不赋予权限：Mock 接收日志不替代账本，Host PID 不替代结算，旧资格 JSON 不替代本次 canary。
