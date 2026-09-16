# G10-AD — AC-R carry-forward disposition

Every AC-R carry-forward item is disposed below against what the AD stage actually
delivered. Nothing is closed by assertion: each disposition names the code, the
test or the explicit reason it stays open. The full trigger table is carried
forward to `G10-AD-CARRY-FORWARD.md`, which keeps the §39 trigger-driven list
intact.

```text
Rule applied here: an item is CLOSED only when a delivered artefact makes its
trigger impossible, not merely less likely.
```

## 1. Closed in AD

| ID | Disposition | Evidence |
| --- | --- | --- |
| **CF-AC-R-03** (Monitor card reads status and preview in two round trips) | **NOT ADDRESSED, still deferred** — recorded here so it is not mistaken for closed. The verification card has the same shape (status + history are two reads) and is labelled as a snapshot per read. | `web/src/project_workspace/ProjectWorkspaceView.tsx` (VerificationPanel) + `G10-AD-CARRY-FORWARD.md` §2. |
| **CF-W-05** (`GET /api/manage/preview` unconsumed by `web/**`) | **STILL_DEFERRED** — untouched. AD consumed its own three routes, not this one. | — |
| **CF-AB-03** (a caller inferring mutation from an empty canonical-ref list) | **REASSESSED, still deferred** — AD adds a fourth canonical-ref kind (`project_verification`) whose empty list has the same ambiguity as the others. The operating history now RESOLVES the new kind explicitly, so the ambiguity is bounded but not removed. | `src/project_management/service.ts` (the `project_verification` resolvability arm) and `G10-AD-CARRY-FORWARD.md` §2. |

No AC-R item became impossible as a result of this stage. That is the honest
result: AD closed a DIFFERENT gap (VERIFY had no runtime) and did not remove any of
the Monitor's residual triggers.

## 2. Items the AD stage touches, without closing

| ID | Why it is touched | Why it is NOT closed |
| --- | --- | --- |
| **CF-AC-R-01** (a live install's operating history referenced zero Campaign wake events) | CLOSED_IN_AC_R at merge time; AD reads the same operating history and adds one more resolvable ref kind to it. | Not an AD item; unchanged and still resolved. |
| **CF-AC-05 / CF-AC-R-07** (no push/webhook connector) | AD composes no activation of any kind. | Trigger unchanged: a host that can only be woken by an HTTP push, webhook or queue consumer. |
| **CF-AA-02** (same-process trust boundary) | AD runs a real verifier as a BOUNDED SUBPROCESS (`src/project_verification/experiment_adapter.ts`, via the existing `commandValidator`), which is a genuine process separation for the mechanical path. It does NOT provide an out-of-process ADMISSION service. | The trust-boundary item is about untrusted plugins and multi-tenant admission, which AD does not touch. |
| **CF-W-06 / CF-X-01** (concurrency items) | AD adds no task-state path, no promotion path and no concurrency. | Triggers unchanged. |
| **CF-AB-04** (management-preference portability) | The verification deployment config (registry/providers/default ref) is not portable either. | Trigger unchanged; the same portability question now also applies to the verifier registry. |
| **CF-AB-05** (a real operator-authority channel) | AD is explicit that an agent can never register a verifier or change an independence class; there is no operator-only verifier-registration CLI. | Trigger unchanged, and now shaped by the verifier registry: an operator who wants to add a verifier without editing the embedding host. Recorded as `CF-AD-03` in the new carry-forward list. |

## 3. The §39 list, disposed trigger-by-trigger

The stage brief §39 names the items that are EXPECTED to remain
trigger-driven. Each is disposed verbatim; none is closed by this stage.

| §39 item | Disposition in AD | Trigger (unchanged) |
| --- | --- | --- |
| Monitor CLI / push connectors / scale | STILL_DEFERRED_WITH_TRIGGER. AD ships no monitor work. | An operator who wants to force a tick from the shell; a host that can only be woken by push; a scoped set larger than `maxCampaignsPerTick`. |
| CF-AA-02 same-process trust boundary | STILL_DEFERRED_WITH_TRIGGER. The mechanical verifier is process-separated, but admission is not. | An untrusted-plugin or multi-tenant same-process topology. |
| CF-W-06 / CF-X-01 concurrency items | STILL_DEFERRED_WITH_TRIGGER. No task-state, revision or promotion path is added. | A revision/head sync expected to recompute retained-task states; a topology needing two concurrent promotions from one base. |
| External Asset Library | STILL_DEFERRED_WITH_TRIGGER. AD adds no asset scope: verification history is a derived PROJECT view, not a Truth asset and not an association (`§24`). | A real product need for reusable external knowledge; see the next-stage comparison in `G10-AD-CARRY-FORWARD.md`. |

## 4. New items surfaced by AD

Recorded in full in `G10-AD-CARRY-FORWARD.md`; listed here only so the disposition
is complete:

```text
CF-AD-01  subject kinds beyond CURRENT_PROJECT_HEAD
CF-AD-02  a real independent model-verifier adapter
CF-AD-03  an operator path to register a verifier without host code
CF-AD-04  a human verification workflow
CF-AD-05  an explicit admission bridge from Verification to Work Evidence / Proof
CF-AD-06  verification-profile portability
CF-AD-07  a chronological basis for verification runs vs Campaign chain positions
```

## 5. Honest limitations

1. This disposition is a claim about the AD stage only. It does not re-open or
   re-litigate the AC-R dispositions, which stand as recorded in
   `G10-AC-R-AC-CARRY-FORWARD-DISPOSITION.md`.
2. Every "STILL_DEFERRED_WITH_TRIGGER" above is deliberate: the AD stage was
   scoped to make VERIFY real, and widening it to close Monitor or concurrency
   items would have been exactly the scope creep the spec forbids.
3. External Asset Library is explicitly NOT preselected. The next-stage comparison
   is in `G10-AD-CARRY-FORWARD.md` and it does not choose.
