# LHAPE real-host deterministic evidence — 2026-11-03

**Mode: `MOCK_MODEL_REAL_DSH_HOST`.** The Windows DSH host, the Palimpsest product, the SQLite
state, the worker subprocesses, the PTC programs, the filesystem writes, the Git commits, the
Promotions and the host kill are REAL. The model content is a deterministic Messages stand-in
(`scripts/lhape/mock_llm.mjs`); it produces NO model-cognition, quality, cost or comparative evidence.
No provider was called and no paid tokens were spent.

## Environment

| Item | Value |
|---|---|
| OS | Windows 11 (win32 10.0.26200 x64) |
| Node | v24.14.1 |
| Product code commit | `e59a9112c11ea45e4300e20e30ca7e2136d7cf24` |
| DSH host package | `0.2.1-rc.3` (machine-global install) |
| Qualified Win32 seam | `@deepseek-ai/dsh-win32-process@0.2.1-rc.5`, installed in a run-owned seam root |
| Run roots | `C:\Users\66494\lhape\{main,interrupt}` (outside the repository) |

The host package and the seam are deliberately reported separately: the seam resolves rc.5 from the
run-owned root (`PALIMPSEST_DSH_ROOT`) and the worker pre-create receipt reports
`resolvedVersion=0.2.1-rc.5, drifted=false`; the DSH host itself came from the machine's rc.3 install.

## Main run

- Run id: `lhape-main-2026-11-03`
- Final ProjectIR revision: **4**
- Final head: `0ff650ab5a0c42bbb23686dfa8ad4e3957708dbe`
- Tasks: `capacity: STALE`, `capacity-v2: SATISFIED`, `cost: STALE`, `cost-v2: SATISFIED`,
  `integration: SATISFIED`
- Accepted artifacts:
  - `deliverables/capacity-v2.md` — sha256 `630882f345c5c83aa47e7e3851f0f9379879a8daa29066142fe1120cf8809909`
  - `deliverables/cost-v2.md` — sha256 `9017c20a8152e626c36b6cdbdc95f27a28558014f93be918305cbfb576ca472b`
  - `deliverables/integration.md` — sha256 `7423761cab06e171093aada30d29ee4aa8f4c0f9108ff9efb6b65071fa40c696`

### Timeline (UTC; from `main/mock.jsonl`, `main/final-pulse.json`, `main/seed.json`)

| Time | Fact | Reference |
|---|---|---|
| 16:46:17 | Principal host S1A starts the baseline capacity task | session S1A |
| 16:46:26 | Baseline capacity worker starts (real PTC worker) | worker session `worker-057c…` |
| 16:46:39 | Principal host S1B starts the baseline cost task | session S1B |
| 16:46:49 | Baseline cost worker starts and will park after its commit | worker session `worker-f98e…` |
| 16:46:52 | The measured constraint arrives as an external input | `main/constraint-arrived-at.txt` |
| 16:47:03 | Native subagent reads the input and `sources/sites.md`; principal records the contribution and applies the real plan revision 0→1 | `LHAPE_CHILD_CONSTRAINT`; `ctb-b7926e…` |
| 16:47:13 | Revised capacity worker starts on the new plan | worker session `worker-5d57…` |
| 16:47:15 | Operator releases the parked baseline workers | `main/baseline-released-at.txt` |
| 16:47:16 | Both baseline workers report; their results settle as COMPLETED on now-STALE tasks | attempts `attempt-c3f5…`, `attempt-7438…` |
| 16:47:24 | Revised cost worker completes | worker session `worker-…` |
| 16:47:40 | New principal host S2 starts; the late cost-v2 result is inspected and a governed rework is started | session S2 |
| 16:47:51 | Rework worker runs on the current basis | `Continuation context` worker |
| 16:48:40 | New principal host S3 starts the integration task after a legal scheduler unblock | session S3 |
| 16:48:49 | Integration worker runs | worker session |
| 16:49:27 | S3 ends; final pulse reads revision 4 | `main/final-pulse.json` |

### What the run demonstrates

- **Real overlapping workers.** Three worker-session intervals overlap (baseline capacity, baseline
  cost, revised capacity); each worker ran in its own execution world under a real Windows read
  fence. The `workerOverlapPairs` field in `main/run-summary.json` names the exact session pairs.
- **Two-host concurrency is deliberate.** The Windows read-fence backend admits at most ONE active
  confidential worker per HOST. The project declares concurrency 2, so the scenario used two hosts
  with distinct `PALIMPSEST_HOST_CAPACITY_ROOT` values. This is a measured host constraint, not a
  product-wide concurrency limit.
- **Contribution → decision → real plan change.** `ctb-b7926e…` is `PLAN_CHANGED`; revision 0→1
  removed `capacity`/`cost` and added `capacity-v2`/`cost-v2`/`integration`; the `changedIds` and
  `changeClass=behavior_change` were carried through the one canonical `controller.plan` path.
- **Live-worker adjustment.** Both baseline workers were still alive when the plan was revised. They
  were committed and parked before reporting; after release they reported, and their late results
  settled as COMPLETED historical results on retired tasks. Promotion refuses them (`task_retired`);
  the continuation inspection reports `INCOMPATIBLE`/`STALE`.
- **Late result handling.** The baseline capacity result commit `04343d7a…` and the baseline cost
  result commit `4442b232…` exist and are inspectable. They were not accepted. The final pulse queues
  `STALE_RESULT` for both tasks.
- **Rework.** `cost-v2` produced two COMPLETED attempts: `75cf5c73…` (original, old basis) and
  `51a6e3d6…` (rework on the current basis). Only the second was promoted.
- **Cross-session continuation.** S2 and S3 are new host processes with no inherited principal
  transcript; they recover from the durable pulse/state. S3 uses the legal `next` transition to
  unblock integration before delegating it.
- **Final acceptance.** Three explicit operator promotions, each on the canonical path:
  `capacity-v2` → `60c25062…`, `cost-v2` → `c852acd0…`, `integration` → `0ff650ab…`. The operator
  never supplied a source commit or expected head; the product derived them.

## Interrupt / recovery run

- Run id: `lhape-interrupt-2026-11-03`
- Final revision: **1**; head `5042ccb167248a7f8087b04817da23d6712e8c14`
- Task `interrupted-write`: **SATISFIED**
- Artifact `deliverables/interrupted.md`: sha256 `7a4c7f3326cf71378e7d2688f5792757a3758f6ae0f0848f70386aa295ccb627`

Timeline:

1. At 16:49:57 the IR1 host starts the task; the real worker writes and commits
   `deliverables/interrupted.md`, then parks **without reporting**.
2. At 16:50:09 the harness resolves the REAL Windows Node host PID and kills its whole process tree;
   `kill-result.txt` records the PID and a follow-up Windows process query reports zero remaining
   `node.exe` processes whose command line names IR1. There is no IR1 request after the kill.
3. The new IR2 host at 16:50:24 reads the pulse and `workers`: the canonical attempt is `RUNNING`,
   `hostObserved=false` — it is NOT claimed to be alive.
4. `palimpsest_work action=complete taskId=interrupted-write` observes the committed world and settles
   the attempt (`SETTLED`, commit `fe4c0d56…`), explicitly stating that it does not claim the previous
   worker process is alive. The operator promotes the result; the task becomes SATISFIED.

## Reproduce

On a Windows machine with the same machine-global DSH install and a run-owned rc.5 seam:

```bash
bash scripts/lhape/run_host_win.sh main
bash scripts/lhape/run_host_win.sh interrupt
```

The scripts stage nothing into the repository; they write under `%USERPROFILE%\lhape`. The mock
server is deterministic and local. See `scripts/lhape/README.md` for the exact environment variables.

## Known limits (carried, not hidden)

- The model is a deterministic stand-in. Nothing here is a language-model result.
- The Windows DSH host is rc.3; the seam is rc.5. The worker pre-create receipt proves the seam
  resolution; it is not a claim that the whole host is rc.5.
- One active confidential worker per Windows host. Concurrency 2 was demonstrated with two hosts.
- The worker read guard correctly refused a `.palimpsest` durable-state read from inside an execution
  world. The revised task objective carries the measured constraint; the worker does not read host
  durable state.
- The late baseline results are `INCOMPATIBLE`; they were rejected and reworked, not reused. No
  reuse-value claim is made.
- The LHAPE-C paid F/L/G cohort is BLOCKED; see `../live/lhape-c-long-horizon-2026-11-03/BLOCKED.json`.
