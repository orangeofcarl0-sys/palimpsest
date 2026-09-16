# G10-AE — External Asset Library Bridge specification (frozen)

Stage: **External Asset Library Bridge & Explicit Project Reuse** — let one
Palimpsest project explicitly discover, inspect, reference and import assets owned
by an external library, and explicitly publish narrowly-scoped project knowledge
back, while the external system remains the asset owner and Palimpsest remains the
project owner.

Baseline: `a45f7c81bad07551c9c879b0048dba0df042cd30`.
Audit: `G10-AE-EXTERNAL-ASSET-BRIDGE-ASSESSMENT.md`.
Architecture: `EXTERNAL-ASSET-LIBRARY-BRIDGE.md`, `EXTERNAL-ASSET-PROVIDER-CONTRACT.md`,
`EXTERNAL-ASSET-PUBLICATION-BOUNDARY.md`.
Deliverables: the plane `src/external_assets/**` (frozen by
`test/ae_external_assets.test.ts`, 70 tests) plus one additive `ProjectAssetKind`
and the install wiring.

```text
This stage is NOT: a Personal Intellectual Asset System, a global memory, a
universal asset ontology, automatic retrieval/context injection, a cross-project
graph, or hidden publication.
```

## 1. Firewalls

```text
ExternalAsset   != ProjectAsset      ExternalAsset   != ProjectContext
ExternalAsset   != WorkEvidence      ExternalAsset   != ProofEvidence
ExternalAsset   != ReasoningClaim    ExternalAsset   != Decision
ExternalAsset   != Truth

SearchResult    != StableAssetRef    SearchRanking   != Applicability
SemanticMatch   != Applicability     GlobalAsset     != ProjectContext

Reference       != Import            Import          != TruthAdmission
Import          != Task              Import          != Evidence

PublicationPreview != Publication    PublicationReceipt != Truth
ExternalLatest  != ReferencedRevision
ProviderUnavailable != AssetFalse    Association     != Ownership
```

## 2. Operations and surface

| Operation | Method(s) | Result type |
| --- | --- | --- |
| `SEARCH` | `search` | `ExternalAssetSearchPage` |
| `INSPECT` | `inspect` | `ExternalAssetInspection` (AVAILABLE / UNAVAILABLE) |
| `REFERENCE_TO_PROJECT` | `prepareReference`, `commitReference` | `PREPARED(candidate)` / `DENIED` / `COMMITTED` / `STALE_REFERENCE_CANDIDATE` |
| `IMPORT_TO_PROJECT_JOURNAL` | `prepareImport`, `beginImport`, `commitImport` | `PREPARED(candidate)` / `DENIED` / `COMMITTED` / `STALE_IMPORT_CANDIDATE` |
| `PUBLISH_PROJECT_JOURNAL_ENTRY` | `preparePublication`, `beginPublication`, `approveAndPublish` | `ExternalAssetPublicationResult` = `PUBLISHED` / `NOT_APPROVED` / `FAILED` |
| derived view | `resolve`, `providers` | `ExternalAssetDerivedView`, provider descriptors |

Source: `src/external_assets/service.ts:367-382`. No other operation exists.

### 2.1 The composed faces

| Face | Read/prepare | commitReference / commitImport / approveAndPublish | Where |
| --- | --- | --- | --- |
| plane service | the six read/prepare verbs | yes | `src/external_assets/service.ts:367-382` |
| installed surface | yes | yes (host-owned install object) | `src/install.ts:646-660` |
| application surface (operator/UI) | yes | yes — §28 names these OPERATOR-EXPLICIT | `src/application/surface.ts:628-650`, `:1298-1324` |
| agent tool `palimpsest_external_assets` | yes (six actions, `mode: "read-only"`) | **no action exists** | `src/tools/application_tools.ts:828-911` |
| HTTP | `GET /api/external-assets/{providers,search,inspect}` | `POST /api/external-assets/{commit-reference,commit-import,approve-publish}` | `src/application/http.ts:863-962`; discovery flag at `:160-162` |

Prepare inputs default the project to the installation's own project; naming
another project can never widen scope because the plane refuses a project the
deployment does not hold (`src/application/surface.ts:1303-1316`).

### 2.2 The derived Project Workspace external view (§26)

`ProjectWorkspaceView.external: ProjectWorkspaceExternalView`
(`src/project_workspace/view.ts:255-296`, field at `:273-274`) carries:

```text
bridgeConfigured      FALSE ⇒ no bridge at all (not an empty, known library)
references[]          ownership EXTERNAL_OWNER + relation PROJECT_REFERENCE | PUBLISHED_EXTERNAL_COUNTERPART,
                      providerId, assetId, referencedDigest, stableRefKey, associationKind, recordedAt,
                      providerAvailable, resolution, derived assetType/title/sourceLocator,
                      newerRevisionAvailable + latestDigestHint + latestRevisionLabel, detail
providerAvailability  per provider id
imports[]             journal entries whose STRUCTURED provenance names an external revision
warnings[]            an unresolved provider is reported as an unresolved link, not a false asset
```

The derivation is `externalViewOf` (`src/project_workspace/view.ts:594-670`),
which re-shapes the bridge plane's OWN `resolve(projectId)` and joins it to the
project's existing association records. It fetches nothing, persists nothing, and
reports a resolution with no matching association record as a warning rather than
inventing provenance. The workspace service asks the bridge through
`ProjectWorkspaceExternalAssetsPort` / `ProjectWorkspaceExternalImportPort`
(`src/project_workspace/service.ts:84-115`, `:355-396`); the bridge is composed
after the workspace service through a lazy wiring holder (`src/install.ts:1668-1705`).

## 3. Types (frozen shapes)

### 3.1 External reference

```ts
interface ExternalAssetStableRef {
  schemaVersion: 1;
  providerId: string;
  assetId: string;
  contentDigest: string;      // REQUIRED: a reference without an exact digest is not durable
  revisionLabel?: string;     // provider-owned, descriptive only
  refDigest: string;          // derived
}
```

Source: `src/external_assets/refs.ts:200-209`. `externalAssetStableRefKey` is
`providerId/assetId@contentDigest` (`:270-272`), so a newer revision of the same
asset is deliberately a DIFFERENT key.

### 3.2 Provider

```ts
interface ExternalAssetProviderDefinition { providerId; version; displayName; capabilities; protocolDigest; digest }
type ExternalAssetProviderCapability = "SEARCH" | "INSPECT" | "MATERIALIZE_TEXT" | "PUBLISH";
interface ExternalAssetLibraryRegistry { get(providerId): Provider | undefined; list(): readonly Provider[] }
interface ExternalAssetLibraryProvider { read: ExternalAssetLibraryReadPort; publication?: ExternalAssetPublicationPort }
```

Source: `provider.ts:43-66`, `registry.ts:29-41`.

### 3.3 Search / snapshot / materialization

```ts
interface ExternalAssetSearchHit  { providerId; assetId; assetType; title; summary?; searchScore?; latestDigestHint? }
interface ExternalAssetSnapshot   { ref; assetType; title; summary?; tags[]; metadata; sourceLocator? }
interface ExternalAssetTextMaterialization { text; contentDigest; mediaType: "text/plain" | "text/markdown" }
interface ExternalAssetInspectRequest { providerId; assetId; contentDigest? }
```

Source: `provider.ts:162-177`, `:251-260`, `:364-369`, `:240-249`.

### 3.4 Candidates, previews, receipts

```ts
interface ExternalAssetReferenceCandidate { schemaVersion:1; projectId; externalRef; providerDefinitionDigest; projectBasis; candidateDigest }
interface ExternalAssetImportCandidate    { schemaVersion:1; operationId; projectId; externalRef; providerDefinitionDigest; journalKind; entry; provenance; textDigest; candidateDigest }
interface ExternalAssetPublicationPreview { schemaVersion:1; publicationId; provider; projectId; localJournalRef; localJournalDigest; targetAssetType; outboundTitle; outboundBody; outboundMetadata; payloadDigest; digest }
interface ExternalAssetBridgeRecord       { schemaVersion:1; recordId; projectId; family; operationId; providerId; providerDefinitionDigest; publicationId?; targetAssetType?; payloadDigest?; previewDigest?; journalEntryId?; journalEntryDigest?; journalKind?; externalAssetId?; externalContentDigest?; externalRefDigest?; externalRevisionLabel?; candidateDigest?; reason?; recordedAt; sequence; previousRecordDigest; recordDigest }
```

Source: `service.ts:194-201`, `import.ts:240-254`, `publication.ts:124-138`,
`bridge_store.ts:58-89`.

## 4. Digests

Every durable artifact carries a derived digest; the domain strings are:

| Artifact | Domain | Where |
| --- | --- | --- |
| stable ref | `palimpsest.external-assets.stable-ref.v1` | `refs.ts:198` |
| provider definition | `palimpsest.external-assets.provider-definition.v1` | `provider.ts:56-57` |
| reference provenance | `palimpsest.external-assets.reference-provenance.v1` | `service.ts:167-168` |
| reference candidate | `palimpsest.external-assets.reference-candidate.v1` | `service.ts:169-170` |
| import provenance | `palimpsest.external-assets.import-provenance.v1` | `import.ts:53-54` |
| import operation id | `palimpsest.external-assets.import-operation.v1` | `import.ts:55-56` |
| import candidate | `palimpsest.external-assets.import-candidate.v1` | `import.ts:57-58` |
| outbound payload | `palimpsest.external-assets.publication-payload.v1` | `publication.ts:50-51` |
| publication preview | `palimpsest.external-assets.publication-preview.v1` | `publication.ts:52-53` |
| publication id | `palimpsest.external-assets.publication-id.v1` | `publication.ts:54-55` |
| bridge record / id | `palimpsest.external-assets.bridge-record.v1` / `…bridge-record-id.v1` | `bridge_store.ts:44-46` |

Rules:

| Rule | Enforcement |
| --- | --- |
| A digest is always 64 lowercase hex (sha256). | `eaDigest` (`refs.ts:144-149`); the shared `pwDigest` in the association owner. |
| A candidate/preview parses only if its digest is re-derivable. | `parseExternalAssetReferenceCandidate` (`service.ts:1291-1294`), `parseExternalAssetImportCandidate` (`import.ts:405-408`), `parseExternalAssetPublicationPreview` (`publication.ts:285-292`). |
| A bridge record is content-addressed AND chain-linked. | `recordId` covers content + sequence + previous digest (`bridge_store.ts:190-200`); `verifyChain` recomputes (`:417-435`). |
| The import operation id is derived from five inputs. | project id, external stable ref, target Journal kind, exact text digest, provider definition digest (`import.ts:77-92`). |

Identifiers: publication id `pub-<32 hex>`, import operation id `imp-<32 hex>`,
bridge record id `xab-<32 hex>`, association id `paa-<32 hex>`, journal entry id
and event id content-addressed in the existing owners.

## 5. Reason and error codes

### 5.1 Service denial reasons (`ExternalAssetDenied`)

`src/external_assets/service.ts:213-235`. All twelve are used.

| Reason | Meaning |
| --- | --- |
| `stable_revision_unavailable` | the provider cannot expose a stable digest/revision |
| `provider_unavailable` | the provider is not configured or did not answer |
| `unknown_provider` | the named provider is not in the registry |
| `capability_not_available` | the provider does not declare the required capability |
| `requested_digest_mismatch` | the provider answered for a different revision |
| `asset_not_found` | the exact asset/revision does not exist |
| `unknown_project` | this deployment does not hold the project |
| `journal_kind_required` | the caller did not select an existing Journal kind |
| `content_unavailable` | no text could be materialized |
| `binary_content` | the content is not bounded text |
| `digest_mismatch` | the materialized digest is not the referenced digest |
| `content_too_large` | the content exceeds `maxImportedTextBytes` (never truncated) |

### 5.2 Typed errors (`ExternalAssetError`)

`src/external_assets/refs.ts:45-70`. Thrown for programming/contract failures:
`unknown_provider`, `capability_not_available`, `unknown_project`, `invalid_value`,
`malformed_artifact`, `unknown_field`, `unknown_kind`, `unknown_schema_version`,
`stale_reference_candidate`, `stale_import_candidate`, `association_store_unavailable`,
`journal_store_unavailable`, `publication_port_unavailable`, `not_a_journal_entry`,
plus the file-level `stale_import_candidate` path.

**HONEST:** the union also declares seven members that no current code path throws —
`provider_reported_unavailable`, `import_blocked`, `publication_not_approved`,
`publication_rejected`, `admission_port_unavailable`, `publication_outcome_uncertain`,
`bridge_unavailable`. They are reserved vocabulary; the corresponding states are
modelled as RESULT VARIANTS instead (`NOT_APPROVED`, `FAILED(reason)`,
`STALE_*`). Recorded as `CF-AE-13` so the set is not mistaken for a live contract.

### 5.3 Derived-view states

`RESOLVED | PROVIDER_UNAVAILABLE | REVISION_UNAVAILABLE`
(`src/external_assets/resolver.ts:29-37`).

### 5.4 Inspection unavailable reasons

`not_found | requested_digest_mismatch | stable_revision_unavailable | provider_unavailable`
(`src/external_assets/provider.ts:262-267`).

## 6. Store schema

```sql
CREATE TABLE IF NOT EXISTS external_asset_bridge (
  project_id            TEXT NOT NULL,
  sequence              INTEGER NOT NULL,
  record_id             TEXT NOT NULL,
  family                TEXT NOT NULL,
  operation_id          TEXT NOT NULL,
  record_json           TEXT NOT NULL,
  record_digest         TEXT NOT NULL,
  previous_record_digest TEXT NOT NULL,
  recorded_at           TEXT NOT NULL,
  PRIMARY KEY (project_id, sequence)
);
CREATE INDEX IF NOT EXISTS external_asset_bridge_operation
  ON external_asset_bridge(project_id, operation_id);
```

Source: `src/external_assets/bridge_store.ts:286-301`. Five families
(`:49-56`) with per-family required fields (`:145-188`); append is a single
`BEGIN IMMEDIATE` transaction that reads the tail and inserts, so a concurrent
writer cannot fork the chain (`:328-392`). The store holds NO asset content.

The default path is deployment-local:
`$DSH_HOME/palimpsest/external-asset-bridge.sqlite` (default `~/.dsh`)
(`bridge_store.ts:439-444`). A product install creates it at the derived operating
store path beside the other operating stores, or `:memory:` when the orchestration
store is in memory (`src/install.ts:1831-1834`).

## 7. Machine invariants (EXT-A01 … EXT-A27)

| ID | Invariant | How it is enforced | Pinned by |
| --- | --- | --- | --- |
| **EXT-A01** | external provider remains asset owner | the plane stores no asset content; the association is an opaque ref + digests; the provider definition is config | `test:810-830` (AE-N08), `test:1016-1020` (AE-N27) |
| **EXT-A02** | ProjectWorkspace remains derived | no new read model is persisted; the external view is a pure derivation over existing associations (`resolver.ts:80-208`) | `test:715-725`, `test:1869-1886` (AE-N16) |
| **EXT-A03** | stable ref includes an exact digest | `contentDigest` mandatory on the ref (`refs.ts:204-205`, `:242-245`); the bridge association port requires sha256 (`service.ts:1387-1394`) | AE-N04 `test:697-713` |
| **EXT-A04** | search/inspect are read-only | no store access on either path (`service.ts:431-471`) | AE-N02 `test:592-616`, AE-N03 `test:637-662` |
| **EXT-A05** | a search hit is not a durable ref | a hit has no mandatory digest and is never persisted | AE-N01 `test:618-635` |
| **EXT-A06** | reference is explicit and content-free | `prepareReference`/`commitReference` with three re-checks; provenance is refs+digests | AE-N08 `test:810-830`, `test:845-889` |
| **EXT-A07** | `EXTERNAL_ASSET` is the only new `ProjectAssetKind` | the enum is exactly seven original kinds + one | AE-N07 `test:574-588` |
| **EXT-A08** | external type stays provider-owned | no mapping table exists; the import path never reads `assetType` | structural `test:563-572`, AE-N10 `test:1043-1058` |
| **EXT-A09** | import targets the existing ProjectJournal | the only journal seam is `sqliteExternalAssetJournalPort`; the only kinds are `PROJECT_JOURNAL_KINDS` | AE-N09 `test:1023-1041` |
| **EXT-A10** | import performs no semantic admission | the entry is a Journal note; no Work/Proof/Decision owner is reachable | AE-N13/N14/N15 `test:1834-1867`, structural `test:498-527` |
| **EXT-A11** | publication preview is exact | the payload is derived from the entry; parse re-derives both digests; the effect re-derives and compares | AE-N25 `test:1559-1604`, `test:1741-1757` |
| **EXT-A12** | publication requires separate approval | the admission port is consulted before any receipt/effect/provider call (`service.ts:936-953`) | AE-N19 `test:1355-1386` |
| **EXT-A13** | ManagementMode != publication approval | the deps interface has no mode field and the admission port receives only `{ preview }` | AE-N17 `test:540-561`, `test:1410-1438`, `test:1902-1927` |
| **EXT-A14** | publication is a governed external effect | the only provider write is inside the Ordarium action | AE-N21 `test:1441-1460` |
| **EXT-A15** | publication retry cannot duplicate the external asset | the operation key + durable window + provider idempotency/reconcile | AE-N22 `test:1462-1477`, AE-N23 `test:1663-1698` |
| **EXT-A16** | publication receipt != truth | the receipt carries refs/digests only and is read by no derivation | `test:1016-1020` (shape), `test:1606-1661` §33 publish |
| **EXT-A17** | Journal remains local owner after publication | publication writes no Journal event | `test:1643-1646` (§33 publish) |
| **EXT-A18** | a newer external revision never mutates local state | the derived view surfaces but never adopts; the association is byte-unchanged | `test:910-943` (§33 newer revision) |
| **EXT-A19** | no automatic bidirectional sync | no watcher, no lifecycle hook, no implicit publish | `test:1788-1800` (§31), structural `test:529-538` |
| **EXT-A20** | no global external auto-context | no injection entry point; search/inspect change nothing | AE-N02/N03/N16 `test:592-662`, `:1869-1886` |
| **EXT-A21** | no cross-project asset scan | the bridge store is queried per project; `resolve(projectId)` lists that project's associations only (`bridge_store.ts:302-307`, `service.ts:1093-1097`) | no dedicated adversary — see HONEST below |
| **EXT-A22** | no Personal Asset store in this repo | only the bridge receipt table exists; the TEST provider owns a separate file; V-N05 forbids store-shaped names | structural `test:529-538`, `test/v_adversarial.test.ts:176-190` |
| **EXT-A23** | no universal asset ontology | provider types are absent from `PROJECT_ASSET_KINDS` | AE-N07 `test:574-588` |
| **EXT-A24** | no automatic Evidence/Proof/Reasoning bridge | the plane cannot import those owners | structural `test:498-527`, AE-N13/N14/N15 `test:1834-1867` |
| **EXT-A25** | credentials are not persisted | strict parsers reject unknown fields; no credential channel exists | AE-N26 `test:727-761` |
| **EXT-A26** | full regression green | the campaign suites run together | 163 files / 1718 tests, 36 playwright, dogfood `pass=true` — `G10-AE-EXTERNAL-ASSET-DELIVERY.md` §4 |
| **EXT-A27** | required CI green | the repository CI | the PR run and the canonical-main run, recorded in the delivery report's checkpoint |

**HONEST (EXT-A21):** the per-project scoping is structural and demonstrated by the
derived-view tests, and the integration suite pins a cross-project refusal; there
is no adversary that ATTEMPTS a cross-project read, because no such read path
exists to attack. Recorded as `CF-AE-10`.

**Surface coverage:** the application surface, HTTP routes, agent tool and derived
workspace view landed after the bridge suite and are pinned by
`test/ae_integration.test.ts` (19 tests) and `e2e/external-assets.spec.ts` (7
browser tests) — including the "surface is really composed" proof, the tool's
exact read/prepare verb set and the 501-when-not-composed routes. The gate review's
own attacks on those faces (R-01 … R-05) are pinned in
`test/ae_external_assets.test.ts`.

```text
EXT-A26  recorded with the real numbers in G10-AE-EXTERNAL-ASSET-DELIVERY.md §4.
EXT-A27  the PR run and the canonical-main run are recorded in the same report's
         checkpoint (§8), after the merge.
```

## 8. Adversarial suite map (AE-N01 … AE-N30)

Test file: `test/ae_external_assets.test.ts`. Line numbers are the current tree.

| ID | Mechanism that makes it true | Test that pins it |
| --- | --- | --- |
| **AE-N01** `SearchResult != ProjectReference` | a hit has no mandatory digest, is never persisted, and the read surface has no commit verb | "AE-N01: a search result is NOT a project reference" (`:618-635`) |
| **AE-N02** search mutates nothing | `search` touches no store; hits are ephemeral | "AE-N02: search returns ephemeral hits and mutates NOTHING" (`:592-616`) |
| **AE-N03** inspect mutates nothing | `inspect` is a pure provider read | "AE-N03: inspect resolves an exact digest and mutates NOTHING" (`:637-662`) |
| **AE-N04** durable ref requires digest | `contentDigest` is mandatory; an unstable provider denies | "AE-N04: a durable reference requires a digest; an unstable provider is DENIED" (`:697-713`) |
| **AE-N05** latest never silently replaces the referenced digest | exact-digest resolve + `requested_digest_mismatch` conversion | two tests: honest (`:664-679`) and hostile provider (`:681-695`) |
| **AE-N06** missing provider does not delete the association | `resolve` reports `PROVIDER_UNAVAILABLE` and writes nothing | "AE-N06/§33: a missing provider leaves the association and reports PROVIDER_UNAVAILABLE" (`:891-908`) |
| **AE-N07** only `EXTERNAL_ASSET` added | the enum is asserted exactly; provider types asserted absent | "AE-N07: EXTERNAL_ASSET is the ONLY kind added to ProjectAssetKind" (`:574-588`) |
| **AE-N08** reference copies no content | provenance carries refs+digests only; the serialized history is checked for sentinel content | "AE-N08: the association copies no content…" (`:810-830`) + §33 reference (`:803-807`) |
| **AE-N09** import requires an explicit Journal kind | `journalKind` validated against `PROJECT_JOURNAL_KINDS` before anything else | "AE-N09: an import requires an EXPLICIT Journal kind" (`:1023-1041`) |
| **AE-N10** provider type never auto-maps | no mapping table; import path never reads `assetType` | "AE-N10: a provider asset type never auto-maps to a Journal kind" (`:1043-1058`) + structural (`:563-572`) |
| **AE-N11** import digest mismatch blocked | returned digest compared to the referenced digest | "AE-N11: a materialization whose digest differs is BLOCKED with zero Journal write" (`:1060-1079`) |
| **AE-N12** oversized import not truncated | byte length measured against `maxImportedTextBytes`; denial names the real size | "AE-N12: an oversized import is BLOCKED, never truncated" (`:1081-1109`) |
| **AE-N13** import creates no Work mutation | install-level before/after of controller status and the `projects`/`events` tables | "AE-N13/N14/N15: an import creates NO Work, Proof or Decision mutation" (`:1834-1867`) — **integration layer** |
| **AE-N14** import creates no Proof mutation | same test; the proof plane is not composed and is unreachable | same test (`:1862` asserts `installed.proof === undefined`) — **integration layer** |
| **AE-N15** import creates no Decision mutation | the ProjectIR `projects` row (revision + digest, which covers decisions) is byte-identical | same test (`:1859`) — **integration layer** |
| **AE-N16** search never auto-enters project context | plane raw-table diff + install `projectWorkspace.view()` / orchestration graph diff | plane (`:715-725`) + install "AE-N16: search never auto-enters project context" (`:1869-1886`) |
| **AE-N17** ManagementMode grants no bridge approval | deps interface scan; preview smuggle attempts; observing admission port sees only `preview`; MANAGE install path | structural (`:540-561`) + preview (`:1388-1438`) + install (`:1902-1927`) |
| **AE-N18** publication preview has zero effect | preview reads the journal and computes digests only | "AE-N18/§33: a publication preview has ZERO effect" (`:1286-1305`) |
| **AE-N19** publication requires explicit admission | no port ⇒ `NOT_APPROVED/UNAVAILABLE`; explicit REJECT ⇒ `NOT_APPROVED/REJECT`; both zero mutation | two tests (`:1355-1371`, `:1373-1386`) |
| **AE-N20** publication sources only Journal in v1 | `preparePublication` refuses a non-journal id | "AE-N20/§19: publication sources ONLY a project journal entry" (`:1342-1353`) |
| **AE-N21** publication uses the governed effect path | the ledger records the AE action as `reconcilable` / `operation-key` / `succeeded` | "AE-N21: publication runs through the governed Ordarium effect path" (`:1441-1460`) |
| **AE-N22** publication retry is idempotent/reconcilable | the operation key makes a retry the same operation | "AE-N22: a retry of the SAME publication reuses the Ordarium operation" (`:1462-1477`) |
| **AE-N23** crash after external success does not double-publish | terminal replay + read-only provider probe recovery | "AE-N23/§24: a crash AFTER the external success does not double-publish" (`:1663-1698`) |
| **AE-N24** publication result is a stable external ref | the effect output is reconstructed into `ExternalAssetStableRef` and compared with the provider's reconcile answer | **integration/§33**: "§33 publish: approval → governed publish → stable ref + terminal + association" (`:1619-1632`) |
| **AE-N25** no hidden project context in publication | the payload is title/body + three labels; the provider dump is checked for other entry content and the project id | "AE-N25: the preview is byte-for-byte the only content that leaves" (`:1559-1604`) |
| **AE-N26** provider credentials never persisted | strict parsers reject `apiToken`; all three stores are dumped for the fixture credential | two tests (`:727-741`, `:743-761`) |
| **AE-N27** bridge history stores refs/digests, not content | the bridge row dump is checked for the note text and title and for the digest | **integration/§33**: inside the §33 import test (`:1016-1020`) |
| **AE-N28** imported OPPORTUNITY remains not-Task | an imported OPPORTUNITY adds no task; only explicit `promoteOpportunity()` does | **integration/install**: "§16 the OPPORTUNITY case…" (`:1186-1221`) |
| **AE-N29** VERIFY/MONITOR unchanged | wiring external assets changes neither plane and adds no tool | "AE-N29: wiring external assets changes neither VERIFY nor MONITOR" (`:1888-1900`) — **integration layer** |
| **AE-N30** AD/AC-R/W/X/Y/Z/AA/AB regressions green | the campaign suites run in the same gate | **campaign-wide, no single test** — the regression run; see `G10-AE-CARRY-FORWARD.md` and the delivery report |

Coverage accounting: 20 ids are pinned by a dedicated bridge-plane test (AE-N01…
AE-N12, N16, N17, N18, N19, N20, N21, N22, N23, N25, N26), five by the §33
integration assertions (N24, N27, N28) or a named "N13/N14/N15" test, and N13–N15,
N28, N29 are **integration-layer** proofs. AE-N30 is a campaign-wide regression
with no single test.

## 9. PARTIAL / STOP conditions

None of the §40 PARTIAL conditions holds after this stage:

```text
search results are NEVER auto-injected                -> AE-N02/N03/N16
durable external ref canNOT omit the digest           -> EXT-A03, AE-N04
external types are NOT copied into ProjectAssetKind   -> AE-N07
a reference copies NO content                         -> AE-N08
import does NOT auto-map a provider type              -> AE-N10
import never silently summarizes or truncates         -> AE-N12 (block, not truncate)
publication NEVER occurs without approval             -> AE-N19, EXT-A12
publication uses the governed effect + idempotency    -> AE-N21/N22/N23
external updates NEVER silently mutate the project    -> §33 newer-revision, §31
no Personal Asset store appears inside Palimpsest     -> EXT-A22, V-N05
```

None of the §41 STOP conditions was reached: no global asset DB became canonical
inside Palimpsest; providers expose immutable digest-bound revisions; the import
targets an existing local owner (the Journal) without inventing a universal store;
publication did not bypass effects/governance; provider identity stayed a
deployment config, not an Agent/Peer identity; and the baseline stayed valid.

```text
G10-AE EXTERNAL ASSET LIBRARY BRIDGE & EXPLICIT PROJECT REUSE: (verdict recorded
in the delivery report — not asserted here)
```
