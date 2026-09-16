# UX-B — Cross-project anti-waste

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` §69 (the ten proofs), §13/§22/§23/§34/§63/§64/§72.
Gap assessment: `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md`.
Delivery: `docs/engineering/audits/UX-B-DELIVERY.md`.

§69 asks UX-B to *prove* ten negatives. Each one below states the mechanism that
makes it true and a `grep` (or `git diff`) a reader can run. **Every command and
every output in this document was executed against the final tree while writing
it**; `exit=1` from `grep` means "no matches", which is the wanted result.

The UX-B modules under test are exactly the five new files (spec §72):

```bash
UXB="src/interaction/cross_project.ts src/interaction/cross_project_protocol.ts \
src/interaction/cross_project_result.ts src/interaction/cross_project_host_adapter.ts \
src/interaction/project_peer_directory.ts"
```

---

## 1. No canonical store

**Mechanism.** Every piece of request state is derived per call from two EXISTING
views — this installation's own outbound thread plus its authenticated inbox
(`src/interaction/cross_project.ts:18-23`, `:879-991`). There is no request store,
no message store and no remote-result store, and no SQLite import anywhere in the
layer. The only in-memory value is a mechanical per-content sequence number used
so `prepareAsk` and the immediately following `ask` derive the *same* `requestId`;
it holds no semantic state and forgetting it can only mint a new correlation id
(`src/interaction/cross_project.ts:547-570`).

```bash
$ grep -rn "sqlite\|Sqlite\|CREATE TABLE\|appendEvent\|.insert(\|.upsert(" $UXB
exit=1
```

The five modules §72 forbids do not exist:

```bash
$ ls src/interaction/cross_project_store.ts src/interaction/project_federation_store.ts \
      src/interaction/remote_agent_manager.ts src/interaction/project_router_truth.ts \
      src/interaction/cross_project_scheduler.ts
ls: cannot access 'src/interaction/cross_project_store.ts': No such file or directory
ls: cannot access 'src/interaction/project_federation_store.ts': No such file or directory
ls: cannot access 'src/interaction/remote_agent_manager.ts': No such file or directory
ls: cannot access 'src/interaction/project_router_truth.ts': No such file or directory
ls: cannot access 'src/interaction/cross_project_scheduler.ts': No such file or directory
```

`git diff --name-only 2e0f48b -- src/interaction` lists exactly one modified file
(`src/interaction/index.ts`, the barrel) — the store names could not have been
added elsewhere in the layer.

## 2. No new Coordination event

**Mechanism.** The protocol rides an ordinary `PeerMessage.body`; federation still
sees `peer_message`. The layer never names a coordination event type, never
touches a coordination store and never appends one — the `MESSAGE_PREPARED` /
`MESSAGE_DELIVERED` / `MESSAGE_RECEIVED` / `ACK_RECORDED` rows are written by the
EXISTING federation services the layer calls (`src/interaction/cross_project.ts:
330-339`, `:766`, `:1235`, `:1237`).

```bash
$ grep -rn "CoordinationEventType\|coordinationStore\|appendCoordination\|COORDINATION_STORE_DOMAIN" $UXB
exit=1
```

And no coordination or transport source changed, so `CoordinationEventType`
(`src/coordination/store.ts:63-79`) has no UX-B member:

```bash
$ git diff --name-only 2e0f48b -- src/coordination src/transport src/federation src/attention src/project_workspace | wc -l
0
```

## 3. No new transport operation kind

**Mechanism.** `ask()` and `respond()` call the EXISTING
`FederationService.sendMessage`, which the layer sees through a structural port
(`src/interaction/cross_project.ts:330-339`). Nothing in the layer imports the
transport, mints an `operationId`, or names an operation kind.

```bash
$ grep -rn "from \"../transport\|DurablePeerOperation\|OPERATION_KINDS\|submitOperation\|peerTransportFrom" $UXB
exit=1
```

`OPERATION_KINDS` therefore still has exactly its five pre-existing members
(`src/transport/envelope.ts:98-104`), and `src/transport/**` is unchanged since
the baseline (proof 2's `git diff`).

**The messageId decision (audit SC-14), stated deliberately.** The durable
transport's `operationId` *is* the `messageId`, and `submit` fails closed with
`transport_operation_conflict` when the same id is resubmitted with different
content (`src/transport/ordarium_transport.ts`). Deriving `messageId` from
`requestId` would therefore make a legitimate re-send of an *edited* request hard-
fail at the transport, and would collapse two genuinely distinct sends into one.
So UX-B **keeps the kernel's random `messageId`** and never derives it; the
`requestId` is correlation **inside** the body
(`src/interaction/cross_project_protocol.ts:15-29`). §16 explicitly does not
promise exactly-once user-request creation, so a re-sent Ask is a NEW message —
which is the honest reading of `OneRequest != ExactlyOnce`. This is a cost, not a
defect; it is restated in §11.1 and carried as `CF-UXB-07`.

## 4. No new commitment semantics

**Mechanism.** V1 has one intent, `ASK_PROJECT`; there is no DELEGATE, ASSIGN,
ACCEPT_REMOTE_WORK or PROJECT_COMMITMENT field, and a caller that tries to smuggle
one is refused as an unknown field (`src/interaction/cross_project.ts:136-166`).
No commitment mutation is reachable from the layer.

```bash
$ grep -rn "offerCommitment\|acceptCommitment\|rejectCommitment\|releaseCommitment\|supersedeCommitment\|COMMITMENT_OFFERED\|COMMITMENT_ACCEPTED" $UXB
exit=1
$ grep -rn "OFFERED\|ACCEPTED\|REJECTED\|RELEASED\|SUPERSEDED\|commitmentId" src/interaction/cross_project*.ts \
  | grep -v '^[^:]*:[0-9]*: *\*'
exit=1
```

(The second command excludes doc-comment lines; the only hits without the filter
are the firewall sentences in the module header and the "never creates a
commitment" comments.) Behaviourally, the two-project rig checks the commitment
count before and after the whole path:
`ask_and_answer_create_zero_commitment_boundary_or_project_mutation`
→ `{"before":{"commitments":0,…},"after":{"commitments":0,…}}`.

## 5. No `ProjectId == PeerId` collapse

**Mechanism.** The descriptor carries both fields and the two are used for
different jobs: project fields are matched by name resolution and binding checks;
the peer field is the address a message is sent to
(`src/interaction/project_peer_directory.ts:66-148`, `:281-322`, `:356-369`). The
protocol requires `isStableIdentifier` project ids precisely so a project id
cannot carry a path or a header — it does *not* treat one as a peer id
(`src/interaction/cross_project_protocol.ts:245-252`).

```bash
$ grep -rnE "projectId *[=!]== *[a-zA-Z_.]*peerId|peerId *[=!]== *[a-zA-Z_.]*projectId|peerId: *[a-zA-Z_.]*projectId|projectId: *[a-zA-Z_.]*\.peerId" src/
exit=1
```

The empty result is over the **whole** `src/` tree, not only the UX-B modules, so
no existing caller was made to assume the collapse either. (The pre-existing
dogfood naming convention `localPeer: peer-<who>` beside `projectId: <who>` is a
test-rig convenience; the audit recorded it as such — SC-9/§1-Q3.)

## 6. No new Agent identity

**Mechanism.** `requestedBy` is a free-text attribution string supplied by the
caller and is never resolved into an identity: the tool derives it itself
(`requestedBy: "agent:palimpsest_cross_project"`,
`src/tools/application_tools.ts:617,625`) and the service passes it into the
protocol's correlation digest only
(`src/interaction/cross_project_protocol.ts:452-470`). No agent is created,
registered, named or addressed.

```bash
$ grep -rn "AgentId\|agentId\|agent_id\|AGENT_CREATED\|createAgent" $UXB
exit=1
```

## 7. No cross-project Workspace read

**Mechanism.** The layer holds no workspace dependency at all. A hostile
`sourceProjectId` can only reach a binding check and a display name; every local
read is bound to `deps.projectId` or `deps.localPeer`
(`src/interaction/cross_project.ts:32-44`, `:1000-1045`).

```bash
$ grep -rnE ".journal\(|.assets\(|projectScopedAssets\(|recordJournalEntry\(|associateAsset\(|externalAssets" $UXB \
  | grep -v '^[^:]*:[0-9]*: *\*'
exit=1
```

(Without the comment filter the only hits are the two docstring lines that state
the firewall.) The real rig attacks this from outside the layer: a genuine
authenticated message claiming `sourceProjectId: "optics"` lands at the detector
installation, and

```text
foreign_journal_read_fails_closed_from_B      invalid_registration
foreign_scoped_assets_read_fails_closed_from_B  invalid_registration
foreign_external_asset_resolve_fails_closed_from_B  no bridge
foreign_journal_read_fails_closed_from_A      invalid_registration
B_local_reads_stay_bound_to_B                 B's scope, never A's secret
```

The scope statement for that evidence is in the CF-AE-R-05 document (SC-17).

## 8. No automatic context dump

**Mechanism.** The wire schema has exactly eight ASK fields and nine ANSWER
fields, all protocol/routing/task or explicitly-supplied context
(`src/interaction/cross_project_protocol.ts:103-136`). `contextText` is optional,
copied verbatim, and never summarized or auto-filled
(`src/interaction/cross_project.ts:186-199`). The strict parsers refuse an unknown
field, so a packet cannot carry a field the reader did not see (§26, §47).

```bash
$ grep -rniE "journal|asset|proof|verification|snapshot|history|openloop" \
      src/interaction/cross_project_protocol.ts src/interaction/project_peer_directory.ts \
      src/interaction/cross_project_host_adapter.ts \
  | grep -v '^[^:]*:[0-9]*: *\*' | grep -v '^[^:]*:[0-9]*: */\*'
exit=1
```

```bash
$ grep -n "PROJECT_ASK: Object.freeze" -A 9 src/interaction/cross_project_protocol.ts
106:    PROJECT_ASK: Object.freeze([
107-      "schemaVersion",
108-      "kind",
109-      "requestId",
110-      "sourceProjectId",
111-      "targetProjectId",
112-      "task",
113-      "contextText",
114-      "protocolDigest",
115-    ]),
```

The rig inspects the **raw transport ledger** (every row of every table, not a
guessed column) and finds neither project's sentinel secret in it:
`raw_transport_envelope_carries_no_workspace_sentinel` (`ledger bytes: 1822`)
and `raw_transport_envelope_carries_the_exact_task`.

## 9. No scheduler or planner

**Mechanism.** The layer sends one message and returns. It starts no timer, holds
no loop, and adds no second activation system (§34). Distributed completion is
owned by the EXISTING inbound pump and Attention path; the host drives them.

```bash
$ grep -rnE "setInterval|setTimeout|setImmediate|queueMicrotask|[Ss]cheduler|[Pp]lanner|cron" $UXB
exit=1
```

The rig's own honest note states the boundary: it drives `pumpAndActivate()`
explicitly, which is what a host loop does; the DSH runner has an unconditional
attention loop; `launchDeployment` itself starts nothing (SC-2); and this stage
adds no second scheduler (`ae-evidence/uxb-dogfood.json`, `honestNotes.pumping`).

## 10. No PIAS scope

**Mechanism.** UX-B does not search, attach or resolve external assets or PIAS
content (§64). The layer neither imports nor names a bridge, provider or PIAS
concept.

```bash
$ grep -rniE "pias|external.?asset|provider" $UXB \
  | grep -v '^[^:]*:[0-9]*: *\*' | grep -v '^[^:]*:[0-9]*: */\*'
exit=1
```

(Without the comment filter, the two hits are the module docstrings that deny the
coupling.) A remote principal may of course use normal tools on its own side; that
is its own project's business and creates no coupling here.

---

## 11. Residual costs and limits, stated honestly

These are costs, not defects. Each one is on record so the true price of the
product layer is visible.

### 11.1 The random `messageId` decision (audit SC-14)

UX-B deliberately keeps the kernel's random `messageId` instead of deriving it
from `requestId`, because the durable transport's `operationId` **is** the
`messageId` and `submit` fails closed with `transport_operation_conflict` when the
same id reappears with different content
(`src/interaction/cross_project_protocol.ts:15-29`). Consequence: **a repeated
identical Ask is a new transport message**, not a de-duplicated one. §16 does not
promise exactly-once user-request creation, so this is consistent — but a caller
that asks the same thing three times creates three messages, and `pending()` on
the far side collapses them into **one** logical pending request only because
`requestId` matches (`src/interaction/cross_project.ts:1049-1058`; rig check
`duplicate_request_does_not_force_duplicate_cognition`).

### 11.2 The product maxima are UX-B's own bound (audit SC-13)

The kernel does not bound `PeerMessage.body`. The bounds are therefore enforced by
UX-B's own strict parser and are UX-B's responsibility to keep:

```text
task         4 000 characters      src/interaction/cross_project_protocol.ts:51
contextText  8 000 characters      :52
answer       8 000 characters      :53
detail       2 000 characters      :54
body        32 768 bytes           :56
```

Oversize is **refused, never truncated** (`:254-262`, `:428-438`; UXB-N10's
sibling test "REFUSES an oversize packet instead of truncating it" at
`test/uxb_cross_project.test.ts:1453`). A future protocol revision that raises a
bound changes the protocol digest, so two deployments that disagree about the
protocol can notice (`:103-143`). Carried as `CF-UXB-05`.

### 11.3 `pending()` throws when the directory cannot be observed

`pending()` **throws** `directory_unavailable` rather than returning an empty
list when the project directory reads `unknown` or `error`
(`src/interaction/cross_project.ts:1000-1009`). This is deliberate — an ungrounded
empty pending list is exactly the "unknown == empty" collapse the D3/D4
discipline forbids — but it is a real API asymmetry: `projects()` returns a
`state` field instead of throwing (`:620-658`). A host polling `pending()` in a
loop must therefore distinguish "no inbound questions" from "directory not
readable", and a naive `try { await pending() } catch { [] }` would reintroduce the
collapse. Recorded as a carry-forward (`CF-UXB-06`).

### 11.4 The deployment does not compose reasoning

A profile-launched deployment composes no reasoning (no cell store, no
branch-execution port), so a remote project cannot fan out: an EXPLORE/PARALLEL
`compose` answer request returns `CAPABILITY_REQUIRED` and UX-B honestly maps that
to `DECLINED` rather than fabricating an answer
(`ae-evidence/uxb-dogfood.json`, `honestNotes.deployment_wiring_gap`; rig check
`remote_uxa_capability_gap_is_honest_not_fabricated`). The composition **path** is
proven with the intent the deployed stack can serve (FOCUS ⇒ a real multi-agent
answer, `remote_uxa_collaboration_can_answer`), and the Explore variant is proven
in-suite with a hand-composed installation (UXB-N26,
`test/uxb_cross_project.test.ts:1184`). Extending the launcher profile to compose
reasoning is a host-capability decision and is carried forward as `CF-UXB-01`.

### 11.5 The user-facing copy doubles an article in a display name

Additionally observed while writing this set: `projectPhrase(name)` builds
`the <name> project` (`src/interaction/cross_project_result.ts:124-127`), so a
deployment whose `displayName` already reads as a phrase produces
`"Asked the the detector project project."` — visible verbatim in the rig's
`prepare_ask_is_read_only_and_shows_the_exact_packet` detail. This is a
deployment-convention issue (use the bare name) and a cosmetic one, but it reaches
the user-facing sentence, so it is recorded rather than hidden. Carried as
`CF-UXB-08`.

### 11.6 What is *not* a cost here

For completeness, and unlike prior stages, this stage leaves the following seams
deliberately unwired rather than half-wired — each is carried with a trigger, not
presented as reachable:

```text
crossProjectAttentionText is exported and tested, but no shipped host calls it   CF-UXB-02
the host attention loop passes no `resume`                                        CF-UXB-03
the §10 resolver seam is unwired (no shipped host supplies a resolver)            CF-UXB-04
the optional answer gate (domainGate) is implemented but no caller supplies it    CF-UXB-09
```

The full list is `docs/engineering/audits/UX-B-CARRY-FORWARD.md`.
