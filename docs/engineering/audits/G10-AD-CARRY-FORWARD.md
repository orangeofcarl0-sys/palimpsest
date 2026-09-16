# G10-AD — Carry-forward

No `BLOCKER_IN_AD`. The stage delivered a real, durable, independently grounded
project verification capability without turning a verdict into truth or authority.
The items below are surfaced by AD or carried from AC-R/AC/AB/AA/W/X/Y/Z; none
blocks a delivered claim.

Disposition of the AC-R items: `G10-AD-ACR-CARRY-FORWARD-DISPOSITION.md`. The
recommended next stage is §3, and it is a recommendation only.

## 1. New items surfaced by AD

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| **CF-AD-01** | scope | **NEW.** v1 verifies ONE subject kind, `CURRENT_PROJECT_HEAD`. Reasoning claims, Proof claims, Campaign hypotheses, Commitments, Boundaries and Organizations cannot be verified through this plane at all. Deliberate (§1), but it is a real ceiling. | A product need to verify something that is not the project head, WITH a different admission design — a bridge is a §25 decision, not a config change. |
| **CF-AD-02** | capability | **NEW.** The independence RULES for a model verifier are implemented (`classifyModelIndependence`, `effectiveModelIndependenceClass`, `modelIndependenceIsHonest`, `modelProvenanceIsVersioned`) but NO model adapter ships, because the host cannot establish a real provider boundary. A deployment that registers a model verifier today gets `UNKNOWN`/`DECLARED_SEPARATE` and no independent VERIFY. | A host that can prove a real provider boundary (a separate process/service/host holding the verifier's context) for a model verifier. |
| **CF-AD-03** | operability | **NEW.** There is no operator path to REGISTER a verifier without editing the embedding host. The registry is deployment config and is only reachable through `installPalimpsest` options or by composing the service by hand. The agent/HTTP face deliberately cannot register anything. | An operator who wants to add or rotate a verifier protocol without a code deployment, or a CLI `palimpsest verify …` regression path. |
| **CF-AD-04** | product | **NEW.** No human verification workflow exists. `VerifierKind` includes `human`, but nothing records a human adjudication, an attestation identity or a review trail. | A project whose acceptance requires a named human verdict, or a compliance-shaped workflow. |
| **CF-AD-05** | authority | **NEW (by design).** There is NO bridge from a verification result to Work Evidence, a Work gate, Proof publication, Reasoning admission, task state or promotion. §25 forbids an automatic one, and none exists. | A justified need for a SEPARATE, explicit admission design that consumes a verification run. Until then, a PASS stays a protocol result. |
| **CF-AD-06** | portability | **NEW.** The verification PROFILE (registry definitions, providers, default ref, independence classes) is process-local deployment config, exactly like the management/Work Mode stores' portability gap (`CF-AB-04`). Two processes with different registries disagree, which correctly shows up as `STALE_VERIFIER_DEFINITION` rather than as a merge. | Verification-preference portability, or multi-machine operation of one project. |
| **CF-AD-07** | correctness/UX | **NEW (adjacent to `CF-AC-R-02`).** Verification runs carry real timestamps, so they sort chronologically; Campaign wake references do not (they use `campaign-seq:<n>`). A merged chronological history therefore places Campaign entries after every dated entry. | A consumer that must interleave verification runs with Campaign wake events by time. |

## 2. Full carried table (triggers unchanged)

| ID | Disposition | Trigger (unchanged) |
| --- | --- | --- |
| CF-AC-01 | STILL_DEFERRED_WITH_TRIGGER | An operator who wants to force a monitor tick from the shell, or a request for a CLI-level monitor regression test. |
| CF-AC-02 | STILL_DEFERRED_WITH_TRIGGER | A project whose scoped Campaign count exceeds `maxCampaignsPerTick`, or a latency requirement that one tick must finish a progression beyond the budget. |
| CF-AC-04 | STILL_DEFERRED_WITH_TRIGGER | A shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| CF-AC-05 | STILL_DEFERRED_WITH_TRIGGER | A host that can only be woken by an HTTP push, webhook or queue consumer. |
| CF-AC-R-01 | CLOSED_IN_AC_R | — |
| CF-AC-R-02 | STILL_DEFERRED_WITH_TRIGGER | A consumer that must interleave Campaign wake events with dated entries by time (see also `CF-AD-07`). |
| CF-AC-R-03 | STILL_DEFERRED_WITH_TRIGGER | A consumer needing one consistent snapshot of runtime state and preview. |
| CF-AC-R-04 | STILL_DEFERRED_WITH_TRIGGER | A decision to put `web/**` into a typecheck gate, or a web type regression that reaches the served bundle. |
| CF-AC-R-05 | STILL_DEFERRED_WITH_TRIGGER | The same trigger as `CF-AC-04`. |
| CF-AC-R-06 | STILL_DEFERRED_WITH_TRIGGER | An operator who needs to observe or force a tick without writing host code. |
| CF-AC-R-07 | STILL_DEFERRED_WITH_TRIGGER | A host that can only be woken by an HTTP push, webhook or queue consumer (`CF-AC-05`). |
| CF-AC-R-08 | STILL_DEFERRED_WITH_TRIGGER | A scoped set larger than `maxCampaignsPerTick`, or a latency requirement beyond one tick's budget. |
| CF-AB-01 | STILL_DEFERRED_WITH_TRIGGER | A project whose activity volume makes a full read expensive, or an operator asking for a retention window. |
| CF-AB-02 | STILL_DEFERRED_WITH_TRIGGER | A multi-tenant/tamper-hostile deployment where the activity log must be tamper-evident against the operator's own environment. |
| CF-AB-03 | REASSESSED, STILL_DEFERRED_WITH_TRIGGER | A consumer that infers mutation from an empty canonical-ref list. AD adds a fourth ref kind with the same shape, now resolved explicitly. |
| CF-AB-04 | STILL_DEFERRED_WITH_TRIGGER | Management-preference portability, or multi-machine operation of one project (see also `CF-AD-06`). |
| CF-AB-05 | STILL_DEFERRED_WITH_TRIGGER | A hosted or UI-only operator topology needing a real operator-authority channel (see also `CF-AD-03`). |
| CF-AA-01 | STILL_DEFERRED_WITH_TRIGGER | An actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | STILL_DEFERRED_WITH_TRIGGER | An untrusted-plugin or multi-tenant same-process topology. |
| CF-AA-03 | CLOSED_IN_AA, held | — |
| CF-AA-04 | STILL_DEFERRED_WITH_TRIGGER | A requirement to make terminal provenance tamper-evident. |
| CF-AA-05 | STILL_DEFERRED_WITH_TRIGGER | Importing a foreign log, or a writer that appends a terminal without an intent. |
| CF-W-01 | CLOSED_IN_W, held | — |
| CF-W-02 | CLOSED_IN_X, held | — |
| CF-W-03 | CLOSED_IN_Y, held | — |
| CF-W-04 | STILL_DEFERRED_WITH_TRIGGER | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | STILL_DEFERRED_WITH_TRIGGER | A UI change that wants `GET /api/manage/preview` consumed by `web/**`. |
| CF-W-06 | REASSESSED_IN_AC, STILL_DEFERRED_WITH_TRIGGER | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | STILL_DEFERRED_WITH_TRIGGER | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | STILL_DEFERRED_WITH_TRIGGER | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | PARTIALLY_ADDRESSED_IN_AB, UNCHANGED_BY_AD | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | STILL_DEFERRED_WITH_TRIGGER | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | STILL_DEFERRED_WITH_TRIGGER | A CLI-behaviour change, or a request for CLI-level regression coverage. |
| CF-Y-01 | CLOSED_IN_Z, held | — |
| CF-Y-02 | CLOSED_IN_Z (superseded), held | — |
| CF-Z-01 | STILL_DEFERRED_WITH_TRIGGER | A project with a large pending-promotion backlog, or a concurrency policy allowing many simultaneous unresolved intents. |
| CF-Z-02 | CLOSED_IN_AA, held | — |
| CF-Z-03 | STILL_DEFERRED_WITH_TRIGGER | A future path that records reports without the aggregate's input-identity check. |
| CF-Z-04 | STILL_DEFERRED_WITH_TRIGGER | A host that calls `reconcileAll()` without a subsequent turn. |
| CF-AD-01 … CF-AD-07 | STILL_DEFERRED_WITH_TRIGGER | See §1. |

## 3. Recommended next stage (assessment only)

All five declared Work Mode capabilities now have real runtime semantics:

```text
FOCUS   EXPLORE   COORDINATE   VERIFY   MONITOR
```

Nothing on the declared capability surface is a stub, a boolean or an ignored step.
That is the condition the AC-R carry-forward set for considering a stage that
connects Palimpsest to reusable knowledge outside the project.

### The three candidate stages, compared

The comparison is on delivered evidence alone. It does not select.

| | External Asset Library Bridge | Monitor source connectors | Cross-project asset relations |
| --- | --- | --- | --- |
| What it would close | No reusable-knowledge SOURCE exists. `src/project_workspace` already models an association to an EXISTING canonical asset, so a bridge would add a source rather than a truth. | `CF-AC-05` / `CF-AC-R-07`: a host that can only be woken by push, webhook or queue consumer. | `CF-AD-01`'s neighbourhood: a project's assets are visible only inside that project; there is no relation between two projects' asset graphs. |
| Evidence it is the real need | None yet. No product text asks for external reusable knowledge; `CF-AC-R` and this stage both record that. | None yet. The shipped DSH and Pi adapters cover the two hosts that exist. | None yet. No deployment has two projects that need to relate. |
| Cost / risk | High: it invites a second asset truth if built as a store rather than a source. | Low-moderate: one more `CampaignWakeActivationPort` adapter plus its failure semantics. | High: it crosses the project boundary, which is currently the isolation unit for ProjectIR, Work, assets and activity. |
| Anti-waste verdict | Only defensible as a read-only connector into an existing owner. | The smallest and most reversible of the three. | Only defensible with a concrete cross-project workflow and a boundary story. |
| Does it need a new authority? | No, if it stays a source. | No. | Possibly: reading another project's assets is a boundary decision, not a read-model decision. |
| Reachable from the carry-forward list alone? | No — no trigger has fired. | No — no trigger has fired. | No — no trigger has fired. |

**The comparison does not select a stage.** Each of the three would be built from a
demand that has not been produced: no project needs external reusable knowledge, no
deployment needs a push connector, and no workflow spans two projects. The choice
must come from a real product need, not from this table's internal ranking.

Explicitly **not** privileged by any ordering: a universal `VerificationStore`, a
`TruthStore`, a global verification graph, verification as Work Evidence, a scalar
trust score, or a second head truth.

If a decision is forced before such a need appears, the honest ranking by evidence
already in hand is: (1) the smallest reversible item (`CF-AC-R-07`, one more
activation adapter), (2) the operator-facing gaps AD and AC-R both surfaced
(`CF-AD-03` + `CF-AC-R-06`, a real operator path for verifier registration and for
monitor observation), (3) everything that needs a new boundary story. This ordering
is a statement about cost and reversibility, not about product value.

## 4. Post-delivery notes

```text
One write-scope extension was made: src/project_operating/activity.ts gained ONE
additive enum member ("project_verification") so §21's reference could be durable.
No policy, decision, fold or kind was changed or removed.
```
