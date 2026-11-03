# Delivery analysis — cost, power, network, schedule, resources, failure modes

Status: **planning analysis only; no procurement or deployment approval.**
Basis: project revision 0, head `d605564`, observed 2026-03-02 09:00 UTC.

## 1. Fixed and variable cost elements

Fixed, required regardless of model (from `sources/costs.csv`):
- calibration and cross-check: 600
- field staff: 400
- transport: 180
- reserve: 100
- **fixed subtotal: 1280**

Conditional:
- battery kit: 300 for each no-mains site. Only S2 has no mains, so 300.
- external logger: 80 where a sensor has no offline storage and the network is not stable.
  - S2: no network, so any Echo needs a logger; Reference has offline storage, so no logger.
  - S3: intermittent network, so any Echo needs a logger; Reference has offline storage, so no logger.
  - S1: stable network, so an Echo does not strictly need a logger; Reference has offline storage.

## 2. Cost scenarios

| Scenario | Equipment/accessories | Fixed | Total | Cap 7200 | Headroom |
|---|---:|---:|---:|---:|---:|
| **All-Reference (3)** | 3 x 1800 + 300 battery = 5700 | 1280 | **6980** | PASS | 220 |
| Echo-only (3) | 3 x 600 + 300 battery + 160 loggers = 2260 | 1280 | **3540** | PASS | 3660 |
| Hybrid: 2 Reference + 2 Echo (one Echo spare; Echo at S1) | 3600 + 1200 + 300 = 5100 | 1280 | **6380** | PASS | 820 |
| All-Reference + 4th Reference spare | 7200 + 300 = 7500 | 1280 | **8780** | FAIL | -1580 |

The all-Reference baseline fits, but with only 220 headroom. A fourth Reference for a same-model spare is not affordable without cutting a required fixed cost or the target, both of which are prohibited.

## 3. Power and network

- **S1:** mains yes, network stable. Reference on mains with offline logging; no logger needed. Echo could use the stable network, but that is not the baseline.
- **S2:** no mains, no network. Battery kit required (compatible with both models). Reference offline storage is sufficient. Echo would need an external logger (80) and would still have no network; the logger is the only capture path.
- **S3:** mains yes, network intermittent. Reference offline storage avoids relying on the network. Echo would need an external logger (80) because the network is not stable.

The Reference baseline therefore removes network availability as a data-capture dependency at both S2 and S3. That is a material operational advantage, not just a cost difference.

## 4. Schedule

Relative Day 0 = 2026-03-02 09:00 UTC.

| Step | Duration | Notes |
|---|---:|---|
| Approval and source acceptance (R5) | operator-controlled | Target Day 4; hard latest Day 7 |
| Equipment lead | 4 days (Reference); 2 days (Echo) | Starts after approval/order |
| Installation and calibration | up to 3 days | Can follow equipment delivery |
| Observation | 14 consecutive days | All three sites simultaneously |
| QA and synthesis | 1-2 days | Before the deadline |

All-Reference arithmetic: approval/order Day 4 + 4 lead + 3 install + 14 observation = Day 25. That leaves about 3 days before Day 28. If approval/order slips to Day 7, completion is Day 28 exactly, with zero buffer. If it slips beyond Day 7, the 14-day observation cannot finish inside Day 28; the schedule becomes infeasible unless the requirements or deadline are changed by an authorized operator (this planner cannot change them).

Echo-only would have a 2-day lead and more schedule slack, but the measurement-evidence gap at S2/S3 prevents it from being the baseline.

## 5. Resources and availability

- Reference: 3 units available, 4-day lead, 1800 each. The baseline uses all three; there is no same-model spare.
- Echo: 6 units available, 2-day lead, 600 each. A 4-unit Echo purchase would still cost only 4140 with fixed costs, battery and two loggers, leaving room for spares.
- Battery kit: one is enough for S2 and is compatible with both models (scenario-established engineering fact).
- Reference offline storage is sufficient for the full observation (scenario-established engineering fact).
- Installation and calibration are at most 3 days; equipment waiting and installation can be sequential.

## 6. Failure modes and alternatives

| Risk | Effect | Mitigation / alternative |
|---|---|---|
| Approval later than Day 7 | 14-day observation cannot finish by Day 28 | Escalate the approval gate now; do not deploy before approval |
| A Reference unit fails at a site | No same-model spare; R2 90% valid data at risk | Pre-deployment burn-in, daily health checks, repair/replace protocol; consider hybrid if a spare is mandatory |
| High humidity at S2/S3 | R3 uncertainty evidence gap | Reference baseline; targeted supplemental verification; do not rely on Echo brochure |
| S2 power loss | Data loss at the no-mains site | Battery kit; daily battery/health check; backup/repair plan |
| S3 network loss | Echo capture loss | Reference offline storage removes this dependency |
| Clock drift / mixed time bases | Non-comparable series | Common UTC time base, synchronized start, daily clock checks |
| Unit or calibration mismatch | Invalid comparison | Raw-unit unification, calibration records, pre-deployment cross-check |
| Site access/security/weather | Missing days | Site-access confirmation, enclosure/siting plan, daily log; 90% allows at most ~33.6 h missing per site |

## 7. Delivery conclusion

The all-Reference configuration is the only current option that is both within the 7200 cap and best supported at the high-humidity sites, but it has no same-model spare and depends on a timely approval. The hybrid (2 Reference + 2 Echo, Echo at S1, one Echo spare) is the fallback if a spare is mandatory or fewer than three Reference units can be reserved; it costs 6380 but requires cross-calibration and accepts weaker comparability. Echo-only is the cheapest and most redundant in inventory, but it is not supportable at S2/S3 on the present evidence. No option is approved.

## 8. Planning checks (non-canonical)

- Budget: all-Reference 6980 <= 7200 -> PASS under the stated line items.
- Schedule: 21 days <= 28 -> PASS with approval/order by Day 7; target Day 4.
- Coverage: planned 14/14 valid days per site -> PASS against the 90% rule, but this is a plan, not observed field completeness.

These checks are arithmetic against explicit assumptions. They do not accept sources, prove field performance, or authorize spending.
