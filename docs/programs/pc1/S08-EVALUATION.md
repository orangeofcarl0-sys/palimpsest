# S08 — Two scenarios, matched P/F, and a gated live runner

## 1. Sablewick (scenario A)

`scripts/pc1/prepare_sablewick.mjs` reuses the frozen C6-R staging:

- a real Palimpsest P world with the historical accepted deliverables, Journal negatives/open
  questions, a READY technical-refresh task and the T1 inbox;
- a plain Git + Markdown F world generated from the P facts;
- equivalence: `sourceTreeDigest`, visible-set digest, facts, and `confounders: []`.

The acceptance run copies the T1 inbox, releases T2, and checks:

- Candidate B and the duplicate are absent at T1;
- both appear at T2, with a different visible-set digest;
- the evaluator oracle is not copied.

## 2. Field study (scenario B)

`scripts/pc1/prepare_field_study.mjs` builds:

- a real Palimpsest project with the goal, six binding requirements, four tasks (design,
  evidence-review, delivery-analysis, synthesis), the base sources and the T2 inbox updates;
- an F world with a HANDOFF generated from the same facts, no Palimpsest tools;
- equivalence: source tree, T2 visible set, facts, `confounders: []`.

The T2 update includes an external field validation, an operator-review budget directive (a file is
not authority) and an irrelevant newsletter. The evaluator-only oracle is never copied.

## 3. Live runner

`scripts/pc1/run_pair.mjs` refuses to launch unless all of the following exist:

- an explicit `--spend-authorization`;
- a provider configuration file;
- a DSH profile;
- a supported Linux/WSL2 runtime.

Without them it writes a `BLOCKED` record, executes nothing, and creates no session. With them it
records a launch plan and, only with `--execute`, invokes `dsh --profile`.

**Current status: BLOCKED.** The PC1 execution config has no spend authorization. No model call was
made, so there is no behavioral or comparative result. This is a resource block, not a model failure.

## 4. Analysis

`scripts/pc1/analyze.mjs` decodes a real session stream, dedupes usage, counts assistant/tool events,
reads the offered tool catalogue, and classifies the session. It does not infer quality from call
counts and does not run a rubric by itself.

## 5. Acceptance evidence

`node scripts/pc1/acceptance.mjs` writes `research-evidence/pc1/s08/acceptance.json` with every
check and an explicit `liveModel: BLOCKED` / `modelCalls: 0`.

## 6. Residual limits

- The two scenarios are staged and equivalent, but the matched live pair is not run.
- The field-study F/P runner does not yet have a first-party DSH profile generator for each
  condition; `init` provides a profile for the product path, while the live runner requires an
  explicit profile.
- The Sablewick deterministic acceptance is not a substitute for the frozen C6-R behavioral facts;
  it checks visibility and equivalence only.
