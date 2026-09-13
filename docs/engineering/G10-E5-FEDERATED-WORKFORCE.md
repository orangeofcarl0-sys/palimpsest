# G10-E5 — Federated Workforce

Status: **G10-E5 · BOTTOM-UP FEDERATED WORKFORCE · NO GLOBAL PLANNER · NOT A FROZEN CONTRACT**

## The demonstrated flow (§106/§119/§128)

```text
real need (canonical Attempt/Activation scope)
        ↓ declareContactNeed (explicit)
ContactNeed
        ↓ findCandidates (read-only directory; unknown ≠ empty)
ContactCandidate[]            ← nothing assigned, nothing mutated
        ↓ human/agent chooses whom to contact
message / commitment offer    ← Ordarium-admitted transport
        ↓ transport delivery  (delivery ≠ ack)
authenticated acceptance      (proposed holder; unauthenticated never accepts)
        ↓
ACTIVE Commitment
        ↓ (optional, explicit)
Participation (Activation ↔ Attempt, recorded)
        ↓ optional Handoff (current holder offers; target accepts)
SUPERSEDED old + ACTIVE successor responsibility
        ↓
derived coalition / manpower-point views   ← projections, not an organization
```

## Service surface (§107/§108)

`installed.federation` (advanced): declareContactNeed, findCandidates,
requestContact, sendMessage, wakePeer, acknowledge, recordInboundMessage,
offerCommitment/acceptCommitment/rejectCommitment/releaseCommitment,
offerHandoff/acceptHandoff/rejectHandoff, beginParticipation/endParticipation,
thread/inbox/manpowerPoint/coalition. There is **no**
`assignPeerToTask`/`forcePeerParticipation`/`setWorker` (static-audited), and
the service is not a planner or authority root.

## Boundaries

- Candidate generation mutates no peer state (§109).
- Competence ≠ authority; focus ≠ authority root; commitment grants no
  Ordarium effect authority (§120/§121); collaboration ≠ evidence (§122/§123).
- WorkGraph unchanged; Scheduler does not choose PeerRef (§142-M12/M13).
- Session handoff still deferred (no host contract).

## Machine proofs (§142)

`test/federated_workforce.test.ts` (6 tests covering E5-M01..M16, including
the full §128 19-step flow with a real Work-projection Attempt, real Ordarium
ledger, scripted directory, and a second local instance acting as Peer-B).
Full unit at E5 close: **82 files / 704 tests**.
