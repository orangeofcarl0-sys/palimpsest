## Primary table (autonomous contact)

| Class | Arm | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| V | H0 | 9 | 0 | 0% | 0% [0%, 30%] |
| V | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| V | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H0 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| I | H0 | 9 | 3 | 33% | 33% [12%, 65%] |
| I | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| I | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| N | H0 | 3 | 0 | 0% | 0% [0%, 56%] |
| N | H1 | 3 | 0 | 0% | 0% [0%, 56%] |
| N | H2 | 3 | 0 | 0% | 0% [0%, 56%] |

## Selection and adjudication

| Arm | V spec | L spec | V+L spec | I recall | precision | adjudication acc | silent collapse | cautious unresolved | unnecessary escalation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H0 | 100% | 100% | 100% | 33% | 100% | 44% | 67% | 0% | 0% |
| H1 | 100% | 100% | 100% | 0% | n/a | 50% | 100% | 0% | 0% |
| H2 | 100% | 100% | 100% | 0% | n/a | 33% | 89% | 11% | 0% |

H1−H0 prose lift (I recall) = -0.33; H2−H1 provenance lift (I recall) = 0.00; H2−H1 adjudication lift = -0.17; H2−H1 specificity retention = 0.00.

## Symmetry

- H0: V no-contact 100% (1/1); I contact 0% (0/1)
- H1: V no-contact 100% (1/1); I contact 0% (0/1)
- H2: V no-contact 100% (1/1); I contact 0% (0/1)

## Secondary

| Metric | n | value |
| --- | ---: | --- |
| autonomousReceipt | 3 | 100% |
| autonomousResponse | 3 | 100% |
| replyDelivery | 3 | 100% |
| ackRate | 3 | 100% |
| pendingAfterIdleRate | 3 | 0% |
| threadUsageRate | 3 | 0% |
| contractTouchedRate | 3 | 0% |
| contractAgreedRate | 3 | 0% |
| event kinds | 96 | {"question":1,"decision":3,"evidence":2} |

## Scenario-level vectors

| Scenario | Class | Focal | H0 | H1 | H2 |
| --- | --- | --- | --- | --- | --- |
| I1-current-conflict-cursor | I | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| I2-current-conflict-ordering | I | palimpsest.main | 1,1,0 | 0,0,0 | 0,0,0 |
| I3-current-conflict-error | I | palimpsest.main | 1,0,0 | 0,0,0 | 0,0,0 |
| L1-precedence-cursor | L | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| L2-precedence-error-code | L | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| L3-precedence-host-contract | L | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| N1-consistent | N | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| SO-I-conflict-ordarium | I | ordarium.main | 0 | 0 | 0 |
| SO-V-local-ordarium | V | ordarium.main | 0 | 0 | 0 |
| V1-historical-commentary | V | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| V2-legacy-error-codes | V | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| V3-superseded-note | V | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
