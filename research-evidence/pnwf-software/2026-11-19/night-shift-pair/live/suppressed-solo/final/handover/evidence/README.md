# Archived evidence requested at the shift boundary

These files are exact transcriptions of the read-only archive topics returned by the release desk
for checkpoint `772735dfba6875df105234e1945d7da178fe6ef6` (`Record initial overnight Fleet
assessment`). They are kept beside the replay so the next shift can run the same reconstruction
without depending on this session.

| Topic | Archive file |
| --- | --- |
| inventory (alias crosswalk) | `inventory.csv` |
| ingress (gateway trace) | `ingress.csv` |
| terminal (operator-console trace) | `terminal.tsv` |
| field (calibration and ticket amendment) | `field.txt` |
| reservation (fallback booking) | `reservation.txt` |

`operations/registry.csv` in the repository is the current/older alias crosswalk. The older
`relay-9 = Cedar` row is a prior-cabinet alias and does not override the inventory's current
`relay-9 = Birch` assignment. `B-12` is likewise a Birch training alias, not a Cedar identifier.

The terminal archive is sampled by panel. It contains no capture for live Birch panel `p23`; that
absence is an instrumentation gap, not evidence that `p23` was healthy.
