# Risk and evidence review

| id | risk | source |
|---|---|---|
| R1 | The Harbor Flats clear corridor measured 1,050 mm on 2026-11-04, below the 1,250 mm drawing. Units wider than 1,050 mm are not admissible, and the drawing must not be used again for this decision. | `updates/2026-11-04/corridor-survey.md` |
| R2 | Halcyon holds only an *expected* 2026 certificate, which is not a current certificate; it cannot be selected, and its expired quote cannot be costed. | `sources/vendors.md`, `sources/quotes.csv` |
| R3 | The corridor change moved Harbor Flats from the Solaris S-1080 to the Kestrel K-900: the capital cost rises by 51,000 USD and commissioning moves from 2027-01-26 to 2027-03-02. | `deliverables/cost-model.json`, `deliverables/schedule.md` |
| R4 | The Solaris certificate expires 2027-01-31. It is not on the critical path after the corridor change, but it would have been under the earlier selection. | `sources/vendors.md` |

The measurement is the reason the package changed: it is a property of the site, not a vendor claim,
and it is verifiable by re-measuring the corridor. The certificate standing is a documentary fact and
is the one item the package cannot verify itself.

<!-- data:start -->
```json
{
  "risks": [
    { "id": "R1", "statement": "Harbor Flats clear corridor measured 1,050 mm on 2026-11-04, superseding the 1,250 mm drawing; wider units are inadmissible.", "source": "updates/2026-11-04/corridor-survey.md" },
    { "id": "R2", "statement": "Halcyon holds only an expected 2026 certificate and its quote has expired; it may not be selected or costed.", "source": "sources/vendors.md" },
    { "id": "R3", "statement": "The corridor change moved Harbor Flats to the Kestrel K-900, raising capital cost by 51,000 USD and moving commissioning to 2027-03-02.", "source": "updates/2026-11-04/corridor-survey.md" },
    { "id": "R4", "statement": "The Solaris certificate expires 2027-01-31; it is off the critical path after the corridor change.", "source": "sources/vendors.md" }
  ]
}
```
<!-- data:end -->
