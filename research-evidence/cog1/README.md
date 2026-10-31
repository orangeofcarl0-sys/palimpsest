# COG-1 evidence — what is here and what it proves

This directory holds the attributable records behind
`docs/engineering/COG1-REAL-TASK-COMPOUNDING.md`.

| path | contents | what it proves |
|---|---|---|
| `cog1-evidence.json` | the stage manifest: identities, runs, scores, synthesis evidence, the defect, the correction, the transfer, the broad-regression status, the claims and the verdicts | the single machine-readable record; every number in the report is traceable to it |
| `runs/a-round-1.json` … `runs/c-round-2.json` | the six per-run records: exit code, timeout flag, wall clock, ready line, deliverable presence/size/digest, and the tool histogram of the only 24 `palimpsest_*`-capable compose in the pilot | that every run completed, every deliverable existed, and no run used a product tool |
| `runs/oracle.json` | the pre-registered oracle output for all conditions | budget arithmetic, quoted-cost compliance, cross-artifact consistency, and the rubric items with the phrase families they matched |
| `runs/telemetry.json` | the model-visible tool histogram per session, extracted with the standalone zstd CLI | which tools were actually called (Node's zstd decoder reads only the first frame of these streams and would have reported every run empty) |
| `runs/reuse.json` | per-round path references in read/bash arguments | whether round 2 consulted the inherited artifacts (all conditions did; the inheritance was file-based) |
| `runs/transfer.json` | the held-out domain probe | that the correction's fence and read both hold in a second non-software domain and a new project id |
| `trials/{a,b,c}/` | the eight final deliverables of each condition | the artifacts themselves, so every synthesis claim in the report can be checked against the text |

`stdoutTail` / `stderrTail` were removed from the run records: they are raw console
tails, not evidence, and the authoritative session artifacts are the model-visible
streams the telemetry was extracted from.

The session streams and the rig itself live outside the repository, in the
test-owned directory `F:/Codex_Work_Space/Palimpsest/.cog1-rig`. They are
reproducible with `scripts/cog1/run_condition.mjs` (deterministic world building)
plus live model access; they are not committed because they are large binary
artifacts and the prompt text they carry is the pre-registered protocol, which is
already committed.

**Limits stated plainly.** One run per condition; a stochastic model with no seed;
a lexical rubric that saturated; and a diagnostic phase that was expert-driven.
The report separates what was machine-checked from what was read.
