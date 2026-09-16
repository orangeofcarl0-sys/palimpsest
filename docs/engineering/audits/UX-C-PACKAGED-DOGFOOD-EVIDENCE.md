# UX-C — Packaged dogfood evidence

Baseline: `a36d37b` (canonical main after UX-B).
Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (product track).
Spec: `SPEC-PROMPT-UX-C.md` §33 (standard DSH local golden path), §34 (AUTO without
OrganizationMemory), §35 (epistemic proof), §36 (ownership proof), §37 (capability
firewall), §38–§41 (packaged cross-project, remote Explore, cold resume, no daemon
overclaim), §53 (the gates).
Rigs:
`scripts/interaction/uxc-dsh-local-dogfood.mjs`,
`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs`.
Ownership evidence: `docs/engineering/audits/UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`.

Both rigs launched the **shipped** composition from a typed deployment profile carrying
only `reasoning: {}`. Neither hand-composes a reasoning store, a policy or a branch
port — that developer rig is exactly what UX-C exists to remove.

```text
node scripts/interaction/uxc-dsh-local-dogfood.mjs         pass=true
node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs pass=true
```

---

## 1. Packaged DSH local collaboration (§33–§37)

**What it drives.** One deployment from a profile with `reasoning: {}` and pull-mode
attention (`activation: "none"`). The harness plays the DSH host role and derives the
ephemeral branch port from its own DSH knowledge — exactly as
`host/dsh/lib/index.js:77-92` does — then runs real `node <dsh bin> … --branch <brief>`
subprocesses per branch (`scripts/interaction/uxc-dsh-local-dogfood.mjs:136-146`).

**The real check names and what each proves:**

| Check | Proves |
| --- | --- |
| `deployment_composes_the_packaged_collaboration_surface` | collaboration + advisor + store + branch adapter, all from a bare `reasoning: {}` |
| `deployment_profile_carried_only_reasoning_empty` | no store path, no policy, no branch port in the profile |
| `derived_store_lives_beside_the_orchestration_db` | `<orchestration dir>/reasoning.sqlite` exists |
| `branch_environment_has_exactly_one_host_private_tool` | `toolNames === ["palimpsest_branch_result"]` |
| `branch_environment_exposes_no_principal_only_tool` | `principalTools === []`; the eight principal-only tools absent |
| `parallel_ran_real_ephemeral_branches` | ≥ 2 completed real DSH subprocesses |
| `useful_findings_returned` | ≥ 2 findings returned |
| `exactly_one_candidate_owner` | zero branch-reported digests, one submission per branch, zero `DEDUPLICATED` |
| `default_explore_standing_is_inconclusive_with_no_evidence` | every `VERIFICATION_RECORDED` is INCONCLUSIVE with empty evidence lists |
| `no_supported_standing_without_real_evidence` | no `VERIFICATION_RECORDED` carries `SUPPORTED` |
| `primary_result_labels_findings_exploratory_not_truth` | typed `findingStanding = EXPLORATORY_CELL_LOCAL` and the mandated sentence in primary text |
| `fan_out_bound_refused_not_clamped` | `branchCountHint: 9` is refused with the 2..8 message |
| `fan_out_bound_holds` | `branchCountHint: 3` runs exactly 3 branches |
| `no_durable_peer_persistent_point_or_commitment_created` | coordination events unchanged; zero commitments; empty inbox |
| `memoryless_auto_selects_focus_for_a_coupled_task` | AUTO → `PRINCIPAL_CONTINUES`, zero findings |
| `memoryless_auto_selects_explore_for_a_decomposable_task` | AUTO → `LOCAL_EXPLORE`, ≥ 2 findings |
| `memoryless_advisor_claims_no_empirical_evidence` | empty `empiricalSupport` and the "No empirical evaluation is available" rationale |

This is §33's golden path and §34's AUTO pair, on the real host-shaped composition, with
no OrganizationMemory store anywhere.

## 2. Packaged cross-project collaboration (§38–§41)

**What it drives.** Two first-party deployments from profiles with `projectDirectory` and
`reasoning: {}`, over one shared durable transport ledger. A asks B; B's deployment pump
ingests and activates; B answers (once by composing its own packaged PARALLEL Explore,
once FOCUS); A ingests and is activated. Attention is bound with the **product** formatter
on both sides (`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:192-196`).

**The real check names and what each proves:**

| Check | Proves |
| --- | --- |
| `both_packaged_deployments_compose_the_cross_project_face` | a cross-project face with no hand-composed install rig |
| `both_packaged_deployments_have_the_local_collaboration_bundle` | both have the packaged store + branch adapter |
| `ask_is_sent_as_an_ordinary_peer_message` | one explicit Ask, a normal peer message |
| `b_shipped_pump_ingests_the_request_without_manual_polling` | `ingested >= 1` and one pending request |
| `b_attention_uses_the_product_cross_project_text` | activation text contains `CROSS_PROJECT_INBOUND_REQUEST_TEXT` |
| `b_packaged_local_explore_answered_the_ask` | B's own packaged Explore answered, with the exploratory sentence in the answer text |
| `b_execution_remains_the_sole_candidate_owner` | every branch result has no candidate digest |
| `a_packaged_pump_consumed_the_answer` | A's pump ingested and status is `ANSWERED` |
| `a_attention_uses_the_product_cross_project_text` | A's activation text matches "a project you asked has replied" |
| `b_packaged_focus_answered_without_branches` | FOCUS answer spawns no branches |
| `cross_project_ask_and_answer_create_zero_commitment` | zero commitments on both sides |
| `foreign_workspace_read_fails_closed` | `invalid_registration` |
| `cold_resume_get_undefined_resume_called_followup_queued` | §3 below |
| `successful_activation_marks_the_signal_delivered` | a second pump does not re-offer the signal |
| `failed_activation_leaves_the_signal_pending` | a throwing `resume` leaves the signal pending |

### 2.1 The branch firewall, proven against the REAL branch process (§37)

The first version of this rig proved the branch isolation by inspecting the **in-process**
`composeBranchHostEnvironment(...)` object, which is what let the gate review's BLOCKER
ship: the environment object said one tool while the branch *process* was in fact offered
the whole `dsh-base` tool surface. The rig now reads the ground truth instead: the DSH
host persists each branch session at
`$DSH_HOME/sessions/<cwd-key>/branch-<id>/session.v3.jsonl.zstd`, and its `request/header`
record **is** the tool catalogue the branch model was offered. That file is a concatenated
multi-frame zstd stream (Node's `zstdDecompressSync` decodes only the first frame, which is
the 240-byte session header), so the check splits on the zstd magic and decodes every frame.

```text
real_branch_process_was_offered_exactly_one_tool
  frames=10 types=["session","permission/preset","sandbox/mode","approval/policy",
                   "agent/inbox/spliced","turn/start","step/start","system/message",
                   "user/message","request/header","request/context","session/title",
                   "session/title-llm-request","assistant/message",…]
real_branch_process_was_offered_no_principal_only_tool
  [["palimpsest_branch_result"]]
```

The in-process check is kept and relabelled as the *environment object*; the two checks
above are the proof. The mechanism that makes it true is structural, not a prompt line:
`host/dsh/lib/runner.js` calls `agentCtx.tools.restrict({ allow: [branchToolName] })` inside
the branch agent's own `setup` hook — before its first turn — and refuses to run at all when
the tool name cannot be resolved, so a branch never falls back to a wider tool set.

## 3. The cold-resume proof (§40)

The rig makes `agents.get(id) → undefined`, supplies a real `resume`, and calls
`pumpAndActivate()` through the deployment's own lifecycle
(`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:277-294`):

```text
get() → undefined
resume({ resumeSessionId }) → resumed principal
followup(...) → queued
successful_activation_marks_the_signal_delivered  (second pump does not re-offer it)
```

Then a throwing `resume` is bound and the signal is proven to stay pending
(`failed_activation_leaves_the_signal_pending`). The host session id used for the resume
comes from the host/session binding, never from a `PeerRef`.

## 4. The honest limit

HONEST: the harness drives the deployment lifecycle **in-process**
(`pumpAndActivate()` is called by the script, as a host loop would call it) and **every
branch is a real DSH subprocess** — `node <dsh bin> --profile … --branch <file.json>`
(`scripts/interaction/uxc-dsh-local-dogfood.mjs:136`, and the same on the cross-project
side at `:152-160`). But **no live model-driven principal turn is spawned**: the rigs
never launch the full DSH principal process to have it decide with `palimpsest_*` tools.
The shipped runner's scheduling is proven **structurally** (the suite reads
`host/dsh/lib/runner.js` and asserts it schedules `deployment.pumpAndActivate()`, wires
the product formatter and supplies `resume`) and **via the cold-resume section**, not by
a recorded live principal conversation.

This is a real boundary, not a footnote: "the shipped runner would wake a principal" is
proven for its wiring and its loop; it is not proven by an end-to-end live principal.
Recorded as new carry-forward work (a live-principal packaged proof).

HONEST (gate review F5): the cold-resume section builds its adapter in the rig with a stub
`resume` and drives it through the deployment's own `pumpAndActivate()`. It therefore proves
the **adapter contract** and the **deployment lifecycle**, and the runner's wiring is proven
structurally (the suite reads `host/dsh/lib/runner.js`), but no test executes `runner.js`'s
own adapter construction. In a live runner the cold path is also unreachable for the session
it just created, because `agents.get(sessionId)` resolves. Carried with that trigger.

## 5. Daemon resurrection is out of scope, stated in the artifact

The cross-project rig emits its boundary in the evidence JSON itself
(`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:333-338`):

> **daemon_resurrection:** UX-C proves COLD-RESUME of a PERSISTED AGENT SESSION INSIDE A
> RUNNING HOST (`get() → undefined`, `resume()` called, `followup` queued). It does NOT
> claim to restart a dead operating-system process or an OS service: OS-level
> daemon/autostart remains future packaging work (§41).

> **polling:** The script drives the DEPLOYMENT lifecycle (`pumpAndActivate`), which is
> what the shipped DSH runner schedules on a timer. No user mailbox polling happens: the
> cursor advances only after ingest, and the runner's timer is mechanical scheduling, not
> semantic truth.

## 6. What these rigs do not replace

- The full vitest suite (167 files / 1846 tests) and Playwright (36 passed) remain the
  regression gates; UXC-N29/N30 are suite gates, not in-rig assertions.
- The UX-B and UX-A rigs remain the cross-project and local regression rigs; this stage
  only rewired their stale branch-contract assertions.
