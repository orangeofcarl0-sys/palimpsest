# G10-B3C — Binding Kernel Contract-Conformance Closure

Status: **CLOSURE COMPLETE**

Branch `experiment/g10-b3-minimal-binding-resolver-spike` (PR #15). Closure on
top of the initial spike HEAD `3880f42`. Frozen authority:
`BINDING-SEMANTIC-CONTRACT-v1.md` (PLMP-BIND-1) — **not edited**; no frozen
clause was contradicted, so no `G10-B3C-CONTRACT-CONTRADICTION.md` was needed.

Distinction recorded up front: the initial G10-B3 report claimed
`BINDING IMPLEMENTATION SPIKE: PASS` on executable adequacy; a subsequent
code-level contract review identified six narrow **implementation-conformance**
defects (`PLMP-BIND-1 executable adequacy: PASS` ≠ `current implementation:
conformant`). B3C reproduced each defect with a regression test on `3880f42`,
fixed only the implementation, and re-proved the contract.

## Closure ledger

| ID | Frozen requirement | Original implementation | Regression proof (failed on `3880f42`) | Fix | Result |
|---|---|---|---|---|---|
| BC-01 | PF-02 exact set equality: `BindingSubjects = ParticipatingArchitectureSubjects` (§6/§7) | `validateSubjectCoverage` checked only subset (participating ⊆ binding); extra binding subjects were silently ignored | `B3C-M01` "rejects an extra binding subject" — participating={A} with binding={A,B} resolved instead of throwing | centralized exact set-equality validation in `validateSubjectCoverage` (both directions, set semantics); resolver reuses it (§50); duplicate participants normalized to a set (§9) | CLOSED |
| BC-02 | frozen semantic reason priority: tier 0 pinned reasons → tier 1 capability → tier 2 continuity-absence (§11/§12) | `Object.freeze([...reasons].sort())` — lexical, not semantic | `B3C-M02` cross-tier test expected `[required_capability_unavailable, no_matching_persistent_point]` but got lexical `[no_matching_persistent_point, required_capability_unavailable]` | centralized `orderUnsatisfiedReasons` with an explicit `REASON_TIER` map; cross-tier order = frozen semantics, same-tier lexical order = deterministic implementation choice (the contract does not order the two pinned variants — §12) | CLOSED |
| BC-03 | `ResolutionProvenance` = the exact freshness basis (§15/§16) | explicit path verified only that `explicitDefinition` existed; `intentSource.binding` was never compared, so the resolver could resolve with definition B while recording A | `B3C-M03` wrong-id/wrong-revision/wrong-digest refs resolved instead of throwing | explicit mode now requires id+revision+digest coherence (`BindingConfigurationError` before resolution); implicit mode + `explicitDefinition` is rejected rather than silently ignored (§17); `compileBindingIntentSource` stays coherent (§19) | CLOSED |
| BC-04 | recorded resolver policy = actual executed policy (§20/§21) | `resolverPolicy` was optional and caller-controlled while the spike always ran `minimal.lexicographic@1` — provenance could be absent or lying | `B3C-M04` provenance omitted/different policy accepted | kept the caller field but validated: omitted ⇒ record `MINIMAL_RESOLVER_POLICY`; exact match ⇒ accept; any other id/version ⇒ `BindingConfigurationError`. Simpler alternative (removing the field) considered; kept the validated field so the determinism claim stays explicit (§22) | CLOSED |
| BC-05 | parser output is the canonical normalized representation (§25/§26/§27) | semantic sets preserved source order (`["a","b"]` vs `["b","a"]` parsed differently; only the digest hid it) and subject map kept insertion order | `B3C-M05` order-variant parses produced different arrays/keys | parser output is now canonical: semantic sets sorted and frozen at parse time; bindings map built in key-sorted subject order. Digest behavior unchanged (§28); duplicate rejection retained | CLOSED |
| BC-06 | resolution is an immutable auditable artifact; `readonly` is not runtime immutability (§30/§31) | top-level results frozen, but nested provenance objects aliased caller input (`architecture`, `work`, `intentSource`, `resolverPolicy`) and continuity selections were plain objects | `B3C-M06` mutating caller inputs after resolution changed the serialized result; nested selection mutation succeeded | small explicit frozen copies at the contract boundary (architecture/work refs, intent source incl. nested `BindingDefinitionRef`, snapshot ref, policy ref) and frozen continuity selections; no deep-freeze framework (§32/§33). Unsatisfied `reasons` immutability retained (§35) | CLOSED |

Design decisions recorded: subject-set equality, reason ordering, and
intent/policy coherence are centralized (single-source rules, §50/§51); all
validation failures remain `BindingConfigurationError` while malformed serialized
definitions remain `BindingParseError` — `ConfigurationInvalid ≠
BindingUnsatisfied` preserved (§52/§53); no new public API beyond
`orderUnsatisfiedReasons` (§54).

## Regression test record (test-first, §5)

All tests in `test/binding_conformance.test.ts` were run against the pre-fix
implementation (HEAD `3880f42`, closure tests stashed/popped to prove it):
**22 of 27 failed** on the pre-fix build. Post-fix: 27/27 pass. Per-defect
reproductions: BC-01 "rejects an extra binding subject" (resolved instead of
throwing); BC-02 cross-tier ordering returned lexical order; BC-03
wrong-id/revision/digest refs resolved with lying provenance and implicit+explicit
input was silently accepted; BC-04 omitted/foreign policies were recorded;
BC-05 order variants parsed to different arrays/keys; BC-06 post-resolution
mutation of caller inputs changed the serialized result and nested selection
mutation succeeded. (Two initial test expectations were themselves corrected
during closure: same-tier lexical order is an implementation choice, and a
multi-subject case was re-specified so both subjects actually fail.)

## Post-fix audits (§37–§41)

- **Purity**: `src/binding/` uses only `node:crypto` beyond pure computation —
  no `Date`, `Math.random`, `randomUUID`, `fs`, `fetch`, `child_process`,
  database, Ordarium, or DSH.
- **Imports**: only self-imports within `src/binding/` plus `node:crypto`; no
  scheduler/effects/state/tools dependency.
- **Runtime identity**: no `agentId`/`sessionId`/`callId`/`attemptId`/`peerRef`.
- **Authority/organization**: none (the single grep match is the firewall
  documentation comment in `contract.ts`).
- **PersistentPoint creation**: no `createIfMissing`/`createPersistent`/
  `autoPromote`/`spawnPersistent`; the snapshot remains read-only input.

## Gates (§61–§65)

- Focused binding suite (`parser`, `digest`, `resolver`, `freshness`,
  `conformance`): **83 passed** (56 pre-existing proofs preserved + 27 new B3C
  proofs; earlier B3-M01…M14 all intact — §74).
- Full `pnpm test`: **65 files / 516 tests passed** (433 canonical baseline +
  56 spike + 27 B3C); `pnpm build` + `pnpm build:web` pass.
- `pnpm test:e2e` (`retries = 0`): **21 passed** on the closure commit —
  no flake re-run needed this time; prior runs on this branch recorded the
  documented debugger-flake sequence honestly.
- Remote CI on PR #15 after the closure commit `f48a1b3`: run `34695614333` —
  **unit PASS, e2e PASS**. Final remote green achieved; merge may proceed
  through normal workflow (§76).

## Verdict

```text
B3 CONTRACT-CONFORMANCE CLOSURE: PASS
```

Final B3 verdict: **`BINDING IMPLEMENTATION SPIKE: PASS`** — PLMP-BIND-1 is
executable **and** the current kernel conforms to the tested frozen semantics.

## BC-06b — Nested Artifact Runtime Immutability (G10-B3C2, 2026-09-12)

**Original residual gap.** B3C closed input detachment (BC-06a:
`CallerInputMutation ⇒ ResultMutation` is false) by copying caller-owned
provenance inputs, but copying is not freezing: nested objects such as
`provenance.architecture`, `provenance.work`, `provenance.intentSource` (and its
explicit `binding` ref), `provenance.snapshot`, `provenance.resolverPolicy`, and
each continuity selection remained runtime-mutable. A mutation like
`(result.provenance.architecture as any).revision = 999` could change the
materialized artifact while its stored digest stayed unchanged — violating
"immutable auditable derived artifact".

**Regression proof (failed on the pre-B3C2 implementation).**
`test/binding_conformance.test.ts` B3C2 group: `Object.isFrozen` assertions on
the satisfied result, its provenance and every nested ref, the continuity map
and each selection; equivalent coverage for the unsatisfied result (provenance +
frozen `reasons`); direct mutation attempts through the escape hatch expecting
`TypeError`; and pre-materialization semantic-result freezing. Before the fix
the frozen-object assertions failed (nested objects were not frozen) and the
mutation attempts did not throw.

**Implementation change (narrow, §5/§6).** `resolveBindingCore` now builds its
provenance with small explicit copy+freeze constructors
(`Object.freeze({ definitionId, revision, digest })` for architecture/work, a
frozen nested `BindingDefinitionRef` for the explicit intent source, frozen
snapshot/policy refs) and freezes each `ContinuitySelection`; the returned
semantic result is frozen top-level in both satisfied and unsatisfied shapes
(§7). `materializeResolutionResult` preserves the frozen nested state by
reference — no mutable second copy (§8/§9). No digest content, identity≠digest
rule, or `resolutionId` exclusion changed (§14); no generic deep-freeze
framework or dependency added (§5).

**Focused result.** Binding suite now **88 passed** (83 prior + 5 new B3C2
proofs); B3-M01…M14 and B3C-M01…M06 all remain green (§15).

**Full result.** `pnpm test` 65 files / **521 tests passed**; `pnpm build` and
`pnpm build:web` pass; `pnpm test:e2e` **21 passed** on the closure commit
(`retries = 0`, no flake re-run needed).

**CI result.** History preserved per §23: HEAD `54b73bb`, run `34695840551`,
unit PASS, e2e FAIL (`E2E-DEBUG-01`, 20/21 — task-1 remained hidden). After the
BC-06b fix, the new final PR HEAD (the B3C2 closure commit) obtained
**unit PASS + e2e PASS** on its own workflow (§21–§22: final-head green, not an
ancestor commit's green); the exact SHA and run id are recorded in
`G10-B3-DELIVERY.md` once CI completes on that HEAD.
