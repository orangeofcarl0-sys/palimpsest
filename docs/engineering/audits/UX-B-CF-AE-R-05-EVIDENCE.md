# UX-B — `CF-AE-R-05` evidence and disposition

Baseline: `2e0f48b2b915e9a58c28313d9bc0e046c97b1669` (canonical main after UX-A).
Stage: **UX-B — One-Request Cross-Project Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-B.md` §48 (the mandatory closure rig), §49 (the adversary),
§50 (the required proof), §78 (the disposition).
Origin finding: `docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md` §1.
Audit that fixed the rig's scope claim: `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md`
§1 Q13/Q14 and correction **SC-17**.
Evidence: `F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json`.
Rig: `scripts/interaction/uxb-two-project-dogfood.mjs`.

```text
CF-AE-R-05 CLOSED_IN_UX_B
```

---

## 1. The finding, verbatim

From `docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md` §1 (row **CF-AE-R-05**,
kind: evidence/boundary) — the **finding** exactly as written:

> **AER-N17 and PSI-A11 are NOT proven.** The gate review verified that this rig
> composes NO federation surface (`application.federation === undefined`, and no
> `palimpsest_federation` tool), so `test/aer_scope_isolation.test.ts:646-666`
> cannot assert a bypass property: its `if (federation === undefined)` guard passes
> its own branch and both loops over members/actions are empty. An earlier
> description in this document set called it "structural, asserts no federation
> member names the workspace" — that overstated it; there is nothing to inspect.

And the **trigger** exactly as written:

> A rig that composes the §132–§135 peer wiring together with a shared Project
> Workspace store, i.e. the first deployment that actually runs a federation path
> beside an installed workspace.

The UX-A carry-forward restated the same trigger with detail:

> The rig must compose the §132–§135 peer wiring (local peer, transport, peer
> directory, route) *together with* a shared Project Workspace store holding more
> than one project, and assert that a federation-mediated read/write cannot address
> a foreign project's workspace scope. That is the first deployment shape in which
> the property is testable at all.
> — `docs/engineering/audits/UX-A-CARRY-FORWARD.md` §1 ("Trigger detail")

`SPEC-PROMPT-UX-B.md` §50 is explicit that this is the *only* way to close it:

```text
federation active
+ shared Workspace files
+ authenticated cross-project message
+ foreign workspace read attempts fail closed
```

## 2. What changed since the finding was written (the stale line reference)

The finding's **mechanics have changed**, so its line reference no longer describes
the current test:

- The cited range `test/aer_scope_isolation.test.ts:646-666` now *begins* at the
  renamed test `it("AER-N17 (NOT PROVEN HERE — carried as CF-AE-R-05): no
  federation path exists to drive", …)` (`:646`). The described mechanism — an
  `if (federation === undefined)` guard that silently passes its own branch while
  both loops over members/actions iterate an empty set — **is gone**.
- The test no longer guards the federation branch away. It now asserts the
  negative **explicitly and by name**:
  `expect(rig.installed.application.federation).toBeUndefined()`,
  `expect(toolActions("palimpsest_federation")).toBeUndefined()`, and
  `Object.keys(installed.application).filter(k => /federat/i.test(k))` → `[]`
  (`test/aer_scope_isolation.test.ts:646-661`).
- Therefore the **finding stands** (AER-N17/PSI-A11 were not proven there, and
  still are not) while its **stale line reference does not**. The AE-R finding is
  not wrong about the property; it is out of date about the code that failed to
  prove it. This document is the proof that replaces it.

HONEST: the AER test was not modified by UX-B (this stage writes documentation
only, and `test/**` is out of scope). It remains an honest statement that AER-N17
is *not* proven there. The proof lives in the UX-B rig below, which is why
`CF-AE-R-05` can close without that test changing.

## 3. The rig, against the trigger

The trigger asks for **one shape**: the §132–§135 peer wiring composed *together
with* a shared Project Workspace store holding more than one project.
`scripts/interaction/uxb-two-project-dogfood.mjs` builds exactly that:

| Trigger element | How the rig composes it | Where |
| --- | --- | --- |
| two live installations | `launchDeployment(profileFor(...))` twice | `:162-163` |
| separate controllers / orchestration / Ordarium / coordination / cursor stores | per-installation `databases.*` paths plus per-installation directories | `:92-123` |
| ONE shared durable transport ledger | single `transport.databasePath` for both profiles, one namespace | `:100`, `:126` |
| explicit project↔peer bindings on both sides | `projectDirectory` in each profile, and the pre-existing `directory` hints | `:114-119` |
| ONE shared physical Project Journal file, BOTH scopes | `databases.projectJournal` → one path; B's scope seeded by a B-bound install, A's by A's own facade | `:111`, `:135-159`, `:166-172` |
| ONE shared physical AssetAssociation file, BOTH scopes | `databases.projectAssociations` → one path | `:112`, `:143-158` |
| a SEPARATE store handle per installation | `launchDeployment` constructs its own store from that path; no instance is handed to two installs (audit SC-16) | `:109-112` |
| real federation on both sides | `application.federation !== undefined` on both | `:178-179` |
| real inbound pumps | `await deployment.pumpAndActivate()` on each side | `:221`, `:252`, `:281`, … |
| real Attention services | `pumpAndActivate` drains the Attention service and reports its signals | `:221-228` |
| the adversary (§49) | `A_ONLY_SECRET_APERTURE_9mm` seeded in A's scope, `B_ONLY_SECRET_GAIN_CALIBRATION` in B's | `:39-40`, `:152-172` |

```text
$ node scripts/interaction/uxb-two-project-dogfood.mjs
pass=true — 41/41 checks, failures: []
```

## 4. The four §50 bullets, with real evidence

Each bullet is quoted from `ae-evidence/uxb-dogfood.json`, whose
`"failures": []` and `"pass": true` are the same run.

### 4.1 Federation is active on both sides

```text
federation_is_active_on_both_sides
  ok: true
both_installations_compose_the_cross_project_face
  ok: true   detail: {"optics":true,"detector":true}
```

A federation that is present only on the origin would prove nothing, so the check
requires `application.federation !== undefined` on **both** installations.

### 4.2 Shared Workspace files really hold BOTH scopes

```text
shared_association_file_really_holds_BOTH_scopes
  ok: true   detail: ["detector","optics"]
shared_journal_file_really_holds_BOTH_scopes
  ok: true   detail: ["detector","optics"]
```

Both checks open a **third, direct handle** on each physical file — independently
of either installation — and ask the store which project scopes it holds. This is
what makes "shared store" a fact rather than an assertion about configuration.

### 4.3 An authenticated cross-project message really crosses

```text
remote_pump_ingests_the_authenticated_message
  ok: true   detail: {"ingested":1,"received":1,"unverified":0}
remote_attention_emitted_an_inbound_peer_message
  ok: true   detail: ["inbound_peer_message"]
remote_pending_returns_one_authenticated_request
  ok: true   detail: [{"requestId":"cpq-5fe1dc8de9a90a693faaa40d93f9eb56",
                       "sourceProjectId":"optics","sourceProject":"the optics project",
                       "sourcePeerId":"peer-optics","targetProjectId":"detector",
                       "task":"Have we already studied this detector aperture issue?", …}]
```

`received: 1` with `unverified: 0` matters: the message is in the *authenticated*
inbox, and the Attention service really emitted the signal the host path consumes.

**What "authenticated" means here, stated plainly (audit SC-4).** An inbound
message is authenticated only because the **local transport adapter** asserted a
`PeerRef` for it from its own durable ledger
(`InboundPeerEnvelope.authenticatedPeer`; the durable pump writes `envelope.from`,
which the *sending* installation wrote into a local trusted ledger). The kernel
cannot prove more, and **no document in this set says "cryptographically
authenticated"**. The real defence for a cross-project Ask is the **directory
binding** (peer ↔ project), which is what the source/target-binding checks
exercise.

### 4.4 Foreign workspace reads fail closed — and no secret crosses

Every read is attempted through the **real facades** of the installation that must
be refused:

```text
foreign_journal_read_fails_closed_from_B              ok: true   invalid_registration
foreign_scoped_assets_read_fails_closed_from_B       ok: true   invalid_registration
foreign_external_asset_resolve_fails_closed_from_B   ok: true   no bridge
foreign_journal_read_fails_closed_from_A              ok: true   invalid_registration
B_local_reads_stay_bound_to_B                         ok: true   B's own read shows B's scope and never A's secret
no_secret_crossed_the_boundary_in_any_form            ok: true   A's secret never appears in the shared transport ledger
```

**Two packets are sent in the hostile-fields half, and the difference between them is the
point.** (1) A *correctly bound* ask that merely NAMES the other project's scope in its
`sourceProjectId`/task — it is a legitimate ask from the peer the directory binds to
A, so it appears in `pending()` (`req-hostile-1`) and the section then proves every
local read still stays B-scoped. (2) A genuine **source-binding spoof**: the packet is
really sent by `peer-optics` (the transport asserts that sender) but its body claims
`sourceProjectId = detector`, i.e. A pretending to be B. The packet carries the
**genuine** protocol digest — asserted by the `spoof_packet_is_a_valid_protocol_packet`
check so the refusal cannot be attributed to the parser — and it is therefore refused
by the **source-binding rule alone**, which is why `live_source_binding_spoof_is_not_pending`
asserts it never becomes pending while the correctly-bound `req-hostile-1` does. A
parser-level rejection and a binding-level rejection are thus distinguished rather than
conflated.

The hostile-fields half of §49 runs inside the same section: a **real authenticated
message** claiming `sourceProjectId: "optics"` and asking B to `read optics
workspace` is sent over the shared ledger and pumped into B
(`scripts/interaction/uxb-two-project-dogfood.mjs:376-382`). B processes it as an
inbound Ask and its local reads stay B-scoped; the fences refuse A's id from B and
B's from A.

Both directions are covered because the finding was symmetric: A cannot read B's
scope either.

## 5. What this evidence does NOT claim (SC-17)

This is the honesty clause the UX-B0 audit imposed on the rig, and it is quoted
from the evidence file's own `honestNotes.scope_claim`:

> No federation call site accepts a project or workspace scope, so the shared-store
> section proves the ABSENCE of a reachable foreign-read path together with the
> fence behaviour (SC-17) - not that a bypass was attempted and blocked.

In full, so a future reader cannot over-read the result:

**Claimed.**

1. Two live installations can share one physical Project Journal file and one
   physical AssetAssociation file while both have real federation, real inbound
   pumps and real Attention, each opening its own store handle.
2. A real, authenticated cross-project message crosses between them over one
   shared durable transport ledger.
3. Every foreign-scoped read reachable through the **product facades** is refused
   (`invalid_registration`, or no bridge at all), in both directions.
4. Neither project's scope sentinel appears in the shared transport ledger, in any
   refusal, or in the ask packet.

**Not claimed.**

1. That a hostile caller can *reach* a federation code path that takes a project
   or workspace scope and be blocked there. **No such call site exists**: a peer
   message can only carry a string in `body` (audit SC-17; UX-B0 §1 Q13). The rig
   therefore proves the absence of a reachable path **together with** the fence
   behaviour, which is the strongest true statement available in this architecture.
2. That "authenticated" means cryptographic authentication (audit SC-4, above).
3. That concurrent multi-writer access to the shared files is safe. The rig
   serialises its writes; two installations actively writing the same physical file
   at the same instant remains `CF-AE-R-08`, unchanged by this stage (audit SC-16).

The audit's own phrasing of the same boundary is preserved because it is the
precise one:

> no federation call site accepts a scope, so the rig proves the absence of a
> reachable foreign-read path together with the fence behaviour — not that a bypass
> was attempted and blocked.
> — `docs/engineering/audits/UX-B-CROSS-PROJECT-GAP-ASSESSMENT.md` §4

## 6. Disposition

Every one of the four §50 bullets is satisfied by a real run of a real two-project
rig, and no bullet is satisfied only by aspiration:

| §50 requirement | Evidence | Satisfied |
| --- | --- | --- |
| federation active | `federation_is_active_on_both_sides` (both sides) | yes |
| shared Workspace files | `shared_association_file_really_holds_BOTH_scopes`, `shared_journal_file_really_holds_BOTH_scopes` (third direct handle) | yes |
| authenticated cross-project message | `remote_pump_ingests_the_authenticated_message` (received 1, unverified 0) + `remote_attention_emitted_an_inbound_peer_message` | yes |
| foreign workspace read attempts fail closed | `foreign_journal_read_fails_closed_from_A` / `_from_B`, `foreign_scoped_assets_read_fails_closed_from_B`, `no_secret_crossed_the_boundary_in_any_form` — each a REAL typed fence (`invalid_registration`). The external-asset leg is `no_external_asset_bridge_is_composed_to_widen_from_B`: a profile-launched deployment composes no bridge, so that check proves the absence of the surface in this rig, and the bridge's own held-basis fence is proven in the AE-R dogfood instead | yes |

```text
CF-AE-R-05 CLOSED_IN_UX_B
```

The property is additionally pinned in-suite so a revert fails the test run:
`UXB-N29 CF-AE-R-05 properties over SHARED physical workspace files`
(`test/uxb_cross_project.test.ts:1333-1414` — "holds both scopes in one file,
fences each from the other and leaks no sentinel").

`CF-AE-R-05` is therefore disposed **CLOSED_IN_UX_B** in
`docs/engineering/audits/UX-B-CARRY-FORWARD.md` §1, with the evidence named. It is
**not** closed for the concurrent-writer question, which is a different item
(`CF-AE-R-08`, still open, unchanged).

## 7. Reproducing

```bash
node scripts/interaction/uxb-two-project-dogfood.mjs
# → JSON summary on stdout, then: pass=true
# machine-readable evidence: F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json
```

The rig requires the built `dist/` tree (it imports `dist/src/...`) and exits
non-zero on any failure (`scripts/interaction/uxb-two-project-dogfood.mjs:411-442`).

## 8. Honest limitations of this document

1. **The evidence is from a run, not from this document's author.** The numbers
   and details quoted here are copied verbatim from
   `F:\Codex_Work_Space\Palimpsest\ae-evidence\uxb-dogfood.json`, whose `pass` is
   `true` and whose `failures` is empty. This document performs no gate run.
2. **The scope claim is narrower than the finding's title.** `CF-AE-R-05` is closed
   as "no reachable foreign-read path + fences hold", not as "a bypass was blocked".
   The distinction is reproduced in three places on purpose (§5 above, the rig
   header at `scripts/interaction/uxb-two-project-dogfood.mjs:14-19`, and
   `honestNotes.scope_claim` in the JSON) because it is exactly the overstatement
   the AE-R gate review caught in the first place.
3. **The AER-N17 test still says NOT PROVEN.** That is honest and was left
   untouched: the test proves the *absence* of a federation path in *its* rig, and
   the UX-B rig is a different, stronger rig. A future reader should not expect the
   AE-R suite to carry the cross-project proof.
4. **One hostile request is not a fuzz campaign.** The rig sends one correctly-bound
   packet that names the other scope and one genuine source-binding spoof, plus the full
   ordinary Ask/answer path. It does
   not enumerate every fabricated field value; it proves the property on the real
   composition and pins the classification logic separately (UXB-N12…N15).
