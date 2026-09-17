# RC-1E — the interrupted first E sample (retained evidence, spec §17)

The first RC-1E live cross-project run (`rc1e-live-cross-project.json`, later renamed
`rc1e-live-cross-project-d.json`) completed **D#1–D#5** and was then **killed by an
interruption of the invoking shell** while E#1 was in flight. The harness process died, so
E#1 was never finalized and **must not be counted** in the RC-1E sample.

It is retained here because it is the first observed instance of the behaviour this stage
exists to produce, and because a discarded trial is still evidence about the instrument.

## What the killed trial showed

Read from the DSH host's own session artifacts (no harness judgement involved):
`C:/Users/66494/.dsh/sessions/--…-cross-E_remote_local_collaboration-16048-1789667571130-1-remote--/`

**Remote principal session `session-bb97101c-1bae-4f56-a5a9-b696cad63219`:**

1. `palimpsest_cross_project {action:"pending"}` — and the result carried the full task.
2. Its visible reasoning (assistant message, verbatim):
   > "The detector project is asking this project (optics): “降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请给出多个相互独立的思路，并分别说明各自成立的条件。” — **it explicitly asks for several mutually independent approaches, so I'll have this project's own local collaboration compose the answer in parallel mode.**"
3. `palimpsest_cross_project {action:"respond", answer:{compose:{intent:"PARALLEL"}}, requestId:"cpq-669923515fbccf80bc5068d03847acb0"}`

**A real branch subprocess session was spawned before the kill:**
`branch-6987b92d-bab2-431a-bf78-2bf366634089` (15 records) under the same remote cwd key.

## Why it is not counted

RC-1E §19 requires, for a passing E trial, a terminal response AND the origin surfacing it.
The kill happened mid-exploration, before either. The five E trials that DO count are in
`rc1e-live-cross-project-e.json`, and they all used the same route and reached completion.

## Why it matters

It is direct evidence that the product-surface change caused the intended behaviour rather
than a post-hoc re-scoring: with the RC-1R product text the remote authored a direct answer
in 5/5 trials; with the RC-1E text and tool description it chose `respond(answer.compose,
intent PARALLEL)` on its own, and the composed run spawned real packaged branches.

Incidental note: that run also left 13 `%TEMP%/palimpsest-rc1r-cross-*` state directories
behind (the kill prevented the harness's own cleanup). They are covered by the PR #116
temp-hygiene sweep, which reports and removes `palimpsest-*` directories in `%TEMP%`.
