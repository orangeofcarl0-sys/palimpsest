# G10-E4 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| E4-M01 Assignment ≠ Commitment | no Work/scheduler interaction in the service | static audit | implemented + machine-tested |
| E4-M02 message ≠ Commitment | message events never offered here | static audit + E3 cross-check | implemented + machine-tested |
| E4-M03 ack ≠ Commitment | same | static audit | implemented + machine-tested |
| E4-M04 offer ≠ ACTIVE | derived state from COMMITMENT_ACCEPTED only | OFFERED-before-accept test | implemented + machine-tested |
| E4-M05 acceptance requires proposed holder | `assertCanAccept` | third-party rejection test | implemented + machine-tested |
| E4-M06 unauthenticated acceptance rejected | `unauthenticated_acceptance` | null-identity test | implemented + machine-tested |
| E4-M07 Commitment ≠ Participation | scope/terms carry no runtime identities | forbidden-field test | implemented + machine-tested |
| E4-M08 no WorkGraph mutation | untouched modules | static audit + suites | preserved |
| E4-M09 handoff requires ACTIVE | state precondition | offered-only rejection test | implemented + machine-tested |
| E4-M10 handoff requires target acceptance | offer/accept protocol | third-party + unauthenticated rejection tests | implemented + machine-tested |
| E4-M11 explicit successor responsibility | derived successor id + explicit events | successor-ACTIVE test | implemented + machine-tested |
| E4-M12 old commitment historical/immutable | SUPERSEDED, never rewritten | terms-preserved + replay test | implemented + machine-tested |
| E4-M13 session handoff not fabricated | no session API/fields | static audit | implemented (structural) |
| §93/§160 derived lifecycle | state from append-only history | state tests + replay | implemented + machine-tested |
| §92 rejection is a legitimate outcome | COMMITMENT_REJECTED state | rejection test | implemented + machine-tested |

## Non-goals held

No organization/hierarchy; no reputation/trust scores; no Work ownership; no
Evidence path; no session ownership; frozen contracts untouched.
