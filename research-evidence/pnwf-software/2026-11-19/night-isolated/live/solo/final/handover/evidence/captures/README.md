# Dispatch capture catalogue

The dispatch desk publishes two separate recorded field cases for the Fleet rehearsal:

| Case | File | sha256 | Recorded source |
| --- | --- | --- | --- |
| P | `P.tsv` | `c76bb857f8877413ffa91cbd9d736a09053c09ba94afb3ed1fe7bd500b8bc68a` | `4f80c3bd5d606e2a2192fd56badb4a138d139ee2` |
| S | `S.tsv` | `77f6d9a53429c6c081d51aef62b5bfd68fd23bfac5df1ff9208997812d5caa5e` | `584d61c4bd5ae71bcb1fa687e9b3ad053da4f509` |

Both files are byte-for-byte copies of `/run/dispatch-records/P.tsv` and
`/run/dispatch-records/S.tsv`. `handover/evidence/terminal.tsv` is the working checkout's active
P capture and has the same bytes as `captures/P.tsv`.

**Do not merge or reconcile the cases.** A matching timestamp or request ID across P and S does not
make either capture a correction of the other. In P, the 22:03:17 row is a paint (`P`), so the live
panel moves backwards. In S, the same-looking row is a suppressed delivery (`S`), so the panel does
not repaint and no live inversion is observed. Both facts stand on their own.

Run one case at a time:

```sh
node handover/replay.mjs --capture P --json
node handover/replay.mjs --capture S --json
```

`--require-anomaly` exits `0` with `diagnosis.reproduced: true` only for a capture that contains an
actual live display inversion. It therefore exits `0` for P and `1` for S in this catalogue.
