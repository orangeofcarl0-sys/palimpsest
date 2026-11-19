# 夜班回放复核：谁先实测反例，谁修改交付

**两份真实交付均通过冻结 P/S 验收，两个 Principal 均自行完成。** 自主组有联系入口，实际联系次数为 0。维护者独立复测并由 Principal 据此修订的过程只在 Mock 中发生。真实样本表明两组都从档案和旧代码识别出 S 被当成绘制的问题；在修改前，能证明旧 SHA 对 S 确实误报的是宿主的独立运行。两组都由 Principal 记录 `DELIVER` 并自然退出。[真实配对与完整候选 SHA](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live-summary.json)

| 真实会话 | 候选 | 请求 | Fresh input | Cache read | 输出 | 总 tokens | 耗时 | 已配对工具调用 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 自主组 | `848f8e63dd95dacdd19ebaca9b5e158009b8e980` | 44 | 102,258 | 2,665,088 | 38,456 | 2,805,802 | 9:30.860 | 59/59 |
| 单 Principal | `7d6b8bf1176e3b6843c0e732146ff9dec21a5c3e` | 37 | 97,055 | 2,195,200 | 42,968 | 2,335,223 | 11:28.434 | 63/63 |

两组使用 OpenCode Go 的 `deepseek-v4.1-flash`，各自 64 笔、30 分钟、单请求 240 秒，总 token 和金额无上限。81/81 笔逐笔对账，共 5,141,025 tokens，cache creation 和 UNKNOWN 均为 0。自主组多用 470,579 tokens，其中 cache read 多 469,888，耗时却少 117.574 秒。两组均无真实同伴请求，不能将这段差额解释为协作开销。Provider 的原始 `cost` 字段两组均合计 0，`allowance` 分别为 0.02784454、0.02815477，`listCost` 分别为 0.04640757、0.04692464。归档保留这些字段的原义，未据此推算账单。[自主组逐笔观测](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/auto/out/REVIEW/request-observations.jsonl) · [单人组逐笔观测](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/solo/out/REVIEW/request-observations.jsonl)

## 起点与判据

业务目标是交给早班一份可复跑的回放和准确的交接稿。两组各取得一份相同候选 `4f80c3bd5d606e2a2192fd56badb4a138d139ee2`、同一历史引用及两份真实实验采集。两份提示逐字相同，只额外给出业务档案目录。P/S 结论、修正方法、联系人和协作步骤均未写入提示。[原始提示](../../research-evidence/pnwf-software/2026-11-19/night-isolated/mock/auto/prompt.txt)

| 冻结的输入 | 原采集的来源提交 | 宿主在该输入上独立运行同一提交的判据 |
| --- | --- | --- |
| P，重绘 | `4f80c3bd5d606e2a2192fd56badb4a138d139ee2` | 退出 0，`diagnosis.reproduced=true`，恰好一条 p17、序号 40 的实际显示倒退 |
| S，抑制 | `584d61c4bd5ae71bcb1fa687e9b3ad053da4f509` | 退出 1，`diagnosis.reproduced=false`，无实际显示倒退 |

宿主执行 `node handover/replay.mjs --json --require-anomaly`。P/S 各自保留原字节和 SHA-256，候选中现有的终端采集还须与基线 P 的 Git blob 相同。原候选在两份输入上都报告复现，因此 P 通过、S 失败。此前共享工作区实验的两个最终提交则均为 0/2，两次原判及轨迹仍可独立复算。[本轮基线实测](../../research-evidence/pnwf-software/2026-11-19/night-isolated/mock/baseline-grade.json) · [此前 0/2 原判](../../research-evidence/pnwf-software/2026-11-19/night-review/live-summary.json)

## 复核者能做什么

两组的 Principal 均使用普通 DSH，可以查相同的档案与 Git 引用，运行回放并提交修订。自主组多一个可选的 `fleet_contact`。两组均关闭可共享工作区的通用子代理入口。宿主从独立 Git 副本启动无外网的 DSH，接续上一班维护者的原始历史。该容器有自己的工作目录和 DSH home，未挂载 Principal 的项目状态或部署文件；维护者在其中创建的文件留在副本。单人组没有联系工具或对应的宿主路由。[容器边界与实测回传](../../scripts/pnwf/software/night-isolated/broker.mjs)

询问必须指定当前候选的完整 SHA。维护者可以选 P 或 S 试跑；宿主在第三个只读容器中，从固定 Git 对象和该采集运行原命令。回执列出提交、输入摘要、退出码、复现标志、倒退数、p17/40 是否出现，以及标准输出和错误的摘要。自由文本、修改过的私有副本和自报的测量值均无法写入返回值。回传时再次核对 Principal HEAD。询问所用的 Git bundle、宿主测量日志、DSH 调用结果分别保存，可逐笔重做。[回执与复算](../../scripts/pnwf/software/night-isolated/verify.mjs)

Mock 自主组产生 9 笔合成请求，单人组 4 笔。复核者写入私有 Git 目录后，宿主核对 Principal 同名文件内容；对 P/S 采集的写入、复核者的 Work 结论请求、错 SHA 和自报退出码均被拒绝。自主组拿到绑定原候选的 P/S 实测后由 Principal 修订，单人组按脚本自行复现，两份交付均为 2/2。Mock 验证了通路及边界；真实模型是否选用这条通路单独计数。[Mock 轨迹](../../research-evidence/pnwf-software/2026-11-19/night-isolated/mock/auto/trajectory.json) · [Mock 双组结果](../../research-evidence/pnwf-software/2026-11-19/night-isolated/mock-summary.json)

## 真实自主组怎样修订

普通 DSH 的工具清单含 `fleet_contact`。44 笔请求全部属于同一 Principal，它既未查联系人登记，也未联系维护者。序号 33→36 直接从业务目录读到两个档案和合同，69→70 读回放代码，87→90 对比上一班 Git 版本，127→130 在原候选成功重放 P。135→138 尝试临时以 S 替换工作树的 P，系统返回只读错误，后续读取的临时输出文件不存在。这条轨迹支持“Principal 自己识别了要验证的差异”；修订前 S 的实际误报由宿主基线测量证实。该次会话没有成功运行修订前的 S，也没有同伴发现或采纳事件。[按调用 ID 配对的轨迹](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/auto/trajectory.json)

199→202 核对两份原始摘要，207→210 保存各自的副本，215→216 重写回放。第一版自测有一次有意义的返工：P 的倒退识别正确，但序号 221→224 普通回放仍退出 1，一个对绘制序列的断言未容纳重绘。Principal 又改了两处，然后 245→248、249→252 分别实测 P 退出 0、S 退出 1。它把双现场检查纳入 `replay.sh`，同时改写运行说明与交接稿。没有新增独立的测试文件，新增的 P、S 副本各有两个文件名。四个文件的摘要对应两份原采集。361→364 提交，369→376 在已提交版本复跑，387→388 记录 `DELIVER`，随后自然退出。[提交的回放入口](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/auto/final/handover/replay.sh) · [交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/auto/final/handover/HANDOVER.md)

## 单 Principal 如何确认默认入口

序号 36→42、37→43、38→44 分别读取合同、P、S；52→59 读候选回放，87→114 查上一班的代码、证据与交接，135→142 按摘要把采集对回 Git。151→154 的 18 项原测试通过，但这些测试没有覆盖此次终端误报。Principal 先保存两份原始采集，再在 175→176 写入修订。187→190、191→194 对修订后的 P/S 做了第一次显式运行。本会话同样没有在写入前成功实测原 SHA 的 S 误报。[单人组轨迹](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/solo/trajectory.json)

205→206 新增四项可重复的测试，覆盖 P 的真实倒退、S 的抑制、S 的门禁退出码及默认活动输入。211→214 全套由 18 项增至 22 项并通过。271→274 试图在工作树替换活动输入，复制被拒，后续命令实际上仍读到 P。Principal 读取只读挂载信息，299→302 修订默认入口的测试，307→310 在临时副本成功将 S 作为默认输入，得到退出 1、零倒退及一条抑制。315→318 又用上一班的检出验证，看到现场注记缺失，323→326 补了读取交班邮件的后备路径。347→350 提交，363→364 记录交付。交接稿和测试随提交保存。[单人组测试原稿](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/solo/final/test/replay.test.js) · [单人组交接原稿](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/solo/final/handover/HANDOVER.md)

## 两份交付与前一轮

宿主分别从两个最终 Git bundle 检出完整 SHA，使用同一默认命令、同一旧判分器替换活动输入。两份交付在 P 上均退出 0、报告一次 p17/40 倒退；在 S 上均退出 1、报告零倒退。两份 Git 树保留原 P blob，独立封存的两份输入逐字节匹配原采集。两组实际检查均覆盖了已修订的回放，单人组额外把四项行为固化为独立测试。[自主组原判和标准输出](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/auto/result.json) · [单人组原判和标准输出](../../research-evidence/pnwf-software/2026-11-19/night-isolated/live/solo/result.json)

前一轮真实自主组曾主动求证，维护者首个实测出旧候选的 S 误报，随后直接在共享工作区改动。两个交付各 0/2。本轮两组各 2/2，真实联系和采纳均为零。两轮之间同时改变了复核者权限、记录目录、只读挂载和合同可见性，因此这次结果支持“保留原输入后可以独立修对”，无法分辨哪项变化促成通过，也没有真实样本证明回执足以驱动采纳。[上一轮逐事件复核](FLEET-NIGHT-REPLAY-REVIEW.md)

Principal 的业务工作区和宿主资格标记也留下了可观察痕迹。单人组在 119→122 读到了自己 Git 目录里的隔离标记，287→294 查找现场文件及测试相关文件名。自主组也花了若干调用查看挂载和项目状态。这些调用计入请求及耗时。两组都能从业务档案直接取得合同和原采集，因此本轮衡量的是资料可自查时是否主动求证。

## 复算

从仓库根目录使用 Node 与资格镜像，下面的命令只读已有证据。第一条逐项重核调用归因、Git bundle、终态用量及 P/S 判分，第二条核对原采集并对已发回的复核回执重做实际测量。将 `live` 替换为 `mock` 即可复算资格样本。

```powershell
$e = 'research-evidence/pnwf-software/2026-11-19/night-isolated/live'
node scripts/pnwf/software/night-review/archive.mjs --verify $e
node scripts/pnwf/software/night-isolated/verify.mjs $e
```

资格矩阵记录启动源文件的字节摘要。工作区按 LF 检出；归档另存了此次 Windows 启动时使用 CRLF 的两份源文件，复算同时核对原始摘要和正文。[启动原件](../../research-evidence/pnwf-software/2026-11-19/night-isolated/launch-sources)
