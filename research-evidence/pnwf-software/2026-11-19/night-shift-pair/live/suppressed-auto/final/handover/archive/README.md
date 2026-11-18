# Requested archive snapshots

These are the read-only release-desk records requested by the overnight shift after checkpoint
`c566a2318f7db32dc98d11368a9417b9df099323`. They are preserved verbatim so `handover/replay.mjs` can
be run without a live desk connection.

| File | Desk topic | Received as |
| --- | --- | --- |
| `inventory.csv` | inventory (alias crosswalk) | CSV, as-of 22:00Z |
| `ingress.csv` | ingress (gateway trace) | CSV |
| `terminal.tsv` | terminal (operator-console trace) | TSV plus the trace note |
| `field.txt` | field (calibration and ticket amendment) | Desk B addendum, 22:25Z |
| `reservation.txt` | reservation (fallback booking) | Ticket CAP-08, signed 22:19Z |

The next shift can request the same topics from the release desk and compare them with these
snapshots. Reading an archive item does not accept it as evidence for a production switch; the
release owner still owns that decision.
