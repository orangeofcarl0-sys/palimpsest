# G10-AE — External asset bridge delivery report

Stage: **External Asset Library Bridge & Explicit Project Reuse**.
Baseline: `a45f7c81bad07551c9c879b0048dba0df042cd30`.
Spec: `docs/engineering/G10-AE-EXTERNAL-ASSET-SPEC.md`.
Campaign record: `docs/engineering/G10-AE-EXTERNAL-ASSET-CAMPAIGN.md`.
Audit: `docs/engineering/audits/G10-AE-EXTERNAL-ASSET-BRIDGE-ASSESSMENT.md`.
Dogfood: `docs/engineering/audits/G10-AE-BRIDGE-DOGFOOD-EVIDENCE.md`.
Carry-forward: `docs/engineering/audits/G10-AE-CARRY-FORWARD.md`,
`docs/engineering/audits/G10-AE-AD-CARRY-FORWARD-DISPOSITION.md`.

## 1. What changed, per module

**`src/external_assets/**` (new plane, frozen by its own 70-test suite)** —
`refs.ts` (the firewalls, the strict value helpers and the ONE durable
`ExternalAssetStableRef`, whose `contentDigest` is mandatory), `provider.ts` (the
provider definition with its four capabilities, the read port, the ephemeral
search page, the exact-digest inspection and the bounded text materialization
whose digest is now VERIFIED against the bytes returned), `registry.ts` (frozen
deployment config; NO provider store), `import.ts` (the candidate, the structured
provenance artifact, the derived operation id and the Journal event),
`publication.ts` (the exact outbound payload, the preview, the SEPARATE admission
port and the provider's write port), `bridge_store.ts` (append-only chained
operation receipts, refs and digests only), `effects.ts` (the governed
`palimpsest.external_asset.publish` Safe Action), `resolver.ts` (the derived view),
`service.ts` (the five v1 operations and the two-phase writes).

**`src/project_workspace/association.ts`** — exactly ONE additive
`ProjectAssetKind`, `EXTERNAL_ASSET`, plus `requireExternalAssetDigest`, which
makes the exact-digest requirement structural for that kind on BOTH the write and
the read path (the gate review found it was enforced only by the bridge port).

**`src/project_workspace/service.ts`** — `associateAsset` refuses
`EXTERNAL_ASSET`: an external reference or published counterpart is created by the
bridge's own re-checked operations, never by the generic workspace writer (gate
review R-05).

**`src/project_workspace/view.ts` / `src/project_workspace/index.ts`** — the
derived external section (bridge configured, references with their ownership and
relation, provider availability, imports, warnings) and the two read-only ports
the plane supplies. Strictly derived: nothing new is persisted.

**`src/install.ts`** — the bridge options, the deployment-local
`SqliteExternalAssetBridgeStore` beside the other operating stores,
`installed.externalAssets`, and a `dispose()` that closes only the store THIS
install created (a supplied store belongs to its caller — corrected under gate
review MINOR-10, together with a created-then-failed-composition leak).

**`src/serve.ts`** — `isClientForbiddenPort` and an ephemeral-bind retry. See §6.

**`src/application/surface.ts`, `src/application/http.ts`,
`src/tools/application_tools.ts`** — the cohesive read/prepare surface
(`providers`, `search`, `inspect`, `prepareReference`, `prepareImport`,
`preparePublication`) with the operator-explicit commit/approve verbs; nine HTTP
routes; and the read-only `palimpsest_external_assets` tool, whose verb set is
asserted by a test.

**`web/src/project_workspace/ProjectWorkspaceView.tsx`, `web/src/api.ts`** — the
External Assets tab, distinguishing external owner / project reference / imported
local note / published external counterpart.

**Tests** — `test/ae_external_assets.test.ts` (70: `AE-N01…AE-N29`, the §33
golden E2Es at plane level, install wiring, and the five gate-review regressions
R-01…R-05), `test/ae_integration.test.ts` (19), `e2e/external-assets.spec.ts` (7),
`test/serve_ephemeral_port.test.ts` (5), `test/fixtures/external_library_fixture.ts`
(TEST-ONLY, in-process), `test/fixtures/external_library_server.mjs` (TEST-ONLY,
separate process), `scripts/external_assets/ae-dogfood.mjs`.

## 2. Delivered behaviour

1. **Search and inspect are read-only.** A hit is ephemeral; ranking is not
   applicability or truth; nothing is persisted, injected or added to context.
2. **A durable reference requires an exact digest.** `latest` never silently
   replaces a requested revision, and a provider that answers a different digest
   is reported `UNAVAILABLE`, not accepted.
3. **An explicit reference** creates ONE `EXTERNAL_ASSET` association (copying no
   content) after re-checking scope, provider definition and digest resolution.
4. **An explicit import** materializes exact bounded text into the existing
   `ProjectJournal` under a caller-chosen kind, with verifiable structured
   provenance, a derived operation id that makes a crash retry idempotent, and no
   Work/Evidence/Proof/Decision admission.
5. **Outbound publication** is limited to `ProjectJournalEntry`, shows the exact
   outbound payload, requires a separate explicit approval, and runs through the
   governed effect path with idempotent/reconcilable crash semantics.
6. **External changes never rewrite the project** and project changes never
   republish; provider asset types never become a Palimpsest ontology; no external
   asset is ever injected into project context.

## 3. What the stage did NOT change

`src/monitor/**`, `src/project_verification/**`, `src/campaign/**`,
`src/proof_asset/**`, `src/reasoning_cell/**`, `src/project_operating/**` (except
the new files' registration), the Ordarium ledger contract, the canonical event
store's writer set, and every existing `ProjectAssetKind`. No new palimpsest
store holds external asset content, and no automatic retrieval, watcher,
applicability relation or cross-project scan exists.

## 4. Gate results

```text
git diff --check                          exit 0
pnpm build                                exit 0 (tsc -b, no output)
pnpm exec vitest run --maxWorkers=2       163 files / 1718 tests passed
pnpm run build:web                        exit 0
pnpm exec playwright test                 36 passed
node scripts/external_assets/ae-dogfood.mjs   pass=true (30/30 checks, exit 0)
```

Baseline before this stage: 160 files / 1623 tests. The delta is the new plane
suite (+1 file / +62 tests at plane freeze), the integration suite (+1 file /
+19), the ephemeral-port suite (+1 file / +5), and the gate-review regressions
(+8 in the plane suite).

## 5. Gate review — findings and disposition

An independent adversarial pass attacked the firewalls, the import path, the
publication path, the privacy boundary, the agent boundary, the digest hardening,
replay safety and the spec's own claims. Five MAJOR findings were DEMONSTRATED and
are fixed with regressions; the rest are documented.

| ID | Finding | Disposition |
| --- | --- | --- |
| R-01 (MAJOR) | the imported text was never hashed: a provider could echo the genuine digest and hand over DIFFERENT bytes, and the substituted text was imported carrying real external provenance | FIXED: `externalAssetTextDigestOf` verifies the bytes in the materialization parser and the reason is preserved as `digest_mismatch`; fixture mode `substituteText` + `test` R-01 |
| R-02 (MAJOR) | `commitImport` re-checked nothing (unlike `commitReference`), so a hand-built candidate could attach external provenance with no provider configured | FIXED: the first commit re-establishes provider, definition digest, exact-digest resolution and the local body digest; replays still short-circuit before the provider is needed; `test` R-02/R-02b |
| R-03 (MAJOR) | publication did not check project scope, so an agent could name another project, pull its journal entry into the preview and publish it | FIXED: `preparePublication` and `approveAndPublish` both require a held project basis; `test` R-03/R-03b |
| R-04 (MAJOR) | a failure after the external write could append a SECOND terminal receipt on retry (§24 says one) | FIXED: `finishPublication` reuses an existing terminal; `test` R-04 reproduces the window by losing the association owner mid-publication |
| R-05 (MAJOR) | the generic workspace writer could mint an `EXTERNAL_ASSET` + `PUBLISHED` association, and the derived view would show a published counterpart that never existed | FIXED: `associateAsset` refuses the kind with a typed reason; `test` R-05 |
| MINOR-6 | the narrowed V-N05 firewall regex allowed store-shaped names it did not enumerate | FIXED: a store-shape rule plus a new assertion that no table in `src/` names an external asset store |
| MINOR-7 | the two §37 evidence documents were missing | CLOSED here and in `G10-AE-BRIDGE-DOGFOOD-EVIDENCE.md` |
| MINOR-8 | the publication-boundary doc denied that HTTP calls `approveAndPublish` while its own table and the code said otherwise | FIXED: the row now states that the route exists and that reaching it is not approval |
| MINOR-9 | "a provider that leaks a credential is refused" was overbroad — only undeclared fields are refused | FIXED: the contract now distinguishes undeclared fields (refused) from declared free-form fields (the provider's own choice; never asked for, never persisted) |
| MINOR-10 | `dispose()` closed a SUPPLIED bridge store, and a created store leaked when composition failed | FIXED in `src/install.ts` |
| NIT-11 | the spec doc under-claimed (surface untested, stale test count) | FIXED |

Claims the review attacked and could **not** break, each after a real attempt
(recorded here because a firewall that survived an adversary is evidence):

```text
no path from the plane to Work / Proof / Reasoning / Decision / Truth
  (every relative import in src/external_assets/** is project_workspace or schema)
no digest-less EXTERNAL_ASSET by ANY writer (write AND read path, all callers checked)
no search hit becoming a durable reference (prepareReference binds an inspection)
no newest-revision substitution (inspect AND the resolver both refuse a mismatched answer)
no provider-absence deletion or rewrite (the resolver only reads; no delete path exists)
no publication without the admission port (consulted before receipt, ledger, provider)
no bytes differing from the approved preview (8 bound fields, payload re-derived in the effect)
no hidden project context outbound (title/body + three palimpsest_journal_* labels only)
no double-publish on retry (operation key + provider idempotency; counter proven unchanged)
no blind retry of an uncertain non-idempotent publication (registry refuses that provider)
no oversized / binary / mismatched import (all denied at prepare, zero writes)
no Work/Proof/Decision mutation from an import (the owners are unreachable)
no arbitrary search query or result persisted (sentinel dump over all stores)
no cross-project ASSET scan in the resolver (filters the passed project only)
no replay dependency on the future (the bridge writes no canonical EventStore row)
no declared-but-uncomposed surface (the surface is spread into the returned object,
  and all nine routes answer 501 when the bridge is absent)
```


## 6. A pre-existing flake, root-caused and fixed

The full-suite gate failed intermittently with `TypeError: fetch failed` / cause
`bad port` in unrelated server tests. This was **not** AE-related, and it is now
explained rather than tolerated:

- WHATWG-compliant HTTP clients refuse to CONNECT to a fixed set of "bad ports"
  (5060, 5061, 6000, 6566, 6665-6669, 6679, 6697, 4045, …);
- `net` binds them happily, so a `port: 0` listener can be assigned one;
- this machine's dynamic port range is configured as **1024-15000**
  (`netsh int ipv4 show dynamicport tcp`), which contains them.

`serveOrchestration` now retries an ephemeral bind off that set (an explicitly
requested port is never second-guessed), and `test/serve_ephemeral_port.test.ts`
pins both halves: the mechanism (raw HTTP 200 on the same listener while `fetch`
refuses) and the fix. Two earlier full-suite runs had flaked on exactly this;
the suite has been deterministic since.

## 7. Honest limitations

1. **The test-only provider is test-only.** No real Personal Intellectual Asset
   System, Zotero, GitHub or institutional adapter ships (`CF-AE-04`).
2. **In-process vs separate process.** The unit-suite provider runs in-process
   over its own database; process-level separation is the §38 dogfood
   (`CF-AE-11`, closed there, not by the plane).
3. **`resolve()` caches nothing** and performs one inspection per reference
   (`CF-AE-15`).
4. **The error union is a superset** of what any path throws; seven kinds are
   reserved for states modelled as result variants (`CF-AE-13`).
5. **`CF-AE-10` has no adversary** that ATTEMPTS a cross-project read: the scoping
   is per-project by construction and a cross-project refusal is pinned, but no
   attack path exists to test.
6. **The publication effect is exported on the advanced barrel**, so a
   same-process embedder inside the trust boundary can invoke it directly; that
   is the boundary the security note in `EXTERNAL-ASSET-PUBLICATION-BOUNDARY.md`
   already states, not a new discovery.
7. **`EXT-A27` (remote CI)** is recorded in §8 after the merge.

## 8. Canonical checkpoint

Recorded after merge.
