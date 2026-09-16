# UX-B — Carry-forward

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` §78 (the two mandatory dispositions and the
trigger-driven list), §79 (likely future), §80 (the strategic statement).
Dispositions of record: `docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md` §1
(`CF-AE-R-*`), `docs/engineering/audits/UX-A-CARRY-FORWARD.md` §2 (`CF-UXA-*`).
Evidence: `docs/engineering/audits/UX-B-CF-AE-R-05-EVIDENCE.md`,
`docs/engineering/audits/UX-B-DELIVERY.md`,
`docs/engineering/audits/UX-B-CROSS-PROJECT-ANTI-WASTE.md`.

Every item below names a **concrete trigger**. Nothing here moves by assertion,
and nothing here is a delivered claim.

## 1. The two mandatory dispositions (§78)

### 1.1 `CF-AE-R-05` — CLOSED_IN_UX_B

```text
CF-AE-R-05 CLOSED_IN_UX_B
```

**Original finding** (`G10-AE-R-CARRY-FORWARD.md` §1): AER-N17 and PSI-A11 were
**not proven** — the AE-R rig composed no federation surface at all, so its
`test/aer_scope_isolation.test.ts:646-666` could not assert a bypass property; the
`if (federation === undefined)` guard passed its own branch and both loops over
members/actions iterated an empty set.

**Original trigger:** *a rig that composes the §132–§135 peer wiring together with a
shared Project Workspace store.*

**Why it is genuinely closed — the four §50 bullets, each with a real run:**

| §50 requirement | Evidence (`ae-evidence/uxb-dogfood.json`) |
| --- | --- |
| federation active | `federation_is_active_on_both_sides` (both installations) |
| shared Workspace files | `shared_association_file_really_holds_BOTH_scopes` → `["detector","optics"]`; `shared_journal_file_really_holds_BOTH_scopes` → `["detector","optics"]` (a third direct handle) |
| authenticated cross-project message | `remote_pump_ingests_the_authenticated_message` → `{"ingested":1,"received":1,"unverified":0}`; `remote_attention_emitted_an_inbound_peer_message` |
| foreign workspace read attempts fail closed | `foreign_journal_read_fails_closed_from_B/_from_A` → `invalid_registration`; `foreign_scoped_assets_read_fails_closed_from_B` → `invalid_registration`; `foreign_external_asset_resolve_fails_closed_from_B` → `no bridge`; `no_secret_crossed_the_boundary_in_any_form` |

Trigger satisfied: the rig composes two live installations over ONE shared durable
transport ledger with real federation, real inbound pumps and real Attention, plus
ONE physical Project Journal file and ONE physical AssetAssociation file holding
both scopes with a separate handle per installation
(`scripts/interaction/uxb-two-project-dogfood.mjs:92-179`).

**What the closure does and does not claim.** It is closed as "no reachable
foreign-read path + the fences hold", **not** as "a bypass was attempted and
blocked" — no federation call site accepts a project or workspace scope at all
(SC-17). "Authenticated" means asserted by the local transport adapter from the
installation's own ledger, not cryptographic (SC-4). The full statement is
`docs/engineering/audits/UX-B-CF-AE-R-05-EVIDENCE.md` §5.

**Stale reference resolved.** The finding's mechanics changed: the cited range now
holds a test renamed `AER-N17 (NOT PROVEN HERE — carried as CF-AE-R-05)` that
asserts `application.federation` is undefined explicitly instead of guarding a
branch. The test was **not** edited (UX-B writes docs only, and `test/**` is out of
scope); the proof moved to the UX-B rig. Recorded in the evidence doc §2.

**Not closed here:** the concurrent-writer question is `CF-AE-R-08`, a different
item, and it is **unchanged** by this stage — two installations actively writing
the same physical file at the same instant is still neither supported nor tested
(§2.9 below).

### 1.2 `CF-UXA-03` — CLOSED_IN_UX_B

```text
CF-UXA-03 CLOSED_IN_UX_B
```

**Original finding** (`UX-A-CARRY-FORWARD.md` §2): *the COORDINATE handoff is a
signal, not a protocol* — UX-A produced `CROSS_PROJECT_REQUIRED` with peer ids and
a plain-language reason, and had **"no discovery, no scoped context packaging, no
commitment request and no transport."**

**Original trigger:** *the first request that must actually reach another project
and return a result — i.e. UX-B's `ask the previous optics project about this`
target.*

**Why it is genuinely closed.** The trigger fired and was satisfied: one product
request now reaches another live project and returns a result, proven end to end
over real federation. Item by item against the finding's own list:

| The finding said UX-A lacked… | UX-B |
| --- | --- |
| discovery | the read-only `ProjectPeerDirectoryPort`, resolved by exact projectId/displayName/alias (`src/interaction/project_peer_directory.ts:187-353`) and writable through the launcher's `projectDirectory` (`src/deployment/profile.ts:192-231`; `src/deployment/launch.ts:164-183`) |
| scoped context packaging | the strict versioned `ProjectAskEnvelope`, carrying the task and only explicitly supplied `contextText`, with product maxima and refusal-not-truncation (§24/§25/§63) |
| transport | the EXISTING durable peer transport via `sendMessage`, with no new operation kind (§13/§4) |
| a returned result | `status()`/`receive()` derive a terminal answer from the origin's own thread plus authenticated inbox (§19/§20/§39); the remote principal answers directly or through its own UX-A run (§52) |

**One clause is deliberately NOT closed, and that is correct.** The finding also
listed "no commitment request". UX-B deliberately adds **no** commitment request:
v1 has exactly one intent (`ASK_PROJECT`), and §22/§23 reject inflating an
information request into an obligation. So that clause is not an unfilled UX-B
gap — it is a scope decision that moves to UX-C as an open design question (§3.1).
`CF-UXA-03` is closed for the ask/answer protocol; if UX-C ever adds durable
delegation it does so under a new id, not by reopening this one.

## 2. What UX-B leaves open

### 2.1 `CF-UXB-01` — a launched project cannot Explore (the deployment-wiring gap)

**Found while running the rig.** A profile-launched deployment composes **no
reasoning at all** (no cell store, no branch-execution port), so a remote project
cannot fan out: an EXPLORE/PARALLEL `compose` answer request returns
`CAPABILITY_REQUIRED` and UX-B honestly maps that to `DECLINED` rather than
fabricating an answer. The composition **path** is proven with the intent the
deployed stack can serve (FOCUS ⇒ a real multi-agent answer,
`remote_uxa_collaboration_can_answer`), and the Explore variant is proven in-suite
with a hand-composed installation (UXB-N26). Verbatim from the evidence file's
`honestNotes.deployment_wiring_gap`:

> A profile-launched deployment composes NO reasoning (no cell store, no
> branch-execution port), so a remote project cannot fan out: an EXPLORE/PARALLEL
> compose request comes back CAPABILITY_REQUIRED and UX-B honestly maps it to
> DECLINED. The composition PATH is proven here with the intent the deployed stack
> can serve; the Explore variant is proven in-suite (UXB-N26) with a hand-composed
> installation. Extending the launcher profile to compose reasoning is a
> host-capability decision and is carried forward.

**Trigger:** a deployment whose `projectDirectory` names peers *and* which expects
a remote project to Explore — i.e. the first profile where an operator wants
`compose.intent` other than FOCUS to succeed, or the first decision to add a
reasoning-cell store / branch-execution port to `DeploymentProfile`.

**Kind:** host capability, not a UX-B protocol gap. The protocol is already
correct; only the launcher profile is thin.

### 2.2 `CF-UXB-02` — `crossProjectAttentionText` is exported and tested but not wired into the shipped runner

`crossProjectAttentionText` (`src/interaction/cross_project_host_adapter.ts:65`)
and the two §61 texts (`:39-44`) are exported from the interaction barrel
(`src/interaction/index.ts:31`) and unit-tested (UXB-N29's attention assertion at
`test/uxb_cross_project.test.ts:1405`; the §61 describe at `:1880`), and the tests
prove the text carries **no message content** (SC-21). But the shipped DSH runner
does not call it: it builds the activation adapter without a `format`
(`host/dsh/lib/runner.js:331-341`), and `grep -rn "crossProject\|cross_project"
host/` returns nothing. So a DSH-hosted principal woken by
`inbound_peer_message` gets the default attention text, not the cross-project
instruction.

**Trigger:** the first DSH/Pi host that wants a woken principal to be told
"another project is asking…" rather than shown the generic inbound-peer signal —
i.e. wiring `format: (signal) => crossProjectAttentionText(signal)` at the host's
adapter construction. See
`docs/engineering/audits/UX-B-CROSS-PROJECT-HOST-INTEGRATION.md` §3.

**Why it is not fixed here:** the host adapter is host-owned; UX-B ships the pure
formatter and the seam, exactly as §33 asks, and does not modify `host/**`.

### 2.3 `CF-UXB-03` — the host attention loop passes no `resume`

The DSH runner constructs its activation adapter with
`agents: { get: … }` and **no `resume`** (`host/dsh/lib/runner.js:335-338`), so the
DSH adapter's resume branch is unreachable there; the only cold resume is at
process start. The derivation path is nonetheless complete and proven (durable
envelope → `pumpOnce` → `recordInboundMessage` → `MESSAGE_RECEIVED` →
`AttentionService` emits `inbound_peer_message` → `drain()` → adapter), and the
rig exercises it.

**Trigger:** a DSH/Pi host that expects a **cold** project principal to be
resumed *by an inbound peer message* rather than only at process start — i.e.
supplying `resume` to `dshAgentsAttentionAdapter`. The API already supports it; the
shipped runner does not use it.

### 2.4 `CF-UXB-04` — the §10 resolver seam is unwired

`ProjectTargetResolverPort` exists, its null object is honest
(`src/interaction/cross_project_host_adapter.ts:93-105`), the revalidation is
implemented and pinned (UXB-N resolver describe at
`test/uxb_cross_project.test.ts:1822`), and the service consumes it when supplied
(`src/interaction/cross_project.ts:587-594`). **No shipped deployment supplies
one**, so every real deployment resolves exactly: a user sentence with no exact
match is `TARGET_UNKNOWN`, not a model-backed guess.

**Trigger:** a host that wants a user to name a project fuzzily — i.e. the first
caller that supplies a resolver, or a measured case where a real user sentence
fails exact resolution and the deployment has no alias for it.

**Kind:** product adaptation. Deliberately not shipped, because §9 requires core
resolution to be deterministic and §10 makes the resolver untrusted and optional.

### 2.5 `CF-UXB-05` — the product maxima are UX-B's own bound

The kernel does not bound `PeerMessage.body` (SC-13), so
`CROSS_PROJECT_MAX_TASK_CHARS = 4_000`, `…_CONTEXT_TEXT_CHARS = 8_000`,
`…_ANSWER_CHARS = 8_000`, `…_DETAIL_CHARS = 2_000` and
`…_BODY_BYTES = 32_768` are the product layer's own limits
(`src/interaction/cross_project_protocol.ts:51-56`). Oversize is refused, never
truncated (`:254-262`, `:428-438`).

**Trigger:** a real request or answer that legitimately exceeds a bound, or a
decision to move body-size governance into the kernel/transport rather than the
product layer. Any change to a bound changes the protocol digest, so two
deployments that disagree can notice.

### 2.6 `CF-UXB-06` — `pending()` throws when the directory cannot be observed

`pending()` throws `directory_unavailable` rather than returning an empty list when
the project directory reads `unknown` or `error`
(`src/interaction/cross_project.ts:1000-1009`). This is the deliberate refusal of
the "unknown == empty" collapse — but it is asymmetric with `projects()`, which
returns a `state` field (`:620-658`), and a host that writes
`try { await pending() } catch { [] }` would silently reintroduce the collapse.

**Trigger:** the first host that polls `pending()` in a loop (a background inbox
watcher), or a request to make `pending()` return a `state`-carrying envelope like
`projects()` does.

### 2.7 `CF-UXB-07` — a repeated identical Ask is a NEW transport message

UX-B deliberately keeps the kernel's random `messageId` instead of deriving it
from `requestId`, because the durable transport's `operationId` **is** the
`messageId` and a same-id-different-content resubmit fails closed with
`transport_operation_conflict` (SC-14;
`src/interaction/cross_project_protocol.ts:15-29`). §16 does not promise
exactly-once user-request creation, so this is honest — but asking the same thing
three times creates three transport messages, which the far side collapses into one
logical pending request only because `requestId` matches
(`src/interaction/cross_project.ts:1049-1058`).

**Trigger:** a measured cost where repeated identical Asks matter (duplicate
transport rows, bandwidth, or an operator surprised by three messages for one
question), i.e. a decision to make `messageId` content-addressed and accept the
transport-conflict semantics that follow.

### 2.8 `CF-UXB-08` — CLOSED IN UX-B (gate review M4)

`projectPhrase(name)` used to build `the <name> project` unconditionally, so a
deployment whose `displayName` was itself a phrase — the rig used `"the detector
project"` — rendered `"Asked the the detector project project."` verbatim in a
user-facing sentence. A phrase-shaped name (ending in a bare `project`/`team`/`group`/
`system`/`library`/`service`/`app`/`platform`) is now used verbatim and only a bare
name/id is wrapped, pinned by a gate-review regression in
`test/uxb_cross_project.test.ts`.

**Disposition:** closed. The deployment convention (bare display names) remains a
recommendation, not a requirement.

### 2.9 `CF-UXB-09` — the optional answer gate (`domainGate`) is declared but unwired

The service accepts an optional `domainGate?: () => Promise<{ admitted, detail }>`
that can only ever **refuse** to answer a remote Ask — it can never author one
(`src/interaction/cross_project.ts:358-362`, consulted at `:1227-1231`, refusal
mapped to `refused_by_domain_gate`). It is a sound seam: a deployment that must not
answer foreign questions can say no.

**No caller supplies it.** `install.ts` composes the service with
`projectId`/`localPeer`/`clock`/`directory`/`federation`/`collaboration` and no
gate (`src/install.ts:2259-2265`), and a tree-wide `grep -rn "domainGate" src/`
returns only the two lines inside `cross_project.ts`. So every shipped deployment
answers whenever the directory binding checks pass, exactly as the field's own
docstring says an absent gate means. The mechanism is implemented and honest; the
configuration path is absent.

**Trigger:** a deployment that must refuse to answer foreign questions (a
compliance boundary, an offline window, a maintenance posture) — i.e. the first
host that needs to say "not now" without pretending it could not hear. The wiring
is a `DeploymentProfile` field plus a gate supplied at composition.

**Kind:** an unwired optional seam, of the same shape as `CF-UXB-04`. It is the
`SC-15` lesson pointed the other way: a declared seam with no supplier is honest
only while it says so.

### 2.10 `CF-AE-R-08` — concurrent writers remain unsupported (unchanged)

Two installations actively writing the same physical association/journal file at
the same instant still has no coordination, locking policy or multi-writer story.
The UX-B rig serialises its writes, as the AE-R dogfood did.

**Trigger:** unchanged from `G10-AE-R-CARRY-FORWARD.md` §1 — two installations
writing the same physical file concurrently. **Kind:** portability/deployment
design, not a UX-B deliverable and not touched by this stage.

### 2.11 The evidence's scope claim is narrower than the finding's title

`CF-AE-R-05` is closed as "no reachable foreign-read path + fences hold", not as "a
bypass was blocked" (SC-17). This is not an open item — it is a statement of what
the closure means, recorded so no later document widens it.

**Trigger:** the first architecture change that gives a federation call site a
project or workspace scope parameter. If that ever happens, `CF-AE-R-05`'s stronger
form becomes testable and should be re-proven under a new id.

## 3. Held dispositions — the trigger-driven list (§78)

These UX-A and AE items are **unchanged** by UX-B. They are restated here only so
this document does not silently drop them; the disposition of record is the
original document.

### 3.1 UX-A items kept trigger-driven

| ID | Finding (abbreviated) | Trigger (unchanged) | UX-B's effect |
| --- | --- | --- | --- |
| `CF-UXA-01` | the kernel has no branch **ceiling**; UX-A's `MAX_BRANCH_HINT = 8` is the product layer's own bound | a second product face or an expert caller that wants to request a branch count, or a decision to move fan-out governance into the kernel | **none.** UX-B adds no branch bound and no fan-out |
| `CF-UXA-02` | AUTO cannot choose EXPLORE without a composed advisor (needs an org-memory store) | a deployment that wants automatic architecture selection without wiring org memory | **related but distinct** from `CF-UXB-01`: that one is about reasoning composition in the launcher, this one about the advisor |
| `CF-UXA-04` | the deterministic profiler is **lexical** (explicit keyword markers only) | a host that wants model-backed profiling, or a measured all-UNKNOWN sentence that should have explored | **none.** UX-B does not profile |
| `CF-UXA-10` | UX-A reads the advisor's blocker wording by regex; a **typed blocker code** does not exist | any change to the advisor's blocker wording, or the introduction of a typed capability/blocker code | **none.** UX-B reads no advisor text |
| `CF-UXA-05`/`07`/`09`/`11`/`13`/`14` | the remaining UX-A honesty and API-hygiene observations (claim verbatim, inert `preferences`, AUTO-only COORDINATE, inert overrides for FOCUS/CHECK, `plan()` rejection symmetry) | each unchanged in `UX-A-CARRY-FORWARD.md` §2 | **none.** UX-B touches no UX-A path |

HONEST: `CF-UXA-03` is the only UX-A item UX-B disposes; the rest are untouched by
design, and this stage has no evidence to offer about any of them.

### 3.2 AE provider / PIAS items kept trigger-driven

| ID | Finding (abbreviated) | Trigger (unchanged) |
| --- | --- | --- |
| `CF-AE-04` | no real external-library provider ships; only the TEST-ONLY fixture | a deployment with a REAL external library to connect |
| `CF-AE-05` | no operator path to register/rotate/inspect a provider without editing the host | an operator who wants to add or swap a provider without a code deployment |
| `CF-AE-06` | provider registry is process-local and non-portable | external-provider-profile portability, or multi-machine operation |
| `CF-AE-08` | no provider-change webhook, watcher or auto-refresh | a product need to be NOTIFIED of a library change |
| `CF-AE-13` | `ExternalAssetErrorKind` declares seven kinds no path throws | a decision to prune the union or start throwing the reserved kinds |
| `CF-AE-15` | `resolve(projectId)` caches nothing | a project with many external references |
| PIAS | the separate Personal Intellectual Asset System track | a separate product/data track, not a UX-B dependency (§64/§79) |

**UX-B's effect on all of them: none.** UX-B does not search, attach or resolve
external assets and adds no PIAS coupling (§64; anti-waste §10 —
`grep -rniE "pias|external.?asset|provider"` over the UX-B modules, comments
excluded, is empty).

## 4. Not implemented here — UX-C candidates (§79)

The following are **explicitly not implemented by UX-B**. They are recorded as
candidates to be chosen from real friction, not scheduled.

| Candidate | Why it is not in UX-B | What a trigger would look like |
| --- | --- | --- |
| **UX-C — durable cross-project delegation / commitments** | v1 is `ASK`, never `ASSIGN`; §22/§23 reject inflating a question into an obligation, and §76 makes an automatic commitment a PARTIAL condition | a real interaction that *is* an obligation — a handoff someone must accept, track and discharge (§1, §46) |
| **UX-C — selected project-context attachments** | the only context that leaves a project today is an explicitly supplied `contextText`; §24/§25 forbid automatic packaging | a user who repeatedly pastes the same kind of context, or a decision to offer bounded, *chosen* attachments (never a workspace snapshot) |
| **UX-C — model-backed project resolver shipped** | §9 requires deterministic core resolution; §10's resolver is an unwired host seam (`CF-UXB-04`) | `CF-UXB-04`'s trigger: a real deployment with a user sentence that exact resolution cannot serve |
| **UX-C — multi-recipient Ask** | one Ask targets one project; the protocol envelope carries a single `targetProjectId` | a user who wants to ask several projects at once, or an operator who wants a broadcast with per-project answers |
| **UX-C — multi-project result synthesis** | `CONFLICT` is reported, never resolved; the product never picks (UXB-N23) | a real need to *combine* answers from several projects into one claim — which first needs an honesty design for provenance and disagreement |
| **UX-C — remote timeout / cancellation** | #19 is explicit: no response is `WAITING`, not failure; nothing expires | an operator who must bound how long a question may stay open, or who needs to withdraw a question — which needs a cancellation semantics the current protocol deliberately lacks |
| **UX-C — project-directory portability** | the directory is deployment-local read-only metadata (`CF-AE-06`'s shape); `projectId`/peer bindings are non-portable config | two machines serving one project, or a directory that must move between deployments without re-editing the profile |
| **UX-C — host-native zero-config interaction adapters** | `CF-UXB-02`/`CF-UXB-03`: the attention seam exists but no shipped host wires the cross-project text or `resume` | the first host that wants cross-project wake-up to work with no per-host configuration |

PIAS remains a separate parallel product/data track, not a kernel dependency for
UX-B or any UX-C candidate (§79).

## 5. What UX-B does NOT leave open

Delivered and pinned; not carried:

```text
one product request asks another project      rig golden path; UXB-N28
prepare is read-only and exact                rig prepare_ask_sends_nothing; §47
five resolution outcomes, no silent send      UXB-N03/N04/N05
binding is not identity, not authority        UXB-N01/N02
no scope widening from hostile metadata       UXB-N14/N15; rig fences
answer only from the expected bound peer      UXB-N24/N25
no response means WAITING                     UXB-N19; rig
conflict reported, never resolved silently    UXB-N23; rig
replay forces no duplicate cognition          UXB-N21; rig
ACK is not agreement                          UXB-N18/N20
zero commitment / boundary / ProjectIR / Work / Journal / Evidence mutation
                                              UXB-N06-N09, N19/N20; rig
CF-AE-R-05 closed by a real rig               UXB-N29; evidence doc
no new store / event / operation kind / agent / scheduler / PIAS
                                              anti-waste §1-§10
```

## 6. Strategic statement (§80)

> Reliable multi-Agent collaboration within and across projects should feel as
> lightweight as talking to one Agent.
> Kernel complexity stays underneath.

UX-B is the second stage under the track rule

```text
NO NEW KERNEL SEMANTIC SPECIES
unless a real interaction use case proves the existing kernel cannot express it.
```

and it honours it: five new modules, four modified product faces plus the launcher
profile, **zero** changes to `src/coordination/**`, `src/transport/**`,
`src/federation/**`, `src/attention/**` or `src/project_workspace/**`. Every open
item above is a **host capability** (`CF-UXB-01`, `CF-UXB-02`, `CF-UXB-03`), a
**wiring decision** (`CF-UXB-04`, `CF-UXB-09`), a **cost** (`CF-UXB-05`…`CF-UXB-08`),
or a **held disposition** from an earlier stage — none proposes a new kernel
species, and none is a defect. The two items the stage was required to dispose
(`CF-AE-R-05`, `CF-UXA-03`) are disposed on real evidence, with the narrower scope
of each claim stated in the document that makes it.
