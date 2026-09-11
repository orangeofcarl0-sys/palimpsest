## Primary table (autonomous contact)

| Class | Arm | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| S | G0 | 6 | 0 | 0% | 0% [0%, 39%] |
| S | G1 | 6 | 0 | 0% | 0% [0%, 39%] |
| S | G2 | 6 | 0 | 0% | 0% [0%, 39%] |
| P | G0 | 6 | 2 | 33% | 33% [10%, 70%] |
| P | G1 | 6 | 0 | 0% | 0% [0%, 39%] |
| P | G2 | 6 | 0 | 0% | 0% [0%, 39%] |
| F | G0 | 6 | 6 | 100% | 100% [61%, 100%] |
| F | G1 | 6 | 6 | 100% | 100% [61%, 100%] |
| F | G2 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G0 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G1 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G2 | 6 | 6 | 100% | 100% [61%, 100%] |
| C | G0 | 6 | 3 | 50% | 50% [19%, 81%] |
| C | G1 | 6 | 3 | 50% | 50% [19%, 81%] |
| C | G2 | 6 | 3 | 50% | 50% [19%, 81%] |

## Selection metrics

| Arm | S spec | P spec | S+P spec | F recall | U recall | C recall | required recall | precision | balanced acc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | 100% | 67% | 83% | 100% | 100% | 50% | 83% | 88% | 0.83 |
| G1 | 100% | 100% | 100% | 100% | 100% | 50% | 83% | 100% | 0.92 |
| G2 | 100% | 100% | 100% | 100% | 100% | 50% | 83% | 100% | 0.92 |

AuthorityRecovery (U: G2-G1) = 0.00; FreshnessRecovery (F: G2-G1) = 0.00; ConflictRecovery (C: G2-G1) = 0.00; SpecificityRetention (S+P: G2-G1) = 0.00.

## Inspection / premature contact

| Arm | inspect S | inspect P | inspect F | inspect U | inspect C | premature required |
| --- | --- | --- | --- | --- | --- | --- |
| G0 | 100% | 100% | 100% | 100% | 100% | 0% |
| G1 | 100% | 100% | 100% | 100% | 100% | 0% |
| G2 | 100% | 100% | 100% | 100% | 100% | 0% |

## Failure attribution (mechanical, by class + outcome)

- none: 79
- under-contact: conflict: 9
- over-contact: pinned: 2

## Secondary metrics

| Metric | n | value |
| --- | ---: | --- |
| autonomousReceipt | 50 | 100% |
| autonomousResponse | 50 | 100% |
| replyDelivery | 50 | 98% |
| ackRate | 50 | 70% |
| pendingAfterIdleRate | 50 | 24% |
| contractTouchedRate | 50 | 14% |
| contractAgreedRate | 50 | 2% |
| threadUsageRate | 50 | 52% |
| event count mean / median | 96 | 1.05 / 2 |
| event kinds | 96 | {"question":37,"evidence":22,"decision":29,"need":11,"proposal":2} |
| events >2KB / >4KB (max chars) | 96 | 66 / 35 (6742) |
| latency change-wake / wake-inbox / change-response median ms | 96 | 953 / 924 / 56340 |

## Scenario-level contact vectors

| Scenario | Class | Focal | G0 | G1 | G2 |
| --- | --- | --- | --- | --- | --- |
| C-behavior-conflict | C | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| C-release-authority | C | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| F-published-cursor | F | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| F-published-feed | F | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| P-pinned-cursor | P | palimpsest.main | 1,0,1 | 0,0,0 | 0,0,0 |
| P-pinned-host-contract | P | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| S-O-ordering | S | ordarium.main | 0 | 0 | 0 |
| S-canvas-policy | S | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| S-parse-strictness | S | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| U-O-consumer-authority | U | ordarium.main | 1 | 1 | 1 |
| U-compat-commitment | U | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| U-stable-invariant | U | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
