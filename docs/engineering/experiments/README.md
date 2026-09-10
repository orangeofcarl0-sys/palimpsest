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
| `evidence/dogfood.config.json` | PAL-FED-0 dogfood harness configuration (paths, peers, fabric) |
| `PAL-FED-0D-ASSESSMENT.md` | DSH runtime audit (0.1.5-rc.1), real API surface, integration path |
| `PAL-FED-0D-SPEC.md` | DSH-native runtime binding: plugin, agent-scoped tools, provenance, wake |
| `PAL-FED-0D-DELIVERY.md` | Delivery report + §45 conclusions + real two-Main dogfood evidence |
| `evidence/pal-fed-0d-dogfood-summary.json` | Coordination events from the real dogfood run |
| `evidence/pal-fed-0d-dogfood-evidence.json` | Attempt 2 per-peer session/wake/tool-call evidence |
| `evidence/pal-fed-0d-dogfood3-summary.json` | Attempt 3 (open prompt, criterion) coordination events |
| `evidence/pal-fed-0d-dogfood3-evidence.json` | Attempt 3 per-peer autonomy/wake/tool-step evidence |

Status: **EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN**. Do not merge
PAL-FED-0 semantics into `main` as canonical UAS semantics.
