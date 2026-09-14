# G10-Q Anti-Waste Reconciliation

Load-bearing deliverable. After Ordarium v1.3.1's production binding exists (StateChangeFeed +
durable state CAS), this audits the semantic seams, adapters, pollers, cursor state, test scaffolding
and deployment code accumulated across G10-H…G10-P, and classifies each by responsibility.

Judgment rule (spec §3): **does this artifact own a distinct semantic/mechanical responsibility that
the lower layer intentionally does not own?** Cleaning must not become a semantic rebase (§14). A
`DELETE_REDUNDANT = none` outcome is fully legitimate when evidenced.

Baseline: `main @ d16a7d7c6ae67d7930fe662c7c777941481a31c3`. Ordarium v1.3.1.

## Vocabulary

| Class | Meaning |
| --- | --- |
| KEEP_SEMANTIC | Palimpsest-owned semantic capability Ordarium cannot replace. |
| KEEP_CONSUMER_STATE | Consumer/runtime state Ordarium explicitly leaves host-side. |
| BIND_PRODUCTION | Correct abstraction seam; the production implementation binds Ordarium/host. |
| DEMOTE_TEST_EMBEDDING | Still useful for test/embedding, but must not be described as the main production path. |
| DELETE_REDUNDANT | Fully replaced by a lower primitive; keeping it would create a second implementation. |
| DEFER_TRIGGERED | No current waste; expand only under an explicit trigger. |

## Inventory matrix

| Artifact | Layer | Current use | Classification | Default production? | Action | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `src/coordination/store.ts` `CoordinationStore` | semantic | ONE canonical append-only collaboration/commitment/participation history | KEEP_SEMANTIC | yes | none | `StateChangeFeed` is mechanical; it holds no message/commitment meaning |
| `src/federation/messaging.ts` `sendMessage`/`recordInboundMessage`/`threadView`/`inboxView` | semantic | message meaning, sender coherence, derived inbox | KEEP_SEMANTIC | yes | none | §9 transport≠collaboration |
| `src/federation/messaging.ts` `wakePeer` | semantic | explicit cross-peer transport-level attention request | KEEP_SEMANTIC | yes (optional) | none | distinct from derived attention + host activation (§11) |
| `src/federation/commitment_service.ts` | semantic | OFFERED/ACTIVE/RELEASED/REFUSED + enumeration | KEEP_SEMANTIC | yes | none | commitment meaning never Ordarium state |
| `src/federation/transport.ts` `PeerTransportPort`/`InboundPeerEnvelope` | seam | outbound transport requirement + inbound trust boundary | KEEP_SEMANTIC / BIND_PRODUCTION | yes (bound to durable transport) | none | seam ≠ ledger API (§8) |
| `src/federation/transport.ts` `callbackPeerTransportPort` | test/embedding | host-callback integration | DEMOTE_TEST_EMBEDDING | no | JSDoc annotation; docs exclude from default path | superseded as default by `peerTransportFromDurable` |
| `src/boundary_memory/transport.ts` `BoundaryCollaborationTransportPort` + `BoundaryRemoteEnvelope` | seam | boundary request/response semantics + canonical-home routing | KEEP_SEMANTIC | yes (bound) | none | has no durable equivalent: submission-only ≠ request/response (§9) |
| `src/boundary_memory/transport.ts` `FederatedBoundaryClient` | semantic | authenticated remote boundary mutation client | KEEP_SEMANTIC | yes | none | used by G10-L production wiring |
| `src/boundary_memory/transport.ts` `makeBoundaryHome` | semantic | the ONE canonical boundary home ingest path | KEEP_SEMANTIC | yes | none | remote mutations validated here |
| `src/boundary_memory/transport.ts` `callbackBoundaryTransportPort` | test/embedding | host-callback boundary transport | DEMOTE_TEST_EMBEDDING | no | JSDoc annotation | superseded for durable paths by `durableBoundaryClient` |
| `src/boundary_memory/transport.ts` `inProcessBoundaryTransportPort` | test | in-process home routing | DEMOTE_TEST_EMBEDDING | no | already annotated | used only by tests |
| `src/transport/envelope.ts` | seam | ONE strict durable wire envelope + mailbox mapping | KEEP_SEMANTIC | yes | none | only wire shape; no meaning |
| `src/transport/ordarium_transport.ts` `makeOrdariumDurableTransport` | mechanical binding | Ordarium state CAS + StateChangeFeed observation | BIND_PRODUCTION | yes | none | Ordarium-provided; no local reimplementation |
| `src/transport/cursor_store.ts` `SqliteTransportCursorStore` | consumer state | deployment-local opaque cursor persistence | KEEP_CONSUMER_STATE | yes | none | §6: host owns offset; only opaque cursor stored |
| `src/transport/pump.ts` `makeFederationInboundPump` | semantic consumer | change → reread → strict parse → semantic ingress → checkpoint | KEEP_SEMANTIC | yes | none | §7: no global ordering/revision scan/cursor generation/change-log |
| `src/transport/adapters.ts` `peerTransportFromDurable` | binding | production outbound peer transport | BIND_PRODUCTION | yes | none | |
| `src/transport/adapters.ts` `durableBoundaryClient` | binding | production-submission boundary client | BIND_PRODUCTION | yes | none | |
| `src/attention/service.ts` `makeAttentionService` | semantic | derived attention decision from canonical state | KEEP_SEMANTIC | yes | none | not a scheduler; no plan |
| `src/attention/marks.ts` `SqliteAttentionMarkStore` | consumer state | accepted-revision "already signaled" marks | KEEP_CONSUMER_STATE | yes | none | losing marks only re-signals |
| `src/attention/host_adapter.ts` `dshAgentsAttentionAdapter` / `piAttentionAdapter` | binding | real host cognition activation | BIND_PRODUCTION | yes | none | host-injected |
| `src/attention/host_adapter.ts` `recordingAttentionAdapter` | test | capture activations | DEMOTE_TEST_EMBEDDING | no | already annotated | never golden proof |
| `src/attention/host_adapter.ts` `nullAttentionAdapter` | pull mode | no activation configured | DEMOTE_TEST_EMBEDDING (pull) | pull only | already annotated | truth path is the inbox |
| `src/deployment/profile.ts` | config | typed host binding, exact-key | BIND_PRODUCTION | yes | none | cannot carry authority |
| `src/deployment/launch.ts` `launchDeployment` | composition | assemble the stack from a profile | BIND_PRODUCTION | yes | none | |
| `src/application/**` + `src/serve.ts` + `src/tools/**` | product | ONE façade for tools/HTTP/UI | KEEP_SEMANTIC | yes | none | |
| `src/cli.ts` `serve --profile` + `--pump` | product | reproducible launch; optional poll loop | BIND_PRODUCTION | yes | none | |
| `src/state/event_store.ts` `projection_cursors` | consumer state | Work projection schema cursor | KEEP_CONSUMER_STATE | yes | none | unrelated to transport feed |
| `src/state/**` `Work` event log | semantic | durable Work truth | KEEP_SEMANTIC | yes | none | |
| `src/campaign/*` explicit wake (`beginWake`/`resumeWake`) | semantic | campaign dormancy/wake cycle | KEEP_SEMANTIC | yes (explicit) | none | not a background waker |
| `test/` fake transport sinks | test | deterministic transport capture | DEMOTE_TEST_EMBEDDING | no | already test-only | |
| `src/organization*`, `src/runtime*`, `src/campaign`, `src/reasoning_cell`, `src/boundary_memory` stores | semantic | distinct canonical truths | KEEP_SEMANTIC | yes | none | no duplication |
| projected/positional UI state, layout | presentation | ephemeral | DEFER_TRIGGERED | n/a | none | CF-O-03 |
| projection digest cache | presentation | none exists | DEFER_TRIGGERED | n/a | none | CF-O-10 |

## Counts

```text
KEEP_SEMANTIC          ~24
KEEP_CONSUMER_STATE      3   (transport cursor, attention marks, Work projection cursor)
BIND_PRODUCTION         10
DEMOTE_TEST_EMBEDDING    6   (callbackPeerTransportPort, callbackBoundaryTransportPort,
                              inProcessBoundaryTransportPort, recordingAttentionAdapter,
                              nullAttentionAdapter(pull), test fake sinks)
DELETE_REDUNDANT         0
DEFER_TRIGGERED          2   (layout persistence, projection caching)
```

## No-delete justification

`DELETE_REDUNDANT = none`. Every pre-v1.3.1 artifact still owns a responsibility the lower layer
intentionally does not:

- **`cursor_store.ts`** — Ordarium v1.3.1 owns the durable *coordinate* but explicitly leaves the
  *consumer offset* host-side (§6). The store persists an opaque string only; it does not encode or
  order cursors. Deleting it would push consumer state into Peer/Commitment identity — a semantic rebase.
- **`pump.ts`** — the feed does not own collaboration meaning (§7). The pump performs semantic ingress
  and checkpointing; it implements no global ordering, revision scanning, cursor generation, or
  change-log table (source-proven below).
- **`callbackPeerTransportPort` / `callbackBoundaryTransportPort` / `inProcessBoundaryTransportPort`** —
  distinct behavior from the durable transport: the boundary ones provide **synchronous
  request/response** semantics the submission-only durable client deliberately cannot. Demotion (not
  deletion) preserves public compatibility.
- **`wakePeer`** — an explicit transport-level attention *request*, which is neither the local semantic
  derivation (`AttentionService`) nor host activation (`AttentionActivationPort`). Three distinct
  semantics (§11); collapsing them would introduce a second implicit wake engine.

## Source proofs (spec §13)

- **No second StateChangeFeed implementation.** `grep -rn "StateChangeFeed|stateChangeFeed|state_changes|change_seq" src/`
  matches only comments/imports in `advanced.ts`, `transport/*`; `createStateStore`/`SqliteLedger` are
  used only in `effects/runtime.ts` (Work effects) and `transport/ordarium_transport.ts` (transport).
- **No Palimpsest-generated global change sequence.** Coordination `seq` is per-store semantic ordering,
  not a wire/transport global position; the transport uses only the opaque Ordarium cursor.
- **No duplicate durable semantic mailbox store.** Only the Ordarium transport ledger holds envelopes;
  Palimpsest persists no competing mailbox table.
- **No second consumer cursor algorithm.** `SqliteTransportCursorStore` stores/returns an opaque string;
  the only cursor decoding lives in `@ordarium/ledger-sqlite`.
- **No second canonical Boundary truth / Coordination truth.** One `BoundaryMemoryStore` (canonical
  home) and one `CoordinationStore`; the application surface is a read façade.

## Boundary transports: why both exist

| | `BoundaryCollaborationTransportPort` (G10-L) | `DurableBoundaryClient` (G10-P) |
| --- | --- | --- |
| Semantics | synchronous request/response, returns the canonical home's basis | fire-and-forget submission, at-least-once |
| Reads | `workspace_view`, `current_accepted`, `pending_candidates`, `membership`, `changes_since`, `basis` | mutations only (reads refused) |
| Default production for | in-process / correlated transports | the durable Ordarium substrate |
| Cannot provide | durable cross-process delivery without a correlated reply protocol | synchronous reads (CF-P-02) |

Both are retained because they are not equivalent; the durable path is the default for cross-process
mutation, and the correlated path remains the only way to answer remote reads until CF-P-02 lands.

## Wake vs attention vs activation (frozen)

```text
FederationMessagingService.wakePeer   = explicit cross-peer transport-level attention REQUEST
AttentionService (derivation)         = local SEMANTIC derivation of facts needing attention
AttentionActivationPort (host)        = local HOST COGNITION activation (notification ≠ activation)
```
No two of these may default to an automatic wake engine; none does.

## Not a semantic rebase

This reconciliation does **not** replace `PeerRef`, merge BoundaryMemory/Commitments into Ordarium,
delete the ApplicationSurface, or collapse the transports into one generic JSON bus. None of those
were found necessary; had they been, the correct response would be `STOP — SEMANTIC REBASE REQUIRED`.

## DEMOTE actions executed

- `callbackPeerTransportPort` JSDoc: marked embedding/host-injected; the default production outbound
  binding is the Ordarium durable transport (`peerTransportFromDurable`).
- `callbackBoundaryTransportPort` JSDoc: marked embedding/test; the durable boundary path uses
  `durableBoundaryClient` / a canonical home.
- `inProcessBoundaryTransportPort`, `recordingAttentionAdapter`, `nullAttentionAdapter` already carry
  test/pull annotations.
- Production docs (`G10-P-LIVE-FEDERATED-WORKFORCE-*`, root README, package description) describe the
  Ordarium-durable + real-host path, not callback adapters.

## DEFER_TRIGGERED

- Layout/position persistence (CF-O-03) and projection caching (CF-O-10) — no current waste; triggers
  unchanged.

```text
Anti-waste result: KEEP 24 · CONSUMER_STATE 3 · BIND 10 · DEMOTE 6 · DELETE 0 · DEFER 2
No competing default production path remains; no duplicated truth ownership.
```
