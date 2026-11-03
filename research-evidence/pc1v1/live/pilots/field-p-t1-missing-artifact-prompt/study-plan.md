# Riverton three-site PM2.5 design — conditional baseline

Status: **candidate / not approved**. This document does not accept any external source, authorize procurement, or approve deployment.

Observed at: 2026-03-02 09:00 UTC (historical replay).
Requirements: R1 14 consecutive overlapping days; R2 >=90% valid data per site; R3 working target uncertainty <= +/-3 ug/m3; R4 complete within day 28; R5 plan and sources approved before deployment; R6 total <= 7200 with fixed costs included.

## 1. Recommended conditional configuration

One **Reference** unit at each site (S1, S2, S3), plus one battery kit at S2. No external loggers.

| Item | Basis | Cost |
|---|---:|---:|
| Reference units x3 | 3 x 1800, exactly the available inventory | 5400 |
| Battery kit for S2 | one required for each no-mains site | 300 |
| Calibration and cross-check | required fixed | 600 |
| Field staff | required fixed | 400 |
| Transport | required fixed | 180 |
| Reserve | required fixed | 100 |
| External loggers | Reference has offline storage; not required | 0 |
| **Total** | | **6980** |
| Approved cap | | 7200 |
| Headroom | | 220 |

Checks: budget PASS (6980 <= 7200); schedule PASS (21 days <= 28); planned coverage PASS (14/14 valid days per site).

Why Reference as the baseline: it is the only model with independent bench points in the high-humidity range (75, 90, 95% RH; max observed absolute error 0.9 ug/m3). That is the best available evidence for S2 (80-95%) and S3 (70-90%). It also has offline storage, so S2's no-network and S3's intermittent-network conditions do not threaten data capture.

Comparability: same model, same calibration protocol, common UTC time base, same sampling interval and siting/inlet protocol. Site differences in humidity, power and exposure remain environmental differences, not instrument differences.

## 2. Schedule and gates

Relative Day 0 = 2026-03-02 09:00 UTC.

- **Gate G1 — approval and source acceptance:** target Day 4; hard latest Day 7. Approval must cover the plan and the sources relied on (R5). This planner cannot grant it.
- **Gate G2 — supplemental verification:** targeted humidity check before deployment (see section 5). It must not be silently assumed to be free or already done.
- **Order:** after G1. Reference lead time 4 days.
- **Install/calibrate:** up to 3 days.
- **Observation:** 14 consecutive days, all three sites simultaneously.
- **Completion:** with order on Day 4: 4 + 3 + 14 = Day 21; QA/synthesis leaves ~3 days before Day 28. With order on Day 7: Day 28 exactly, zero buffer. If approval slips past Day 7, the 14-day observation cannot finish inside Day 28.

## 3. Site operation

- **S1 (indoor; 35-65% RH; mains; stable network):** Reference on mains, offline logging. Low-humidity end is the main evidence gap for Reference.
- **S2 (waterside outdoor; 80-95% RH; no mains; no network):** Reference on battery kit, offline logging. This is the highest-humidity and highest-logistics-risk site.
- **S3 (forest-edge semi-open; 70-90% RH; mains; intermittent network):** Reference on mains, offline logging; network is not relied on.

Common: synchronize clocks at installation and at each daily check; record raw files and a calibration/QA log; use ug/m3 consistently; record inlet/siting height and any local obstruction.

## 4. Data-quality rule

14 consecutive days; at least 90% valid data per site means at most about 1.4 days (33.6 h) missing per site. Planned valid fraction is 14/14, but the plan needs daily health checks, clock checks, backup of raw files, calibration-status checks, range/stuck-value checks and a missing-data log. A failed instrument at any site is a schedule and R2 risk because there is no same-model spare within budget.

## 5. Evidence status and targeted supplemental verification

Observed:
- Lab samples: Echo n=4 at 40, 45, 50, 60% RH; Reference n=4 at 45, 75, 90, 95% RH. All eight tested points are within +/-3 ug/m3 (max absolute errors 1.2 and 0.9 respectively).
- Sites: S1 35-65%, S2 80-95%, S3 70-90% RH; temperatures 9-26 C.
- Costs, availability and lead times as listed in sources/.

Manufacturer claim only:
- Echo: RH 20-95%, +/-2 ug/m3. The procurement summary repeats the same brochure; it is not a second independent study.
- Reference: RH 20-95%, +/-2 ug/m3, labelled vendor brochure with independent validation, but the independent points are sparse.

Critical gap:
- Echo has **no** observations above 60% RH. Echo at S2 and S3 is therefore **undetermined**, not validated. Reference has only one S1 point (45% RH) for a 35-65% range.
- The samples are point bias checks, not a full uncertainty budget: no replicates, no confidence interval, temperature only 18-22 C versus site 9-26 C, and raw-unit/calibration provenance is not shown.

Targeted verification to request before deployment (subject to approval and a quoted cost/time; not assumed included in the 600 calibration line):
- Reference at 35, 65 and 80% RH (plus the existing 45/75/90/95 points), at least 3 replicates per level, with temperature bracketing 9-26 C.
- If Echo is considered as a fallback, Echo at 70, 80, 90 and 95% RH (plus S1 35/65), same replicate/temperature requirements.
- Document raw-unit unification, calibration traceability and the reference-method uncertainty.

## 6. Alternatives and decision rule

| Option | Cost | Advantage | Limitation |
|---|---:|---|---|
| **All-Reference (baseline)** | 6980 | Best high-RH evidence; offline; same model | No spare; only 220 headroom; S1 low-RH gap |
| Echo-only | 3540 | Cheap; 6 available so spares possible | Echo unvalidated above 60% RH; S2/S3 R3 gap; loggers at S2/S3 |
| Hybrid: 2 Reference + 2 Echo (Echo at S1, one Echo spare) | 6380 | Reference at high-RH S2/S3; one spare | Mixed models require cross-cal/time-base/unit QA; weaker comparability; S1 35-40/60-65 gap |
| All-Reference + 4th Reference spare | 8780 | Spare | Exceeds cap; not allowed |

Decision rule: propose all-Reference as the primary conditional plan. Use the hybrid only if a spare is mandatory or fewer than three Reference units can be reserved. Do not use Echo-only at S2/S3 unless high-humidity validation is completed and approved. Do not claim any option is approved.

## 7. Scientific limits

The design compares short-term site-level diurnal/day-to-day patterns over 14 days; it does not establish seasonal averages, source apportionment or causal effects. Site siting differences confound direct site-to-site level comparisons; the defensible comparison is the shape/timing of the diurnal cycle under a common protocol. The lab evidence is small and bench-based, so the +/-3 target remains a working target pending verification, not a demonstrated field uncertainty.

## 8. Open questions / approval requests

1. Will the operator accept the plan and the sources relied on before deployment (R5)?
2. Can all three Reference units be reserved, and is the 4-day lead time firm?
3. Will the operator authorize and fund the targeted humidity verification, and can it finish before the Day 7 order deadline?
4. Is a same-model spare mandatory? If yes, the all-Reference baseline is not acceptable and the hybrid must be considered.
5. What is the exact day-28 boundary convention (calendar-day counting) and the approval date?
6. Are the existing calibration/cross-check provisions sufficient for the chosen configuration, or is a separate chamber-test quote required?
