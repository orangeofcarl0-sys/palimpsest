# Task — multi-site deployment decision package

Prepare the decision package for a two-site energy deployment. The package must be internally
consistent and must not rest on a superseded or unverified source.

## Deliverables

1. `deliverables/technical-capacity.md` — the deciding constraint and the selected unit for each site.
2. `deliverables/vendor-compliance.md` — each vendor's certificate standing, including what is NOT
   current.
3. `deliverables/cost-model.json` — the capital cost of the selected units, with the arithmetic.
4. `deliverables/schedule.md` — installation and commissioning dates derived from the vendor lead
   times.
5. `deliverables/risk-review.md` — the open risks and the source each one rests on.
6. `deliverables/recommendation.md` — the integrated recommendation.

Each document carries a fenced `json` block marked with `<!-- data:start -->` / `<!-- data:end -->`;
`check.mjs` reads THOSE blocks, not prose. Keep them consistent with the prose.

## Rules

- `node check.mjs` must pass before you commit. It re-derives the selection from the sources; a
  package that disagrees with the sources fails it.
- An expected future certificate is not a current certificate. A quote past its validity date may
  not be used.
- A field survey in `updates/` supersedes the drawing figure it names. When one is present, both the
  technical decision and everything downstream of it must use the measured value.
- Do not edit `sources/` or `check.mjs`.
