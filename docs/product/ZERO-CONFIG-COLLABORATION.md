# Zero-config collaboration

Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (Palimpsest product track).
Baseline: `a36d37b` (canonical main after UX-B).
Audience: a person installing Palimpsest into one normal project and talking to its agent.

This document is the product promise. It says what a user gets, what a user no longer
has to build, and — just as carefully — what "zero-config" does **not** mean. Every
claim here is backed by shipped code or a dogfood run; the engineering detail lives in
`docs/product/DSH-COLLABORATION-RUNTIME.md` and the audits under
`docs/engineering/audits/UX-C-*.md`.

---

## 1. The experience

### 1.1 One project, local collaboration

Install Palimpsest into one ordinary project and start its principal. Then:

> "parallel explore this"

and real ephemeral branches run, bounded, and useful exploratory findings come back.
The user did not configure a reasoning store, a branch port, an OrganizationMemory
store, a pump loop, an attention formatter, or a separate branch-agent profile.

```text
install one normal project
        ↓
ordinary principal starts
        ↓
"parallel explore this"
        ↓
real ephemeral branches run (bounded)
        ↓
useful exploratory findings return
```

The branches are **ephemeral**: they are not peers, not persistent points, not durable
agents, and they leave no identity behind. They think, return one structured result,
and exit (`src/deployment/branch_host.ts:1-23`).

### 1.2 Two projects, durable Ask

If the project's deployment profile names the other project (`projectDirectory`), the
same principal can also say:

> "ask the optics project"

and the request travels durably to that project's host. The target project's own pump
observes it, its principal is activated (or cold-resumed), it answers — directly or by
running its own local Explore — and the answer surfaces later on the origin side. No
manual mailbox polling is required by the user.

```text
user: "ask the optics project"
        ↓
durable cross-project request is sent (one explicit Ask)
        ↓
target project's host pump observes it
        ↓
target principal is activated / resumed
        ↓
target answers directly, or uses its own local Explore
        ↓
origin principal is activated / resumed
        ↓
answer surfaces
```

Cross-project work is exactly the UX-B experience; UX-C is what makes it arrive through
the **shipped first-party host** instead of a hand-written rig.

---

## 2. What the user no longer configures

Before UX-C these were all developer hand-wiring. They are now derived from the
deployment profile and the host's own knowledge:

| The user no longer supplies | What supplies it now |
| --- | --- |
| a ReasoningCell store path | a deployment-owned store at a stable derived path beside the project's orchestration DB — `<orchestration dir>/reasoning.sqlite` (`src/deployment/reasoning_bundle.ts:150-152`; `src/deployment/launch.ts:308-311`) |
| a branch execution port | the DSH host derives its own bin/profile and composes the ephemeral port (`host/dsh/lib/index.js:77-92`) |
| an OrganizationMemory store just to make AUTO usable | the Advisor is composed whenever the installation can act; with no memory it simply claims no empirical evidence (`src/install.ts:1623-1624`) |
| a pump loop | the deployment owns pump → drain → activate → mark-after-success; the runner only schedules it (`host/dsh/lib/runner.js:300-321`; `src/deployment/launch.ts:489-528`) |
| a generic attention formatter | the shipped runner uses the product cross-project formatter (`host/dsh/lib/runner.js:205-208`) |
| a separate branch-agent profile just to use ordinary Explore | branch mode composes only the frozen brief and one strict result tool; it is not a principal (`host/dsh/lib/index.js:98-129`) |

The one switch is the profile's `reasoning` field. Present — even as `{}` — means "give
this project the packaged local-collaboration bundle"; absent means nothing about
reasoning changes (`src/deployment/profile.ts:130-140`). There is deliberately **no**
`autonomy: true` / `everything: true` switch (`SPEC-PROMPT-UX-C.md` §44). When a value
genuinely cannot be derived, the profile offers at most **one** advanced override
(`reasoning.storePath`).

### 2.1 AUTO works without empirical memory

AUTO — "you decide the architecture" — used to require an OrganizationMemory store just
to own an Advisor. It no longer does. The Advisor is composed whenever the installation
can act; with no memory it returns empty empirical support and says so in plain words,
rather than abstaining or inventing evidence (`src/advisor/advisor.ts`, rationale
"No empirical evaluation is available…"; pinned by UXC-N01/N02). AUTO can therefore
choose Focus or Explore from the real task features:

- a decomposable, low-coupling, parallel-beneficial, verifiable task → **Explore**;
- a coupled, nondecomposable task → **Focus**.

HONEST: AUTO chooses Explore only when the task text actually carries the profiler's
markers, and `verifiability = HIGH` is one of the required features
(`SPEC-PROMPT-UX-C.md` SC-1). A paraphrase with no marker stays Focus. This is the
honest, local, no-LLM profiler, not a general "understand any sentence" promise.

---

## 3. What Explore findings actually are

When the packaged exploratory bundle runs, the result says — in primary, user-visible
text — exactly what it produced:

> These are exploratory cell-local findings. They are not Evidence and were not
> independently verified as true.

(`src/interaction/result_view.ts:31-38`; the result also carries it as a typed
`findingStanding` / `findingNote`.) The engine records an INCONCLUSIVE verification
standing with empty evidence lists, and admits a branch statement only as a cell-local
hypothesis for composition — never as truth, Evidence, Proof, Work admission or
authority (`src/deployment/reasoning_bundle.ts:52-143`).

The packaged default **never** returns `SUPPORTED` for a branch statement merely because
a model emitted it. If a deployment supplies a genuinely stronger, evidence-grounded
verification policy, that deployment's stronger semantics are preserved.

### 3.1 "Check" means the project head

`CHECK` verifies the **exact current Project Head** — never the Explore findings. The
product verbs say so directly:

- `LOCAL_VERIFY` → "Verify current project head"
- `LOCAL_EXPLORE_AND_VERIFY` → "Explore alternatives locally, then verify the current
  project head"

(`src/interaction/intent.ts:258-266`). A combined run states **two independent facts**:
local Explore produced exploratory findings, and separately the current Project Head was
checked. It never says "the Explore findings were independently verified" — that path
does not yet exist and no copy implies it (`src/interaction/collaboration.ts:969-990`).

---

## 4. The honest side

### 4.1 What remains explicit

Zero-config wires capabilities. It does not silently exercise authority. The following
still require an explicit operator or user act, and none of them runs by wiring alone:

| Still explicit | Why |
| --- | --- |
| cross-project **send** | only an explicit UX-B Ask sends; AUTO stops at a non-mutating handoff (`src/interaction/cross_project.ts:773`, `:1259`) |
| **Monitor** ticking | Monitor is not composed by the packaged bundle at all |
| external **asset provider** use | no provider is composed or queried by the bundle |
| external **publication** | publishing is an explicit act |
| **domainGate** policy | still unwired by default, by design (`CF-UXB-09` stays open) |
| **Proof disclosure** | disclosure is an explicit act |
| **commitment** acceptance | v1 has no commitment path; an Ask creates none |
| **management** mode escalation | requires an explicit operator act |

### 4.2 What zero-config does NOT mean

Zero-config does **not** mean hidden autonomy. Wiring a capability is not exercising it
(`SPEC-PROMPT-UX-C.md` §32). At idle, the packaged host is proven to perform:

```text
zero Explore branches
zero cross-project sends
zero verification runs
zero External Asset queries
zero Monitor ticks unless Monitor was separately configured
```

(UXC-N26/N27; the local dogfood's idle assertions.) The four firewalls hold by
construction:

```text
ZeroConfig != HiddenAutonomy
ZeroConfig != HiddenNetworkSend
ZeroConfig != HiddenDisclosure
ZeroConfig != HiddenAuthority
```

HONEST: two costs are real and stated rather than hidden. A durable store *does* create
a local file/table merely by existing, and a host loop *does* poll the local mailbox on
a mechanical timer — that timer is scheduling, not semantic truth, and a failed
activation never marks a signal delivered.

---

## 5. Why this is packaging, not a new autonomy layer

UX-C adds first-party host adapters, safe deployment defaults, product reasoning
policies over existing ports, a derived readiness view, DSH lifecycle wiring, a strict
branch-result tool and product copy. It adds **no** new canonical store, semantic event,
Agent identity, scheduler, authority, planning algorithm, second ReasoningCell, second
federation protocol, global project manager or PIAS store
(`SPEC-PROMPT-UX-C.md` §2; proven in `docs/engineering/audits/UX-C-HOST-RUNTIME-ANTI-WASTE.md`).

The kernel may be complex. The shipped interaction must not be. You should experience
Palimpsest as:

```text
talk to one project agent
→ get reliable collaboration when useful
```

not as "assemble a Project OS runtime by hand."
