# G10-E4 — Agreement Boundaries

An ACTIVE accepted Commitment is one explicit form of agreement (§94).
Agreement is NEVER inferred from messages, acks, delivery, wake, or
participation — machine-proven across E3 and E4:

| Would-be inference | Proven false by |
| --- | --- |
| message → agreement | E4-M02 (message events create no commitment); E3-M10 (5 messages + 5 acks → zero agreement) |
| ack → agreement | E4-M03; E3-M09 (ack produces ACK_RECORDED only) |
| delivery → agreement | E3-M08 (MESSAGE_DELIVERED without ack) |
| wake → agreement | E3-M07 (WAKE_SENT only) |
| participation → agreement | E4-M07 (commitment payloads carry no participation fields; the two are orthogonal per §95) |
| assignment → agreement | E4-M01/M08 (no Work/scheduler path produces a commitment) |

`Commitment ≠ TruthVerification` and `CollaborationEvent ≠ Evidence` hold:
nothing in the federation layer writes Evidence or admission state.
