# Technical capacity assessment

## Deciding constraints

**North Ridge** — design minimum **−18 °C**. The Kestrel K-900 is rated to −22 °C and delivers
880 kW at the design condition (requirement 850 kW). The Solaris S-1080 is rated only to −16 °C and
is not admissible here. The Halcyon H-1320 meets the temperature but holds only an *expected*
certificate, so it is not compliant.

**Harbor Flats** — service corridor **1,250 mm** per drawing HF-A-114 (2024). The Solaris S-1080
(1,080 mm) and the Kestrel K-900 (900 mm) fit; the Halcyon H-1320 (1,320 mm) does not. With a current
certificate required, the S-1080 is the lower-cost admissible unit at this width.

## Selected units

| site | model | capacity at design condition | requirement |
|---|---|---:|---:|
| North Ridge | Kestrel K-900 | 880 kW | 850 kW |
| Harbor Flats | Solaris S-1080 | 900 kW | 620 kW |

<!-- data:start -->
```json
{
  "sites": [
    { "site": "NR", "model": "K-900", "constraint": "design minimum -18 C", "capacityKw": 880 },
    { "site": "HF", "model": "S-1080", "constraint": "corridor 1250 mm (HF-A-114)", "capacityKw": 900 }
  ]
}
```
<!-- data:end -->
