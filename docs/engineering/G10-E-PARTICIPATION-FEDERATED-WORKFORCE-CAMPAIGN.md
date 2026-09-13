# G10-E — Participation & Federated Workforce Campaign Record

Status: **G10-E · PARTICIPATION & FEDERATED WORKFORCE · CAMPAIGN COMPLETE**

Umbrella record for the single-prompt G10-E campaign (§167).

---

## 1. Stage topology and canonical checkpoints

| Stage | Branch | PR | Final HEAD (green) | Merge | Post-stage main |
| --- | --- | --- | --- | --- | --- |
| E0 | `experiment/g10-e0-d-authority-participation-preflight` | #26 | `d7fcacb` (flake+rerun) | `225c20f` | `225c20f` — canonical 34719676518 success |
| E1 | `experiment/g10-e1-participation-grounding` | #27 | `37d1fcb` (first-run green) | `4f34052` | `4f34052` |
| E2 | `experiment/g10-e2-peer-contact-grounding` | #28 | `5be60a3` (first-run green) | `73f576b` | `73f576b` |
| E3 | `experiment/g10-e3-collaboration-events` | #29 | `e29d49f` (first-run green) | `05b74be` | `05b74be` |
| E4 | `experiment/g10-e4-commitment-handoff` | #30 | `c18e543` (first-run green) | `1fdcbdd` | `1fdcbdd` |
| E5 | `experiment/g10-e5-federated-workforce` | #31 | `a91bccd` (flake+rerun) | `d0883a3` | `d0883a3` |
| E6 | `experiment/g10-e6-federation-campaign-closure` | #32 | branch HEAD `cf4d9e2` — run 34749561186: e2e PASS, unit job hit a runner-acquisition infrastructure failure (5 attempts, never started) → failed-job rerun → **success** | recorded at merge | recorded at merge |

Known `E2E-DEBUG-01`/`E2E-RUNTIME-03` flakes were handled exclusively by
failed-job reruns with every failure preserved. Process notes recorded
honestly: two E-stage merges were issued concurrently with their final-HEAD
run watch and landed before the flake was observed; in each case remediation
was immediate (rerun green, then the canonical post-merge run was verified
green on its own SHA). GitHub API 502/504/EOF/timeouts occurred during some
E5/E6 PR operations and were retried; no history was rewritten.

## 2. D authority closure (E0)

- **D-AUTH-01**: `RuntimeReleaseHandle` (generated only after successful
  realization; `authorizedWorkRevision` derived from the realized
  RunDefinition) — ledger-proven `plan-revision:17` on release, never
  `plan-revision:0`.
- **D-MOD-01**: `ContinuityUnavailableError` moved to neutral
  `src/runtime/errors.ts`; the realize↔actions cycle removed (audited).
- **D-API-01**: `ActivationContextId` required and grammar-validated; retry
  vs replacement explicit (retry dedupes; new context realizes a new carrier).

## 3. Participation model (E1)

The intentionally-open `Activation ↔ Attempt` relation is now explicit
through `Invocation` (a request — never acceptance) and `Participation`
(actual participation — never ownership/assignment/commitment/evidence;
invocation optional so voluntary participation is representable). Cardinality
stays OPEN. Refs are derived (actual Activation; canonical Attempt validated
read-only against the Work store). Events: `INVOCATION_RECORDED`,
`PARTICIPATION_STARTED`, `PARTICIPATION_ENDED`.

## 4. Coordination store ownership (E0 decision / E1 implementation)

ONE canonical Palimpsest-owned append-only store
(`$DSH_HOME/palimpsest/coordination.sqlite`): monotonic seq, deterministic
eventIds, canonical-JSON payload comparison (byte-identical idempotent,
different → `coordination_conflict`), strict per-type parsers (extensible
registry, never a generic bag), malformed-row fail-closed reads, restart-safe,
multi-process safe, no delete. Concern ≠ store: participation, collaboration,
and commitment streams share the store while remaining distinct semantics.

## 5. PeerRef identity model (E2)

`PeerRef` = stable addressable collaboration identity (no transport address;
distinct from AgentDefinition/Activation/PersistentPoint/RuntimeAgent/Session).
`PeerContinuityAssociation` is an explicit link (association ≠ identity).
`PeerAdvertisement` = {peer, competenceTags} — not evidence, not authority.
`ContactNeed` — explicit creation only; Ownership ≠ ContactNeed. Discovery is
read-only with D4 knowledge states (unknown ≠ empty); matching is pure
deterministic (subset + lexical); candidate ≠ assignment.

## 6. Transport authority & collaboration events (E3)

`PeerTransportPort` (outbound only) + production callback adapter; both
outbound mutations are Ordarium idempotent Safe Actions keyed by the stable
messageId/wakeId; the port is reachable only inside `execute`. Inbound enters
through the authenticated envelope (sender coherence fails closed;
unauthenticated content recorded `unverified`, never usable to accept
commitments). Events: CONTACT_REQUESTED, MESSAGE_PREPARED,
MESSAGE_DELIVERED, MESSAGE_RECEIVED, WAKE_SENT, ACK_RECORDED.

## 7. Thread/inbox projections (E3)

Both DERIVED from canonical events; no tables; restart-reproducible;
deterministic; unverified stays labelled.

## 8. Commitment semantics (E4)

Explicit acceptance only (proposed holder, authenticated for remote);
derived lifecycle from append-only events; no unilateral commitment; no
Work/scheduler/message/ack path creates one; rejection is a legitimate
outcome; release by the current holder only.

## 9. Handoff semantics (E4)

Current holder offers; authenticated target accepts; explicit transition
(SUPERSEDED + successor offer/accept); replay-deterministic; no hidden owner
mutation. `RESPONSIBILITY HANDOFF: IMPLEMENTED` / `SESSION HANDOFF: DEFERRED —
HOST CONTRACT DOES NOT EXPOSE TRANSFER SEMANTICS`.

## 10. Federated manpower-point view & bottom-up workflow (E5)

`ManpowerPointView` (PeerRef-anchored derived composite; optional continuity
only via explicit association; no new id; not a PersistentPoint/RuntimeAgent)
and `CoalitionView` (derived; no hierarchy). The §128 end-to-end flow and the
§129/§130/§131 guardrails are machine-proven. `installed.federation` is the
high-level surface; the root contract-core export stays clean.

## 11. Adversarial review outcomes (§144–§161)

| Attack | Outcome |
| --- | --- |
| fake ActivationRef / AttemptRef | rejected (derivation-only + catalog validation) |
| id collisions (peer/runtime/point/definition) | structural non-equivalence audits |
| caller spoofing outbound `from` | impossible (derived local peer) |
| unauthenticated commitment/handoff acceptance | `unauthenticated_acceptance` fail-closed |
| delivery → ack / ack → commitment / message → evidence | proven absent |
| competence → authority; focus → authority root | proven absent |
| scheduler task → commitment; invocation → participation | proven absent |
| handoff without acceptance; handoff mutating history | refused; old commitment immutable |
| wake → ack; conversation → agreement | zero acks/agreements produced |
| same message retry duplicated remotely | Ordarium/port stable-key dedupe proven |
| same eventId conflicting payload | `coordination_conflict` (X01/X02) |
| store restart corruption | malformed-row fail-closed read (X02) |
| coordination store duplicate truth | one store; Work/Ordarium/continuity disjoint (E6 §13) |
| direct transport mutation bypassing Ordarium | audited absent |
| release effect fake revision | closed in E0 (ledger-proven) |
| runtime effect cycle / activationContext omission | closed in E0 (audited/proven) |

Idempotency matrix (X01), multi-process store (X02), restart replay across
all four concerns (X03), evidence non-promotion (X04), persistence
optionality (X05) — all machine-proven.

## 12. Campaign-wide authority review (§146)

External mutations: runtime realize/release (Ordarium, G10-D + E0 fix), peer
message send/wake (Ordarium, E3). Each passes Ordarium admission, carries a
stable idempotency key, has grounded authorization (Work revision for
realization; federation scope + stable call id for transport), and cannot be
called directly by any high-level service. Commitment/handoff/participation
(and all views) have NO effect authority.

## 13. Campaign-wide semantic store review (§147)

| Store | Owns | Explicitly NOT | Views | Restart | Conflict |
| --- | --- | --- | --- | --- | --- |
| Work EventStore | Work/orchestration truth | collaboration, continuity, effects | projections | existing | existing |
| Continuity store (G10-D) | PersistentPoint identity | collaboration, Work, effects | none | proven | proven |
| Coordination store (E1) | participation/collaboration/commitment history | Work, continuity, effects | Thread/Inbox/Manpower/Coalition (derived) | proven | fail-closed |
| Ordarium ledger | effect admission/operation truth | semantic truths | — | existing | existing |

No overlapping canonical truth.

## 14. Campaign-wide event review (§148)

Every coordination event type has: an actor identity source (derived
ActivationRef or authenticated/local PeerRef), a target identity source
(canonical AttemptRef / PeerRef), deterministic idempotency (derived eventId;
transport-identity derived for inbound), explicit semantic transition, and an
explicit NOT-list (documented per event in `G10-E1-COORDINATION-STORE.md` and
`G10-E3-COLLABORATION-EVENTS.md`).

## 15. Campaign-wide trust review (§149)

Trusted boundaries: Activation artifacts (derived), AttemptRefs (canonical
validation), PeerRef (artifact), PeerAdvertisement (observed — never
evidence), directory observation (knowledge states), outbound transport
(Ordarium-admitted), inbound envelope (`authenticatedPeer` = what the adapter
asserts — NOT cryptographic unforgeability unless the adapter guarantees it),
commitment/handoff acceptance (authenticated holder/target). No trusted
object is described as unforgeable without a real guarantee.

## 16. Campaign-wide evidence & Work/runtime non-regression (§150–§152)

No `CollaborationEvent → Evidence` and no `Commitment → TruthVerification`
path exists (audited). Representative Work compilation/scheduler/attempt
paths remain collaboration-free (all suites green; no coordination imports in
scheduler/executor/controller). Runtime realization (ephemeral/persistent/
observation) remains independent of federation — no peer identity is required
to realize an AgentDefinition. All four runtime×collaboration combinations
are representable without cross-coupling (X05).

## 17. Failure semantics & cancellation (§154/§155)

Distinct outcome families implemented: `participation_invalid`, `attempt_terminal`,
`directory_unknown`, `no_candidate` (empty candidate list is a legitimate
result), `transport_failed`, `message_delivery_pending` (not needed
separately — delivery is an explicit event), `peer_unreachable` (transport
failure), `commitment_rejected`, `commitment_withdrawn` (RELEASED),
`handoff_rejected`, `handoff_invalid`, `peer_authentication_failed`
(sender coherence), `coordination_conflict`, plus the runtime families from
G10-D. None collapses into Attempt/Task failure or Binding unsatisfied.
Cancellation: federation transport carries no AbortSignal in this campaign
(deferred with the concrete host adapter, as in G10-D) — timeout means
unresolved, never automatic rejection.

## 18. Replay reviews (§159–§161)

ThreadView, InboxView, active-commitment state, and handoff successor states
all reproduce deterministically from canonical events after restart
(X03); no mutable row outranks history.

## 19. Final identity matrix (§145/§174)

| Identity | Owner | Must not equal |
| --- | --- | --- |
| ArchitectureDefinitionId / AgentDefinitionId | Architecture | Work/Peer/runtime |
| TaskId / definition_id | Work | AgentDefinition/Peer |
| AttemptId | Work/Runtime | Activation/Participation |
| ActivationId | Runtime (Palimpsest) | Attempt/Peer/carrier |
| RuntimeAgentRef / SessionRef | host runtime | Peer/Point/Definition |
| PersistentPointId | Continuity | Peer/carrier/AgentDefinition |
| PeerId (PeerRef) | Collaboration | runtime/session/point/definition |
| InvocationId | Execution interaction | Participation/Attempt |
| ParticipationId | Execution relation | Attempt/Activation ownership |
| ContactNeedId | collaboration need | ownership |
| CommitmentId | collaboration agreement | assignment |
| HandoffId | responsibility transition | ordinary message |
| ThreadId | derived grouping | agreement |

Load-bearing distinctions machine-proven across E1–E5.

## 20. Final verdict

**Canonical gate (§169)**: recorded below after the E6 merge (local gates +
canonical remote CI on the final main SHA).

All §171 PASS criteria hold: D-AUTH-01/D-MOD-01 closed; activation contexts
explicit; Invocation and Participation production-realized with the
Activation↔Attempt relation explicit and no ownership cardinality; PeerRef,
ContactNeed, discovery knowledge states, and candidate≠assignment realized;
durable collaboration events with derived Thread/Inbox; Wake≠Ack,
Delivery≠Ack, Ack≠Agreement, Conversation≠Agreement, CollaborationEvent≠
Evidence; explicit-acceptance commitments with Assignment≠Commitment and
Commitment≠Participation; handoff with explicit target acceptance and no
fabricated session handoff; Ordarium-admitted transport with an explicit
inbound trust boundary and no sender spoofing; the bottom-up
ContactNeed→peer→commitment flow executable end-to-end; ManpowerPointView
derived with focus≠authority and competence≠authority; coalition view
derived only; no global planner; no manager hierarchy; WorkGraph unchanged;
scheduler unchanged; AttemptExecutor unchanged; runtime realization
independent; persistence optional; full adversarial review complete; canonical
main green.

```text
G10-E PARTICIPATION & FEDERATED WORKFORCE CAMPAIGN: PASS
```

Recommended next major campaign (§178 — NOT started): **G10-F — Organization /
Coalition / Durable Institution Grounding**, now that bottom-up collaboration
is proven to work without hierarchy.

---

## 21. Additive historical note (G10-F0, §188)

The G10-E semantic architecture was completed at `6afa292`. The historical E
verdict above is **not rewritten**.

G10-F0 later hardened the coordination substrate that E introduced:

- `appendAtomic` + `expectedHeadSeq` — crash-atomic conditional batch;
- write serialization (`BEGIN IMMEDIATE`) + bounded `busy_timeout` for
  different-event cross-process appends;
- complete strict artifact parsers for every persisted event type;
- the four-event handoff transition is now ONE atomic batch.

F0 exists because durable institutions must not sit on a substrate where a
handoff can crash between "superseded" and "successor present". The reason F0
existed is preserved here; the E verdict stands as recorded.

See `docs/engineering/G10-F0-COORDINATION-INTEGRITY.md` and
`docs/engineering/G10-F0-EVENT-PARSER-AUDIT.md`.

---

## 22. Additive historical note (G10-F campaign completion)

The G10-F campaign (Organization, Coalition & Durable Institution Grounding)
completed on top of the E substrate, with F0 hardening the coordination store
first. The G10-E verdict above remains unchanged and is not rewritten.

See `docs/engineering/G10-F-ORGANIZATION-DURABLE-INSTITUTION-CAMPAIGN.md`.
