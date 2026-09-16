# G10-AE — Carry-forward

No `BLOCKER_IN_AE`. The stage delivered a real, deliberately narrow bridge from one
durable project to assets owned by an external library, without becoming that
library, without a second asset truth and without any automatic retrieval,
context injection or publication. The items below are surfaced by AE or carried
from AD/AC-R/AC/AB/AA/W/X/Y/Z; none blocks a delivered bridge-plane claim.

Disposition of the inherited items:
`G10-AE-AD-CARRY-FORWARD-DISPOSITION.md` (48 ids; AE closes none of them).
The next direction is decided **after** the AE gate (§43), and §2 records that
without recommending a choice.

## 1. New items surfaced by AE

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| **CF-AE-01** | scope | **NEW (§42).** v1 imports TEXT only, bounded by `maxImportedTextBytes` (default 256 KiB). Binary, dataset, image and multi-file sources cannot be imported at all; they can only be referenced. | A project that must bring a binary or large source INTO the project, together with a storage/ownership design for the copy (a §41-adjacent decision, not a config change). |
| **CF-AE-02** | scope | **NEW (§42).** No native Proof-source import adapter. An external asset cannot become a Proof source through this plane; §3 forbids `ExternalAsset != ProofEvidence` and the plane cannot reach the proof owner. | A legitimate need to cite an external source as PROOF evidence, WITH the proof plane's own admission design. |
| **CF-AE-03** | scope | **NEW (§42).** Outbound publication supports exactly `ProjectJournalEntry`. Work Evidence, Proof claims, Decisions, Attempts, Commitments, Boundary artifacts and verification runs each need their own disclosure semantics. | A justified need to disclose one of those kinds, with a separate admission design per kind. |
| **CF-AE-04** | ecosystem | **NEW (§42).** No real provider ships. Only the TEST-ONLY fixture exists (`test/fixtures/external_library_fixture.ts`). A real Personal Intellectual Asset System provider, a Zotero adapter, a GitHub adapter and an institutional-KB adapter are all absent. | A deployment with a REAL external library to connect, and a credential/host story for it. |
| **CF-AE-05** | operability | **NEW (shares the shape of `CF-AD-03`).** There is no operator path to register, rotate or inspect a provider without editing the embedding host: the registry is reachable only through `installPalimpsest` options (`src/install.ts:487-493`) or by composing the plane by hand. | An operator who wants to add or swap a provider without a code deployment, or a CLI/UI provider inventory. |
| **CF-AE-06** | portability | **NEW (shares the shape of `CF-AD-06` / `CF-AB-04`).** The provider registry is process-local deployment config, and both the bridge store path and the provider definitions are non-portable. Two processes with different registries disagree; the bridge reports that honestly as `unknown_provider` / `STALE_REFERENCE_CANDIDATE` instead of merging. | External-provider-profile portability, or multi-machine operation of one project. |
| **CF-AE-07** | correctness/boundary | **CLOSED_IN_AE (hardened during this campaign's adversarial review).** The finding was real: the digest requirement for `EXTERNAL_ASSET` was enforced only by the bridge's association port (`src/external_assets/service.ts:1374-1398`), while the shared artifact kept `CanonicalAssetRef.digest` optional, so the ordinary workspace writer `projectWorkspace.associateAsset(...)` (`src/project_workspace/service.ts:398-410`) could append a digest-less `EXTERNAL_ASSET` association. `materializeProjectAssetAssociation` and `parseProjectAssetAssociation` now refuse it on BOTH the write and the read path (`requireExternalAssetDigest` in `src/project_workspace/association.ts`), so the rule holds for every writer, not just the bridge port. Every other kind keeps its optional-digest semantics unchanged. Pinned by `AE-N04 (artifact)`. | Closed. Residual: a digest-less row written by an earlier build of this same unreleased stage would now fail to read — unreachable in a deployment, since `EXTERNAL_ASSET` did not exist before AE. |
| **CF-AE-08** | scope | **NEW (§31, deliberately not built).** No provider-change webhook, watcher or auto-refresh exists. "A newer revision is available" is computed only when a caller asks `resolve()`. | A product need for a project to be NOTIFIED of a library change, which first needs a decision about what a notification may do (it may not mutate the project). |
| **CF-AE-09** | semantics | **NEW (§30, deliberately not built).** No applicability-aware retrieval: `SemanticMatch != Applicability` is frozen, so "Method A applies to Task X" is never a canonical relation. A model may discuss applicability after an explicit retrieval; nothing is stored. | A product requirement for applicability-aware retrieval WITH a design that does not make a model's judgement a canonical relation. |
| **CF-AE-10** | boundary | **NEW.** No cross-project asset relations and no project scan. The store and the derived view are per-project; EXT-A21 is structural — the integration suite pins a cross-project refusal, but there is no adversary that ATTEMPTS a cross-project read. | A concrete cross-project workflow, which is a boundary decision (reading another project's assets), not a read-model change. |
| **CF-AE-11** | evidence | **CLOSED_IN_AE.** The §38 dogfood runs against a genuinely separate PROCESS: `test/fixtures/external_library_server.mjs` (own sqlite schema, spawned over HTTP, killed in a `finally`) driven by `scripts/external_assets/ae-dogfood.mjs`. The in-process `test/fixtures/external_library_fixture.ts` remains the unit-suite provider. | Closed. |
| **CF-AE-12** | surface/evidence | **CLOSED_IN_AE.** The application surface (`src/application/surface.ts`), HTTP routes (`src/application/http.ts`), the read-only agent tool `palimpsest_external_assets` (`src/tools/application_tools.ts`), the derived Project Workspace external view (`src/project_workspace/view.ts`) and the web External Assets tab (`web/src/project_workspace/ProjectWorkspaceView.tsx`) all exist, and each face is pinned: `test/ae_integration.test.ts` (19 tests, incl. the 501-when-not-composed route proof and the tool's exact verb set) and `e2e/external-assets.spec.ts` (7 browser tests). | Closed. |
| **CF-AE-13** | hygiene | **NEW (found in code).** `ExternalAssetErrorKind` declares seven members that no code path throws: `provider_reported_unavailable`, `import_blocked`, `publication_not_approved`, `publication_rejected`, `admission_port_unavailable`, `publication_outcome_uncertain`, `bridge_unavailable` (`src/external_assets/refs.ts:45-70`). The corresponding states are modelled as result variants. | A decision to prune the union or to start throwing the reserved kinds; until then the union is a superset, not a live contract. |
| **CF-AE-14** | hygiene | **CLOSED_IN_AE.** `EXTERNAL_ASSET_SEARCH_HIT_DOMAIN` (`src/external_assets/provider.ts`) was declared, exported and unused, and its existence invited the one thing §29 forbids — digesting an ephemeral search hit. It was removed during the campaign's final polish. | Closed. |
| **CF-AE-15** | operability | **NEW (residual).** `resolve(projectId)` performs one provider `inspect` per EXTERNAL_ASSET association plus one `latestRevision` probe per resolvable revision (`src/external_assets/resolver.ts:123-153`), and caches nothing. | A project with many external references, or a consumer that calls `resolve` frequently. |

## 2. Next direction — do not implement now (§43)

The AE stage does **not** choose the next direction. After the AE gate, the
decision is between:

```text
a provider for the separate Personal Intellectual Asset System;
Zotero / GitHub / institutional adapters;
Monitor source connectors;
applicability-aware retrieval;
cross-project asset relations.
```

Core question AE leaves behind:

> Can Palimpsest use knowledge from outside the project without confusing
> "available elsewhere" with "part of this project's truth", and can it
> deliberately send project knowledge back out without turning reuse into implicit
> disclosure?

The bridge-plane evidence answers the mechanism (yes, by exact-digest references,
explicit imports into the Journal, and approved governed publication) but not the
next product need. Every candidate above is reachable only from a REAL demand:
no deployment has a live external library, no project has a cross-project
workflow, and nothing has asked for applicability-aware retrieval. The choice
must come from such a need, not from this list's internal ranking.

Explicitly **not** privileged by any ordering in this document: a provider
marketplace, a universal asset store, a semantic asset graph, automatic
applicability, any watcher, or a second publication authority.

## 3. Carried inherited items

The full inherited table (48 ids from G10-AD and G10-AC-R) and its disposition is
in `G10-AE-AD-CARRY-FORWARD-DISPOSITION.md`. Summary of that disposition:

```text
closed in AE           0
reassessed (unchanged) CF-AB-03, CF-AB-04, CF-AA-02
still open — deferred  all remaining inherited ids, triggers unchanged
```

AE closes no inherited item because it touches no monitor, management,
concurrency, proof, reasoning or web-coverage path. That is recorded plainly
rather than implied.

## 4. Honest limitations

1. **The surface layer is pinned by its own tests, not by this document set.**
   The application surface, HTTP routes, agent tool, derived workspace view and
   web tab all landed (`CF-AE-12`) and are covered by `test/ae_integration.test.ts`
   and `e2e/external-assets.spec.ts`. Where a claim below depends on those faces,
   it cites the test rather than restating its result. Gate numbers and the CI run
   id live in `G10-AE-EXTERNAL-ASSET-DELIVERY.md`.
2. **`CF-AE-13` is a real code observation, not a planned deferral**: the error
   union is a superset of what any path throws, because seven states are modelled
   as typed result variants instead. It is behaviourally harmless and recorded so
   it is not mistaken for an intended contract.
3. **`CF-AE-10` has no adversary.** EXT-A21 (no cross-project asset scan) is
   structural: the store schema and every query are per-project, and the
   integration suite pins a cross-project refusal, but no test ATTEMPTS a
   hypothetical cross-project read because no such read path exists to attack.
