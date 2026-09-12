# G10-D — Runtime & Continuity Campaign Record

Status: **G10-D · RUNTIME REALIZATION & CONTINUITY GROUNDING · CAMPAIGN COMPLETE**

Umbrella record for the single-prompt G10-D campaign (§115): stage topology,
authority and identity matrices, canonical checkpoints, effect-authority and
continuity-store decisions, DSH host capability status, observation semantics,
adversarial findings, and the final verdict.

---

## 1. Stage topology and canonical checkpoints (§110/§111/§112/§113)

Every stage: focused tests → full unit → build → build:web → e2e → adversarial
review → final-head remote CI on the actual HEAD → normal merge.

| Stage | Branch | PR | Final HEAD (green) | Merge commit | Post-stage main |
| --- | --- | --- | --- | --- | --- |
| D0+D1 | `experiment/g10-d1-runtime-identity-kernel` | #21 | `ac4adb7` (run 34712365968, first-run green) | `17fa74c` | `17fa74c` |
| D2 | `experiment/g10-d2-ephemeral-runtime-realization` | #22 | `df1c1d6` (run 34713349127, first-run green) | `864ff94` | `864ff94` |
| D3 | `experiment/g10-d3-persistent-continuity` | #23 | `e7258ca` (run 34714270554, first-run green) | `ec61d74` | `ec61d74` |
| D4 | `experiment/g10-d4-live-runtime-observation` | #24 | `45829e9` (run 34714948858) | `5d8202d` | `5d8202d` — canonical run 34715023084 **success** |
| D5 | `experiment/g10-d5-advanced-runtime-integration` | #25 | recorded in the PR description | recorded at merge | recorded at merge |

Flakes: known `E2E-DEBUG-01`/`E2E-RUNTIME-03` runtime-debugger nondeterminism
handled exclusively by failed-job reruns with every failure preserved. One
process finding recorded honestly (D4): the PR #24 merge was issued in the
same step as the final-HEAD run watch and landed before that run's failure was
observed; remediation was immediate — failed-job rerun green (known family) and
the authoritative post-merge canonical run green on its own SHA. No
ancestor-green citation is relied upon anywhere.

## 2. Runtime authority matrix (D0)

Full matrix in `G10-D0-RUNTIME-AUTHORITY-MATRIX.md`. Headlines:

- Host capability verdict: carrier create/resume/release and ALL observation
  are **callback/injected-port only**; session create/resume **not available**;
  no trustworthy DSH agent/session contract exists (`agent?: unknown` is
  unconsumable and was never inspected — §6/§41).
- Effect authority: Palimpsest is an explicit Ordarium Action-calling host;
  runtime mutations ride the same Safe-Action surface as the five existing
  actions.
- PersistentPoint storage: a **dedicated Palimpsest-owned continuity
  repository** (D0 §13 decision) — never Ordarium state, never the
  orchestration ledger.

## 3. Identity matrix (§99/§124)

Full matrix in `G10-D3-IDENTITY-MATRIX.md`. The decisive distinctions, all
machine-proven:

```text
AgentDefinition ≠ Activation ≠ PersistentPoint ≠ RuntimeAgent ≠ Session ≠ Attempt
BindingResolution ≠ RuntimeAttachment
definition_id remains Work/Task lineage
```

Still OPEN (not guessed): AgentDefinition ↔ WorkUnit assignment;
Activation ↔ Attempt participation (§96 verdict: **OPEN — NO CANONICAL
PARTICIPATION SOURCE**; scheduler/claim-path/AttemptExecutor untouched, §97);
PeerRef ↔ PersistentPoint. Organization/collaboration: OUT OF SCOPE.

## 4. Effect authority review (§100)

Every external mutation added by D: runtime carrier realize and release, both
Ordarium actions (`palimpsest.runtime.carrier.realize`/`.release`,
idempotent profile), both carrying the stable `realizationKey` idempotency
basis and explicit authorization intent (OrchestrationIntent with the plan
revision as evidence). The port is reachable only inside action `execute` —
no direct mutator escape in the high-level service (machine-audited).
Full record: `G10-D2-EFFECT-AUTHORITY.md`.

## 5. Persistence review (§101)

Durable truths added by the campaign: the PersistentPoint identity store —
nothing else. Owner: Palimpsest Continuity. Canonical: the
`persistent_points` table (id + canonical artifact JSON). Projections/caches:
none. Restart: reload from SQLite (proven). Concurrency: PRIMARY KEY-atomic
with fail-closed conflict comparison and corrupt-record fail-closed reads
(proven). No duplicate truth; RuntimeAttachment is runtime state and is never
stored as point identity (§62/§108 — restart proofs show a new carrier
realizing the same point while old artifacts stay immutable).

## 6. Observation review (§102)

Facts in a live `BindingObservationSnapshot`: ephemeral capability profile
(source: `RuntimeObservationPort.observeEphemeralCapabilities`; policy: refuse
on unknown; canonicalization: C2 semantic sets; staleness: any drift changes
the content digest) and per-point availability/capabilities (source:
`observePersistentPoint` over the canonical store's enumeration; policy: ANY
unknown point refuses the whole snapshot — a registered point is never
silently omitted; staleness: same). No invented capability fact exists.
Knowledge-state detail: `G10-D4-OBSERVATION-KNOWLEDGE-STATES.md`.

## 7. Trust review (§103)

| Boundary | Trust meaning |
| --- | --- |
| ArchitectureDefinition / ProjectIr / RunConfiguration / PersistentPoint / BindingObservationSnapshot | parsed/materialized artifacts; raw transports parse at their own strict fail-closed boundaries; trusted paths are trusted API boundaries, not unforgeable capabilities |
| BindingDefinition | raw parsed at the compiler/grounded boundary; trusted = kernel-produced |
| `RuntimeCarrierPort` results | host-owned identity refs returned verbatim into `RuntimeAttachment` — trusted API boundary; host identities are never reinterpreted as Palimpsest ids |
| `RuntimeObservationPort` results | explicit knowledge states; only `known` facts enter snapshots |

## 8. Immutability review (§104)

PreparedRuntimeRealization, Activation, RuntimeAttachment, PersistentPoint,
observation results: deep-frozen, nested-frozen, caller inputs detached
(machine-proven per stage). External mutable host objects enter only as
narrow copied refs (`RuntimeAgentRef`/`SessionRef`).

## 9. Failure semantics (§105/§106)

Distinct outcomes implemented and tested: `configuration_invalid` (typed
errors), `plan_stale`, `observation_incomplete`, `binding_unsatisfied`,
`persistent_point_missing`, `continuity_unavailable`,
`runtime_realization_failed`, `effect_denied` (Ordarium `ActionDeniedError`).
None collapses into "Attempt failed" — no Attempt exists on the runtime path.
Cancellation (§106): the host-neutral port carries no AbortSignal in this
campaign; carrier cancellation is an effect/runtime outcome deferred with the
concrete host adapter (itself deferred) — documented, not hidden.

## 10. Idempotency and restart reviews (§107/§108)

Double realization of the same prepared activation: Ordarium idempotent dedupe
(port invoked once — proven). Double release: one operation (proven).
Allocator-stability contract explicit (per-call UUID allocators are the
duplicate-carrier hazard — found test-first in D2 and fixed by contract).
Same activationId with a changed target derives a DIFFERENT realizationKey
(target is key content) — auditable as a distinct operation, never a silent
retarget. Restart: store reload proven; attachments are runtime state; a new
carrier may realize the same point; old Binding/plan artifacts byte-immutable.

## 11. DSH honesty verdict (§109)

```text
DSH CONCRETE RUNTIME ADAPTER:
DEFERRED — CURRENT PUBLIC/STRUCTURAL HOST CONTRACT DOES NOT EXPOSE
AGENT/SESSION REALIZATION
```

The host-neutral production port, callback adapter, Ordarium effect actions,
continuity store, observation port, and the installed high-level service are
complete and usable by embedders — the deferral does not force PARTIAL.

## 12. Final grounding / architecture (§123)

```text
ArchitectureDefinition → AgentDefinition
        ↓ (grounded plan: RunDefinition + BindingResolution + ref-only plan)
PreparedRuntimeRealization (ephemeral | persistent(P))
        ↓ Ordarium-admitted realize (idempotent key)
Activation → RuntimeAttachment{RuntimeAgentRef, SessionRef?}
        ↓ read-only observation
BindingObservationSnapshot → freshness → re-resolution
```

Work remains separate (WorkUnit → Attempt) with no fabricated ownership
relation between the trees.

## 13. Final verdict

**Campaign-final canonical gate (§114)**: on post-D5 canonical main —
`git diff --check` clean; unit **76 files / 655 tests**; `pnpm build` +
`pnpm build:web` pass; local e2e **21/21**; canonical remote CI **success**
(recorded below with the run id).

All §120 PASS criteria hold: runtime authority inventory complete; identity
boundaries executable; AgentDefinition → Activation executable with
Activation ≠ Attempt proven; ephemeral realization first-class and
PersistentPoint-free; host-neutral carrier port implemented with Ordarium
admission and a stable idempotency basis; Activation/RuntimeAttachment
implemented; PersistentPoint minimal artifact + canonical durable store
implemented and proven distinct from carriers/sessions; persistent
realization and carrier-replacement continuity proven; live observation with
UNKNOWN ≠ UNAVAILABLE and the stale→re-resolve loop proven; the high-level
advanced runtime service implemented; Work compiler/TaskSpec/AgentGraph
unchanged; scheduler decide() pure; Attempt semantics untouched; no
organization/collaboration semantics; no mandatory persistence; full
adversarial review complete (in-stage defects: D2 denial mapping +
allocator-stability, D3 Ordarium typed-outcome boundary + activation
contexts — all found test-first and fixed); canonical main green.

```text
G10-D RUNTIME & CONTINUITY CAMPAIGN: PASS
```

Recommended next major campaign (§125 — NOT started): **G10-E — Participation
/ Federated Workforce / Collaboration Grounding** (Activation ↔ Attempt,
peer collaboration, commitments, handoff, durable institutions), per D's
evidence that the participation seam is the remaining OPEN relation.
