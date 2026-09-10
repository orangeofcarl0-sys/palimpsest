# PAL-FED-0D Spec (DSH-native runtime binding)

Status: EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN.
The federation ontology is unchanged from PAL-FED-0 (§1). This spec covers only
the Agent host/runtime binding.

## 1. Frozen substrate

- DSH `0.1.5-rc.1` (exact), Node v24.14.1.
- Ordarium `v1.3.1` (commit `073409b`), SQLite schema v4,
  `HOST_CONTRACT_VERSION = 1`.
- PAL-FED protocol unchanged: `PeerRef`, `CollaborationEvent`,
  `BoundaryContract`, derived `Thread`, pending batch, `collab_ack`, fabric
  marker, `StateChangeFeed`.

## 2. Layers

```
DSH Agent + DSH Session + DSH Loop        (cognition, lifecycle, inbox, tools)
        |  agent-scoped six tools
PAL-FED collaboration service             (peer/event/contract/inbox semantics)
        |  public Ordarium state APIs
frozen Ordarium v1.3.1                    (CAS, revisions, ordered observation)
        |  StateChangeFeed
coordination.sqlite                       (outside both worktrees)
```

## 3. Plugin (`pal-fed-collab`)

Cordis plugin, one instance per DSH profile (= one peer).

```
name   = "pal-fed-collab"
inject = ["agents", "tools", "systemPrompt"]
```

Config (trusted profile patch; unknown keys rejected):

| Key | Meaning |
|---|---|
| `selfPeer` | `palimpsest.main` \| `ordarium.main` (trusted binding) |
| `fabricId` | must match the coordination DB marker |
| `dbPath` | explicit coordination DB path (no default) |
| `sessionId` | stable DSH session identity for the peer agent |
| `cwd` | the peer's own worktree |
| `resume` | resume the persisted DSH session instead of creating fresh |
| `model?` | `{ provider, model }`; omit to use the deployment default |
| `watchIntervalMs` | bounded poll interval, default 2000, range 200–60000 |
| `initialPrompt?` | one-shot operator seed for a fresh session only |

On apply the plugin:

1. opens the federation service (fails closed on fabric missing/mismatch);
2. `ctx.agents.create` / `resume` for the peer agent;
3. inside `setup(agentCtx, agent)`: registers the six tools via
   `agentCtx.tools.register` and the operating guidance via
   `agentCtx.systemPrompt.section` — **agent-scoped**, so a subagent inherits
   neither. The guidance carries an explicit **contact criterion** (§41): if a
   decision materially depends on the peer's owned interface, constraint,
   implementation state or authority, prefer contacting the peer over guessing
   or asking the user to relay; otherwise do not. It never says "always contact
   the peer";
4. starts the watcher;
5. exposes readiness through `palFedReadyOf(ctx)` because DSH boot settlement
   does not itself await a plugin effect's async body;
6. registers an effect disposer that stops the watcher, disposes the agent and
   closes the service.

## 4. Tools (agent-scoped, §25)

| Tool | Effect | Provenance recorded |
|---|---|---|
| `collab_inbox` | **mutating** (may persist a pending batch) | DSH callId/rootCallId |
| `collab_ack` | mutating | DSH callId/rootCallId |
| `collab_post` | mutating | DSH callId/rootCallId |
| `collab_thread` | read-only | — |
| `contract_get` | read-only | — |
| `contract_update` | mutating | DSH callId/rootCallId |

Tool names/arguments are re-validated by the PAL-FED strict envelopes, so
`from`, an accepting `peer`, or any unknown durable field is rejected.

## 5. Invocation provenance (§8/§32)

A mutating tool call writes Ordarium state with

```ts
InvocationIdentity {
  source: "dsh",
  scope: <DSH session/agent scope>,
  callId: <real ToolRunContext.callId>,
  rootCallId: <real ToolRunContext.rootCallId>,
  actor: <configured PeerRef>,
  lineage: ["pal-fed-0d", "fabric:<fabricId>"],
}
```

The durable author (`event.from`, `contract.proposedBy`, `acceptance.peer`)
remains the configured `PeerRef`. Model text can never supply either.

## 6. Watcher (§18–§23)

Deterministic infrastructure, no LLM:

```
StateChangeFeed -> collab_inbox() -> pending batch persisted
             -> agent.followup(thin notice) -> DSH inbox -> DSH wakes driver
```

- Wake notice text is thin (`batch <id> pending; use collab_inbox, ack after
  handling`), never the payload; the coordination DB is the truth.
- `wake != ack`: `followup` never advances a cursor.
- Dedupe: one wake per pending batch id per adapter lifetime; a restart with the
  batch still pending wakes again.
- Polling is bounded and configurable; no new Ordarium wait primitive, SSE,
  WebSocket, Redis or NATS.

## 7. Frozen runtime artifact (§27)

`tools/build-pal-fed-runtime.mjs` produces, outside both worktrees:

```
pal-fed-runtime/
  build-id
  package-metadata.json      buildId, source commit, frozenCodeSha256
  SHA256SUMS
  package/
    package.json
    dist/…                   the frozen plugin + PAL-FED core bytes
    node_modules/            pinned dependency closure (link or copy)
```

Both peers load `package/dist/src/federation/dsh/plugin.js` from this same
artifact; `ActiveProjectWorktree != FederationControlPlaneBuild`.

## 8. Real dogfood host

`tools/pal-fed-dogfood.mjs` spawns two **separate** DSH host processes
(`tools/pal-fed-dogfood-peer.mjs`), one per peer, against the shared DB, using
the real DeepSeek provider. Identities are runtime roots: no `parentAgent`
relation between them. The operator supplies only P's opening boundary question;
O is woken by the system.

## 9. Frozen invariants (FED-DSH-INV)

- **1 DSH owns cognition** — lifecycle, session, loop and model invocation are
  DSH's; the plugin never drives the model.
- **2 Palimpsest owns collaboration semantics** — peer/event/contract/inbox
  policy stay in PAL-FED.
- **3 Ordarium owns mechanical durability** — CAS, revisions, ordered
  observation.
- **4 Stable peer is not runtime session** — `PeerRef != DshAgentId !=
  DshSessionId`.
- **5 Tool authority is scoped** — a subagent does not inherit peer authority.
- **6 Attention is not acknowledgement** — `Wake(B) => no Ack(B)`.
- **7 User focus is not hierarchy** — talking to P does not make P the root
  over O.
- **8 No human message bus** — normal P<->O collaboration needs no copy/paste
  and no manual "check your inbox".
