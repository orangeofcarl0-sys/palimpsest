# UX-B — Cross-project host integration note

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` §33 (the attention path), §34 (no second activation
system), §35 (the inbound pump), §42 (directory adapters), §61 (host adaptation).
Audit constraints: SC-2 (no automatic pumping), SC-3 (the attention surface
exposes only `policyId` + `pending()`), SC-9 (the launcher now passes peers).
Delivery: `docs/engineering/audits/UX-B-DELIVERY.md`.
Carry-forward: `docs/engineering/audits/UX-B-CARRY-FORWARD.md` §2.1–§2.3.

This document is for the owner of a DSH or Pi host. It states the **minimum** a
host must do for the cross-project promise to be true, and — because the seam is
host-owned — the three things the shipped runner does **not** yet do.

The promise is:

```text
a user asks once
→ the remote project's principal is resumed
→ it answers later
→ the asking project's principal is resumed
→ the answer is surfaced, with no second user request
```

Steps 3 and 5 do **not** happen by themselves. `launchDeployment` composes the
services and starts nothing (audit SC-2; the CLI pumps only with `--pump <ms>`).
The pieces of the path that require a live host are exactly: **pump → drain →
activate**, plus the profile wiring that makes a project addressable at all.

---

## 1. Configure the profile

Three additions to a `DeploymentProfile` make cross-project work possible. All
three are additive: absent `projectDirectory`, `application.crossProject` is
absent, the tool is absent and the HTTP routes answer `501 surface_absent` — never
a stub.

| Profile field | What it does | Where |
| --- | --- | --- |
| `projectDirectory[]` | the read-only project↔peer bindings: `{ projectId, displayName?, aliases[], peerId, competenceTags[] }`. Supplying it composes `application.crossProject` **and** makes the named peers the deployment's `knownIndependentPeers` for the advisor (SC-9) | declared `src/deployment/profile.ts:93-99`; parsed strictly and fail-closed at `:192-231`; consumed at `src/deployment/launch.ts:164-183`, `:278`, `:282-285` |
| `databases.projectJournal` / `databases.projectAssociations` | the Palimpsest-owned project histories; two installations may point at the **same physical files** and each opens its own handle | `src/deployment/profile.ts:85-87` |
| `attention` | `{ policyId, cooldownMs, activation }`; `activation: "none"` means pull mode only (the host reads the signals itself). `launchDeployment` turns the profile's choice into a first-party adapter, or `unavailableActivation` when the profile asks for a host adapter and none was supplied | interface `src/deployment/profile.ts:43-48`; profile field `:100`; choice `src/deployment/launch.ts:251-258`, wired `:350` |

### 1.1 A code-shaped example: two projects, one transport ledger, shared files

Mirrors the dogfood's `profileFor(...)`
(`scripts/interaction/uxb-two-project-dogfood.mjs:92-123`), reduced to the fields
that matter:

```js
import { launchDeployment } from "./dist/src/deployment/index.js";

const transportPath = "/var/lib/palimpsest/shared/transport.sqlite";
const shared = {
  journal: "/var/lib/palimpsest/shared/project-journal.sqlite",
  associations: "/var/lib/palimpsest/shared/project-assets.sqlite",
};

function profileFor({ who, projectId, peerId, otherPeerId, otherProject }) {
  const dir = `/var/lib/palimpsest/${who}`;
  return {
    schemaVersion: 1,
    profileId: `deploy-${who}`,
    projectId,
    localPeer: peerId,
    persistentPoint: `pp-${who}`,

    // ONE shared durable transport ledger: both mailboxes live in one substrate,
    // each side opening its own handle.
    transport: { namespace: "palimpsest", databasePath: transportPath },

    databases: {
      // everything else is PER-INSTALLATION...
      orchestration: `${dir}/palimpsest.sqlite`,
      ordarium: `${dir}/ops.sqlite`,
      coordination: `${dir}/coordination.sqlite`,
      transportCursors: `${dir}/cursors.sqlite`,
      boundaryMemory: `${dir}/boundary.sqlite`,
      runtimeScope: `${dir}/runtime.sqlite`,
      attentionMarks: `${dir}/attention.sqlite`,
      // ...except the two Project Workspace histories, which are SHARED FILES with a
      // SEPARATE HANDLE PER INSTALLATION (never one store instance handed to two).
      projectJournal: shared.journal,
      projectAssociations: shared.associations,
    },

    // Pre-existing discovery hints: peer identity only, no project dimension.
    directory: [{ peerId: otherPeerId, competenceTags: [] }],

    // UX-B: the project<->peer bindings. `displayName` should be the BARE name so
    // the user-facing copy reads "the Optics project" (see CF-UXB-08).
    projectDirectory: [
      { projectId,         displayName: who,             aliases: [who],  peerId,        competenceTags: [] },
      { projectId: otherProject, displayName: otherProject, aliases: [], peerId: otherPeerId, competenceTags: [] },
    ],

    // Pull mode: THIS host drains and activates (see §3), so no first-party
    // activation adapter is constructed by the launcher.
    attention: { policyId: "host-attention-v1", cooldownMs: 0, activation: "none" },
  };
}

const optics = launchDeployment(profileFor({
  who: "optics", projectId: "optics", peerId: "peer-optics",
  otherPeerId: "peer-detector", otherProject: "detector",
}));
const detector = launchDeployment(profileFor({
  who: "detector", projectId: "detector", peerId: "peer-detector",
  otherPeerId: "peer-optics", otherProject: "optics",
}));
```

Warnings that matter in production:

- **Never hand one store instance to two installations.** `dispose()` closes a
  supplied association/journal store and `Deployment.close()` closes the
  coordination, boundary, runtime-scope, transport, cursor and marks handles
  (audit SC-16). Give each installation its own handle over a shared *path*.
- **`displayName` should not itself be a phrase.** `projectPhrase` wraps the name
  as `the <name> project`, so `"the optics project"` renders
  `"Asked the the optics project project."` Use `"Optics"` (`CF-UXB-08`).
- **A directory that cannot be observed is not an empty directory.** Supply
  `unknownProjectPeerDirectory(detail)` (or a host adapter that reports `unknown`)
  rather than omitting the field when you cannot read your registry; omitting it
  makes the whole face absent, and claiming `known` with an empty set makes a claim
  the host cannot support.

A DSH host that adapts its own project/session registry implements the same port:
`{ observeProjects(): Promise<ObservationKnowledge<readonly ProjectPeerDescriptor[]>> }`
(`src/interaction/project_peer_directory.ts:187-190`). Do **not** build a second
canonical directory store (§42).

## 2. Drive the EXISTING pump

There is no new scheduler and there must not be one (§34). The inbound pump already
exists and only a host runs it:

| Existing path | When to use it |
| --- | --- |
| `Deployment.pumpAndActivate()` | the simplest correct host loop: it pumps once, drains Attention, and runs the deployment's own activation adapter, marking delivered what activated (`src/deployment/launch.ts:363-379`) |
| `deployment.pump.pumpOnce()` + your own drain/activate | if the host already owns an attention loop and a custom adapter — this is what the shipped DSH runner does (`host/dsh/lib/runner.js:340-363`) |

```js
// Option A — the whole mechanical path in one call, on your tick.
const report = await deployment.pumpAndActivate();
// → { pump: { ingested, … }, signals: AttentionSignal[], activations: […] }

// Option B — you own the loop (a host that must interleave other work).
await deployment.pump.pumpOnce();
const signals = await deployment.installed.attention.drain();
for (const signal of signals) {
  const outcome = await activation.activate(signal);
  if (outcome.activated) await deployment.installed.attention.markDelivered([signal.signalId]);
}
```

```text
the user must never manually pump a mailbox
```

Note what `pumpAndActivate` does **not** do: it never sends an Ask. It only
ingests, derives Attention and activates. The one place an Ask leaves the
installation is `application.crossProject.ask(...)`, and only under an explicit
cross-project intent (§27; UXB-N28).

## 3. Keep `drain()` and `markDelivered()` host-side (SC-3)

The application-level Attention surface is deliberately read-only:

```ts
interface AttentionApplicationSurface {
  readonly policyId: string;
  pending(): Promise<readonly AttentionSignal[]>;   // observability only
}
```

`src/application/surface.ts:220-224`. `drain()` and `markDelivered()` live on
`InstalledPalimpsest.attention` (`src/install.ts`), i.e. below the product surface,
and they are **the host's to call**. Consequences:

- Do not look for a `drain` on `application.attention`; it is not there and will
  not be added (`SPEC-PROMPT-UX-B.md` §4/§34; audit SC-3).
- Draining is what "consumes" a signal for the host; the inbox itself remains the
  truth path, so a host that never drains does not lose the cross-project message —
  it loses the *wake-up*.
- `markDelivered` is for the signals your adapter really activated. Marking a
  signal delivered without acting on it is a silent drop.

## 4. Pass the cross-project instruction text to the adapter

`dshAgentsAttentionAdapter` and `piAttentionAdapter` both accept an optional
`format: (signal) => string` (`src/attention/host_adapter.ts:83-88`, `:89`), and
`crossProjectAttentionText(signal, role)` is the cross-project formatter
(`src/interaction/cross_project_host_adapter.ts:65-74`).

```js
import { crossProjectAttentionText } from "./dist/src/interaction/index.js";

const activation = palimpsest.dshAgentsAttentionAdapter({
  agents: { get: () => ({ followup: (text) => agent.followup(text) }) },
  resumeSessionId: sessionId,
  // The woken principal is told to go and LOOK at the pending cross-project work
  // through the product tool. The text carries NO message content: the signal has
  // none (SC-21), and the formatter imports no store.
  format: (signal) => crossProjectAttentionText(signal, "either"),
});
```

Why the formatter and not the raw signal: the `AttentionSignal` for an inbound peer
message carries `subjects: [{ kind: "peer_message", id }]` and **no body**
(SC-21). The instruction therefore cannot tell the principal what was asked — it
tells it to inspect `palimpsest_cross_project` (`action: "pending"` for a request
addressed to this project; `action: "status"`/`"receive"` for an answer to a
question this project asked). Pick the `role` argument, passing
`"request"` or `"answer"` when your host already knows the direction (e.g. it
called `pending()` first); the default `"either"` states both honestly.

### 4.1 HONEST: the shipped DSH runner does not do this yet

The shipped runner constructs its adapter **without** `format`
(`host/dsh/lib/runner.js:331-341`), so a woken principal currently receives the
default attention text, not the cross-project instruction. `grep -rn
"crossProject\|cross_project" host/` returns nothing. The formatter is shipped,
exported, unit-tested and proven content-free; the wiring is a host decision.
Carried as `CF-UXB-02`.

### 4.2 HONEST: the shipped runner passes no `resume`

The same runner passes `agents: { get: … }` and no `resume`
(`host/dsh/lib/runner.js:335-338`), so the adapter's cold-resume branch
(`src/attention/host_adapter.ts:101-104`) is unreachable there: the only cold
resume happens at process start. For a project that may be cold when another
project asks it a question, supply `resume`:

```js
agents: {
  get: () => liveAgent,                                  // if resident
  resume: async ({ resumeSessionId }) => ctx.agents.resume(resumeSessionId),  // if cold
}
```

Carried as `CF-UXB-03`.

## 5. The host's two directions

| Direction | What wakes the host | What the principal must do | Which face |
| --- | --- | --- | --- |
| an inbound **request** (this project is being asked) | `inbound_peer_message` | inspect `pending()`, then answer with `respond(requestId, {status, answer})` — or `respond(requestId, {compose: {task, intent: "FOCUS"}})` to answer using this project's own local collaboration | `palimpsest_cross_project` action `pending` / `respond` |
| an inbound **answer** (a project this one asked replied) | `inbound_peer_message` | `status(requestId)` to read it, `receive(requestId)` to surface the terminal answer and mark **that** message processed | `palimpsest_cross_project` action `status` / `receive` |

Both directions emit the same signal kind, which is why the default cross-project
role is `"either"`.

The host should not invent a third mechanism:

```text
no CrossProjectWakeStore        no ProjectAgentScheduler      no RemoteAgentManager
reuse Attention + host activation (§34)
```

## 6. Checklist

```text
[ ] profile.projectDirectory lists every reachable project, with BARE displayNames
[ ] profile.directory (peer hints) and projectDirectory agree about peer ids
[ ] shared Journal/AssetAssociation paths are shared by PATH, never by store instance
[ ] databases.* per-installation for orchestration/ordarium/coordination/cursors/marks
[ ] the host loop calls pumpOnce() (or pumpAndActivate()) on its own tick
[ ] the host drains Attention and markDelivered()s what it really activated
[ ] the adapter receives format: (signal) => crossProjectAttentionText(signal, role)
[ ] the adapter receives resume() if a cold principal must be woken by a peer message
[ ] the host treats a throw from pending() as "directory not readable", NOT as "no requests"
[ ] nothing in the host sends an Ask except an explicit cross-project user intent
```

## 7. What the host does NOT need to do

- **No PeerRef management.** The user names a project; the directory binds it. The
  host should never surface a `peerId` as project identity
  (`src/interaction/cross_project_result.ts:188-195`).
- **No thread management.** The thread id is derived from the request id
  (`src/interaction/cross_project_protocol.ts:478`).
- **No polling of the remote project.** `status()` is a read; the wake-up comes
  from Attention. `WAITING` is a normal state, not a retry condition
  (`SPEC-PROMPT-UX-B.md` §19).
- **No context assembly.** The packet is the task plus explicitly supplied
  `contextText`. A host that helpfully pre-packs a workspace dump would break §24
  and §47 — the exact firewall the rig's raw-envelope check defends.
- **No new store, table or scheduler.** If a host finds itself building one, the
  design is wrong (§34/§69).
