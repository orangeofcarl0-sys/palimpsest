# UX-B — Cross-project gap assessment (UX-B0)

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: `UX-B — One-Request Cross-Project Collaboration` (product track).
Spec: `SPEC-PROMPT-UX-B.md` §5 mandates this audit and requires the spec to be
**corrected where its assumptions are wrong** before any code. No code was written first.

Method: read the whole cross-project path — `src/interaction/**`, `src/federation/**`,
`src/transport/**`, `src/attention/**`, `src/project_workspace/**`,
`src/application/**`, `src/tools/application_tools.ts`, `src/install.ts` — **plus the
paths §5's own file list omits but which decide whether UX-B can work at all**:
`src/deployment/{launch,profile}.ts`, `src/cli.ts` and `host/dsh/lib/{index,runner}.js`
(correction SC-20). Everything below is quoted from the tree, not from intent.

---

## 1. The fifteen §5 questions

**Q1 — How is `PeerRef` discovered?** Only as an **ungrounded advertisement**:
`PeerDirectoryPort.observePeers(): Promise<ObservationKnowledge<readonly PeerAdvertisement[]>>`
(`src/federation/directory.ts:10-12`), where `PeerAdvertisement = { peer, competenceTags }`
(`src/federation/peer.ts:100-103`). `discoverContactCandidates` (`directory.ts:18-38`)
filters by competence subset and sorts lexically by `peerId`. **There is no project
dimension anywhere in the directory.**

**Q2 — Does any artifact bind a human/project name to a `PeerRef`?** **No.** A repo-wide
search finds no name/alias/`displayName` → peer mapping. The three peer-adjacent
artifacts carry peer identity only: `PeerAdvertisement.peer`, `DeploymentDirectoryEntry.peerId`
(`src/deployment/profile.ts:23-26`), `AdvisorIndependentPeer.peerId` (`src/advisor/advisor.ts:89-91`).
The only `displayName` fields in `src/**` belong to external-asset **providers**. §7's
`ProjectPeerDescriptor` is genuinely new.

**Q3 — Is `ProjectId` ever assumed equal to `PeerId`?** **No, not in production code.**
`InstallPalimpsestOptions`, `ApplicationSurfaceDeps` and `ProjectAgentDeploymentProfile`
all carry `projectId` and `localPeer` as separate fields (`src/install.ts:221,256`;
`src/deployment/profile.ts:41-47`). Federation events are written under the literal
scope `"federation"` (`src/federation/messaging.ts:45,101-105`). The collapse exists only
as a **dogfood naming convention** (`localPeer: \`peer-${who}\`` beside `projectId: who`).

**Q4 — Does the standard install compose `FederationInboundPump`?** **Not
`installPalimpsest`** — it composes the federation services and stops
(`src/install.ts:1148-1197`). **`launchDeployment` does** (`src/deployment/launch.ts:306-313`),
exposing `Deployment.pump`.

**Q5 — Who calls `pumpOnce()` in production?** Three places: `Deployment.pumpAndActivate()`
(`launch.ts:315-331`) which also drains attention and activates; `src/cli.ts:180`, which
only pumps when the operator passes `--pump <ms>`; and the **DSH runner's unconditional
attention loop** (`host/dsh/lib/runner.js:340-363`). Everything else is tests.

**Q6 — Who drains Attention and calls the activation adapter?** Only host code.
`AttentionApplicationSurface` exposes `policyId` + `pending()` and **not** `drain()`
(`src/application/surface.ts:217-222`); `drain()`/`markDelivered()` live on
`InstalledPalimpsest.attention`. Drain points: `Deployment.pumpAndActivate()` and the DSH
runner loop. (`host/dsh/lib/index.js:67` calls `launchDeployment` with **no** host
services, so `deployment.attentionActivation` is an `unavailableActivation` there and the
runner builds its own adapter.)

**Q7 — Can a cold DSH/Pi principal already be resumed by inbound peer attention?** The
derivation path is complete and proven: durable envelope → `pumpOnce` →
`recordInboundMessage` → `MESSAGE_RECEIVED` → `AttentionService` emits
`inbound_peer_message` per **unacked** `inbox.received` message → `drain()` → adapter.
The DSH adapter supports resume, but the shipped runner's attention loop passes
`agents: { get: … }` with **no `resume`** (`runner.js:335-338`), so that branch is
unreachable; the only cold resume is at process start (`runner.js:252-253`). Missing for
UX-B: the cross-project instruction text, any product path for the woken principal to
*see and answer* an ask, and any way to wake a host that is not running.

**Q8 — Does `threadView()` include inbound messages?** **No — by construction.**
`threadView` reads `MESSAGE_PREPARED` only (`src/federation/messaging.ts:240-256`);
inbound messages are `MESSAGE_RECEIVED` and appear **only** in
`inboxView(peer) = { peer, received, unverified, wakes, acks }` (`:266-293`). So a
derived request status must combine **both** — §18 is not a convenience, it is the only
possible derivation. (`threadView().wakes` is not even thread-filtered.)

**Q9 — Which federation mutation is needed for a simple question?** `sendMessage({ to,
threadId, body })` (`src/federation/messaging.ts:79-83`). `from` is derived from the
configured `localPeer` and cannot be supplied.

**Q10 — Is a commitment necessary for a simple Ask? No.** `offerCommitment` appends one
`COMMITMENT_OFFERED` row (`src/federation/commitment_service.ts:203-223`); `sendMessage`
never reads or writes commitments (`messaging.ts:108-149`), and `CommitmentScope` has no
"question" kind (`src/federation/commitment.ts:44-53`). Inflating an information request
into an obligation would create durable responsibility nobody asked for.

**Q11 — Can a remote project answer on the same thread?** **Yes.** B has
`message.from` and `message.thread.threadId`, so `sendMessage({ to: message.from,
threadId, body })` works; `threadId` needs only to be a stable identifier
(`messages.ts:42-45`). A sees it in `inbox(A.localPeer).received` with
`authenticated === true` (the pump passes `authenticatedPeer: envelope.from`).

**Q12 — Which path acknowledges processed inbound messages?**
`FederationService.acknowledge({ message })` → one `ACK_RECORDED` row with
`by: deps.localPeer` (`messaging.ts:208-219`). It is never automatic, and it grants no
agreement. **It has no product path at all today** — absent from
`FederationApplicationSurface`, from `palimpsest_federation`'s actions and from every
route; only tests call it (correction SC-7).

**Q13 — Can two installations share ProjectWorkspace files while federation is active?**
**Not anywhere today.** `scripts/scope/aer-boundary-dogfood.mjs` builds the two-scope
shared store but passes no peer wiring (so `application.federation === undefined`);
`test/p_live_federation.test.ts` composes two full deployments with a shared transport
ledger but no shared workspace stores. Store discipline the rig must respect:
`dispose()` closes **supplied** association/journal/management/org-memory/proof stores and
the Ordarium ledger (`src/install.ts:2376-2393`), and `Deployment.close()` additionally
closes the coordination, boundary, runtime-scope, transport, cursor and marks handles
(`launch.ts:362-371`) — so the rig gives each installation **distinct instances over
shared paths**.

**Q14 — What is required to close `CF-AE-R-05` honestly?** Its own trigger is *"a rig that
composes the §132–§135 peer wiring together with a shared Project Workspace store"*, and
§50 names the minimum evidence: **federation active + shared Workspace files +
authenticated cross-project message + foreign workspace read attempts fail closed**. The
finding's mechanics have changed since it was written — `test/aer_scope_isolation.test.ts`
no longer guards the federation branch away; it now asserts `federation === undefined`
explicitly — so the *finding* stands while its stale line reference does not.

**Q15 — Spec corrections.** See §2.

---

## 2. SPEC CORRECTIONS — the assumptions that do not hold

Each entry changes what UX-B must build. Where the spec is silent the correction is a
new obligation.

| # | Spec assumption | What the code says | What UX-B must do |
| --- | --- | --- | --- |
| **SC-1** | (implicit) "the install has an inbound pump" | `installPalimpsest` never composes a pump; only `launchDeployment` does | the two-project rig must use `launchDeployment` (or add the pump explicitly). No doc may say "the install wires an inbound pump" |
| **SC-2** | §35 asks whether a normal deployment pumps automatically | only the DSH runner loops unconditionally; `launchDeployment` starts nothing and the CLI needs `--pump` | do NOT claim general automatic pumping, and do NOT add a second scheduler (§34). Reuse the existing host loop / document `pumpAndActivate` as the host's responsibility |
| **SC-3** | §4 assumes the Attention surface is reusable as-is | the surface exposes only `policyId` + `pending()` | read `pending()` for observability, keep activation host-side, and put `crossProjectAttentionText` beside the existing formatter |
| **SC-4** | §4 "strict inbound sender coherence" implies authentication | it compares the adapter's *asserted* peer with `message.from`; the pump always asserts `envelope.from`, which is written by the sending installation into a **local trusted ledger** | never write "cryptographically authenticated"; the real defence for an Ask is the **directory** binding, which UX-B implements itself |
| **SC-5** | §20 "in `inbox.received`, not `unverified`" | `inbox.unverified` is **unreachable** through the durable pump; it needs `recordInboundMessage({ authenticatedPeer: null })` | the N25 proof must inject the unverified record through a crafted ingest port and SAY it did, rather than implying a two-peer run produced it |
| **SC-6** | §18/§5-Q8 "outbound thread + inbound inbox" | `threadView` cannot contain inbound by construction; neither view sorts | `status()` is a pure derivation over both, deduped/sorted by UX-B |
| **SC-7** | §22/§38/§39 require `acknowledge` | it exists on the service but has **no** surface, tool or HTTP path | UX-B adds the path (surface member + tool action/route); the signature takes the whole `PeerMessage` |
| **SC-8** | §4 lists `requestContact` as reusable | it only appends `CONTACT_REQUESTED`, has no production caller, and carries no body | do not use it for an Ask; `sendMessage` is the primitive |
| **SC-9** | §11 "advanced callers may select a peer from UX-A's `CROSS_PROJECT_REQUIRED.peers`" | those ids come from `knownIndependentPeers`, which **`launchDeployment` never passes** — so in any profile-launched deployment `hasPeers` is false and COORDINATE is unreachable | either wire `knownIndependentPeers` from the descriptor directory in the launcher (making §65 observable), or state the vacuity. The dogfood's §52/§53 proofs must not depend on AUTO/COORDINATE unless wired |
| **SC-10** | §7/§42 suggest deriving the project directory from existing artefacts | the existing directory and profile entries carry no project id and no name | the new port is genuinely new; carry `competenceTags` over, and reuse `ObservationKnowledge` for its outcomes |
| **SC-11** | §9's outcome names | the existing discipline returns `discovered`/`directory_unknown`/`directory_error` | keep §9's five outcomes but state they MIRROR the existing pair and are not new kernel statuses; "unknown ≠ empty" must survive end to end |
| **SC-12** | §18 "derived from thread + inbox" | the responder also needs its own outbound thread to know it already answered | `pending()` reads the inbox and, per request, the thread — still no store |
| **SC-13** | §13 "Federation still sees `peer_message`" | true — and `body` has **no size bound in the kernel** | §63's maxima are enforced in UX-B's own strict envelope parser |
| **SC-14** | §17's deterministic thread id | the durable `operationId` IS the `messageId`, and `submit` fails closed with `transport_operation_conflict` when the same id carries different content | decide deliberately: random message ids (idempotent by envelope digest) or a content-addressed id per §16's "no exactly-once promise" |
| **SC-15** | §28/§29 "add a thin composition" | a new face must be wired in FOUR more places beyond the interface: the factory's returned object, `/api/application/surfaces`, `palimpsest_surfaces`, and `hasAdvancedSurface` | checklist them all — the file that documents the monitor 501 bug is the evidence |
| **SC-16** | §48's rig description | `dispose()` closes supplied stores and the deployment closes its own handles | distinct store instances over shared paths; never hand one instance to two installs; avoid concurrent writes to one scope (CF-AE-R-08) |
| **SC-17** | §49 implies a reachable foreign read to attack | **no federation call site accepts a project or workspace scope at all** — a peer message can only carry a string in `body` | the evidence doc must say precisely that: the rig proves the ABSENCE of a reachable path plus the fence behaviour, not a blocked bypass |
| **SC-18** | §51 steps 11/14 (ACK) | unbuildable without SC-7's new path; ACK is per-message and `by: localPeer` | carry the `PeerMessage` objects through and ack only after `sendMessage` resolved |
| **SC-19** | §27's firewall | because SC-9 applies, AUTO cannot even reach `CROSS_PROJECT_REQUIRED` in a launched deployment, so "AUTO is non-mutating" is **vacuously** true there | wire the peers first and then assert zero mutations, or label the vacuity |
| **SC-20** | §5's audit file list | the pump composition, activation choice, directory binding and production loop live in `src/deployment/{launch,profile}.ts`, `src/cli.ts`, `host/dsh/lib/*` — all outside §5's list | this document audits them; a UX-B0 that read only §5's list would conclude "no host pumps mail" and build a redundant scheduler |
| **SC-21** | §33 "AttentionService already derives `inbound_peer_message`" | true, but the signal carries **no** message content — only `subjects: [{kind:"peer_message", id}]` | `crossProjectAttentionText` must instruct the principal to call the product tool; it cannot carry the ask body |
| **SC-22** | §72's module list | `src/federation/directory.ts` already owns `PeerDirectoryPort` | name the new port so both coexist and keep it out of `src/federation/**` (which would muddy §4's reuse claim) |

---

## 3. What UX-B therefore is

A **thin, stateless product composition above the existing federation**, exactly as §13
requires: the protocol rides `PeerMessage.body` as a strict versioned envelope, so
federation still sees an ordinary `peer_message`, and there is no new coordination event
type, no new transport operation kind and no new store.

```text
user asks once
  → ProjectPeerDirectory resolves the project NAME to a bound PeerRef   (read-only metadata)
  → a strict ProjectAskEnvelope is serialized into one peer_message body
  → sendMessage over the EXISTING durable transport (at-least-once)
  → the remote pump ingests it; Attention emits inbound_peer_message
  → the remote principal (or its UX-A run) authors an answer
  → ProjectAnswerEnvelope on the SAME thread
  → the origin's pump ingests it; status() derives the state from thread + inbox
  → receive() surfaces it and ACKs (ACK = seen, never agreement)
```

Decisions this audit fixes in advance:

1. **`ProjectPeerDescriptor` is new and read-only** (`{ projectId, displayName?, aliases[],
   peer, competenceTags[] }`), resolved through a new `ProjectPeerDirectoryPort` that
   reuses `ObservationKnowledge`'s `known | unknown | error` discipline. **A descriptor is
   a routing binding, never authority or ownership** (§7/§12), and `projectId == peerId`
   is never assumed.
2. **Target resolution is deterministic and exact** (§9): projectId, displayName or alias.
   Five outcomes; ambiguous or unknown sends **nothing**.
3. **The outbound packet carries the task and only explicitly supplied `contextText`**
   (§24/§25) — no workspace dump, no hidden summarization, no field the user did not see.
   Enforced by a strict exact-key parser plus explicit product maxima (§63).
4. **`acknowledge` gets a product path** (SC-7) and is only ever called after a successful
   send (§38/§39).
5. **Status is derived**, never stored: `PREPARED | SENT | WAITING | ANSWERED | PARTIAL |
   DECLINED | REMOTE_ERROR | CONFLICT`, with `no response = WAITING` (§19), identical
   duplicate answers collapsing and materially different terminal answers reported
   `CONFLICT` — never silently picking one (§21).
6. **The inbound answer is accepted only from the expected bound peer on the expected
   thread with the matching requestId** (§20), and the binding is looked up in the
   directory — the kernel cannot prove it (SC-4).
7. **No commitment, no Work, no ProjectIR revision, no Journal entry, no Evidence, no
   Boundary mutation** anywhere on the Ask/answer path (§22/§58).

## 4. The `CF-AE-R-05` rig

The rig is the deliverable that closes the carry-forward, and SC-17 fixes what it may
honestly claim. It composes, as §48 requires: two live installations with separate
controllers, orchestration DBs, coordination stores, Ordarium ledgers and transport
cursor stores; **one shared durable transport ledger** so both mailboxes live in one
substrate (each side opening its own handle); explicit project↔peer bindings on both
sides; **one physical Project Journal file and one physical AssetAssociation file** each
holding A's and B's scopes, with a separate handle per installation; real federation,
real pumps and real Attention on both sides.

It then seeds `A_ONLY_SECRET` and `B_ONLY_SECRET` into their own scopes and proves, with
raw SQLite reads plus the real facades:

```text
federation active on both sides                       application.federation !== undefined
shared workspace files really hold BOTH scopes         a third direct handle's projects() lists A and B
an authenticated cross-project message crosses        inbox.received (not unverified) + an inbound_peer_message signal
a hostile sourceProjectId widens nothing              A's id and peer id in B's body: B's reads stay B-scoped
foreign workspace reads fail closed                   the fences refuse A's id from B and B's from A
no secret crosses                                     neither sentinel appears in any packet, refusal or answer
```

**What it does not claim** (SC-17): no federation call site accepts a scope, so the rig
proves the absence of a reachable foreign-read path together with the fence behaviour —
not that a bypass was attempted and blocked. The evidence document says exactly that.
