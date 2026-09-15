# G10-V — T/U Reposition Disposition

Classification: `KEEP_PROJECT_CAPABILITY` · `KEEP_REFERENCE_VERTICAL` · `NEST_IN_PROJECT_WORKSPACE` ·
`DEFER_EXTERNALIZATION` · `OBSOLETE`. No deletion theater: nothing is removed.

| T/U artifact | Disposition | Action |
| --- | --- | --- |
| `ProofEvidenceStore` (sources/evidence/claims/assessments) | **KEEP_PROJECT_CAPABILITY** | Retained as the authoritative proof plane; a project associates claims explicitly. |
| `ProofAssetView` / `why` chain | **KEEP_PROJECT_CAPABILITY** | Retained; surfaced inside the Project Workspace's Assets section and rendered by the Vault view. |
| ReasoningCell → Proof publication bridge | **KEEP_PROJECT_CAPABILITY** | Retained; its produced claim can be associated with the project. |
| CampaignEvidencePort adapter | **KEEP_PROJECT_CAPABILITY** | Unchanged. |
| Evidence-grounded Explore extraction + allowlist | **KEEP_PROJECT_CAPABILITY** | Unchanged; used by Delegate local cognition under policy. |
| Selector materialization + selective disclosure export | **KEEP_REFERENCE_VERTICAL** | Retained as the byte-minimal disclosure capability; it is a reference vertical, not the product identity. |
| Proof Vault web surface | **NEST_IN_PROJECT_WORKSPACE** | Remains reachable, but the default entry becomes the Project Workspace and Proof Vault appears as `Assets → Proof / Evidence` (a secondary view). |
| Experimental/organization-memory tooling and recipes/advisor | **KEEP_PROJECT_CAPABILITY** | Unchanged; referenced as project assets/experiments. |
| Personal cross-project asset database | **DEFER_EXTERNALIZATION** | Frozen as an external future system (`PERSONAL-ASSET-SYSTEM-BOUNDARY.md`); only an `ExternalAssetLibraryPort` seam is described, never implemented. |
| Anything treated as Palimpsest product identity | **OBSOLETE (narrative only)** | README/product wording re-centers on the durable project; no code is deleted. |

```text
Result: ~all KEEP / NEST. No counter is rolled back; Proof/Evidence remains a project evidence capability
plus an optional reference vertical.
```
