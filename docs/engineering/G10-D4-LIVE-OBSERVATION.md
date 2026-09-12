# G10-D4 — Live Runtime Observation

Status: **G10-D4 · LIVE RUNTIME/CONTINUITY OBSERVATION · READ-ONLY · EXPLICIT KNOWLEDGE STATES · CLOSED LOOP · NOT A FROZEN CONTRACT**

## 1. Observation ≠ realization (§74)

`src/runtime/observation.ts` is the read-only half of the runtime seam. It
never realizes, mutates, attaches, creates, or releases anything (machine-
audited: the observation path touches the store's read APIs only and
constructs no carrier service). Mutations stay behind the Ordarium-admitted
carrier port.

## 2. The observation port and knowledge states (§75/§76)

```ts
type ObservationKnowledge<T> =
  | { state: "known"; value: T }
  | { state: "unknown"; detail: string }
  | { state: "error"; detail: string };

interface RuntimeObservationPort {
  observeEphemeralCapabilities(): Promise<ObservationKnowledge<CapabilityProfile>>;
  observePersistentPoint(point: PersistentPoint): Promise<ObservationKnowledge<PersistentPointObservation>>;
}
```

UNKNOWN is never collapsed into an empty capability set or into
"unavailable" (§76/§118) — the C2 rule enforced at the live boundary. A
separate port object is used because ownership may differ from the carrier
port (§75); embedders may back both with one adapter.

## 3. Snapshot materialization rule (§77/§79)

`observeBindingState(deps)` enumerates points from the **canonical store**
(D4-M01), observes ephemeral capabilities and every registered point, and
emits a `BindingObservationSnapshot` ONLY when every required fact is known.
Any unknown ephemeral fact, or ANY registered point with unknown
availability/capabilities, refuses the whole snapshot
(`observation_incomplete`) — a registered point is never silently omitted or
guessed (§79/§118; machine-proven). Snapshot identity comes from the
injected allocator (§81 — no clock in canonicalization; the C2 materializer
stays pure).

**Availability semantics (§80):** `available` = "the runtime adapter
currently considers this continuity locus admissible for realization" — not
necessarily "a carrier is active" or "a session is open".

## 4. The closed loop (§83/§84/§86)

`observeAndCompileGroundedPlan(deps, request)` keeps observe and compile as
distinct steps — the pure grounded compiler never observes. The realization
service re-checks grounded freshness against the current state immediately
before the effect (D4-M10). The §85 TOCTOU window is mitigated by the stable
realization key, the freshness re-check, and host-side availability checks,
and is honestly documented as **non-atomic** across Palimpsest DB / host
runtime / Ordarium.

Machine-proven loop (§86/§87): O1→S1→R1; a runtime change (point becomes
inadmissible, or carrier loss flips availability) → O2→S2 with a different
content digest and SnapshotRef; R1 stale against the current state while
staying byte-immutable; re-resolve against S2 yields the truthful planning
condition. A realization/release changes later observation (§87).

## 5. Machine proofs (§88)

`test/live_observation.test.ts` (7 tests): D4-M01..M12 — store-derived point
list, port-derived ephemeral facts, UNKNOWN refusals (ephemeral + registered
point), read-only audit (store unchanged), ref/digest drift on relevant
change, staleness + re-resolution, freshness re-check before realize, and
no-creation audits (no points, no carriers). Full unit at D4 close:
**75 files / 652 tests**.
