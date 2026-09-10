# PAL-FED-0D Delivery Report

Status: EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0-dsh` (child of `experiment/pal-fed-0` at `2c7a63c`).

## 1. Outcome

**Two actual DSH-hosted persistent Main Agents collaborated, and one contacted
the other without the user acting as a message bus.** `palimpsest.main` and
`ordarium.main` ran as two separate real DSH host processes with the real
DeepSeek model, each in its own worktree/session, sharing only the frozen
coordination fabric. The receiving peer was woken by the system (not by the
user), reasoned from its own persistent context, and independently replied with
a decision. No new Ordarium primitive was needed.

## 2. Runtime binding

- DSH `0.1.5-rc.1` pinned; Node v24.14.1; Ordarium 1.3.1; SQLite schema v4.
- PAL-FED is a real DSH cordis plugin (`pal-fed-collab`) that owns one peer
  agent per profile: `ctx.agents.create`/`resume`, `setup(agentCtx, agent)`
  composing the scoped world, `agentCtx.tools.register` for the six tools,
  `agentCtx.systemPrompt.section` for the operating guidance, and
  `agent.followup` for wake. DSH owns registry, session, loop, inbox and
  disposal; the plugin never drives the model.
- The custom MCP adapter is retained as protocol/debug surface, not the host.
- `src/tools/dsh_types.ts` (historical structural stand-ins) was left untouched.

## 3. Machine gates (§49)

`pnpm test` — see §6 for counts. New PAL-FED-0D gates, all green:

| Gate | Test |
|---|---|
| DSH runtime integration | `DSH owns the peer agent: registry, session, loop and typed root` |
| DSH scope isolation | `collaboration tools are agent-scoped; a subagent does not inherit them` |
| DSH invocation provenance | `a real DSH tool call records authentic invocation provenance` |
| DSH wake | `a pending peer batch wakes the receiving DSH agent; wake is not ack` |
| Bidirectional wake | `bidirectional wake: both peers notify each other without a human bus` |
| Crash/resume/redelivery | `crash before ack redelivers the same batch through a DSH session resume` |
| Loop-storm negative | `loop-storm negative: a no-reply event produces no acknowledgement message` |
| Frozen runtime artifact | `federation_dsh_artifact.test.ts` |

The 32 PAL-FED-0 protocol tests remain green (§47), and the provenance
threading change is backward compatible (non-DSH writes keep the adapter's own
identity).

## 4. Real dogfood evidence (§42–§44)

Build: `pal-fed-0d+2c7a63c12366`, frozen-code SHA-256
`b4d34a49554035052fc0c8fe1b05354d4da701beac226a0771c104e4baed866c`, artifact at
`F:/Codex_Work_Space/Palimpsest/pal-fed-runtime` (outside both worktrees).

```
host process P: palimpsest.main  session pal-fed-p-main  cwd palimpsest worktree
host process O: ordarium.main    session pal-fed-o-main  cwd ordarium worktree
fabric: palimpsest-ordarium-0    DB: shared coordination.sqlite
model: real DeepSeek (deepseek-official / deepseek-flash)
```

Observed exchange (2 events, one thread `thr_7b71b528-…`):

1. P → O `question`: "peer wake mechanism for palimpsest.main … checkpoint
   polling is the current bootstrap …" — recorded with `identity.source = "dsh"`.
2. O (woken by the watcher; `wakeCount = 1`, batch `bat_a07b083c-…`) used
   `collab_inbox` → `collab_thread` → `collab_post` → `collab_ack`.
3. O → P `decision`: "low-latency peer wake does NOT require an Ordarium
   primitive. Keep it Palimpsest/DSH-side." with reasoning.
4. P's watcher delivered the wake notice into its DSH inbox
   (`agent/inbox/spliced` carries our notice; `turn/start = 2`), and P used
   `collab_inbox` → `collab_ack`.

Per-peer session evidence is in
`evidence/pal-fed-0d-dogfood-evidence.json`:

```
palimpsest.main: userMessages=1, pluginWakeNotices=1,
                 collaborationToolCalls=[collab_inbox, collab_post, collab_inbox, collab_ack]
ordarium.main:   userMessages=0, pluginWakeNotices=1,
                 collaborationToolCalls=[collab_inbox, collab_thread, collab_post, collab_ack]
```

O had **zero** user messages: its only input was the system wake notice.

**Honest negative finding.** An earlier attempt with an open, non-directive
operator prompt produced **0 events**: P used the read tools
(`collab_inbox`, `contract_get`, `collab_thread`) across six steps but did not
initiate contact. The successful run therefore used an explicit operator
instruction to P to consult the peer. So while P *could* compose and send a
boundary delta, it did not spontaneously decide to in this setup. This is
recorded as the main behavioral residual, not hidden.

## 5. §45 required conclusions

1. **Two actual DSH-hosted persistent Main Agents collaborate?** **Yes.**
2. **One Agent contacted the other without the user as message bus?** **Yes** —
   P→O and O→P both delivered by the system (O had no user input at all).
3. **Did the receiving peer reason from its own persistent context?** **Yes** —
   O ran its own DSH session/model in the Ordarium worktree and produced an
   independent decision.
4. **Did DSH-native wake remove the need for checkpoint/manual switching?**
   **Yes, in this run** — both wakes were automatic; no window switching or
   "check your inbox" prompts.
5. **Did we need any new Ordarium primitive?** **No** — and O independently
   decided it should not; that is recorded as evidence for the Ordarium peer,
   and PAL-FED-0D implemented nothing there.
6. **Did collaboration remain peer-to-peer?** **Yes** — two runtime roots, no
   `parentAgent`, no central planner.
7. **Did PAL-FED tools need to be Agent-scoped?** **Yes.** A subagent created on
   the same host sees neither the tools nor the guidance (machine-asserted);
   otherwise a temporary worker could speak with peer authority.
8. **Did the custom MCP adapter remain necessary?** **No** for the dogfood; it
   stays as a protocol/debug/comparison surface (§48).
9. **Should wake remain DSH/Palimpsest-side or move lower?** **DSH/Palimpsest
   side** on this evidence; revisit only if measured latency/friction demands a
   lower primitive.

## 6. Final gates

```
clean ✅   build ✅   build:web ✅   test ✅ 66 files / 475 tests   test:e2e ⚠️
```

PAL-FED-0D adds 10 tests (7 DSH runtime + 3 artifact); 32 PAL-FED-0 protocol
tests remain green. Retries remain 0 everywhere.

### Remote CI honesty (`experiment/pal-fed-0-dsh`, draft PR #2)

`unit => success`. `e2e => failure`, twice (original run and a `--failed`
rerun): `E2E-DEBUG-01` fails at
`runtime-debugger.spec.ts:56` with the node present but `hidden` — the exact
signature already observed at PAL-FED-0 base on this Windows host.

**Proof this batch did not cause it:** everything the browser E2E exercises is
byte-identical between PAL-FED-0 and PAL-FED-0D:

```
dist/web (all files)                    27bc76ba…a3ccc  (both branches)
dist/src excluding federation/          9e889ee7…aef785  (both branches)
```

The only server-code change is inside `src/federation/`, which the e2e kernel
never imports. The failure therefore comes from the pre-existing
`runtime-debugger` timing defect (a React Flow node that stays
`visibility:hidden` under certain scheduling), which the heavier PAL-FED-0D
install may make more likely on the runner. It is reported, not masked:
no retry was added, and the flake is not attributed to PAL-FED-0D.

## 7. Stop conditions (§50)

```
real DSH runtime audited/pinned ......................... ✅ 0.1.5-rc.1
frozen PAL-FED DSH plugin runtime built ................. ✅ build-id + SHA-256
palimpsest.main runs as a DSH Agent ..................... ✅
ordarium.main runs as a DSH Agent ....................... ✅
both use independent DSH Sessions/workspaces ............ ✅
collaboration tools are DSH Agent-scoped ................ ✅
peer identity cannot be spoofed ......................... ✅ (unchanged PAL-FED-0 + strict tools)
DSH invocation provenance is retained ................... ✅ identity.source="dsh"
new peer input can wake the receiving DSH Agent ......... ✅ watcher → followup
wake does not ack ....................................... ✅
pending batch survives crash/resume ..................... ✅
bidirectional peer collaboration works .................. ✅
no central manager exists ............................... ✅
real two-Main dogfood executed .......................... ✅ (with the initiation caveat)
evidence recorded ....................................... ✅
```

Not started (per §50): dynamic discovery, N-project federation, collaboration
graph, ProjectCell/Holon, new Ordarium change-feed APIs, G10 implementation.

## 8. Primary residual

Autonomous **initiation** was not demonstrated: with an open prompt P chose not
to contact the peer, and a directive operator instruction was required to start
the exchange. Everything after initiation was autonomous and bilateral. This is
the concrete question for the next iteration (prompt/operating-guide tuning vs.
an explicit initiation policy), and it is deliberately not "solved" here.
