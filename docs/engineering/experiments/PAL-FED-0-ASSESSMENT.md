# PAL-FED-0 Assessment (§67)

Status: EXPERIMENTAL. Audit performed before implementation on branch
`experiment/pal-fed-0`, base `59fae6e` + baseline portability repair `2ef77a9`.

Scope: implement the smallest real system in which two persistent project-level
AI points (`palimpsest.main`, `ordarium.main`) communicate directly and durably
while independently operating in their own repositories/worktrees.

---

## 1. Current Palimpsest state/ledger topology

Two physically separate SQLite stores, deliberately unrelated:

| Store | Owner | Default path | Role |
|---|---|---|---|
| Orchestration ledger | `EventStore` (`src/state/`) | `$DSH_HOME/palimpsest/palimpsest.sqlite` or `--db` | Canonical project state: event log + projections |
| Effects ledger | `@ordarium/ledger-sqlite` via `createPalimpsestEffects` (`src/effects/runtime.ts`) | `$DSH_HOME/ordarium/operations.sqlite` or `--ops` | Ordarium operation timeline + revisioned management state |

Facts that shaped the design:

- `createStateStore({ runtime })` exposes the Ordarium **state kind** and is the
  only sanctioned management-state surface (`src/effects/runtime.ts:124`).
- Ordarium supplies `StateRef` existence checking (`assertRefsExist`,
  `@ordarium/core/src/state.ts`), so a dangling reference fails closed before
  the CAS — PAL-FED-0 reuses it rather than inventing edges.
- Ordarium 1.3.1 adds `StateChangeFeed` (`changes(filter, cursor)`), an
  ascending, opaque-cursor, commit-order observation primitive. This is the
  coordination clock PAL-FED-0 needs and the reason for the pin bump.

**Decision:** the collaboration substrate is a *third* database, not either of
the two above, and the collab module never touches project state.

## 2. Current Ordarium adapter integration

- Explicit Action-calling host (`docs/12 §9`), not a tool registration.
- `PalimpsestEffectsRuntime` owns the runtime, the state facade, a total
  `HostInvocationPort` pass-through and the `invoke()` helper which injects a
  deterministic `InvocationIdentity` plus plan-revision authorization.
- Host-contract generation is pinned by literal `assertHostContract(1)`
  (`src/effects/runtime.ts:128`), and `test/host_conformance.test.ts` runs the
  upstream `runHostAdapterConformance` on a scratch ledger.

**Decision:** the federation leaf consumes `createStateStore` / `SqliteLedger`
directly from `@ordarium/core` and `@ordarium/ledger-sqlite`, and calls
`assertHostContract(1)` itself. It does **not** reuse
`PalimpsestEffectsRuntime`, whose `invoke()` authorization semantics are about
project effects, not collaboration writes.

## 3. Best place for the isolated collab module

`src/federation/` — a self-contained leaf. It:

- is **not** exported from `src/index.ts` or `src/advanced.ts`;
- is reachable only through its own bin (`palimpsest-collab`) and its own
  tests, so deleting the directory requires no change to the orchestrator;
- depends only on `@ordarium/*` and `src/schema/canonical.ts` (the standalone
  canonical JSON/SHA-256 helper).

Rejected: extending `ProjectController`, the scheduler, or the AgentGraph — all
would couple an experimental ontology into the frozen runtime.

## 4. MCP/tool registration seams

There is **no existing MCP server or tool-registration seam** in Palimpsest
(`src/tools/` is the in-process DSH tool surface; `src/serve.ts` is the web
presentation face). Therefore the experiment supplies its own leaf:

- `src/federation/mcp.ts`: a minimal JSON-RPC 2.0 stdio server
  (`initialize` / `tools/list` / `tools/call`, protocol `2024-11-05`), modelled
  on the proven shape of `@ordarium/host-mcp`, with no SDK dependency;
- exactly six tools: `collab_inbox`, `collab_ack`, `collab_post`,
  `collab_thread`, `contract_get`, `contract_update`;
- `src/federation/cli.ts`: the read-only operator surface
  (`init` / `status` / `events` / `contracts` / `peer-state` / `serve`).

Raw `state.write`, `state.changes`, SQLite and cursor mutation are never
exposed to the model.

## 5. Available InvocationIdentity / call-id semantics

`InvocationIdentity = { source, scope, callId, rootCallId?, actor?, lineage? }`
is required by every Ordarium state write. Sources of call id considered:

| Candidate | Stable across restart? | Verdict |
|---|---|---|
| MCP JSON-RPC `id` | No (client-scoped, reused after reconnect) | Not safe as an exactly-once key |
| CLI argv | No | Not safe |
| Ordarium `callId` on the operation | Only for operations, not MCP | Not applicable |

**Decision (§20):** event ids are server-generated (`evt_<uuid>`), and the
residual is recorded explicitly:

> An ambiguous adapter crash after the event commit but before the response may
> cause a caller retry to create a semantically duplicate event.

Duplicates stay visible (distinct eventIds, same body) and harmless rather than
silently corrupting state. No distributed exactly-once protocol is invented,
and ORD-BOOT-0 is not enlarged.

## 6. How the coordination DB stays separate

- `openFederationStore(dbPath)` **requires** an explicit non-empty path; there
  is no default and no fallback to `$DSH_HOME` (contrast: `defaultStatePath`
  and `defaultOrdariumPath`).
- The DB lives outside both source worktrees
  (`docs/engineering/experiments/evidence/dogfood.config.json`).
- A DB is a fabric only if it holds `plmp.collab.meta/fabric`; startup fails
  closed on a missing/mismatched marker (`FED_FABRIC_MISSING` /
  `FED_FABRIC_MISMATCH`).
- The collaboration DB is canonical **only** for PAL-FED-0 collaboration
  objects; it is not canonical project state (§68).

## 7. How experimental durable records are parsed

One canonical strict decoder per record type in `src/federation/codec.ts`:

- exact envelopes; unknown durable fields rejected;
- closed tagged unions (`kind`, `artifact.kind`, `status`, `action`);
- bounded strings/arrays (§36 values in `limits.ts`);
- valid `PeerRef`, IDs, positive revisions, parseable timestamps;
- cross-field invariants: `from !== to`; `participants` is exactly the fixed
  pair; `termsDigest` must re-bind the stored terms; every acceptance must bind
  the **current** digest (FED-INV-5).

No `as CollaborationEvent` exists at any durable boundary. Model/CLI input goes
through the same envelope discipline via `strict.ts` + `inputs.ts`, so `from`
and `peer` are rejected as unknown fields.

## 8. How two independent adapter processes are tested

`test/federation_process.test.ts` spawns **two real child processes**
(`node dist/src/federation/cli.js serve`) with `self=palimpsest.main` and
`self=ordarium.main`, against one on-disk coordination DB, and drives them over
stdio JSON-RPC. It exercises P→O post, O→P reply, thread reconstruction,
contract propose/accept/agreed, an unacked restart, and pending-batch replay.
There is no in-memory transport for the main bilateral proof.

## 9. Pinning Ordarium 1.3.1 without a live-repo dependency

- `package.json` and `pnpm-workspace.yaml` `overrides` point at the published
  `ordarium-v1.3.1` release tarballs for `core`, `host-kit`, `ledger-sqlite`
  and `testing`; the lockfile records their integrity.
- No `../ordarium`, no `workspace:*`, no git branch HEAD is referenced.
- `test/federation_freeze.test.ts` asserts each installed package version is
  exactly `1.3.1`, that `HOST_CONTRACT_VERSION = 1`, and that
  `StateChangeFeed` is available through public APIs only.
- The one intended breakage of a bump boundary — the SQLite `user_version` pin
  in `test/ordarium_ledger.test.ts` moving 3 → 4 because ORD-BOOT-0 added the
  state-change ordering table — was updated in the pin commit.

## 10. Places this could accidentally become the wrong thing (prohibited)

| Risk | Where it would appear | Prohibition in the implementation |
|---|---|---|
| Second scheduler | a `collab_*` tool that decides/claims/dispatches work | The service only reads/writes boundary objects; it can neither see nor advance any project plan. No `decide()` exists here. |
| Second canonical project state | mirroring `ProjectIR`/tasks/ReadySet into the coordination DB | Shared objects are limited to events, contracts and references; a test asserts the federation namespaces contain only PAL-FED-0 types. |
| Central manager agent | an LLM inside the transport, or a `FederationManagerAgent` | The transport is dumb durable state; no LLM, no router, no supervisor (§38/FED-INV-9). |
| Shared task graph | `assign(peer, task)` or plan synchronization | No assignment primitive exists; `to` addresses a peer, never a task (§37/§39). |
| Shared filesystem authority | the adapter writing into the other repo | Locators are provenance strings; nothing is fetched or written (§16/§58). |
| Background wake | daemons, long-poll, SSE, scheduler callbacks | Observation is checkpoint-driven only; `collab_inbox` is the only door (§45). |
| Cursor self-churn | one cursor over all namespaces | Two separate namespace-filtered cursors; peerstate/meta writes cannot re-enter the inbox (§27). |

## 11. Baseline preflight findings

- `test/paths.test.ts:39` held the known host-specific `defaultStatePath("C:\\repo")`
  assumption; repaired host-natively in commit `2ef77a9` as a separate
  preparatory commit.
- Local baseline before federation: unit 60 files / 433 tests green;
  `build:web` green; browser E2E 21 specs — one **pre-existing, order-dependent
  Windows visibility flake** (`E2E-DEBUG-01`) that passes in isolation and in
  both half-suite groupings and passes 21/21 when the debugger spec runs first,
  but fails 20/21 in the exact default CI order. Retries remain 0; the flake is
  reported, not masked, and is not attributed to PAL-FED-0 (see DELIVERY).
