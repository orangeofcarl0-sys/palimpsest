# G10-G2 — Delivery

Baseline `main` @ `a76bc3e`. Branch `experiment/g10-g2-epistemic-continuity`.

Gates: `git diff --check` clean; focused suite 7 passed; unit **93 files / 817
tests**; build + build:web pass; e2e 21 passed (documented flake protocol).

Machine proofs G2-M01..M14 (`test/g2_epistemic_continuity.test.ts`):
hypothesis≠claim (M01); parent same campaign (M02); cycles impossible/unknown
parent rejected (M03); contradicted hypothesis retained (M04); append-only
observation history (M05); no evidence body duplication (M06); revision
requires observation (M07); no setBelief (M08); non-monotonic
supported→contradicted→inconclusive→stale (M09); STALE observation (M10);
unknown evidence aborts with no partial write (M11); WorkerReport≠Evidence
(M12); deterministic replay (M13); deterministic digest (M14).

Verdict:

```text
G10-G2 EPISTEMIC CONTINUITY: PASS
```
