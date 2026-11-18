# Fleet rollout review — W1 and W2

The rollout is limited to the sites whose **deployed** build passes the Fleet compatibility check.
No service code, protocol field number, or REST route is changed by this plan. Deployment remains
with the owner.

## Inputs used

- `fleet/BRIEF.md` — selection rules, plan shape, and the instruction to leave deployment to the owner.
- `fleet/registry.json` — deployed builds, priorities, and the planned Dune upgrade.
- `fleet/replay.json` — observed decoder results by build and limit.
- `fleet/traffic.csv` — per-site traffic peaks.
- `fleet/egress.json` — gross window capacity and headroom factor.
- `fleet/change-orders.json` — signed order **OPS-17** (Dune) and shared reservation **NET-31** (W2).
- `updates/2026-11-10/fleet-default-limit.md` and `MIGRATION.md` — effective zero/omitted-limit behaviour.
- `proto/energy.proto` — released field numbers; its old `StreamReadings` comment is not used as behaviour.

## Eligibility: builds, decoder replay, and orders

The Fleet requirement is that a build decode three Readings for **both** an omitted limit and an
explicit zero limit. `fleet/replay.json` shows:

| Build | Omitted | Zero | Eligible |
| --- | ---: | ---: | --- |
| R1 | 3 | 2 | No — zero-limit request is short |
| R2 | 3 | 3 | Yes |
| R3 | 3 | 3 | Yes |

`fleet/registry.json` deploys Alder and Birch on R2, Cedar on R3, and Dune on R1. Dune therefore
stays on REST for both windows. The registry's planned Dune upgrade to R2 "after W1" does **not**
apply: signed order **OPS-17** moves that upgrade to "after W2" and expressly supersedes the registry
plan. Dune could be reconsidered only in a window after W2, once R2 is actually deployed and replayed.

## Capacity units

Per `fleet/BRIEF.md`, each selected site reserves
`ceil(max(peak1, peak2) × 1.25)` units, using the larger of both observed peaks:

| Site | Peaks (peak1, peak2) | Max × 1.25 | Reserved units |
| --- | --- | ---: | ---: |
| Alder | 4, 3 | 5.00 | 5 |
| Birch | 2, 3 | 3.75 | 4 |
| Cedar | 3, 2 | 3.75 | 4 |
| Dune | 2, 2 | 2.50 | 3 |

`fleet/egress.json` gives each window 10 gross units. **NET-31** reserves 2 shared backup-link units
in W2, so W1 has 10 available units and W2 has 8. The shared reservation is deducted from available
capacity, not counted as a selected site.

## W1 selection

Eligible sites are Alder (priority 11, 5 units), Birch (9, 4), and Cedar (8, 4). With 10 units
available, the feasible totals are:

| Set | Units | Priority |
| --- | ---: | ---: |
| Alder + Birch | 9 | 20 |
| Alder + Cedar | 9 | 19 |
| Birch + Cedar | 8 | 17 |
| Any single site | 4–5 | 8–11 |

Alder + Birch is the highest-priority feasible set. **W1 grpc: Alder, Birch** (used 9, available 10,
priority 20). Cedar and Dune remain REST. One unit is intentionally left unused because adding any
remaining eligible site would exceed 10 units.

## W2 selection

W2 is replanned independently with 8 units available after **NET-31**. Alder + Birch (9 units) and
Alder + Cedar (9 units) both exceed the window; Birch + Cedar fits exactly at 8 units with priority
17, ahead of every smaller set (the best single site is Alder at priority 11). Dune is still R1 and
ineligible under **OPS-17**.

**W2 grpc: Birch, Cedar** (used 8, available 8, priority 17). Alder and Dune remain REST.

## Assumptions discarded

- **The old proto comment is not current behaviour.** `proto/energy.proto` still says an omitted or
  zero limit returns an empty stream. The dated correction in
  `updates/2026-11-10/fleet-default-limit.md` and the released note in `MIGRATION.md` establish the
  effective default of the first three readings; the observed R2/R3 replay confirms it. The released
  protocol file is left byte-for-byte unchanged.
- **The registry's "Dune after W1" upgrade is superseded.** Applying it would wrongly make Dune an
  R2, high-priority candidate in W2. **OPS-17** is the signed, later order and sets the effective
  point after W2, so Dune is REST in both windows.
- **Headroom is not recomputed per window.** The brief says to use the maximum of both site peaks;
  using only a single window's peak would under-reserve the site.
- **Selection does not have to fill a window.** W1 leaves one unit unused because no eligible
  addition fits; forcing a full window would lower total priority.
- **The shared W2 reservation is not a site.** **NET-31** reduces available capacity to 8; it is not
  added to the selected-site unit total.

## Rollback to REST

REST remains deployed and unchanged, so rollback is a per-site traffic switch for the affected
window, with no data migration and no protocol change. If a selected site's build or decoder result
is not what was replayed, or if measured traffic exceeds its reservation, move that site from `grpc`
to `rest` and recompute `used` and `priority` for that window only. A W1 rollback does not force a W2
change, and vice versa. Dune is already REST in both windows; after W2 it stays REST until an R2
deployment and a passing replay are recorded.

## Verification

- `node --test` passes all 18 accepted service tests (REST baseline, wire framing, gRPC server,
  client integration, and the zero/omitted default).
- The committed `rollout/plan.json` was checked against the source records by independently
  recomputing effective builds, site units, capacities, and exhaustively enumerating every eligible
  subset for both windows. The selected sets are optimal, the `grpc`/`rest` arrays partition all four
  sites, and `used`/`available`/`priority` match the arithmetic above.

## Release scope

Commit contains only `rollout/plan.json` and `rollout/REVIEW.md`. The current service and tests are
the accepted release; this work plans Fleet traffic only and leaves deployment to the owner.
