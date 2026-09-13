# G10-E3 — Collaboration Event Substrate

Status: **G10-E3 · DURABLE COLLABORATION EVENTS · DERIVED THREAD/INBOX · WAKE ≠ ACK ≠ AGREEMENT · NOT A FROZEN CONTRACT**

## 1. Semantics (§59–§63)

A `CollaborationEvent` is a durable semantic record of collaboration-boundary
activity. It is NOT Evidence, truth verification, commitment, or agreement.
A `PeerMessage` is `{messageId, thread, from, to, kind:"message", body}` —
strict, deep-frozen — and **`body ≠ Evidence`, always**, even from a trusted
sender. A `ThreadRef` is only a grouping identity: a Thread is a DERIVED view
over events (§60), never an independently mutable conversation object and
never a second canonical store.

## 2. Event types (§78)

`CONTACT_REQUESTED`, `MESSAGE_PREPARED`, `MESSAGE_DELIVERED`,
`MESSAGE_RECEIVED`, `WAKE_SENT`, `ACK_RECORDED` — each with a STRICT typed
payload parser registered with the coordination store (`FEDERATION_EVENT_PARSERS`);
the store never accepts a generic `Record<string, unknown>` bag (§33).

## 3. Firewalls, machine-proven

| Firewall | Proof |
| --- | --- |
| Wake ≠ Ack (§73/§129) | `wakePeer` produces exactly `WAKE_SENT`; no ack/commitment event |
| Delivery ≠ Ack (§74) | `sendMessage` produces `MESSAGE_PREPARED` + `MESSAGE_DELIVERED`; zero acks |
| Ack ≠ Agreement (§76) | `acknowledge` produces `ACK_RECORDED` only; no agreement/commitment transitions |
| Conversation ≠ Agreement (§77/§130) | 5 messages + 5 acks → zero commitment/agreement events |
| CollaborationEvent ≠ Evidence (§82) | no evidence-linking/admission API exists in the federation package (static audit) |
| Thread/Inbox derived only (§80/§81/§59) | views computed from `store.replay()`; no thread/inbox tables exist |

## 4. Machine proofs (§83)

`test/collaboration_events.test.ts` (9 tests): E3-M01..M14 as enumerated.
Full unit at E3 close: **80 files / 689 tests**.
