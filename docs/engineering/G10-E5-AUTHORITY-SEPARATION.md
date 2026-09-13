# G10-E5 — Authority Separation

Collaboration never grants effect authority (§120/§121/§177):

| Action | Authority path |
| --- | --- |
| peer message send / wake | Ordarium Safe Actions (`palimpsest.federation.message.send/.wake`, idempotent) |
| runtime carrier realize / release | Ordarium Safe Actions (G10-D), release via the released Work revision |
| git/worktree/gate effects | existing Ordarium actions |
| commitment / handoff / participation | **no effect authority at all** — semantic records only |

A peer that is contacted, accepts a commitment, participates, or becomes a
handoff holder acquires NO effect authority: `Competence ≠ AuthorityGrant`,
`Knowledge ≠ Authority`, `UserFocus ≠ AuthorityRoot`. The federation service
is not an authority root and coordinates only local semantic steps (§98).
