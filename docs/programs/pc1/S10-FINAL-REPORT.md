# PC1 — Final delivery report

## 1. One accurate verdict

**Implementation is substantially complete and deterministically qualified. Eight matched real-model
sessions were run with zero provider errors; actual behavior is now observed. Palimpsest is not
superior overall: it is stronger on provenance/negative-standing, while the strong native DSH +
Git/Markdown condition is cheaper on Sablewick and more complete on the field study.**

| Judgment | Result |
|---|---|
| Engineering functions implemented | `IMPLEMENTATION_COMPLETE_WITH_DECLARED_GAPS` — the normal product path, review/authority, continuity, domain outcomes, runtime doctor, evaluation runners and packaging exist and are exercised by deterministic tests; declared gaps are listed below |
| Mechanism and integration qualified | `DETERMINISTICALLY_QUALIFIED_WITH_ENVIRONMENT_LIMITS` — build PASS, architecture PASS (0 violations, 9 accepted baseline exceptions), public API PASS after the recorded additive baseline update, curated PC1/adjacent integration 134/134 PASS; the full ordinary suite was not cleanly observed on this Windows host (resource/file-lock hook timeouts), and one first-party-DSH test fails identically at the frozen baseline |
| Actual Agent ability verified | `BEHAVIORALLY_OBSERVED` — 8 matched real sessions (Sablewick P/F T1/T2, field-study P/F T1/T2), all `OBSERVED`, 0 provider errors, 11,533,565 scored tokens; single-principal only |
| Comparative value supported | `NOT_SUPPORTED` — mixed results: P has stronger provenance/negative-standing; F is cheaper on Sablewick and more complete/accurate on the field study. No superiority claim |

## 2. What a user can now do (normal path)

- `palimpsest init` creates the state stores, product profile and (with `--goal`) the first project.
- `palimpsest continue` returns the current understanding: accepted-for-purpose facts, candidates,
  negative findings, open questions, pending work, blocked effects and legal next actions.
- `palimpsest context-capsule` renders the same projection under a hard byte budget.
- `palimpsest review list|preview|approve|reject|request-changes|apply` lets an operator decide and
  apply an exact proposal; a model cannot decide or apply.
- `palimpsest outcomes contracts|project|evaluate` records an explicit domain-contract result.
- `palimpsest recover` runs the existing promotion reconciliation; it does not fabricate success.
- The model-facing normal tier is `palimpsest_work`, `palimpsest_project`, `palimpsest_continuity`,
  `palimpsest_outcome`, plus composed collaboration/verification facades.
- The expert tier keeps the historical chain for compatibility and debugging.

This is exercised by `test/pc1_cli.test.ts` and `test/pc1_normal_product.test.ts`, not by a
script-only side door.

## 3. Git and implementation identity

| Fact | Value |
|---|---|
| Base | `044b08056a0e98b7d7cee207cb36fb7e453907fe` (tree `1b7caa156d187e952be8bd90e797f440cb7e2402`) |
| Branch | `palimpsest-product-convergence-v1` |
| Code Freeze 1 | `fa1a509458fb55d747df339e4f2a0cbbf0aa61fc` |
| Code Freeze 2 (public API baseline) | `e408864f0f352fdb7ac207cfae99a0652e39d351` |
| Code Freeze 3 (packaging dirty check) | `a4f2adb4914c66276f9252245c9b483c8ad4f8ad` / tree `3afbff420f36e6486bba7e8399b02c88eff990a2` |
| Code Freeze 4 (manifest generator) | `82b4d789feae38ee124b03ec27d6d94499f44826` |
| **Code Freeze 9 (final product executable)** | **`e8c7675205c74d33015966f3c5b62eec6e2279f1` / tree `e20d4c7682ac33aed9f2ae3e1bb5e2d185d7fcf8`** |
| Delivery/evaluation freeze | `bd34f96d7e22beebce44b773dcad2920e97752bb` / tree `409583a6f74f446184ad03314e4de36e59684143` |
| Evidence freeze | the commit containing this report; `manifest-code.json` / `manifest-evidence.json` record its exact hash |
| Protected `main` | `044330b2e55198542d545edc42ed9c36e7ce896b` — unchanged, never moved |

No force-push, rebase, branch deletion, worktree removal, lock removal, historical evidence rewrite,
PR, or main merge was performed. The local branch is pushed non-force only at the end.

### Production changes

- Result/report integrity: object-only export before the ledger append; full OID resolution; the
  uncertain promotion recovery test; product-produced structural evidence.
- Normal product path: tool tiers, `installProduct`, `palimpsest_work`, principal-safe status.
- Continuity: derived summary/explain/context capsule with standing and basis.
- Review/authority: non-authoritative proposal store, exact-digest operator decision, plan/source/
  intent application through existing owners, source-blob verification.
- Collaboration: handoff/receipt contracts, root-source independence, async lifecycle reducer.
- Domain outcomes: explicit contracts, three completion statuses, negative investigation.
- Runtime: doctor, usage accounting, budget gate, process-tree stop.
- Scenarios/runners: Sablewick and field-study staging, P/F equivalence, gated live runner.
- CLI/packaging: `init|continue|doctor|review|recover|outcomes|context-capsule`, local RC.

## 4. Per-requirement acceptance

`docs/programs/pc1/requirement-results.json` is the machine-readable matrix. It currently records
80 requirements, each with implementation, deterministic, live and comparison status, evidence
paths and notes. The live layer is now observed for the eight scored sessions; the comparison layer is
`NOT_SUPPORTED`, and the single-principal S05 collaboration path remains unexercised.

Declared gaps:

1. **S05 live collaboration** — the handoff/receipt contract exists and is tested, but it is not yet
   wired into the existing delegation return payload; neither condition used real independent
   subagents, so multi-agent synthesis is not claimed.
2. **S08 live matched pair** — the eight sessions were run and are recorded; the remaining limits are
   single-principal execution and the field-study P `VERIFYING` deadlock. No superiority was found.
3. **S09 real migration** — no canonical schema changed, so no migration was needed; the new review
   store is additive and non-canonical. A future schema change still needs the dry-run/backup/restore
   process.
4. **S10 PR** — the review kit exists; no PR was opened and main was not moved.

## 5. Two scenarios and the comparison

- **Sablewick**: C6-R staging reused; T1 inbox excludes Candidate B and the duplicate; T2 release
  includes both and changes the visible-set digest; P/F equivalence has 0 confounders; the oracle is
  not copied.
- **Field study**: P and F carry the same goal, six requirements, four tasks and source tree; T1 has
  no updates, T2 has the field validation, the operator-review budget directive and the newsletter;
  equivalence has 0 confounders; the oracle is not copied.
- **Live**: 8 real sessions, all `OBSERVED`, 0 provider errors. Sablewick: both conditions found
  Candidate A, preserved it as unaccepted, identified the Site B failure, and handled the corrected
  T2 candidate/duplicate; P used 2.85M tokens vs F 0.685M. Field study: both converted units,
  detected the Echo humidity bias, and treated the budget directive as a request; F produced the
  full plan/reviews/plan.json and correctly reported R4 missed, while P produced only the design
  artifact (VERIFYING blocked the other tasks) and made an R4 day-count error. Neither used
  independent subagents. Details: `S10-LIVE-ADDENDUM.md` and
  `research-evidence/pc1/live/outcomes.json`.

## 6. Engineering completeness and the one pre-existing failure

- Build: PASS.
- Architecture: PASS, 0 violations, 9 accepted baseline exceptions.
- Public API: PASS after the additive baseline update.
- Curated final integration suite: 17 files / 134 tests PASS (`final-integration.log`), including
  the PC1 tests, gate/acceptance/promotion/recovery/finish-integrity adjacency, composition-root
  rules, application parity and architecture ratchets.
- Full ordinary suite: a clean run was attempted, but this Windows host produced 86 failures under
  resource/file-lock contention (hook timeouts, `EPERM` on link creation, worktree cleanup timeouts).
  The run is preserved in `final-full-test-clean.log`; it is reported as NOT CLEANLY OBSERVED, not as
  a green suite. `test/trajectory_p2d1_real_integration.test.ts` was reproduced at the frozen
  baseline `044b080` with the baseline `dist` and reports `NOT_ESTABLISHED` there too (first-party DSH
  cold-recovery capability refusal, nonterminal attempt). No fabricated settlement was used.
- RC: `dist-rc/palimpsest-0.2.0-pc1.1.tar.gz`, SHA-256 recorded next to it, manifest over 3,946
  staged files; built from the delivery freeze `bd34f96`, `dirty:false`, and a doctor smoke from the
  extracted tarball passes. The tarball digest is `c0d5c5ec0c7d6ee6fc442aeae1f2b0382c2504183208a73600f72c8e254f5992`.
- Manifests: code and evidence manifests are generated from committed bytes; the evidence manifest
  is added in the evidence-freeze commit and does not hash itself.

## 7. Release candidate

The RC is local only (private package, no registry publication). It contains `dist/`, the product
CLI, examples, the PC1 docs/pack, the scenario staging runners and the evaluation acceptance script.
Install/upgrade/rollback limits are in `S09-PACKAGING.md`; the acceptance script is
`S09-USER-ACCEPTANCE.md`.

## 8. Main recommendation

**The implementation is valid, but the product's comparative value is unproven. The next step should
be one matched Sablewick P/F pilot under a NEW owner-approved budget window; do not claim
superiority, and do not expand the architecture, until that pair is observed.**

Rationale: the deterministic stages are in place and the normal path is usable, but the evidence
that would justify the governance/coordination cost is exactly the missing live pair. A negative or
equivalent result is a valid outcome and should narrow the default scope rather than trigger more
mechanism.
