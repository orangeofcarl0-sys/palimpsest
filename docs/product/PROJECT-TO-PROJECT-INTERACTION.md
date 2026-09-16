# Project-to-project interaction — the model

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` (§1, §2, §3, §7, §12, §13, §18–§23, §31–§33, §75, §79).
Task-oriented companion: `docs/product/ONE-REQUEST-CROSS-PROJECT-COLLABORATION.md`.
Gap assessment: `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md`.

This document explains *why* asking another project works the way it does. It is
written for a product reader: no federation internals are required to follow it.

---

## 1. One user request is not one network round trip

The single most important idea in UX-B is that a friendly one-line ask and a
synchronous remote procedure call are different things.

```text
One user request != one synchronous network round-trip
```

If an Ask were an RPC, the user would have to wait — and a project that takes
minutes to think, or that is simply not running when you ask, would look broken.
So the product deliberately does not wait:

```text
User asks once
→ request is sent durably                      (one ordinary peer message)
→ the remote project's Attention resumes its principal
→ the remote principal answers later
→ the origin project's Attention resumes
→ the answer is surfaced automatically, with no second user request
```

`ask()` returns as soon as **one** federation message has been sent — not when an
answer exists (`src/interaction/cross_project.ts:764-784`). It returns
`RESOLVED` (with the exact packet it sent), and the derived state afterwards is
`SENT` or `WAITING` (`src/interaction/cross_project.ts:933-944`). The rig proves
this end to end:

```text
ask_resolves_the_project_and_reports_sent_not_a_synchronous_answer
  → RESOLVED: Asked the the detector project project.
origin_status_shows_the_answer_without_a_second_user_request
  → ANSWERED: "We studied the aperture issue; our calibration note is B_ONLY_SECRET_GAIN_CALIBRATION"
```

The second line is the whole point: the answer appeared in the origin's status
**without the user asking a second time or switching anything**.

### 1.1 The distributed completion path, step by step

| Step | What happens | What owns it |
| --- | --- | --- |
| 1 | the user names a project in words | the product layer |
| 2 | the deployment's read-only project directory binds that name to an addressable peer | `ProjectPeerDirectoryPort` (`src/interaction/project_peer_directory.ts:187-190`) |
| 3 | a strict, versioned envelope is serialized into one peer message body | `src/interaction/cross_project_protocol.ts:428-438` |
| 4 | the message is sent durably and may be delivered later, or twice | the EXISTING durable transport (at-least-once) |
| 5 | the remote inbound pump ingests it and the remote Attention service emits `inbound_peer_message` | the EXISTING `FederationInboundPump` + `AttentionService` |
| 6 | the remote principal is resumed by its host | the EXISTING DSH/Pi activation seam |
| 7 | the remote principal authors an answer (directly, or through its own UX-A run) | the remote project — sovereign |
| 8 | the answer rides the SAME thread back | `respond(...)`; the thread is derived, not chosen |
| 9 | the origin's pump ingests it and its Attention wakes its principal | the EXISTING pump + Attention |
| 10 | the answer is surfaced from the derived state | `status(...)` / `receive(...)` |

No step in that table introduces a new kernel mechanism. Steps 2 and 3 are the
only new *product* pieces, and step 2 is read-only deployment metadata while step
3 is a string inside an existing message body.

**"Sent durably" is not "read".** Delivery and receipt are different facts, and so
are receipt and agreement:

```text
MessageDelivery != Receipt != Agreement
Ack != Agreement
```

That is why `respond()` acknowledges the request only after the answer send
resolved (`src/interaction/cross_project.ts:1234-1237`), and why `receive()`
acknowledges the answer only after it was consumed — and why an acknowledgement
never changes a status (`src/interaction/cross_project.ts:1274-1282`).
`ACK` means "processed/seen", never "agreed" (`SPEC-PROMPT-UX-B.md` §38/§39).

## 2. `ProjectId != PeerRef` — and why the binding is routing metadata

A user says "the previous optics project". The wire needs an address. Something
must connect the two — and that something is a **binding**, not an identity.

```text
ProjectId != PeerRef
ProjectName != PeerIdentity
ProjectPeerBinding != Authority
ProjectPeerBinding != Ownership
```

The descriptor is deliberately tiny, and it carries routing metadata only
(`src/interaction/project_peer_directory.ts:66-72`):

```text
ProjectPeerDescriptor {
  projectId        the project's own identity
  displayName?     what a user calls it
  aliases[]        other names a user might say
  peer             the ADDRESS to reach it at
  competenceTags[] optional discovery hints
}
```

A binding is not identity in either direction:

- two projects may map to one peer, or one project to a new peer after a
  redeployment, and neither fact makes the project *be* the peer;
- `ProjectId == PeerId` is never assumed anywhere
  (`grep -rnE "projectId *[=!]== *[a-zA-Z_.]*peerId|peerId *[=!]== *[a-zA-Z_.]*projectId" src/`
  → no matches);
- the descriptor carries **no project content** — no journal, no asset, no
  proof, no scope (`SPEC-PROMPT-UX-B.md` §43).
- the resolver path (§10, below) is explicit that a proposal of a peer id is not
  how a message gets addressed: the **directory's** binding wins, always
  (`src/interaction/cross_project_host_adapter.ts:121-137`).

### 2.1 A binding is not authority

This matters most when a message arrives. Anyone can put `sourceProjectId: "A"`
in a body string. That claim must not become power:

```text
CrossProjectRequest != RemoteAuthority
CrossProjectRequest != RemoteWorkAdmission
RemoteProject != LocalProjectScope
```

When project B receives a request **claiming** it came from A, B checks the
claimed source against the authenticated sender using its *own* directory. If the
sender's peer is not bound to A, the classification is
`SOURCE_BINDING_MISMATCH` and **no processing happens**
(`src/interaction/cross_project.ts:459-471`). The claimed project id is used for
exactly two things: a binding check, and display. It is never passed to a
workspace read — and there is no federation call site that could accept a scope
even if someone tried (audit SC-17).

## 3. A read-only directory, and why "unknown" is not "empty"

The directory that answers "which project is behind which peer" is
**deployment-owned, read-only and non-canonical**:

```text
observeProjects(): ObservationKnowledge<readonly ProjectPeerDescriptor[]>
```

`ObservationKnowledge` is the kernel's existing three-valued discipline —
`known | unknown | error`. Reusing it is the whole design of §8, because a
deployment that cannot observe its directory must be able to *say so*. The
alternatives are both wrong:

- an empty list would read as "there are no other projects", which is a **claim
  the deployment cannot make**; and
- a fabricated entry would be a lie with a peer address on it.

So: `unknownProjectPeerDirectory(detail)` exists explicitly for a deployment that
has not configured a directory (`src/interaction/project_peer_directory.ts:209-215`),
and target resolution maps `unknown`/`error` to `DIRECTORY_UNKNOWN` /
`DIRECTORY_ERROR` with an empty candidate list, never to "no such project"
(`:328-353`).

Two more consequences a product reader should know:

- **The directory is validated as a whole.** A malformed descriptor set fails
  closed rather than being partially accepted, because a half-read directory would
  make resolution depend on which half happened to parse
  (`src/interaction/project_peer_directory.ts:161-181`).
- **Two projects may honestly share a human name.** A duplicate `displayName`
  across *different* descriptors is deliberately **not** malformed — that is
  exactly what `TARGET_AMBIGUOUS` is for. A duplicate `projectId`, or one alias
  bound to two projects, *is* malformed, because that is a broken deployment
  binding rather than an honest ambiguity (`:150-160`).

### 3.1 The optional model-backed resolver is untrusted by construction

A host may supply an optional `ProjectTargetResolverPort` (`SPEC-PROMPT-UX-B.md`
§10) so a user can say something fuzzier than an exact name. Its output is a
**candidate**, and the directory revalidates it under a fresh observation
(`src/interaction/cross_project_host_adapter.ts:144-197`). A resolver that names a
project the directory does not bind produces `TARGET_UNKNOWN` — never a send.
There is no model in core resolution itself (§9).

## 4. The firewalls, for a product reader

Each row is a separation that would be a defect if it collapsed. The enforcement
column is where to look in the code; the evidence column is where it is proven.

| Firewall | What it means in product terms | Enforced at | Proven by |
| --- | --- | --- | --- |
| `ProjectId != PeerRef` | a project is not its address | `src/interaction/project_peer_directory.ts:66-148` | UXB-N01 (`test/uxb_cross_project.test.ts:305`) |
| `ProjectName != PeerIdentity` | the product never shows a peer id as the project | `src/interaction/cross_project_result.ts:188-195` | UXB-N01; dogfood `discovery_never_exposes_a_peeref_as_project_identity` |
| `ProjectPeerBinding != Authority` | knowing and routing to a project grants no power over it | `src/interaction/cross_project.ts:459-478` | UXB-N02 (`:342`), N13 (`:643`) |
| `ProjectPeerBinding != Ownership` | the binding is deployment metadata, not possession | `src/interaction/project_peer_directory.ts:1-29` | UXB-N02; §43 field set |
| `Ask != Commitment` / `!= Assignment` / `!= WorkTask` | a question is not an obligation and not work | `src/interaction/cross_project.ts:136-149` | UXB-N06/N07 (`:446`), N08/N09 (`:469`) |
| `Answer != Evidence` / `!= Truth` / `!= Decision` / `!= Commitment` | a reply is text, not project truth | `src/interaction/cross_project_result.ts:3-14` | UXB-N20 (`:962`); dogfood `answer_is_not_auto_imported` |
| `MessageDelivery != Receipt` | arriving is not being read | transport vs `inbox.received` | dogfood `remote_pump_ingests_the_authenticated_message` |
| `Receipt != Agreement`, `Ack != Agreement` | acknowledging is not agreeing | `src/interaction/cross_project.ts:1274-1282` | UXB-N19 (`:938`), N20 |
| `CrossProjectRequest != RemoteAuthority` | a hostile request cannot widen scope | `src/interaction/cross_project.ts:32-44` | UXB-N15 (`:744`), N14 (`:695`) |
| `CrossProjectRequest != RemoteWorkAdmission` | receiving a question admits no work | `src/interaction/cross_project.ts:436-479` | same |
| `RemoteProject != LocalProjectScope` | the other project's data stays its own | `src/interaction/cross_project.ts:32-44` | UXB-N29 (`:1333`); §6 below |
| `UserTaskText != ProjectContextDump` | the task is the task, not the project | `src/interaction/cross_project_protocol.ts:106-115` | UXB-N10/N11 (`:499`), §47 (`:1602`) |
| `MinimalContext != WorkspaceSnapshot` | opt-in context is copied, never assembled | `src/interaction/cross_project.ts:186-199` | UXB-N11; dogfood `raw_transport_envelope_carries_no_workspace_sentinel` |
| `OneRequest != ExactlyOnce` | a repeat ask is a new message; a replayed one is a no-op | `src/interaction/cross_project.ts:1049-1058` | UXB-N21 (`:997`), N22 (`:1036`) |

Two rows deserve one extra sentence.

**`Ask != Commitment`.** A commitment means durable responsibility — someone has
taken on an obligation. An information request is not that, and inflating a
conversation into an obligation creates responsibility nobody asked for
(`SPEC-PROMPT-UX-B.md` §22/§23). So an Ask is one `sendMessage`: no
`COMMITMENT_OFFERED` row, no `CommitmentScope`, no acceptance path. And it is not
only a design choice — it is falsifiable:
`grep -rn "offerCommitment\|acceptCommitment\|COMMITMENT_OFFERED" src/interaction/cross_project*.ts`
returns nothing, and the rig shows the commitment count, ProjectIR revision, and
shared Journal row count identical before and after.

**`Answer != Truth`.** The origin accepts an answer only from the exact peer the
request was addressed to, on the request's own derived thread, with a matching
request id, with the responder project bound to that peer in the directory, and
only from the **authenticated** inbox (`src/interaction/cross_project.ts:832-862`).
Everything else is refused, and a refused answer leaves the request `WAITING`
(`:923-932`).

What "authenticated" means here is worth stating plainly, because it is easy to
over-claim: an inbound message is authenticated only in the sense that the *local*
transport adapter asserted a peer for it from its own durable ledger (audit SC-4).
The kernel cannot prove more, and no document in this set says "cryptographically".
The **real** defence for an Ask is the directory binding — which is the product's
own check, and is why the source/target binding proofs matter.

## 5. Why v1 has no obligation

The target UX is an information request, so v1 supports exactly one intent,
`ASK_PROJECT` (`SPEC-PROMPT-UX-B.md` §6). Deliberately absent:

```text
DELEGATE_PROJECT      ASSIGN_PROJECT      ACCEPT_REMOTE_WORK      PROJECT_COMMITMENT
```

A question that has no answer **stays `WAITING`** and can never become a
"failure", and there is no obligation that an unanswered ask could breach
(`SPEC-PROMPT-UX-B.md` §22). A request can still be `DECLINED` or `PARTIAL` — but
a decline is a *reply*, not a broken promise, because no promise was made.

That is the line between UX-B and UX-C:

| | UX-B (shipped) | UX-C (not implemented) |
| --- | --- | --- |
| Ask another project a question | yes | — |
| Receive an answer later, automatically surfaced | yes | — |
| Durable delegation / commitment-first workflow | **no** | candidate |
| Selected project-context attachments | **no** (only opt-in `contextText`) | candidate |
| Multi-recipient Ask, multi-project synthesis | **no** | candidate |
| Remote timeout / cancellation | **no** | candidate |
| Model-backed project resolver in core | **no** (host opt-in seam only) | candidate |

UX-C is chosen from real friction, not scheduled here
(`SPEC-PROMPT-UX-B.md` §79; `docs/engineering/audits/UX-B-CARRY-FORWARD.md`).

## 6. Two projects sharing files, on purpose

The most load-bearing evidence in this stage is not the friendly path — it is the
adversarial one. The rig composes two live projects that **really do share
physical Project Workspace files**: one Project Journal file and one
AssetAssociation file each holding both projects' scopes, opened through a
separate handle per installation. It then seeds a secret in each scope and
attacks:

```text
federation is active on both sides
the shared files really hold BOTH scopes      (a third direct handle lists A and B)
an authenticated message really crosses       (inbox.received, unverified == 0)
foreign workspace reads fail closed           (fences refuse A's id from B and B's from A)
no secret crosses in any form                 (neither sentinel appears in the ledger)
```

HONEST — what this does **not** claim: no federation call site accepts a project
or workspace scope at all, so the rig proves the **absence of a reachable
foreign-read path together with the fence behaviour** — not that a bypass was
attempted and blocked (audit SC-17). That distinction is stated in the evidence
document, in the rig's own header, and here, because the honest version is the
useful one: it tells a future reader exactly what property was verified.

The full proof is `docs/engineering/audits/UX-B-CF-AE-R-05-EVIDENCE.md`.

## 7. What stays underneath

UX-B is a thin composition. It owns no store, mints no coordination event, adds
no transport operation kind, grants no authority, invents no agent identity,
schedules nothing and touches no PIAS or external-asset path. The proofs, with
runnable greps, are `docs/engineering/audits/UX-B-CROSS-PROJECT-ANTI-WASTE.md`.

```text
one user request
→ one asked question
→ one answer
→ surfaced when it exists
kernel complexity stays underneath
```
