# Campaign wake host binding

The signal a monitor tick produces, and the host adapters that deliver it. This
document describes `src/monitor/activation.ts` and its use by the driver
(`src/monitor/driver.ts:390-450`).

```text
Wake ≠ Action       Wake ≠ Authority    Wake ≠ Work
Wake ≠ Commitment   Wake ≠ EvidenceAdmission
HostActivation ≠ SemanticAdmission
Notification ≠ Activation ≠ WorkMutation
Message ≠ Authority
```

## 1. The signal

```ts
interface CampaignWakeActivationSignal {
  schemaVersion: 1;
  signalId: string;                // deterministic over semantic identity
  projectId: string;
  campaignId: string;
  wakeCycleId: string;
  cause: string;                   // encoded canonical cause: "watch:<id>" | "manual:<id>"
  phase: "RECONCILIATION_READY" | "RECONCILIATION_BLOCKED";
  reconciliationDigest: string | null;
  blockerCode: string | null;      // e.g. "reconciliation_incomplete"
  detail: string;                  // one sentence, no hidden context
  createdAt: string;               // diagnostic only
}
```

(`src/monitor/activation.ts:28-44`.)

`cause` is the encoded canonical cause built by `encodeWakeCause`
(`src/campaign/production.ts:78-89`): `watch:<watchId>` for a watch wake and
`manual:<signalId>` for a manual one. The driver reads it back out of the
`WAKE_STARTED` payload through `deriveMonitorContinuation`
(`src/monitor/lifecycle_derivation.ts:59-64`, `driver.ts:363-368`).

## 2. Why `signalId` is derived from semantic identity

`signalId` is a digest over exactly `{ projectId, campaignId, wakeCycleId, cause,
phase }` under the domain `palimpsest.campaign-wake-activation.v1`
(`src/monitor/activation.ts:47-62`), truncated into
`campaign-wake-<32 hex>` (`:84`). It contains **no timestamp and no attempt
counter**. That is what makes a restart idempotent: a second process that
reconstructs the same wake cycle derives the **same** `signalId`, so duplicate
delivery cannot mint a second semantic wake. `AC-N18` proves two independent
drivers derive an identical id; `AC-N21` proves redelivery reuses it.

`createdAt` and `detail` are carried on the signal but are deliberately **not**
part of the identity.

## 3. The default wake text

`formatCampaignWakeSignal` (`src/monitor/activation.ts:97-117`) produces, with
`<...>` standing for the live values and the optional blocker line omitted when
there is none:

```text
Palimpsest campaign wake — RECONCILIATION_READY

project: <projectId>
campaign: <campaignId>
wake cycle: <wakeCycleId>
watch cause: watch:<watchId>
reconciliation: <reconciliationDigest | not committed>
blocker: <blockerCode>
signal: <signalId>

<detail>

This wake asks the project principal to reconsider the Campaign.
It grants no authority.
Re-read current Project Operating Posture.
Use existing Campaign next-action admission and Project Management services.
```

The text carries exact refs and nothing else: no context dump, no reasoning, no
authority. The golden test asserts the first line matches
`/Palimpsest campaign wake/` and that the body contains the exact campaign and
wake cycle.

## 4. DSH adapter

`dshCampaignWakeAdapter` (`src/monitor/activation.ts:197-228`) is given the
host's `agents` object and the **persistent project principal's**
`resumeSessionId`.

1. If the principal is resident — `agents.get(resumeSessionId)` returns an agent
   — it receives `followup(text)` and the outcome is `activated: true`
   (`:207-210`).
2. Otherwise, if `agents.resume` exists, the persisted session is **cold-resumed**
   with `resume({ resumeSessionId })` and then queued exactly one turn via
   `followup(text)` (`:217-219`). The dogfood script
   (`scripts/monitor/cold-resume.mjs:133-149`) exercises this branch by returning
   `undefined` from `get`.
3. If neither works, or the host throws, the outcome is `activated: false` with a
   human-readable detail (`:211-216`, `:220-225`). **The canonical wake is
   untouched**: no Campaign event is written by a delivery attempt, so the driver
   can retry after its cooldown.

The adapter mints **no `PeerRef` and no `PersistentPoint`** and imports no
Campaign store, authority port or admission port (`:124-131`). A wake is not an
identity.

## 5. Pi adapter

`piCampaignWakeAdapter` (`src/monitor/activation.ts:248-269`) uses the existing Pi
host idiom: `pi.sendMessage(text, { deliverAs: "followUp", triggerTurn: true })`.
No semantic module imports Pi; the host object is injected. A throw becomes
`activated: false` exactly as in DSH.

## 6. Delivery marks, cooldown and redelivery

The marks store (`src/monitor/delivery_marks.ts`) is deployment-local SQLite with
one table, `monitor_delivery_marks`, keyed by `signalId`
(`:51-59`). `shouldDeliver` decides (`:129-148`):

| Situation | Decision |
| --- | --- |
| never delivered | deliver (`reason: "never delivered"`) |
| delivered, inside `redeliveryAfterMs` | skip (backoff) |
| delivered, cooldown elapsed, wake cycle still incomplete | deliver (the at-least-once retry) |
| unusable previous timestamp | deliver |

A mark is never evidence of semantic success: `recordAttempt` counts an attempt
(`:102-113`) and `recordSuccess` records that the **host accepted** the wake,
which is explicitly not wake completion (`:115-119`). The driver stops delivering
altogether once the wake cycle is complete — a semantic fact the mark store does
not need to know (`:14-16`).

## 7. Why duplicate suppression is not semantic correctness

The mark store is an optimisation. Correctness comes from three semantic
properties that hold even with no marks at all:

1. the signal identity is the wake cycle, so a duplicate is the same signal;
2. the Campaign admission/completion path is idempotent, so re-notifying cannot
   double-admit; and
3. the driver is structurally unable to create Work or authority, so a duplicate
   delivery cannot cause a duplicate mutation (`AC-N07`, `AC-N21`).

With `deps.marks` absent, `shouldDeliver` always says deliver for an incomplete
wake, and the only consequence is repeated notification. That is recorded as an
honest limitation (`CF-AC-03`), not a correctness gap.

## 8. Why there is no distributed transaction

The Campaign store and the host queue are different systems with different
transaction boundaries. A crash after a successful host enqueue but before the
local mark can duplicate delivery; a crash after the mark but before the host
accepted can lose one (and the next tick redelivers after cooldown). The design
therefore *chooses* at-least-once and makes every consumer tolerate it, rather
than pretending a two-phase commit exists between an operator's SQLite file and
an agent host. This is stated in the module header
(`src/monitor/delivery_marks.ts:6-16`).

## 9. Management mode does not change

Waking a Campaign never widens what the resumed principal may do. The management
involvement axis — `DIRECT | ASSIST | MANAGE | DELEGATE` — is read by the
principal's own services exactly as before; the wake port has no access to it.
The default posture in an install is `DIRECT`, and `AC-N24` proves a `DIRECT`
wake causes no management mutation: no activity record, no Work event, no
ProjectIR revision. `ManagementMode ≠ WakeAuthority`.
