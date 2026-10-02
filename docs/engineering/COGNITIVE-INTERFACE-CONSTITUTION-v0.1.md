# Palimpsest Cognitive Interface Constitution

## System Prompt / Tool / Runtime / Capital Presentation Specification — v0.1

Status: **FROZEN**
Supersedes: `CIC v0` (draft, unreconciled)
Baseline HEAD at freeze: `8822f9e` (`r2-e-controlled-capital-efficacy`)
Frozen by: CIC-v0.1 freeze stage (document/ruling only)
Canonical impact: **ZERO** — `src/` diff zero, host production diff zero, no canonical owner change

This version reconciles the v0 draft with the R2-U evidence, the R2-E evidence, an independent
repository review, and the corrections accepted in this stage. Where v0 and this document disagree, this
document governs. Sections are renumbered only where reconciliation required it; v0's §-topics are
preserved so a reader holding v0 can diff the two.

---

# 0. Status

This document defines the **cognitive interface** between Palimpsest and an active model.

It does NOT define:

- Project canonical truth;
- Work authority;
- Evidence admission;
- Verification;
- Promotion;
- Procedure standing;
- filesystem/security enforcement.

Those remain owned by their existing canonical/runtime components.

This specification governs only:

```text
what the model is told
when it is told
through which channel
with what semantic guarantees
```

Core rule:

```text
Cognitive Presentation ≠ Canonical Truth
Cognitive Presentation ≠ Authority
```

---

# 1. Constitutional principles

## CI-1 — Mechanism enforces; prose explains

Any invariant whose violation would damage correctness, authority, security, or durability MUST be
enforced mechanically.

Examples:

```text
write scope
attempt-bound context access
promotion authority
verification
filesystem confidentiality
worker concurrency
tool availability
```

System prompt text may explain these mechanisms.

It must never be their sole enforcement mechanism.

Therefore:

```text
PromptPolicy ≠ CapabilityPolicy
PromptPolicy ≠ Authority
```

**v0.1 clarification (resolves the v0 §21/§22 internal-consistency gap).** CI-1 previously had no
mechanism behind §22's requirement that renderers "may not alter authority semantics". A rule about
prose, enforced only by prose, is the exact failure CI-1 names. v0.1 replaces the unenforceable claim
of *natural-language* equivalence with a mechanically checkable one: a **structural semantic-atom
coverage contract** (§21A). Structural coverage is enforced mechanically; natural-language behavioural
equivalence is an empirical testing obligation and is explicitly NOT claimed to be mechanically proven.

---

## CI-2 — Addressability ≠ Discoverability ≠ Decision Relevance

Three separate properties exist:

```text
Addressability
= the worker can name a resource precisely

Discoverability
= the worker knows that the resource exists

DecisionRelevance
= before paying the retrieval cost,
  the worker has enough information to decide
  whether retrieval could change its next action
```

A resource is not cognitively usable merely because it is addressable.

A visible opaque handle satisfies:

```text
Addressable = true
Discoverable = true
DecisionRelevant = false
```

This is an incomplete cognitive interface.

---

## CI-2A — Decision-Relevance Surface law (NEW in v0.1)

```text
A voluntarily retrievable resource must expose a decision-relevance surface,
unless consultation is mechanically required.
```

This is the constitutional form of CI-2. It is a **law about what an interface must provide**, not a
law about which specific mechanism provides it.

Explicitly:

```text
DecisionRelevanceSurface ≠ necessarily Preview
```

A decision-relevance surface MAY be satisfied by any of:

```text
owner-native title
applicability
limitations
standing / freshness / activity
bounded deterministic owner-grounded content projection
```

What is frozen is that *some* decision-relevance surface must exist for a voluntarily retrievable
resource. What is **not** frozen — and must not be frozen — is that every capital index MUST contain a
preview. A content-bearing preview is currently a **candidate treatment**, not a constitutional
requirement. R2-M tests that candidate.

Where consultation is mechanically required (a governed runtime rule, not a prose encouragement), the
surface requirement is discharged by the mechanism, not by the index.

---

## CI-3 — Availability ≠ Inclusion

Retain the existing Context law:

```text
Available knowledge
≠
Knowledge selected for this attempt
```

Selection remains governed and attempt-bound.

However:

```text
Selected knowledge
≠
Worker understands why it might matter
```

Therefore governed selection and worker-side decision relevance are separate concerns.

---

## CI-4 — Historical success ≠ universal superiority

Any behavioural claim about:

```text
prompt
procedure
skill
tool description
workflow
agent topology
```

is scope-bound.

Minimum evaluation scope should identify where known:

```text
model / model family
model version
task distribution
context regime
tool surface
runtime/harness
environment
evaluation basis
```

A local improvement must never be promoted into an architecture law solely because it improved one
benchmark.

Freeze:

```text
Observed Behavioural Gain
≠
General Agent Law
```

---

## CI-5 — Behavioral optimization ≠ architectural truth

Prompt tuning, skill evolution, reflection strategies, role wording and agent topology are first:

```text
empirical treatments
```

They become architecture only when a stable project concept independently requires them.

No behavioural optimization result creates:

```text
new canonical owner
new authority
new event species
new lifecycle
```

by itself.

---

## CI-6 — Bundle efficacy ≠ component marginal efficacy (NEW in v0.1)

```text
Bundle Efficacy ≠ Component Marginal Efficacy
```

When an experiment compares an absent bundle against a present bundle, its causal result belongs to
**the bundle**. It does not license a claim about any single component inside it.

Concretely: R2-E compared

```text
no capital
vs
Proof + Reasoning + Procedure
```

so its causal result belongs to the **full selected-capital bundle**. It does **not** isolate the
marginal contribution of Proof, of Reasoning, or of Procedure individually. A claim of the form
"Procedure efficacy = REPLICATED" is therefore **not supported** and MUST NOT be stated.

Every empirical state statement in this constitution carries its tested scope where material.

---

# 2. Cognitive interface layers

Palimpsest model-facing context SHALL be divided into seven distinct layers.

```text
A. Cognitive Constitution
B. Task Envelope
C. Runtime State
D. Tool Interface
E. Inherited Project Capital Index
F. Retrieved Capital Body
G. Orchestration / Feedback
```

These layers have different owners and must not be collapsed into one large prompt.

---

# 3. Layer A — Cognitive Constitution

## 3.1 Purpose

A short, stable, cache-friendly description of:

```text
what this activation is
what its responsibility is
what it does not own
how Palimpsest interprets its outputs
```

This is the closest thing Palimpsest should have to a conventional "system prompt".

It should remain small.

## 3.2 Required semantic content

The worker constitution SHOULD explain:

### Identity

```text
You are an active Work worker for one governed attempt.
```

It must not imply:

```text
you are the project
you are a durable agent identity
you own the task
you own project truth
```

### Work relation

The worker:

```text
performs engineering work inside the execution world
produces an observable candidate result
reports its outcome
```

The worker does NOT:

```text
verify its own result
admit evidence
settle canonical truth
promote project state
grant itself authority
```

### Result semantics

Freeze:

```text
Worker self-report ≠ Verification
Result ≠ Promotion
Completion claim ≠ Acceptance
```

The worker should understand that external mechanisms judge the result.

### Capital semantics

Explain the three durable capital classes:

```text
Proof
= established project knowledge/evidence state

Reasoning
= admitted prior analysis or conclusion

Procedure
= reusable advisory method guidance
```

And explicitly:

```text
Procedure ≠ executable instruction
Procedure ≠ authority
Procedure ≠ permission
```

### Security / authority explanation

The prompt may describe:

```text
write scope
context-pull boundaries
sandbox restrictions
```

but only as explanations of actual runtime enforcement.

Never phrase these as if compliance depends on model goodwill.

---

# 4. What MUST NOT enter the Cognitive Constitution

Do not put volatile facts into the stable prefix.

Forbidden examples:

```text
current cwd
current commit
current task text
current selected capital
current tool availability
current continuation
current permission mode
current world state
timestamps
current model-independent diagnostics
```

These belong to dynamic sections.

---

# 5. Layer B — Task Envelope

## 5.1 Ownership

Rendered from structured Work/Attempt state.

Not hand-authored prompt prose.

## 5.2 Content

At minimum:

```text
goal
base/basis revision
write scope
required artifacts
completion surface
relevant explicit constraints
```

Where possible, values must be generated directly from canonical/runtime objects.

Do not duplicate independently maintained prose versions of the same fact.

## 5.3 Task semantics vs execution advice

The Task Envelope states:

```text
WHAT must be accomplished
```

It should not encode detailed generic instructions about:

```text
HOW to reason
HOW to plan
HOW to use tools
HOW to inspect knowledge
```

unless that method is genuinely part of the principal's task requirement.

---

# 6. Layer C — Runtime State

Dynamic context supplied from actual host/runtime state.

Examples:

```text
OS
cwd/world directory
permission profile
current execution mode
continuation state
available runtime facts
```

Runtime state should be generated from the mechanism that owns it.

Freeze:

```text
RuntimeContext describes current reality.
It does not create current reality.
```

---

# 7. Layer D — Tool Interface

Tool descriptions are first-class behavioural interfaces.

They must not be treated as neutral API documentation.

Each important model-facing tool SHALL define:

```text
WHAT it does
WHEN it is useful
WHEN it is not useful
WHAT information/result it returns
WHAT its result means
WHAT it cannot authorize
```

---

# 8. Tool description design template

Each consequential tool should approximately follow:

```text
Purpose
When to use
Typical triggers
Input meaning
Output meaning
Important limitations
Authority statement
```

Not every trivial tool requires all sections.

---

# 9. `palimpsest_worker_context_pull`

Current weakness (verified in the repository at freeze time, not asserted from memory):

The production description is dominated by restrictions. It opens with a command rather than an
affordance, and two of its three sentences are prohibitions — that an unlisted handle is refused, and
that the result is never authority and cannot widen scope.

The revised conceptual contract should instead begin with affordance.

Example semantic shape:

```text
Retrieve project knowledge that was explicitly selected
for this attempt.

Use this when an inherited Proof, Reasoning item, or Procedure
could reduce uncertainty, reveal a known project constraint,
recover prior analysis, or prevent repeating work already done.

The handle identifies one item from this attempt's inherited
project-capital index.

Returned content is advisory/informational only.
It never widens authority, write scope, verification rights,
or promotion rights.
```

The exact wording may be model-family-specific.

The semantics may not differ.

**v0.1 boundary ruling.** A tool-description rewrite is a *separate treatment* from an index
decision-relevance treatment, and R2-U already measured a prose-affordance treatment and found it
`NOT_IMPROVED` (§48). A rewritten tool description MUST NOT ride along inside the R2-M M1 arm; doing so
would confound the one question R2-M exists to answer. See §41.

---

# 10. Layer E — Inherited Project Capital Index

This is the largest current cognitive-interface gap.

The index must remain:

```text
small
deterministic
owner-grounded
attempt-bound
non-authoritative
```

But under CI-2A it must no longer be semantically opaque: it must expose *some* decision-relevance
surface. Today it does not.

---

# 11. Capital index requirements

Every index entry should contain enough information to estimate expected information value before
retrieval.

The index must NOT contain the full body.

Minimum conceptual shape:

```text
kind
stable identity
decision-relevance surface (see CI-2A — NOT necessarily a preview)
standing/activity state where owner-grounded
why it appears in this attempt, if genuinely known
handle
```

## 11.1 The `why` field, honestly stated (v0.1)

"Do not invent a relevance explanation." Today the only owner-grounded "why" available is:

```text
inclusion_reason = "explicit_request"
```

a constant on all three binding kinds. A constant is not decision-relevant. Therefore:

- The neutral, owner-grounded fact that MAY be rendered is `Selected for this attempt: true`.
- A richer `why-this-attempt` MUST NOT be inferred, generated, or invented.
- `why-this-attempt` is **excluded from R2-M M1** unless and until an owner-grounded source richer than
  the constant exists. See §41.

---

# 12. No invented relevance owner

Do NOT introduce fields such as:

```text
relevance = 0.93
priority = HIGH
salience = 0.87
confidence = 91%
```

unless an existing canonical/derived owner truly owns those values.

Do not copy MCP vocabulary blindly.

Palimpsest owner discipline still applies.

---

# 13. Proof index entry

Candidate presentation:

```text
PROOF

Preview:
  bounded deterministic projection of the claim
  (EXPERIMENTAL — see §16.1; not currently derivable from
   compile-time binding metadata alone)

Standing at compile:
  existing owner value

Freshness:
  existing owner value

Selected for this attempt:
  true

Handle:
  @ctx/proof/...
```

Full Proof content remains pull-only.

---

# 14. Reasoning index entry

Candidate presentation:

```text
REASONING

Preview:
  bounded deterministic projection of the admitted claim
  (EXPERIMENTAL — see §16.1)

Activity at compile:
  ACTIVE

Selected for this attempt:
  true

Handle:
  @ctx/reasoning/...
```

Do not imply:

```text
true
verified
authoritative
```

merely because the claim is admitted.

---

# 15. Procedure index entry

Procedure requires especially careful framing.

Candidate:

```text
PROCEDURE

Method preview:
  bounded deterministic method description
  (EXPERIMENTAL — see §16.1)

Applicability:
  canonical Procedure applicability field
  (NOTE: lives INSIDE the Procedure body — see §15.1)

Limitations:
  canonical Procedure limitations field
  (NOTE: lives INSIDE the Procedure body — see §15.1)

Revision / standing:
  existing owner values (standing is body-free)

Selected for this attempt:
  true

Handle:
  @ctx/procedure/...
```

Never render:

```text
Recommended action: ...
You should do ...
Best method: ...
```

unless that exact normative meaning is owned by Procedure semantics.

Procedure remains advisory.

## 15.1 Procedure metadata provenance differs from Proof/Reasoning preview (v0.1)

The repository facts, verified at freeze time:

```text
Procedure DOES own, as first-class required non-empty fields:
  applicability
  limitations

BUT those fields live inside ProcedureContent, i.e. inside
revision.content — the BODY.

Body-free Procedure facts available without reading the body:
  procedure_id
  procedure_revision
  standing_at_compile (ACTIVE | SUPERSEDED | RETIRED)
  procedure_basis_at_compile (throughSeq, chainDigest)
  inclusion_reason ("explicit_request")
  reason (selector's stated reason — free text, NOT authority)
```

Consequence for analysis:

```text
Procedure owner-native metadata  ≠  Proof/Reasoning content preview
```

They have **different provenance**. `applicability` and `limitations` are owner-native *body* content;
standing and revision are owner-native *metadata*. A Proof/Reasoning preview is a projection of a body
the compile path does not read (§16.1).

This difference MUST be visible in R2-M analysis: the two are not interchangeable treatments and must
not be reported as one homogeneous "preview" effect.

Do not derive new relevance scores from any of these.

---

# 16. Preview derivation law

A preview must be:

```text
deterministic
owner-grounded
bounded
non-generative at compile time
digest-stable
```

Allowed:

```text
structured field projection
bounded canonical text
existing title/applicability/claim field
```

Forbidden:

```text
LLM generated summary during compile
semantic relevance score invented by host
free-form reinterpretation
```

Freeze:

```text
Preview ≠ New Reasoning Claim
```

## 16.1 Compile-time preview caveat (v0.1 — IMPLEMENTATION FACT)

The current implementation fact, verified at freeze time:

```text
Context compile does NOT read Proof/Reasoning/Procedure bodies
for presentation.

Bodies are materialized only on the governed pull path.
```

Evidence: the context service invokes `readClaim` and `readRevision` only on the pull path; the
compile-time bindings carry ids, standing, freshness, basis, `inclusion_reason` and handle, and
deliberately no `body` and no `preview` field. The Proof and Reasoning binding types have **no text
field at all**; the Procedure binding's `applicability`/`limitations` are inside the body (§15.1).

Therefore:

```text
a bounded CONTENT preview for Proof/Reasoning is NOT currently
derivable from compile-time binding metadata alone
```

Do not imply otherwise. Any product implementation of a content-bearing preview would require an
explicit architectural ruling about:

```text
where the preview is derived from, and
whether canonical compile is allowed to read body content
```

This is exactly why v0.1 keeps the preview **experimental** and confines R2-M's content-bearing option
to an experimental host path (§41, and the R2-M pre-ruling).

---

# 17. Layer F — Retrieved Capital Body

Full bodies remain pull-only unless an explicit runtime policy intentionally removes the model's choice.

Normal path:

```text
index
→ governed pull
→ attempt-bound handle validation
→ canonical owner read
→ transient body
```

No duplicate knowledge store.

No raw backing-file read.

No body embedded into canonical ContextManifest.

---

# 18. Deterministic injection

Automatic injection is allowed only when a separately designed runtime rule determines that
consultation is required.

Examples of valid future forms:

```text
path-triggered
task-class-triggered
explicit principal requirement
mechanical workflow phase
```

Automatic injection must not emerge from:

```text
"the model probably needs this"
```

unless there is a governed selection policy owning that decision.

## 18.1 R2-E injection is NOT productized (v0.1 — explicit ruling)

```text
R2-E host-mediated prework was an EXPERIMENTAL mechanism
used to remove voluntary uptake from the efficacy comparison.
```

It does NOT authorize:

```text
automatic injection of all selected capital in production.
```

R2-E proved:

```text
selected capital CAN HELP WHEN CONSUMED
```

within its tested scope. It did NOT prove:

```text
production should always consume selected capital
```

nor:

```text
automatic injection is generally optimal
```

R2-E's mechanism consumed **all** selected handles unconditionally before the first turn. That is
correct as an experiment and is precisely the forbidden promotion if it became product semantics. It
is the most obvious thing to prematurely productize, so the prohibition is stated here rather than left
implied.

---

# 19. Layer G — Orchestration / Feedback

If an action MUST happen for correctness, do not rely on prose encouragement.

Examples:

```text
verification
required review phase
termination
evidence production
approval
mandatory precondition checks
```

Use:

```text
state transition
required output schema
tool gate
external verifier
runtime trigger
```

The system prompt may explain the step.

The runtime owns the step.

---

# 20. Model-family rendering

There is one semantic Cognitive Interface Contract.

There may be multiple model-family renderers.

Conceptually:

```text
CognitiveInterfaceContract
        ↓
renderOpenAI(...)
renderAnthropic(...)
renderDeepSeek(...)
renderGemini(...)
renderOther(...)
```

---

# 21. What renderers MAY change

Renderers may vary:

```text
length
section order
redundancy
examples
formatting
heading structure
tool-description verbosity
reminder frequency
```

because models differ in post-training and instruction sensitivity.

---

# 21A. CognitiveSemanticAtoms — the renderer contract (NEW in v0.1)

## 21A.1 The problem v0.1 resolves

v0 said renderers "may not alter authority semantics" and that "the semantics may not differ" while
granting wide latitude over length, order, redundancy, examples and verbosity. That invariant had no
mechanism, which violates CI-1. v0.1 does **not** claim that natural-language semantic equivalence can
be mechanically proven. It introduces a structural contract that *can* be checked mechanically, and it
names the remainder as an empirical obligation.

## 21A.2 The atoms

A **CognitiveSemanticAtom** is a named, machine-checkable semantic obligation. The required set
includes at minimum:

```text
WORKER_IS_ATTEMPT_LOCAL
WORKER_SELF_REPORT_NOT_VERIFICATION
NO_PROMOTION_AUTHORITY
NO_VERIFICATION_AUTHORITY
PROCEDURE_IS_ADVISORY
CAPITAL_DOES_NOT_WIDEN_AUTHORITY
```

## 21A.3 The renderer obligation

A renderer MUST:

```text
consume every REQUIRED atom
exactly once, or according to a declared composition rule
```

## 21A.4 What is mechanically tested

```text
required atom coverage
unknown atom refusal
duplicate forbidden atom where applicable
renderer version
golden output
component digest
```

## 21A.5 The freeze

```text
Structural semantic coverage is mechanically enforced.
Natural-language equivalence is empirically tested.
```

The first clause is the mechanism CI-1 requires. The second is explicitly an obligation of behavioural
evaluation, not a mechanical proof. No renderer is implemented in this stage.

---

# 22. What renderers MUST NOT change

They may not alter:

```text
authority semantics
Work semantics
capital kinds
verification semantics
completion meaning
write scope
runtime facts
tool capability
```

Model-specific prompt rendering is presentation variance, not semantic variance.

Enforcement of "may not alter" is structural, via §21A's atom coverage — not a claim of proven
natural-language equivalence.

---

# 23. Stable prefix architecture

Preferred assembly:

```text
[Model-family cognitive constitution]    STATIC

[Tool schemas / descriptions]           STABLE

[Task Envelope]                          PER ATTEMPT

[Runtime State]                          DYNAMIC

[Inherited Capital Index]                PER ATTEMPT

[Continuation / current state]           DYNAMIC
```

Avoid rebuilding one monolithic prompt string.

---

# 24. Cache discipline

Stable prefix should remain byte-stable when semantic state does not change.

Dynamic runtime facts should not invalidate the whole prefix unnecessarily.

Prompt assembly should expose component digests:

```text
constitutionDigest
toolSurfaceDigest
taskEnvelopeDigest
runtimeContextDigest
capitalIndexDigest
modelRendererId
```

These names are specified, not implemented. The experimental stages expose their own per-component
digests (`ordinaryTaskDigest`, `indexSectionDigest`, `affordanceClauseDigest`) in the harness rather
than in production; no production component-digest surface exists yet.

---

# 25. Prompt version identity

Every worker run SHOULD record:

```text
cognitiveContractVersion
rendererId
rendererVersion
modelId
toolSurfaceDigest
assembledPromptDigest
capitalIndexDigest
```

This is experiment/reproducibility metadata.

It is not Project truth.

---

# 26. Prompt changes are production changes

Any change to:

```text
core constitution
tool description
capital presentation
task rendering
runtime section ordering
```

must be treated like code.

Required minimum:

```text
snapshot/golden diff
semantic review
representative behavioural eval
model-family compatibility check where material
```

Do not merge prompt changes because they "sound clearer".

---

# 27. Prompt evidence grades

Every claimed improvement should be labelled approximately as:

```text
LOCAL
TASK-FAMILY
MODEL-ROBUST
HARNESS-ROBUST
MECHANISM-SUPPORTED
```

Do not state "improves agents" without scope.

---

# 28. Procedure constitution

Existing Procedure owner remains valid.

Freeze — **with v0.1 status corrections**:

```text
Procedure governance                    CLOSED
Procedure voluntary uptake              MEASURED LOW / NOT_IMPROVED
                                        under the current interface
Procedure behavioural incorporation     OBSERVED under forced
                                        full-capital consumption
Procedure marginal efficacy             UNPROVEN
Procedure generalization                UNPROVEN
```

Do NOT state:

```text
Procedure efficacy = REPLICATED
```

unless a randomized/controlled comparison isolates Procedure's marginal contribution. R2-E compared
`no capital` vs `Proof + Reasoning + Procedure`, so its causal result belongs to the full selected-capital
bundle (CI-6).

Procedure must not gain runtime authority merely to improve uptake.

---

# 29. Procedure evolution

A successful revised Procedure creates:

```text
ProcedureCandidate
```

not automatically:

```text
universally superior Procedure
```

Any empirical supersession claim should preserve evaluation scope.

Longer-term evaluation metadata MAY eventually include:

```text
task family
model family
tool/runtime version
environment basis
context regime
evaluation evidence
```

but no new fields should be introduced until an owner/lifecycle need is independently demonstrated.

---

# 30. Skill evolution prohibition

Do not implement:

```text
failure
→ LLM edits skill
→ next run succeeds
→ auto-supersede old skill
```

as a Palimpsest governance rule.

Historical success is evidence.

It is not universal standing.

---

# 31. Role design

A Palimpsest role is not primarily a persona sentence.

A runtime role is the composition:

```text
Role
≈
Tools
∩ Authority
∩ Information Access
∩ Runtime State Slice
∩ Subscription / Responsibility
```

Prompt text labels and explains this bundle.

Freeze:

```text
RolePrompt ≠ RoleAuthority
```

---

# 32. Delegation

Delegation messages carry:

```text
work
context necessary to understand work
explicit constraints
```

They do not create receiver authority.

Receiver capability comes from runtime composition.

Do not express:

```text
"you are now authorized to…"
```

through delegation prose.

---

# 33. Handoff truth discipline

Freeze:

```text
Message ≠ Evidence
Summary ≠ Source Truth
Handoff ≠ Authority
```

If a receiver requires a fact to make a governed decision, it should resolve that fact through its owner
where practical rather than trusting prose summary.

---

# 34. Reviewer design

Do not create reviewer quality primarily by writing:

```text
"You are a strict independent reviewer."
```

Reviewer independence should derive from some combination of:

```text
fresh context
independent information
different tool visibility
external oracle
separate model
different authority
```

Prompt wording is secondary.

---

# 35. Reflection

No global mandatory reflection loop.

Reflection is justified only when:

```text
external evidence exists
a failure signal exists
a task class empirically benefits
```

Intrinsic self-critique is not a default architecture primitive.

---

# 36. Planning

No universal plan-first policy.

Planning should be state-/task-conditioned.

If planning is required:

```text
planning mode
```

should be represented mechanically through tool/write constraints or explicit orchestration state.

Not solely:

```text
"Please plan first."
```

---

# 37. Termination

Worker self-report remains observational.

Canonical completion is never decided by wording such as:

```text
"Do not stop until all tests pass."
```

Termination/acceptance is governed externally.

---

# 38. Security

Prompt injection resistance is not owned by this specification.

Prompt wording may mark:

```text
untrusted content
retrieved content
external messages
```

but actual security depends on:

```text
capability isolation
authority isolation
provenance
sanitization
verification
```

Freeze:

```text
Prompt Security ≠ Security Boundary
```

---

# 39. Experiment separation

Future cognition experiments SHALL separate at least:

```text
Accessibility
Discoverability
Decision Relevance
Uptake
Efficacy
Generalization
```

Do not collapse them into one "memory works" metric.

---

# 40. Capital experiment order (CORRECTED in v0.1)

v0 recommended `R2-M → R2-E`. That ordering is **superseded**: R2-E has already been executed and
closed.

Corrected sequence:

```text
R2-U  Capital Uptake & Affordance      CLOSED  — NOT_IMPROVED
R2-E  Controlled Capital Efficacy      CLOSED  — REPLICATED (bundle, host-mediated)
R2-M  Decision-Relevant Index Metadata NEXT    — NOT STARTED
```

The current open empirical question:

```text
Does decision-relevant capital-index metadata improve
voluntary governed uptake?
```

R2-M is next. R2-M and R2-E answer independent questions:

```text
R2-M:  Can the worker decide that capital is worth retrieving?
R2-E:  When the capital is actually consumed, does it help?
```

R2-E's answer is yes, within scope, **when consumption is guaranteed by the host**. R2-M asks whether
the worker can be given enough information to decide for itself.

---

# 41. R2-M treatment boundary

Do NOT change:

```text
task
capital body
selection policy
pull mechanism
authority
runtime security
```

Only index presentation changes.

Preferred first comparison:

```text
M0
kind + opaque handle

vs

M1
kind
+ bounded deterministic owner-grounded decision metadata
+ existing standing/applicability metadata
+ explicit selected-for-this-attempt fact
+ handle
```

## 41.1 Confound exclusion (v0.1 — explicit)

M1 MUST NOT include any of:

```text
new prose review clause
rewritten context-pull tool description
relevance score
priority score
salience score
why-this-attempt inference
```

These would confound the metadata treatment. The prose-affordance treatment was already measured by
R2-U and found `NOT_IMPROVED`; re-introducing it inside M1 would make R2-M uninterpretable. The
tool-description rewrite (§9) is likewise a separate treatment and MUST NOT ride along.

No extra prose reminder in the primary comparison.

---

# 42. R2-M primary metric

Primary:

```text
P(any governed pull | selected capital)
```

Secondary:

```text
time to first pull
pull before first edit
kind(s) pulled
task efficacy association
```

Do not interpret performance causally unless consumption is sufficiently common. No efficacy causal
claim from self-selected pullers.

---

# 43. R2-E boundary

R2-E mechanically removed voluntary uptake as the causal variable.

It used the existing governed resolver. It did not bypass:

```text
AllowedPullHandles
canonical owners
attempt binding
```

It compared:

```text
capital absent
vs
capital actually consumed
```

**v0.1: R2-E is CLOSED.** Its result is recorded in §48 and its injection mechanism is explicitly
non-productized in §18.1. R2-E must not be converted into an uptake verdict; R2-U remains the uptake
result.

---

# 44. Generalization gate

Neither R2-M nor R2-E may support a universal product claim until at least one successful treatment is
repeated across additional dimensions.

Preferred next dimensions:

```text
model family
model capability level
context length/regime
task family
tool/runtime variant
environment drift
```

Not all must be tested immediately.

But untested dimensions must remain explicit.

---

# 45. No new relevance owner yet

Do NOT add:

```text
RelevanceScore
SalienceStore
KnowledgePriority owner
UniversalContextRanker
```

to solve decision relevance.

First test whether existing owner-grounded metadata is sufficient.

Only if a persistent project fact is proven necessary should a new owner be considered.

---

# 46. Cognitive interface acceptance criteria

This specification is considered implemented only when Palimpsest can prove:

```text
1. stable cognitive constitution exists
2. default task/runtime assembly is componentized
3. tool descriptions have explicit affordance semantics
4. capital index is experimentally validated
5. prompt components are digestible/versioned
6. model-family rendering is possible without semantic divergence
   (structurally enforced via §21A atoms; empirically tested for language)
7. runtime-enforced invariants remain outside prose
8. prompt changes have golden/snapshot tests
```

This is NOT a requirement to implement all model-family renderers immediately.

---

# 47. Final constitutional summary

The Palimpsest cognitive interface follows:

```text
Project truth
    ↓
governed structured state
    ↓
cognitive presentation
    ↓
model decision
    ↓
tool/runtime action
    ↓
mechanical authority boundary
    ↓
observable result
    ↓
external verification
```

No reverse shortcut is allowed.

Especially:

```text
Prompt
↛ Authority

Prompt
↛ Canonical Truth

Procedure
↛ Permission

Worker self-report
↛ Verification

Empirical success
↛ Universal superiority

Bundle efficacy
↛ Component marginal efficacy
```

And:

```text
Addressability
≠ Discoverability
≠ Decision Relevance
≠ Uptake
≠ Efficacy
≠ Generalization
```

---

# 48. Current project state under this constitution (CORRECTED in v0.1)

```text
Institutional architecture       MATURE

Work / authority / evidence      MATURE

Host confidentiality             CLOSED
for supported Windows profile

Procedure governance             CLOSED

Procedure voluntary uptake       MEASURED LOW / NOT_IMPROVED
                                 under the current interface

Procedure behavioural            OBSERVED under forced
incorporation                    full-capital consumption

Procedure marginal efficacy      UNPROVEN

Procedure generalization         UNPROVEN

Worker cognitive constitution    SPECIFIED HERE (v0.1), not yet implemented

Capital addressability           CLOSED

Capital discoverability          PRESENT but weak

Capital decision relevance       OPEN

Capital voluntary uptake         NOT_IMPROVED under the current
                                 opaque interface

Full selected-capital efficacy   REPLICATED under host-mediated
                                 governed consumption, within the
                                 tested scope

Capital generalization           UNPROVEN
```

## 48.1 Tested scope of the efficacy claim

`Full selected-capital efficacy: REPLICATED` is scoped to:

```text
model / provider       deepseek-flash via deepseek-official
runtime / harness      DSH host, Palimpsest work-worker
security profile       windows-confidential-single-active
                       (MAX ACTIVE worker = 1)
scenarios              C (replay-safe reducer), D (incremental
                       cache invalidation)
context regime         attempt-bound selected capital, 3 handles
                       (Proof + Reasoning + Procedure)
repetitions            n = 5 per arm per scenario (20 trials)
consumption mechanism  HOST_MEDIATED_PREWORK (guaranteed, not voluntary)
environment            Windows, single-machine, sequential workers
```

It is LOCAL to that scope (CI-4). It is not a general agent law.

## 48.2 The gap that R2-M exists to close

The two stages answer different questions, and the gap between them is the interesting one:

```text
R2-U:  a prose affordance did NOT improve voluntary uptake
       (1/40 overall; 0/10 explicit-review capital-present)

R2-E:  when consumption is GUARANTEED by the host, capital helps
       (mistake recurrence 0/5 in every E1 arm; solves up in both)
```

So capital *works when consumed*, but the worker *does not choose to consume it*. R2-M tests whether
making the index decision-relevant (CI-2A) is enough to close that gap — without forcing consumption.

---

# 49. Immediate next steps (CORRECTED in v0.1)

Do not implement a new large worker prompt.

Do not add another prose reminder.

Do not implement relevance automation.

Next:

```text
1. This Constitution (v0.1) is FROZEN.

2. Execute R2-M under its pre-ruling:
   opaque index (M0)
   vs
   owner-grounded deterministic decision metadata (M1).

3. Only after R2-M:
   decide whether capital-index presentation
   should become product semantics.

4. Only after a successful local treatment:
   perform cross-model / cross-context replication.
```

---

# 50. Core laws to freeze

```text
Mechanism enforces; prose explains.

Behavioral Optimization ≠ Architectural Truth.

Observed Behavioural Gain ≠ General Agent Law.

Historical Success ≠ Universal Superiority.

Addressability ≠ Discoverability ≠ Decision Relevance.

A voluntarily retrievable resource must expose a
decision-relevance surface, unless consultation is
mechanically required.

DecisionRelevanceSurface ≠ necessarily Preview.

SelectedForAttempt ≠ WorkerUnderstandsWhySelected.

Bundle Efficacy ≠ Component Marginal Efficacy.

Procedure ≠ Authority.

RolePrompt ≠ RoleAuthority.

Message ≠ Evidence.

WorkerSelfReport ≠ Verification.

Structural semantic coverage is mechanically enforced.
Natural-language equivalence is empirically tested.
```
