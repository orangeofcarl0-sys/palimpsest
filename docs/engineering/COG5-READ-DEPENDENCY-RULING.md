# COG-5 — Read-Dependency Ruling

**Status:** architecture ruling, written before any production change.
**Branch:** `palimpsest-cog5-trustworthy-continuation`
**Incoming baseline:** `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / tree `1b451532aa07da1f8035fe9f5855b6e62fd5781c`
**Primary question:** what constitutes evidence of read dependence, and what may a positive compatibility
certificate rest on?

This document answers §4 of the COG-5 mandate. It records what the shipped code actually observes, what it
merely declares, what it assumes conservatively, and which changes would require owner approval. It does not
change the compatibility vocabulary. The companion decision is
[`COG5-SOURCE-INTAKE-RULING.md`](./COG5-SOURCE-INTAKE-RULING.md).

---

## 1. The three concepts, kept separate

| concept | definition | what the product has today |
| --- | --- | --- |
| **Actual read dependence** | resources genuinely used in producing the result | **not observed.** No first-party file-access observation exists for a Work worker. The worker model may report what it read, but a self-report is not an access observation. |
| **Permitted / possible read dependence** | resources the worker could have consumed under its execution environment | **the whole source repository at the basis**, and in practice more: the worker can read any unprotected path, including the live canonical tree outside its world, and can use the network when policy allows it. |
| **Observed / enforced complete boundary** | a trustworthy upper bound that supports a formal non-interference proof | **the whole source domain**, by construction (`wholeRepositoryRead()`). It is complete *for the project's source domain*, not for every byte the process can read. No narrower source boundary is enforced. |

The three are not interchangeable. A declared `read_paths` list is an intention. A tool-call log is evidence
of some accesses, not of a complete set. A shell process can read outside every recorded tool call. A helper
program, a symlink and a network fetch can introduce inputs no ProjectIR field records. None of these alone
supports a positive non-interference proof.

---

## 2. What the shipped product actually observes

### 2.1 The basis records a dependency projection

`deriveWorkDependency()` (`src/project_world/dependency.ts:91-96`) deliberately resolves source at
**repository granularity**:

```text
reads  = [ { domain: "source", scope: "repository" } ]
writes = [ { domain: "source", scope: "repository" } ]   // only when write_paths is non-empty
```

`resolveWorkBasis()` then binds the **whole source revision** (the Git commit) as the source facet
(`src/domain/world_basis.ts:319-344`). The basis does not record individual read paths. This is a choice of
resolver, not a limitation of the `ResourceSelector` type: the type already admits `scope: "path"` and
`scope: "subtree"`.

### 2.2 The result's write footprint is an execution fact

`issueCertificate()` in the packaged composition observes the result's writes as a real Git diff from the
origin source revision to the result commit (`src/composition/continuation.ts:360-372`). A completed source
result's write footprint can therefore be `PROVEN_COMPLETE` at path granularity, because a full
`--name-status` diff enumerates every path that moved. This is the strong half of the footprint model.

### 2.3 The result's read footprint is the conservative whole repository

The packaged certificate records the read premise with the `world-materializer` observer at
`CONSERVATIVE_DOMAIN` over `[REPOSITORY_SOURCE]` (`src/composition/continuation.ts:373-379`). The coverage is
`PROVEN_COMPLETE` by construction (`src/project_world/footprint.ts:93-109`). It is honest and coarse. It is
also the only first-party source read observation that exists.

### 2.4 The change footprint is a real Git diff

`gitSourceChangeObserver` records a full `git diff --name-only --no-renames` between two revisions as
`RUNTIME_OBSERVED` at path granularity (`src/deployment/source_change_observer.ts:56-106`). A pair that cannot
be compared becomes `UNAVAILABLE`, not an empty change set. This is trustworthy for the question "which paths
moved between these two revisions?" It does not say who read those paths.

### 2.5 The compatibility assessor requires five facts for `COMPATIBLE`

`assessCompatibility()` (`src/project_world/compatibility.ts:150-317`) returns `COMPATIBLE` only when:

1. every relevant divergence is known (change coverage);
2. the change footprint is complete for the domains involved;
3. the result's read footprint has enough coverage;
4. the result's write footprint has enough coverage;
5. every change × read/write relation is proven disjoint.

`INCOMPATIBLE` is a positive conflict witness: a change overlaps a dependency selector. `UNKNOWN` is an
incomplete proof. `EXACT` is D3-a's stronger short-circuit. The module comment states the precise meaning of
`COMPATIBLE`: non-interference **under the resource-dependency model and direct-admission policy currently in
force**. It does not claim semantic causality.

---

## 3. `TaskEnvelope.read_paths` is a declaration, not an enforced boundary

`read_paths` appears in exactly three places:

| place | use |
| --- | --- |
| `src/schema/models.ts` | schema field and parser |
| `src/domain/policy.ts` | carried in the envelope |
| `src/project_world/dependency.ts:43-76` | included in the **semantic projection digest** |

No execution-world, sandbox, worker-port or completion path reads `read_paths` to restrict file access. A
worker receives the whole prepared tree; the envelope's `read_paths` is not a mount table, an ACL, a
materialization list or a tool allowlist.

Therefore:

```text
TaskEnvelope.read_paths  ≠  a proven-complete read set
```

It is an author's statement of intent. It may be useful for review and for the semantic digest. It must never
be passed to the Issuer as though an observer had produced it.

---

## 4. What the execution environment actually enforces

The shipped host does install a real read boundary, but it protects **durable state**, not the source tree.

### 4.1 The protected roots

`deriveWorkerFence()` (`host/deployment/runtime/worker_fence.js:106-127`) derives:

- `<repository>/.palimpsest` — durable owners, proof/reasoning stores, worlds root;
- any deployment-declared extra roots (`PALIMPSEST_WORKER_PROTECTED_ROOTS`);
- the DSH home, which holds session and credential material.

The canonical source tree (`<repository>/sources/**`, `deliverables/**`, the rest of the checkout) is **not**
a protected root. The worker's own world is a separate repository materialized at the basis
(`src/deployment/execution_world.ts`), but the live canonical tree is an ordinary unprotected path.

### 4.2 The two enforced layers and what each covers

| layer | mechanism | what it denies | what it does **not** deny |
| --- | --- | --- | --- |
| kernel fence | mandatory `NO_READ_UP` label on each protected root (`read_fence.js`) | Low-integrity processes reading durable state, sibling worlds, DSH home | reading unprotected source paths |
| trusted-code guard | `createReadGuard()` denies content-returning tool calls aimed at protected roots (`read_guard.js:112-160`) | `read`/`read_image`/`grep`/`glob`/`ls`/`str_replace_editor` against protected roots and ancestor walks | reads of anything outside the protected roots; `bash`/`pwsh`/`run_code` computation, which is a confined child but may read unprotected paths |

`decideRead()` explicitly allows "the execution world, and anything under no protected root at all — the
runtime, the toolchain and the package dependencies" (`read_guard.js:103-107`). That allowance is necessary
for ordinary work. It also means the worker can read the live canonical source tree at a revision newer than
its basis, and can read arbitrary unprotected files outside the repository.

### 4.3 The tool surface

`bash`, `pwsh`, `run_code`, `bash_persistent` and `pwsh_persistent` are `CONFINED_CHILD`; `read`, `read_image`,
`grep`, `glob`, `ls` and `str_replace_editor` are `GUARDED_HOST_READ`
(`host/deployment/runtime/capability_classes.js:88-112`). The confinement is an integrity boundary for the
protected roots. It is not a source-read boundary. There is no worker profile that restricts the worker to a
declared input subset: the DSH worker runs under the host's own profile.

### 4.4 Network and out-of-repository inputs

`network_policy` and `network_allowlist` are envelope fields. When the policy permits network access, the
worker can obtain inputs that no ProjectWorld selector models. Even a perfect source-read set would not be a
complete input boundary in that case. This is outside the current dependency model and must be reported, not
papered over.

### 4.5 Conclusion for Strategy A/B/C

| strategy | available? | reason |
| --- | --- | --- |
| **A — existing authoritative input manifest** | **No** | The context manifest enumerates delivered knowledge handles, not all files read. `required_artifacts` is output, not input. No content-addressed input materialization exists for Work. |
| **B — enforced restricted execution world** | **No (for source)** | The fence isolates durable state and the DSH home. It does not restrict the source tree to a declared subset. A narrower world would need a new sandbox / materialization mechanism, which §5.2 says to record and stop. |
| **C — trustworthy runtime observation** | **No** | The host observes process spawn/exit and session identity, not file accesses. There is no OS-level file-open audit, and model self-reports are not authoritative. Building a general tracing framework is out of scope. |

Therefore no first-party positive compatibility certificate for a changed source world is reachable. The
only honest first-party source read footprint is `wholeRepositoryRead()`, and it can never yield a
disjointness proof against a source change.

---

## 5. What `INCOMPATIBLE` means here

`INCOMPATIBLE` is a **policy-relative positive conflict witness**, not a causal finding about what the worker
read.

The exact chain is:

```text
change path P  ∩  result read selector [source:repository]  =  P
⇒ OVERLAP
⇒ read_invalidation conflict
⇒ INCOMPATIBLE
```

The set relation is proven. The *dependency* is a conservative upper bound: "this worker was permitted to
read the whole repository, so a change to P cannot be shown disjoint from its read set." The verdict does not
establish that the worker actually consumed P. The result may have used only `sources/brief.md` and never
touched the changed file — and the product still says `INCOMPATIBLE`, correctly, because it cannot prove
disjointness under its own read model.

This is why `wholeRepositoryRead()` is not a bug to be fixed by a typo-level change. A pinned test states the
behaviour deliberately:

- `test/lean_compatibility.test.ts:356-366` — "a whole-repository read can NEVER produce COMPATIBLE against a
  source change — by design";
- `test/lean_compatibility.test.ts:135-137` — the whole repository overlaps any source selector, so it can
  never yield a disjointness proof;
- `test/lean_d5d_result_continuation_service.test.ts:588-594` — after a head move, the packaged inspection is
  `INCOMPATIBLE` and offers rework.

Globally downgrading `INCOMPATIBLE` to `UNKNOWN` would:

- make `moreCouldHelp` true where a proven overlap exists;
- change the durable rework reason from `INCOMPATIBLE` to `UNKNOWN`;
- weaken the conservative reuse barrier;
- contradict a pinned semantic test.

It is not acceptable. The mandate's §4.3 requirement — "Do not globally downgrade `INCOMPATIBLE` to
`UNKNOWN`. Do not globally downgrade conservatism." — matches the code.

A **diagnostic-only** classification is permissible: the product may say "this conflict is a conservative
upper-bound overlap, not a demonstrated dependency" as long as it cannot grant reuse. The packaged
`ContinuationInspection` currently exposes only the outcome and the issuance digest; the certificate itself
carries the conflict selectors, but the inspection does not surface them. That is a presentation gap, not a
semantic one.

---

## 6. Downstream impact table

Any change to the meaning of `INCOMPATIBLE` or to the read footprint affects these consumers. The table was
built from the call graph and the tests named.

| consumer | what it reads | effect of keeping the current policy | effect of changing it |
| --- | --- | --- | --- |
| Compatibility Assessment (`src/project_world/compatibility.ts`) | coverage + conflict witnesses | unchanged | would change the outcome distribution and every stored certificate's interpretation |
| Compatibility Issuance (`src/project_world/issuance.ts`) | observation refs only | unchanged; no premise object accepted | would need a new premise/coverage vocabulary and migration |
| Cross-Basis Admission (`src/project_world/cross_basis.ts`, `admission.ts`) | certificate state + current target | `CONFLICT` on overlap, `INSUFFICIENT_PROOF` on gaps | would change what admission states mean; `CONFLICT` is not repairable by more evidence |
| Continuation Assessment (`src/continuation/assessment.ts`) | compatibility outcome | `INCOMPATIBLE` blocks reuse, `moreCouldHelp = false`, rework still available when the task is `VERIFYING` | would flip `moreCouldHelp` and the UX of "gather evidence vs redo" |
| Rematerialization (`src/result/rematerialization.ts`) | admission + certificate | refused for `INCOMPATIBLE` | would offer a carry the product cannot verify |
| Governed Rework (`src/continuation/service.ts`) | `INCOMPATIBLE`/`UNKNOWN` + fresh target | permit reason `INCOMPATIBLE`; `TASK_READY` provenance records it | would rewrite durable rework provenance and every replay decision |
| Promotion eligibility (`src/domain/promotion_eligibility.ts`) | Work evidence, not compatibility | unaffected | would couple two planes that are deliberately separate |
| Trajectory currentness (`src/trajectory/**`) | basis currentness | unaffected | would need a new currentness input |
| Tests | pinned semantics | `lean_compatibility`, `lean_d5a`, `lean_d5d`, `lean_cross_basis_admission`, `lean_cross_basis_composition` keep passing | would require a documented semantic decision and a preserved old-policy test |

**Decision:** the canonical enums and the whole-repository policy stay unchanged. The only production change
this stage makes on this axis is the **post-promotion change-interval anchor** (below), which corrects which
observed interval is used for an already-accepted result. It does not change how compatibility is proven.

---

## 7. Cost of false refusal vs risk of false positive reuse

### 7.1 False refusal

A genuinely unaffected result is reported `INCOMPATIBLE` after any source change. Under the packaged face
this is the common case: the cost/schedule result whose inputs are pricing and windows is reported
`INCOMPATIBLE` when only the vendor-capability file changed. The consequence is:

- the result is not reused;
- a governed rework may be offered, duplicating work;
- the project pays compute and latency, not incorrect canonical state.

The COG-4 measurement showed exactly this: the expert kernel separated the unaffected cost result
(`COMPATIBLE`, 8 disjointness proofs, `ADMITTED`) from the affected technical result (`INCOMPATIBLE`), while
the packaged face reported both `INCOMPATIBLE`. The false-refusal cost is real but bounded and safe.

### 7.2 False positive reuse

If a declared `read_paths` set were treated as a proven-complete read boundary, a worker that actually read
the changed file through a shell helper, a symlink, an absolute path, or a network fetch could be declared
compatible. The product would then carry a result whose input was superseded, and the error would be silent
because the declaration said otherwise. The execution environment does not enforce the declaration, so this
is a live risk, not a hypothetical one.

The correct asymmetry is therefore:

```text
false refusal  →  visible, bounded, conservative
false positive →  silent, invalidating, unacceptable
```

---

## 8. The smallest acceptable improvement

In order of increasing cost:

1. **Keep the whole-repository read and the `INCOMPATIBLE` verdict.** This is the safety floor.
2. **Correct the post-promotion anchor (implemented in C5-A).** For an already-promoted result, the
   origin-to-current interval includes the result's own accepted output. Comparing that interval to the
   result's own write footprint produces a self-collision and reports a false `INCOMPATIBLE`. The correct
   baseline is the **verified promotion resulting head** from the normal Promotion Lineage, and only when the
   recorded Git graph proves that the result commit is contained in that head and that head is an ancestor of
   the current source. If the lineage cannot be proven, the source change premise becomes `UNAVAILABLE`
   (→ `UNKNOWN`), never a fabricated conflict and never a fabricated compatibility. This removes a false
   conflict without weakening any proof.
3. **Expose the conflict's basis as a non-authoritative diagnostic (recommended, not implemented here).**
   The packaged inspection should be able to say "conservative whole-repository overlap" versus "observed
   dependency on a changed path" without changing the outcome or granting reuse. This is a presentation seam
   over the certificate's existing `conflicts`/`unknowns`, not a new proof. It is not implemented in COG-5
   because the executable-change budget is reserved for the anchor correction and the experiment; the gap is
   recorded.
4. **Do not replace `UNAVAILABLE` facets with empty sets.** The asset, environment and project-semantic
   change premises remain `UNAVAILABLE`. `NOT_REQUIRED` is knowledge established by the Work dependency model;
   it is not the same fact as "the world cannot report this domain", and the current assessor does not exempt
   a `NOT_REQUIRED` facet from change coverage. Changing that is a semantic refinement (see §9).
5. **Do not enforce `read_paths` without a mechanism.** If a future deployment can enforce a restricted
   materialization or an OS file-access policy, that deployment may record `SANDBOX_ENFORCED` coverage. The
   mechanism is the authority; the declaration is not. A new general sandbox is outside this stage.

---

## 9. Which changes require owner approval

| change | why it needs approval |
| --- | --- |
| redefining `INCOMPATIBLE`, or globally downgrading it to `UNKNOWN` | changes the canonical compatibility vocabulary and every stored certificate's interpretation; migration and security review required |
| treating `TaskEnvelope.read_paths` as a proven-complete read set | would permit silent false-positive reuse; requires an enforcement mechanism and a new coverage claim |
| exempting `NOT_REQUIRED` asset/environment facets from change coverage | changes the assessor's five-fact rule and the meaning of a positive proof |
| implementing a source-scoped sandbox / restricted materialization | new execution authority, OS-specific, and a deployment capability the product cannot assume |
| adding a model-facing continuation tool that exposes conflicts as verdicts | product surface; must not amplify a conservative overlap into a definitive dependency |
| adding a new source-admission authority (B3) | new canonical authority root; not required for the Work+Promotion route |

---

## 10. Decision

1. The compatibility kernel, its enums and its whole-repository read policy are **preserved unchanged**.
2. `TaskEnvelope.read_paths` is **not** an enforced boundary and must not be used as a positive premise.
3. The packaged first-party face can prove **writes** and **source changes**, and can only assume the **whole
   source domain** for reads. It therefore cannot issue a positive `COMPATIBLE` for a changed source world.
4. The expert diagnostic's `COMPATIBLE` remains a **non-authoritative** kernel result produced from
   test-owned, instrumented observations. It is evidence that the kernel is capable, not evidence that the
   product can acquire the required observations.
5. The one production correction on this axis is the **verified post-promotion change anchor** (C5-A). It
   changes which interval is observed; it does not change the meaning of any outcome.
6. The diagnostic distinction between "conservative overlap" and "observed dependency" is recorded as the
   smallest next presentation improvement, not implemented in COG-5.
7. A positive compatibility certificate for a changed source world remains **unreachable through the packaged
   product** until the execution environment can enforce a narrower, complete input boundary. That is an
   owner decision, not a test fixture.
