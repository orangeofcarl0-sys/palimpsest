# G10-G3 — Delivery

Baseline `main` @ `1939083`. Branch `experiment/g10-g3-epistemic-intervention`.

Gates: diff check clean; focused suite 7 passed; unit **94 files / 824 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs G3-M01..M10 (`test/g3_epistemic_intervention.test.ts`): Intervention ≠
Attempt (M01); ProjectRef derived (M02); operational observed read-only (M03);
unknown ≠ failed (M04); operational outcome never mutates belief (M05);
completed+refuting valid (M06); failed+epistemically-useful valid (M07); Project
failure ≠ Campaign failure (M08); immutable intervention history (M09);
pre/post belief basis recorded (M10).

```text
G10-G3 EPISTEMIC INTERVENTION: PASS
```
