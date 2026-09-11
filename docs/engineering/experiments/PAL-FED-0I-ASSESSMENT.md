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

## 2A. Design amendment A/B/C (2026-09-11, supersedes parts of §2)

Recorded before implementing the runtime; the audit history in §1–§2 is not
erased. Three points of the frozen intent are corrected:

### Amendment A — A1 is a **one-shot soft gate**, not "warn but immediately admit"

The original A1 ("identical diagnostic, `warningOnly`, still admitted") gave the
agent no room to react: `decision_submit` is also the completion endpoint, so an
immediately-admitted warning could not change behaviour. A1 now is:

- first **resolved** submission while the authority boundary is uncleared →
  `not_admitted`, return the conflict diagnostic, agent continues; host records
  `softInterventionConsumed = true` in the append-only attempt log;
- a later resolved submission while still uncleared → **admitted** (A1
  enforcement is intentionally exhausted after one intervention);
- `unresolved` → always admitted.

The **first** unsafe resolved submission returns a **byte-identical**
model-visible response in A1 and A2; only host-side persistence differs. Thus
`A1−A0 = OneInterventionEffect` and `A2−A1 = PersistentEnforcementEffect`.

### Amendment B — owner participation ≠ semantic resolution (and ≠ truth)

`peer replied` is **not** `conflict resolved`. The configured owner may answer
"A is authoritative", "B is authoritative", "neither is guaranteed", "the issue
is undecided", or "I do not own that question" — all valid. The mechanism only
proves **the authority owner has participated**. Every outcome therefore carries
two independent axes: a **mechanical policy outcome**
(`POLICY_ADMISSIBLE_RESOLVED` / `POLICY_ADMISSIBLE_UNRESOLVED` / `POLICY_BLOCKED`)
and a **semantic outcome** (`SEMANTICALLY_CORRECT` / `_INCORRECT` /
`_UNRESOLVED` / `NOT_SCORED`, scored against the pre-registered responder fixture
with a frozen deterministic rubric, never another LLM as canonical judge). The
report must never say "verified true" / "conflict resolved" / "peer proved
correctness"; mechanical admission is always "admitted under policy". The
internal convenience name `safeResolved` is renamed
`PolicyAdmissibleResolvedRate` / `OwnerParticipatedResolvedRate` /
`SemanticCorrectResolvedRate` / `ExplicitUnresolvedRate`.

### Amendment C — ticket state is a **projection**, not a second truth store

No `ticket_state` table or mutable conflict-truth row is added. Ticket state is

```
TicketState = Projection(OracleManifest, durable CollaborationEvents, append-only admission attempts)
```

State vocabulary avoids any truth claim: `NONE` / `OPEN` / `CONSULTING` /
`OWNER_RESPONSE_RECEIVED` (never `RESOLVED` / `VERIFIED` / `CLEARED_TRUE`).

- V/L/N/SO-V → `NONE` (no ticket; any block on these classes is a FALSE_BLOCK,
  so `FalseBlockRate_{V+L+N}=0` is a machine invariant, not behavioral variance).
- I/SO-I → `OPEN` at run start, from the frozen hidden manifest, with
  `conflictDetection="oracle_fixture"` recorded on **every** record.
- `OPEN → CONSULTING` on the first qualifying durable focal→owner event; that
  event's `threadId` is the canonical consultation thread (first = canonical).
- `CONSULTING → OWNER_RESPONSE_RECEIVED` only on an authenticated durable inbound
  event `from = configured resolutionOwner`, `to = focalPeer`, same
  `threadId`. A focal's own outbound event, a wrong peer, an unrelated thread, a
  wake notice, a `collab_ack`, a contract update, or elapsed time never clear it.

Admission policy for A2: resolved + `OPEN`/`CONSULTING` → not admitted; resolved
+ `OWNER_RESPONSE_RECEIVED` → admitted under owner-participation policy;
unresolved → admitted in every state. A1's one-shot state is reconstructed from
the append-only attempt log (`runId, attemptIndex, timestamp, disposition,
ticketProjection, arm, admissionOutcome, reasonCode, ownerResponded`), which is
durable and therefore survives a harness restart.

## 3. Execution status at assessment time — NOT EXECUTED (historical, superseded by §3A)

**No 0I runs were executed in this session.** The assessment and seam audit above
are complete and committed; the gate, ticket machinery, 0I runner/driver and the
96-run study are **not implemented or run**. This is stated plainly rather than
reported as partial results: there are no admission metrics, no safety or
liveness numbers, and no evidence about A0/A1/A2.

The follow-on work is fully specified by §6–§86 and requires no new design
decisions beyond the Option B choice recorded here.

## 3A. Execution status — EXECUTED (2026-09-11)

The Option B experiment described in §2/§2A was implemented and run to
completion on this branch:

- admission gate + ticket projection + append-only attempt log implemented;
  `decision_submit` Agent-scoped and identical across arms;
- machine proof ADM-A00…A10, projection, restart reconstruction, model-spoof,
  agent-scoping green; deterministic Fakes 1–5 green through a real DSH agent;
  one real-model I/A2 smoke green;
- 96-run manifest frozen/randomized (seed 20260911) and **96/96 scored runs
  valid**; both machine invariants hold
  (`FalseBlockRate_{V+L+N}=0`, `UnsafeResolvedAdmissionRate_{I,A2}=0`);
- outcomes and interpretation in `PAL-FED-0I-ANALYSIS.md`, `-DELIVERY.md`,
  `-G10-A0-INPUT.md`.

Headline: the one-shot gate (A1) induced recovery in 100% of I runs versus 11%
in pass-through (A0); persistent enforcement (A2) added **no** contact lift
(0.00) and only a non-significant abstention increase; of the three A2
owner-participated resolved admissions, 1 was semantically correct and 2 were
incorrect, so owner participation is insufficient for correctness
(`AdmissionPolicy ≠ TruthVerification`). Pattern: Possible Results **B + E**,
with **C not observed** (no dead-ends, all runs admitted).

## 4. Constraints preserved for the follow-on

- No Ordarium modification; epistemic admission stays Palimpsest-side.
- No production config surface for the admission mode; no `BoundaryContract`
  revival; no new event kinds; no new Ordarium primitive; polling closed.
- 0H results stand unchanged (V/L specificity 100%; irreducible I collapse
  67–100%; structured provenance rejected).
