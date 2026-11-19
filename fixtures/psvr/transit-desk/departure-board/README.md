# 站牌查询 · DB-17

这是模拟运营方已归一化的 GTFS 子集。import {departures} from './board.mjs'。输入为 feed、stop、带 Z 的 ISO 查询时刻、分钟数。返回 [{tripId,serviceDate,departure}]，departure 为 ISO UTC（含毫秒），按实际发车时刻、再按 ASCII tripId 升序。窗口左闭右开，最长三小时。系统时区为 UTC；本题没有夏令时转换。服务日从 00:00 算，班次钟面可到 47:59:59。calendar 列出各 service 的常规服务日期，exceptions 对指定服务日添加或取消服务。来源 feed 不随修复改变。

运行 node --test board.test.mjs 和 node cli.mjs。提交 board.mjs、回归测试和 HANDOVER.md。交班说明给出投诉的复现命令，以及如何区分午夜两侧的服务日。[GTFS 对服务日、时刻和例外的定义](https://gtfs.org/documentation/schedule/reference/)
