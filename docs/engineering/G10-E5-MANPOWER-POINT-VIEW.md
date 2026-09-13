# G10-E5 — Manpower-Point View

Status: **DERIVED VIEW — NOT A NEW IDENTITY ONTOLOGY (§111/§112/§139)**

```ts
interface ManpowerPointView {
  peer: PeerRef;                          // the ONLY identity anchor
  continuity?: DurableContinuityRef;      // only via an explicit association (§113)
  advertisement?: PeerAdvertisement;      // observed; competence ≠ authority
  activeCommitments: CommitmentOffer[];   // derived from event history
  activeParticipations: Participation[];  // derived
  inbox: InboxView;                       // derived
}
```

- No `ManpowerPointId` exists — PeerRef anchors collaboration identity.
- `ManpowerPoint ≠ PersistentPoint` and `≠ RuntimeAgent`: it is a COMPOSITE
  VIEW, never an entity.
- Continuity appears only when an explicit `PeerContinuityAssociation`
  source exists; with none, the field is absent (never assumed) — and a
  PeerRef collaborates fully without any PersistentPoint (§114, machine-proven
  in the §128 flow, which involves no point at all).

## Theory mapping (§139)

| P_i field | Implementation | Classification |
| --- | --- | --- |
| Identity | PeerRef | canonical collaboration identity |
| Continuity | optional association → PersistentPoint | optional, explicit |
| Runtime | optional Activation / RuntimeAgentRef | runtime-owned, optional |
| Capabilities | advertisement / observation | NOT truth, NOT authority |
| Commitments | canonical commitment event history | agreed semantics |
| Inbox | derived collaboration-event view | projection |
| Workspace | elsewhere (Work/runtime ownership) | NOT PeerRef identity |
| Context | existing context mechanisms | not duplicated |
| Memory | not implemented as a PeerRef/point requirement | intentionally absent |
| Authority | existing explicit authority systems | never inferred |
| Lifecycle | derived from events/runtime/continuity | projection |
