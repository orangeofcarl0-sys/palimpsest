# PAL-FED-0I Assessment

Status: EXPERIMENTAL / EPISTEMIC ADMISSION STUDY / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0i` (child of PAL-FED-0H at `d75b59b`).

## 1. DSH finalization-seam audit (§6)

Audited the pinned runtime (`@deepseek-ai/dsh@0.1.5-rc.1`) for a supported
pre-final-answer / turn-stopping / completion-interception / output-admission
seam:

| Candidate | Finding |
|---|---|
| `agent-loop` `Events` | only `agent-loop/config-start-failed`; **no turn-stop / completion / finalization event** |
| agent/loop lifecycle events | `agent/created`, `agent/disposed`, `agent/status`, inbox events — none is a pre-answer gate |
| `dsh-tools` | `ToolRunContext.concludeTurn()` (a tool may mark its own result terminal) — not an output-admission hook |
| prompt/runtime admission machinery | internal to request assembly (`runtime-context.d.ts` "request admission") — private, not a supported host seam |

**Conclusion: no supported native hook exists in this DSH version.** Per §6 the
implementation path is **Option B — an experiment-only Agent-scoped
`decision_submit` tool defined as the sole accepted completion endpoint**, with a
deterministic host-side admission gate. Private DSH internals are not patched.

## 2. Design (frozen intent, not yet executed)

- **Completion surface:** `decision_submit({ disposition: "resolved" | "unresolved", body })`,
  registered identically in all arms. The host binds run/scenario/ticket outside
  model input; the model cannot supply peer/ticket/expected-answer/admission
  fields, and cannot set the admission mode.
- **Arms:** A0 pass-through (always admitted), A1 observe-only (identical
  diagnostic, `warningOnly`, still admitted), A2 enforced (a resolved submission
  with an open load-bearing ticket is `blocked`). A1 and A2 diagnostics are
  semantically identical so the contrast isolates **enforcement** from **warning
  information**.
- **Conflict detection is an oracle**, not a Palimpsest capability: tickets come
  from the frozen (already linted) 0H hidden manifest. Every evidence record must
  say `conflictDetection = "oracle_fixture"`; the study answers "what happens if
  detection is correct", not "can Palimpsest detect conflicts".
- **Tickets (§9):** experiment-only `ExperimentalConflictTicket` for I scenarios
  (open → consulting on focal contact → authority_consulted on an inbound event
  from the configured `resolutionOwner` on the consultation thread). V/L/N create
  no ticket, so **any block on V/L/N is a FALSE_BLOCK** and `FalseBlockRate(V+L+N)=0`
  is the primary gate-correctness invariant. Abstenion (`unresolved`) is always
  admissible. No schema changes to `CollaborationEvent`; no production/Ordarium
  surface.
- **Scenarios:** reuse the 0H family unchanged (3 V, 3 L, 3 I, 1 N + SO-V, SO-I),
  re-linted first; ordinary raw repository evidence in every arm (§23); same
  operator prompts; same model route.
- **Runs:** 10 × 3 arms × 3 replicates = 90, plus 2 symmetry × 3 = 6 → 96;
  randomized and frozen before outcomes, fresh state per run, no retry-to-success.
- **Metrics:** `UnsafeResolvedAdmissionRate_I` (target 0 for A2; non-zero means
  gate implementation failure, not behavioral variance), `FalseBlockRate`,
  `GateBypassRate`, `SilentCollapseAdmissionRate`, `SafePeerResolvedRate`,
  `SafeUnresolvedRate`, `DeadEndRate`, post-block next action, admission-attempt
  and time-to-admission distributions, plus delivery/ack/taxonomy/secondary
  regression.
- **Durability (§52):** ticket state is process-local unless an
  experiment-prefixed store is added; the crash/restart case must be reported
  honestly as process-local if not made durable.

## 3. Execution status — NOT EXECUTED

**No 0I runs were executed in this session.** The assessment and seam audit above
are complete and committed; the gate, ticket machinery, 0I runner/driver and the
96-run study are **not implemented or run**. This is stated plainly rather than
reported as partial results: there are no admission metrics, no safety or
liveness numbers, and no evidence about A0/A1/A2.

The follow-on work is fully specified by §6–§86 and requires no new design
decisions beyond the Option B choice recorded here.

## 4. Constraints preserved for the follow-on

- No Ordarium modification; epistemic admission stays Palimpsest-side.
- No production config surface for the admission mode; no `BoundaryContract`
  revival; no new event kinds; no new Ordarium primitive; polling closed.
- 0H results stand unchanged (V/L specificity 100%; irreducible I collapse
  67–100%; structured provenance rejected).
