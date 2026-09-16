# G10-AE — External Asset Library anti-waste audit (§30)

The stage brief §30 and the §40 PARTIAL conditions name the wasteful things a
"bridge to external knowledge" is tempted to become. For each: is it built, what
prevents it, and what pins the prevention. Where behaviour is the claim, a test
is cited; where structure is the claim, the source is cited.

```text
ExternalAsset          ≠ ProjectAsset        ≠ ProjectContext
ExternalAsset          ≠ WorkEvidence       ≠ ProofEvidence
ExternalAsset          ≠ ReasoningClaim     ≠ Decision          ≠ Truth
SearchResult           ≠ StableAssetRef     SearchRanking       ≠ Applicability
SemanticMatch          ≠ Applicability      GlobalAsset         ≠ ProjectContext
Reference ≠ Import     Import ≠ TruthAdmission ≠ Task ≠ Evidence
PublicationPreview ≠ Publication           PublicationReceipt  ≠ Truth
ExternalLatest ≠ ReferencedRevision        ProviderUnavailable ≠ AssetFalse
Association ≠ Ownership
```

## 1. No automatic applicability semantics

| Claim | Proof |
| --- | --- |
| No canonical relation "Method A applies to Task X" is ever created. | The plane has no applicability vocabulary at all: no `appliesTo`, `applicability`, `targetTask` or `recommendation` symbol exists in `src/external_assets/**`; the association provenance records only the external relation and the exact digests (`src/external_assets/service.ts:1175-1194`). |
| A reference names an EXTERNAL asset, not a target of the project. | `ExternalAssetReferenceProvenance.relation` is the single constant `REFERENCED_FROM_EXTERNAL_LIBRARY` (`src/external_assets/service.ts:172`); the association's `canonicalRef` is `providerId / assetId / contentDigest` and nothing else (`:632-648`). |
| `searchScore` is never applicability. | Documented and typed as provider ranking only (`src/external_assets/provider.ts:169`, `:162-177`); it is never persisted (see §4 below) and is never read by the commit path. |
| The commit path is exact-revision only. | A durable reference requires `inspect` to resolve the EXACT digest; `latestDigestHint` from a hit is documented as insufficient (`provider.ts:170-176`) and `prepareReference` inspects before it builds a candidate (`service.ts:547-573`). |
| Pinned by test. | AE-N-written §30 assertion: after a real reference commit, the serialized association history contains none of `appliesTo` / `applies_to` / `applicability` / `targetTask` / `recommendation` (`test/ae_external_assets.test.ts:1777-1786`). |

Residual honest cost: a model may still DISCUSS applicability after an explicit
retrieval. That is a conversation, not a canonical relation, and it creates no
stored artifact anywhere in this plane.

## 2. No retrieval injection / no auto-context

| Claim | Proof |
| --- | --- |
| Nothing is injected into a prompt, a task or project context. | The plane exposes no context hook: `src/external_assets/**` has no injection entry point, no startup hook and no top-k selection. `search`/`inspect` validate and return (`src/external_assets/service.ts:431-471`). |
| Search hits are ephemeral and never persisted. | `search` touches no store (`service.ts:458`); the bridge record shape has no query, hit, score or summary field (`src/external_assets/bridge_store.ts:58-89`). |
| The install composes nothing unless the operator supplies a registry. | `src/install.ts:1829-1835`; a bare Work-only install leaves `installed.externalAssets` undefined (`test/ae_external_assets.test.ts:1808-1815`). |
| Project context is byte-identical across search + inspect. | Plane: raw `project_asset_association_events` before/after are equal and no hit id is persisted (`test:715-725`). Install: `projectWorkspace.view()` and `controller.orchestrationGraph()` are unchanged and contain neither the external title nor body (`test:1869-1886`). |
| Pinned by test. | AE-N02, AE-N03, AE-N16 (`test:592-662`, `:715-725`, `:1869-1886`). |

## 3. No watcher, no webhook, no auto-refresh

| Claim | Proof |
| --- | --- |
| The plane contains no timer or file watcher. | Source firewall over comment-stripped modules: no `setInterval`, `watchFile`, `fs.watch` or `chokidar` (`test/ae_external_assets.test.ts:529-538`). |
| No lifecycle hook refreshes a provider status. | After a clock advance and a real `setTimeout`, the bridge lineage is unchanged and the provider's `inspectCalls` counter has not moved (`test:1788-1800`). |
| "Newer revision available" is only computed when a caller asks for the derived view. | `resolveExternalAssetView` performs the read-only `latestRevision` probe inside an explicit `resolve(projectId)` call (`src/external_assets/resolver.ts:147-180`); nothing schedules it. |
| Provider availability is derived, not cached. | `providerAvailability` is recomputed per `resolve` (`resolver.ts:87`, `:183-200`); no store holds it. |

## 4. No speculative sync, no silent bidirectional propagation

| Claim | Proof |
| --- | --- |
| External updates never rewrite the project. | `resolver.ts` only reads: `resolveExternalAssetView` has no write path, and the §33 newer-revision test proves a newer revision leaves the recorded D1 association unchanged (`test/ae_external_assets.test.ts:910-943`). A provider that stops resolving D1 yields `REVISION_UNAVAILABLE`, not an adopted D2 (`:937-942`). |
| Project updates never silently republish. | Publication is triggered ONLY by an explicit `preparePublication` + `approveAndPublish` call (`src/external_assets/service.ts:838-1013`). Nothing in the Journal, workspace or controller path calls it. |
| No sync loop exists. | No module of the plane is a source of "on external change do X". The only outbound write is the governed effect, invoked by one service method. |
| A missing provider never deletes anything. | AE-N06: the association survives a restart that removes the provider; the view reports `PROVIDER_UNAVAILABLE` (`test:891-908`, `:1992-2047`). |
| Association does not transfer ownership. | The bridge's association port pins `assetKind = EXTERNAL_ASSET` and records a ref + digests only (`service.ts:1374-1398`, `:642-648`); the local Journal remains its own canonical history after a publication (`test:1643-1646`). |

## 5. No Personal Asset store inside Palimpsest

| Claim | Proof |
| --- | --- |
| No asset store, no asset table, no asset content is owned by the plane. | The only table is `external_asset_bridge` with `project_id, sequence, record_id, family, operation_id, record_json, record_digest, previous_record_digest, recorded_at` (`src/external_assets/bridge_store.ts:286-298`). No title, body, summary or tag column exists. |
| The TEST provider owns its OWN database and is labelled TEST-ONLY. | `test/fixtures/external_library_fixture.ts:1-36` and its separate sqlite file (`:158-171`). |
| Store-shaped names are still forbidden by the V-campaign firewall. | `test/v_adversarial.test.ts:176-190` forbids `PersonalAsset*`, `PersonalKnowledge*` and `ExternalAssetLibraryStore/Database/Db/Table`; the spec-mandated `ExternalAssetLibraryRegistry` / `ExternalAssetLibraryReadPort` names are permitted because they are config and a read port, not a store. |
| The plane names no forbidden module. | No module contains `personal_asset_store`, `global_memory`, `knowledge_graph` or `external_truth_store` (`test/ae_external_assets.test.ts:534-537`). |

## 6. No provider ontology imported into Palimpsest

| Claim | Proof |
| --- | --- |
| `ProjectAssetKind` gained exactly one member. | `PROJECT_ASSET_KINDS` is asserted to be exactly the seven original kinds plus `EXTERNAL_ASSET` (`test:574-588`). |
| Provider asset types are not kinds. | The same test asserts `Paper`, `Idea`, `Method`, `Dataset`, `Example`, `Zotero`, `Note` are absent from the enum. |
| The import path never even sees a provider type. | Structural test: `import.ts` contains no `assetType`, and the `prepareImport` region of `service.ts` contains no `assetType` (`test:563-572`). |
| A provider type never maps to a Journal kind. | AE-N10 runs a provider-named `Method` and commits it as `REFERENCE_NOTE`; the entry kind follows the CALLER (`test:1043-1058`). |

## 7. No hidden truncation, no summarization, no unbounded import

| Claim | Proof |
| --- | --- |
| The text bound is explicit and blocks rather than truncates. | `DEFAULT_MAX_IMPORTED_TEXT_BYTES = 262144` (`service.ts:111`); the byte length is measured and `content_too_large` is returned on excess (`:727-734`). AE-N12 asserts the detail names `200 bytes` and `maxImportedTextBytes=64` and that NOTHING is written (`test:1081-1109`). |
| No LLM summarization exists inside import. | The plane has no model call, no summarizer and no second text transformation; the materialized text is used verbatim as the entry body (`src/external_assets/import.ts:307-315`). |
| Binary content blocks the import. | A non-text media type is `binary_content` (`service.ts:711-713`); AE-test at `test:1111-1129`. Reference-only stays possible for the same asset (asserted in AE-N12). |
| An empty materialization is not imported as an empty note. | `parseExternalAssetTextMaterialization` refuses an empty `text` (`provider.ts:382-386`). |

## 8. No ungoverned or unapproved publication

| Claim | Proof |
| --- | --- |
| A preview has zero effect. | AE-N18: zero provider publish calls, zero publications, empty bridge, empty associations, empty Ordarium ledger (`test:1286-1305`). |
| Publication requires the separate admission port. | Without it the result is `NOT_APPROVED / UNAVAILABLE` with zero mutation (`test:1355-1371`); an explicit `REJECT` is `NOT_APPROVED / REJECT` with zero mutation (`test:1373-1386`). |
| A management mode is not approval. | The admission port receives ONLY `{ preview }` (`test:1410-1438`), the effect input binds exactly the eight §22 fields (`effects.ts:48-57`) and carries no approval field (`test:1388-1406`), and a MANAGE involvement still publishes nothing when no admission port exists (`test:1902-1927`). |
| Publication cannot skip the governed effect. | `approveAndPublish` requires a configured invoker and fails closed without one (`service.ts:927-933`); the only provider write happens inside the Ordarium action (`src/external_assets/effects.ts:268-276`). AE-N21 asserts the ledger record. |
| An uncertain attempt is never blind-retried. | A non-idempotent, reconcilable provider that answers `UNKNOWN` is probed, not re-executed: `publishCalls` stays 1 across two attempts (`test:1479-1557`). |

## 9. What was deliberately NOT built (and why)

| Not built | Why |
| --- | --- |
| Any global/personal asset database, memory or knowledge graph | §1/§40: a canonical asset DB inside Palimpsest is a STOP condition; the external system stays the owner. |
| A universal asset ontology | §5: provider types stay provider-owned; exactly one project kind was added. |
| Automatic retrieval / context injection / startup top-k | §2/§3/§30: `GlobalAsset != ProjectContext`; no injection entry point exists. |
| A provider-change webhook or library watcher | §31: Monitor does not watch external libraries in AE. |
| Cross-project asset relations or a project scan | §9/§35 EXT-A21: the store and the derived view are per-project. |
| An evidence / proof / reasoning bridge | §3/§35 EXT-A24: the plane cannot reach those owners (structural firewall). |
| An applicability or recommendation engine | §30: `SemanticMatch != Applicability`; no canonical relation is created. |
| A publication path for anything but a Journal entry | §19: other owners need their own disclosure semantics. |
| A second bridge store for reference durability | §17: reference-only durability is `ProjectAssetAssociation` and is not duplicated (`test:800-801`). |
| A model-in-the-loop import (summarize, translate, classify) | §15: no LLM summarization inside import; text is verbatim or the import is denied. |
| A shipped provider/store implementation | §32: only a TEST-ONLY fixture exists; providers are the deployment's. |

## 10. Residual costs the audit does NOT hide

```text
C1  A product install creates one more SQLite file handle by default (the bridge
    store) at the derived operating path, and one more close() in dispose(). A
    SUPPLIED store is not closed by the install (src/install.ts:1831-1834,
    :2235-2237) - the same discipline as the verification store.

C2  The publication preview embeds the FULL provider definition object, so a
    preview artifact is larger than the eight binding fields. That is deliberate:
    the preview must pin the exact versioned definition that was approved. It
    contains no credential (a strict parser forbids unknown fields).

C3  `resolve(projectId)` performs one `inspect` per EXTERNAL_ASSET association and,
    for a resolvable one, one extra `latestRevision` probe
    (src/external_assets/resolver.ts:123-153). The derived view is therefore one
    provider round trip per reference plus one per established revision; it is not
    free and it is not cached.

C4  `ProjectAssetKind` gained one enum member in a file outside the plane
    (src/project_workspace/association.ts). It is a vocabulary addition required
    by §5; no association semantics, chain or digest changed.

C5  `test/v_adversarial.test.ts`'s V-N05 token set was NARROWED: the bare
    `ExternalAssetLibrary` token is now permitted because the spec mandates
    `ExternalAssetLibraryRegistry` / `ExternalAssetLibraryReadPort`. Store-shaped
    names (…Store/Database/Db/Table) and all `PersonalAsset*` names still fail.
    The assertion still rejects an implemented personal-asset store; it is a
    documented narrowing, not a removal.

C6  The TEST provider runs IN-PROCESS over its own sqlite file. Storage-level and
    type-level ownership separation is real; process-level separation is the §38
    gate artefact, not a property of this plane (test HONEST note at
    test/ae_external_assets.test.ts:2074-2078).
```

```text
Anti-waste verdict: no automatic applicability semantics, no retrieval injection,
no watcher, no speculative sync, no personal asset store, no provider ontology in
ProjectAssetKind, no hidden truncation or summarization, no unapproved or
ungoverned publication, and no evidence/proof/reasoning bridge.
```
