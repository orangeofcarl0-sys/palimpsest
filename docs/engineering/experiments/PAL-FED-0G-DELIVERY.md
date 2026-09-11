# PAL-FED-0G Delivery Report

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0g` (child of the PAL-FED-0F line at `d1bb38c`).

## Headline

With three arms (G0 mechanism-only / G1 local-first / G2 qualified sufficiency)
and 96 valid runs, **G2 is behaviorally indistinguishable from G1** on every
measured dimension (AuthorityRecovery = FreshnessRecovery = ConflictRecovery =
SpecificityRetention = 0.00), because the F/U classes saturated at 100% recall
even in G0 — the design had no headroom to detect G2's added wording. The clean,
replicated effect remains **G1's specificity gain on pinned-contract cases**
(33% → 0% contact). The one genuine unsolved failure is **conflict/provenance**:
`C-behavior-conflict` contacted **0/9 in every arm**.

## §79 required answers

1. **Valid/invalid runs:** 96 / 0.
2. **Treatment artifacts isolated:** yes — only the compiled guidance selector
   differs; prompt assembly shows 3 distinct guidance-section hashes with
   identical tools.
3. **Fixtures coherent:** yes — audited before runs (base 1.3.1 declared===
   installed; stale 1.2.0 declared===installed; peer workspace has no local
   @ordarium install).
4. **Run order frozen/randomized:** yes — seed 20260911, manifest frozen before
   the first scored run.
5. **Did all runs inspect local evidence:** yes — 100% in every class and arm;
   premature contact 0% everywhere.
6. **G0 S/P specificity:** S 100%, P 67%.
7. **G1 S/P specificity:** S 100%, P 100%.
8. **G2 S/P specificity:** S 100%, P 100%.
9. **G0 F recall:** 100%.
10. **G1 F recall:** 100%.
11. **G2 F recall:** 100%.
12. **G0 U recall:** 100%.
13. **G1 U recall:** 100%.
14. **G2 U recall:** 100%.
15. **C-class behavior:** 50% in every arm; split by scenario —
    `C-release-authority` 3/3 contact all arms, `C-behavior-conflict` 0/3 all arms.
16. **AuthorityRecovery (G2−G1):** 0.00.
17. **FreshnessRecovery (G2−G1):** 0.00.
18. **SpecificityRetention (G2−G1):** 0.00.
19. **Scenarios dominating failures:** `C-behavior-conflict` (9 of 9 misses
    required-contact); G0's 2 misses are over-contacts on `P-pinned-cursor`.
20. **Did G2 recover 0F's missed authority cases:** there was nothing to recover —
    U was 100% in all arms here, unlike 0F's 56% R recall; the 0F loss did not
    reproduce once the authority frame was explicit in the prompt.
21. **Did G2 create new over-contact:** no (S/P specificity 100%).
22. **Was evidence qualification observable in rationales:** partially —
    rationales distinguish version-scoped from current/future claims in the F/U
    contacts; no structured qualification was required. Qualitative, not scored.
23. **Ack rate:** 70%; pending after idle 24%.
24. **Contract use:** touched 14%, bilaterally agreed 2%.
25. **Thread use:** 52%.
26. **Event-kind distribution:** question 37, decision 29, evidence 22, need 11,
    proposal 2; `constraint` / `change_ready` / `blocker` unused (third study).
27. **Message size:** mean 1.05 events/run; 66 events > 2 KB, 35 > 4 KB, max
    6 742 chars.
28. **Polling latency:** change→wake 953 ms, wake→inbox 924 ms,
    change→response 56.3 s — 2 s polling adequate.
29. **New Ordarium primitive needed:** no.
30. **What should G10-A0 consume:** see `PAL-FED-0G-G10-A0-INPUT.md` —
    carry forward the local-first principle and its specificity benefit; do not
    promote the G2 wording; treat conflict/provenance as the open problem;
    demote BoundaryContract and the 8-kind taxonomy.

## Evidence index

| Artifact | Path |
| --- | --- |
| Frozen scenarios | `docs/engineering/experiments/PAL-FED-0G-SCENARIOS.json` |
| Treatment manifest | `evidence/pal-fed-0g-treatment-manifest.json` |
| Isolation proof | `evidence/pal-fed-0g-treatment-isolation.json` |
| Prompt capture | `evidence/pal-fed-0g-prompt-capture.json` |
| Run manifest (order) | `evidence/pal-fed-0g-run-manifest.json` |
| Run ledger (96) | `evidence/pal-fed-0g-runs.jsonl` |
| Per-run machine results | `evidence/pal-fed-0g-runs/<runId>.json` |
| Analysis + tables | `evidence/pal-fed-0g-analysis.json`, `evidence/pal-fed-0g-tables.md` |
| Raw evidence (local) | `F:/Codex_Work_Space/pal-fed-0g/runs/<runId>/` (result.json, coordination.sqlite, DSH session logs) |

## Provenance note

`expectedContact` is ground truth from the frozen run manifest; the runner did
not emit it initially, so the analysis annotates each ledger record by `runId`
from the manifest (runner fixed for future runs). No behavioral outcome was
changed or re-run.

## Regression gates (§76)

Local: `clean`, `build`, `build:web`, `test` (66 files / 475 tests) and
`test:e2e` with Playwright `retries = 0`. The known nondeterministic
`runtime-debugger` E2E flake is recorded, never retried away. Remote CI is
recorded separately on the draft PR.

## Not started (§80)

PAL-FED-1, G10 implementation, authority/evidence schema, contact budget,
interest graph, ack guard, new Ordarium primitive.
