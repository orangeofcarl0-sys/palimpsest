# PAL-FED-0H Delivery Report

Status: EXPERIMENTAL / PROVENANCE BEHAVIOR STUDY / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0h` (child of PAL-FED-0G at `b310f96`).

## §79 answers

1. **0G C ground truth re-audited:** yes — `PAL-FED-0G-C-REAUDIT.md`.
2. **Was `C-behavior-conflict` irreducible?** No, it is version/temporal-scope
   resolvable (V): the "historical record" is an authority/alignment document,
   the decision concerns the current pinned integration, and the repo records
   manifest/pinned-contract precedence. The 1.2.0 release has no
   cursor-invalidation error at all, so the prompt premise was unsupported.
3. **0G conclusions downgraded:** yes — the "conflict/provenance is the surviving
   failure" interpretation is withdrawn (dated addenda; raw data unchanged).
   `C-release-authority` 9/9 contact remains correct.
4. **Valid/invalid 0H runs:** 96 / 0.
5. **Scenario labels mechanically validated:** yes — the linter passes (V unique
   applicability, L precedence present, I current+normative conflicts with no
   policy and a responder resolution, N single-source, sidecars leak-free).
6. **Run order frozen/randomized:** yes, seed 20260911.
7. **H0/H1 isolation:** only the compiled guidance differs; prompt capture shows
   only the `pal-fed:peer-collaboration` section differing.
8. **H1/H2 metadata isolation:** same artifact bytes (H2 loads the H1 artifact);
   only the model-visible provenance sidecar differs, injected via the repo
   tool's `provenance` field with an identical schema in all arms.
9. **V specificity:** 100% in H0, H1, H2.
10. **L specificity:** 100% in H0, H1, H2.
11. **I recall:** H0 33% (3/9); H1 0%; H2 0%.
12. **Precision:** H0 100%; H1/H2 n/a (no contacts).
13. **Local adjudication accuracy (V/L):** H0 44%, H1 50%, H2 33%.
14. **Silent collapse (I):** H0 67%, H1 100%, H2 89%.
15. **Unnecessary escalation (V/L):** 0% in every arm.
16. **H1 prose lift (I recall):** −0.33.
17. **H2 provenance lift (I recall):** 0.00.
18. **Did H2 preserve V/L specificity:** yes, 100%.
19. **Did structured provenance cause over-contact:** no; it also produced no
    acknowledgement of unresolved conflict (cautious 11%).
20. **Did agents inspect provenance-bearing sources:** not separately
    instrumented; repo inspection was universal (28–32 calls/run).
21. **Did peers resolve I conflicts autonomously:** only when contacted (H0, 3
    runs): receipt/response/reply-delivery 3/3 with zero human messages.
22. **Ack rate:** 100% (3/3).
23. **Thread usage:** 0/3.
24. **Contract use/agreement:** 0% / 0%.
25. **Event kinds:** decision 3, evidence 2, question 1; `constraint` /
    `change_ready` / `blocker` unused again.
26. **Message size:** small; no >2 KB events observed.
27. **Polling latency:** transport unchanged from 0G (change→wake ≈0.95 s).
28. **New Ordarium primitive:** no.
29. **Concepts to demote:** structured provenance metadata; `BoundaryContract` as
    core; the 8-kind taxonomy; "conflict alone warrants contact".
30. **What G10-A0 should consume:** `PAL-FED-0H-G10-A0-INPUT.md`.

## Evidence index

`PAL-FED-0H-SCENARIOS.json` (hidden scoring manifest) ·
`evidence/pal-fed-0h-run-manifest.json` · `evidence/pal-fed-0h-runs.jsonl` (96) ·
`evidence/pal-fed-0h-runs/<runId>.json` · `evidence/pal-fed-0h-analysis.json` ·
`evidence/pal-fed-0h-tables.md` · frozen fixtures/sidecars under
`F:/Codex_Work_Space/pal-fed-0h/` (snapshots, resolver, provenance) ·
`tools/pal-fed-0h-build-fixtures.mjs` · `tools/pal-fed-0h-validate-scenarios.mjs`.

## Regression gates

`pnpm build` and `pnpm test` (66 files / 475 tests) green. `pnpm test:e2e` was
20/21 locally on this run — the known pre-existing, nondeterministic
`E2E-DEBUG-01` / `runtime-debugger.spec.ts:56` visibility flake (retries remain
0; remote CI recorded on the draft PR). This batch adds only experiment tooling
and the 0H guidance text.

## Not started (§80)

PAL-FED-1, G10 implementation, production provenance schema, authority registry,
source precedence service, contact budget, ack guard, new Ordarium primitive.
