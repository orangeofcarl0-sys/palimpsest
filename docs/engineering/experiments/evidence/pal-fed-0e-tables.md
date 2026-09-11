## Primary table (autonomous initiation)

| Dependency | Criterion | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| D1 | C0 | 6 | 6 | 100% | 100% [61%, 100%] |
| D1 | C1 | 6 | 6 | 100% | 100% [61%, 100%] |
| D0 | C0 | 6 | 3 | 50% | 50% [19%, 81%] |
| D0 | C1 | 6 | 4 | 67% | 67% [30%, 90%] |
| DA | C0 | 4 | 4 | 100% | 100% [51%, 100%] |
| DA | C1 | 4 | 3 | 75% | 75% [30%, 95%] |
| D1-symmetry | C0 | 1 | 1 | 100% | 100% [21%, 100%] |
| D1-symmetry | C1 | 1 | 1 | 100% | 100% [21%, 100%] |
| D0-symmetry | C0 | 1 | 0 | 0% | 0% [0%, 79%] |
| D0-symmetry | C1 | 1 | 1 | 100% | 100% [21%, 100%] |

D1 contrast Δ = 0.00 (C1 100% vs C0 100%); exploratory Fisher exact p = 1.0000.

## Secondary metrics

| Metric | n | value |
| --- | ---: | --- |
| autonomous receipt (contacted) | 29 | 100% |
| autonomous response (contacted) | 29 | 93% |
| reply delivery (contacted) | 29 | 90% |
| ack rate (contacted) | 29 | 24% |
| pending after idle (contacted) | 29 | 72% |
| contract touched (contacted) | 29 | 59% |
| contract agreed (contacted) | 29 | 0% |
| event count mean / median | 36 | 1.56 / 2 |
| thread (collab_thread) usage (contacted) | 29 | 86% |
| oversized event bodies (>2000 chars) | 36 | 21 |
| contract touched / agreed runs | 29 | 17 / 0 |

## Scenario-level (C0 / C1 contact vectors)

| Scenario | Class | Focal | C0 | C1 |
| --- | --- | --- | --- | --- |
| D0-canvas-policy | D0 | palimpsest.main | 1,1 | 1,1 |
| D0-cli-flag | D0 | palimpsest.main | 0,0 | 1,1 |
| D0-test-layout | D0 | palimpsest.main | 1,0 | 0,0 |
| D1-cursor-stability | D1 | palimpsest.main | 1,1 | 1,1 |
| D1-error-taxonomy | D1 | palimpsest.main | 1,1 | 1,1 |
| D1-peer-wake | D1 | palimpsest.main | 1,1 | 1,1 |
| DA-indirect-shape | DA | palimpsest.main | 1,1 | 1,1 |
| DA-public-evidence | DA | palimpsest.main | 1,1 | 1,0 |
| S-O-dependency | D1-symmetry | ordarium.main | 1 | 1 |
| S-O-local | D0-symmetry | ordarium.main | 0 | 1 |
