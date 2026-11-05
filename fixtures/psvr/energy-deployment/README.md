# North Ridge / Harbor Flats deployment — working repository

Two sites, three candidate vendors, one decision package. The sources in `sources/` are the accepted
inputs; `deliverables/` is where the decision package is written.

- `sources/sites.md` — site requirements and constraints.
- `sources/vendors.md` — vendor specifications and certificate standing.
- `sources/capacity.csv` — measured capacity per model at each site's design condition.
- `sources/quotes.csv` — unit price, freight and quote validity.
- `check.mjs` — the independent consistency check. It reads the sources, derives what the selection
  must be, and verifies every deliverable against that derivation. Run it with `node check.mjs`.

`updates/` is where a later field measurement arrives. When a survey is present it SUPERSEDES the
drawing figure it names; a package that still uses the superseded figure fails the check.
