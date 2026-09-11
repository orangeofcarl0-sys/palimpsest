# G10-A0 — Delivery Report

Status: **DRAFT · EVIDENCE-GROUNDED · NOT UAS FROZEN · NO PRODUCTION SCHEMA COMMITMENT**

Branch: `experiment/g10-a0-evidence-grounded-semantic-rebase`, based on `main`
(`59fae6e`). Docs-only.

## Answers (30)

1. **Was PAL-FED-0I closed consistently?** Yes. Stage 0 reconciled the docs on
   `experiment/pal-fed-0i`; closure commit `b4a0334`
   (`docs(pal-fed-0i): reconcile final semantic rubric and interpretation`).
   PR #7's body was updated. No runtime behaviour, statistics or raw evidence
   were changed — textual interpretation only.
2. **What was corrected in the stale 0I semantic claim?** The claim "the three
   A2 owner-participated resolved admissions were all semantically incorrect"
   was replaced by **1 `SEMANTICALLY_CORRECT` / 2 `SEMANTICALLY_INCORRECT`**
   (the rubric correction re-scored `I1-…-A2-r1`). Corrected in
   `PAL-FED-0I-ANALYSIS.md`, `-DELIVERY.md`, `-G10-A0-INPUT.md`, the assessment
   headline, PR #7, and the experiments index.
3. **Was the G10 branch based cleanly on `main`?** Yes:
   `experiment/g10-a0-evidence-grounded-semantic-rebase` from `main` at
   `59fae6e`. Verified before branching; `main` is unchanged.
4. **Were experimental code branches kept out?** Yes. PAL-FED branches are
   consumed **by reference** (`git show`/`log`/`diff` + committed reports). No
   federation runtime code, type, tool, schema or primitive was cherry-picked.
5. **Which PAL-FED experiments were consumed?** `0`@`2c7a63c`,
   `0-dsh`@`c0718c9`, `0e`@`bae56f9`, `0f`@`d1bb38c`, `0g`@`b310f96`,
   `0h`@`d75b59b`, `0i`@ closure `b4a0334`.
6. **Which principles are machine-proven?** `PeerRef ≠ DshAgentId ≠ SessionId`;
   `Wake ≠ Ack`; agent-scoped authority (subagent does not inherit peer
   authority); ticket state as a derived projection (restart reconstruction);
   the admission-guard construction; `Thread = View(CollaborationEvents)`;
   `EpistemicAdmission ≠ EffectAdmission` boundary; the ground-truth audit that
   withdrew 0G's C interpretation.
7. **Which are behaviourally observed?** Runtime relation formation without a
   predefined edge; one-shot intervention inducing recovery (9/9 tested I runs);
   abstention as a chosen exit; owner participation being insufficient for
   correctness (1/3 correct, 2/3 incorrect); local conflict adjudication; weak
   natural use of `BoundaryContract`.
8. **Which have statistical support?** 0E's dependency criterion failing as a
   selector; 0F/0G local-first specificity (with a recall cost); 0H V/L
   specificity 100% and silent collapse of irreducible conflicts; 0I's
   A2−A1 contact lift of 0.00 and non-significant abstention difference
   (p=0.637). All are small-n, single-model, partly synthetic/oracle-fed.
9. **Which were rejected?** §41 dependency criterion as a selector; structured
   provenance sidecar as the cure (tested form); `BoundaryContract` as minimal
   core; the 8-kind event taxonomy as ontology; `Thread` as canonical state;
   owner participation as truth proof or as sufficient for correctness; hard
   gate as *necessary* for behavioural recovery; `decision_submit` as a
   production interface; a new Ordarium wake primitive (no evidence → DEFER).
10. **Which remain open?** Automatic conflict detection; verification policy /
    admission of verified knowledge; authority representation; production
    epistemic-admission interface; production provenance schema; organization
    memory; dynamic peer discovery / N-peer federation; group/Holon
    realization; attention-scheduler implementation; commitment semantics.
11. **Is `PersistentPoint` now distinguished from `AgentDefinition`?** Yes, as a
    semantic distinction (`≠ AgentDefinition ≠ Activation ≠ DSHSession`), not a
    frozen schema; binding them is left as a design question.
12. **Is `PersistentPoint` distinguished from DSH runtime identity?** Yes:
    `PeerRef ≠ DshAgentId ≠ DshSessionId`; DSH owns runtime carrier identity and
    lifecycle, Palimpsest owns stable collaboration identity.
13. **Is `UserFocus` distinguished from `AuthorityRoot`?** Yes, promoted: user
    focus is the current interaction/attention locus, not management/authority
    over peers.
14. **Is WorkGraph kept separate from Organization/Collaboration graphs?** Yes:
    `LocalWorkGraph ≠ OrganizationGraph ≠ CollaborationGraph`; the four graph
    layers are documented and must not automatically share one canonical schema.
15. **Is `WorkerReport` kept separate from `Evidence`?** Yes, promoted;
    admission/governance remains a distinct step, and event arrival is not
    automatic truth admission.
16. **Is `PolicyAdmission` kept separate from `TruthVerification`?** Yes,
    promoted with 0I evidence.
17. **Is `EpistemicAdmission` separated from `EffectAdmission`?** Yes; epistemic
    admission is Palimpsest-side, effect admission stays Ordarium-side.
18. **Is `BoundaryContract` excluded from Minimal Core?** Yes — demoted to an
    optional higher-level collaboration mechanism; not deleted from experimental
    branches, not promoted to canonical.
19. **Is the strong 8-kind taxonomy excluded from canonical ontology?** Yes;
    direction favours generic immutable boundary event + optional lightweight
    kind + references.
20. **Is `Thread` still only a derived view?** Yes: `Thread = View(CollaborationEvents)`,
    never a table or canonical state.
21. **Is `definition_id` meaning unchanged?** Yes: Work/Task
    Definition lineage; not reused for `AgentDefinitionId`, `PersistentPoint`,
    `PeerRef` or `ArchitectureDefinition`.
22. **Is current `AgentGraph` still WorkGraph/task-bearing?** Yes; it is not
    reinterpreted as an AgentDefinition or organization graph. Rename/adaptation
    is deferred and terminology-only.
23. **Were frozen historical docs preserved?** Yes. PLMP-UAS-0, AGT-0 and PAG-0
    are not edited; G10-A0 refines some assumptions and says so explicitly.
24. **Were any production schemas changed?** No. No SQLite, migration, event,
    ProjectIR, scheduler or GraphPatch changes.
25. **Was Ordarium untouched?** Yes; no Ordarium work of any kind.
26. **Was DSH runtime code untouched?** Yes; no DSH modification and no
    dependency upgrade.
27. **Which exact questions remain open for later implementation?** Conflict
    detection algorithm; verification-admission architecture; authority
    representation; production epistemic-admission API; provenance schema;
    organization-memory schema; `Invocation`/`Participation` intersection;
    dynamic agent promotion workflow; typed patch unions; capability/provider
    binding schema; dynamic discovery; Holon persistence; attention scheduling;
    commitment protocol.
28. **Is automatic conflict detection still unsolved?** Yes — 0I used oracle
    fixtures (`conflictDetection="oracle_fixture"`); detection remains the
    prerequisite for any production admission layer.
29. **Is production epistemic admission still unsolved?** Yes;
    `decision_submit` and the gate were experiment-only instruments.
30. **What is the recommended next stage?** **A — refine this semantic rebase
    into a later UAS revision**, optionally with one narrow **B** design stage
    for automatic conflict detection. Do not default to coding.

## Evidence index

- `docs/engineering/G10-A0-EVIDENCE-GROUNDED-SEMANTIC-REBASE.md` (primary)
- `docs/engineering/G10-A0-EVIDENCE-MATRIX.md` (evidence classes, provenance,
  decision ledger)
- `docs/engineering/README.md` (index updated; old rows preserved)
- PAL-FED reports referenced by branch@tip in the matrix (no code inherited)

## Gates

- `git diff --check` — clean.
- Docs-only diff: `docs/engineering/` only; no `src/`, `web/`, `packages/`,
  schemas or migrations.
- Repository unit suite (`pnpm test`) — **60 files / 433 tests passed**, matching
  the `main` baseline (G9-G: 60/433). No test was added or changed.

## PR / remote status

A draft PR to `main` is opened for this branch. Remote CI status is recorded
honestly from the observed run(s); no success is fabricated. This PR does not
depend on merging the experimental PRs #1–#7.
