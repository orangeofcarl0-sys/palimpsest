# PAL-FED-0 Spec (as implemented)

Status: EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN.
Protocol string: `PAL-FED-0`. Durable schema generation: `1`.
Peers (fixed, exactly two): `palimpsest.main`, `ordarium.main`.

Implementation: `src/federation/`. Runtime: Ordarium `v1.3.1`
(`HOST_CONTRACT_VERSION = 1`, SQLite schema v4 with `StateChangeFeed`).

---

## 1. Namespaces and subjects

| Namespace | Key | Mutation | Purpose |
|---|---|---|---|
| `plmp.collab.meta` | `fabric` | revision 1 only (explicit init) | Host-defined fabric identity marker |
| `plmp.collab.event` | `eventId` | revision 1 only (immutable) | `CollaborationEvent` boundary deltas |
| `plmp.collab.contract` | `contractId` | revisioned (1,2,3,…) | `BoundaryContract` agreement candidate/state |
| `plmp.collab.peerstate` | `PeerRef` | revisioned | Per-peer cursors + pending batch |

Threads are **not** a namespace. A thread is
`View(events where threadId = X)`, reconstructed by a `StateChangeFeed` scan in
feed order.

## 2. Durable shapes

### Fabric marker
```ts
interface FederationFabricMarker {
  schemaVersion: 1;
  protocol: "PAL-FED-0";
  fabricId: string;
  peers: ["palimpsest.main", "ordarium.main"];
  createdAt: string;
}
```

### CollaborationEvent (immutable)
```ts
interface CollaborationEvent {
  schemaVersion: 1;
  eventId: string;            // adapter-generated, "evt_<uuid>"
  threadId: string;           // explicit or "thr_<uuid>" when the thread is opened
  from: PeerRef;              // injected: configured selfPeer
  to: PeerRef;                // validated against the fabric; must differ from `from`
  kind: "need" | "proposal" | "constraint" | "question"
      | "decision" | "change_ready" | "evidence" | "blocker";
  body: string;
  contractId?: string;
  artifacts?: ArtifactRef[];
  createdAt: string;          // injected by the adapter
}
```

### ArtifactRef (provenance locator, never embedded/auto-fetched)
```ts
interface ArtifactRef {
  kind: "git_commit" | "test_run" | "document" | "url" | "other";
  locator: string;
  label?: string;
  digest?: string;
}
```

### BoundaryContract (revisioned)
```ts
interface BoundaryContract {
  schemaVersion: 1;
  contractId: string;
  participants: ["palimpsest.main", "ordarium.main"];
  title: string;
  terms: {
    requirements: string[]; constraints: string[]; interfaceNotes: string[];
    acceptanceCriteria: string[]; openQuestions: string[];
  };
  termsDigest: string;                 // SHA-256 over canonical terms (Palimpsest canonical JSON)
  proposedBy: PeerRef;
  acceptedBy: { peer: PeerRef; termsDigest: string; acceptedAt: string }[];
  status: "draft" | "agreed";
  updatedBy: PeerRef;
  updatedAt: string;
}
```
On read, `termsDigest` must re-bind `terms`, and every `acceptedBy` entry must
bind the **current** digest; otherwise the record is rejected as corrupt.

### PeerInboxState
```ts
interface PeerInboxState {
  schemaVersion: 1;
  peer: PeerRef;
  eventCursor?: string;               // acknowledged feed position, events
  contractCursor?: string;            // acknowledged feed position, contracts
  pending?: {
    batchId: string;                  // "bat_<uuid>"
    eventNextCursor?: string;
    contractNextCursor?: string;
    eventIds: string[];               // relevant inbound events
    contractRevisions: { contractId: string; revision: number }[];
  };
  lastAckedBatchId?: string;
}
```

## 3. Model-facing tool surface (exactly six)

| Tool | Input (strict) | Notes |
|---|---|---|
| `collab_inbox` | `{}` | Returns the pending batch (redelivered after crash) or an empty result |
| `collab_ack` | `{batchId}` | Machine delivery ack; advances cursors, clears pending |
| `collab_post` | `{to, threadId?, kind, body, contractId?, artifacts?, replyToEventId?, contractRef?}` | **No `from`**; adapter injects identity/time/id |
| `collab_thread` | `{threadId}` | Derived view in feed order |
| `contract_get` | `{contractId, history?}` | Current revision/digest/agreement/acceptances/basis refs |
| `contract_update` | `{action:"propose", contractId, expectedRevision, title, terms, basisEventIds?}` or `{action:"accept", contractId, expectedRevision, expectedTermsDigest}` | Exact tagged union; no patch-merge in v0 |

Nothing else is exposed: no state writes, no change feed, no SQLite, no cursor
mutation.

## 4. Semantics

- **Ordering (§19).** Thread order is `StateChangeFeed` commit-observation
  order. `createdAt`, UUID lexical order and event keys are never the clock.
- **Presence.** `collab_inbox` first returns any existing pending batch
  unchanged. Otherwise it scans the event stream after `eventCursor` and the
  contract stream after `contractCursor`, selects items relevant to `selfPeer`
  (inbound events; contract revisions whose `updatedBy` is the other peer),
  persists a pending batch, and only then returns it. A scan containing only
  irrelevant items advances the cursors without creating a batch.
- **Ack.** `collab_ack(batchId)` requires `pending.batchId === batchId`, then
  CAS-advances both cursors to the pending next positions, clears pending and
  records `lastAckedBatchId`. A repeat of the immediately completed batch is an
  idempotent no-op; any other id fails closed and moves nothing.
- **Contract propose.** Supplies the *complete* next terms, recomputes
  `termsDigest`, clears all acceptances, sets `status="draft"`, and CAS-writes
  at `expectedRevision` (0 creates). Declared `basisEventIds` become `StateRef`s.
- **Contract accept.** Reads the exact current revision, checks the digest
  against `expectedTermsDigest`, appends an acceptance for the configured
  `selfPeer` only, and sets `agreed` iff both peers accepted the current
  digest. Already-accepted same digest is a no-op.
- **Conversation ≠ Agreement.** A natural-language "I agree" is just an event;
  only `contract_update action=accept` changes agreement state.
- **Conflict.** Concurrent proposals from revision N: one CAS wins, the loser
  gets an explicit `FED_CONFLICT` (with `currentRevision`) and must re-read and
  choose accept / counter-propose / escalate. Never last-writer-wins.
- **Checkpoint-driven.** No daemon, long-poll, SSE or WebSocket. The inbox is
  read when a Main Agent chooses a checkpoint.

## 5. Size discipline (§36, chosen values)

| Bound | Value |
|---|---|
| Event body | 1 … 8192 chars |
| Artifacts per event | ≤ 16 |
| Artifact locator / label / digest | ≤ 2048 / 256 / 128 chars |
| Contract title | 1 … 512 chars |
| Terms list length (each of 5) | ≤ 64 items |
| Individual term | 1 … 2048 chars |
| Identifiers / fabricId | ≤ 128 chars |
| Feed page | 200 changes |

These are intentionally far below Ordarium's 1 MiB state-value ceiling to
encourage boundary deltas rather than context dumps.

## 6. Event identity and duplicates

Event ids are server-owned (`evt_<uuid>`, collision-resistant). A stable,
restart-safe host call identity is **not** available (see ASSESSMENT §5), so the
residual stands: an ambiguous adapter crash after commit but before response
may yield a semantically duplicate event on caller retry. Duplicates remain
visible (distinct ids) and harmless; no exactly-once protocol was invented.

## 7. Frozen experimental invariants

- **FED-INV-1 Peer sovereignty** — no implicit hierarchy; `to` addresses a peer,
  never a task.
- **FED-INV-2 Principal integrity** — `PersistedAuthor = ConfiguredSelfPeer`;
  model input cannot supply `from` or an accepting peer.
- **FED-INV-3 Event immutability** — every `CollaborationEvent` subject is at
  revision 1 forever.
- **FED-INV-4 Conversation ≠ Agreement** — only explicit acceptance sets
  `agreed`.
- **FED-INV-5 Agreement digest binding** — an acceptance is valid only for the
  exact current terms digest.
- **FED-INV-6 CAS collaboration state** — concurrent contract change never
  silently last-writer-wins.
- **FED-INV-7 No lost unread collaboration** — no durable cursor advances past
  a pending relevant batch before explicit ack.
- **FED-INV-8 Local-work privacy** — shared state holds boundary deltas, not
  synchronized internal work graphs.
- **FED-INV-9 No central cognitive root** — the transport contains no
  manager/planner LLM.
- **FED-INV-10 Frozen substrate** — PAL-FED-0 runs on immutable Ordarium
  v1.3.1 artifacts, not live Ordarium HEAD.

## 8. Operator surface

`palimpsest-collab init|status|events|contracts|peer-state|serve` — read-only
observation except `init` (marker creation) and `serve` (the six-tool
adapter). It introduces no second source of truth and no GUI.
