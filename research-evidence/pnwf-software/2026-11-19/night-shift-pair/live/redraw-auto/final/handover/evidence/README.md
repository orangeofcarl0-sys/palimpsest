# Release-desk archive captures

These files are read-only captures obtained from the release desk after checkpointing commit
`a48ad05c00f0f36a97df2750d606d64ed7ee0deb` (the preliminary written assessment). They are rehearsal
records; all contacts and records are simulated.

| File | Desk topic | Content |
| --- | --- | --- |
| `inventory.csv` | inventory | alias / connection / panel crosswalk as of 22:00Z |
| `ingress.csv` | ingress | gateway requests by connection tag and feed |
| `terminal.tsv` | terminal | operator-console paint/suppression trace by panel |
| `field.md` | field | calibration and ticket amendment for B-12 / B-13 |
| `reservation.md` | reservation | fallback booking CAP-08 |

The captures are evidence of what the desks recorded. They are not production approval and do not
authorise a traffic change. The replay reads these files directly.
