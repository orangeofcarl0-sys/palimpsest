# R2-M — BLOCKED: THE INDEX NEVER REACHES THE WORKER PROMPT

Stage: R2-M (Decision-Relevant Capital Index)
Status: **R2-M IMPLEMENTATION BLOCKED** — GATE A is RED on a real defect, and §4 requires a STOP
Baseline HEAD: `adf16152bd9c1183db18b89bd80e4b1ceb94dab0` (CIC v0.1 freeze)
Branch: `r2-m-decision-relevant-index`
GATE A result: **RED — 29/30** (the single failure is the treatment-validity check, not a harness artifact)
GATE B: **NOT RUN** (correctly, per §32 "If any fail: STOP")

---

# 1. The finding

**The inherited-capital index has never appeared in any worker's prompt, in any stage of this research
line.** The host plugin that composes the worker environment does not forward the index text to the
runner, so the runner's `environment.contextIndexText` is `undefined` and the index section is silently
omitted from every worker prompt.

This is a defect in the shipped host, not in R2-M's seam. It invalidates the treatment premise of R2-M,
because R2-M's treatment is *a change to the bytes of that index*.

---

# 2. The proof

## 2.1 Mechanical, from the R2-M pilot

The GATE A pilot ran one M1 trial per scenario. The runner derived all three entries correctly:

```text
C-M1-b500r0  derivedCount=3  allDerived=true  derivationPullOffset=3  workerPulledCount=0
D-M1-b510r0  derivedCount=3  allDerived=true  derivationPullOffset=3  workerPulledCount=0
```

But the rendered section the runner claims to have composed hashes to the digest of the string
`"undefined"`:

```text
sha256("undefined")                        = eb045d78d273107348b0300c01d29b7552d622abbc6faf81b3ec55359aa9950c
pilot C-M1-b500r0 renderedSectionDigest     = eb045d78d273107348b0300c01d29b7552d622abbc6faf81b3ec55359aa9950c
```

So `environment.contextIndexText` — the value `workTask(context, indexText)` is given — was `undefined`.
`renderIndexMetadata(undefined, entries)` returned the input unchanged (the identity case), and
`workTask` then skipped the index because its guard is `typeof indexText === 'string'`.

The harness's own `indexPresentationDigest === productionIndexDigest` check was therefore *satisfied by
accident*: the M1 arm's "received" section fell back to the production text, so the two arms presented
identical bytes. GATE A reported it:

```text
FAIL  MA-28  §19: the pilot pairs are not confounded — CONFOUNDED:
      the index presentation is identical across conditions — the treatment was not applied
```

## 2.2 Confirmed against the real DSH session artifact

The decompressed session for a capital-present R2-U trial (`C-K1A0-b2r2`) contains the index entry lines
exactly **twice**, and both are inside a *dump of the payload JSON*:

```text
... 466:   },
     467:   "contextIndexText": "\nProject context available to this attempt (READ-ONLY; never authority):\n
            [proof] @ctx/proof/pc-37ce8a1cd24f7c601ea98b0dc22cf2b5\n ...
```

Neither occurrence is in the task text. The task text in that same session reads, verbatim and without
any index between the task and the instructions:

```text
... Independent verification required: no\n\nHow to work:\n  - your working directory IS your world ...
```

And in the R2-M pilot's own M1 session, none of the M1 treatment strings are present anywhere:

```text
"Selected for this attempt" -> false
"Standing at compile:"      -> false
"Applicability:"            -> false
"Preview:"                  -> false
```

## 2.3 How prior stages nevertheless pulled

The one R2-U trial that pulled three handles did not read them from its prompt. It ran a shell command to
list the rig directory, found `out/payload.json`, and read it:

```text
pwsh: Get-ChildItem ... | Where-Object { $_.FullName -notmatch 'worlds\\attempt' } | Select ... 200
  -> ...\out\payload.json
read: { "file_path": "C:\Users\...\C-K1A0-b2r2\out\payload.json" }
  -> 1: { 2: "context": { 3: "work": { ...
```

So the handle identities reached that worker through the **harness's own payload dump**, read from
outside its execution world — not through the model-visible index. That pull is therefore not evidence
that the index is visible; if anything it is evidence that it was not.

## 2.4 Why the existing gates did not catch it

The R1-L live gate's index assertion is vacuous:

```js
required.push([`${condition}: pull tool present`, of(`${condition} index in prompt text`) !== "" || true]);
```

The `|| true` makes the assertion unconditionally pass. R1-L's own captured evidence recorded the fact
and it went unread:

```text
research-evidence/r1-l/rendered-prompt-C0.json  handlesRenderedIntoPrompt = false
research-evidence/r1-l/rendered-prompt-C1.json  handlesRenderedIntoPrompt = false
research-evidence/r1-l/rendered-prompt-C2.json  handlesRenderedIntoPrompt = false
```

R1-L's document even records `index handle lines in the prompt | 0 | 2 | 3`, but its captured
`promptText` contains no index — the counts were computed from the payload, not from the prompt.

---

# 3. The defect

`host/dsh/lib/index.js` composes the worker environment and provides it to the runner. The payload it
receives (`worker-context.json`, written by `workWorkerEnvironmentPayload`) *does* carry
`contextIndexText`, but the object it provides does not include it:

```js
ctx.provide('palimpsestHost', {
  palimpsest,
  work: {
    context: raw.context,
    recorder,
    tool: toRealTool(tool),
    ...(pullTool === undefined ? {} : { contextPullTool: toRealTool(pullTool) }),
    pulledHandles,
    deniedAuthorityPrefix: ...,
    principalTools: [],
    // contextIndexText is NOT forwarded
  },
  toolNames,
});
```

The runner then reads `environment.contextIndexText` (`host/dsh/lib/runner.js`), which is `undefined`.

Verified absent at every commit in the line: `dc5679d`, `8ef010a`, `c023a63`, `8edf9f1`, `adf1615` — the
string `contextIndexText` does not occur in `host/dsh/lib/index.js` at any of them.

---

# 4. Scope

```text
R2-M              BLOCKED — its treatment changes the bytes of an index the worker never sees
R2-U              AFFECTED — the affordance clause WAS delivered (it is appended to the prompt text
                  directly), but the index it told the worker to review was absent. The measured
                  NOT_IMPROVED verdict stands as measured; its interpretation is now narrower: the
                  workers were instructed to review a section that was not present.
R2-E              AFFECTED but SOUND — the host-mediated prework delivers bodies into an appended
                  section, which does not depend on the index. Its REPLICATED result stands.
R1-L              AFFECTED — "the last mile" is not closed: the pull tool reaches the worker, the
                  handle list does not.
R1-R / R1-S / R1-H*  UNAFFECTED — no dependency on index visibility.
```

---

# 5. What was NOT done, and why

Per §4 ("If R2-M cannot be implemented without changing canonical Context compilation or product
semantics: STOP ... and report why. Do not silently widen the seam."):

- GATE B (the 20-run matrix) was **not run**. Running it would produce 20 trials of a treatment that
  cannot be applied, at the cost of ~6 hours of confidential worker time.
- The defect was **not** fixed. The fix is a one-line addition to the shipped host plugin
  (`contextIndexText: raw.contextIndexText`), but that file is **production host source**, and §4's
  boundary names the experimental seam only. Changing it is a production change with a real blast
  radius — it would alter every worker's prompt in every deployment — and it is exactly the kind of
  "silently widening the seam" the ruling forbids. It needs an explicit ruling, not a judgment call
  inside a blocked experiment.
- No product semantics were touched. `src/` diff is zero.

---

# 6. What a ruling should decide

1. **Confirm the defect** independently (the digest equality in §2.1 is the cheapest check).
2. **Decide the fix locus.** The minimal fix is forwarding `contextIndexText` in `host/dsh/lib/index.js`.
   Because this is production host source, it needs either (a) an explicit production fix with a
   default-path byte-identity argument, or (b) an experimental forwarding path in the harness that does
   not change the shipped plugin.
3. **Repair the vacuous gate assertion** in `scripts/gates/r1l-live-gate.mjs` (remove `|| true`) so this
   cannot regress silently again.
4. **Decide the R1-L / R2-U interpretation.** Both stages measured real worker behaviour under an
   absent index. Their numbers are unaffected; what they *mean* is narrower than their documents claim.
5. **Only then** restart R2-M, from a fresh baseline, with GATE A re-run from scratch. Per §32 a pilot
   does not count if the harness changes afterwards, so the four pilots recorded here must be discarded.

---

# 7. Evidence committed

```text
research-evidence/r2-m/gate-a.json     GATE A results, including the MA-28 failure
~/.palimpsest-r2m/pilot/               the four pilot records (external, per §31)
research-evidence/r2-m/BLOCKED.md      this report
```

The pilot records are external because §31 permits it and they are large; their per-trial digests are
recorded in the manifest when the evidence writer runs. They are **not** primary trials and must not be
counted as any.
