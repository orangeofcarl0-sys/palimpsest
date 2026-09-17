# RC-1 — Carry-forward reassessment

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Spec: `SPEC-PROMPT-RC-1.md` §42. This document reassesses the carry-forward list against
what the RC-1 live trials actually measured. Nothing closes without evidence; nothing is
kept open merely out of habit.

---

## 1. UX-C new 4.2 — live-principal packaged proof → **CLOSED_IN_RC1**

UX-C's §4.2 said the packaged dogfoods never ran a live model-driven principal turn.
RC-1 ran real model-driven DSH principals over the shipped host (no scripted principal, no
direct `application.*` call standing in for the model) and qualified the product path:

- local parallel / AUTO Explore / current-project CHECK / English smoke: see
  `release-evidence/rc1-live-local.json`;
- cross-project Ask with two live principals: see `release-evidence/rc1-live-cross-project.json`.

The observed `request/header.config` on every trial is the configured
`openrouter-stealth` / `stealth/union-alpha`. This closes the *packaged proof* item for
this one supported configuration (§12); it does **not** generalise to other models.

## 2. UX-C new 4.6 — cold-resume evidence gap → **OPEN (unchanged)**

RC-1 did not naturally exercise a cold resume of a dead principal session: the shipped
runner's activation adapter resolves the resident session it created (`agents.get`), so
the `resume` branch still is not driven by a live path. Nothing was restructured to force
it. Trigger unchanged: a host refactor that exports the runner's activation construction,
or a first real cold resume in production.

## 3. UX-C new 4.4 — host cost / budget presets → **OPEN (first real data recorded)**

RC-1 recorded per-trial wall-clock, principal tool-call count, branch process count,
cross-project message count and verifier run count; the host exposes **no** token
accounting, so none is invented (§31). No pathological fan-out was observed. Trigger
unchanged: a deployment that must bound collaboration spend, or a measured cost incident.

## 4. UX-C new 4.5 — the DSH host persists a branch session artifact → **OPEN (facts recorded)**

RC-1 measured the branch artifacts instead of deleting them (§30):
`release-evidence/rc1-live-principal.json` → `branchArtifactRetention` (path, approximate
size, data classes). Nothing was deleted. Trigger unchanged: a disk-retention or
confidentiality requirement for branch artifacts, or a DSH API that disables per-agent
session persistence.

## 5. UX-C new 4.7 — shared reasoning-service / Proof coupling → **OPEN (unchanged)**

No launch profile in RC-1 wires a Proof store, so the latent coupling is still
unreachable. RC-1 deliberately did not wire Proof just to exercise it (§43). Trigger
unchanged: the first packaging step that wires a Proof store into a launched deployment.

## 6. CF-UXA-04 — lexical profiler → **OPEN (unchanged)**

AUTO still selects Explore only when the task text carries the profiler's markers. RC-1
did not add a model-backed profiler. Trigger unchanged: real trials where the honest
lexical profiler repeatedly misroutes an ordinary request. (RC-1's AUTO trials are the
first live data; see the evidence bundle.)

## 7. CF-UXB-04 — fuzzy project resolver → **OPEN (unchanged)**

Cross-project resolution stayed exact (`projectId` / `displayName` / `alias`). RC-1 did
**not** enable a fuzzy/model resolver (§25). In the live trials the model derived the
`optics` alias correctly from the sentence. Trigger unchanged: real trials showing exact
resolution is insufficient.

---

## 8. New findings from RC-1 (things that were real)

### 8.1 An attention-driven turn was neither observable nor reliably durable

The shipped runner delivered activation turns with `followup` (fire-and-forget) and never
flushed or reported them: the harness could not see the activated principal's final
visible text, and the turn could be lost until process exit. RC-1 added a minimal,
semantics-neutral step to `host/dsh/lib/runner.js`: after a successful activation it waits
for the queued turn, flushes the session and prints the same `PALIMPSEST_TURN` record it
already prints for a launch turn. No authority, capability or semantic species was added.
**Disposition:** fixed in RC-1 (release-blocking for "observable evidence only", §11).

### 8.2 A long-running host's stdout is not a reliable evidence channel

`PALIMPSEST_ACTIVATION` / `PALIMPSEST_TURN` lines were intermittently absent from a
long-running principal's stdout, while the same facts were durably present in the DSH
session artifact. The live harnesses therefore read the persisted session (tool calls,
tool results, delivered user messages, assistant text) as the primary evidence and treat
stdout only as supplementary. This is a harness design consequence, not a product defect.
**Disposition:** recorded; harness reads the durable artifact.

### 8.3 Activation is an inbox splice, not a new top-level turn

The DSH agent splices an attention followup into the existing agent turn
(`agent/inbox/spliced`) and reuses the same `turn` index, so "a later turn" cannot be
detected by `data.turn`. It is detected by sequence position after the `ANSWERED` receive
and by the delivered product attention text.
**Disposition:** recorded; harness detection updated.

### 8.4 A product request id can appear in the principal's prose

In several cross-project trials the origin principal echoed the cross-project request id
(`cpq-…`) in its user-visible text. This is the handle the product returns so the agent can
poll `status`/`receive`, not a peer/thread identity; it is recorded separately
(`surfacedRequestId`) rather than treated as a disclosure violation. It is a minor §22
"hide internal ids by default" hygiene observation.
**Disposition:** recorded; candidate for a future copy-guidance trigger (do not special-case
this stage).

---

## 9. What does **not** carry forward

- No new kernel semantic species, authority plane, Agent identity or hidden autonomy was
  introduced (spec §46 RCP-A01…A03).
- No Proof store, fuzzy resolver or OS daemon was added (§25/§28/§43).
- Expert tools, raw federation tools, ReasoningCell tools and the Work CLI remain
  registered and documented.
