# COG-3 evidence

**Stage:** project-native synthesis and operational composition.
**Branch:** `palimpsest-cog3-native-synthesis`.
**Code Freeze:** `bf21110497e8a15211899f0334795185ebeffff3` (tree `b9143917811108563b7a84ee55d8f4e54e8660d0`).
**Model / runtime:** `deepseek-official/deepseek-flash` / DSH `0.2.1-rc.3`.

## Run labels

| label | what it is | sessions | tokens | status |
| --- | --- | --- | --- | --- |
| `P1` | shipped Palimpsest host, journal, one delegation, update, cold resume | 3 | 16,221,721 | complete |
| `S1` | strong single-agent file baseline | 1 | 1,828,481 | complete |
| `F1` | native DSH subagent baseline | 2 | 8,544,715 | **truncated at the campaign token cap** |
| `MECH1` | mechanism probe before the branch-read correction | 2 | 164,551 | diagnostic |
| `MECH2` | read-enabled branch; settlement refused the citation shape | 2 | 196,276 | diagnostic |
| `MECH3` | post-correction: grounded, admitted, delivered, consumed | 2 | 175,636 | diagnostic |

Total: **12 model sessions, 27,131,380 reported tokens** against a pre-registered cap of 25,000,000
(overrun 2,131,380). The F run was stopped mid-turn when the cap was detected; P-minus was not run.
The overrun and the truncation are reported in `docs/engineering/COG3-SYNTHESIS-RESULTS.md` and the
final report.

## Files

- `manifest.json` — every copied artifact with its SHA-256 and size.
- `scores.json` — manual rubric verdicts, quotes, the influence chain and the limitations.
- `capability-matrix.json` — the machine-readable implemented/composed/reachable/executed matrix.
- `verification.json` — build, architecture, API, targeted and broad results; the broad failure and
  the isolated diagnostic that proves its environmental cause.
- `verification/` — raw logs and the Vitest JSON.
- `runs/<label>/` — run records, plan snapshots, principal/baseline logs, seed records.
- `sessions/<label>/` — the raw DSH session streams (multi-frame zstd, copied byte-for-byte).

The `.cog3-rig/` working tree, databases and Git worlds stayed outside the repository. The real
runtime home was read only for the owner's credential and was not written. No credential appears
anywhere in this directory.
