# G10-AC-R — Carry-forward

No `BLOCKER_IN_AC_R`. The closure delivered truthful monitor lifecycle, an honest
availability derivation, a rendered read-only Monitor card and a
Campaign-referencing operating history. The items below are surfaced by AC-R or
carried from AC/AB/AA/W/X/Y/Z; none blocks a delivered claim.

Disposition reasoning for the AC items: `G10-AC-R-AC-CARRY-FORWARD-DISPOSITION.md`.
The recommended next stage is §3, and it is a recommendation only.

## 1. New items surfaced by AC-R

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| **CF-AC-R-01** | operability/product | **NEW.** The install does not wire the Campaign wake-event seam into the bounded management service. The derived read, the first-party project-linked source, the count and the rendering all exist and are proven (`ACR-N17`/`N18`), but a LIVE install's operating history references ZERO Campaign events and reports an explicit empty state. Closing it is one option in `installPalimpsest`. | A product need for a live install's operating history to reference its own Campaign wake events without the host composing the management service itself, or an operator asking why the wake-reference list is always empty. |
| **CF-AC-R-02** | correctness/UX | **NEW.** The Campaign plane records no wall clock, so a derived `campaign_wake` entry cannot carry an instant: its ordering key is the canonical chain position (`campaign-seq:<n>`), which sorts after every dated entry in the shared chronological sort. Honest, documented and labelled in the UI, but a true chronological merge of Campaign wakes with the Work Mode / management planes is not possible today. | A consumer (UI or export) that must interleave Campaign wake events with dated entries by time, or a decision to add a canonical Campaign event timestamp. |
| **CF-AC-R-03** | operability/product | **NEW.** The Monitor card reads `status()` and `preview()` in two round trips, so a tick between them can make the preview describe a slightly later state than the status. The card labels it "what a tick WOULD do". | A consumer needing one consistent snapshot of runtime state and preview, e.g. an operator console or an automated report. |
| **CF-AC-R-04** | coverage | **NEW.** `web/tsconfig.json` is not part of `pnpm build`, and it does not typecheck clean: `web/src/MultiGraphView.tsx:68` (missing `JSX` namespace) and `web/src/project_workspace/ProjectWorkspaceView.tsx:903` (`<Muted testId=…>` on a primitive with no `testId` prop). Both predate this stage; `pnpm run build:web` transpiles and the browser suite is green. | A decision to put `web/**` into a typecheck gate, or a web type regression that reaches the served bundle. |
| **CF-AC-R-05** | scale | **NEW.** The history read adds a SECOND O(all Campaigns) pass: `linkedCampaignWakeEventSource` reads every Campaign definition and replays each one to filter, exactly as the monitor scope does. Two passes per history read, not one. | The same trigger as `CF-AC-04`: a shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| **CF-AC-R-06** | product | **NEW (re-surfaced).** The CLI still has no monitor command and the workspace card is deliberately read-only, so there is NO user-facing way to observe or drive a tick outside the embedding host. The closure added observation (read routes, the Monitor tab) but no operator action. | An operator who needs to see or force a tick without writing host code (`CF-AC-01`'s trigger, now with a UI counterpart). |
| **CF-AC-R-07** | product | **NEW (re-surfaced).** No webhook/push connector exists; the Monitor card can therefore only ever say "configured" or "pull-only", never name a host protocol. | A host that can only be woken by an HTTP push, webhook or queue consumer (`CF-AC-05`'s trigger). |
| **CF-AC-R-08** | scale | **NEW (re-surfaced).** Progression remains bounded by the per-tick budgets (10 Campaigns / 5 wake advances / 5 activations, one phase transition per pass, at most four passes). The closure did not raise a budget or change the loop. | A scoped set larger than `maxCampaignsPerTick`, or a latency requirement that one tick finish a progression beyond the budget (`CF-AC-02`'s trigger). |

`CF-AC-03` (default delivery marks) and `CF-AC-06` (workspace + history) are
**CLOSED_IN_AC_R** and are not repeated here. `AC-R-01`…`AC-R-04` are **CLOSED**.

## 2. Full carried table (triggers unchanged)

| ID | Disposition | Trigger (unchanged) |
| --- | --- | --- |
| CF-AC-01 | STILL_DEFERRED_WITH_TRIGGER | An operator who wants to force a monitor tick from the shell, or a request for a CLI-level monitor regression test. |
| CF-AC-02 | STILL_DEFERRED_WITH_TRIGGER | A project whose scoped Campaign count exceeds `maxCampaignsPerTick`, or a latency requirement that one tick must finish a progression beyond the budget. |
| CF-AC-03 | **CLOSED_IN_AC_R** | — |
| CF-AC-04 | STILL_DEFERRED_WITH_TRIGGER | A shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| CF-AC-05 | STILL_DEFERRED_WITH_TRIGGER | A host that can only be woken by an HTTP push, webhook or queue consumer. |
| CF-AC-06 | **CLOSED_IN_AC_R** | — (residual install wiring recorded as `CF-AC-R-01`) |
| CF-AC-R-01 … CF-AC-R-08 | STILL_DEFERRED_WITH_TRIGGER | See §1. |
| CF-AB-01 | STILL_DEFERRED_WITH_TRIGGER | A project whose activity volume makes a full read expensive, or an operator asking for a retention window. |
| CF-AB-02 | STILL_DEFERRED_WITH_TRIGGER | A multi-tenant/tamper-hostile deployment where the activity log must be tamper-evident against the operator's own environment. |
| CF-AB-03 | STILL_DEFERRED_WITH_TRIGGER | A consumer that infers mutation from an empty canonical-ref list, or a verify port that starts exposing canonical refs. |
| CF-AB-04 | STILL_DEFERRED_WITH_TRIGGER | Management-preference portability, or multi-machine operation of one project. |
| CF-AB-05 | STILL_DEFERRED_WITH_TRIGGER | A hosted or UI-only operator topology needing a real operator-authority channel. |
| CF-AA-01 | STILL_DEFERRED_WITH_TRIGGER | An actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | STILL_DEFERRED_WITH_TRIGGER | An untrusted-plugin or multi-tenant same-process topology. |
| CF-AA-03 | CLOSED_IN_AA, held | — |
| CF-AA-04 | STILL_DEFERRED_WITH_TRIGGER | A requirement to make terminal provenance tamper-evident. |
| CF-AA-05 | STILL_DEFERRED_WITH_TRIGGER | Importing a foreign log, or a writer that appends a terminal without an intent. |
| CF-W-01 | CLOSED_IN_W, held | — |
| CF-W-02 | CLOSED_IN_X, held | — |
| CF-W-03 | CLOSED_IN_Y, held | — |
| CF-W-04 | STILL_DEFERRED_WITH_TRIGGER | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | STILL_DEFERRED_WITH_TRIGGER | A UI change that wants `GET /api/manage/preview` consumed by `web/**`. |
| CF-W-06 | REASSESSED_IN_AC, STILL_DEFERRED_WITH_TRIGGER | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | STILL_DEFERRED_WITH_TRIGGER | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | STILL_DEFERRED_WITH_TRIGGER | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | PARTIALLY_ADDRESSED_IN_AB, UNCHANGED_BY_AC_R | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | STILL_DEFERRED_WITH_TRIGGER | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | STILL_DEFERRED_WITH_TRIGGER | A CLI-behaviour change, or a request for CLI-level regression coverage. |
| CF-Y-01 | CLOSED_IN_Z, held | — |
| CF-Y-02 | CLOSED_IN_Z (superseded), held | — |
| CF-Z-01 | STILL_DEFERRED_WITH_TRIGGER | A project with a large pending-promotion backlog, or a concurrency policy allowing many simultaneous unresolved intents. |
| CF-Z-02 | CLOSED_IN_AA, held | — |
| CF-Z-03 | STILL_DEFERRED_WITH_TRIGGER | A future path that records reports without the aggregate's input-identity check. |
| CF-Z-04 | STILL_DEFERRED_WITH_TRIGGER | A host that calls `reconcileAll()` without a subsequent turn. |

## 3. Recommended next stage (assessment only)

Ranked by real product need, not by novelty. The just-closed monitor is now true
and visible, so the first rank finishes the monitor as a product instead of
opening a new plane.

1. **`CF-AC-R-01` + `CF-AC-R-06` / `CF-AC-01`** — make the monitor operable end to
   end: wire the wake-event seam so a live install's history is not permanently
   empty, and give an operator a real observation/force path (CLI or explicitly
   operator-only UI). Both are small, both are on the critical path of the feature
   that just shipped, and neither widens authority.
2. **`CF-AA-02`** — the trust boundary. It remains the only item that bounds the
   strength of the admission guarantee, and it becomes real the moment plugins or
   multi-tenancy are in scope.
3. **`CF-AC-R-02` + `CF-W-06` + `CF-X-01`** — the two correctness-shaped items:
   a defensible time basis for Campaign events (or an honest "chain position is
   the only ordering" doctrine made explicit everywhere), and the retained-task
   dependency-state pair that only matters once real concurrency exists.
4. **`CF-AB-05` / `CF-AB-04`** — operator authority and posture portability, the
   two product gaps AB knowingly left.
5. **`CF-AC-02` / `CF-AC-04` / `CF-AC-R-05` / `CF-AC-R-08`** — monitor scale:
   budgets, the two O(all Campaigns) passes, and a per-project Campaign index,
   once a real deployment has the Campaign volume that needs them.
6. Everything else is coverage and product surface, in that order.

### The three candidate stages, compared

The task the next stage answers is chosen from real need. The three candidates
that keep being named are assessed here on delivered evidence alone.

| | Independent Verify Runtime | External Asset Library Bridge | Monitor source connectors |
| --- | --- | --- | --- |
| What it would close | `VERIFY` is `UNAVAILABLE` without a genuinely independent verifier; same-model same-context does not count (`posture.ts`), `CF-AA-02` bounds the trust story. | Both are unknown today; `src/project_workspace` already models an association to an EXISTING canonical asset, so a bridge would add a source rather than a truth. | `CF-AC-05` / `CF-AC-R-07`: a host that can only be woken by push. |
| Evidence it is the real need | None yet. Nothing in AC-R produced a host that demanded independent verification; the gap is a capability gap, not a reported one. | None yet. No product text asks for external reusable knowledge, and the carry-forward list has said so since AC. | None yet. No deployment has asked for a protocol; the shipped DSH/Pi adapters cover the two hosts that exist. |
| Cost / risk | High: a real independent verifier is a semantic plane, not a port, and a fake one would be worse than none. | High: it invites a second asset truth if it is built as a store rather than a source. | Low-moderate: one more `CampaignWakeActivationPort` adapter plus its failure semantics. |
| Anti-waste verdict | Only defensible if a genuine verifier exists; otherwise it is a re-labelling of the same model. | Only defensible as a read-only connector into an existing owner. | The smallest and most reversible of the three. |
| Does it need a new authority? | No, but it needs a new semantic plane. | No, if it stays a source. | No. |

**The comparison does not select a stage.** Each of the three would be built from
an unproduced demand: no host has asked for independent verification, no product
need has asked for external asset reuse, and no deployment has asked for a push
connector. The final choice must come from a real product need — a reported
operator or host requirement — and not from this list's internal ranking. Until
such a need is produced, the first rank above (finishing the monitor as a product)
is the only work justified by evidence already in hand.

Explicitly **not** privileged by any ordering: a universal `HistoryStore`, a
second Campaign/monitor truth, a semantic scheduler, or an External/Personal asset
scope.

## Post-closure correction (recorded at merge time)

**CF-AC-R-01 is CLOSED, not carried.** After the product-closure work landed, the
remaining gap it recorded — that `installPalimpsest` did not pass the
`campaignWakeEvents` seam, so a LIVE install's operating history referenced **zero**
canonical Campaign events while the derived read, source, rendering and resolution
rule were already complete — was closed properly: the install now wires

```text
campaignWakeEvents: () => linkedCampaignWakeEventSource({ store }).projectCampaignWakeEvents(projectId)
```

whenever a Campaign store is supplied, using the SAME project-linked derivation as
`linkedCampaignMonitorScope` (never a global scan, never a copied Campaign payload,
never an invented event). Without a Campaign store the seam stays absent and the
history honestly reports zero Campaign references.

Verified after the change: `pnpm build` clean; `pnpm exec vitest run` 158 files /
1554 tests; `pnpm run build:web` ok; `pnpm exec playwright test` 28 passed;
`node scripts/monitor/acr0-repro.mjs` `anyDefect=false` (item E now reports
`operatingHistoryReferencesCampaignEvents: true`); `node scripts/monitor/cold-resume.mjs`
`pass=true` with `workEventsCreated: 0`.
