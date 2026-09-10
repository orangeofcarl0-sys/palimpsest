# PAL-FED-0 experiments (EXPERIMENTAL)

This directory holds the PAL-FED-0 experimental federation records. They are
**not** product documentation and **not** frozen UAS specification. Existing
production specs (`00`–`36`) are untouched; nothing here renumbers them.

| Record | Purpose |
|---|---|
| `PAL-FED-0-ASSESSMENT.md` | Pre-implementation audit (§67): topology, seams, identity, isolation, failure modes to prohibit |
| `PAL-FED-0-SPEC.md` | The implemented experimental protocol: namespaces, durable shapes, tool surface, invariants |
| `PAL-FED-0-OPERATING-GUIDE.md` | Main-Agent behavior during dogfood (§40–§45) |
| `PAL-FED-0-DELIVERY.md` | Delivery report + the twenty dogfood questions (§60) |
| `evidence/PAL-FED-0-EVIDENCE.md` | Machine acceptance results and the dogfood evidence template |
| `evidence/dogfood.config.json` | Dogfood harness configuration (paths, peers, fabric) |

Status: **EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN**. Do not merge
PAL-FED-0 semantics into `main` as canonical UAS semantics.
