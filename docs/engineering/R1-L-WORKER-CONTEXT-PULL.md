# R1-L — GOVERNED WORKER CONTEXT PULL LAST-MILE CLOSURE

> Stage: **R1-L** (host / worker-protocol semantic extension), branch `r1-l-worker-context-pull`,
> created from EXACTLY the R1 measurement commit `38ead3f58195f82729cd5fb0da82ce2997b2b490`, which
> remains unchanged and an ancestor of HEAD.
> Evidence: `research-evidence/r1-l/`. Gate: `gate:r1-l-live`.

---

## 1. The gap R1 measured, and what R1-L changes

R1 stopped at a semantic blocker: `ContextDistribution.handles` reached the worker **process payload**
and was then dropped. The first-party host's `workTask()` rendered `work.*` and `compiled.continuation`
only; and because the host denies every inherited `palimpsest_*` tool to a worker, there was no tool with
which to pull a body either. All three R1 conditions therefore produced **byte-identical model-visible
prompts** and the primary experiment could not be formed.

| stage | state |
|---|---|
| compile | CLOSED |
| binding | CLOSED |
| distribution | CLOSED |
| host payload | CLOSED |
| model visibility | **BROKEN → CLOSED** |
| worker pull | **BROKEN → CLOSED** |

**This stage does NOT prove stochastic compounding.** It makes the R1 experiment semantically
measurable, and nothing more.

---

## 2. What was built

### 2.1 The type seam (§18)

`src/deployment/work_worker.ts` carried its own copy of `WorkWorkerTaskContext`, `src/tools/controller.ts`
carried a third, and `src/interaction/work_delegation.ts` hid the difference behind `context: unknown` —
while the runtime already delivered the nested `{work, compiled}` shape. The host's `context.work ??
context` was the visible symptom: a lenient reader papering over a type that did not describe what
actually arrived.

The contract now has ONE declaration — the context owner's (`src/context/service.ts`, L2) — re-exported
by the deployment module and used by the delegation port. The direction is L5 → L2, which the layer model
allows. **Two silently divergent worker-context contracts are gone**, and the compiler proved it: repairing
the type immediately surfaced three test call sites that had been passing the flat shape.

### 2.2 The visible index (§6)

`renderWorkerContextIndex` renders the attempt's OWN `compiled.handles` — `kind` and `handle` only.
No body, no standing, no preview, no relevance inference, and the compiled order is the rendered order.
An attempt with no selected capital renders an explicit `(no project context was selected for this
attempt)` line rather than an empty section. The text lives in the PRODUCT, like the result tool's, so
there is one description of the worker protocol; the host only decides where it goes.

### 2.3 The worker-private pull tool (§7/§13)

`palimpsest_worker_context_pull`, registered for **every** worker — including one whose attempt selected
no capital. This is load-bearing for R1: the C0/C1/C2 tool catalogues must be identical, so the only
treatment difference is the attempt's own visible index and resolvable handles.

The worker-private surface is exactly:

```
palimpsest_worker_result          (unchanged)
palimpsest_worker_context_pull    (new)
```

Every principal/inherited `palimpsest_*` tool remains denied.

### 2.4 Handle-only, attempt-bound (§8/§9/§10)

The tool accepts exactly `{ handle }` — `additionalProperties: false`, and the envelope parser admits
exactly `{channel, kind, requestId, handle}`. There is **no argument** through which a model could name
an attempt, a project, a claim, a cell, a procedure, a path or an owner: the handle is the entire request
identity.

The allowlist is derived at delegation time from that attempt's own compiled handles, and a handle outside
it is refused **before any owner is consulted** — so a fabricated handle cannot probe what exists. There
is no fallback to a global asset lookup.

The canonical read remains `controller.fetchContext(attemptId, handle)`, bound internally to the attempt
the host already owns. The port receives a closure that already knows the attempt, not an id it could
misuse.

### 2.5 Transport (§11)

One extra IPC channel: the port spawns the worker with `stdio: ["ignore","pipe","pipe","ipc"]`. The
protocol is closed (`palimpsest-worker-context-v1`, statuses `resolved | not_found | refused | error`),
requests carry a bounded timeout, and the capability dies with the worker process. `refused` and
`not_found` are deliberately distinct: "you may not ask that" is not "the owner no longer has it", and
collapsing them would hide a boundary breach inside a lookup miss.

**Transport safety (§12).** Verified rather than assumed: the installed DSH host uses no Node IPC
(`process.send` / `process.on('message')` appear nowhere in its bundle), so the channel does not collide
with its own transports. No HTTP service, no localhost port, no shared database, no inlined bodies, no
principal tool exposure.

### 2.6 Telemetry (§17)

`PALIMPSEST_WORKER_PULL` reports the handles a worker actually pulled — **and never a body**. This is
what gives the resumed R1 experiment a mechanical answer to "did the stochastic worker use the capital?"
without persisting any model reasoning.

---

## 3. Proof

### 3.1 Deterministic (L-GATE-A)

```
pnpm build                     0 errors
new R1-L unit/adversarial      test/r1l_worker_context_pull.test.ts   15 tests
                               test/r1l_pull_boundary.test.ts         18 tests
                               test/r1l_pull_transport.test.ts         4 tests
existing context/work/delegation tests   test/lean_work_worker_runtime.test.ts, lean_d5c3_* — all pass
pnpm exec vitest run           2978 passed / 252 files, 0 errors
pnpm architecture:check        PASS — 0 violations
pnpm architecture:check-public-api  PASS — 0 / 0 / 0
```

Expected and confirmed: **NEW CANONICAL OWNER = NONE**, new persistence = NONE,
`install_contract` change = NONE. Exactly two product files changed
(`src/deployment/work_worker.ts`, `src/interaction/work_delegation.ts`).

### 3.2 Real host (`gate:r1-l-live`) — PASS, 17/17

The headline proof is **ACCESSIBILITY**, not model performance (§26). Each selected capital body carries
an unguessable per-run nonce that appears nowhere else — not in the task objective, the requirements, the
repository, the tests, or the prompt outside the bodies.

| | C0 | C1 | C2 |
|---|---|---|---|
| handles in payload | 0 | 2 (proof, reasoning) | 3 (+ procedure) |
| index handle lines in the prompt | 0 | 2 | 3 |
| pull tool delivered | ✅ | ✅ | ✅ |
| handles actually pulled | `[]` | both | all three |
| **protected values obtained** | **NO** | **YES** | **YES** |
| nonce in the initial task text | none | none | none |

C0 could not obtain the values because it was given no handles; C1 and C2 obtained exactly the values
corresponding to the handles they were given. In C2 the worker's own summary records pulling all three
bodies and refusing to follow an instruction embedded in one of them — treating untrusted context content
as data rather than instruction, which is the boundary behaving correctly.

### 3.3 The frozen R1 precondition, re-run (L-GATE-C)

| | ordinary task portion | context-index section |
|---|---|---|
| C0 | `d868e4c1…` | 0 handle lines |
| C1 | `d868e4c1…` | 2 handle lines |
| C2 | `d868e4c1…` | 3 handle lines |

The ordinary task portion is **still byte-identical** — that digest is exactly the value R1 measured as
the *whole* prompt, so the experimental control holds. What changed is the index section, which now
differs as the conditions intend.

```
R1 PRECONDITION BLOCKER: CLOSED
```

---

## 4. The Scenario-A ceiling finding (§28)

**R1 PROTOCOL AMENDMENT REQUIRED BEFORE PRIMARY MATRIX.**

The blocked R1 probe established something independent of the last-mile bug: Scenario A's C0 worker —
`deepseek-flash`, given **no capital at all** — scored **8/8** on the acceptance oracle. A control that
already passes the correctness bar cannot discriminate between conditions, so the original primary
protocol has a ceiling-effect problem on top of the blocker.

The frozen protocol's digest is **not** silently modified. A later experimental stage must append a formal
amendment before any primary trial. Scenario A may remain a **channel-use / rediscovery / efficiency
probe**, but it should not automatically remain the main correctness discriminator.

## 5. Relevance remains deferred (§29)

Unchanged from R1, and not re-measured here:

```
N=5 → 9 operations · N=25 → 29 · N=100 → 104 · relevant missed = 0
classification: SCALING_FRICTION
```

No selection automation was implemented. The first priority was making selected capital actually
reachable, and that is what this stage did.

---

## 6. What this does NOT claim

- It does not claim stochastic compounding. The primary matrix has still never run.
- It does not claim the model will always pull. §26: if a worker declines to pull despite a task needing
  inaccessible values, that is recorded as `KNOWLEDGE_NOT_USED` — the capability boundary is not weakened
  to make a model comply.
- It does not claim the index renders identically in another host. The product owns the text; an embedder
  owns placement.
- It does not redesign CTX-4 boot budgeting. `compiled.boot` was audited and left alone.
