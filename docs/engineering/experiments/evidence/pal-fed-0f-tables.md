## Primary table (autonomous contact)

| Class | Treatment | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| R | F0 | 9 | 9 | 100% | 100% [70%, 100%] |
| R | F1 | 9 | 5 | 56% | 56% [27%, 81%] |
| L | F0 | 9 | 2 | 22% | 22% [6%, 55%] |
| L | F1 | 9 | 0 | 0% | 0% [0%, 30%] |
| P | F0 | 9 | 2 | 22% | 22% [6%, 55%] |
| P | F1 | 9 | 0 | 0% | 0% [0%, 30%] |
| A | F0 | 4 | 3 | 75% | 75% [30%, 95%] |
| A | F1 | 4 | 1 | 25% | 25% [5%, 70%] |

## Selection metrics

| Arm | R recall | L specificity | P specificity | L+P specificity | precision | balanced acc |
| --- | --- | --- | --- | --- | --- | --- |
| F0 | 100% (9/9) | 78% | 78% | 78% | 69% | 0.89 |
| F1 | 56% (5/9) | 100% | 100% | 100% | 100% | 0.78 |

Δ specificity(L+P) = 0.22; Δ recall(R) = -0.44; exploratory Fisher exact on R contact p = 0.0824.

| Arm | inspect R | inspect L | inspect P | premature R | premature L | premature P |
| --- | --- | --- | --- | --- | --- | --- |
| F0 | 100% | 100% | 100% | 0% | 0% | 0% |
| F1 | 100% | 100% | 100% | 0% | 0% | 0% |

## Secondary metrics

| Metric | n | value |
| --- | ---: | --- |
| autonomousReceipt | 26 | 100% |
| autonomousResponse | 26 | 100% |
| replyDelivery | 26 | 100% |
| ackRate | 26 | 85% |
| pendingAfterIdleRate | 26 | 8% |
| contractTouchedRate | 26 | 0% |
| contractAgreedRate | 26 | 0% |
| threadUsageRate | 26 | 27% |
| event count mean / median | 70 | 0.74 / 0 |
| event kinds | 70 | {"proposal":3,"decision":19,"question":17,"need":2,"evidence":11} |
| latency change→wake / wake→inbox / change→response (median ms) | 70 | 903 / 1096 / 59236 |

## Scenario-level contact vectors

| Scenario | Class | Focal | F0 | F1 |
| --- | --- | --- | --- | --- |
| A-freshness | A | palimpsest.main | 0,1 | 1,0 |
| A-ownership | A | palimpsest.main | 1,1 | 0,0 |
| L-canvas-freshness | L | palimpsest.main | 0,0,0 | 0,0,0 |
| L-parse-strictness | L | palimpsest.main | 0,0,0 | 0,0,0 |
| L-test-layout | L | palimpsest.main | 1,0,1 | 0,0,0 |
| P-cursor-semantics | P | palimpsest.main | 0,0,0 | 0,0,0 |
| P-error-code | P | palimpsest.main | 1,0,0 | 0,0,0 |
| P-host-contract | P | palimpsest.main | 1,0,0 | 0,0,0 |
| R-deployed-error | R | palimpsest.main | 1,1,1 | 1,0,1 |
| R-future-compat | R | palimpsest.main | 1,1,1 | 1,1,1 |
| R-new-primitive | R | palimpsest.main | 1,1,1 | 0,0,0 |
| S-O-L-ordering | L | ordarium.main | 0,0 | 0,0 |
| S-O-R-consumer | R | ordarium.main | 1,1 | 1,1 |
