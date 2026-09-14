# G10-M Runtime Structural Evolution & Retirement — M0 Current-State Assessment

Baseline audited: `orangeofcarl0-sys/palimpsest` `main @ dd38147`.
Read: G10-H/I/J/L specs, `G10-L-CARRY-FORWARD.md`, `G10-J-CARRY-FORWARD.md`, and
`src/{runtime_scope,organization_dynamics,organization_evolution,organization,institution,campaign,boundary_memory}/**`,
`src/install.ts`, `src/advanced.ts`.

## M0-Q1/Q2 — RuntimeScopeStore atomic transition

**Q1: are all RuntimeScopes in one canonical SQLite store?** YES — one
`SqliteRuntimeScopeStore` (`$DSH_HOME/palimpsest/runtime_scope.sqlite`), one table per
definition plus one events table keyed `(scope_id, seq)`.

**Q2: can a multi-scope atomic transition be added safely?** YES. The store owns one
`DatabaseSync`, so ONE `BEGIN IMMEDIATE` can validate every touched scope's expected basis,
create new scope definitions, and append each scope's event batch — committing all or none.
Implemented as `applyStructuralTransition({ expectedScopes, createScopes })`:
- every existing scope is exact-basis guarded (`basis_mismatch` on drift);
- new scope ids must be absent (byte-identical re-apply is idempotent; different content →
  `already_exists`; a created scope's post-open events are replayed/compared exactly);
- all-present identical → idempotent success; ANY partial presence → `recovery_required`
  (never "fill in the rest");
- a duplicate `eventId` (including across scopes) → `event_conflict`.

**Q3: chain digests.** Each scope keeps its OWN chain, chained from its own tail; a created
scope starts at seq 1 with the canonical `RUNTIME_SCOPE_OPENED` event, then its post-open
events at seq 2… There is NO global runtime chain. Verified by a test asserting different
per-scope chain digests.

## M0 — DISSOLVE subject split

`DISSOLVE_OR_RETIRE_CANDIDATE` is disambiguated by subject:

| subject | disposition |
|---|---|
| `runtime_scope` | executable as `RETIRE_SCOPE` in the NEW `runtime_evolution` service |
| `organization` | executable append-only lifecycle retirement (extended `organization_evolution`) |
| `boundary_workspace` | explicit unsupported (workspace close/archive already exists) |

No candidate type serves three truth species: runtime topology uses
`RuntimeStructuralEvolutionCandidate`; organization retirement uses
`OrganizationRetirementCandidate`.

## M0 — Organization retirement ownership (Option A chosen)

The `OrganizationStore` owned only immutable revision lineage. Option A (extend the SAME
canonical store with append-only lifecycle truth) was chosen over a separate store, because
organization identity + revisions + lifecycle are one semantic truth and registration must
fail closed on a retired lineage.

- New table `organization_retirements(organization_definition_id PRIMARY KEY, artifact_json)`,
  one-way (no reactivation in v1), never deleting or rewriting a revision.
- `lifecycle(id)` → `ACTIVE | RETIRED | undefined`; `current()`/`head()`/`get()`/`lineage()`
  semantics are UNCHANGED, so `CurrentDefinition ≠ ActiveLifecycle`.
- Store-level enforcement: any registration that would add a revision to a retired lineage
  fails with `retired_lineage` (a byte-identical retry of an already-registered revision is
  still idempotent).

## M0 — Institution current-body enumeration

The `InstitutionStore` could NOT enumerate institutions (only reads by id). Added a READ-ONLY
`institutions()` (`SELECT DISTINCT institution_id`) and `currentBodies()` (current epoch per
institution). Continuation authority semantics are untouched. If a retirement has no
enumeration source, the obligation is UNRESOLVED (blocked) — never "assume no institution".

## M0 — Open RuntimeScope dependency

Retirement checks ALL OPEN RuntimeScopes grounded to the target lineage (enumerable via
`listScopes` + `scopeState`). Any OPEN scope blocks retirement; none is auto-closed.

## M0 — Campaign implications

No Organization↔Campaign canonical relation exists. Retirement performs no campaign mutation
and asserts no campaign absence; `Organization retirement ≠ Campaign termination`.

## M0 — Retirement authority reuse

`OrganizationEvolutionAdmissionPort` is reused (retirement belongs to the organization
structural/lifecycle authority domain) with an additive `kind: "RETIRE"` and an independent
`OrganizationRetirementAssessment` — never disguised as an F3 `TransformationAssessment`.

## Frozen-contract impact

Additive only: a new `src/runtime_evolution/` module, new organization lifecycle truth, new
read-only institution enumeration, a new disposition value, new event types, and additive
optional digest fields in Dynamics (omitted unless a lifecycle/boundary source is wired, so
existing subject digests are byte-identical). No UAS-2.
