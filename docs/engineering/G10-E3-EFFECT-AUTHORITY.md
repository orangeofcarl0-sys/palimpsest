# G10-E3 — Effect Authority Record

External mutations added by E3 (campaign §146 preview):

| Mutation | Ordarium action | Profile | Authorization intent | Idempotency | Direct path |
| --- | --- | --- | --- | --- | --- |
| peer message send | `palimpsest.federation.message.send` | `effects.idempotent()` (durable) | `effects.invoke` with `{scope:"federation", callId: messageId, revision: 0}` | stable `messageId` in the action input — identical retry dedupes at the ledger AND the port contract requires honoring the key | none (audited) |
| peer wake | `palimpsest.federation.wake` | `effects.idempotent()` (durable) | same intent family (`callId: wakeId`) | stable `wakeId` | none (audited) |

Notes:

- **No transport-side acknowledgement mutation exists** — acknowledgement is a
  local, explicit event (`ACK_RECORDED`), never a transport effect.
- The authorization revision for federation effects is `0` by design and
  **not** a fabrication: federation events are not Work-plan-scoped; the
  `scope` is the federation coordination scope and the `callId` is the stable
  message/wake id. (This is distinct from the D-AUTH-01 defect, which was a
  Work-realization release claiming a plan revision it did not have.)
- No Palimpsest fake receipts; the Ordarium ledger owns operation truth.
- Messages/reports remain collaboration content, never Evidence (§122).
