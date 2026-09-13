# G10-F0 — Coordination Event Parser Audit (§25)

Every event type currently persisted in the coordination store, its parser
owner, and the validation it performs. No event type is left on a weak
"one-or-two-fields-exist" check (§22) and no parser performs an unchecked
structural cast (§24).

Registry: `DEFAULT_COORDINATION_EVENT_PARSERS` =
`PARTICIPATION_EVENT_PARSERS` ∪ `FEDERATION_EVENT_PARSERS` ∪
`COMMITMENT_EVENT_PARSERS` (`src/coordination/store.ts`).

Legend: **exact** = unknown-field rejection at every nesting level; **ids** =
stable-identifier validation; **nested** = nested artifact parser.

| Event type           | Parser owner        | Artifact parser(s)                                                               | exact | ids | nested | enum/literal |
| -------------------- | ------------------- | -------------------------------------------------------------------------------- | :---: | :-: | :----: | :----------: |
| `INVOCATION_RECORDED`| `participation.ts`  | `parseInvocation` → `parseActivationRef`, `parseAttemptRef`                      |  ✔    | ✔   |   ✔    | `purpose="participate"` |
| `PARTICIPATION_STARTED` | `participation.ts` | `parseParticipation` → `parseActivationRef`, `parseAttemptRef`, `parseInvocationRef` | ✔ | ✔ | ✔ | — |
| `PARTICIPATION_ENDED`| `participation.ts`  | `parseParticipationEndReason`                                                    |  ✔    | ✔   |   —    | endReason ∈ {completed, withdrawn, cancelled, runtime_lost} |
| `CONTACT_REQUESTED`  | `messages.ts`       | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |
| `MESSAGE_PREPARED`   | `messages.ts`       | `parsePeerMessage` → `parseThreadRef`, `parsePeerRef`                            |  ✔    | ✔   |   ✔    | `kind="message"`, `schemaVersion=1` |
| `MESSAGE_DELIVERED`  | `messages.ts`       | —                                                                                |  ✔    | ✔   |   —    | optional `transportMessageId` |
| `MESSAGE_RECEIVED`   | `messages.ts`       | `parsePeerMessage`                                                               |  ✔    | ✔   |   ✔    | `authenticated: boolean` |
| `WAKE_SENT`          | `messages.ts`       | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |
| `ACK_RECORDED`       | `messages.ts`       | `parseThreadRef`, `parsePeerRef`                                                 |  ✔    | ✔   |   ✔    | — |
| `COMMITMENT_OFFERED` | `commitment.ts`     | `parseCommitmentOffer` → `parseCommitmentScope`, `parsePeerRef`                  |  ✔    | ✔   |   ✔    | scope kind ∈ {attempt_participation, contact_need} |
| `COMMITMENT_ACCEPTED`| `commitment.ts`     | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | `authenticated: boolean` |
| `COMMITMENT_REJECTED`| `commitment.ts`     | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |
| `COMMITMENT_RELEASED`| `commitment.ts`     | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |
| `COMMITMENT_SUPERSEDED` | `commitment.ts`  | —                                                                                |  ✔    | ✔   |   —    | — |
| `HANDOFF_OFFERED`    | `commitment.ts`     | `parseHandoffOffer` → `parseCommitmentScope`, `parsePeerRef`                     |  ✔    | ✔   |   ✔    | scope kind as above |
| `HANDOFF_ACCEPTED`   | `commitment.ts`     | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |
| `HANDOFF_REJECTED`   | `commitment.ts`     | `parsePeerRef`                                                                   |  ✔    | ✔   |   ✔    | — |

## Replay tests

| Concern                    | Replay proof                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| registry completeness      | `F0-M02` — all 17 types have a registered parser                   |
| strict nested rejection    | `F0-M01` — unknown nested field rejected on append and on read     |
| malformed stored row       | `F0-M01` — non-JSON payload fails closed on replay                 |
| participation history      | `test/participation.test.ts` E1-M11 (reopen/replay)                |
| collaboration history      | `test/collaboration_events.test.ts` E3-M14                          |
| commitment/handoff history | `test/federation_campaign_review.test.ts` E6-X03                    |
| canonical serialization    | `F0-M11` — key order does not change identity                       |

## Notes

- `PeerRef` is validated by `parsePeerRef` (`peer.ts`), which already rejected
  unknown fields; it is now the single nested peer validator used by both
  `messages.ts` and `commitment.ts`.
- `ActivationRef` / `AttemptRef` nested refs are validated field-by-field;
  `runDefinition` is `{digest}` and `bindingResolution` is
  `{resolutionId, digest}` — no extra fields admitted.
- `requireStringSet` canonicalizes semantic string sets (lexical order) and
  rejects duplicates, matching the existing `competenceTags` discipline.
