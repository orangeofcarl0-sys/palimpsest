# External Asset Library Bridge — architecture

Plane: `src/external_assets/**` (G10-AE). It connects ONE Palimpsest project to
assets owned by an external knowledge library without becoming that library.

```text
Palimpsest                 = Durable Project Operating System
External Asset Library     = separately-owned reusable knowledge system
```

The external system remains the asset owner; Palimpsest remains the project
owner. There is no global asset store, no memory, no knowledge graph and no
external truth store inside this repository — not as a policy, as an absence of
code (asserted in `test/ae_external_assets.test.ts:529-538`).

## 1. The plane's modules

| Module | Owns | Key exports |
| --- | --- | --- |
| `refs.ts` | the value helpers, the typed error vocabulary and the ONE durable external reference | `ExternalAssetStableRef`, `externalAssetStableRefKey`, `ExternalAssetError`, `eaFail`, the strict `ea*` parsers |
| `provider.ts` | the versioned provider DEFINITION and the READ-ONLY port | `ExternalAssetProviderDefinition`, `ExternalAssetLibraryReadPort`, search/snapshot/materialization/latest-revision shapes |
| `registry.ts` | deployment CONFIG: which providers exist | `ExternalAssetLibraryRegistry { get, list }`, `externalAssetLibraryRegistryOf`, `emptyExternalAssetLibraryRegistry`, `externalAssetProviderDescriptors` |
| `service.ts` | the bridge operations over the existing owners | `makeExternalAssetBridgeService`, the reference candidate/provenance, the denial reasons, the two store adapters |
| `resolver.ts` | the DERIVED, read-only external view | `resolveExternalAssetView`, `ExternalAssetView` states |
| `import.ts` | explicit import into the `ProjectJournal` | `ExternalAssetImportCandidate`, `ExternalAssetImportProvenance`, `externalAssetImportOperationIdOf` |
| `publication.ts` | the exact outbound preview, the approval port and the write port | `ExternalAssetPublicationPreview`, `ExternalAssetPublicationAdmissionPort`, `ExternalAssetPublicationPort`, `ExternalAssetOutboundPayload` |
| `bridge_store.ts` | the narrow, append-only operation lineage | `SqliteExternalAssetBridgeStore`, `ExternalAssetBridgeRecord`, families |
| `effects.ts` | the governed external-effect seam | `palimpsest.external_asset.publish`, `defineExternalAssetEffects`, `probeExternalPublication` |
| `index.ts` | the barrel (no store-shaped export) | all of the above |

Dependency direction is one-way: the plane imports the existing
`project_workspace` owners (`association.js`, `journal.js`) and the schema
helpers; it imports NO Work, Proof or Reasoning owner
(`test/ae_external_assets.test.ts:498-527`).

## 2. The five v1 operations

| Operation | Kind | Service method(s) | Writes |
| --- | --- | --- | --- |
| `SEARCH` | read | `search(input)` | nothing (`service.ts:431-460`) |
| `INSPECT` | read | `inspect(input)` | nothing (`service.ts:462-471`) |
| `REFERENCE_TO_PROJECT` | prepare + explicit commit | `prepareReference` → `commitReference` | one `EXTERNAL_ASSET` ProjectAssetAssociation (`:527-651`) |
| `IMPORT_TO_PROJECT_JOURNAL` | prepare + explicit commit | `prepareImport` → `beginImport`/`commitImport` | one ProjectJournal entry + bridge receipts (`:655-834`) |
| `PUBLISH_PROJECT_JOURNAL_ENTRY` | prepare + separate approval + governed effect | `preparePublication` → `beginPublication`/`approveAndPublish` | one bridge terminal + one `PUBLISHED` association + the external write (`:838-1089`) |

No other operation exists. There is no `delete`, no `sync`, no `refresh`, no
`subscribe`. The service surface is exactly twelve verbs
(`src/external_assets/service.ts:367-382`):

```text
providers  search  inspect
prepareReference  commitReference
prepareImport  beginImport  commitImport
preparePublication  beginPublication  approveAndPublish
resolve
```

## 3. Provider ownership

| Concept | Owner | Never becomes |
| --- | --- | --- |
| The asset itself and its content | the external library | project content, evidence or truth |
| The asset's TYPE (`Paper`, `Idea`, `Method`, …) | the provider | a Palimpsest kind or ontology (`association.ts:30-36`) |
| The provider DEFINITION (id, version, capabilities, protocol digest) | the deployment's config | asset truth (`registry.ts:2-11`) |
| The project reference | the project | ownership of the external asset |
| The imported note | the project (its Journal) | the external asset |
| The published counterpart | the external library | a transfer of the local Journal |

The registry answers exactly two questions — which providers exist and what each
declares — and hands back the read port and, separately, the write port
(`src/external_assets/registry.ts:29-41`). An absent provider is `undefined`,
never a stub and never a default port (`:109-113`, `:125-128`).

## 4. The read / inspect / snapshot model

```text
search (query)         -> ExternalAssetSearchPage { hits[] }        EPHEMERAL
inspect (asset, digest)-> AVAILABLE(snapshot) | UNAVAILABLE(reason)  EXACT
materializeText (ref)  -> { text, contentDigest, mediaType }        OPTIONAL
latestRevision (asset) -> current revision                          OPTIONAL, read-only
```

Three rules make the model safe:

1. **A hit is a hint.** `ExternalAssetSearchHit.latestDigestHint` is documented as
   "what the provider's index currently points at … never sufficient for a
   durable reference" (`src/external_assets/provider.ts:170-176`).
2. **Inspect with a digest is an exact resolve.** A provider that answers with a
   different revision is reported `UNAVAILABLE / requested_digest_mismatch`
   (`provider.ts:240-249`, `service.ts:511-521`). The latest revision never
   silently substitutes. A provider that cannot expose a stable digest yields
   `stable_revision_unavailable`, which permits search and inspect but denies a
   durable reference or import (`provider.ts:16-19`, `service.ts:703-709`).
3. **A snapshot is descriptive.** `metadata` "grants no authority and is never
   copied by a reference" (`provider.ts:257-258`).

```
search hit  -->  inspect(exact digest)  -->  ExternalAssetSnapshot(ref, assetType, title, tags, metadata)
```

Only the `ref` can travel into project state, and only after an explicit commit.

## 5. Reference vs import vs publication

| | Reference | Import | Publication |
| --- | --- | --- | --- |
| Direction | inbound, pointer only | inbound, content copy | outbound |
| Result | one `EXTERNAL_ASSET` association (`associationKind: MANUAL`) | one Journal entry + structured provenance + bridge receipt | external asset + `PUBLISHED` association + bridge terminal |
| Content copied into the project? | **NO** (`test:810-830`) | YES, the exact bounded text only — and the plane HASHES the bytes it is about to copy against the referenced digest, so a provider cannot substitute text under a genuine digest (`provider.ts` `externalAssetTextDigestOf`; `test` R-01) | n/a |
| Requires an exact external digest? | YES (`refs.ts:200-209`) | YES, re-established at commit (provider configured, definition unchanged, revision still resolves, and the prepared body hashes to it) | n/a |
| Creates project truth? | NO | NO — a Journal note, not truth (`import.ts:1-23`) | NO |
| Approval | the explicit `commitReference` call | the explicit `commitImport` call | the separate admission port |
| Durability owned by | `ProjectAssetAssociation` | `ProjectJournal` + bridge receipts | bridge terminal + association |

The three nouns are deliberately different and must not be conflated:

```text
Association      != Ownership       a project link is not a property right
SearchResult     != ProjectReference a hit is not a durable link
ImportedNote     != ExternalAsset    a local copy is not the external original
Reference        != Import           a pointer is not a copy
Reference        != Publication      neither direction implies the other
```

## 6. Explicit reference (the content-free durable link)

```text
prepareReference(projectId, providerId, assetId, [contentDigest])
   -> ExternalAssetReferenceCandidate { projectId, externalRef, providerDefinitionDigest, projectBasis, candidateDigest }
      (READ-ONLY; commits nothing)
commitReference(candidate)
   re-checks 1: the project scope (revision + digest) still matches
   re-checks 2: the provider definition digest still matches and INSPECT is declared
   re-checks 3: the EXACT digest still resolves, for the exact revision
   -> one ProjectAssetAssociation { assetKind: EXTERNAL_ASSET, canonicalRef: provider/asset/digest,
                                     associationKind: MANUAL, provenance: refs+digests }
   else -> STALE_REFERENCE_CANDIDATE with ZERO writes
```

Source: `src/external_assets/service.ts:194-206`, `:527-574`, `:576-651`.
The candidate digest covers the exact provider definition and the project basis,
so a candidate prepared against a moved project or a rotated provider cannot be
committed later.

Reference durability is deliberately NOT duplicated in the bridge store
(`test/ae_external_assets.test.ts:800-801`).

## 7. Explicit import (the content copy)

```text
prepareImport(projectId, externalRef, journalKind, title, [sourceLocator])
   - journalKind is REQUIRED and validated against PROJECT_JOURNAL_KINDS
   - MATERIALIZE_TEXT capability required
   - the materialized digest MUST equal the stable ref's contentDigest
   - non-text media type  -> binary_content   (denied)
   - byte length > bound  -> content_too_large (denied, never truncated)
   - empty text           -> refused by the strict materialization parser
   -> ExternalAssetImportCandidate { operationId, entry, provenance, textDigest, candidateDigest }
beginImport(candidate)   -> writes EXTERNAL_IMPORT_PREPARED (idempotent)
commitImport(candidate)  -> appends the exact Journal entry, then EXTERNAL_IMPORT_COMMITTED
```

The candidate already CONTAINS the exact local Journal entry it will append, so
the local write is deterministic and the operation id is derivable
(`src/external_assets/import.ts:77-92`, `:262-328`). The entry carries structured
provenance — a canonical-JSON `ExternalAssetImportProvenance` in `provenance` plus
`relatedRefs` naming the exact external revision key and the provenance digest —
so a prose-only lookalike cannot pass (`import.ts:61-65`, `:210-234`).

## 8. Outbound publication (see the dedicated boundary doc)

```text
preparePublication(projectId, providerId, targetAssetType, journalEntryId)
   -> ExternalAssetPublicationPreview (the exact bytes that will leave)
beginPublication(preview)      -> EXTERNAL_PUBLICATION_PREPARED (zero external effect)
approveAndPublish(preview)     -> admission -> governed effect -> terminal + association
```

The preview shows exactly: the selected entry's `title` and `body`, plus the
identity labels `palimpsest_journal_entry_id`, `palimpsest_journal_entry_digest`
and `palimpsest_journal_kind` (`src/external_assets/publication.ts:78-86`). No
journal provenance prose, no `relatedRefs`, no other entry, no project id, no
goal, no chain-of-thought and no retrieved external content leaves
(`publication.ts:14-20`; AE-N25 at `test:1559-1604`).

## 9. The bridge store owns operation lineage ONLY

```text
external_asset_bridge ( project_id, sequence, record_id, family, operation_id,
                        record_json, record_digest, previous_record_digest, recorded_at )
```

`SqliteExternalAssetBridgeStore` records two facts the product previously could
not state:

> external X was imported into local Journal Y
> local Journal Y was published as external X

It stores REFS and DIGESTS, never asset content — no titles, no bodies, no
summaries, no credentials (`src/external_assets/bridge_store.ts:1-24`, record
shape at `:58-89`). Five families form the two-phase protocol
(`bridge_store.ts:49-56`):

```text
EXTERNAL_IMPORT_PREPARED   -> EXTERNAL_IMPORT_COMMITTED
EXTERNAL_PUBLICATION_PREPARED -> EXTERNAL_PUBLICATION_COMMITTED | EXTERNAL_PUBLICATION_FAILED
```

Each family's required fields are enforced on the way IN and on the way OUT
(`bridge_store.ts:145-188`, `:357-362`), and the per-project chain carries
`sequence` + `previousRecordDigest` + a recomputable `recordDigest` with
`verifyChain` (`:416-435`). The store owns NO canonical truth: it is not read by
the workspace view, the operating history or any posture. Reference-only
durability stays in `ProjectAssetAssociation`.

## 10. Firewalls (exact, and where they are enforced)

| Firewall | Enforcement |
| --- | --- |
| `ExternalAsset != ProjectAsset` | a project link is one `EXTERNAL_ASSET` association with an opaque ref; no content field exists (`service.ts:632-648`) |
| `ExternalAsset != ProjectContext` | no injection entry point, no startup hook, no watcher; AE-N02/N03/N16 |
| `ExternalAsset != WorkEvidence` / `ProofEvidence` / `ReasoningClaim` / `Decision` | the plane cannot import those owners (structural firewall `test:498-527`); AE-N13/N14/N15 |
| `ExternalAsset != Truth` | no truth vocabulary; the snapshot's metadata is descriptive only (`provider.ts:257-258`) |
| `SearchResult != StableAssetRef` | a hit is ephemeral and digest-optional; only an exact inspect yields a ref (`provider.ts:162-177`, `:240-249`) |
| `SearchRanking != Applicability` | `searchScore` is provider ranking only and is never persisted (`provider.ts:169`); AE-N02 |
| `SemanticMatch != Applicability` | no applicability vocabulary exists; §30 test at `test:1777-1786` |
| `Reference != Import` | two different candidates, two different commits, two different owners |
| `Import != TruthAdmission` | an imported entry is a Journal note; the Journal excludes PROOF/DECISION/TASK (`journal.ts:29`) |
| `Import != Task` | the plane reaches no scheduler; AE-N28 keeps an imported OPPORTUNITY out of Work until explicit `promoteOpportunity()` |
| `Import != Evidence` | no Work event is emitted; AE-N13/N14/N15 |
| `PublicationPreview != Publication` | the preview reads the journal and calls nothing; AE-N18 |
| `PublicationReceipt != Truth` | the receipt is refs+digests in the bridge store, with no content and no authority |
| `ExternalLatest != ReferencedRevision` | the derived view surfaces a newer digest but never adopts it; AE-N05/N18-shaped test at `test:910-943` |
| `ProviderUnavailable != AssetFalse` | a missing/failed provider yields `PROVIDER_UNAVAILABLE` and the association REMAINS (`resolver.ts:102-121`); AE-N06 |
| `Association != Ownership` | the association is an opaque ref; the bridge's association port pins the kind and records no content (`service.ts:1374-1398`) |
| `GlobalAsset != ProjectContext` | the registry is never consulted automatically and the plane is never a context source (`registry.ts:2-11`) |

## 11. Boundary honesty (HONEST / PENDING)

### 11.1 The composed surface faces (present in this tree)

| Face | What it exposes | Where |
| --- | --- | --- |
| plane service | all twelve verbs, including `commitReference` / `commitImport` / `approveAndPublish` | `src/external_assets/service.ts:367-382` |
| installed surface | the plane service plus `store` and `registry`; OPERATOR-facing (the install object is host-owned) | `src/install.ts:646-660`, `:1943-1952` |
| application surface | `providers / search / inspect / prepareReference / prepareImport / preparePublication` (reads + read-only candidates) AND the operator-explicit `commitReference / commitImport / approveAndPublish` | `src/application/surface.ts:628-650`, composed at `:1298-1324` |
| agent tool | `palimpsest_external_assets` with exactly `providers / search / inspect / prepare_reference / prepare_import / prepare_publication`, `mode: "read-only"`; NO commit and NO approve action exists | `src/tools/application_tools.ts:828-911` |
| HTTP | `GET /api/external-assets/{providers,search,inspect}` and `POST /api/external-assets/{prepare-reference,prepare-import,prepare-publication,commit-reference,commit-import,approve-publish}`, plus the `externalAssets` discovery flag | `src/application/http.ts:863-962`, flag at `:160-162` |
| derived workspace view | `ProjectWorkspaceView.external` — `bridgeConfigured`, `references` (each labelled `EXTERNAL_OWNER` and `PROJECT_REFERENCE` or `PUBLISHED_EXTERNAL_COUNTERPART`), `providerAvailability`, `imports`, `warnings` | `src/project_workspace/view.ts:169-296` (types), `:594-670` (`externalViewOf`), field at `:273-274` |

Two design points worth stating exactly:

- The APPLICATION surface is the OPERATOR face and therefore DOES expose the
  three commit/approve verbs (§28); it is the AGENT tool that must not, and it
  does not. Ordinary HTTP authentication is never publication approval: the
  publication still requires the plane's separate admission port
  (`src/application/http.ts:850-861`).
- A missing bridge is reported as MISSING, not as an empty known library:
  `bridgeConfigured: false` plus a warning (`src/project_workspace/view.ts:604-615`),
  and the workspace service returns a warning-bearing empty source if the bridge
  throws (`src/project_workspace/service.ts:355-379`). The bridge itself is
  composed lazily, after the workspace service, through a wiring holder
  (`src/install.ts:1668-1705`, `:1951-1956`).

**HONEST (coverage):** the composed surface and the derived workspace view were
now pinned by `test/ae_integration.test.ts` (19 tests), `e2e/external-assets.spec.ts`
(7 tests) and the gate-review regressions R-01…R-05.

```text
application surface / HTTP routes / agent tool / derived view
                  test/ae_integration.test.ts
web External Assets tab (§27)
                  e2e/external-assets.spec.ts
separate-PROCESS provider fixture + §38 dogfood
                  test/fixtures/external_library_server.mjs,
                  scripts/external_assets/ae-dogfood.mjs (30/30, pass=true)
```
