# 更正：新站已开通，但列车不能直入 LAX 航站楼

## 可发布旅客说明

经核查，LAX/Metro Transit Center 站于 2025 年 6 月 6 日（周五）17:00 向公众开放，Metro C 线和 K 线停靠该站。前往 LAX 航站楼的旅客，需在换乘站下车，转乘免费机场穿梭巴士前往各航站楼到达层；轨道列车并不直通航站楼。连接车站与航站楼的自动旅客捷运（APM）当时仍在建设中，尚未投入运营。因此，“开通当晚即可全程搭轨道抵达 LAX 航站楼”的说法不准确：轨道段只到换乘站，最后一段须乘穿梭巴士。

## 短研判

**1. 开通的是车站，不是“轨道进航站楼”。**  
Metro 在 6 月 6 日的开通稿中确认，新站服务线路为 C、K 两线；同时把连接航站楼的自动旅客捷运列为未来项目，并说明由机场接驳巴士服务新站。6 月 13 日 Metro 的公交调整稿回顾，车站已于当地 6 月 6 日星期五 17:00 向公众开放。这里能确认的是“车站+两条轨道线”开通，不能推出“轨道直达航站楼”。

**2. 当时的换乘方式是“轨道到站、巴士进楼”。**  
洛杉矶世界机场局（LAWA）7 月 2 日的旅客提示描述的是现行路线：乘 C 或 K 线到换乘站，再搭免费穿梭巴士到各航站楼到达层；APM 仍在建设。也就是说，APM 未启用前，航站楼这一段是巴士，不是轨道。接驳巴士由 LAWA 与 Metro 两份运营方材料印证；“免费”则由 LAWA 明确。

**3. 要把“开通事实”与“开通前预告/未来预测”分开。**  
LADOT 6 月 5 日的周报是开通前一天的转述，称新站“预定次日开放”，并把 C、K 线与机场称为“直接连接”。这属于对 Metro 公告的转述和宣传语，不能当作开通当晚实际运营的证据；“直接连接”也不等于轨道列车进入航站楼。真正能证明公众开放时间的是 6 月 13 日的 Metro 回顾稿，能证明换乘方式的是 6 月 6 日 Metro 开通稿与 7 月 2 日 LAWA 提示。

**4. 证据能确认到哪一步。**  
可以确认：2025 年 6 月 6 日 17:00 新站向公众开放；C、K 线停靠；航站楼接驳为免费穿梭巴士；截至 7 月 2 日 APM 仍是规划/在建、未运营。不能确认：6 月 6 日 17:00 第一班接驳巴士是否即刻开出、当夜班次与全程耗时、APM 的具体开通日期，以及接驳巴士是否覆盖所有航站楼的全部时段。因此，旅客说明只写“到站转乘免费穿梭巴士”，不写“当晚全程轨道”。

**5. 截止点与排除材料。**  
本稿以 2025 年 7 月 2 日洛杉矶当地收班为截止点。Metro 9 月 12 日的“百日乘客故事”虽也提到免费接驳和未来 APM，但发布于截止点之后，属于事后回顾，不能用来证明 6 月 6 日或 7 月 2 日当时的运营状态，故未采用，并在 `evidence.json` 的 `excluded` 中注明。

**可信度：** 核心更正（车站开通时间、C/K 线、巴士接驳、APM 未运营）为高；对“开通当晚接驳车即时可用”的具体时刻判断为中，因为资料只证明接驳方式，未给出首班车时刻。原句“当晚就能全程搭轨道抵达 LAX 航站楼”应判为不准确。

## 采用来源

| 资料卡 | 机构/日期 | 本稿用途 | 原文 |
|---|---|---|---|
| `service-june13` | LA Metro / The Source，2025-06-13 | 确认公众开放日期与 17:00 时间 | https://thesource.metro.net/metro-bus-service-changes-to-reduce-wait-times-and-improve-transit-connections-begin-sunday-june-22/ |
| `metro-june06` | LA Metro，2025-06-06 | 确认开通、C/K 线、接驳巴士、APM 为未来项目 | https://www.metro.net/about/media-relations/now-boarding-metros-lax-metro-transit-center-station-officially-opens-connecting-communities-bringing-faster-easier-travel-for-angelenos-visitors/ |
| `airport-july02` | Los Angeles World Airports，2025-07-02 | 确认现行换乘路线、免费巴士、APM 在建 | https://www.lawa.org/news-releases/2025/break-free-travel-stress-lax-enhanced-technology-and-pro-tips-smooth-july-fourth |

**未作为实证采用的背景材料：** `city-june05`（LADOT，2025-06-05）是开通前预告，仅用于说明“预告/宣传语”与“开通实证”的区别；`riders-sept12`（2025-09-12）晚于截止点，列入排除项。
