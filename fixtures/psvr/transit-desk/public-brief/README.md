# 旅客编辑台 · 待核线索 07-02
模拟编辑来件，事实材料来自公开的一手机构记录。在 archive/ 检索按日期归档的中文资料卡。卡片是有原文链接的编辑摘记；同一机构的转发仍属于同一消息链。资料库也收录了截止日之后的材料。

提交 brief.md（先给可发布文案，再列研判依据、可信度和仍待确认项）和 evidence.json，供编辑台核对。登记字段如下，来源数组引用实际采用的资料卡 ID。opening.time 用当地 HH:MM，terminalLeg.mode 用 shuttle 或 rail，apm.status 用 operating 或 planned。excluded 列出一个查过但不能用作当时实证的来源及原因。只登记用到的材料。

```json
{"asOf":"YYYY-MM-DD","opening":{"date":"YYYY-MM-DD","time":"HH:MM","sources":[]},"lines":[],"terminalLeg":{"mode":"","fareUsd":null,"sources":[]},"apm":{"status":"","sources":[]},"excluded":[{"id":"","reason":""}]}
```
