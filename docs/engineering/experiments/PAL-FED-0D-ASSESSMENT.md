# PAL-FED-0D Assessment (§3/§4/§11/§67)

Status: EXPERIMENTAL. Branch `experiment/pal-fed-0-dsh`, base `experiment/pal-fed-0`
(`2c7a63c`). Audit performed against the **actually installed** DSH, not guessed
APIs.

## 1. Audited runtime (recorded exactly)

```
DSH package:      @deepseek-ai/dsh@0.1.5-rc.1   (global npm install)
DSH source:       deepseek-ai/deepseek-harness  (apps/cli + packages/*)
Node:             v24.14.1
DSH_HOME:         ~/.dsh  (symlink -> D:\dsh)
Profiles:         default, headless, web, tui (DSH-managed)
Agent API:        @deepseek-ai/dsh-agent@0.1.5-rc.1
Session API:      @deepseek-ai/dsh-session@0.1.5-rc.1
Loop/driver:      @deepseek-ai/dsh-agent-loop@0.1.5-rc.1
Tools:            @deepseek-ai/dsh-tools@0.1.5-rc.1
LLM adapters:     @deepseek-ai/dsh-llm@0.1.5-rc.1
Prompt sections:  @deepseek-ai/dsh-system-prompt@0.1.5-rc.1
Scope:            @deepseek-ai/dsh-scope@0.1.5-rc.1
Plugin runtime:   @deepseek-ai/cordis@4.0.2
Minimal host:     @deepseek-ai/dsh-sdk-minimal@0.1.5-rc.1
Boot:             @deepseek-ai/dsh-app-boot@0.1.5-rc.1
HOST_CONTRACT_VERSION (Ordarium): 1; Ordarium pinned 1.3.1; SQLite schema v4
```

All of the above were verified as installable from the public registry at the
exact version (`npm view @deepseek-ai/dsh-<pkg>@0.1.5-rc.1 version`).

## 2. Real DSH API surface used

| Component | Real API (verified by execution) |
|---|---|
| Registry | `ctx.agents` (`AgentRegistry`): `create`, `resume`, `get`, `list`, `roots`, `isOwnedBy` |
| Agent handle | `AgentHandle { agent, dispose() }` |
| Live agent | `ReactLoopAgent`: `id`, `session`, `inbox`, `ctx`, `status`, `followup`, `steer`, `inject`, `whenIdle` |
| Scoped world | `AgentSetup = (agentCtx, agent) => …`, run unpublished before publication |
| Tools | `ctx.tools.register(ToolDefinition)` — global or in the **calling agent scope**; `defineTool` |
| Tool call context | `ToolRunContext`: `callId`, `rootCallId`, `agent`, `signal`, `deferContext`, `concludeTurn` |
| Prompt sections | `ctx.systemPrompt.section({ name, order, text })` — scoped to the calling context |
| Model | `ctx.llm.registerAdapter(providers, adapter)`; `LlmAdapter.stream(GenerateOptions)` |
| Events | `agent/created`, `agent/disposed`, `agent/status` |
| Boot | `boot(binName, cordis.yml, patchLayers, prepare?, bareModuleBaseUrl?)` |
| Profile | `$DSH_HOME/profiles/<name>/{package.json(dsh.profile.bundles), cordis.yml, cordis.patch.yml}` |

Spike evidence: a real tree boots in-process, `ctx.agents.create` publishes an
agent with a live session and a working `followup`; a `file://` plugin row
mounts a custom plugin; a custom `LlmAdapter` drives real turns.

## 3. Existing Palimpsest structural DSH types are not the integration path

`src/tools/dsh_types.ts` (`DshPluginContext`/`DshToolDefinition`/
`DshToolRunContext`) is a **structural stand-in** and does not match the current
official package shapes (e.g. real tools take `parameters: ParameterSchemaSpec`
+ `output.schema`, and run contexts carry `rootCallId`/`deferContext`). Per §11
the experiment does **not** migrate the historical Palimpsest DSH surface; the
new integration uses the official packages directly, and the old structural
types are left untouched.

## 4. Chosen integration path (§10/§13)

**Direct DSH plugin composition** (not MCP): a cordis plugin
(`pal-fed-collab`) mounted by a profile patch that:

1. opens the PAL-FED service against the frozen substrate;
2. **creates or resumes the peer's root DSH Agent** through `ctx.agents`
   (stable session id, the peer's own worktree), with `setup(agentCtx, agent)`
   composing its scoped world;
3. registers the six collaboration tools and the operating guidance into that
   agent's scope;
4. runs the deterministic watcher that calls `agent.followup` on a new pending
   batch.

The custom MCP adapter (`src/federation/mcp.ts`) is **retained** as protocol
test harness / debug fallback and comparison surface (§12/§48); it is not the
dogfood host.

`mode:"owned"` (plugin owns the peer agent) was chosen over attaching to
host-created sessions because it makes the trusted `selfPeer` binding and the
stable session identity deterministic, and because `setup()` is DSH's one
supported composition call site.

## 5. Identity layers (frozen, §6/§51)

```
PeerRef          persistent project identity     palimpsest.main / ordarium.main
Dsh Agent/Session runtime carrier                pal-fed-p-main / sess-…
callId/rootCallId tool-call provenance           from the real DSH ToolRunContext
```

Ordarium writes now carry `InvocationIdentity { source:"dsh", scope:<sessionId>,
callId, rootCallId, actor:<PeerRef>, lineage:["pal-fed-0d","fabric:<id>"] }` when
the write came from a DSH tool call, while the durable author field stays the
configured `PeerRef`. `PeerRef != DshSessionId != callId`.

## 6. Places this could have become the wrong thing (prohibited)

| Risk | Prevention |
|---|---|
| Second scheduler / manager | The watcher only observes, materializes the pending batch and wakes; no LLM, no routing, no prioritization (§23). |
| Subagent inheriting peer authority | Tools/guidance are registered in the peer agent's scope only; a subagent sees neither (machine-asserted, §31/§9). |
| DSH session as collaboration truth | Wake notices are attention only; the coordination DB → pending batch → notice direction is one-way (§38). |
| Wake becoming an ack | `followup` never touches cursors; only the agent's `collab_ack` does (§20). |
| Plugin driving the model | The plugin has no model loop; it injects into the DSH inbox and lets the DSH driver run (§5/§51). |
| Control plane inside the worktree | Both hosts load the frozen artifact outside both worktrees (§27). |

## 7. Residuals / limitations

- The watcher polls (`watchIntervalMs`, default 2s, bounded 200ms–60s) because
  Ordarium deliberately has no blocking change observation (§22).
- A deterministic adapter (`pal-fed-deterministic-llm`) exists for machine
  tests and is a real `LlmAdapter`, not a fake agent; it is not used for the
  real dogfood.
- DSH is developer-preview; this binds to `0.1.5-rc.1` exactly.
