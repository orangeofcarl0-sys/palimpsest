# 编辑部外采

这份项目只提供来信。用可访问公开网页的研究工具自行找资料。提交 brief.md 和 evidence.json。brief.md 先给旅客指引，再附短研判、把握程度与证据边界。登记实际查询词、找到的来源，以及每个判断使用的来源 ID。来源的 published 为原发布日期，accessed 为实际查阅日，使用 YYYY-MM-DD；后来的访问不能改变原发布日期。

evidence.json 的字段为 asOf、queries（实际查询词数组）、sources（每项含 id、title、issuer、url、published、accessed）、claims（每项含 claim 和 sources，后者为 ID 数组）、excluded（每项含 id 和 reason）。保留查过但排除的材料。遇到网页缺失或原始来源无法确认，写明具体缺口。
