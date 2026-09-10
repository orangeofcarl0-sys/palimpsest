# PAL-FED-0D Delivery Report

Status: EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0-dsh` (child of `experiment/pal-fed-0` at `2c7a63c`).

## 1. Outcome

**Both peers ran as real DSH root Agents with separate resumable DSH Sessions
and worktrees, and completed a fully autonomous bilateral exchange in which the
user was never a message bus — including autonomous initiation.** The final run
used an *open, non-directive* prompt to P; P independently decided to contact O,
O was woken by the system, reasoned in its own context, replied (and updated a
BoundaryContract), and P was woken by the reply. No Ordarium primitive was
needed.

## 2. Runtime binding

- DSH `0.1.5-rc.1` pinned; Node v24.14.1; Ordarium 1.3.1; SQLite schema v4.
- `pal-fed-collab` is a real DSH cordis plugin owning one peer agent per
  profile: `ctx.agents.create`/`resume`, `setup(agentCtx, agent)`,
  `agentCtx.tools.register`, `agentCtx.systemPrompt.section`, `agent.followup`.
  DSH owns registry, session, loop, inbox, tool composition and disposal; the
  plugin never drives the model.
- MCP adapter retained as debug/comparison surface (§11/§46). Historical
  `src/tools/dsh_types.ts` stand-ins left untouched (§4/§11).

## 3. Machine acceptance (§26–§32, §47)

`pnpm test` = **66 files / 475 tests green** (10 new PAL-FED-0D tests; 32
PAL-FED-0 protocol tests preserved).

| ID | Test |
|---|---|
| FED-DSH-A00 | `DSH owns the peer agent: registry, session, loop and typed root` |
| FED-DSH-A01 | `collaboration tools are agent-scoped; a subagent does not inherit them` |
| FED-DSH-A02 | `a real DSH tool call records authentic invocation provenance` |
| FED-DSH-A03 | `a pending peer batch wakes the receiving DSH agent; wake is not ack` |
| FED-DSH-A04 | `bidirectional wake: both peers notify each other without a human bus` |
| FED-DSH-A05 | `crash before ack redelivers the same batch through a DSH session resume` |
| FED-DSH-A06 | `loop-storm negative: a no-reply event produces no acknowledgement message` |
| — | `federation_dsh_artifact.test.ts` (frozen artifact) |

A02 additionally proves the model cannot supply another author: tool arguments
are re-validated by the PAL-FED strict envelopes, and the persisted
`CollaborationEvent.from` / `InvocationIdentity.actor` equal the configured
`PeerRef` while `identity.source === "dsh"`.

## 4. Real dogfood (§37–§39, §44)

Hosts: two **separate processes** of `tools/pal-fed-dogfood-peer.mjs`, real
DeepSeek model, each a runtime root (no `parentAgent`), each in its own
worktree, sharing one coordination DB outside both worktrees.

| | Attempt 1 | Attempt 2 | Attempt 3 (final) |
|---|---|---|---|
| Operator prompt to P | open | directive ("contact O now") | **open** |
| Guidance | checkpoint list | checkpoint list | **+ §41 dependency criterion** |
| Events | 0 | 2 | **2** |
| P autonomous initiation | ❌ | (directed) | ✅ |
| O woken by system | — | ✅ | ✅ |
| O user messages | — | 0 | **0** |
| P woken by reply | — | ✅ (event delivered) | ✅ (`wakeCount` 1) |

Attempt 3 (`evidence/pal-fed-0d-dogfood3-evidence.json`, build
`pal-fed-0d+1d40f0821c16`, control-plane `dist/src` SHA-256 `cd0088fa…c8e7c`):

```
palimpsest.main  userMessages=1  pluginWakeNotices=1
  steps: collab_inbox → collab_post → collab_inbox
ordarium.main    userMessages=0  pluginWakeNotices=1
  steps: collab_inbox → collab_thread → contract_update → collab_post → collab_ack
thread: thr_99f5049e-…   P→O question   O→P decision
ordariumPrimitiveRequired: false
```

**The §41 criterion mattered.** Attempt 1 (checkpoint list, no criterion) and
attempt 3 (same open prompt, criterion added) differ only in the guidance:
attempt 1 produced no contact; attempt 3 produced autonomous initiation. The
criterion does not say "always ask the peer" — it says contact when a decision
depends on the peer's owned interface/constraint/state/authority, which is
exactly what P judged this question to be.

Earlier evidence files (`pal-fed-0d-dogfood-summary.json`,
`pal-fed-0d-dogfood-evidence.json`) are attempt 2, built from the pre-criterion
artifact `pal-fed-0d+2c7a63c12366`; kept for the contrast.

## 5. §45 behavioral questions

1. **Were both peers actual DSH Agents?** Yes — present in `ctx.agents`, with
   live sessions and DSH-driven turns.
2. **Separate persisted DSH Sessions?** Yes — `pal-fed-p-main` / `pal-fed-o-main`
   under separate worktrees; A05 resumes a persisted session.
3. **Runtime roots rather than parent/child?** Yes — no `parentAgent`.
4. **Peer tools Agent-scoped?** Yes — asserted; a subagent sees neither tools
   nor guidance (FED-DSH-A01).
5. **DSH provenance in Ordarium state?** Yes — `source="dsh"`, real
   `callId`/`rootCallId`, `actor=PeerRef` (FED-DSH-A02).
6. **Could a subagent impersonate peer identity?** No.
7. **Did the system wake O without the user touching O?** Yes (A03, and the
   dogfood: O had 0 user messages).
8. **Did O reason from its own project context?** Yes — own session/worktree.
9. **Did O autonomously decide how to respond?** Yes — it chose to
   `collab_thread`, then `contract_update`, then a `decision` reply, not a
   scripted answer.
10. **Was P automatically notified of O's response?** Yes — plugin wake notice,
    `wakeCount` 1, second turn.
11. **Did P initiate without a "contact O" directive?** **Yes**, in attempt 3.
12. **If not, what prevented it?** In attempt 1 the guidance lacked an explicit
    decision criterion; the model investigated reads but did not name a
    dependency. Adding the §41 criterion fixed it without hard-coding contact.
13. **Over-communicate?** No status chatter; the exchange was two substantive
    events in one thread.
14. **Full plans exchanged?** No — boundary deltas only; no plan/task sync.
15. **Was BoundaryContract useful?** Yes — O used `contract_update` on the
    boundary decision rather than only messaging.
16. **Was pending-batch/ack ceremony justified?** Yes — it is what makes crash
    redelivery safe (A05); ack happened in the same turn.
17. **Was polling latency acceptable?** Yes at 2s for a local DB; O's response
    arrived within one poll interval of the event.
18. **Is `waitStateChanges()` actually needed?** No — O independently decided the
    same; polling suffices for this topology.
19. **Is custom MCP still useful?** Not for the dogfood; useful as a debug /
    comparison surface.
20. **Does this feel like two persistent peers?** Yes — separate lived state,
    asymmetric knowledge, spontaneous initiation, no orchestrator.

## 6. §46 DSH-native vs custom MCP

| Axis | DSH-native plugin | Custom MCP adapter |
|---|---|---|
| Identity fidelity | Trusted `selfPeer` in-process; real `callId`/`rootCallId` | Fabricated invocation identity (no host call context) |
| Agent scoping | Native `setup()`/agent scope; subagent isolation | None — any client of the server |
| Session integration | Real DSH session, resume, disposal | None; adapter is stateless |
| Wake capability | `agent.followup` → real DSH inbox/driver | None |
| Lifecycle | DSH-owned create/resume/dispose | Manual process lifetime |
| Complexity | Plugin + profile config | Small standalone server |
| Portability | Tied to DSH plugin API (dev preview) | Host-agnostic |
| Debuggability | Session log is the trace | Easier to drive in isolation |

Hypothesis confirmed by evidence: **DSH-native is the real runtime; MCP stays a
debug/compatibility surface.** MCP was not needed for the dogfood.

## 7. Final gates (§48)

```
clean ✅   build ✅   build:web ✅   test ✅ 66/475   test:e2e ⚠️
```

**Remote CI (draft PR #2):** `unit => success`; `e2e => failure` (twice,
including a rerun) on `E2E-DEBUG-01` — node present but hidden at
`runtime-debugger.spec.ts:56`.

**Separated from baseline exactly:** everything the browser E2E exercises is
byte-identical to PAL-FED-0 (where remote e2e passed):

```
dist/web (all files)                    27bc76ba…a3ccc   both branches
dist/src excluding federation/          9e889ee7…aef785   both branches
```

The only server change is in `src/federation/`, which the e2e kernel never
imports. This is the pre-existing `runtime-debugger` timing defect reported in
PAL-FED-0, not a PAL-FED-0D regression; retries remain 0 and it is not hidden.

## 8. Stop conditions (§50)

```
real DSH version audited and pinned ............... ✅ 0.1.5-rc.1
PAL-FED DSH integration implemented .............. ✅
frozen federation runtime artifact produced ...... ✅ build-id + SHA-256
palimpsest.main runs as real DSH root Agent ...... ✅
ordarium.main runs as real DSH root Agent ........ ✅
each has separate DSH Session/worktree ........... ✅
PAL-FED tools are Agent-scoped ................... ✅
DSH call provenance is preserved ................. ✅
new peer work can wake receiving Agent via DSH ... ✅
wake never acknowledges automatically ............ ✅
crash/resume/redelivery works .................... ✅
bidirectional wake works ......................... ✅
no central manager exists ........................ ✅
real bilateral dogfood executed .................. ✅
autonomous initiation separately assessed ........ ✅ (attempts 1/2/3)
evidence and delivery report written ............. ✅
```

Not started (§50): PAL-FED-1, dynamic federation, capability discovery,
N-peer organization, CollaborationGraph, ProjectCell/Holon, G10, new Ordarium
primitives.

## 9. Residuals

- Polling wake is bounded (2s default, 200ms–60s) and is the only attention
  mechanism; a lower primitive is deferred until measured friction demands it.
- DSH is developer-preview; the binding is pinned to `0.1.5-rc.1` exactly.
- The `runtime-debugger` e2e flake is a pre-existing defect outside this batch.
- The initiation result rests on one successful open-prompt run plus one
  counter-example; more runs would strengthen it.
