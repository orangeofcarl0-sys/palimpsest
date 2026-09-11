# PAL-FED-0E Delivery Report

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0e` (child of the PAL-FED-0D line).

## Headline

A pre-registered 32-run (+4 symmetry) controlled behavioral study with **36/36
valid runs** and mechanically verified treatment isolation found that the §41
dependency criterion **does not increase useful peer initiation** (clear-dependency
contact was already 6/6 without it) and **does not reduce unnecessary contact**
(local-decision contact was 50% C0 vs 67% C1). Verdict: **revise/reject the
current criterion**, retain the mechanical federation. Negative evidence, not
failure.

## §73 required answers

1. **Valid runs executed:** 36 (32 primary + 4 symmetry).
2. **Invalid/infrastructure runs:** 0.
3. **Run order randomized:** yes; seeded (20260911), full order committed in
   `evidence/pal-fed-0e-run-manifest.json` **before** any scored run.
4. **Independent workspaces/sessions/fabrics:** yes — fresh coordination DB,
   fabric id, session ids, inbox/event/contract state per run; immutable
   git-archive snapshots of Palimpsest `59fae6e` and Ordarium `073409b`; the
   minimal host exposes no write/fs tools, so no run can contaminate the next.
5. **C0/C1 model-visible difference isolated:** yes — control planes differ only
   in `federation/dsh/instructions.*`; real prompt assembly shows the tools are
   identical and only the `pal-fed:peer-collaboration` section differs
   (`evidence/pal-fed-0e-prompt-capture.json`).
6. **D1 contact rate, C0:** 100% (6/6), Wilson [61%, 100%].
7. **D1 contact rate, C1:** 100% (6/6), Wilson [61%, 100%].
8. **D0 contact rate, C0:** 50% (3/6), Wilson [19%, 81%].
9. **D0 contact rate, C1:** 67% (4/6), Wilson [30%, 90%].
10. **DA behavior:** C0 100% (4/4), C1 75% (3/4); reported separately, not pooled.
11. **Did C1 increase useful initiation?** No. Δ(D1) = 0.00; Fisher exact p = 1.0.
12. **Did C1 increase unnecessary contact?** It did not reduce it; D0 rose from
    50% to 67% (n=6 per cell — not a significant difference, but no benefit).
13. **How scenario-dependent?** Strongly: D1 saturated in both arms across three
    distinct scenarios; D0 varied by scenario (canvas-policy always contacted;
    test-layout/cli-flag mixed).
14. **Did O→P symmetry hold?** Directionally yes at n=1/cell: O→P dependency
    1/1 both arms; O-local 0/1 (C0) and 1/1 (C1). Not a rate.
15. **Autonomous receipt rate:** 100% (29/29) of contacted runs.
16. **Autonomous response rate:** 93% (27/29).
17. **Reply-delivery rate:** 90% (26/29).
18. **Ack rate:** 24% (7/29).
19. **Handled-but-unacked rate:** 72% left a pending batch after the responder
    went idle.
20. **Contract-use rate:** 59% (17/29) of contacted runs touched a contract.
21. **Bilateral agreement rate:** 0% (0/29); the maximum acceptances in any run
    was 1.
22. **Mean/median event count:** 1.56 / 2 per run (max 3).
23. **Any status chatter?** No — 0 status/pure-ack events.
24. **Any full-plan/context leakage?** No plan dumps; however 21/36 runs
    contained an event over 2000 chars (max ≈3.7 KB) — moderate verbosity.
25. **Wake latency:** change→wake median 977 ms, wake→inbox-read median 1104 ms,
    change→response median 28.3 s.
26. **Was 2 s polling adequate?** Yes; end-to-end latency was model-dominated.
27. **Was a new Ordarium primitive needed?** No — consistent with the 0D peer
    decision; nothing in the data shows polling friction.
28. **Which concepts gained evidence?** Pending-batch + ack mechanics, DSH-native
    wake, agent-scoped peer authority (`Thread` as a read view was used in 86% of
    contacted runs; contracts are commonly *touched*).
29. **Which lost evidence?** The §41 criterion as a contact selector; the
    8-kind event taxonomy (3 kinds never used); contract acceptance as a
    routinely needed step.
30. **What should G10-A0 consume?** See `PAL-FED-0E-G10-A0-INPUT.md`.

## Evidence artifacts

| Artifact | Path |
|---|---|
| Frozen scenarios | `docs/engineering/experiments/PAL-FED-0E-SCENARIOS.json` |
| Frozen treatment manifest | `evidence/pal-fed-0e-treatment-manifest.json` |
| Treatment isolation proof | `evidence/pal-fed-0e-treatment-isolation.json` |
| Effective prompt capture | `evidence/pal-fed-0e-prompt-capture.json` |
| Frozen run manifest (order) | `evidence/pal-fed-0e-run-manifest.json` |
| Run ledger (36 records) | `evidence/pal-fed-0e-runs.jsonl` |
| Analysis + tables | `evidence/pal-fed-0e-analysis.json`, `evidence/pal-fed-0e-tables.md` |
| Per-run raw evidence | `F:/Codex_Work_Space/pal-fed-0e/runs/<runId>/` (result.json, coordination.sqlite, DSH session logs) |

## Honest limits

- Small n (2 per primary cell); wide Wilson intervals.
- Confounds: C0 still carries ambient collaboration guidance; prompts end with
  "record your conclusion" (a plausible posting cue, reported post-hoc, manifest
  not rewritten); the minimal host gives no repository-read tools.
- One model/provider (`deepseek-official/deepseek-flash`), no honored seed.
- Symmetry probe is a directional check, not a rate.

## Software regression gates (§70/§71)

Local: `pnpm run clean`, `build`, `build:web`, `test` (66 files / 475 tests,
unchanged) all green; `test:e2e` **21/21** with Playwright `retries = 0`.

Remote CI (draft PR #3): `unit => success`; `e2e => failure` on the already
characterized pre-existing `E2E-DEBUG-01` / `runtime-debugger.spec.ts:56`
visibility flake (20/21). This batch's only server change is
`src/federation/dsh/watcher.ts` (observability), which the e2e kernel never
imports; the flake is recorded, not retried away, and remains nondeterministic
across runs (it passed locally at this HEAD).

## Stop rule (§76)

All stop conditions met except where explicitly noted: C0/C1 frozen and
isolation-verified; scenarios frozen before outcomes; ≥8 primary scenarios;
≥2 replicates per scenario per treatment; fresh sessions/fabrics/workspaces;
randomization recorded; all valid outcomes retained (no retry-to-success); rates,
false contact, ack, contract, latency and symmetry measured; analysis and the
G10-A0 memo written; regression gates recorded.

Not started, by instruction: G10-A implementation, PAL-FED-1, dynamic discovery,
N-agent federation, automatic organization graph, new Ordarium primitive, ack
guard implementation.
