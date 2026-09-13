# G10-G5 — Delivery

Baseline `main` @ `b7c2b50`. Branch `experiment/g10-g5-wake-reconciliation`.

Gates: diff check clean; focused suite 6 passed; unit **96 files / 838 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs G5-M01..M14 (`test/g5_lifecycle_wake.test.ts`): DORMANT ≠ TERMINATED
(M01); no runtime required (M02); checkpoint excludes context/CoT (M03);
WAIT→Dormant atomic with a wake route required (M04); explicit Dormant→Waking
(M05); cause recorded (M06); unknown world fact blocks reconciliation (M07);
institution epoch change reconciled (M08); reconciliation does not set belief
(M09); no active commitment prevents compile (M10); wake ≠ replay (M11);
single wake cycle (M12); termination only explicit (M14).

```text
G10-G5 LIFECYCLE & WAKE: PASS
```
