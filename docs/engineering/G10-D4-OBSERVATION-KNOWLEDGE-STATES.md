# G10-D4 — Observation Knowledge States

The observation boundary distinguishes exactly three knowledge states, and
the snapshot rule built on them:

| State | Meaning | Snapshot effect |
| --- | --- | --- |
| `known` | the adapter asserted the fact | fact enters the snapshot content (canonicalized) |
| `unknown` | the adapter cannot assert the fact (cold adapter, unscannable locus, not yet probed) | **`observation_incomplete`** — the snapshot is refused; UNKNOWN is never rewritten to an empty known set (`{}`) or to `available:false` |
| `error` | the observation attempt itself failed | **`observation_incomplete`** — same refusal; the error detail is carried |

Per-fact application:

- **Ephemeral capabilities** (§78): unknown → refuse; never `{} as known-empty`.
- **Registered persistent points** (§79): every canonical point must be
  observed known before a snapshot is emitted; an unknown point refuses the
  whole snapshot — a registered point can never be silently omitted, because
  its omission would hide facts that could affect selection.
- **Availability** (§80): `available` = the adapter currently considers the
  locus admissible for realization — not "carrier active", not "session open".
- **UNAVAILABLE vs UNKNOWN** (§118): `available: false` (a known fact) and
  `unknown` (no fact) are different worlds; only the former can produce
  `pinned_target_unavailable`/`no_matching_persistent_point` semantics
  downstream, and only through the frozen kernel.

No invented capability fact exists anywhere in the live path; every fact in a
live snapshot answers: source (the port), knowledge policy (refuse on
unknown), canonicalization (C2 semantic sets + candidate order), staleness
trigger (any relevant drift changes the content digest → new SnapshotRef).
