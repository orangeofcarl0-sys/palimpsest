# PAL-FED-0I Delivery

Status: EXPERIMENTAL / EPISTEMIC ADMISSION STUDY / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0i` (child of PAL-FED-0H at `d75b59b`). Draft PR #7.

## Answers (30)

1. **Assessment amended A/B/C:** yes — A1 redefined as a one-shot soft gate,
   owner participation ≠ semantic resolution, ticket state is a projection.
   Committed first, before the runtime (`c87d16f`).
2. **Valid / invalid runs:** **96 / 0**. All 96 reached an admitted disposition;
   no run needed the completion reminder.
3. **Oracle conflict tickets:** implemented as a projection from the frozen
   hidden manifest; every record carries `conflictDetection="oracle_fixture"`.
   Palimpsest did not detect conflicts.
4. **Ticket state:** `NONE / OPEN / CONSULTING / OWNER_RESPONSE_RECEIVED`,
   derived from manifest + durable events; no mutable ticket table or second
   truth store.
5. **`decision_submit`:** Option B; experiment-only, Agent-scoped, identical
   name/description/schema/effect in A0/A1/A2. Trusted run/ticket/peer/owner/mode
   are host-bound; the model supplies only `disposition` and `body`.
6. **Isolation:** one artifact (`frozenCodeSha256=92a8d2cc…`) for all arms;
   identical guidance text and tool surface; the first A1/A2 intervention
   response is **byte-identical** (`evidence/pal-fed-0i-treatment-isolation.json`).
7. **Machine proof:** ADM-A00…A10, projection, restart reconstruction (attempt
   log and durable events alone), model-spoof, false-block/unsafe-admission
   invariants — green.
8. **Fake-model integration:** Fakes 1–5 green through a real DSH agent.
9. **Real-model smoke:** I/A2 green — resolved → deterministic refusal →
   continued turn → observable recovery (owner contact; one replicate abstained).
10. **Manifest:** 96 runs (10 primary ×3 arms ×3 + 2 symmetry ×3), randomized,
    seed 20260911, frozen before outcomes.
11. **Fresh state per run:** fresh DB, fabric, sessions, peer event state,
    admission log and workspace copies.
12. **No retry-to-success:** yes. All behavioural outcomes, including repeated
    blocks and unsupported-basis attempts, are retained.
13. **`FalseBlockRate_{V+L+N}`:** **0** (0/21 per arm). V/L/N/SO-V never blocked.
14. **`UnsafeResolvedAdmissionRate_{I,A2}`:** **0**. No A2 resolved admission
    without owner participation.
15. **A0 baseline (I):** resolved directly 8/9 (89%), unresolved directly 1/9
    (11%), contact before first submission 1/9, no submission 0/9.
16. **A1 first unsafe resolved / intervention:** 9/9 (100%).
17. **A1 owner contact after intervention:** 9/9 (100%).
18. **A1 explicit unresolved:** 4/9 (44%); owner participation 4/9 (44%).
19. **`OneShotRecoveryRate_A1`:** **100%** (9/9) — every Agent contacted the
    owner or abstained before any further resolved submission.
20. **A2 first unsafe resolved / intervention / contact after:** 9/9 / 9/9 /
    9/9 (100%).
21. **A2 owner participation 67% (6/9); explicit unresolved 67% (6/9);**
    policy-admissible resolved 33% (3/9) versus A1 56% (5/9) and A0 89% (8/9).
22. **`AdmissionInducedContactLift` (A2−A1):** **0.00** (Fisher p = 1.000). A1
    already saturates contact.
23. **`DeadEndRate_A2`:** **0%**; final admitted disposition 100%. No deadlock.
24. **Repetition:** A2 repeated-block ≥2 = 22% (2/9); repeated resolved attempt
    A1 56% / A2 44%; gate-bypass attempt A1 11% / A2 22%.
25. **Unsupported resolution basis:** 1/9 (A1), 2/9 (A2) under a coarse
    detector; the flagged sentences are quoted in the analysis, and two cite an
    owner-provided spec revision (possibly legitimate). Corrections disclosed.
26. **Post-intervention first action:** A1 contact 78% / inspection 22%;
    A2 contact 100% / inspection 0%. No blind resubmission (0 repeat-resolved,
    0 invented precedence) as the *first* move.
27. **Latency (median ms, I):** A0 start→submit 118.9k; A1 110.9k; A2 96.9k.
    Intervention→admitted A1 74.6k / A2 57.6k; intervention→owner contact A1
    9.4k / A2 6.8k. A2 was not slower end-to-end in this sample (small n).
28. **Submission-attempt distribution (I):** A0 all 1; A1 all 2; A2 7×2, 1×3,
    1×5. No persistent-resubmission storm.
29. **Policy vs semantic:** the three A2 owner-participated resolved admissions
    were **all `SEMANTICALLY_INCORRECT`**. Semantic correctness did not improve
    with enforcement (A0 4/9, A1 3/9, A2 1/9 correct). This is empirical
    `AdmissionPolicy ≠ TruthVerification` (Possible Result E).
30. **Hypotheses:** H1 supported (A1 100% vs A0 11% recovery); H2 **not
    supported on contact** (100% vs 100%) and only directionally on abstention
    (67% vs 44%, p=0.637, underpowered/ceiling-bound); H3 supported (no V/L/N
    regression); H4 supported (above). Pattern: **B (one-shot is enough) + E
    (participation ≠ verification)**; C (deadlock) not observed. G10-A0 should
    consume `PAL-FED-0I-G10-A0-INPUT.md`.

## Evidence index

- `docs/engineering/experiments/PAL-FED-0I-ASSESSMENT.md` (seam audit + amendment)
- `docs/engineering/experiments/PAL-FED-0I-SCENARIOS.json` (hidden scoring manifest)
- `docs/engineering/experiments/PAL-FED-0I-ANALYSIS.md`
- `evidence/pal-fed-0i-run-manifest.json`, `pal-fed-0i-runs.jsonl`, `runs/`
- `evidence/pal-fed-0i-analysis.json`, `pal-fed-0i-tables.md`
- `evidence/pal-fed-0i-treatment-isolation.json`
- `test/federation_admission.test.ts`, `tools/pal-fed-0i*.mjs`

## Regression gates

- `pnpm run clean` / `pnpm build` / `pnpm build:web` — pass.
- `pnpm test` — **496 passed / 0 failed** (67 files), including the 21 new
  admission tests.
- `pnpm test:e2e` (Playwright `retries = 0`) — **20 passed, 1 failed**:
  `E2E-DEBUG-01` (`e2e/runtime-debugger.spec.ts:56`, `liveNode` unexpectedly
  hidden). Re-run in isolation: **passes**. This is the known historical
  nondeterministic flake, unchanged from PAL-FED-0F/0G/0H; 0I modifies no
  `dist/web` or non-federation source, so it is not caused by this batch. It is
  recorded, not repaired, and retries stay 0.

## Not started (§97 stop rule)

No PAL-FED-1, no G10 implementation, no production epistemic admission, no
automatic conflict detection, no authority registry, no verification engine, no
new Ordarium primitive. 0H results and the frozen manifests are unchanged.

## Remote CI note

Pushed to `experiment/pal-fed-0i`; remote CI status recorded on the PR. If the
environment cannot observe remote CI, this states local green / remote
unverified rather than fabricating a green.
