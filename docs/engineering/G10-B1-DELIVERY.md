# G10-B1 — Delivery Report

Status: **G10-B1 · BINDING SCHEMA / INTERFACE CANDIDATE · DRAFT · NOT IMPLEMENTED · NOT FROZEN · NO PRODUCTION STORAGE COMMITMENT**

Topology: **stacked**. `experiment/g10-b1-binding-schema-candidate` from the
closed B0 HEAD `7435e48` (PR #12 still open); this PR targets
`experiment/g10-b0-binding-semantics-design`.

## Stage 0 — B0 closure (committed on PR #12, `7435e48`)

Closures A–D recorded in `G10-B0-BINDING-SEMANTICS-DESIGN.md` §5A and the B0
delivery: continuity optional with a first-class ephemeral path (Cases
E/P/R + preference); `BindingUnsatisfied` = unsatisfiable hard constraints +
valid run-scoped narrowing (absence of a point ≠ unsatisfied);
BindingDefinition/RunConfiguration precedence
(`Allowed(Effective) ⊆ Allowed(Definition)`, pin retarget only via a new
binding revision); `OneAuthoritativeDerivedBindingResolution`. Candidate
invariants `BIND-CAND-12..17` added. `git diff --check` clean; `pnpm test`
60/433.

## Answers (30)

1. **Was B0 continuity optionality explicitly closed?** Yes — Closure A.
2. **Is an ephemeral runtime path first-class?** Yes: `ContinuitySelection =
   {kind:"ephemeral"}` is a satisfied outcome; the default lifecycle
   `architecture + work → ephemeral → done` needs no continuity entity.
3. **When exactly does absence of a PersistentPoint produce
   `BindingUnsatisfied`?** Never by itself. Only when continuity is hard —
   `requirePersistent` or a `pin` — and no admissible locus exists
   (`no_matching_persistent_point`), or a pinned locus is unavailable or
   incompatible.
4. **Can persistent continuity be preferred but not required?** Yes —
   `preferPersistent` (soft); with no suitable point the ephemeral resolution
   remains valid (Example 4).
5. **Can resolution create a PersistentPoint?** No — no `createIfMissing` or
   equivalent exists; creation/promotion stays an intentionally open workflow
   (`BIND-CAND-09`).
6. **What does BindingDefinition own?** Durable binding intent: hard
   association requirements, durable continuity pins, stable preferences.
7. **What does RunConfiguration own?** Run-scoped selections, run-scoped
   preferences, temporary operating policy, run-scoped provider/model choices.
8. **What is the hard precedence rule?**
   `Allowed(EffectiveBindingRequest) ⊆ Allowed(BindingDefinition)`; level 1
   (hard constraints / durable pins) is non-overridable; levels 2–5 (run
   selections, run preferences, stable preferences, resolver tie-breaking) apply
   only within the hard-admissible space.
9. **Can RunConfiguration retarget a durable point pin?** No — the candidate
   has no such field (Bad E); changing durable intent requires a new
   BindingDefinition revision.
10. **Are stable vs run-scoped preferences distinct?** Yes — levels 3 and 4; a
    run-scoped preference may outrank a stable one; neither may violate hard
    constraints.
11. **Was one authoritative BindingResolution representation selected?** Yes —
    `OneAuthoritativeDerivedBindingResolution` (BIND-CAND-16); any other copy is
    a reference, digest-bound projection, or cache.
12. **Is BindingResolution standalone or embedded?** **Standalone** — immutable
    derived artifact (Option A; §7 of the schema candidate).
13. **How does ExecutionPlan reference it?** `ExecutionPlanBindingRef {
    bindingResolution: { resolutionId, digest } }` — and nothing else.
14. **Can BindingResolution contain SessionId?** No — `dshAgentId`,
    `dshSessionId`, `toolCallId`, `processId`, `currentAttemptId` are absent;
    runtime attachment is DSH-owned.
15. **Can BindingDefinition contain SessionId?** No (`BIND-CAND-10`).
16. **BindingDefinition identity/revision semantics?** New `BindingDefinitionId`
    namespace + `BindingRevision` + canonical `digest`; `schemaVersion` (shape)
    is separate from revision (instance); `definition_id`/`task_id`/
    `AgentDefinitionId`/`PersistentPointId`/`PeerRef` are never reused.
17. **BindingResolution freshness inputs?** Architecture, Work, Binding and
    RunConfiguration revision/digest refs plus the continuity/runtime
    observation snapshot ref (and optional resolver-policy id/version).
18. **Is BindingUnsatisfied a first-class result?** Yes —
    `BindingResolutionResult = BindingResolution | UnsatisfiedBindingResolution`,
    the unsatisfied side carrying the same provenance and machine-reviewable
    reasons.
19. **Minimum unsatisfied reason categories?** `hard_constraint_unsatisfied`,
    `pinned_target_unavailable`, `pinned_target_incompatible`,
    `no_matching_persistent_point`, `runtime_feature_unavailable`,
    `run_selection_conflict`, `stale_inputs` — no larger error ontology.
20. **How does legacy no-binding behavior remain compatible?**
    `NoBindingSpecified → LegacyEphemeralBindingBehavior` as a **semantic
    default** (`BindingDefinition` optional in the RunDefinition composition);
    no synthetic persisted object with fake identity.
21. **Does the schema require a PersistentPoint?** No — Case E is the default;
    `persistentPointId`-everywhere was explicitly rejected (Bad B).
22. **Is PeerRef required?** No — binding targets continuity identity; the
    `PeerRef ↔ PersistentPoint` relation stays frozen-open (Bad D).
23. **Can Binding grant authority?** No — no authority fields exist
    (`BIND-CAND-05`).
24. **Can Binding create organization/collaboration/commitment relations?** No —
    no org/peer/thread/commitment fields (`BIND-CAND-06`).
25. **Does Binding solve Invocation/Participation?** No — no
    `attemptOwner`/`invocationId`-style fields; that zone remains intentionally
    open and was firewall-audited.
26. **Are provider/model/tool/workspace facts owned unambiguously?** Yes —
    logical needs in Architecture/Work/binding intent; concrete selections in
    RunConfiguration delta + resolution; current Agent/Session in DSH runtime
    attachment (ownership table, schema candidate §5).
27. **Does any field duplicate AgentDefinition or WorkDefinition semantics?**
    No — Architecture/Work requirements are resolver inputs; BindingDefinition
    adds only association-specific constraints/pins/preferences (no duplicate
    requirements store).
28. **Did any production code/schema/storage change?** No — docs-only diff; no
    SQLite migration, store, resolver, PersistentPoint type, or `src/` change.
29. **Is the schema candidate ready for formal review?** Yes —
    **`SCHEMA CANDIDATE: READY FOR FORMAL REVIEW`**; all ten §95 paper proofs
    hold, the three targeted failure modes are structurally difficult, and the
    minimality gate removed every field without a failure-mode answer.
30. **Recommended next stage?** **A — G10-B2 Binding schema formal
    review/freeze** (same discipline as PLMP-UAS-1); a minimal compiler/resolver
    spike (option B) only after that review.

## Deliverables

- `docs/engineering/G10-B1-BINDING-SCHEMA-CANDIDATE.md` (primary contract)
- `docs/engineering/G10-B1-BINDING-CONTRACT-MATRIX.md`
- `docs/engineering/G10-B1-BINDING-EXAMPLES.md` (six examples + adversarial shapes)
- `docs/engineering/G10-B1-DELIVERY.md` (this file)
- `docs/engineering/README.md` + `docs/engineering/audits/G10-G11-ROADMAP.md`
  (additive)

No separate schema file was added: the code blocks in the primary document are
sufficient for review (§94), and a second copy would risk divergence.

## Gates

- `git diff --check` — clean; diff is `docs/engineering/` only.
- `pnpm test` — 60 files / 433 passed; `pnpm build`, `pnpm build:web` — pass;
  `pnpm test:e2e` — recorded from the observed run (Playwright `retries = 0`).
- Remote CI recorded from the observed run on this PR; not fabricated.
