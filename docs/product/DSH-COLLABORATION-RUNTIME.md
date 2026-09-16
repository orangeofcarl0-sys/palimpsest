# DSH collaboration runtime

Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (Palimpsest product track).
Baseline: `a36d37b` (canonical main after UX-B).
Audience: a host integrator wiring the first-party Palimpsest DSH bundle (`host/dsh/**`).

Product promise: `docs/product/ZERO-CONFIG-COLLABORATION.md`. Readiness contract:
`docs/engineering/audits/UX-C-HOST-RUNTIME-READINESS.md`. Branch ownership evidence:
`docs/engineering/audits/UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`.

---

## 1. The packaged bundle is derived from the deployment profile

The deployment profile is the only per-project configuration. Reasoning composition is
controlled by one additive field:

```jsonc
{
  "schemaVersion": 1,
  "reasoning": {},          // present ⇒ packaged local-collaboration bundle
  // "reasoning": { "storePath": "..." }   // OPTIONAL single advanced override
  "projectDirectory": [ /* present ⇒ cross-project face */ ]
}
```

`ProjectAgentDeploymentProfile.reasoning` is optional and additive
(`src/deployment/profile.ts:130-140`); its strict parser accepts **only** `storePath`
(`src/deployment/profile.ts:305-318`), so a semantic/authority field such as
`enabled`/`branchPort`/`policy` fails closed as an unknown field. There is no
`autonomy`/`everything` switch (`SPEC-PROMPT-UX-C.md` §44).

When `reasoning` is present, `launchDeployment` composes, in one place:

| Component | Source |
| --- | --- |
| the deployment-owned durable ReasoningCell store | `join(dirname(profile.databases.orchestration), "reasoning.sqlite")` unless the one override names a path (`src/deployment/reasoning_bundle.ts:150-152`; `src/deployment/launch.ts:308-311`) |
| the first-party exploratory verification policy | `firstPartyExploratoryVerificationPolicy()` (`src/deployment/launch.ts:429`) |
| the first-party exploratory admission policy | `firstPartyExploratoryAdmissionPolicy()` (`src/deployment/launch.ts:430`) |
| the ephemeral branch execution port | the **host**, via `DeploymentHostServices.branchExecution` (`src/deployment/launch.ts:313`, `:432`) |

Ownership is explicit. The launcher creates the store and closes it in `close()`
(`src/deployment/launch.ts:529-533`) and exposes that as `Deployment.reasoning.storeOwned`
(`:516-520`), and it deliberately does **not** pass `reasoningCellStoreOwned` to
`installPalimpsest`, so the install never closes a store it did not create
(`src/install.ts:374`, `:2455`). A caller-supplied store passed straight to the expert
`installPalimpsest` API keeps its own lifetime unless the caller sets
`reasoningCellStoreOwned: true`.

The two policies are EXPLORATORY by construction and **bound to the recipe's own policy
refs**. Any other cell policy ref is refused / unresolved rather than silently admitted
(`src/deployment/reasoning_bundle.ts:66-143`).

---

## 2. The branch environment: what it is, and what it is not

The host constructs the ephemeral branch port from knowledge it already has — its own
DSH bin and the profile name — with no per-branch user configuration
(`host/dsh/lib/index.js:77-92`):

```js
palimpsest.dshSubprocessBranchExecutionPort({ dshBin, profile, workDir });
```

`node <dsh bin> --profile <p> --branch <brief.json>` composes **only** the minimal branch
environment (`src/deployment/branch_host.ts`). Mode is dispatched **before** any
deployment composition (`host/dsh/lib/index.js:134-138`), so a branch never launches the
durable project stack.

```text
in : one frozen ReasoningBranchBrief
     (optionally wrapped with the selector-only evidence allowlist)
        ↓
ephemeral DSH branch process
        ↓
ONE strict tool: palimpsest_branch_result { statement, evidenceRefs? }
        ↓
branch process exits
        ↓
ReasoningBranchExecutionPort returns the result
        ↓
EXISTING RecipeExecution submits/evaluates the candidate
```

**Is:** exactly one host-private tool (`toolNames === ["palimpsest_branch_result"]`) and
`principalTools: []` (`src/deployment/branch_host.ts:289-304`, `:271-279`); a strict
parser that refuses a second result, an off-allowlist citation and unknown arguments
(`:201-228`); no store, no authority, no identity.

**Is not:** a principal. It composes no deployment, no ReasoningCell service, no
federation, no transport, no pump, no attention, no workspace/management, no
proof/publication/disclosure, no external assets, no monitor and no cross-project
surface. The capability boundary is the **registered tool set**, not a prompt line
(`SPEC-PROMPT-UX-C.md` §17). The branch's prompt text tells the model what to do; the
load-bearing fact is that no other tool exists to call.

The branch creates no `PeerRef`, no `PersistentPoint` and no durable session, and it
**cannot** own candidate submission: `RecipeExecution` is the sole submit/evaluate owner
(`src/recipes/execution.ts:286-305`).

---

## 3. The readiness view

`Deployment.collaborationReadiness()` returns a derived, **non-authoritative**
`HostCollaborationReadiness` (`src/deployment/readiness.ts:24-68`). It is a plain
statement about what is composed in this process:

| Field | Values | Meaning (and what it does NOT claim) |
| --- | --- | --- |
| `advisor` | `AVAILABLE` \| `DEGRADED` | a memoryless advisor is still an advisor; `DEGRADED` means none is composed |
| `localExplore` | `AVAILABLE` \| `UNAVAILABLE` | a store **and** a branch adapter both exist |
| `branchAdapter` | `string \| undefined` | the host-supplied adapter id, when composed |
| `reasoningStore` | `CONFIGURED` \| `ABSENT` | the packaged bundle was requested |
| `projectVerification` | `AVAILABLE` \| `UNAVAILABLE` | a verification runtime is reachable |
| `crossProject` | `AVAILABLE` \| `UNAVAILABLE` | a `projectDirectory` face is composed |
| `inboundPump` | `CONFIGURED` \| `ABSENT` | the deployment owns a pump |
| `attention` | `PULL` \| `ACTIVE` \| `ABSENT` | `PULL` = derives signals but no host wake is bound |
| `coldResume` | `AVAILABLE` \| `UNAVAILABLE` | the bound activation can cold-resume a persisted principal |

There is deliberately **no numeric score and no health truth**. "Wired" never means
"exercised". `ACTIVE` is reserved for a real host wake (a `dsh-agents`/`pi-host`
adapter); the null, unbound and unavailable adapters all report `PULL` so the view never
overstates what will happen (`src/deployment/launch.ts:481-487`).

---

## 4. `PALIMPSEST_HOST_READY`

On startup the shipped runner prints one machine-readable line so an integration test can
prove the **shipped** host composed the collaboration surface (`host/dsh/lib/runner.js:238-254`):

```text
PALIMPSEST_HOST_READY {
  sessionId, mode,
  localPeer, persistentPoint,
  transportAdapter,
  attentionAdapter, attentionFormat: "product (cross-project formatter + default)",
  application: "full" | "none",
  collaboration: HostCollaborationReadiness,
  toolNames, url, token
}
```

It now proves: a collaboration surface, an Advisor, local Explore capability, a branch
adapter, a cross-project surface when configured, a pump, attention, and a
resume-capable activation — without printing credentials beyond the existing local serve
token and without printing any private project content.

---

## 5. What a host integrator must still supply

The bundle derives the reasoning store, the policies and the branch port. Three things
remain the host's responsibility:

1. **A session binding** — the persisted principal session id. It is created or
   **cold-resumed** by the host at runtime and is never carried in the profile as a
   `PeerRef` (`host/dsh/lib/runner.js:180-188`, `:214-230`). A profile may omit
   `attention.sessionId` for `activation: "dsh"`; the host binds the real adapter through
   `Deployment.bindAttentionActivation` (`src/deployment/launch.ts:489-495`).
2. **The real `agents` service for resume** — `dshAgentsAttentionAdapter` accepts
   `{ get?, resume? }`; the shipped runner wires the real resume-capable service so
   `get() → undefined` triggers `resume()` and queues a `followup`
   (`host/dsh/lib/runner.js:214-230`). Without it, only the live-session path is
   reachable.
3. **`projectDirectory`** — the read-only project↔peer bindings. Without it there is no
   cross-project face at all (absent, never stubbed).

Because the deployment owns the lifecycle, the host's only loop responsibility is
**mechanical scheduling** of `deployment.pumpAndActivate()` (`host/dsh/lib/runner.js:300-321`).
The runner does not re-implement pump → drain → activate → mark; it binds the session,
then schedules the one lifecycle owner (`SPEC-PROMPT-UX-C.md` §24).

---

## 6. Honest limit: in-process lifecycle vs a live principal turn

HONEST: the packaged proofs drive the deployment lifecycle **in-process**. The local
dogfood really spawns ephemeral DSH subprocesses for every branch
(`scripts/interaction/uxc-dsh-local-dogfood.mjs:136-146`), and the cross-project dogfood
really ingests, pumps, activates and cold-resumes (`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:261-308`). But neither harness spawns a **live model-driven principal
turn** through the shipped runner: the runner's own scheduling is proven structurally
(suite reads its source) and via the cold-resume section, not by launching the full DSH
principal process. So "the shipped runner would wake the principal" is proven for its
wiring and its loop, not by a recorded live principal conversation. A live-principal
packaged proof is recorded as new carry-forward work.

A second honest boundary: `PALIMPSEST_HOST_READY` reports **composed capabilities**, not
observed work. `collaboration.attention: "PULL"` on a profile that did not bind a host
wake is the correct, non-overstated reading.
