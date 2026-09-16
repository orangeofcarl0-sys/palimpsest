# External Asset Provider contract

The contract a deployment must satisfy to connect a separately-owned knowledge
library to Palimpsest. It is a READ port plus, optionally, a SEPARATE write port.
A provider is deployment CONFIG; it is never asset truth and never project
context (`src/external_assets/registry.ts:2-11`).

```text
Evidence for every rule below is a file:line or a named test in this repository.
A provider that satisfies only part of this contract is usable only for the
capabilities it declares; a denied capability fails closed with a typed reason.
```

## 1. Provider definition

```ts
interface ExternalAssetProviderDefinition {
  providerId: string;        // stable identifier, dialect-normalised
  version: string;           // provider-owned version token
  displayName: string;
  capabilities: ExternalAssetProviderCapability[];  // sorted, de-duplicated
  protocolDigest: string;    // exact sha256 of the protocol the provider speaks
  digest: string;            // derived over all of the above
}
```

Source: `src/external_assets/provider.ts:59-66`. The definition digest is derived
with domain `palimpsest.external-assets.provider-definition.v1`
(`provider.ts:56-57`, `:68-72`) and re-verified on parse, so a tampered definition
fails closed (`provider.ts:119-123`). Capabilities are sorted before digesting,
so declaration order does not change the identity (`provider.ts:126-140`).

The definition is what makes a candidate/preview BOUND to a version: the
reference candidate stores `providerDefinitionDigest`
(`src/external_assets/service.ts:194-201`), the publication preview embeds the
whole definition (`publication.ts:124-138`), and the effect refuses if the live
provider's digest differs from the approved one
(`src/external_assets/effects.ts:149-157`).

## 2. The four capabilities

| Capability | Grants | Absent ⇒ |
| --- | --- | --- |
| `SEARCH` | `search(query)` | `capability_not_available` on search (`service.ts:411-423`) |
| `INSPECT` | `inspect(request)` | reference preparation is DENIED (`service.ts:534-539`); commit re-checks it (`:601-603`) |
| `MATERIALIZE_TEXT` | `materializeText(ref)` | import is DENIED (`service.ts:673-685`) |
| `PUBLISH` | a separate publication port | publication is impossible (`service.ts:842-853`) |

Exactly these four exist (`provider.ts:43-50`). `latestRevision` is NOT a fifth
capability: it is an OPTIONAL read-only observability extension used only to
surface "a newer revision exists" (`provider.ts:394-401`, `:445-449`). When a
provider does not implement it, the derived view reports nothing rather than
guessing (`resolver.ts:147-154`; HONEST note in the test at
`test/ae_external_assets.test.ts:2069-2072`).

## 3. The read port

```ts
interface ExternalAssetLibraryReadPort {
  readonly definition: ExternalAssetProviderDefinition;
  search(query: ExternalAssetSearchQuery): Promise<unknown>;
  inspect(request: ExternalAssetInspectRequest): Promise<unknown>;
  materializeText?(stableRef: ExternalAssetStableRef): Promise<unknown | undefined>;
  latestRevision?(assetId: string): Promise<unknown | undefined>;
}
```

Source: `src/external_assets/provider.ts:428-450`. Port results are parsed by
strict parsers, not cast. A port that throws is not fatal: search/inspect convert
a throw into a typed `UNAVAILABLE / provider_unavailable`
(`service.ts:486-501`, `resolver.ts:232-243`), and a materialization throw into
`DENIED / provider_unavailable` (`service.ts:690-695`).

### 3.1 Search semantics

```ts
interface ExternalAssetSearchQuery { text: string; limit?: number; assetTypes?: string[]; cursor?: string; }
interface ExternalAssetSearchHit  { providerId; assetId; assetType; title; summary?; searchScore?; latestDigestHint?; }
interface ExternalAssetSearchPage { providerId; hits: ExternalAssetSearchHit[]; nextCursor?: string; }
```

Source: `provider.ts:155-183`.

| Rule | Enforcement |
| --- | --- |
| Search is READ-ONLY. | The service validates the page and returns; it touches no store (`service.ts:431-460`). |
| Hits are EPHEMERAL. | Nothing persists a hit. AE-N02 asserts empty association/journal/bridge state and a valid bridge chain after a search (`test:592-616`). |
| The page must belong to the queried provider. | `page.providerId` and every `hit.providerId` are cross-checked against the read port's definition (`service.ts:444-457`). |
| `searchScore` is RANKING ONLY. | It is never applicability, quality or truth (`provider.ts:169`); it is never persisted and never read by commit. |
| `latestDigestHint` is a HINT, not the referenced revision. | Documented as insufficient for durability (`provider.ts:170-176`); a durable reference requires an exact inspect. |
| An unstable provider honestly omits the hint. | The fixture omits `latestDigestHint` when it has no stable digest (`test/fixtures/external_library_fixture.ts:274-277`). |

**`SearchResult != StableAssetRef`.** A hit has no mandatory digest, no `refDigest`
and no provider-definition binding; it cannot become an association. AE-N01
asserts a search hit creates no project reference (`test:618-635`).

### 3.2 Inspect semantics — exact digest or UNAVAILABLE

```ts
interface ExternalAssetInspectRequest { providerId; assetId; contentDigest?: string; }
type ExternalAssetInspection =
  | { status: "AVAILABLE";   snapshot: ExternalAssetSnapshot }
  | { status: "UNAVAILABLE"; providerId; assetId; requestedDigest?; reason; detail };
```

Source: `provider.ts:240-280`. Unavailable reasons are exactly
`not_found | requested_digest_mismatch | stable_revision_unavailable | provider_unavailable`
(`provider.ts:262-267`).

| Rule | Enforcement |
| --- | --- |
| **The requested digest is never silently replaced by the latest.** | With a requested digest, a snapshot whose ref digest differs is converted to `UNAVAILABLE / requested_digest_mismatch` in the service (`service.ts:511-521`) and in the resolver (`resolver.ts:216-231`). AE-N05 (both the honest provider and a hostile provider that answers the latest) at `test:664-695`. |
| A provider that cannot expose a stable revision denies durability. | `stable_revision_unavailable` permits search + inspect but denies reference/import (`provider.ts:16-19`); AE-N04 `test:697-713`. |
| An unavailable old digest returns UNAVAILABLE, never a newer one. | The fixture resolves by `(asset_id, content_digest)` and returns `not_found` for a missing revision (`test/fixtures/external_library_fixture.ts:455-476`). |
| A snapshot may not answer for another provider/asset. | Cross-checked in the service (`service.ts:505-510`). |

```ts
interface ExternalAssetSnapshot {
  ref: ExternalAssetStableRef;   // providerId + assetId + REQUIRED contentDigest + refDigest
  assetType: string;             // provider-owned; never a Palimpsest kind
  title: string;
  summary?: string;
  tags: string[];
  metadata: Record<string, string>;  // descriptive; grants no authority
  sourceLocator?: string;
}
```

Source: `provider.ts:251-260`. A reference copies none of these fields: the
association provenance records relation + providerId + assetId + contentDigest +
refDigest + providerDefinitionDigest + project basis (`service.ts:174-186`), and
AE-N08 asserts the serialized association contains no title, body, summary, tag or
metadata value (`test:810-830`).

## 4. Bounded text materialization

```ts
materializeText?(stableRef): Promise<{ text: string; contentDigest: string; mediaType: "text/plain" | "text/markdown" } | undefined>
```

Source: `provider.ts:361-392`.

| Rule | Enforcement |
| --- | --- |
| `contentDigest` IS the sha256 of the returned `text` (its UTF-8 bytes). | The plane hashes the bytes it holds: `externalAssetTextDigestOf` (`provider.ts`), applied by the strict materialization parser and again at import commit. A document-level digest must therefore be reported as the TEXT's digest — the plane's only durability claim is about the text it copies. |
| The returned `contentDigest` MUST equal the stable ref's `contentDigest`. | `materializeExternalAssetImportCandidate` fails with `digest_mismatch` (`import.ts:280-287`); `prepareImport` returns `DENIED / digest_mismatch` before any write (`service.ts:714-720`). AE-N11 `test:1060-1079`. |
| A provider that echoes the referenced digest while returning DIFFERENT text is refused. | The parser hashes the text and fails with `digest_mismatch`; `prepareImport` preserves that reason instead of reporting "unavailable" (`service.ts`). Review finding R-01, pinned by `test` R-01. |
| A first commit re-establishes the import's external side. | Provider configured, definition digest unchanged, revision still resolves, and the prepared Journal body hashes to the referenced digest; otherwise `STALE_IMPORT_CANDIDATE` with zero writes (`service.ts` `commitImport`). A hand-built candidate therefore cannot attach external provenance (`test` R-02/R-02b). |
| `undefined` means "cannot materialize". | `DENIED / content_unavailable` (`service.ts:696-701`). |
| An EMPTY materialization is not importable. | The strict parser refuses an empty `text` (`provider.ts:382-386`). |
| Only text media types are importable. | `text/plain` and `text/markdown` (`provider.ts:361`); anything else is `DENIED / binary_content` (`service.ts:710-713`). |
| `maxImportedTextBytes` is the ONE explicit bound. | Default `262144` bytes (`service.ts:111`); the deployment may override it (install option, `src/install.ts:507-511`). The byte length is measured and `content_too_large` is returned on excess. |
| **No hidden truncation.** | There is no slice/substring anywhere on the import path; blocking is the only outcome. AE-N12 asserts the denial names the real byte count and that zero Journal entries and zero receipts are written (`test:1081-1109`). |
| **No LLM summarization.** | The imported body is the exact materialized text (`import.ts:307-315`). The plane makes no model call. |
| Reference-only remains possible for non-importable content. | AE-N12 asserts a reference for the same asset still prepares; the binary test asserts zero journal writes (`test:1101-1108`, `:1111-1129`). |

## 5. The separate publication write port

```ts
interface ExternalAssetPublicationPort {
  readonly definition: ExternalAssetProviderDefinition;   // must equal the read definition
  readonly semantics: "IDEMPOTENT_BY_PUBLICATION_ID" | "RECONCILABLE";
  publish(request: ExternalAssetPublicationRequest): Promise<unknown>;
  reconcile?(request: { publicationId; providerDefinitionDigest; payloadDigest }): Promise<unknown | undefined>;
}
```

Source: `src/external_assets/publication.ts:368-416`.

| Rule | Enforcement |
| --- | --- |
| The write port is SEPARATE from the read port and must belong to the SAME definition. | The registry refuses a publication port whose provider id or definition digest disagrees with the read port (`registry.ts:64-80`). |
| A `PUBLISH` declaration without a port is refused at composition. | `registry.ts:81-87`; and at call time `publication_port_unavailable` (`service.ts:914-920`). |
| A provider must be idempotent by `publicationId` OR reconcilable. | The registry refuses any other combination (`registry.ts:87-98`). |
| Success MUST return an exact stable ref. | `PUBLISHED` parses an `ExternalAssetStableRef`; the effect reconstructs it and rejects an inconsistent `refDigest` (`publication.ts:418-437`, `effects.ts:128-142`). |
| A `FAILED` outcome carries a typed reason and no ref. | `publication.ts:431-434`; the service records `EXTERNAL_PUBLICATION_FAILED` and creates no association (`service.ts:987-1011`). |
| An `UNCERTAIN` outcome is never an implicit success. | The effect throws; the service probes the provider (`effects.ts:268-276`, `service.ts:976-1012`). |
| `reconcile` is authoritative absence for the non-idempotent contract. | `undefined` ⇒ `ABSENT_RETRY_SAFE` (`effects.ts:304`). |
| **An uncertain non-idempotent publication is never blind-retried.** | `effects.ts:289-292` returns `unknown` when a non-idempotent provider has no probe; the AE test asserts the provider's write path is called exactly once across two attempts (`test:1479-1557`). |
| The effect input binds only the eight approved fields. | A hand-written parser rejects any extra field (`effects.ts:99-116`, `:202-223`); the test injects a `body` field and asserts `unexpected field "body"` before any provider call (`test:1725-1739`). |
| The body is re-derived locally and re-checked against `payloadDigest`. | The effect reads the local entry, verifies its digest, rebuilds the payload and compares the digest (`effects.ts:164-185`); a drifted entry is refused before the provider is called (`test:1741-1757`). |

### 5.1 Idempotency is a provider obligation, not a Palimpsest hope

The operation key `${projectId}\0${providerId}\0${publicationId}`
(`src/external_assets/effects.ts:267`) plus the durable operation-key window
means a retry is the SAME Ordarium operation. That protects against a duplicate
LOCAL record. Only the provider contract protects against a duplicate EXTERNAL
asset — which is why the registry refuses a provider that can do neither.

## 6. Credential handling (§29)

| Rule | Enforcement |
| --- | --- |
| Provider credentials are HOST secrets and never enter a Palimpsest artifact. | The plane has no credential field anywhere: not in the reference provenance, not in the Journal entry, not in a bridge receipt and not in agent/tool output. Every artifact parser is strict (`eaKeys` fails closed on an unknown field, `refs.ts:103-117`). |
| A provider that leaks a credential into a reply is REFUSED — when it puts it in an UNDECLARED field. | A hit or snapshot carrying `apiToken` fails the strict parse with `unknown field "apiToken"` (`test:727-741`). |
| A credential volunteered inside a DECLARED free-form field cannot be stopped by the plane. | `metadata` / `summary` / `title` are provider-owned free-form fields (a key allow-list would be a heuristic that silently drops legitimate data), so a provider that chooses to put its own secret there will surface it in an inspection result. The plane's protection is the other direction: it never ASKS for a credential, never persists `metadata` (inspection is ephemeral) and never copies it into a reference, an import or a publication. Stated here because "a leaking provider is refused" would otherwise overclaim. |
| A credential is never persisted, even on a successful reference. | The test dumps the raw bridge, association and journal tables and asserts the fixture credential and the token name are absent (`test:743-761`). |
| Arbitrary search queries and results are never persisted by default. | AE test dumps all three stores after a search with a sentinel query token and asserts it is absent (`test:1765-1775`). |
| Imported text is copied only by an explicit import. | The materialized text enters the Journal only through `commitImport` (`service.ts:801-808`). |
| The publication preview shows the exact outbound content. | `outboundTitle` / `outboundBody` / `outboundMetadata` are the payload (`publication.ts:158-203`). |

## 7. What a provider must never be trusted to assert

| Provider claim | Why it is not believed |
| --- | --- |
| "This is the latest revision of what you referenced." | The requested digest governs. A mismatching answer becomes `requested_digest_mismatch` (`service.ts:511-521`). |
| "This hit is relevant / applicable / high quality." | `searchScore` is ranking only (`provider.ts:169`); no applicability relation is ever created. |
| "This asset's type is a Palimpsest kind." | A provider type never maps to a `ProjectJournalKind` or a `ProjectAssetKind` (`association.ts:30-36`; AE-N10 `test:1043-1058`). |
| "The text is exactly digest D." | The returned digest is compared to the referenced digest; a mismatch blocks the import (`service.ts:714-720`). |
| "Any metadata field you want." | `metadata` is descriptive and is never copied by a reference; unknown fields fail closed (`provider.ts:257-258`). |
| "Here is an extra field (a token, a score, a recommendation)." | Strict parsers reject unknown fields (`refs.ts:103-117`; AE-N26). |
| "The publish succeeded." | Only a parseable `PUBLISHED` outcome carrying an exact stable ref counts; `UNCERTAIN` is never success (`publication.ts:390-437`). |
| "An earlier publication is absent." | Absence is authoritative only through `reconcile` returning `undefined` / `ABSENT_RETRY_SAFE` (`effects.ts:304`, `:310`). |

## 8. Reference provider implementations

| Provider | Where | Status |
| --- | --- | --- |
| `FixtureExternalLibrary` | `test/fixtures/external_library_fixture.ts` | TEST-ONLY. Owns its own sqlite file, implements all four capabilities + `latestRevision`, idempotent by `publicationId` AND reconcilable, and can be switched into adversarial modes (`unavailable`, `omitStableDigest`, `mangleDigest`, `binaryMediaType`, `rejectPublication`, `crashAfterPublish`, `leakCredentialInResponse`). Must never become a shipped Personal Asset store. |
| A real provider (PIAS, Zotero, GitHub, institutional KB, company wiki) | — | NOT implemented in AE. Recorded as `CF-AE-04`. |

**HONEST:** the reference provider runs IN-PROCESS over its own database file
(`test/ae_external_assets.test.ts:2074-2078`). Ownership separation is real at the
storage and type level. The separate-PROCESS provider harness is a §38 gate
artefact, not a property of this plane: `test/fixtures/external_library_server.mjs`
driven by `scripts/external_assets/ae-dogfood.mjs` (30/30 checks, `pass=true`),
recorded in `G10-AE-BRIDGE-DOGFOOD-EVIDENCE.md`.
