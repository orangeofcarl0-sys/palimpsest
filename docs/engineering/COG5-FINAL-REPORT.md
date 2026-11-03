# COG-5 — Final Report

**Question:** can Palimpsest's existing ProjectWorld, Work, Compatibility, Cross-Basis Admission and Result
Continuation capabilities be connected into a genuinely executable, safe and economically useful
project-continuation path after project reality changes?

**Answer:** **yes, through a lawful source intake and a governed rework.** An operator-authored Work task
accepted an immutable external candidate and normal Promotion made it the accepted head. The packaged
continuation then assessed the stale technical result as `INCOMPATIBLE` and let the service mint the rework
permit itself. Head reconciliation advanced the ProjectIR to the accepted head and reauthorized the task onto
it; the D2 job prepared there, ran to completion, and produced a new `ATTEMPT_RESULT`; normal Promotion made
the task `SATISFIED`. The direct external-commit control still refuses with `HEAD_BASIS_MISMATCH`.

**The positive reuse branch is still not established.** The packaged product cannot prove a source change
non-interfering. The only production change is a corrected post-promotion change anchor, which removes the
result's own output from the "later external change" interval. The packaged promoted result now reports
`UNKNOWN` instead of a false `INCOMPATIBLE`; the expert kernel distinguishes all four outcomes only with
test-owned observations. No model was used, and no comparative claim is made.

**Stage label:** `COG-5: EXECUTABLE CONTINUATION ESTABLISHED THROUGH LAWFUL INTAKE AND GOVERNED REWORK;
POSITIVE REUSE STILL BOUNDED BY TRUSTED OBSERVATION; MODEL ACCESS NOT EXERCISED`.

**Gates:** G0 **ESTABLISHED**, G1 **ESTABLISHED**, G2 **PARTIAL**, G3 **ESTABLISHED**,
G4 **ESTABLISHED**, G5 **ESTABLISHED**, G6 **NOT EXERCISED**, G7 **ESTABLISHED**.

---

## A. Git

| question | answer |
| --- | --- |
| Exact incoming HEAD / tree | `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / `1b451532aa07da1f8035fe9f5855b6e62fd5781c` |
| Development branch | `palimpsest-cog5-trustworthy-continuation`, created from that exact commit |
| Commit sequence | C5-0 `80ea74e39f1f2e37a9aa4bb8975bd7ffec153e09` → Code Freeze `af4cb65736d82419b151b3c4eccc75621ee1aea5` → Evidence Freeze (forward) |
| Production files changed | `src/deployment/promotion_lineage.ts` (new), `src/composition/continuation.ts` (modified) |
| Why each change was necessary | the packaged continuation used the origin-to-current interval for a promoted result, so the result's own accepted output appeared as a later external change; the new resolver selects the accepted resulting head only after Git proves the lineage, and an unproven lineage becomes `UNAVAILABLE`/`UNKNOWN` |
| Code Freeze / tree | `af4cb65736d82419b151b3c4eccc75621ee1aea5` / `f854222a300f32bd24e0753398469ca86fd9545c` |
| Evidence Freeze / final HEAD | the commit adding this report and `research-evidence/cog5/**`; reported forward because a commit cannot contain its own SHA |
| Tree clean | yes at the Evidence Freeze, except the docs/evidence it commits |
| Protected assets | 95 worktree registrations, 2 locks, 19 gate roots, 72 pre-existing evidence trees, 0 stashes — unchanged; `cog5` is the 73rd evidence tree |
| PR / main movement | none. No PR, merge, tag, branch deletion, force-push, worktree prune, lock removal, `gc --prune=now`, `clean -fdx`, or historical freeze amendment. |

The only new executable material is the bounded production fix, its 15-test suite and the test-owned
`scripts/cog5/` rig and scenario. No core Work, ProjectWorld, Compatibility, Admission, Promotion, ProjectIR,
store, authority or lifecycle file changed.

---

## B. Read dependency

**What is the strongest read-boundary evidence the normal product can obtain?**

A proven-complete **whole-source-repository upper bound**: the selector literally means "every source
resource", recorded by the `world-materializer` observer at `CONSERVATIVE_DOMAIN`. That is honest and
complete for the domain. The product also obtains an observed path-level write footprint (the result diff) and
an observed path-level source change set (a full `git diff --name-status`).

**What is only a declaration?**

`TaskEnvelope.read_paths`. It appears in the schema, the policy and the semantic projection digest; no
execution path enforces it. In the COG-5 run the reauthorized technical envelope carried `read_paths:
["src"]` while the worker actually read `sources/brief.md`, `sources/vendor-capabilities.csv`,
`sources/sites.md` and `sources/prior-notes.md`. The declaration was not merely unproven; it was factually
wrong.

**What is only a conservative possibility?**

A source-path change overlapping the whole-repository read. The set relation is proven; the dependency is the
policy's conservative upper bound. It does not demonstrate that the worker consumed the changed bytes.

**Are `TaskEnvelope.read_paths` actually enforced?**

No. They are not a mount table, an ACL, a materialization list or a tool allowlist.

**Can DSH Shell or child processes bypass the observed read set?**

Yes. The host read fence protects `<repository>/.palimpsest`, deployment-declared extra roots and the DSH
home. The canonical source tree is not a protected root. `bash`/`pwsh`/`run_code` are confined children for
the protected roots, not for the source tree. The test-owned deterministic worker is in-process, so the host
fence was characterized from code but not exercised by this run.

**What counts as a proven-complete footprint?**

For source **writes**, a full diff between the origin and the result. For source **changes**, a full diff
between two revisions. For source **reads**, only the whole source domain; a narrower set would need an
enforced boundary or an actual-read observation, and neither exists.

**Is any positive `COMPATIBLE` certificate issued by the actual packaged observer?**

No. The packaged face produced `EXACT`, `INCOMPATIBLE` and `UNKNOWN`; never `COMPATIBLE` for a changed source
world. The expert `COMPATIBLE` used test-owned precise reads and test-owned empty facet observations.

**Are missing facets handled honestly?**

Yes. `projectSemantic`, `assets` and `environment` are `UNAVAILABLE`; no empty set is substituted. The basis's
`NOT_REQUIRED` is knowledge about the work, not an observation of the world's changes; the assessor still
requires change coverage. Exempting `NOT_REQUIRED` facets would be a semantic refinement requiring owner
review and was not done.

---

## C. Compatibility semantics

**Does whole-repository overlap represent actual dependency conflict or conservative possible conflict?**

A **conservative possible conflict**. The overlap itself is a proven set relation; the read selector is an
upper bound, so the verdict does not establish actual use. The module's own definition is non-interference
"under the resource-dependency model and direct-admission policy currently in force".

**What existing policies and tests enforce that interpretation?**

`wholeRepositoryRead()` (`src/project_world/footprint.ts:93-109`), the direct-compatibility policy v1, and the
pinned tests `test/lean_compatibility.test.ts:356-366` and `:135-137` ("a whole-repository read can NEVER
produce COMPATIBLE against a source change — by design"), plus the packaged `lean_d5d` expectations.

**Was any compatibility vocabulary changed?**

No. `EXACT`, `COMPATIBLE`, `INCOMPATIBLE`, `UNKNOWN`, `NOT_ASSESSED`, `CONFLICT` and `INSUFFICIENT_PROOF` are
unchanged. `DIRECT_COMPATIBILITY_POLICY_VERSION` is unchanged.

**If so, what is the migration and consumer impact?**

No migration. The only change is which observed interval feeds the `source` change premise for a promoted
result. A stored certificate remains a record of the change footprint it names (`changeFootprintDigest`); it is
not reinterpreted.

**Can an accepted result be assessed after later changes without colliding with its own output?**

**Yes, with the correction.** The baseline is the verified accepted resulting head
`365c830126744bf66fc1528b94a85ead500a7c09`, not the result commit
`9e9c89474bf4f8f7c3715b7a730e6b0be5761efd` and not the origin `29a08cd`. The promoted intake result's own
output is no longer a later external change; the packaged result is `UNKNOWN` (insufficient non-source
coverage), not a false `INCOMPATIBLE`. The pre-fix origin interval produced exactly a read invalidation and a
write collision against the result itself.

**Are certificates target-bound and replay-safe?**

Yes. The assessment binds `resultManifestDigest`, `originBasisDigest`, `targetObservationDigest` and
`changeFootprintDigest`; a stale inspection is refused with zero events; a duplicate promotion returns the same
terminal event. The run reproduced the duplicate-promotion replay (same promotion ID and event 24).

---

## D. External change authority

**Can an external source update enter the canonical execution basis using existing Work/Promotion?**

Yes. An operator-authored Work task applied the exact external candidate in an isolated world; the completion
contract observed the result; normal Promotion advanced the proven effect head; reconciliation advanced the
ProjectIR and reauthorized the retained task; a subsequent D2 attempt executed on the new base.

**Which exact authority approves it?**

The operator's plan revision created the intake task; the operator's Promotion call approved the exact result
commit against the canonical expected head. The external source's Git identity, branch name or author granted
no authority. A model granted none.

**What source provenance is preserved?**

Candidate path, SHA-256 and origin; envelope base; attempt and result commit; the promotion ID and event;
expected and resulting heads; the accepted blob digest; the ProjectIR revisions and the reauthorization event.
The accepted blob is byte-identical to the candidate (`0e997cb…`); the working-tree file differs only by Git's
Windows line-ending normalization.

**What happens if approval is stale, rejected or duplicated?**

- wrong source commit → `caller_source_not_canonical`, no event;
- wrong expected head → `caller_head_not_canonical`, no event;
- duplicate delivery → same `PROMOTION_COMMITTED` event, no second effect;
- unapproved path → settlement `NOT_READY` / `OUT_OF_SCOPE`, no completion, no promotion;
- direct external commit → live head ahead, `HEAD_BASIS_MISMATCH`, no adoption;
- head move before reconciliation → `quiescence_required`, no advance.

**Did any test bypass `HEAD_BASIS_MISMATCH`?**

No. The positive path succeeded because the ProjectIR head was legitimately advanced and the task was
reauthorized; the later direct-commit control still refuses with the guard.

**Can new D2 Work actually start at the accepted basis?**

Yes. Event 28 reauthorized `technical-fit` at base `365c830`; event 29 started the attempt; the D2 prepare
saw live = project = proven effect = envelope base; the job completed and settled a new result.

**Was any additional authority root required?**

No. No new source-admission authority, head database, promotion ledger, router, scheduler or agent runtime was
created. B3 was not needed.

---

## E. Continuation

**What genuine `ATTEMPT_RESULT` was used?**

The technical-fit result `attempt-f27ca3f61c4c8281a1bb8f434b47b3f4`, result commit
`6584c6bdf843f1266edeaca3f6213850663dcf09`, origin basis `29a08cd4be9273008892696da1f0dac2731aee46`.

**What was its origin basis?**

`29a08cd…`; it read `sources/vendor-capabilities.csv` and the site/prior-notes sources. It was unpromoted when
the intake changed the vendor file.

**What changed?**

The lawful intake result was promoted to `365c830`, changing V3's minimum from -10 °C to 0 °C. The
technical result's Site B selection (V3 at -4 °C) was invalidated.

**How was applicability assessed?**

The packaged service re-observed the target and ran the authoritative D3-b through the issuer:
`INCOMPATIBLE`, `rework: true`, assessment digest `8004f3d1…`. The expert diagnostic confirmed the
`read_invalidation` conflict on the vendor path. The unrelated newsletter control showed the expert can
distinguish a conservative overlap from a real dependency; the packaged face cannot.

**Which route was selected?**

The governed rework route. Rematerialization was not offered (`rematerialize: false`); reuse was blocked by
the positive conflict.

**Did governed reopening occur?**

Yes. Event 26 is a `TASK_READY` with `rework_provenance`: reason `INCOMPATIBLE`, origin result
`attempt-f27ca3f…`, origin basis `0f81e70e…`, target observation `b3231762…`, continuation assessment
`8004f3d1…`, envelope `envelope-ada658a7…`. The service minted the permit; the driver supplied only the
result identity and the assessment digest.

**Did D2 Prepare succeed?**

Yes. Event 27 advanced the ProjectIR to `365c830`; event 28 reauthorized the task at base `365c830`; event 29
started the attempt. No `HEAD_BASIS_MISMATCH`.

**Did the Worker execute?**

Yes, deterministically. Job `wdj-61e2ca2b…` reached `FINISHED`; attempt
`attempt-8f395d58e1e39b5abb84829476ac2d3e` completed; result commit
`bb821f038a48de1bdd26e021993d578eb0be176e` at base `365c830`.

**Did Settlement complete?**

Yes: `SETTLED`, changed file `deliverables/technical-fit.md`, exported to the canonical object database,
completion evidence `write_scope_valid` and `expected_files_exist`.

**Did independent verification occur?**

No separate independent verification was required by the completion contract for this documentation/data
write scope; the standard command was narrowed out by the declared applicability rule. The result carries
scope + artifact evidence. No command pass is claimed.

**Was any result promoted?**

Yes. `promotion-d7e2ebee47af2f6dac4e4d6e8efa5659` (event 38), resulting head `42a8ab4`; task `SATISFIED`
(event 39).

**Did ProjectIR actually advance?**

Yes: revision 1 to head `365c830` (event 27) and revision 2 to head `42a8ab4` (event 40). The final
revision 3 (event 41) adds the control task at `42a8ab4`.

---

## F. Model and product value

**Was a model used at all?**

No. No provider call, no model session, no token spend. The provider quota was not assumed restored.

**If not, why not?**

C5-A/B/C are deterministic mechanism tracks. The optional model comparison requires a frozen source, a valid
matched design and provider availability; the provider was not needed for the stage's gates. The default model
budget for the observation track was zero.

**Was the model-facing Continuation surface introduced?**

No. C5-D was not started. The packaged assessment is still `INCOMPATIBLE`/`UNKNOWN` for the cases that
matter and does not expose the conflict's basis; a model-facing tool would amplify a conservative overlap into
a definitive verdict. The preconditions for C5-D were not met.

**Did a real model naturally inspect and use it?**

No; there is no such tool.

**Was the native DSH baseline fairly matched?**

No model comparison was run. COG-4's clean F baseline was blocked by provider quota and remains blocked; no
contaminated or fabricated baseline was used.

**Was the provider available?**

Unknown; not probed. No quota error was used as a result, and no model tokens were spent.

**Was any incremental benefit actually demonstrated?**

No comparative benefit. The mechanism results show a real executable continuation and a real refusal
discipline, but no cognitive or economic superiority over native DSH is measured.

---

## G. Architectural implications

**Primary outcome: A — existing architecture suffices for an executable continuation.**

The evidence supports A for the stage:

- the lawful intake used the existing plan revision, TaskEnvelope, isolated world, completion evaluation,
  PromotionManager and head reconciliation;
- the governed rework used the existing continuation service, permit, `TASK_READY` provenance,
  `TASK_REAUTHORIZED` and D2-d delegation;
- the only production correction was a narrow observation-interval fix, not a new authority, scheduler,
  store or lifecycle;
- the result reached a terminal execution, a normal promotion and `TASK_SATISFIED` after a real change.

**The positive reuse branch is still bounded by B — trusted observation is the real bottleneck.**

The packaged face cannot prove a source change non-interfering because the execution environment grants the
whole source tree and provides no actual-read observation. That is not a code typo; it is a missing capability.
Until an enforced source-scoped input boundary or a first-party actual-read observation exists, the product's
distinctive reuse path remains conservative. The newsletter control is the clearest evidence: the packaged
face says `INCOMPATIBLE` for a provably unrelated change; the expert says `COMPATIBLE`, but only with
test-owned premises.

The evidence does **not** support C (external reality adoption is the bottleneck — the Work + Promotion route
works), D (the semantics are too conservative — they are conservative but the measured false conflict was the
post-promotion anchor, which is fixed), E (simpler DSH workflows — not compared), or F (the evidence is
insufficient for the mechanism claims — it is sufficient for the mechanism, not for a model comparison).

---

## Gate verdicts

| gate | verdict | basis |
| --- | --- | --- |
| **C5-G0 — Baseline and architecture rulings** | **ESTABLISHED** | exact preflight; two rulings; consumer map; one bounded implementation decision |
| **C5-G1 — Trustworthy read observation** | **ESTABLISHED** | the product accurately states its whole-repository upper bound and fails closed; no incomplete or declared-only footprint produced a positive compatibility. The observation is coarse, not false. |
| **C5-G2 — Compatibility and applicability** | **PARTIAL** | supported conflict, unproven coverage and post-promotion applicability are handled; the packaged face cannot distinguish possible interference from a demonstrated dependency and cannot produce proven disjointness. The expert can. |
| **C5-G3 — Authorized external source intake** | **ESTABLISHED** | lawful intake through Work + Promotion + reconciliation; unauthorized live head still refused |
| **C5-G4 — Executable rework** | **ESTABLISHED** | permit minted by the service; governed reopening; head sync; D2 execution; terminal `FINISHED`; new result; `TASK_SATISFIED` |
| **C5-G5 — Useful result continuation** | **ESTABLISHED** | one lawful path reached a meaningful project outcome after a real change; negative cases stayed safe. The positive reuse/rematerialization branch is separately NOT ESTABLISHED. |
| **C5-G6 — Model access and comparison** | **NOT EXERCISED** | no model was used; the optional C5-D surface and the matched baseline were not attempted |
| **C5-G7 — Engineering integrity** | **ESTABLISHED** | build 0; architecture PASS 0/9; public API PASS 0/0/0; 19 targeted files / 259 tests; Code Freeze and Evidence Freeze discipline; protected assets unchanged; no PR or main movement. Disclosed deviations: rig bugs fixed before the freeze; no model; no broad suite; the in-process worker did not exercise the host read fence; the final control intentionally leaves the live head ahead. |

---

## Preserved negative findings

1. The packaged first-party face cannot issue a positive `COMPATIBLE` certificate for a changed source world.
2. The packaged face cannot distinguish a conservative whole-repository overlap from a demonstrated
   dependency; the newsletter control reports `INCOMPATIBLE` for a provably unrelated change.
3. `TaskEnvelope.read_paths` is not enforced and can be factually wrong; it must never be used as a positive
   premise.
4. The execution environment does not provide a source-scoped read boundary; only durable state and the DSH
   home are fenced.
5. The asset, environment and project-semantic change domains remain `UNAVAILABLE`; no empty-set substitution
   was made.
6. The positive reuse/rematerialization path is not established.
7. No model-facing continuation tool exists. C5-D was not started because the assessment semantics are not
   trustworthy enough for a definitive model-facing verdict.
8. No model comparison exists; no superiority, efficiency or cost-ratio claim is made.
9. The completion contract narrows out the standard command for documentation/data write scopes; the result
   carries scope + artifact evidence, not command evidence.
10. The route is Git-specific at the canonical-source layer.

---

## Recommendation

**A — existing architecture suffices for an executable continuation, with B as the next bottleneck for the
reuse branch.**

The next stage should not add a router, ticket database, scheduler, watchdog, second head authority or another
agent runtime. The smallest defensible next improvements are:

1. a **non-authoritative diagnostic** on the packaged inspection that names whether a conflict rests on a
   conservative upper-bound overlap or an observed dependency — it must not grant reuse;
2. an **enforced source-scoped input boundary** or a first-party actual-read observation, which is the only
   route to a packaged positive `COMPATIBLE`;
3. a **model-facing read-only continuation inspect** only after (1) and (2) make the assessment's semantics
   trustworthy to a model;
4. no B3 source-admission authority unless the product must adopt an external commit without a Work result and
   a Promotion; that requirement is not established.

A simpler native DSH workflow may well be adequate for work that does not need durable result identity,
cross-basis refusal or governed reopening. COG-5 does not measure that comparison and does not claim
otherwise.
