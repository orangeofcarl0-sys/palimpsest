# One-request cross-project collaboration — how to use it

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` (§1, §2, §3, §9, §19–§27, §40–§42, §59–§63, §75).
Product model: `docs/product/PROJECT-TO-PROJECT-INTERACTION.md`.
Gap assessment: `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md`.
Delivery: `docs/engineering/audits/UX-B-DELIVERY.md`.

This is the task-oriented companion to the interaction model: what you say, what
you get back, and what the deployment will honestly refuse to do.

---

## 1. What this is

You already have a project. There is another project you know exists — the optics
work from last quarter, the detector team, the photonics group. UX-A lets one
request drive local Focus / Explore / Verify inside *your* project. UX-B adds one
more thing, with one action:

```text
Ask the previous optics project whether we already studied this detector aperture issue.
```

That is the whole product. You do not learn what a peer is, you do not open a
thread, you do not add a contact, you do not switch project or chat, and you do
not poll. You ask once. If the other project answers, its answer arrives in your
project's own attention stream and is surfaced without you doing anything else.

> Reliability is the point. The other project is a sovereign project, not a
> subroutine: it may answer, answer partially, decline, or take a while.

## 2. Where you call it

Three faces expose the same service. Any one of them makes the promise real;
pick the one that matches your integration.

| Face | Shape |
| --- | --- |
| Agent tool | `palimpsest_cross_project` with actions `projects`, `prepare`, `ask`, `status`, `pending`, `respond`, `receive`, `acknowledge` |
| Application surface | `application.crossProject.projects()` / `.prepareAsk(...)` / `.ask(...)` / `.status(...)` / `.pending()` / `.respond(...)` / `.receive(...)` / `.acknowledge(...)` |
| HTTP | `GET/POST /api/cross-project/{projects,prepare,ask,status,pending,respond,receive,acknowledge}` |

The tool is defined at `src/tools/application_tools.ts:586`; the surface at
`src/application/surface.ts:491-512` (declared), `:1210-1232` (composed) and
`:1524` (returned); the routes at `src/application/http.ts:206-245`. Whether the
face exists at all is discoverable — `GET /api/application/surfaces` carries a
`crossProject` boolean (`src/application/http.ts:191`). The service itself is the
seven-member composition returned at `src/interaction/cross_project.ts:1285`.

The **request body is the request**. There is no wrapper, no action enum inside
the body, and no second parser.

### The request

```text
CrossProjectAskRequest {
  target        string   the other project's NAME as a person would say it
                         (its id, display name or alias — never a peer id)
  task          string   the question, in the user's words
  contextText?  string   optional context to send EXACTLY as given
  requestedBy   string
}
```

Defined at `src/interaction/cross_project.ts:142-149`, parsed strictly at `:153`.

### What a request may NOT carry

A `target` that is an object, a peer reference, a thread id, a `to` field, a
commitment, an assignment, an authority flag or an agent identity is **refused as
an unknown field**, never ignored (`src/interaction/cross_project.ts:162-166`,
`:170`). V1 has exactly one intent — `ASK_PROJECT` (`:136-141`). There is no
DELEGATE, ASSIGN, ACCEPT_REMOTE_WORK or PROJECT_COMMITMENT field to smuggle.

### The five-step use, in user terms

```text
1. Discover   → application.crossProject.projects()      "who can I ask?"
2. Look first  → prepareAsk({target, task})               "exactly this leaves my project"
3. Ask         → ask({target, task, requestedBy})         "Asked the optics project."
4. (later)     → your attention stream wakes you          "A project you asked has replied."
5. Surface     → status(requestId) / receive(requestId)   "The optics project replied."
```

`prepareAsk` is read-only and shows the **exact** packet — the task text, and any
`contextText` you explicitly supplied, and nothing else (`src/interaction/
cross_project.ts:662`; the packet is a first-class field, not a warning string,
`src/interaction/cross_project_result.ts:87-97`). In the real two-project rig,
`prepare_ask_sends_nothing` passes: the durable transport ledger is still byte-empty
after a prepare (`F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json`).

## 3. What you do not do

This is the list the product promise is built to delete. Each item is enforced by
an existing mechanism, not by documentation.

| You never have to… | Why not |
| --- | --- |
| name a `PeerRef` | `target` is a project name; `resolveProjectTargetIn` matches `projectId`, `displayName` or `alias` only (`src/interaction/project_peer_directory.ts:281-322`) |
| open or address a thread | the thread id is DERIVED from the request id under the existing `ThreadRef` grammar (`src/interaction/cross_project_protocol.ts:478`) |
| add a contact, or call `requestContact` | the primitives are `sendMessage` / `thread` / `inbox` / `acknowledge` (`src/interaction/cross_project.ts:330-339`); `requestContact` carries no body and is not used (audit SC-8) |
| switch project or chat | the remote project's own attention loop resumes *its* principal; you stay in yours (§2) |
| poll for an answer | your own attention path emits `inbound_peer_message` when the answer lands; `status()` is a read, not a watchdog |
| carry context across by hand | the default packet is the task only; `contextText` is opt-in and copied exactly (§24/§25) |
| manage federation messages or acks | one `ask` is one ordinary peer message; the request is acknowledged only after the answer is really sent (§38), and the answer only after you consume it (§39) |

### What you may not do either

The remote project is sovereign. The local project cannot command it, force it to
answer, hand it work, or read its private Project Workspace. The firewall table
in `docs/product/PROJECT-TO-PROJECT-INTERACTION.md` §4 states each separation for
a product reader.

## 4. The five target-resolution outcomes, in user language

Resolution is **pure, exact and deterministic** — no fuzzy matching, no
embeddings, no model, no ranking (`src/interaction/project_peer_directory.ts:
276-322`). There are exactly five outcomes, and they mirror the existing
`known | unknown | error` discipline rather than inventing a new one (audit
SC-11; `src/interaction/project_peer_directory.ts:243-255`).

| You said | What you get | What the product says |
| --- | --- | --- |
| a name the deployment binds | `RESOLVED` | the Ask proceeds (or `PREPARED` for a preview) |
| a name nobody binds | `TARGET_UNKNOWN` | `No project here is named "…".` — and the candidate names, so you can see what exists. **Nothing is sent.** |
| a name two projects share | `TARGET_AMBIGUOUS` | `More than one project is named "…".` — and *which* projects. **Nothing is sent**, and it never picks one for you |
| a deployment whose directory cannot be read | `DIRECTORY_UNKNOWN` | `This deployment's project directory could not be read.` **Nothing is sent.** Unknown is never "there are no other projects" |
| a directory that read but failed | `DIRECTORY_ERROR` | `This deployment's project directory failed to answer.` **Nothing is sent.** |

The same discipline holds on the receiving side: `pending()` **throws** rather
than returning an empty list when the directory cannot be observed, because an
ungrounded empty pending list is exactly the collapse "unknown == empty" that the
discipline forbids (`src/interaction/cross_project.ts:1000-1009`). `projects()`
instead returns `state: "unknown" | "error"` with an empty list — the `state`
field is part of the contract precisely so an empty list cannot be misread
(`src/interaction/project_peer_directory.ts:187-190`;
`src/interaction/cross_project.ts:620-658`).

One more resolution outcome exists, and only on the send path: a project that
resolved a moment ago but whose binding changed (or vanished) under a fresh
observation just before sending yields `STALE_TARGET_BINDING` and **sends
nothing** (`src/interaction/cross_project.ts:739-762`; §45).

## 5. The status vocabulary, and why "no response" is not failure

Every method of the service shares one status vocabulary
(`src/interaction/cross_project_result.ts:35-51`) so a host never reconciles two
enums:

```text
target resolution   RESOLVED | TARGET_UNKNOWN | TARGET_AMBIGUOUS |
                    DIRECTORY_UNKNOWN | DIRECTORY_ERROR | STALE_TARGET_BINDING
preparation         PREPARED
in flight           SENT | WAITING
terminal            ANSWERED | PARTIAL | DECLINED | REMOTE_ERROR | CONFLICT
```

```text
no response means WAITING, not failure
```

That is a product rule, not a nicety (`SPEC-PROMPT-UX-B.md` §19). The rig proves
it: `unanswered_request_is_waiting_not_failed` — a question sent to a project that
never answers reads `WAITING`. Nothing is retried on your behalf, nothing expires,
and nothing is "lost": `status()` re-derives what is known from your own outbound
thread plus your authenticated inbox, every time
(`src/interaction/cross_project.ts:879-991`). There is no request store to go
stale (§18).

`SENT` is `WAITING` before the durable transport confirms delivery. Both are
honest: the transport is **at-least-once**, so a message may land later, or twice
(§36).

### The three situations that need the most care

| Situation | Status | What the product does — and does not do |
| --- | --- | --- |
| two **identical** terminal answers arrive | `ANSWERED` (collapse) | identical duplicates collapse in the derived view (§21); the user sees one answer |
| two **materially different** terminal answers arrive | `CONFLICT` | `Conflicting answers arrived from the optics project; nothing was chosen for you.` The first and the latest are both kept out of the answer field; the warnings list all of them (`src/interaction/cross_project.ts:946-970`) |
| an answer arrives that is **not** from the peer you asked, is on another thread, names the wrong project, or is unverified | still `WAITING`, plus a warning | the answer is refused; if a candidate answer is visible in the inbox but was not accepted, the result says so explicitly rather than silently ignoring it (`src/interaction/cross_project.ts:923-932`) |

The rig's `materially_different_terminal_answers_report_CONFLICT` check carries
exactly that copy, and `conflict_picks_no_side_silently` confirms the answer field
is empty.

## 6. What a returned answer is — and is not

An answer is **ordinary peer communication**. It is not Evidence, not Proof, not
Truth, not a Decision, not a Commitment, and it is never imported automatically
(`SPEC-PROMPT-UX-B.md` §41/§42; `src/interaction/cross_project_result.ts:3-14`).

```text
the answer is text, attributed to a project, surfaced to you
the answer is not a Journal entry, a Decision, a Task, an Evidence record
the answer is not agreement, and acknowledging it is not agreement
```

Concretely: the two-project rig checks `answer_is_not_auto_imported` (no
Journal/Decision/Task is created by the projection) and
`ask_and_answer_create_zero_commitment_boundary_or_project_mutation` — the
commitment count, the ProjectIR head revision and digest, and the shared Journal
row count are byte-identical before and after the whole Ask/answer path. If you
want the answer promoted into project truth, you use the existing product paths
that already own promotion.

`receive(requestId)` is the one call with a side effect: it returns the valid
terminal answer and marks **that message** processed, once, only after the answer
was consumed (`src/interaction/cross_project.ts:1266-1283`). A `CONFLICT`
acknowledges nothing, because nothing was chosen (`:1269-1273`).
`acknowledge(message)` exists as an explicit product path for a host that already
consumed a message itself (`src/application/surface.ts:1221-1231`); it is
per-`PeerMessage`, never per id, because an acknowledgement is about one delivered
message (audit SC-7).

## 7. The honest deployment limit

**A deployed project answers directly. It cannot fan out today.**

HONEST — this is the one place where the product promise is narrower than the
architecture, and it was found by running the real two-project rig rather than
reasoned about:

> A profile-launched deployment composes NO reasoning (no cell store, no
> branch-execution port), so a remote project cannot fan out: an EXPLORE/PARALLEL
> `compose` request comes back `CAPABILITY_REQUIRED` and UX-B honestly maps that to
> `DECLINED`. The composition PATH is proven here with the intent the deployed
> stack can serve; the Explore variant is proven in-suite (UXB-N26) with a
> hand-composed installation. Extending the launcher profile to compose reasoning
> is a host-capability decision and is carried forward.
>
> — `F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json`, `honestNotes.deployment_wiring_gap`

What that means for you, plainly:

- A launched project **can** answer: authored directly
  (`respond(id, {status, answer})`), or by running its own local collaboration in
  FOCUS mode (`respond(id, {compose: {task, intent: "FOCUS"}})`), which is a real
  multi-agent answer and is proven in the rig
  (`remote_uxa_collaboration_can_answer`).
- A launched project **cannot yet** run an EXPLORE or PARALLEL multi-agent
  exploration to answer you; asked to, it declines honestly rather than inventing
  an answer (`remote_uxa_capability_gap_is_honest_not_fabricated`).
- The Explore variant of the same path is proven in-suite with a hand-composed
  installation (UXB-N26), so the protocol is not the limit — the deployment
  profile is. Recorded as a carry-forward, not presented as a delivered
  capability.

A second honest limit: the rig drives the inbound pump explicitly
(`pumpAndActivate()`), which is what a host loop does. `launchDeployment` itself
starts nothing (audit SC-2), so **the promise needs a live host** — see
`docs/engineering/audits/UX-B-CROSS-PROJECT-HOST-INTEGRATION.md` for exactly what
a DSH/Pi host must do.

### Display names: use the bare name

HONEST — a cosmetic artifact, recorded rather than hidden. The user-facing copy
builds its sentence with `projectPhrase(name)` → `the <name> project`
(`src/interaction/cross_project_result.ts:124-127`). If a deployment's
`displayName` already reads as a phrase — the rig's directory uses
`displayName: "the detector project"` — the copy doubles up:
`"Asked the the detector project project."` (visible in the dogfood's
`prepare_ask_is_read_only_and_shows_the_exact_packet` detail). The fix is a
deployment convention, not a code change: **set `displayName` to the bare name**
(`"Optics"`, `"Detector"`), and the copy reads `Asked the Optics project.`
Whether the copy function should instead detect a leading article is recorded as a
carry-forward.

## 8. Reproducing the promise

```bash
# the two-project golden path + the CF-AE-R-05 rig, over real federation
node scripts/interaction/uxb-two-project-dogfood.mjs      # pass=true — 41/41
```

That script builds TWO live deployments over ONE shared durable transport ledger,
each with its own controller, orchestration store, Ordarium ledger, coordination
store and transport cursor store, and ONE physical Project Journal file plus ONE
physical ProjectAssetAssociation file holding BOTH scopes with a separate handle
per installation (`scripts/interaction/uxb-two-project-dogfood.mjs:1-22`,
`:92-127`). The full machine-readable evidence is
`F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json`.
