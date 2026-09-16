# The Palimpsest interaction model

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184` (canonical main after G10-AE-R).
Stage: **UX-A — One-Request Local Multi-Agent Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-A.md`.
Shipped implementation: `src/interaction/**` (`intent.ts`, `collaboration.ts`,
`result_view.ts`, `host_adapter.ts`, `index.ts`).

This is a **product** document. It is written for two readers — a person using
Palimpsest, and a host integrator embedding it — not for a kernel engineer. Every
claim below is traceable to code or a test; the citations are there so you can
falsify them, not because you need to read them.

---

## 1. The promise

> Make useful local multi-Agent collaboration feel like one ordinary request to one
> ordinary Agent.

You say what you want in your own words. Palimpsest decides whether splitting the
work across more than one reasoning locus has **engineering value**. If it does, the
existing runtime does a bounded amount of local collaboration and gives you back a
short, useful result. If it does not, you get an honest "one locus is enough".

You never have to say "agent", name a recipe, assemble a plan, or read an id.

```text
You state intent
        ↓
Palimpsest decides whether a collaboration boundary is useful
        ↓
the existing runtime performs bounded collaboration
        ↓
you (or your host) receive a structured, useful result
```

## 2. The core invariant

```text
Task decomposition != Agent decomposition
```

Splitting a *task* into independent sub-problems is not the same as splitting the
*workers* into separate agents. Palimpsest only creates a second locus of reasoning
when the boundary itself earns its keep.

The mechanism that enforces this is not a slogan: it is the existing architecture
advisor. UX-A does not decide anything about structure itself — it asks the advisor,
and the advisor's rule lives in `src/advisor/advisor.ts:304-320`. UX-A adds no
second copy of that rule (`test/uxa_collaboration.test.ts` asserts the source
contains none of `shouldExplore`, `shouldCoordinate`, `prefersExplore`,
`buildCandidate`).

## 3. The five intents, in user language

A request carries one optional intent. If you do not state one, it is `AUTO`.

| Intent | In plain words | What Palimpsest will do |
| --- | --- | --- |
| `AUTO` | "You decide." | Read the durable work-mode preference as context, profile the task, ask the existing advisor whether another boundary is worth it. If there is no advisor, it falls back to `FOCUS`. |
| `FOCUS` | "Just do it." | Create **no** branch, cell or extra agent. The principal continues with the request. |
| `PARALLEL` | "Explore a few independent approaches." | Ask the advisor (with `userRequestedMultiAgent = true`) and run bounded, **ephemeral** reasoning branches. No durable peer is ever minted. |
| `CHECK` | "Check this independently." | Use the real Project Verification runtime on the current project head. If no independent verifier exists, answer `CAPABILITY_REQUIRED` — never a same-context substitute. |
| `PARALLEL_AND_CHECK` | "Explore alternatives, then check independently." | Both: bounded local exploration followed by a real project-head verification. |

Definitions live in `src/interaction/intent.ts:30`. `AUTO` is the default for an
absent intent (`:37`); it is never guessed from your sentence by the core service —
natural-language classification is a host concern (see §7).

## 4. The visible verbs

You should see what you would say, not the internal mode name. Every plan and every
result carries a `verb` (§24), the user-facing label for the structure:

| Structure | Verb you see |
| --- | --- |
| single principal continues | **Do it** |
| local exploration | **Explore alternatives** |
| local verification | **Check independently** |
| exploration then verification | **Explore alternatives, then check independently** |
| needs another project | **Needs another project (not available here yet)** |
| unavailable here | **Not available in this deployment** |

Source: `src/interaction/intent.ts:228-235`. A test asserts the verb is never the
internal name (`test/uxa_collaboration.test.ts`, "uxa verbs are user copy").

`FOCUS`, `EXPLORE`, `VERIFY` and `ReasoningCell` are still the names of the
underlying machinery. They appear in expert tools and in `effectiveBaseMode` /
`modifiers` for a technical reader, but they are not the primary copy.

## 5. The five answers every result gives

The default output answers five questions, in order (`src/interaction/result_view.ts:185-207`):

1. **What Palimpsest did.** One plain sentence.
2. **Why it chose that structure.** The advisor's own reasoning, and where UX-A
   added a reason, marked as such.
3. **What useful findings emerged.** The admitted claims, with their content — not
   just their ids.
4. **What remains unresolved.** Branch candidates that did not converge, or a check
   that could not run.
5. **Whether independent verification ran.** With the protocol note in §8.

Those five answers live in a single `summary` string, so a host can show it
verbatim; the structured fields (`findings`, `unresolved`, `verification`) are there
when a host wants to render its own view.

## 6. What you never need to know — and where it lives

You do not need to know any of these:

```text
recipe ids        (focus.v1 / explore.v1 / verify.v1)
plan ids / digests
reasoning cell ids
branch ids
verification run refs
```

When they are relevant to a technical caller, they are returned under `details` —
deliberately out of the primary UX (`src/interaction/result_view.ts:132-146`):

```text
details {
  cellId?
  branchIds[]
  branchExecutions?
  planId? / planDigest?
  recipeIds[]
  runRefs[]
  peers?          (only for a request that needs another project)
  capability?     (only for a CAPABILITY_REQUIRED outcome)
}
```

The rule is enforced as a test, not a convention: the golden-path test asserts the
ids live under `details` (`result.details.cellId`, `branchIds`, `recipeIds`,
`runRefs`), and that the serialised result contains no chain-of-thought,
branch-brief, candidate or event-internal token
(`test/uxa_collaboration.test.ts`, UXA-N16/§18 checks).

## 7. Who classifies a sentence

The core service consumes a **typed** intent. It does not contain a classifier and
it will not invent one from your words. If you want natural-language in, a host maps
it first through the optional adapter seam, `CollaborationIntentAdapter`
(`src/interaction/host_adapter.ts:55-58`):

- `nullCollaborationIntentAdapter` never guesses — it always answers `AUTO`
  (`:61-65`);
- `deterministicKeywordCollaborationIntentAdapter` is **one documented example**, a
  short pattern list, cheap and transparent and replaceable (`:79-119`).

An adapter's output **grants no authority**. It produces a task string and an
intent; the advisor still selects the structure, and the request parser refuses to
let an adapter's extra fields (such as `confidence`) ride in as if they were part of
a request (`test/uxa_collaboration.test.ts`, host-adapter seam checks).

HONEST: the shipped install does **not** wire any intent adapter. The seam is
exported for hosts; a first-party deployment that wants sentence-to-intent in the
tool path must supply its own adapter or pass `intent` explicitly.

## 8. A PASS is a protocol result, not truth

If independent verification ran, the result includes a verification block with the
verifier ref, its independence class, the verdict, the freshness and the run ref —
and a mandatory plain-language note, carried inside the result itself:

> PASS means the named verifier protocol passed for this exact project head; it is a
> protocol result, not truth, and it admits no claim, publishes no proof and grants
> no authority.

Source: `src/interaction/result_view.ts:82-83`. The result is never promoted to
evidence, proof, decision or project truth by this layer (`CollaborationResult !=
Evidence`, `!= ProofClaim`, `!= Decision`).

## 9. Durable default vs one-request intent

There are two different things, and they must not be confused:

```text
durable Work Mode preference   = the project's standing default (operator-set)
CollaborationIntent            = what you asked for in THIS request
```

`AUTO` reads the durable preference as **context** and never writes it back. A
one-request intent may differ from the durable default, and doing so does not change
the default. Verified against the real store: the request reads the preference and
the preference's digest, base mode, modifiers and history are unchanged afterwards
(`test/uxa_collaboration.test.ts`, UXA-N02).

Collaboration also does not change management involvement: `DIRECT` / `ASSIST` /
`MANAGE` / `DELEGATE` and the confirmation boundaries are byte-identical before and
after a collaboration run (UXA-N03).

## 10. The honest capability story

UX-A never fakes a capability it does not have. If a structure needs something the
deployment lacks, you get an explicit status, not a theatre performance:

| Situation | What you get |
| --- | --- |
| `PARALLEL` but no reasoning-branch capability | `CAPABILITY_REQUIRED`, never "multi-agent completed" |
| `CHECK` but no independent verifier | `CAPABILITY_REQUIRED`, never a same-context substitute |
| `PARALLEL_AND_CHECK` with no verifier but real branches | `PARTIAL`: the exploration work is real and returned; the check is not claimed |
| advisor recommends COORDINATE | `CROSS_PROJECT_REQUIRED`: zero peer messages, zero commitments, zero boundary mutations |
| infrastructure failure | `ERROR`, never disguised as a semantic result |

Sources: `src/interaction/collaboration.ts` (the resolvers and
`capabilityRequiredResult`), and the reference status set at
`src/interaction/result_view.ts:118-126`. These are adversarial tests, not
aspirations — UXA-N06, N07, N08, N12, N24.

HONEST: `AUTO` cannot choose `EXPLORE` on a deployment with no advisor. On a plain
install the advisor is absent unless an organization-memory store is supplied
(`src/install.ts:1582-1585`), so `AUTO` is always `FOCUS` there. That is the honest
FOCUS fallback (§7), not a defect — but it does mean "AUTO decides" is only as
useful as the deployment's advisor. Recorded as a carry-forward.

## 11. What this is not

```text
not an AgentGraph UX          you do not manage a graph
not a durable Agent creation  no peer, no persistent point, no agent definition
not a cross-project protocol  COORDINATE is a handoff signal only (UX-B owns it)
not new truth                 a result is a projection, never evidence or a decision
not a new autonomy level      involvement is unchanged
not a store                   UX-A persists nothing of its own
```

The last three are structural: `src/interaction/**` contains no `CREATE TABLE`, no
SQLite reference, no store class, and imports nothing from `src/state`,
`src/federation`, `src/external_assets`, `src/graph` or `src/canvas`. The anti-waste
audit (`docs/engineering/audits/UX-A-INTERACTION-ANTI-WASTE.md`) proves each of
these from the real tree.

---

## Where to go next

- Task-oriented how-to, with the golden scenario and one worked example per intent:
  `docs/product/ONE-REQUEST-COLLABORATION.md`.
- What the product claims, and what it does not: `docs/engineering/audits/UX-A-INTERACTION-PRODUCT-CLAIMS.md`.
- Where the design meets the code, and where it does not:
  `docs/engineering/audits/UX-A-INTERACTION-GAP-ASSESSMENT.md`.
