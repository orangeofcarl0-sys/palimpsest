# External Asset — outbound publication boundary

Outbound publication is the point where project knowledge leaves the project. The
boundary is deliberately narrow: v1 publishes exactly one artifact kind, shows the
exact bytes before any action, requires a SEPARATE approval, and executes through
the governed external-effect path.

```text
PublicationPreview != Publication       PublicationReceipt != Truth
ManagementMode     != PublicationApproval
OrdinaryHTTPAuth   != Approval          AgentAction != Approval
Association        != Ownership         PublishedExternal != LocalJournal
```

## 1. v1 publishes ONLY a `ProjectJournalEntry`

| Candidate local artifact | In v1? | Why |
| --- | --- | --- |
| `ProjectJournalEntry` | **YES** | the Journal owns project knowledge with no other canonical owner (`src/project_workspace/journal.ts:1-14`) |
| Work Evidence / Attempts | NO | controller-owned; needs its own disclosure/admission semantics |
| Proof sources / claims | NO | the proof plane owns publication admission |
| Decisions | NO | canonical ProjectIR content |
| Commitments | NO | their own disclosure semantics |
| Boundary artifacts | NO | their own disclosure semantics |
| Verification runs | NO | G10-AD protocol results, explicitly grant nothing |

This is structural, not a runtime check. `preparePublication` reads the entry
through the journal read port and fails with `not_a_journal_entry` for anything
not recorded there (`src/external_assets/service.ts:854-873`). The payload builder
takes a `ProjectJournalEntry` (`src/external_assets/publication.ts:94-113`), and
the plane cannot reach the other owners at all (structural firewall,
`test/ae_external_assets.test.ts:498-527`). AE-N20 calls `preparePublication` with
a task id and asserts it is refused with zero provider calls
(`test:1342-1353`).

## 2. The exact outbound payload

```ts
interface ExternalAssetOutboundPayload {
  providerId: string;
  providerDefinitionDigest: string;
  journalEntryId: string;
  journalEntryDigest: string;
  targetAssetType: string;
  title: string;                          // the entry's title, verbatim
  body: string;                           // the entry's body, verbatim
  metadata: {                             // exactly three identity labels
    palimpsest_journal_entry_id: string;
    palimpsest_journal_entry_digest: string;
    palimpsest_journal_kind: string;
  };
}
```

Source: `src/external_assets/publication.ts:57-86`.

WHAT LEAVES: the selected entry's title and body, plus those three labels.
WHAT DOES NOT LEAVE: the entry's `provenance` prose, its `relatedRefs`, any other
journal entry, the project id, the project goal, the project revision, any
chain-of-thought, any retrieved external content, any credential. AE-N25 appends a
second entry with sentinel content, publishes the first, dumps the provider's raw
database and asserts the other entry's title, body and provenance prose are absent
— as is the project id (`test:1559-1604`).

## 3. The preview is exact

```ts
interface ExternalAssetPublicationPreview {
  schemaVersion: 1;
  publicationId: string;                  // pub-<32 hex>, derived
  provider: ExternalAssetProviderDefinition;  // the versioned definition addressed
  projectId: string;
  localJournalRef: { entryId: string; kind: ProjectJournalKind };
  localJournalDigest: string;
  targetAssetType: string;
  outboundTitle: string;
  outboundBody: string;
  outboundMetadata: Record<string, string>;
  payloadDigest: string;                  // digest of the outbound payload
  digest: string;                         // digest of the whole preview
}
```

Source: `src/external_assets/publication.ts:124-203`.

| Rule | Enforcement |
| --- | --- |
| The preview has ZERO effect. | It reads the journal and computes digests; it calls no provider. AE-N18 asserts zero publish calls, zero publications, empty bridge, empty associations and an empty Ordarium ledger (`test:1286-1305`). |
| The preview may be prepared but not committed by an agent. | The plane's read/prepare surface returns the preview; nothing on it approves. |
| `publicationId` is content-derived. | Domain `palimpsest.external-assets.publication-id.v1` over project + provider + definition digest + entry id/digest + target type + payload digest (`publication.ts:140-150`). |
| Parsing re-derives both digests. | `payloadDigest` and `digest` are recomputed on parse; a mutated preview fails (`publication.ts:263-292`). |
| A preview cannot smuggle a mode, an approval or a token. | Strict parser rejects unknown fields; AE test injects `managementMode`, `involvement`, `operatorApproval`, `autonomyProfile` and each fails (`test:1396-1400`). |
| The preview embeds the exact definition version. | `provider` is the parsed `ExternalAssetProviderDefinition`; the effect refuses if the live definition digest differs (`effects.ts:149-157`). |

## 4. Why approval is a SEPARATE port

```ts
interface ExternalAssetPublicationAdmissionPort {
  readonly policyRef: { policyId: string; version: string };
  admit(input: { preview: ExternalAssetPublicationPreview }): Promise<unknown>;
}
```

Source: `src/external_assets/publication.ts:304-350`.

The port is separate because approval is an AUTHORITY, and this plane has no
authority. It receives EXACTLY `{ preview }` — no management mode, no autonomy
profile, no HTTP credential, no agent identity, no approver token
(`publication.ts:309-321`). The AE test registers an observing admission port and
asserts the input's only key is `preview` (`test:1410-1438`).

| Thing that can NEVER approve | Why |
| --- | --- |
| `DIRECT / ASSIST / MANAGE / DELEGATE` | management modes are a deployment preference, not publication authority. The admission port is a required, separate dependency; the service does not accept a mode at all (`ExternalAssetBridgeServiceDeps`, `service.ts:317-327`). A MANAGE involvement with no admission port still results in `NOT_APPROVED / UNAVAILABLE` with zero provider calls (`test:1902-1927`). |
| Ordinary HTTP authentication | the operator-explicit `POST /api/external-assets/approve-publish` route DOES call `approveAndPublish` (`http.ts`), but reaching it is not the approval: auth is transport identity, and the route carries no decision, approver or credential. The admission port is consulted inside the service and nothing but its literal `APPROVE` proceeds, so an authenticated caller with no admission port gets `NOT_APPROVED / UNAVAILABLE` and zero provider calls. |
| An agent | the plane's agent-facing read/prepare surface exposes no approve verb (§28); approval lives on this host-owned port. |
| An unparseable or absent answer | strict parse; a throw or an unparseable decision becomes `NOT_APPROVED / UNAVAILABLE` (`service.ts:943-950`). An unparseable answer is NEVER an implicit APPROVE (`publication.ts:329-333`). |
| A non-`APPROVE` decision | anything other than the exact string `APPROVE` is a rejection (`service.ts:951-953`). |

The order in `approveAndPublish` is load-bearing: the association owner is
required, the publication port and definition are checked, the governed invoker is
required, and the admission port is consulted — ALL BEFORE any receipt, any
Ordarium operation and any provider call (`service.ts:899-953`).

## 5. The governed effect

```text
action name   palimpsest.external_asset.publish
effect kind   reconcilable({ idempotencyWindow: { kind: "durable" }, cancellable: false })
operation key `${projectId}\0${providerId}\0${publicationId}`
input         exactly the eight §22 fields (no caller-supplied content field)
output        the provider's exact ExternalAssetStableRef fields
```

Source: `src/external_assets/effects.ts:45-57`, `:202-223`, `:265-276`.

The action is modelled on `palimpsest.git.promote`
(`src/effects/actions.ts:158-183`). Three properties matter:

1. **A caller cannot differ from the approved preview.** The input has no content
   field; `body`/`title` are not accepted (`exactStringFields`, `effects.ts:99-116`).
   The payload is RE-DERIVED from the local journal entry inside the effect and
   its digest is compared to the approved `payloadDigest` (`effects.ts:164-185`).
   A caller-injected `body` is refused with `unexpected field "body"` before the
   provider is called (`test:1725-1739`); a drifted entry digest is refused before
   the provider is called (`test:1741-1757`).
2. **A retry is the SAME operation.** The operation key makes a second invocation
   return the recorded success instead of re-executing. AE-N22 invokes the same
   input twice and asserts the provider's publish call count is 1 and exactly one
   external publication exists (`test:1462-1477`).
3. **An uncertain attempt is reconciled, not retried.** `reconcile` returns
   `succeeded(value)` for a provider that reports `PUBLISHED`, `absent/retrySafe`
   for an idempotent-by-publicationId provider or an authoritative absence, and
   `unknown` otherwise (`effects.ts:277-312`).

AE-N21 asserts the ledger record: `actionName` = the AE action, `effectKind` =
`reconcilable`, `idempotencyMode` = `operation-key`, `state` = `succeeded`
(`test:1441-1460`).

## 6. The crash window and its recovery invariant

```text
EXTERNAL_PUBLICATION_PREPARED  ->  external effect succeeds  ->  [PROCESS CRASH]  ->  no local terminal
```

On the next attempt, `approveAndPublish` must NOT publish again. It:

```text
1. reads the bridge lineage for a prior EXTERNAL_PUBLICATION_COMMITTED
   -> if present, reconstructs the stable ref from the receipt, ensures ONE
      PUBLISHED association and returns PUBLISHED with created: false
2. otherwise writes/keeps PUBLICATION_PREPARED and invokes the governed effect
3. on a caught failure, probes the provider read-only:
     PUBLISHED          -> finishPublication(recovered ref, created: false)
     ABSENT_RETRY_SAFE  -> EXTERNAL_PUBLICATION_FAILED(reason: publication_absent)
     UNKNOWN            -> EXTERNAL_PUBLICATION_FAILED(reason: publication_outcome_unknown)
```

Source: `src/external_assets/service.ts:955-1012`, `:1015-1046`; probe at
`src/external_assets/effects.ts:325-351`.

Invariant on recovery:

```text
one external asset, one local terminal record, one association
```

AE-N23 reproduces the window with a provider that throws a simulated crash
immediately AFTER its own database write, then retries: exactly one external
publication exists, the retry returns the same `refDigest`, the provider's publish
path was called once, there is exactly one `EXTERNAL_PUBLICATION_COMMITTED` and
exactly one `ASSET_ASSOCIATED` event, and the chain verifies
(`test:1663-1698`).

The §33 publish test additionally proves the terminal replay path: a second
`approveAndPublish` on the same preview returns `PUBLISHED` with `created: false`
and still exactly two bridge records (`test:1653-1660`).

## 7. Why the local Journal stays its own canonical history

Publication does not transfer the entry. On success the plane records:

```text
bridge   EXTERNAL_PUBLICATION_COMMITTED { localJournalRef + localJournalDigest + the external ref }
project  ProjectAssetAssociation { assetKind: EXTERNAL_ASSET,
                                   canonicalRef: provider / assetId / contentDigest,
                                   associationKind: PUBLISHED }
```

Source: `src/external_assets/service.ts:1015-1089`. It never writes to the
Journal, never resolves the entry, never edits it and never marks it published in
the Journal's own history. The Journal entry remains a normal local entry
(`test:1643-1646` asserts exactly one journal entry, the original). The
publication association records that a counterpart EXISTS; it does not say the
external copy is now the truth, and it does not erase or transfer ownership.

```text
External update    -/-> local Journal mutation        (§12/§31, no watcher)
Local Journal edit -/-> external republication        (publication is explicit only)
```

The association is idempotent: `ensurePublishedAssociation` looks for the exact
`(provider, asset, digest, PUBLISHED)` tuple before writing
(`service.ts:1053-1089`), so a replay cannot add a second association.

## 8. Failure is recorded, not hidden

| Outcome | Local record | Association |
| --- | --- | --- |
| provider `FAILED` (or `ABSENT_RETRY_SAFE`) | `EXTERNAL_PUBLICATION_FAILED` with `reason: publication_absent` | none (`test:1700-1723`) |
| provider outcome `UNKNOWN` | `EXTERNAL_PUBLICATION_FAILED` with `reason: publication_outcome_unknown`; NOT blind-retried | none (`test:1479-1557`) |
| admission absent / rejected | NO receipt, no ledger record, no provider call | none (`test:1355-1386`) |
| association owner absent | fails closed BEFORE any receipt/effect/provider call | none (`test:1307-1340`) |

A `FAILED` receipt is a local fact about an attempted operation. It carries a
typed reason and refs/digests — no provider error text is promoted to truth, and
the receipt is not read by any derivation.

## 9. Boundary honesty (HONEST / PENDING)

**HONEST:** the separate approval port is a *seam*: the deployment must supply a
real approver. The plane ships only `rejectAllExternalAssetPublicationAdmission`
as the honest "no approver wired" stand-in (`publication.ts:352-362`), which can
only REJECT. A deployment that wires an approver is responsible for that
approver's real semantics; the plane only guarantees that NOTHING ELSE can stand
in for it.

**HONEST:** the approval port is an in-process host port, so an untrusted
same-process caller is inside the trust boundary (an instance of `CF-AA-02`, not
a new authority introduced here).

**Surface status.** The publication verbs are reachable in this tree on three
faces, and only the agent face is restricted:

| Face | `approveAndPublish`? | Evidence |
| --- | --- | --- |
| installed surface (host-owned) | yes | `src/install.ts:646-660`, `:1943-1952` |
| application surface (operator/UI) | yes (§28 names it operator-explicit) | `src/application/surface.ts:645-649`, `:1321-1322` |
| HTTP | yes, `POST /api/external-assets/approve-publish` — and there is deliberately NO route accepting an admission decision, an approver or a credential | `src/application/http.ts:956-962`, comment at `:859-861` |
| agent tool `palimpsest_external_assets` | **NO** — its action list has no approve action and `mode` is `read-only` | `src/tools/application_tools.ts:828-836` |

The tool can prepare a preview but cannot approve it. Ordinary HTTP
authentication does not stand in for the admission port
(`src/application/http.ts:856-861`).

```text
pinned by  test/ae_integration.test.ts (surface, HTTP routes, tool verb set, 501
           when the bridge is absent) and e2e/external-assets.spec.ts
the web "Published from this project" view (§27): e2e/external-assets.spec.ts
the §24 publication crash window: test:1663-1698 (in-process simulated crash) AND
           the §38 dogfood against a SEPARATE PROCESS whose publish commits its own
           row and then exits — see G10-AE-BRIDGE-DOGFOOD-EVIDENCE.md
the gate-review regression R-04 (a failure after the external write leaves exactly
           one terminal receipt): test/ae_external_assets.test.ts
```
