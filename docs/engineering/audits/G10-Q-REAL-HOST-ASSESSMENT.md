# G10-Q Real-Host Assessment (Q0)

Baseline: `main @ d16a7d7c6ae67d7930fe662c7c777941481a31c3`. Ordarium v1.3.1.
This audits the ACTUAL installed host versions and public APIs before any host integration change —
not the G10-P structural typings.

## Installed hosts

| Host | Version / location | Runnable here |
| --- | --- | --- |
| DSH | `dsh` 0.1.5-rc.2 (`~/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh`) | **yes** — a real model-backed headless run completed |
| Pi (`oh-my-pi`) | `pi` on PATH; source under `F:/Codex_Work_Space/PiDeckPlus/.audit-oh-my-pi` | not exercised (extension API needs the Pi host app) |

Model credentials are configured in the DSH home; a live headless run answered a prompt. **No
secrets, tokens, or provider identifiers are recorded in this campaign.**

## DSH API facts (verified against installed source)

- **Launcher** `dsh [--profile <name>] [--patch <path>] …` boots a plugin-bundle profile and hands
  remaining args to the profile's app. `dsh --profile web|tui|headless|…`.
- **Plugin contract** (cordis): a module exports `name`, `inject` (services), optional `Config`
  (schemastery), and `apply(ctx, config)`. A package declares itself a bundle via
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; a profile lists bundles in
  `dsh.profile.bundles` and overrides rows by id in its own `cordis.patch.yml`.
- **Tool registration**: `ctx.tools.register(definition)` where `ToolDefinition` =
  `{ name, description, parameters, output: { schema, render }, execute(args, exec) }`
  (+ optional `timeoutMs`, `isConcurrencySafe`, `presentCall`, `presentResult`). Tools registered on
  the root context are **global** and visible to the task agent. `inject: ["tools"]` is required.
- **Agent/session**: `ctx.agents.create({ sessionId, meta, agentOptions, setup })` and
  `ctx.agents.resume({ resumeSessionId, agentOptions, setup })` → `{ agent, dispose }`.
  `agent.followup(message: UserMessage)` queues a turn and wakes the driver; `agent.whenIdle()`
  awaits quiescence; `ctx.sessions.flush(session)` persists. A `setup` callback must return
  `undefined` or a `.commit()` handle (the loop calls `setup?.(...)?.commit()`).
- **Persistence**: `dsh-session-persistence-jsonl` under `$DSH_HOME/sessions`. Resume requires a
  persistence backend; it is mounted by `dsh-base`.

## The decisive host gap

The shipped **headless** app (`@deepseek-ai/dsh-headless`) is one-shot: it always
`agents.create`s a **fresh** session id, never prints the session id, declares no `--resume`, and
exits after one task. So it cannot cold-resume a persistent principal. G10-P's
`dshAgentsAttentionAdapter` is therefore *structurally* right but unusable against the shipped
headless surface.

**Resolution (this campaign):** a real DSH bundle `host/dsh` (`palimpsest-dsh-host`) with three
plugins — `startup` (parses `[message...]`, `--resume <sessionId>`, `--session-file`, `--once`),
`tools` (mounts the Palimpsest deployment from a typed profile and registers the `palimpsest_*`
tools into the REAL registry), and `runner` (create-or-resume a persistent principal, then run an
attention loop that wakes the SAME agent through the real Palimpsest host activation adapter).

## Contract-zero observation

Palimpsest's structural `DshToolDefinition` already matches the real `ToolDefinition` (name,
description, parameters, `output.{schema,render}`, `execute`, `timeoutMs`, `isConcurrencySafe`), as
the G9-era note predicted. The host bundle only relaxes `output.schema` to `{}` because the real
registry validates the returned value and Palimpsest tools legitimately return arrays. **No change
to Palimpsest's tool contract was needed.**

## Chosen primary host

**DSH** (spec §18 default: Palimpsest is a DSH plugin; persistent sessions, cold resume, tool
registration, per-process launch, observable completion are all available once the bundle above
exists). Pi keeps an **adapter conformance** path only; it is not the golden dogfood host.

## Production-path assertion

A real `dsh` run printed, and the bundle asserts at startup:
```
transport adapter = ordarium-durable
attention adapter = dsh-agents (in-process real agent service)
application       = full
localPeer         = peer-palimpsest
persistentPoint   = pp-palimpsest
toolNames         = 15 (9 Work + palimpsest_surfaces/attention/federation/boundary/runtime_view/graph)
```
The smoke run proved real tool-mediated cognition: the LLM called `palimpsest_surfaces` and
`palimpsest_federation` and reported `federation=true, commitments=0`. No test fake transport,
in-process boundary bridge, or recording/null adapter was on the production path.
