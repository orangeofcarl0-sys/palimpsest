# G10-E2 — Contact Need & Peer Discovery Record

## ContactNeed (§48/§126)

| Field | Meaning |
| --- | --- |
| `contactNeedId` | stable identity of the need (allocator/caller-derived; explicit) |
| `origin` | the real local need: an AttemptRef, an ActivationRef, or an explicit runtime/work scope — a need never exists ownerless or invented |
| `competenceTags` | the semantic set of capabilities the need asks for |
| `reason` | the human-auditable why |

Lifecycle (§126): deliberately not implemented as mutable status — needs are
explicit artifacts; event-derived lifecycle (OPEN/CONTACTING/COMMITTED/…)
arrives with the durable collaboration events when the flow needs it. Work
state is never mutated automatically.

## Discovery flow (§53/§109 preview)

```text
ContactNeed (explicit)
        ↓
PeerDirectoryPort.observePeers()   ← read-only; known/unknown/error
        ↓ (unknown → directory_unknown; NEVER an empty directory)
matchContactCandidates (pure: tag subset + lexical order)
        ↓
ContactCandidate[]  = "worth contacting" — no mutation, no assignment
        ↓ (user/agent chooses whom to contact)
message / commitment offer   ← later stages, Ordarium-admitted
```

Candidate generation is a pure function over observed facts; it mutates no
peer state and creates no relation.
