# G10-E4 — Handoff

Status: **G10-E4 · RESPONSIBILITY HANDOFF IMPLEMENTED · SESSION HANDOFF DEFERRED · NOT A FROZEN CONTRACT**

## Semantics (§97–§103)

A Handoff is an explicit responsibility transition — NOT an ordinary
collaboration event, message forwarding, or a reassignment command.

Preconditions (§98): an existing ACTIVE commitment; the current holder
initiates; an explicit transfer proposal; explicit target acceptance.

No unilateral handoff (§99): the current holder may OFFER; the target becomes
holder only by accepting. A planner-style statement ("peer B should take
this") executes nothing — only the offer/accept protocol does (§103).

## Shape and transition (§100/§101)

```ts
interface HandoffOffer { handoffId; commitmentId; from: PeerRef; to: PeerRef; scope; }
```

`HANDOFF_ACCEPTED` (from an AUTHENTICATED target) produces an EXPLICIT
transition, with no hidden in-place owner mutation:

```text
COMMITMENT_SUPERSEDED   (old commitment — history immutable)
HANDOFF_ACCEPTED        (successorCommitmentId = H(domain, handoffId, commitmentId))
COMMITMENT_OFFERED      (successor responsibility for the target)
COMMITMENT_ACCEPTED     (successor ACTIVE)
```

Replay determinism (§161): the same history produces the same
superseded/active states. The old commitment remains queryable as SUPERSEDED
with its original terms.

## Session handoff (§102)

```text
RESPONSIBILITY HANDOFF: IMPLEMENTED
SESSION HANDOFF: DEFERRED — HOST CONTRACT DOES NOT EXPOSE TRANSFER SEMANTICS
```

No session-transfer API or field exists anywhere in the module
(machine-audited, E4-M13); session ownership is never synthesized.
