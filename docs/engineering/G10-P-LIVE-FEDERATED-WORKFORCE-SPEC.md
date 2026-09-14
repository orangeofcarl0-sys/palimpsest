# G10-P — Live Federated Workforce & Attention Loop (Spec)

Product Surface → Persistent Project Peers → Durable Event-Driven Collaboration → Real Dogfood.

Baseline: `orangeofcarl0-sys/palimpsest` `main @ 74b0a90042f091544c36531e7cef5d1bac5b4135`.
Ordarium baseline: `v1.2.0` pinned; selected `v1.3.1` (StateChangeFeed).

## Mission

Make two persistent project agents actually collaborate over time without manual message
relaying or a central planner. G10-O answered "can Palimpsest represent federation?"; G10-P
answers "can persistent project agents live inside that federation across hours, days, restarts
and disagreements?".

Correct causal chain (do NOT jump to empirical evaluation):
```
Semantic Closure → Product Closure → Live Operation → Operational Evidence → Empirical Organization Evaluation
```

## Conceptual target

```
Persistent Project Agent P (owns project/context/history)
        ↕ durable semantic collaboration
Persistent Project Agent O (owns different project/context/history)
```
Both exist before collaboration, stay autonomous during it, can reject/counter-propose, keep
local plans private, and share only boundary state / commitments / messages / evidence.

## Absolute semantic red lines

```
TransportTruth ≠ CollaborationTruth          Notification ≠ Activation
Activation ≠ PersistentIdentity              PeerRef ≠ RuntimeAgentRef ≠ SessionRef
PersistentPoint ≠ Session                    Main Agent ≠ AuthorityRoot
UserFocus ≠ AuthorityRoot

Conversation ≠ Agreement                     Message ≠ Commitment
BoundaryState ≠ Commitment                   Commitment ≠ EffectAuthority
EpistemicAdmission ≠ CommitmentAdmission     CommitmentAdmission ≠ EffectAdmission

Ordarium Signal ≠ Palimpsest Semantic Event  StateChangeFeed Event ≠ PeerMessage
StateChangeFeed Event ≠ Commitment           StateChangeFeed Event ≠ BoundaryArtifact
Host Wake ≠ Semantic Authority               HTTP Auth ≠ Semantic Authority
AtLeastOnceDelivery ≠ DuplicateSemanticEvent Retry ≠ Recommit
```

## Prohibitions

- No `FederationManager` / `GlobalAgentManager` / `MasterAgent` / `CrossProjectPlanner` /
  `GlobalTaskAllocator` / `GlobalConversationCoordinator`. Coordination is peer-to-peer
  semantic relations + a dumb durable transport + local attention decision + host activation.
- No new `ProjectAgentId` / `ProjectCellId` / `MainAgentId` unless a P0 audit proves a truly
  irreplaceable canonical identity exists (it did not): reuse PeerRef, PersistentPoint,
  RuntimeScope/Holon, workspace/repository binding, deployment configuration.
- Deployment configuration is host binding only; it can name a repo, PeerRef, PersistentPoint,
  DB path, transport namespace and host adapter, but can never answer semantic authority,
  accepted boundary truth, or active commitments.
- `StateChangeFeed` is mechanical notification transport only: read/validate the exact envelope,
  hand it to Palimpsest, let Palimpsest own meaning. Never treat a feed row as a canonical message.
- No general `AttentionScheduler`, priority marketplace, or global wake planner.
- No exactly-once claim: mechanical observation is at-least-once; convergence is idempotency/dedup.
- Ordarium v1.3.1 binds no ledger UUID to a cursor; a consumer pointed at a different ledger must
  fail closed or require an explicit operator reset (never silently restart at zero).

## Required pieces

1. **Ordarium upgrade** to v1.3.1 with coherent package versions and migration proof.
2. **Deployment profile** (typed, exact-key, host binding) + `palimpsest serve --profile`.
3. **Durable transport adapter** over Ordarium state + `StateChangeFeed`, mutation-capable, with a
   deployment-local cursor and an inbound pump; strict envelope parser; at-least-once + idempotent
   semantic ingest on stable operation identity.
4. **Minimal deterministic attention** (semantic derivation from canonical state), coalesced.
5. **Host activation adapter** (DSH `agents.resume`/`followUp`; Pi `sendMessage({triggerTurn})`),
   kept separate from the semantic decision; pull mode always valid.
6. **PeerRef ↔ PersistentPoint** live wiring.
7. **Commitment enumeration** read port (close CF-O-01) + collaboration projection commitments.
8. **Two-peer live harness** proving offline/restart/duplicate/counterproposal/sovereignty.
9. **Operational evidence** artifact (noncanonical telemetry) for the future Empirical stage.

## Exit criterion

> Two separately configured persistent project peers with different lived state can exchange durable
> semantic collaboration events, negotiate shared boundary state, form explicit commitments, survive
> process restarts and duplicate transport delivery, and receive host attention signals without a
> central planner; transport remains mechanically reliable but semantically neutral, Palimpsest
> remains the owner of collaboration meaning, and the existing application surface remains the only
> product façade.

## PARTIAL / STOP

PARTIAL if the two-peer flow needs manual message copying, live edits touch stores directly, PeerRef
changes per restart, the receiver must be online at send time, duplicates create duplicate semantic
events, a message auto-creates remote Work, host wake bypasses semantic authority, the full CLI
cannot expose advanced routes, a hidden shared planner context exists, or only unit mocks exist.
STOP — SEMANTIC REBASE REQUIRED if live federation needs a new global canonical manager, cannot
represent two peers without a new species, cannot separate transport from collaboration truth, needs
host session id as the durable peer identity, needs agent semantics in Ordarium, or must bypass the
application surface.

## Series invariant

One major stage at a time; close its invariants; carry real leftovers forward.
H recursive runtime organization · I organization self-observation · J governed organization evolution ·
K LivingSpec · L federated boundary collaboration · M runtime structural evolution · N collaborative
reasoning · O application/product surface · **P live persistent federation**.
