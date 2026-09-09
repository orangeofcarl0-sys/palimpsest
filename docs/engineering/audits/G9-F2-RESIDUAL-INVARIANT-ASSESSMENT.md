# G9-F2 — Residual Contract / View Invariant Assessment (PLMP-PARSE-1 Closure Addendum)

Scope: post-delivery audit of G9-F (7d130aa) residuals reported by the directive.
Method: every residual below was machine-reproduced against current `main`
(scratch `test/_g9f2_audit.test.ts`, deleted after the fixes land) **before**
any implementation. Baseline regression: 58 files / 409 tests, all green.

## Reproduction matrix

| Residual | Verdict | Severity | Reproducer |
| --- | --- | --- | --- |
| A — caller-owned attribution alias | CONFIRMED | HIGH | RES-A |
| A3 — HTTP attribution cast, not validated | CONFIRMED | HIGH | RES-A3 |
| B — view epoch is a 32-bit truncated UUID | CONFIRMED (doc overclaim) | LOW | RES-B |
| C — viewCursor + legacy cursor contradict `changed` | CONFIRMED | HIGH | RES-C |
| D — health/declare project scoping | CONFIRMED | MEDIUM | RES-D |
| E — GateClause inner objects permissive | CONFIRMED | MEDIUM | RES-E |
| F — durable declarations skip full grammar | CONFIRMED | HIGH | RES-F |
| G — CANDIDATE_SELECTED best-effort booleans | CONFIRMED | MEDIUM | RES-G |

## Residual A — caller-owned attribution mutates the graph behind an unchanged ViewCursor

Reproduced (`RES-A`): after `claim(attemptId, attribution)` with
`attribution = {model:"model-A", cost:1}`, mutating `attribution.model` to
`"model-B"` leaves `viewCursor()` byte-identical while the next
`orchestrationGraph()` reports `model-B`. `SameViewCursor ⇒ SameProjection`
(VIEW-INV-2) is violated.

Exact code path: `src/tools/controller.ts:860` —
`this.#attemptAttribution.set(attemptId, attribution)` stores the **caller's
object reference**; `src/tools/graph.ts:236-246` reads it into
`LiveAttemptView.attribution` on every build. The `#viewGeneration` bump
happens only at `claim()` time; later caller-side mutations are invisible to
the freshness token while changing the graph output.

Rule frozen by this batch (VIEW-INV-5): controller-owned graph-visible
volatile state must not retain caller-mutable aliases. Fix: normalize/copy at
controller ingress.

## Residual A3 — the HTTP/control boundary casts attribution without validation

Reproduced (`RES-A3`): `POST /api/control/claim` with
`{attribution:{model:42, cost:"free", junk:true}}` returns 200 and the next
graph carries `attribution:{"model":42,"cost":"free"}` — unvalidated,
wrong-typed values become graph-visible state and later telemetry samples.

Exact code path: `src/serve.ts:180-183` —
`(body.attribution as AttemptAttribution)`; `AttemptAttribution` is a
TypeScript interface only (`src/tools/controller.ts:146-153`); nothing
runtime-validates before `controller.claim()` stores it.

Fix: a dedicated `parseAttemptAttribution(value)` (model: non-empty string;
cost: optional finite number ≥ 0; taskType: optional non-empty string; unknown
fields rejected) applied at the single controller ingress. Public semantics
stay exactly the three declared fields.

## Residual B — the view epoch is only a truncated UUID

Reproduced (`RES-B`): `viewCursor()` returns `v1:412a4d7a:0:0` — the process
epoch is `randomUUID().slice(0, 8)` (32 bits of namespace). The spec 32/35
language ("cross-process cursor equality can never mean equal views") is
stronger than the implementation justifies.

Decision (§8): **Option A — full 128-bit cryptographic process nonce**
(`randomUUID()` untruncated), with documentation reworded to the honest
guarantee: *accidental cross-process equality is cryptographically
negligible, not mathematically impossible*. Option B (volatile-state digest)
was rejected: any honest digest of graph-visible volatile state requires
either tracking per-field volatile hashes (new machinery) or hashing the
graph (explicitly forbidden by §9). Option A is the smallest design that
restores the stated guarantee; the token format stays `v1:<epoch>:<eventCursor>:<generation>`.

## Residual C — mixed viewCursor/legacy cursor can return a graph with `changed:false`

Reproduced (`RES-C`): after a volatile graph change (claim with attribution,
no event appended), `GET /api/graph?viewCursor=<stale>&cursor=<current event
cursor>` returns the **new graph with `changed:false`**.

Exact code path: `src/serve.ts:241-259` — when `viewCursor` does not match,
the handler falls through to the legacy `changed` computation
(`Number(cursorParam) !== graph.project.cursor`), so the legacy cursor can
outvote the view verdict the client just lost.

Rule frozen by this batch (VIEW-INV-6): when `viewCursor` is supplied, its
freshness verdict dominates; the legacy numeric `cursor` is only consulted
when `viewCursor` is absent. `?cursor=` compatibility (its own semantics) is
kept unchanged for legacy-only callers.

## Residual D — project initialization is not project-scoped

Reproduced (`RES-D`): with project-a initialized in one store, a controller
pointing at project-b (no rows of its own) reports
`{ok:true, projectInitialized:true, eventCursor:0}` — the health answer
belongs to a different project.

Exact code path: `src/tools/controller.ts:1550-1558` —
`SELECT 1 AS ok FROM scheduler_control LIMIT 1` has no `WHERE project_id=?`.
The same unscoped pattern exists in `src/serve.ts:441-442`
(`/api/proposal/declare` uses it to choose start-vs-plan for *this*
controller's project — a second instance of the same defect class, fixed in
the same stroke).

Rule frozen by this batch (HEALTH-INV-2): `projectInitialized =
initialized(controller.projectId)`. `serviceHealth()` stays cheap (two
indexed SELECTs, no graph build).

## Residual E — GateClause inner objects are still permissive

Reproduced (`RES-E`): `parseClause({exists:{predicate:"tests_pass",wheer:{}}})`
is accepted — `wheer` silently vanishes. `count` has the same hole for
unknown *sibling* keys (`{predicate, gte:1, gt:2}` is accepted); the probe's
literal `count.gt`-replacing-`gte` case only throws today because the
required `gte` is missing — by accident, not by policy.

Exact code path: `src/domain/gate_clause.ts:67-90` — the `exists`/`count`
branches read their known keys but never reject unknown siblings inside the
inner object. The outer envelope is closed (spec 35); the inner objects it
owns were missed.

Rule frozen by this batch (PARSE-INV-4): closed nested objects owned by a
parser reject unknown fields recursively at every owned level. `exists` ⇒
`{predicate, where?}`; `count` ⇒ `{predicate, where?, gte}`; `not` ⇒ recursive
`parseClause`; `where` maps stay explicitly OPEN (PARSE-INV-3).

## Residual F — durable gate/stage declarations are not fully grammar-validated before commit

Reproduced (`RES-F`):
1. `controller.declareGate(<malformed clause>, "audit")` appends the event —
   the ledger now contains a gate whose `exists.wheer` a canonical reader
   will never see.
2. Direct `store.append(parseNewEvent(<STAGE_GRAPH_DEFINED with transition
   to:"DONE">))` is accepted (event_id 6) and replays cleanly — while
   `scheduler.ts:358` (`parseStageGraphDefinition(decodeJsonBlob(...))`) will
   throw the first time that projection is read. The ledger holds an object a
   canonical reader considers structurally invalid: exactly the EMPTY_GOAL
   class (WIRE-INV-3 violation).

Exact code paths:
- `src/tools/controller.ts:336-356` — `declareGate` takes
  `gate: GateDefinition` on trust (no `parseGateDefinition` call; the CLI
  parses at `cli.ts:150`, but the controller seam does not).
- `src/schema/models.ts:1408-1416` (GATE_DEFINED) and `1434-1454`
  (STAGE_GRAPH_DEFINED) — the durable payload parser only checks shallow
  shape and returns `raw.gate` / `raw.stages…` **verbatim**; the comment
  claims grammar is "enforced on read", but `GateEngine.definitionOf`
  (`src/evidence/gate_dsl.ts:104`) casts `JSON.parse(...) as GateDefinition`
  without parsing. The append seam
  (`EventStore.append` → `parseNewEvent` → `normalizeEventPayload`, inside the
  BEGIN IMMEDIATE transaction) is the shared durable declaration boundary.

Two faces traced (§21): the **authoring face** is
`require: {all:[…]} | {any:[…]}` (what `parseGateDefinition` accepts and
converts); the **canonical face** is
`require: {mode:"all"|"any", chain:[…]}` (what the `GateDefinition` type,
`gate_registry.definition_json`, and `GateEngine.evaluate` actually carry —
the CLI appends `parseGateDefinition(...)` output, i.e. canonical). The two
faces are NOT currently explicit; calling the authoring parser on the stored
canonical form would reject it ("unknown gate require field 'mode'").

Fix (§22): `parseCanonicalGateDefinition` becomes the one grammar owner of
the durable face (closed envelope, exactly one mode, clause chain through
`parseClause`); `parseGateDefinition` stays the authoring-face owner; the
GATE_DEFINED payload case validates + normalizes through the canonical
parser, and STAGE_GRAPH_DEFINED through `parseStageGraphDefinition` (its
authoring and canonical shapes coincide — parse is idempotent on its own
output, so stored bytes are unchanged). Both fixes sit in
`normalizeEventPayload`, so **every** durable append path (controller,
direct seam, replay re-read) validates full grammar before commit/replay;
a throw inside the append transaction writes zero event/projection state.

## Residual G — CANDIDATE_SELECTED required booleans are best-effort normalized

Reproduced (`RES-G`): payloads with missing `rounds[].tie`, `tie:"true"`,
or missing `judge.replayable` all parse with the fields normalized to
`false` — truthiness/default normalization, not exact canonical parsing.

Exact code path: `src/schema/models.ts:1583` (`tie: entry.tie === true`) and
`:1591` (`replayable: judge.replayable === true`). The nested unknown-key
rejects (candidate round/judge) already exist from G9-F; only the boolean
reading is best-effort.

Rule frozen by this batch (WIRE-INV-4): required boolean ⇒ presence +
boolean type (`expectBool`). Real tournament output
(`src/select/tournament.ts:77-82` — `tie: decision === "tie"`;
`controller.ts` selection — `replayable: declared.kind === "rubric"`) always
produces real booleans, so no producer changes.

## §28 targeted nested-strictness belt (post-fix sweep)

After the fixes, the objects touched by G9-F were re-scanned for
`x === true` / silently-defaulted required fields. Result (see delivery
report Q17): the only defects were A3 (attribution) and G (tie/replayable).
Everything else G9-F touched (task/attempt transitions, manifest entries,
role table, promotions, judge declarations) already parses required fields
through `field(...)` + typed validators. No further widening was done.

## Keep-fixed list (§32)

EventCursor ≠ ViewCursor; legacy `project.cursor` numeric semantics;
`?cursor=` compatibility; the viewCursor fast path; explicit open maps
(`where`, `EvidenceAtom.value`, `manifest.requirement`); per-contract
canonical allowlists; historical replay fixtures; health without ProjectIR;
PRES-BELT semantic node order. None of the fixes above may regress these.
