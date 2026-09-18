# G10-O Unified Application Surface & MultiGraph Debugger — O0 Assessment

Baseline audited: `orangeofcarl0-sys/palimpsest` `main @ d1e128e`.
Read: `src/install.ts`, `src/tools/**`, `src/serve.ts`, `web/src/**`, `src/advanced.ts`, and the
G10-N delivery/carry-forward docs.

## O0 — current composition

```text
installPalimpsest(controller, options)
   ├ controller / Work            (always)
   ├ runtime?                     (carrier or observation+continuity)
   ├ federation?                  (localPeer + coordination + transport + directory + attemptCatalog)
   ├ organization?                (organizationStore)
   ├ institution?                 (organization + institution stores)
   ├ campaign?                    (campaignStore + institution source)
   ├ runtimeScopes? / holons?     (runtimeScopeStore)
   ├ organizationDynamics?        (runtimeScopes + organizationStore)
   ├ organizationEvolution?       (dynamics + store + compiler + authority)
   ├ boundaryMemory?              (boundaryMemoryStore + localPeer)
   ├ federatedBoundaryMemory?     (localPeer + transport + route)
   ├ runtimeEvolution?            (runtimeScopes + dynamics + store + compiler + authority)
   └ reasoningCells?              (reasoningCellStore + verification + admission policy)
```

**Gap found.** All of these were reachable only from `advanced` for code consumers:
`definePalimpsestTools(controller)` exposed exactly nine Work tools, `src/serve.ts` accepted only a
`ProjectController` and served only legacy Work routes, and `web/src` had a single Work
canvas (live/draft) with no multi-graph shell. Hence
`SemanticKernel ⇏ AgentExperience ⇏ HumanOperability`.

## O0 — server boundary

`src/serve.ts` is a raw `node:http` if-chain over one `ProjectController`:
`GET /api/health|graph|presets`, `POST /api/control/:op|preset/:id/draft|proposal/validate|proposal/declare|canvas/{compile,diff,anchor,layout,insert,patch}`.
A per-start bearer token (Authorization header, or the browser cookie the root-url handoff mints)
gates `/api/*` behind a browser-trust fence on Host/Origin/Sec-Fetch; the token is never accepted
from a query string on `/api`. Static assets come from
`<packageRoot>/dist/web`. There is **no** route-table abstraction and no `InstalledPalimpsest`
parameter — the assembly gap this campaign closes.

## O0 — legacy compatibility (frozen)

The nine Work tools keep their names, JSON-schema inputs, output convention, and `mode`
declarations unchanged: `palimpsest_start|plan|next|preview|run|claim|report|gate|status`
(`preview`/`status` remain the entire read-only set). Existing tests assert exactly these nine on a
bare install, so the application tools are registered **only when their surface exists**. Legacy
HTTP routes and Work web flows are untouched.

## O0 — advanced-method classification

| Class | Examples | Exposed as an application action? |
|---|---|---|
| READ_ONLY | `workspaceView`, `currentAccepted`, `pendingCandidates`, `membership`, `boundaryObservation`, `listScopes`, `scopeState`, `holonView`, `organization head/lifecycle/retirements`, `institution head/currentEpoch/institutions/currentBodies`, `campaign definition/commitmentStates/hypotheses/basis`, `dynamics observe/diagnose/propose/proposalImpact/evaluateProposal`, evolution `inspect*`, reasoning `cellView/frontier/claimGraph/branchBrief`, projections | YES |
| HIGH_LEVEL_SAFE_MUTATION | boundary `proposeRevision`/`acceptRevision`/`rejectRevision`, commitment `offer/accept/reject/release/handoff`, reasoning `openBranch/submitCandidate/evaluateCandidate/requestInvalidation`, governed evolution `prepare/advance` | YES |
| LOW_LEVEL_INTERNAL | raw scope `addMember/removeMember/associatePeer/declareBoundary`, boundary `createArtifact/openWorkspace`, campaign commitment mutators | NO |
| AUTHORITY_INTERNAL | representation admission, organization/runtime evolution authority, continuation governance | NO |
| RAW_STORE_INTERNAL | every `*Store.append*`/`registerRevision`/`applyStructuralTransition`/`openWorkspace` | NO |

## O0 — N carry-forward disposition

CF-N-01…09 are adjudicated in `G10-O-N-CARRY-FORWARD-DISPOSITION.md`: none is an
application-surface blocker; the semantic bridges stay deferred (and are **displayed honestly as
not configured** rather than visually faked).

## Frozen-contract impact

Additive only: a new `src/application/` layer, additive install options
(`organizationDynamicsPolicy`), an additive `installed.application` key, additive tool
registration, an optional `application` parameter for `serveOrchestration`, and an additive
web MultiGraph view. No new canonical truth species, no second authority plane.
