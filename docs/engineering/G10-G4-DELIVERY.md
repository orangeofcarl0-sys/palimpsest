# G10-G4 — Delivery

Baseline `main` @ `624d987`. Branch `experiment/g10-g4-prospective-memory-wait`.

Gates: diff check clean; focused suite 8 passed; unit **95 files / 832 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs G4-M01..M11 (`test/g4_prospective_memory.test.ts`): durable definitions
(M01); unknown ≠ triggered (M02); error ≠ false (M03); injected clock (M04);
claim_changed vs current observation (M05); institution change (M06);
read-only evaluation (M07); idempotent trigger (M08); WAIT requires wake route
(M09); WAIT ≠ failure (M10); no RuntimeAgent (M11).

```text
G10-G4 PROSPECTIVE MEMORY & WAIT: PASS
```
