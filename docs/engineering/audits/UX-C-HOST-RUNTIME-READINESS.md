# UX-C — Host-runtime readiness contract

Baseline: `a36d37b` (canonical main after UX-B).
Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (product track).
Spec: `SPEC-PROMPT-UX-C.md` §30 (the readiness view), §31 (`PALIMPSEST_HOST_READY`),
§32 (zero-config means zero hidden work), §44 (no "enable everything" switch).
Code: `src/deployment/readiness.ts`, `src/deployment/launch.ts`, `host/dsh/lib/runner.js`.

---

## 1. The rule: derived, non-authoritative, no score

`Deployment.collaborationReadiness()` returns a pure derivation — no store is read and
nothing is executed (`src/deployment/readiness.ts:52-68`). It is deliberately **not**
health, **not** authority, **not** a scheduler truth and **not** a score:

```text
Readiness != Health        Readiness != Authority        Readiness != a score
```

Every field states only whether a capability is **composed in this process**. The suite
asserts the serialized view contains neither `score` nor `health`
(`test/uxc_host_runtime.test.ts:740-744`), and there is no numeric field to compute one
from. "Wired" never means "exercised": §32 is a separate, stronger claim, and the view
does not make it.

## 2. Every field

| Field | Values | What the state means | What it does NOT claim |
| --- | --- | --- | --- |
| `advisor` | `AVAILABLE` | an Advisor is composed (with or without empirical memory) | that any recommendation was produced, or that it has empirical support |
| | `DEGRADED` | no Advisor is composed | that AUTO is broken — a collaboration service composed without an advisor honestly falls back to FOCUS |
| `localExplore` | `AVAILABLE` | BOTH a reasoning store and a branch adapter exist | that a cell was opened or a branch ran |
| | `UNAVAILABLE` | at least one of the two is absent | that Explore is impossible by other means |
| `branchAdapter` | a string | the host-supplied ephemeral branch adapter id | a branch capability of any specific power; only that an adapter is composed |
| | `undefined` | no branch adapter is composed | an error — a deployment without the reasoning bundle may legitimately have none |
| `reasoningStore` | `CONFIGURED` | the packaged bundle was requested and a store was created | that the store holds any data or was written to |
| | `ABSENT` | no packaged reasoning bundle was requested | that reasoning is impossible — an expert API caller may supply its own |
| `projectVerification` | `AVAILABLE` | a verification runtime/registry is reachable | that any verification ran, or that its result is independent |
| | `UNAVAILABLE` | no verification runtime is reachable | that CHECK is meaningless — it is simply not available |
| `crossProject` | `AVAILABLE` | a `projectDirectory` cross-project face is composed | that a peer is reachable, or that any message was sent |
| | `UNAVAILABLE` | no `projectDirectory` (or the face is otherwise absent) | that other projects do not exist — only that this deployment has no face |
| `inboundPump` | `CONFIGURED` | the deployment owns a pump | that the pump has ticked, ingested anything or advanced its cursor |
| | `ABSENT` | no pump is composed | that inbound mail is lost — there is simply no local pump here |
| `attention` | `PULL` | attention derives signals, but **no host wake is bound** | that the principal is idle by choice — pull mode may be explicit (`activation: "none"`) or simply unbound |
| | `ACTIVE` | a real host wake is bound (`dsh-agents` or `pi-host`) | that a signal has been delivered; only that delivery is possible |
| | `ABSENT` | no Attention service is composed | that signals are meaningless — only that none are derived here |
| `coldResume` | `AVAILABLE` | the bound activation can cold-resume a persisted principal | that a cold session currently exists to resume |
| | `UNAVAILABLE` | the bound activation cannot cold-resume | that the live-session path is unavailable — only cold resume is |

`ACTIVE` is reserved for a genuine host wake: the null, unbound and unavailable adapters
all report `PULL` (`src/deployment/launch.ts:481-487`), so the view never overstates what
will happen. `coldResume` is `AVAILABLE` only when the bound adapter is the real
`dsh-agents` one (`:505`); the `dsh-agents-unbound` placeholder honestly reports
`UNAVAILABLE`.

## 3. The extended `PALIMPSEST_HOST_READY`

The shipped runner prints one machine-readable line at startup
(`host/dsh/lib/runner.js:238-254`):

```text
PALIMPSEST_HOST_READY {
  sessionId, mode,
  localPeer, persistentPoint,
  transportAdapter,
  attentionAdapter,
  attentionFormat: "product (cross-project formatter + default)",
  application: "full" | "none",
  collaboration: HostCollaborationReadiness,
  toolNames, url, token
}
```

| Field | Proves |
| --- | --- |
| `sessionId` / `mode` | the principal session and whether it was created or resumed |
| `localPeer` / `persistentPoint` | the deployment identity the host bundle carries |
| `transportAdapter` | the durable transport adapter id |
| `attentionAdapter` / `attentionFormat` | that the product formatter (cross-project + default) is wired |
| `application` | whether the full application surface is composed |
| `collaboration` | the whole readiness view above |
| `toolNames` | the tools the shipped host registered |
| `url` / `token` | the local serve endpoint (the existing local token only) |

It prints **no credentials beyond the existing local serve token and no private project
content** (§31).

## 4. Integration-test use

`PALIMPSEST_HOST_READY` lets an integration test prove the SHIPPED host has: a
collaboration surface, an Advisor, local Explore capability, a branch adapter, a
cross-project surface when configured, a pump, attention and resume-capable activation.
The suite asserts the runner's source wires the product formatter and supplies `resume`
(`test/uxc_host_runtime.test.ts:530-548`, `:556-574`), and the cross-project dogfood
asserts the readiness `inboundPump`/`attention` states on real deployments
(`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs`).

HONEST: `PALIMPSEST_HOST_READY` reports **composed capabilities, not observed work**. On a
profile that did not bind a host wake, `collaboration.attention: "PULL"` is the correct,
non-overstated reading.

## 5. A wired capability performs no work until requested

Zero-config wires capabilities; it does not exercise them (§32). At idle the packaged host
performs:

```text
zero Explore branches
zero cross-project sends
zero verification runs
zero External Asset queries
zero Monitor ticks unless Monitor was separately configured
```

(UXC-N26/N27, `test/uxc_host_runtime.test.ts:728-746`; the local dogfood's idle
assertions.) The advisor, profiler, branch port, policies and formatter are inert
closures; the reasoning store issues only schema setup; the verification runtime registers
a provider and creates a store but runs nothing; `launchDeployment` never calls
`pumpOnce` on its own; attention derives nothing until `drain()`; Monitor is not composed.

### 5.1 The two honest caveats

The audit recorded two ways "does no work" must be read precisely
(`UX-C-HOST-RUNTIME-ASSESSMENT.md` §1 Q18):

1. **A durable store creates a local file/table merely by existing.** Wiring the packaged
   bundle derives `<orchestration dir>/reasoning.sqlite` and opens it — a local schema
   initialisation, not a cognition. It writes no reasoning event until a cell is opened.
2. **A host loop polls the local mailbox on a mechanical timer.** The shipped runner
   schedules `pumpAndActivate()` on an interval (`host/dsh/lib/runner.js:300-321`). That
   tick is scheduling, not semantic truth: the pump cursor advances only after ingest, and
   a failed activation never marks a signal delivered. It is a local mailbox read, not a
   network send.

Neither caveat is hidden autonomy: no branch, no cross-project send, no verification, no
external query and no Monitor tick happens because of either.

## 6. What the readiness view must not become

- **No score.** A numeric "collaboration score" would collapse readiness into health and
  is forbidden (§30).
- **No semantic health truth.** The view must not claim a capability works, only that it
  is composed.
- **No authority.** Presence of a capability grants nothing; §6's explicit list
  (cross-project send, Monitor ticking, external assets, publication, `domainGate`,
  disclosure, commitment acceptance, management escalation) stays operator-controlled
  regardless of any readiness field.
- **No "enable everything" switch.** The profile carries at most one advanced override
  (`reasoning.storePath`); there is deliberately no `autonomy`/`everything` flag (§44).
