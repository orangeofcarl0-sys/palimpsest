---
name: palimpsest-result-promotion-recovery
description: "Work 完成但 Promotion/Recovery 阻断、Git 身份或路径疑似不一致时使用。"
version: "1.0.0"
---

# palimpsest-result-promotion-recovery


## 输入与保护

保存原 Event/Ordarium ledger/Worktree/Host config 的不可变副本与 hashes。工程查询可只读访问 state；不在 live model normal tool 中开放 SQLite。原 uncertain operation 不盲重试、不手工终态化。

## 排查顺序

1. 列出 model input commit、reported canonical commit、world HEAD、base、expected head、prepared action source、accepted head。先证明是不是同一 Result。
2. 在实际 effect 执行者的同一 mount/path view 检查：
   `git -C <world> cat-file -e <oid>^{commit}` 与 canonical 的相同命令；保存 exit/stdout/stderr。
3. 读取 GitDir、object format、alternates 和 path ownership。对象不可观察与对象不存在、不是 ancestor 与 merge 没发生不同。
4. 跟踪 normal report、D2 settlement、exportResultCommit 与 promotion 三条接缝。确认历史 Result 是否 reachable from fetched HEAD；不能假设 fetch 某个 HEAD 永远带来指定 result。
5. 在 test clone 分别复现 crash-before-effect、effect-success-before-receipt、target moved、object missing、namespace unreadable、duplicate。不能以 live HEAD unchanged 单独推出 safe-to-retry，需 action 合同与 side effects 观察。
6. 修 existing owner；加入 product-path RED/GREEN。只有支持的 reconcile/resume API 可处理原 op；恢复不明时继续标 uncertain。

## 输出

identity table、hypothesis matrix、每个假说的决定性观察、最小修改、旧/新 recovery 结论。原 result 与修复后新结果不能拼成一次虚构成功。

## 必过反例

错误 sourceCommit、错误 expected head、短输入但完整 canonical、对象只在 world、损坏 alternates、相同缺失 OID、重复执行与 target race。
