# G10-AE — External Asset Library Bridge campaign

Campaign record for the stage that let one Palimpsest project explicitly use
knowledge owned by an external library without becoming that library. This is a
journal of what was decided, in what order, and on what evidence — not a second
specification. The requirements live in `G10-AE-EXTERNAL-ASSET-SPEC.md`.

Baseline: `a45f7c81bad07551c9c879b0048dba0df042cd30`.
Branch: `experiment/g10-ae-external-assets`.

```text
Campaign shape: one narrow ecosystem bridge, delivered in two passes —
  PASS 1 (bridge plane)  src/external_assets/** + test/ae_external_assets.test.ts
                         + the one additive ProjectAssetKind + install wiring
  PASS 2 (surface)       application surface, HTTP routes, agent tool, derived
                         workspace view, web External Assets tab, e2e, dogfood
```

## 1. The problem AE closes

G10-AD closed the last declared Work Mode capability, and its carry-forward
recorded that the product had a genuine boundary: a project's knowledge lives
inside the project and there is no way to deliberately use reusable knowledge
owned by another system. Before AE:

```text
- an external owner had no representation in ProjectAssetAssociation (the kind
  enum held only seven Palimpsest-owned kinds);
- no local owner accepted an external import without becoming a second truth;
- nothing in the product could search, inspect or reference an external library;
- nothing could deliberately send project knowledge back out under a separate
  approval;
- and, critically, there was no path by which external knowledge could leak into
  project context accidentally, because no such concept existed.
```

The AE mission was therefore two-sided and deliberately asymmetric: make external
knowledge **reachable by explicit action** while making it **unreachable by
automatic action**, and make outbound publication **possible** while making it
**impossible without a separate approval**.

## 2. AE0 findings (summary)

`G10-AE-EXTERNAL-ASSET-BRIDGE-ASSESSMENT.md` answers the five §4 questions:

```text
Q1 Can ProjectAssetAssociation represent an external owner today?   NO  (kind enum is closed)
Q2 Which local asset owner is suitable for explicit import?         the ProjectJournal only
Q3 Which project-local knowledge can be published?                  only a ProjectJournalEntry
Q4 Can Ordarium safely host publication?                            YES (reconcilable discipline)
Q5 Does any current path auto-search/auto-contextualize?            NO  (the concept did not exist)
```

The audit's most useful result was Q5: the absence was structural, not policy. No
provider registry, no library port and no external source existed anywhere in
`src/`, and the only retrieval planes derive from the project's own worktree and
projections. AE's job was to ADD a source without adding an injection path.

## 3. Decisions taken (and the alternatives rejected)

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| Exactly ONE additive `ProjectAssetKind` (`EXTERNAL_ASSET`) | Adding `Paper` / `Idea` / `Method` / `Dataset` / `Example` | §5: provider vocabulary must not become a Palimpsest asset ontology. AE-N07. |
| A durable reference is digest-bound by construction | Reusing the shared ref with an optional digest | §6: a reference without an exact revision is not durable. EXT-A03. |
| Durability requires `search → inspect → exact snapshot` | Turning a search hit (or its digest hint) into a reference | §8/§12: a hit is ephemeral and the latest is not the referenced revision. AE-N01/N05. |
| Import targets the EXISTING Journal and the caller names the kind | A new import store, or an automatic provider-type mapping | §14: the Journal is the one owner with no competing canonical owner; a mapping would make a provider type into a Palimpsest kind. AE-N09/N10. |
| Text materialization is optional, exact-digest-checked and BOUNDED (block, never truncate) | Truncating or summarizing inside import | §15 forbids both hidden truncation and LLM summarization. AE-N11/N12. |
| A narrow append-only bridge history owns receipts only | A bridge store that also holds imported content, or that duplicates reference durability | §17: receipts are operation lineage, not asset content; reference durability stays in the association store. AE-N27. |
| Publication previews the exact bytes; approval is a SEPARATE port | Treating a management mode, an HTTP credential or an agent action as approval | §21: approval is an authority, and this plane has none. AE-N17/N19. |
| Publication goes through a governed reconcilable Ordarium action | Calling the provider write from the Workspace/Web/tools | §22/§23: an uncertain external write must be recoverable, not blind-retried. AE-N21/N22/N23. |
| The test provider is TEST-ONLY over its OWN database | A shipped "personal asset store" | §32, and a §41 STOP condition. V-N05 forbids store-shaped names. |
| The bridge is opt-in: absent a provider registry, it does not exist | Composing a stub bridge into every install | An unused bridge must not change a bare Work-only install, and no library may be consulted by default. `src/install.ts:1829-1835`; tested at `test:1808-1815`. |

## 4. Plane and integration topology

```text
                       deployment config (never truth)
   ExternalAssetLibraryRegistry { get, list }
                    │
      ┌─────────────┴───────────────┐
      │                             │
  READ port                     WRITE port (separate, §23)
  search / inspect /            publish / reconcile
  materializeText / latestRevision
      │                             │
      └──────────────┬──────────────┘
                     │
        src/external_assets/service.ts   (the five operations)
          │            │             │
          │            │             └── effects.ts: palimpsest.external_asset.publish (Ordarium)
          │            │
          │            └── bridge_store.ts: EXTERNAL_*_PREPARED / _COMMITTED / _FAILED
          │
  EXISTING project owners (write seams only)
    ├── association.ts  → ONE EXTERNAL_ASSET ProjectAssetAssociation (assetKind pinned, digest required)
    └── journal.ts      → ONE ProjectJournal entry (the ONLY import target)

  resolver.ts → derived, read-only external view (RESOLVED / PROVIDER_UNAVAILABLE / REVISION_UNAVAILABLE)
```

Dependency direction: the plane imports `project_workspace/{association,journal}`
and the schema helpers, and NO Work/Proof/Reasoning owner (structural firewall
`test:498-527`). `install.ts` composes the plane additively behind
`options.externalAssetProviders` and defaults the bridge store beside the other
operating stores.

### 4.1 The integration layer

| Layer | What it adds | Where |
| --- | --- | --- |
| application surface | `ExternalAssetsApplicationSurface` — six read/prepare verbs plus the three OPERATOR-EXPLICIT commit/approve verbs | `src/application/surface.ts:628-650`, `:1298-1324` |
| HTTP | nine routes under `/api/external-assets/**` and the `externalAssets` discovery flag; no route accepts an admission decision, an approver or a credential | `src/application/http.ts:850-962`, `:160-162` |
| agent tool | `palimpsest_external_assets`, `mode: "read-only"`, six actions and no commit/approve action | `src/tools/application_tools.ts:828-911` |
| derived workspace view | `ProjectWorkspaceView.external` with `bridgeConfigured`, per-reference ownership/relation labels, provider availability, derived imports and warnings | `src/project_workspace/view.ts:169-296`, `:594-670`; ports at `src/project_workspace/service.ts:84-115` |
| install wiring | the workspace external ports handed over through a lazy wiring holder (the bridge is composed after the workspace) and the structured import-provenance reader | `src/install.ts:1668-1705`, `:955`, `:1951-1956` |

The integration layer was written after the 62-test bridge suite, so its claims
are now pinned by tests, and each row names the test that pins it.

## 5. Order of work

```text
1  AE0 audit                                             (no code)
2  refs / provider / registry                            (values, read port, config)
3  bridge_store                                          (two-phase receipts + chain)
4  service / resolver / import / publication / effects   (the five operations)
5  test/ae_external_assets.test.ts                       (70 tests; plane + gate-review hardening)
6  src/project_workspace/association.ts                  (ONE additive kind)
7  src/advanced.ts                                       (advanced barrel export)
8  install wiring                                        (options, InstalledExternalAssets, dispose)
9  test/v_adversarial.test.ts                            (V-N05 token narrowing, documented)
10 docs + gates
PASS 2 (separate) application surface / HTTP / tool / workspace view / web / e2e / dogfood
```

## 6. Incidents and corrections

| Incident | Resolution |
| --- | --- |
| `V-N05`'s source firewall forbade the bare token `ExternalAssetLibrary`, which the spec §7/§8 REQUIRES as `ExternalAssetLibraryRegistry` / `ExternalAssetLibraryReadPort`. | The token set was NARROWED, not dropped: `PersonalAsset*`, `PersonalKnowledge*` and `ExternalAssetLibraryStore/Database/Db/Table` still fail, and a declaration of a store-shaped name still fails. Recorded in the test itself (`test/v_adversarial.test.ts:176-190`) and as residual cost C5 of the anti-waste audit. |
| The install surface exposes every verb, including `approveAndPublish`, because it spreads the plane service. | Deliberate: the install object is host-owned. §28 splits the facing surfaces explicitly — the APPLICATION surface is the operator/UI face and is allowed the three operator-explicit verbs, while the AGENT tool must not have them. The tool therefore exposes six read/prepare actions and no commit/approve action (`src/tools/application_tools.ts:828-836`). Recorded as `CF-AE-12`, now pinned by `test/ae_integration.test.ts` (the tool's exact verb set) and `e2e/external-assets.spec.ts`. |
| The token set in `V-N05` was narrowed to store-SHAPED names, which allowed names it did not enumerate (`ExternalAssetLibraryContentStore`). | Replaced with a store-shape rule (`…Store/Table/Database/Repository/Cache/Index/Dao/Catalog`) plus a new assertion that no `CREATE TABLE` in `src/` names an external asset store. |
| Reference durability could have been duplicated into the bridge store. | Not duplicated: the bridge record has no association field set for it, and the §33 reference test asserts an EMPTY bridge lineage after a successful reference (`test:800-801`). |
| The derived view needs "a newer revision exists", which is not one of the four capabilities. | `latestRevision` is an OPTIONAL read-only port extension, not a fifth capability; when absent the view reports nothing (`test` HONEST note at `:2069-2072`). |
| The import crash window needed a deterministic local identity. | The candidate CONTAINS the exact Journal entry and the operation id is derived from five inputs, so a re-prepared candidate for the same operation is REFUSED rather than silently duplicating (`service.ts:789-798`; test at `test:1159-1174`). |

## 7. What this campaign did NOT do

```text
no global/personal asset store, memory or knowledge graph
no universal asset ontology (exactly one kind added)
no automatic retrieval, context injection or startup top-k
no library watcher, webhook or auto-refresh
no cross-project asset relations or project scan
no Evidence / Proof / Reasoning admission bridge
no applicability or recommendation engine
no publication of anything but a ProjectJournalEntry
no LLM summarization or hidden truncation inside import
no shipped provider implementation (TEST-ONLY fixture only)
no change to VERIFY, MONITOR, management, proof, reasoning, campaign or scheduler
```

## 8. Gates (§38)

```text
git diff --check
pnpm build
pnpm test
pnpm run build:web
pnpm exec playwright test
```

Plus the exercised scenarios: independent fixture-process dogfood; search/inspect
zero-mutation proof; reference restart; provider unavailable / newer revision;
explicit Journal import; import crash/idempotency; publication preview/approval;
publication crash/recovery; no auto-context/admission; AD + AC-R regressions.

Pass-1 status, honest:

```text
bridge-plane proofs   test/ae_external_assets.test.ts — 70 tests
install-level proofs  inside the same file (install wiring suite)
the fixture           test/fixtures/external_library_fixture.ts (TEST-ONLY, in-process)
surface proofs        test/ae_integration.test.ts — 19 tests (surface, HTTP routes,
                      read-only agent tool, derived workspace view, 501-when-uncomposed)
browser proofs        e2e/external-assets.spec.ts — 7 playwright tests
the web tab           web/src/project_workspace/ProjectWorkspaceView.tsx (External Assets)
separate-process      test/fixtures/external_library_server.mjs (TEST-ONLY, own sqlite
fixture               schema, spawned over HTTP) + scripts/external_assets/ae-dogfood.mjs
gate numbers          see G10-AE-EXTERNAL-ASSET-DELIVERY.md
```

## 9. Carry-forward discipline

AE leaves its own carry-forward set (`G10-AE-CARRY-FORWARD.md`) and disposes every
inherited item from G10-AD and G10-AC-R
(`G10-AE-AD-CARRY-FORWARD-DISPOSITION.md`). **AE closes no inherited item**, and
says so explicitly rather than implying progress by silence. The §42 "do not
implement now" list (binary import, native proof-source import, additional
publication kinds, a real PIAS provider, Zotero/GitHub/institutional adapters,
provider webhooks, applicability-aware retrieval, cross-project relations) is
carried trigger-by-trigger.

## 10. Exit state

```text
External assets are searchable, inspectable, referenceable and importable
ONLY by explicit action; nothing is auto-retrieved or auto-contextualized.
A durable reference is digest-bound and copies no content.
An explicit import lands in the EXISTING ProjectJournal under a caller-chosen
kind, with structured provenance and no Work/Evidence/Proof/Decision admission.
Outbound publication is limited to a Journal entry, shows the exact bytes,
requires a separate approval and runs through the governed effect path with
idempotent/reconcilable crash semantics.
The local Journal remains its own canonical history.
```
