# Archived evidence used by the replay

These files are transcriptions of the read-only archive topics listed in `operations/desk.md`. They
are kept beside the replay so the next shift can reconstruct the overnight evidence without depending
on this session.

| Topic | File |
| --- | --- |
| inventory (alias crosswalk) | `inventory.csv` |
| ingress (gateway trace) | `ingress.csv` |
| terminal (operator-console trace) | `terminal.tsv` |
| field (calibration and ticket amendment) | `field-archive.txt` |
| field notebook report (shift mail) | `field-note.txt` |
| reservation (fallback booking) | `reservation.txt` |

`operations/registry.csv` is the repository's current/older alias crosswalk. The older
`relay-9 = Cedar` row is explicitly a prior-cabinet alias and does not override the current inventory
assignment of `relay-9` to Birch. `B-12` is an older Birch training label; current Birch covers
`B-12 plus B-13`.

The terminal archive is sampled by panel, not by request. It contains no capture for live Birch panel
`p23`; that absence is an instrumentation gap, not evidence that `p23` was healthy.

`P` is a paint committed to the panel. `S` is a transport delivery the panel suppressed. The two are
not interchangeable: an `S` row did not change the displayed value. The 22:03:17 p17 row is `S`; the
candidate replay's earlier `P` transcription was corrected against the archived shift record before
the diagnosis was rewritten.
