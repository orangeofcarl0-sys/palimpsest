# Technical capacity assessment

## Deciding constraints

**North Ridge** — design minimum **−18 °C**. The Kestrel K-900 is rated to −22 °C and delivers
880 kW at the design condition (requirement 850 kW). The Solaris S-1080 is rated only to −16 °C and
is not admissible here. The Halcyon H-1320 meets the temperature but holds only an *expected*
certificate, so it is not compliant.

**Harbor Flats** — service corridor **1,050 mm**, measured by the 2026-11-04 field survey
(`updates/2026-11-04/corridor-survey.md`). The survey supersedes drawing HF-A-114 (2024), which
showed 1,250 mm before the cable tray was installed. At 1,050 mm the Solaris S-1080 (1,080 mm) no
longer fits; the Kestrel K-900 (900 mm) does, and its certificate is current. The Halcyon H-1320
(1,320 mm) does not fit and is not compliant in any case.

The earlier draft selected the S-1080 for Harbor Flats on the drawing width. That selection is
superseded: only the North Ridge section of the earlier assessment stands unchanged.

## Selected units

| site | model | capacity at design condition | requirement |
|---|---|---:|---:|
| North Ridge | Kestrel K-900 | 880 kW | 850 kW |
| Harbor Flats | Kestrel K-900 | 860 kW | 620 kW |

<!-- data:start -->
```json
{
  "sites": [
    { "site": "NR", "model": "K-900", "constraint": "design minimum -18 C", "capacityKw": 880 },
    { "site": "HF", "model": "K-900", "constraint": "corridor 1050 mm (2026-11-04 survey supersedes HF-A-114)", "capacityKw": 860 }
  ]
}
```
<!-- data:end -->
