# UX-B — One-request cross-project collaboration delivery report

Stage: **UX-B — One-Request Cross-Project Collaboration** (Palimpsest product track).
Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Branch: `experiment/ux-b-cross-project`.
Spec: `SPEC-PROMPT-UX-B.md`.
Gap assessment (UX-B0, 22 binding corrections): `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md`.
Anti-waste: `docs/engineering/audits/UX-B-CROSS-PROJECT-ANTI-WASTE.md`.
`CF-AE-R-05` evidence: `docs/engineering/audits/UX-B-CF-AE-R-05-EVIDENCE.md`.
Carry-forward: `docs/engineering/audits/UX-B-CARRY-FORWARD.md`.
Host integration: `docs/engineering/audits/UX-B-CROSS-PROJECT-HOST-INTEGRATION.md`.
Product docs: `docs/product/ONE-REQUEST-CROSS-PROJECT-COLLABORATION.md`,
`docs/product/PROJECT-TO-PROJECT-INTERACTION.md`.

The stage is deliberately thin: **five new modules** in the existing interaction
layer, **four modified product faces plus the launcher profile**, one adversarial
suite and one real two-project rig. It adds no store, no canonical event, no
transport operation kind, no authority, no Agent identity and no scheduler
(`SPEC-PROMPT-UX-B.md` §1, §13, §18, §34, §69, §72).

## 1. What changed, per file

### 1.1 New — `src/interaction/**` (spec §72)

**`src/interaction/project_peer_directory.ts`** (new, 369 lines) — the READ-ONLY
project↔peer deployment directory. `ProjectPeerDirectoryError` and its closed
reason set (`:40-55`); `ProjectPeerDescriptor` with exactly the §7/§43 routing
field set (`:66-72`); the strict materializer with the unknown-field, missing-field,
stable-id, duplicate-alias and malformed-peer refusals (`:114-148`); whole-set
validation where a duplicate `projectId`/alias is malformed but a duplicate
`displayName` across different projects is deliberately **not** (`:161-181`); the
`ProjectPeerDirectoryPort` reusing `ObservationKnowledge` (`:187-190`); the two §42
adapters `staticProjectPeerDirectory` (`:193`) and `unknownProjectPeerDirectory`
(`:209`); the fault-to-`error` observation helper (`:222-237`); the five §9
outcomes, explicitly *mirroring* the existing discipline rather than adding kernel
statuses (`:243-255`); the pure exact resolver `resolveProjectTargetIn` (`:281-322`);
the fresh-observation resolver `resolveProjectTarget` (`:328-353`); and the two
binding lookups `descriptorForPeer` / `descriptorForProject` (`:356-369`).
Corrections honoured: SC-10 (genuinely new — nothing in the tree bound a name to a
peer), SC-11 (five outcomes mirror `known | unknown | error`), SC-22 (named so it
never collides with `src/federation/directory.ts`).

**`src/interaction/cross_project_protocol.ts`** (new, 498 lines) — the strict,
versioned product envelope. The §63 product maxima as explicit constants
(`CROSS_PROJECT_MAX_TASK_CHARS = 4_000`, `…_CONTEXT_TEXT_CHARS = 8_000`,
`…_ANSWER_CHARS = 8_000`, `…_DETAIL_CHARS = 2_000`, `…_BODY_BYTES = 32_768`,
`:51-56`); the normative schema **as data** and the digest over it (`:103-143`);
`ProjectAskEnvelope`/`ProjectAnswerEnvelope` (`:154-177`); the strict parsers
`parseProjectAskEnvelope` (`:278`) and `parseProjectAnswerEnvelope` (`:302`, with
the conditional-requirement and refusal-cannot-carry-an-answer rules at `:317-326`);
`parseCrossProjectBody` where a non-ours body is `undefined` but a malformed *ours*
body fails closed (`:355-366`); the round-trip materializers (`:372-418`);
`serializeCrossProjectEnvelope` which **refuses, never truncates** (`:428-438`);
`allocateCrossProjectRequestId` (`:452-470`); `threadIdForRequest` under the
existing `ThreadRef` grammar (`:478`); and `projectAnswerContentDigest` used to
collapse identical duplicates (`:488`). Corrections honoured: SC-13 (the kernel
does not bound `body`, so the maxima are UX-B's), SC-14 (the random-`messageId`
decision, documented at `:15-29`).

**`src/interaction/cross_project_result.ts`** (new, 234 lines) — the §59 projection
and the §60 copy. The ONE shared status vocabulary (`:35-51`); the terminal-status
helper (`:61-65`); `CrossProjectResultDetails` with ids deliberately out of the
primary UX (`:72-79`); `CrossProjectOutboundPacket` — the exact packet as a
first-class field (`:87-97`); `CrossProjectCollaborationResult` (`:99-115`);
`projectPhrase`/`CROSS_PROJECT_COPY`/`crossProjectSummaryOf` in plain product
language (`:121-186`); `projectNameOf` which deliberately never falls back to a
`PeerRef` (`:188-195`); and `crossProjectResultOf`, which freezes, sorts and dedupes
(`:198-234`). Correction honoured: SC-6 (no view can contain both directions, so
the projection is a pure derivation).

**`src/interaction/cross_project_host_adapter.ts`** (new, 197 lines) — the two host
seams. `CROSS_PROJECT_INBOUND_REQUEST_TEXT` / `…_ANSWER_TEXT` (`:39-44`);
`crossProjectAttentionText(signal, role)` which reads only the signal's routing
metadata and never a body (`:65-74`); `CROSS_PROJECT_HOST_TEXTS` (`:77-80`); the
untrusted `ProjectTargetResolverPort` and its honest null object (`:93-105`);
`revalidateTargetCandidate` where the directory's binding always wins (`:121-137`);
and `resolveProjectTargetWithResolver` returning the same five §9 outcomes
(`:144-197`). Corrections honoured: SC-3 (the surface exposes only `policyId` +
`pending()`, so activation stays host-side) and SC-21 (the signal carries no
message content, so the text can only instruct the principal to look).

**`src/interaction/index.ts`** — the barrel now re-exports the five new modules
(`:28-32`), with the deliberate-absence note for the forbidden module names
(`:18-21`).

### 1.2 Modified product faces

**`src/application/surface.ts`** — `CrossProjectApplicationSurface` declared with
its eight members including the **new** `acknowledge` product path
(`:491-512`); the service dep declared (`:740`, `:808`); the face composed
(`:1210-1232`), where `acknowledge` strict-parses the caller's `PeerMessage`
through `parsePeerMessage` so a caller cannot acknowledge a shape the federation
service would not itself produce; and returned (`:1524`). Correction honoured:
SC-7 (the missing `acknowledge` path) and SC-15 (a new face is wired in four
places, not one).

**`src/tools/application_tools.ts`** — `palimpsest_cross_project` defined with
exactly `actions: ["projects", "prepare", "ask", "status", "pending", "respond",
"receive", "acknowledge"]` (`:586-638`), deriving `requestedBy` itself (`:617`,
`:625`) so a caller cannot supply an identity or an authority; the tool-discovery
flag (`:124`).

**`src/application/http.ts`** — the `crossProject` entry in
`GET /api/application/surfaces` (`:191`) and the eight routes
`/api/cross-project/{projects,prepare,ask,status,pending,respond,receive,acknowledge}`
(`:206-245`), with the §67 note that plain HTTP authentication is not a new
authority grant.

**`src/install.ts`** — the `projectPeerDirectory` install option (`:273`); the
`crossProject` service option declared (`:622`); the composition gated on
`projectPeerDirectory` **and** `localPeer` **and** federation, absent-by-default so
a face is never a stub (`:2256-2266`); the application wiring (`:2300`); the tool
gate so a cross-project-only deployment still gets its tool face (`:2350`); and the
installed export (`:2392`). Correction honoured: SC-1 (this is `installPalimpsest`,
which composes no pump).

**`src/deployment/profile.ts`** — `DeploymentProjectDirectoryEntry`
(`:35-41`); the additive `projectDirectory` profile field with its bounded,
additive contract (`:93-99`); and `parseProjectDirectory` with the same
fail-closed discipline as the descriptor materializer, including the duplicate
alias across projects and the display-name-not-also-an-alias rules (`:192-231`,
wired at `:336`). HONEST: the profile parser validates but does not `Object.freeze`
the descriptor set; freezing happens when `launchDeployment` materializes it
through `staticProjectPeerDirectory` (`src/deployment/launch.ts:164-183`).

**`src/deployment/launch.ts`** — `deploymentProjectDirectory`
(`:164-183`), the launcher-side read-only `ProjectPeerDirectoryPort` over the
profile's entries; `projectPeerDirectory` derived from the profile (`:278`); and
`knownIndependentPeers` derived from the SAME descriptor directory (`:282-285`),
wired into the install (`:334-335`). Corrections honoured: SC-9 (the launcher never
passed peers, so UX-A's COORDINATE handoff was unreachable and "AUTO cannot
silently cross projects" was only **vacuously** true — now both are observable) and
SC-19 (the vacuity is labelled and lifted rather than hidden).

### 1.3 New — tests and the rig

**`test/uxb_cross_project.test.ts`** (new, 1909 lines, **38 tests**) — UXB-N01…N29
on real installs plus the §47 raw-envelope proof, the protocol/§10/§61 proofs and
the product-face proofs. UXB-N30 is the full-suite gate and is **not** faked
in-suite (§6).

**`scripts/interaction/uxb-two-project-dogfood.mjs`** (new, 442 lines) — the §51
golden path and the §48/§49/§50 `CF-AE-R-05` rig: two live installs over one shared
durable transport ledger, one shared Journal file and one shared AssetAssociation
file, with the two §49 secrets seeded in their own scopes.

**Eight documents** (this set) — spec §73 plus this stage's host-integration note.

## 2. Delivered behaviour

1. **One product request asks another existing project.** `application.crossProject.ask({target,
   task, requestedBy})` resolves a project **name** to an addressable peer and sends
   exactly one ordinary peer message. The rig: `ask_resolves_the_project_and_reports_sent_not_a_synchronous_answer`.
2. **Preparation is read-only and exact.** `prepareAsk` shows the exact outbound
   packet as a first-class field and sends nothing
   (`src/interaction/cross_project.ts:662-705`; rig
   `prepare_ask_sends_nothing`, `prepare_ask_targets_B_and_contains_only_the_task`).
3. **Target resolution is exact and deterministic, with five outcomes.** Unknown
   and ambiguous targets send **nothing** and show the candidates
   (`src/interaction/project_peer_directory.ts:281-322`; UXB-N04). An unobservable
   directory is `DIRECTORY_UNKNOWN`/`DIRECTORY_ERROR`, never an empty directory
   (UXB-N03).
4. **The binding is re-checked immediately before sending.** A stale binding yields
   `STALE_TARGET_BINDING` and sends nothing (UXB-N05;
   `src/interaction/cross_project.ts:739-762`).
5. **The request rides the existing protocol.** `PeerMessage.body` carries a strict
   versioned envelope; federation still sees `peer_message`; no new event type, no
   new operation kind, no new store (§13; anti-waste §2/§3).
6. **The remote project's Attention path resumes its principal.** The rig ingests
   the message (`received: 1`, `unverified: 0`) and the Attention service really
   emits `inbound_peer_message` (`remote_attention_emitted_an_inbound_peer_message`).
   `crossProjectAttentionText` is the host formatter for that signal (§33/§61).
7. **The remote principal answers directly, or through its own UX-A run.**
   `respond(id, {status, answer})` is the direct path
   (`remote_focus_answers_directly_without_explore`); `respond(id, {compose: {task,
   intent}})` calls the EXISTING `application.collaboration.run` with no new remote
   protocol (`remote_uxa_collaboration_can_answer`; §52). When the deployed stack
   genuinely cannot serve the requested intent, the answer is `DECLINED` with the
   real reason, never a fabricated answer
   (`remote_uxa_capability_gap_is_honest_not_fabricated`; §7.2 below).
8. **Status is derived, never stored.** `status()` is a pure read over the
   installation's own outbound thread plus its authenticated inbox
   (`src/interaction/cross_project.ts:879-996`; UXB-N19). No response is `WAITING`,
   not failure (`unanswered_request_is_waiting_not_failed`).
9. **Answers are accepted only from the expected bound peer.** The answer must be
   in `inbox.received`, from the peer the request was addressed to, on the derived
   thread, with the matching request id, with the responder project bound to that
   peer in the directory, and strictly parsed
   (`src/interaction/cross_project.ts:832-862`; UXB-N24/N25, wrong-peer and
   unverified answers rejected).
10. **Conflicting answers are reported honestly.** Identical duplicates collapse;
    materially different terminal answers are `CONFLICT` with
    `Conflicting answers arrived from the optics project; nothing was chosen for
    you.` (UXB-N23 and the rig's
    `materially_different_terminal_answers_report_CONFLICT` /
    `conflict_picks_no_side_silently`).
11. **Acknowledgement is a product path and means "seen".** `respond` acknowledges
    the request only after the answer send resolved (`:1234-1237`; UXB-N18);
    `receive` acknowledges the surfaced answer, once (`:1266-1283`; UXB-N20).
    Acknowledgement changes no status and creates no Journal entry, Decision or
    Evidence.
12. **A replayed request forces no duplicate cognition.** `pending()` derives "this
    peer already answered" from its own outbound thread and excludes it, with the
    replayed message collapsing to one logical pending request
    (`:1049-1076`; UXB-N21; rig
    `duplicate_request_does_not_force_duplicate_cognition`).
13. **Nothing is promoted or promised.** Across a full Ask + answer + receive:
    zero commitments, no Boundary mutation, no ProjectIR revision, no Task, no
    Journal entry, no Proof/Evidence mutation (UXB-N06…N09, N19/N20; rig
    `ask_and_answer_create_zero_commitment_boundary_or_project_mutation`,
    `answer_is_not_auto_imported`).
14. **AUTO still cannot cross projects, and now not vacuously.** With peers really
    observable, AUTO stops at `CROSS_PROJECT_REQUIRED` with zero sends, and only an
    explicit Ask sends (UXB-N28; SC-9/SC-19).
15. **Two projects can share physical Workspace files under federation, and
    foreign reads fail closed.** `CF-AE-R-05 CLOSED_IN_UX_B`
    (`docs/engineering/audits/UX-B-CF-AE-R-05-EVIDENCE.md`; UXB-N29).
16. **The face is composed or absent, never a stub.** Without a
    `projectPeerDirectory` there is no `application.crossProject`, no
    `palimpsest_cross_project` and no route; the HTTP face answers `501
    surface_absent` (SC-15's lesson; `src/install.ts:2256-2266`).

## 3. What the stage did NOT change

- **No new canonical plane, store, table, migration, authority species, Agent
  ontology, scheduler or durable collaboration protocol** (§1, §13, §18, §34;
  anti-waste §1…§6, §9).
- **`src/coordination/**`, `src/transport/**`, `src/federation/**`,
  `src/attention/**` and `src/project_workspace/**` are byte-identical to the
  baseline** — `git diff --name-only 2e0f48b -- src/coordination src/transport
  src/federation src/attention src/project_workspace` is empty. This is the
  strongest form of the §4 "reuse, do not replace" claim.
- **No transport operation kind was added.** `OPERATION_KINDS` still has its five
  pre-existing members (`src/transport/envelope.ts:98-104`).
- **`PeerDirectoryPort` and `peerDirectoryPort` are untouched.** The new port is
  separate and lives in `src/interaction/` (SC-22).
- **`requestContact` is still not used** for an Ask (SC-8); `sendMessage` is the
  primitive.
- **No PIAS or external-asset coupling** (§64; anti-waste §10). No shipped host
  gained a resolver.
- **No web UI.** The §74 web gates are regression gates only; UX-B adds no e2e
  spec.
- **No removal or narrowing of any expert tool, surface member or route.**
  `palimpsest_federation` survives (§68).
- **`MAX_BRANCH_HINT`, the advisor, the recipe compiler, the ReasoningCell,
  ProjectVerification and the operating posture are all untouched** (UX-A's carry
  items remain UX-A's).
- **The `CF-AE-R-05` AER-N17 test was not edited.** It still says "NOT PROVEN
  HERE"; the proof lives in the UX-B rig (see the evidence doc §2).

## 4. Gate results

HONEST: this report was written during the UX-B documentation pass while gate runs
were in flight, and **this author did not run the gates** (running the build, vitest,
Playwright or the dogfoods was explicitly out of scope for the documentation pass).
The figures below are the stage's certified final-tree figures; nothing in this
report is fabricated, and no commit SHA, pull-request number or CI run id is
invented here — the canonical checkpoint (§8) carries none.

| Gate | Required by | Result on the final tree |
| --- | --- | --- |
| `git diff --check` | spec §74 | exit 0 |
| `pnpm build` | spec §74 | clean |
| `pnpm exec vitest run --maxWorkers=2` | spec §74 | **166 files / 1819 tests passed** (baseline 165 / 1781) |
| `pnpm run build:web` | spec §74 | exit 0 |
| `pnpm exec playwright test` | spec §74 | 36 passed |
| `node scripts/interaction/uxb-two-project-dogfood.mjs` | spec §74 | **pass=true (41/41)** |
| `node scripts/scope/aer-boundary-dogfood.mjs` | spec §74 | pass=true |
| `node scripts/interaction/uxa-dogfood.mjs` | spec §74 | pass=true |

The spec's PASS criterion (§75) is met: one product-level request asks an existing
other project a question without the user knowing PeerRefs, threads, federation
messages or transport mechanics; project-name resolution is read-only deployment
metadata that never collapses project identity into peer identity; the outbound
packet contains only the task and explicitly supplied context; the request travels
as an ordinary message over the existing durable transport; the remote Attention
path can resume its principal, which answers directly or via its own local
collaboration and replies on the same thread; the origin accepts a terminal answer
only from the expected bound peer, surfaces conflicts honestly, and can
acknowledge a consumed answer without treating it as agreement; the whole path
creates no commitment, Work task, ProjectIR revision, Boundary mutation, Evidence
or Proof; and the real shared-workspace rig closes `CF-AE-R-05`.

## 5. Machine invariants XPR-A01…XPR-A23

Enforcement is the code that makes the invariant true; pinning is the test or gate
that fails if it is reverted. `test/uxb_cross_project.test.ts` is abbreviated
`uxb.test.ts`.

| ID | Invariant | Enforcement | Pinned by |
| --- | --- | --- | --- |
| A01 | UX-B owns no canonical truth store | `src/interaction/cross_project.ts:11-14`, `:879-991`; anti-waste §1 grep | anti-waste §1; UXB-N19 (`uxb.test.ts:938`) |
| A02 | UX-B owns no authority | `src/interaction/project_peer_directory.ts:4-6`; `cross_project.ts:136-166` | UXB-N02 (`:342`) |
| A03 | request/answer ride existing `peer_message` semantics | `src/interaction/cross_project_protocol.ts:8-13`, `:428-438` | UXB-N10/§47 (`:499`, `:1602`); anti-waste §2/§3 |
| A04 | `ProjectId` and `PeerRef` remain distinct | `src/interaction/project_peer_directory.ts:66-72`, `:281-322` | UXB-N01 (`:305`); anti-waste §5 grep over all `src/` |
| A05 | target resolution is read-only deployment metadata | `src/interaction/project_peer_directory.ts:187-190` (`observeProjects` only) | UXB-N02, UXB-N03 (`:358`) |
| A06 | an explicit Ask is required before any send | the only sends are `ask` (`cross_project.ts:766`) and `respond` (`:1235`); `prepareAsk` never sends (`:662-705`) | rig `prepare_ask_sends_nothing`; UXB-N19; product faces (`:1686`) |
| A07 | AUTO cannot silently cross projects | UX-A AUTO returns `CROSS_PROJECT_REQUIRED`; UX-B sends only under `ask` | UXB-N28 (`:1264`) |
| A08 | outbound default context is task-only | `src/interaction/cross_project_protocol.ts:106-115`; `cross_project.ts:186-199` | UXB-N10/N11 (`:499`), §47 (`:1602`) |
| A09 | foreign metadata cannot widen local workspace scope | `src/interaction/cross_project.ts:32-44`, `:436-479` | UXB-N15 (`:744`), UXB-N14 (`:695`); rig fences |
| A10 | the authenticated sender binding is checked | `src/interaction/cross_project.ts:436-479` | UXB-N12 (`:595`), UXB-N13 (`:643`) |
| A11 | an answer is accepted only from the expected bound peer | `src/interaction/cross_project.ts:832-862` | UXB-N24 (`:1103`), UXB-N25 (`:1134`) |
| A12 | an Ask creates no commitment | no commitment call site (anti-waste §4) | UXB-N06/N07 (`:446`); rig mutation check |
| A13 | an answer creates no evidence or truth | `src/interaction/cross_project_result.ts:3-14`; no proof/evidence import | UXB-N20 (`:962`); rig `answer_is_not_auto_imported` |
| A14 | thread and inbox remain the collaboration-history owners | `src/interaction/cross_project.ts:330-339`, `:879-991` | UXB-N19, UXB-N21 (`:997`) |
| A15 | no cross-project request store | state derived per call; no store module (anti-waste §1) | UXB-N21; anti-waste §1 |
| A16 | Attention remains the activation owner | `src/interaction/cross_project_host_adapter.ts:21-23` | rig `remote_attention_emitted_an_inbound_peer_message`; UXB-N29 |
| A17 | transport remains mechanical and at-least-once | no transport import (anti-waste §3) | rig raw-envelope checks; anti-waste §3 |
| A18 | duplicate delivery is semantically safe | `src/interaction/cross_project.ts:1049-1058`, `:948` | UXB-N21, UXB-N22 (`:1036`) |
| A19 | one user request may complete asynchronously | `ask` returns after one send (`:764-784`) | rig `origin_status_shows_the_answer_without_a_second_user_request`; UXB-N19 |
| A20 | `CF-AE-R-05` closes only by real proof | the four-bullet rig | `UX-B-CF-AE-R-05-EVIDENCE.md`; UXB-N29 (`:1333`) |
| A21 | no new kernel semantic species | `git diff` empty over coordination/transport/federation/attention/project_workspace | anti-waste §2/§3 |
| A22 | full regression green | the suite | `pnpm exec vitest run --maxWorkers=2` (UXB-N30) |
| A23 | required CI green | the CI gates | the CI run for this branch (UXB-N30) |

## 6. UXB-N01…N30 coverage map

`test/uxb_cross_project.test.ts` — **38 tests**. Line numbers are describes.

| ID | Property | Where pinned |
| --- | --- | --- |
| N01 | `ProjectId != PeerRef`; a descriptor binds, neither is derived | `:305` |
| N02 | the binding grants no authority and no ownership | `:342` |
| N03 | an unknown directory is never an empty directory | `:358` |
| N04 | an ambiguous target sends nothing | `:382` |
| N05 | a stale project↔peer binding sends nothing | `:408` |
| N06/N07 | Ask != Commitment; zero commitments across the full path | `:446` |
| N08/N09 | Ask mutates no Boundary and no ProjectIR | `:469` |
| N10/N11 | the packet carries the task and ONLY explicit `contextText` (+ §47 raw envelope) | `:499` |
| N12 | an inbound request requires the authenticated peer (injection stated honestly, SC-5) | `:595` |
| N13 | the claimed source project must match the authenticated sender | `:643` |
| N14 | the envelope's target must be this installation's project | `:695` |
| N15 | a remote request cannot address the source project's workspace | `:744` |
| N16 | the response target is derived from the authenticated request | `:804` |
| N17 | the response uses the same request and thread | `:835` |
| N18 | the request is acknowledged only after the response send resolved | `:858` |
| N19 | `status()` is read-only; no response means `WAITING` | `:938` |
| N20 | `receive()`'s ACK is not agreement (and not an import) | `:962` |
| N21 | a replayed request forces no duplicate cognition | `:997` |
| N22 | identical duplicate answers collapse | `:1036` |
| N23 | materially different answers are `CONFLICT` | `:1065` |
| N24 | a wrong peer's answer is rejected | `:1103` |
| N25 | an unverified answer is rejected | `:1134` |
| N26 | the remote project can answer using its EXISTING local collaboration | `:1184` |
| N27 | the remote project can answer directly with no Explore | `:1214` |
| N28 | one user request needs no project switching; AUTO cannot cross projects | `:1264` |
| N29 | the `CF-AE-R-05` properties over shared physical workspace files | `:1333` |
| — | protocol: strict parse, maxima, identity derivation | `:1416` (6 tests) |
| — | §47 the raw outbound envelope is minimal by construction | `:1602` |
| — | product faces: discovery, HTTP routes and the agent tool | `:1686` |
| — | §10 an untrusted resolver proposes; the directory decides | `:1822` (3 tests) |
| — | §61 the host instruction texts carry no message content (SC-21) | `:1880` |
| **N30** | **full regressions green — the SUITE GATE, not an in-suite assertion** | `pnpm exec vitest run --maxWorkers=2` (**166 files / 1819 tests passed**, baseline 165 / 1781), plus `pnpm exec playwright test` (36 passed), `pnpm run build:web` and `pnpm build` |

**N30 is the suite gate.** It is deliberately **not** asserted inside the UX-B
suite: a stage cannot prove the whole regression set green from inside one of its
files. No document in this set may describe N30 as an in-suite test — the row above
names the actual gate that must show it.

## 7. Honest limitations

### 7.1 "Authenticated" is not cryptographic (SC-4)

An inbound message is authenticated only because the **local** transport adapter
asserted a `PeerRef` for it from its own durable ledger. The kernel cannot prove
more. The real defence for a cross-project Ask is the **directory binding**, which
UX-B implements itself (`src/interaction/cross_project.ts:46-54`, `:817-831`). No
document in this set says "cryptographically authenticated", and none should.

### 7.2 A launched deployment cannot fan out

A profile-launched deployment composes no reasoning, so an EXPLORE/PARALLEL
`compose` answer request returns `CAPABILITY_REQUIRED`, which UX-B maps to
`DECLINED` rather than fabricating an answer. The composition path is proven with
the intent the deployed stack can serve (FOCUS ⇒ a real multi-agent answer), and
the Explore variant is proven in-suite with a hand-composed install (UXB-N26).
Carried as `CF-UXB-01`. This is the one place where the headline promise is
narrower than the architecture.

### 7.3 The pump is host-driven

`launchDeployment` starts nothing; only the DSH runner has an unconditional
attention loop, and the CLI needs `--pump` (SC-2). The dogfood drives
`pumpAndActivate()` explicitly, as a host loop does. The promise therefore needs a
live host; this stage deliberately adds no second scheduler. See
`docs/engineering/audits/UX-B-CROSS-PROJECT-HOST-INTEGRATION.md`.

### 7.4 `crossProjectAttentionText` is exported and tested but not wired into the shipped runner

`crossProjectAttentionText` (`src/interaction/cross_project_host_adapter.ts:65`)
is exported, unit-tested and proven to carry no message content (UXB-N29's
attention assertion at `uxb.test.ts:1405` and the §61 describe at `:1880`), but the
shipped DSH runner calls the attention adapter **without** it
(`host/dsh/lib/runner.js:331-341`) and the host's activation adapter receives no
`resume` (`:335-338`), so the DSH resume branch is unreachable. The seam is
delivered; the wiring is a host decision. Carried as `CF-UXB-02`/`CF-UXB-03`.

### 7.5 `pending()` throws when the directory cannot be observed

Deliberate (unknown is never an empty list) but asymmetric with `projects()`, which
returns a `state`. A host loop must not swallow the throw into an empty list.
Recorded in anti-waste §11.3 and carried as `CF-UXB-06`.

### 7.6 Residual costs recorded rather than fixed

The random-`messageId` decision (SC-14), the product maxima being UX-B's own bound
(SC-13), and the `projectPhrase` article-doubling on a phrase-shaped `displayName`
(observed in the rig's own prepare detail) are all recorded in anti-waste §11 and
carried. None is a defect; each is a price.

### 7.7 The `CF-AE-R-05` claim is narrower than its title

`CF-AE-R-05` is closed as "no reachable foreign-read path + fences hold", **not** as
"a bypass was blocked". That distinction is stated in the evidence doc, in the
rig's own header and in the evidence JSON's `honestNotes.scope_claim`, because it
is exactly the overstatement the AE-R gate review caught once already (SC-17).

### 7.8 `CF-AE-R-08` (concurrent writers) is unchanged

Two installations actively writing the same physical association/journal file at
the same instant is still not a supported or tested shape. The UX-B rig serialises
its writes. This stage does not close it.

### 7.9 The optional answer gate is implemented but unwired

The service accepts an optional `domainGate` that can only ever **refuse** to answer
a remote Ask (`src/interaction/cross_project.ts:358-362`, consulted at `:1227-1231`).
No caller supplies it: `install.ts` composes the service without a gate
(`src/install.ts:2259-2265`) and `grep -rn "domainGate" src/` returns only the two
lines inside `cross_project.ts`. Every shipped deployment therefore answers whenever
the directory binding checks pass, which is exactly what an absent gate means — but
the configuration path does not exist. Carried as `CF-UXB-09`.

### 7.10 The doc set is written during in-flight gates

This documentation pass read the tree and ran only read-only commands plus the
anti-waste greps. It ran no gate. §4's figures are the stage's, not this
document's.

## 8. Canonical checkpoint

Recorded after merge.

```text
baseline                       2e0f48b2b915e9a58c28313d9bc0e046c97b1669
implementation commit          ffb2d55  "feat(ux-b): one-request cross-project collaboration"
pull request                   #112  experiment/ux-b-cross-project -> main
PR checks                      run 35122069430  attempt 1  unit pass / e2e pass
merged commit (canonical main) 390623b51128bc2e01a39373522484856ea08618
  "Merge pull request #112 from orangeofcarl0-sys/experiment/ux-b-cross-project"
tree identity                  git diff ffb2d55 390623b5  ->  EMPTY (identical trees)
canonical main run             35122316032  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
git diff --check
pnpm build
pnpm exec vitest run --maxWorkers=2
pnpm run build:web
pnpm exec playwright test
node scripts/interaction/uxb-two-project-dogfood.mjs   # expect pass=true (41/41)
node scripts/scope/aer-boundary-dogfood.mjs            # expect pass=true
node scripts/interaction/uxa-dogfood.mjs               # expect pass=true
```
