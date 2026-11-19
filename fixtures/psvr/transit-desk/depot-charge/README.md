# 河湾车队 · 模拟夜班运行单

本题是合成的电量调度研究；数据不代表任何机场的实际设施。输入是 night.json。四格各半小时，一格最多服务一台车，允许降功率。chargerKw 和 siteLimitKw 均指交流侧，batteryKwh 是电池侧；每格楼宇负荷在交流侧先占用接入容量。车辆仅在 [fromSlot,untilSlot) 在场，离场即核查所需电量。车辆在场时静止、不耗电。电池不超过 capacityKwh。低温仅改变表中指定的建筑负荷。可延期的负荷只可从 shiftFromSlot 原量搬至 shiftToSlot，不得削减总楼宇用电。

提交 model.mjs，导出 plan(night, efficiency)，输入相同单位、相同两辆车与四格窗口，可用数值求解或解析法。返回 {normal,cold,shifted,minShiftKw}。每个场景给出 {acKw:[四格交流充电功率],feasible:true或false}；即使不可行也给出物理可行、尽力满足各独立离场窗口的功率表。minShiftKw 为低温下满足两车的最小平移功率；无解时它和 shifted 均为 null。正常调度与低温调度的楼宇负荷分别按原值、加 coldExtraKw 计算。保留输入并在 HANDOVER.md 说明每车的缺口、最小平移及较低效率时的决定。
