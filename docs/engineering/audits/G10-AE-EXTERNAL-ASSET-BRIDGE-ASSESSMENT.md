# G10-AE — External Asset Library Bridge assessment (AE0 mandatory audit)

Stage: **External Asset Library Bridge & Explicit Project Reuse**.
Baseline audited: `a45f7c81bad07551c9c879b0048dba0df042cd30` (`main`).
Method: source read over the pre-integration tree. Every baseline claim below is
asserted against a `file:line` in that tree and re-derivable with
`git show a45f7c8:<path>`; the line number is the line in the PRE-integration
file, not the current one. Claims about the delivered plane cite the current
tree.

```text
Audit conclusion: an external owner could NOT be represented, no local owner
                  accepted an import, and NOTHING in the product could reach
                  external knowledge at all. All five §4 questions are answered
                  below with evidence.
```

## 1. Question 1 — can `ProjectAssetAssociation` represent an external owner today?

**Answer: NO — the ref shape fits, the vocabulary does not.**

| Step | Finding | Evidence (pre-integration) |
| --- | --- | --- |
| Ref shape | Nominal | `CanonicalAssetRef` was already opaque: `{ kind: string; id: string; digest?: string }`. A provider id / asset id pair could be encoded without a schema change. | `src/project_workspace/association.ts:144-148` |
| Kind vocabulary | **BLOCKING** | `assetKind` is validated against the closed `PROJECT_ASSET_KINDS` enum, which held exactly seven kinds — `DECISION, PRODUCED_ARTIFACT, PROOF_CLAIM, EXPERIMENT, JOURNAL_ENTRY, CAMPAIGN, REASONING_CELL` — all of them Palimpsest-owned. It had no member for an asset owned by another system. | `src/project_workspace/association.ts:31-39`, validated at `:215` |
| Digest | **INSUFFICIENT** | `digest` was OPTIONAL on the ref, so a durable external association could be written with no exact revision (which §6 forbids for external). | `src/project_workspace/association.ts:146`, `parseCanonicalAssetRef` at `:156-165` |
| Auto-context | none | The workspace view is derived; `byKind` and `historySummary` are pure folds over the association list. No external source existed. | `src/project_workspace/view.ts:273-310` |

**What had to change (§5): exactly one additive kind.**

```text
src/project_workspace/association.ts   PROJECT_ASSET_KINDS += "EXTERNAL_ASSET"
```

The change is nine lines: the header comment plus one enum member
(`src/project_workspace/association.ts:30-48`). The provider's own asset type
(`Paper`, `Idea`, `Method`, `Dataset`, `Example`, …) is deliberately NOT added;
it stays provider-owned metadata (`:30-36`, pinned by AE-N07 at
`test/ae_external_assets.test.ts:574-588`).

The digest requirement is imposed by the BRIDGE's own association port, not by
the shared artifact: `ExternalAssetAssociationInput` types `digest` as a
required string and `sqliteExternalAssetAssociationPort` re-validates it with
`eaDigest` (`src/external_assets/service.ts:134-144`, `:1374-1398`).

**HONEST:** the shared `ProjectAssetAssociation` artifact still allows an
`EXTERNAL_ASSET` with no digest through the ordinary workspace writer
`projectWorkspace.associateAsset(...)` (`src/project_workspace/service.ts:398-410`
plus the optional digest at `association.ts:153-163`). The bridge path cannot
produce one, and the derived view refuses to guess for one — it reports a
warning instead (`src/external_assets/resolver.ts:94-100`). This is a residual
reachability gap, recorded as `CF-AE-07` in the carry-forward, not a defect in
the bridge's own path.

## 2. Question 2 — which local asset owner is suitable for explicit import?

**Answer: the `ProjectJournal`, and it is the only candidate.**

| Candidate owner | Why it is NOT an import target |
| --- | --- |
| ProjectIR Decisions | Canonical ProjectIR truth; writes go through `controller.plan` and mint a project revision (`src/project_workspace/service.ts:441-449`). Importing an external note as a Decision would make a foreign assertion project truth. |
| Work Evidence / Attempts / Task state | Owned by the controller and the scheduler; not writable from a workspace seam at all. |
| Proof evidence / claims | Owned by the proof plane with its own publication admission (`src/proof_asset/service.ts`, referenced by AD's §27 checks). |
| Reasoning claims | Owned by `reasoning_cell` with its own verification/admission policies. |
| Commitments / Boundary artifacts | Owned by their own planes with their own disclosure semantics. |
| **ProjectJournal** | **The ONE owner for project knowledge with no other canonical owner** (`src/project_workspace/journal.ts:1-14`). |

The Journal's kind enum structurally excludes
`PROOF / DECISION / TASK / EXPERIMENT / COMMITMENT / BOUNDARY / SOURCE`
(`src/project_workspace/journal.ts:5-9`, `:29`), so an import can never collide
with another owner: it can only append one `IDEA`, `OPEN_QUESTION`,
`NEGATIVE_RESULT`, `OPPORTUNITY` or `REFERENCE_NOTE`. The bridge's ONLY journal
write seam is `sqliteExternalAssetJournalPort` (`src/external_assets/service.ts:1348-1371`),
and `prepareImport` refuses any kind outside `PROJECT_JOURNAL_KINDS`
(`:659-667`; AE-N09 at `test:1023-1041`).

The five non-Journal owners are not merely refused — they are unreachable: no
module of `src/external_assets/` imports the Work, Proof or Reasoning owners
(structural firewall, `test/ae_external_assets.test.ts:498-527`).

## 3. Question 3 — which project-local knowledge can be published without violating another canonical owner?

**Answer: only a `ProjectJournalEntry`.**

The Journal entry is the one artifact whose owner is the Journal itself: its
`provenance` and `relatedRefs` are its own fields
(`src/project_workspace/journal.ts:106-114`). Every other candidate artifact is
another owner's canonical record, and publishing it would require that owner's
disclosure/admission design rather than a bridge:

```text
Decision            -> ProjectIR canonical content, owned by controller.plan
Work Evidence       -> controller-owned, has its own admission
Proof source/claim  -> proof plane publication admission
Attempt / Commitment-> their own planes' disclosure semantics
Boundary artifact   -> boundary plane disclosure semantics
Verification run    -> G10-AD protocol result, grants nothing
```

Consequently v1 sources exactly one journal entry, at three layers that agree:

| Layer | Mechanism | Location |
| --- | --- | --- |
| prepare | reads the entry through the journal port; refuses anything not recorded as a journal entry | `src/external_assets/service.ts:854-873` |
| payload | `externalAssetOutboundPayloadOf` takes a `ProjectJournalEntry` and emits title/body + three identity labels only | `src/external_assets/publication.ts:78-113` |
| effect | re-reads the local entry, re-checks its digest and re-derives the payload digest before the provider is called | `src/external_assets/effects.ts:164-185` |

Pinned by AE-N20 (`test:1342-1353`) and AE-N25 (`test:1559-1604`).

## 4. Question 4 — can Ordarium safely host publication?

**Answer: YES — the existing reconcilable effect discipline already supplies the
two properties outbound publication needs.**

| Property publication needs | Existing mechanism | Location |
| --- | --- | --- |
| A single governed effect path, not an ungoverned HTTP call | the shared Safe-Action runtime and ledger | `src/effects/runtime.ts:53-76`, `invoke` at `:137-154` |
| An operation identity that makes a retry the SAME operation | the action's `key` plus a durable operation-key idempotency window | `src/external_assets/effects.ts:265-267`; the model is `palimpsest.git.promote` at `src/effects/actions.ts:158-183` |
| Recovery of an uncertain attempt instead of a blind retry | the `reconcile` hook | `src/external_assets/effects.ts:277-312` |
| Classification of a caught failure without executing anything | `probeExternalPublication` (read-only provider probe) | `src/external_assets/effects.ts:325-351` |
| Observable evidence that governance, not the caller, authorized the send | the Ordarium ledger record | asserted in `test/ae_external_assets.test.ts:1453-1459` (`actionName` = `palimpsest.external_asset.publish`, `effectKind` = `reconcilable`, `idempotencyMode` = `operation-key`, `state` = `succeeded`) |

The one thing Ordarium cannot know is whether an uncertain EXTERNAL write
landed. That is why AE requires the provider to be idempotent by `publicationId`
or reconcilable (`src/external_assets/registry.ts:87-98` refuses any other
configuration at composition time) and implements the probe on the AE side.
Because the provider contract carries that guarantee, Ordarium is a safe host.
Pinned by AE-N21/N22/N23 (`test:1441-1477`, `:1663-1698`).

## 5. Question 5 — does any current path auto-search or auto-contextualize external knowledge?

**Answer: NO. This is proven by the absence of the concept, not by policy.**

| Claim | Evidence |
| --- | --- |
| No external-library concept existed at baseline. | `git grep -i external a45f7c8 -- src/` returns only unrelated senses: `ExternalEvidenceRef` (reasoning candidates), `external_signal` (Campaign prospective memory), `external_peer` / `external_boundary` (runtime projections), "external effect" (Ordarium/git), `external_head_divergence`. There is no provider registry, no read port and no provider config anywhere. |
| No startup/top-k injection hook consumed external knowledge. | The only retrieval planes derive from the project itself: the requirement compiler is a pure function over existing projections with "no I/O, no model calls" (`src/context/requirement.ts:1-16`) and the manifest records what an attempt was compiled against, on-chain (`src/context/manifest.ts:1-13`). Neither has a library source. |
| The delivered plane cannot watch or auto-fetch. | Source firewall: no module of `src/external_assets/` contains `setInterval`, `watchFile`, `fs.watch` or `chokidar`, and none names `personal_asset_store`, `global_memory`, `knowledge_graph` or `external_truth_store` (`test/ae_external_assets.test.ts:529-538`). |
| Nothing is composed unless the operator asks. | The bridge exists only when `options.externalAssetProviders` is supplied (`src/install.ts:1829-1835`; a bare install composes nothing, `test:1808-1815`). |
| Search and inspect touch no project state. | `search` validates and returns; the code states "Nothing above touched a store" (`src/external_assets/service.ts:431-460`). `inspect` is a pure provider read (`:462-471`). Pinned by AE-N02/N03/N16 (`test:592-662`, `:715-725`, `:1869-1886`). |
| No lifecycle hook refreshes the library. | AE-N31-shaped assertion: after a clock advance and a real delay, the bridge history and the provider's inspect counter are unchanged (`test:1788-1800`). |

**HONEST:** the install-level "no auto-context" proof is a before/after
comparison of `projectWorkspace.view()` and `controller.orchestrationGraph()`
around a search+inspect (`test:1869-1886`), not an enumeration of every future
consumer. The durable claim is the structural one: the plane has no injection
entry point, and no module can reach an external source except through the
explicitly named provider registry.

## 6. Gap analysis — what AE had to build

| Gap found by AE0 | Required by | Delivered as |
| --- | --- | --- |
| No external vocabulary in `ProjectAssetKind` | §5 | one additive `EXTERNAL_ASSET`; provider types stay provider-owned (`association.ts:30-48`) |
| No durable external reference type | §6 | `ExternalAssetStableRef` with a REQUIRED sha256 `contentDigest` (`refs.ts:200-233`) |
| No provider definition / registry | §7 | versioned digest-bound `ExternalAssetProviderDefinition` + frozen `ExternalAssetLibraryRegistry` (`provider.ts:59-124`, `registry.ts:38-128`) |
| No read-only library port | §8 | `ExternalAssetLibraryReadPort` with ephemeral search hits (`provider.ts:428-450`) |
| No exact-revision resolve | §9 | `inspect` returns the requested digest or `UNAVAILABLE`; a mismatched answer becomes `requested_digest_mismatch` (`provider.ts:240-249`, `service.ts:479-523`) |
| Digest optional on an association | §10 | the bridge association port requires a canonical sha256 (`service.ts:134-144`, `:1374-1398`) |
| No explicit reference candidate/commit | §11 | `ExternalAssetReferenceCandidate` + three re-checks at commit (`service.ts:194-206`, `:576-651`) |
| No derived external view | §12/§26 | `resolveExternalAssetView` reports RESOLVED / PROVIDER_UNAVAILABLE / REVISION_UNAVAILABLE and surfaces a newer revision without adopting it (`resolver.ts:80-208`) |
| No import path into an existing owner | §14–§16 | explicit-kind import into the Journal with structured provenance (`import.ts:262-328`) |
| No bridge history | §17/§18 | append-only `SqliteExternalAssetBridgeStore` with two-phase families (`bridge_store.ts:49-56`, `:275-436`) |
| No outbound publication / approval / effect | §19–§25 | exact preview, separate admission port, governed `palimpsest.external_asset.publish` reconcilable action (`publication.ts`, `effects.ts`) |
| No test-only external owner | §32 | `test/fixtures/external_library_fixture.ts` over its OWN sqlite file (TEST-ONLY, `:1-36`) |

## 7. Design decisions taken (and the alternatives rejected)

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| One additive `EXTERNAL_ASSET` kind; provider ontology stays provider-owned | Adding `Paper` / `Idea` / `Method` / `Dataset` / `Example` to `PROJECT_ASSET_KINDS` | §5: adding them would make provider vocabulary a Palimpsest universal asset ontology, and would make external assets indistinguishable from owned project assets. AE-N07. |
| `contentDigest` is structurally required on the durable ref | Reusing the shared ref with an optional digest | §6: "a reference without an exact revision is not durable". `parseExternalAssetStableRef` requires the field and re-derives `refDigest` (`refs.ts:235-262`). |
| A search hit is EPHEMERAL; durability needs `inspect` → exact snapshot | Persisting search hits, or treating `latestDigestHint` as the referenced revision | §8/§12: ranking is not truth and latest is not the referenced revision. `ExternalAssetSearchHit.latestDigestHint` is documented as a hint only (`provider.ts:170-176`). AE-N01/N05. |
| Import targets ONLY the existing Journal and the caller names the kind | A new import store, or an automatic provider-type → Journal-kind mapping | §14: the Journal is the only owner with no other canonical owner; a mapping table would make a provider type into a Palimpsest kind. There is no mapping table in the plane, and the import path never sees `assetType` (structural test `:563-572`). AE-N09/N10. |
| Text materialization is optional, digest-checked and BOUNDED (block, never truncate) | Truncating, summarizing, or importing oversized/binary content | §15: hidden truncation and LLM summarization inside import are both forbidden. `DEFAULT_MAX_IMPORTED_TEXT_BYTES = 262144` (`service.ts:111`); `content_too_large` / `binary_content` / `digest_mismatch` (`:711-734`). AE-N11/N12. |
| Bridge receipts store refs + digests only, and durability for reference-only stays in the association store | A bridge store that also records imported content, or that duplicates reference durability | §17: "It owns operation lineage/receipts only, not asset content." The record shape has no title/body/summary field (`bridge_store.ts:58-89`). AE-N27. |
| Publication goes through a governed Ordarium effect with a separate admission port | Calling the provider write from the Workspace/Web/tools, or treating HTTP auth / management mode as approval | §21/§22. The admission port receives ONLY the preview (`publication.ts:304-321`; the test observes exactly one key, `test:1410-1438`), and the effect input binds exactly the eight §22 fields (`effects.ts:48-57`). AE-N17/N19/N21. |
| The publication crash window is recovered by probing the provider, not by blind retry | Retrying the provider write after any failure | §23/§24: "Never blind-retry an uncertain non-idempotent publication." `approveAndPublish` probes on a caught failure and only recovers a `PUBLISHED` outcome (`service.ts:976-1012`). AE-N22/N23. |
| The test provider is obviously TEST-ONLY and owns a separate sqlite file | A shipped "personal asset store" | §32: the fixture is labelled TEST-ONLY and must not become a shipped store (`test/fixtures/external_library_fixture.ts:1-36`). A store-shaped name is still forbidden by V-N05 (`test/v_adversarial.test.ts:176-190`). |

## 8. Honest limitations of this audit

1. **Source audit.** It proves the absence of an external-knowledge path from
   the tree, not from a running deployment. A host could always have implemented
   a library outside this repository; the audit asserts that no such seam
   existed in the public install options or any shipped module, which is what the
   five §4 questions ask.
2. **Question 1 is answered about the FULL current tree, not only the baseline.**
   The baseline ref shape is quoted from `a45f7c8`; the `EXTERNAL_ASSET` kind and
   the bridge's digest pinning are quoted from the current tree because they are
   the delivered change.
3. **The install-level "no Work/Proof/Decision mutation" proof** diffs the real
   `projects`/`events` tables and the controller status
   (`test:1834-1867`). It covers the install path; a hand-composed plane service
   is covered by the structural firewall instead (the plane cannot import those
   owners).
4. **`CF-AE-07` is a real residual reachability gap, not a hidden one**: the
   shared workspace writer can still append a digest-less `EXTERNAL_ASSET`
   association. It is surfaced in the derived view and carried with a trigger.
