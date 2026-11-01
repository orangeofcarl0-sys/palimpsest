# COG-3 — Real Agent Handoff

**Question:** does an independent model execution's result return through the normal Palimpsest
product path, and is it consumed?

**Verdict:** **G1 ESTABLISHED after one bounded correction.** Before the correction the delivery
chain ran but the branch never inspected its frozen basis, so the delivered "finding" was
uninformative. After the correction the branch read seven sources, settled as ADMITTED, delivered a
source-grounded conclusion, and the principal used it.

All runs used the shipped `palimpsest-dsh-host`, a long-lived principal
(`dsh --profile cog3-programme`, no `--once`), `reasoning: {}`, `attention.activation: "dsh"`, a real
repository and the real `deepseek-official/deepseek-flash` model. No callback, script or fixture
produced a branch result.

---

## 1. The chain, as observed

| link | evidence | where |
| --- | --- | --- |
| source | the frozen snapshot is a detached worktree at the delegation basis | `git worktree add --detach` line in the principal log; `basisCommit` in the delegation ref |
| research execution | a real `node dsh --profile cog3-programme --branch <brief>` child started by the host-derived port | `PALIMPSEST_BRANCH_RESULT` in the branch stream; branch session file |
| finding | the branch's one structured statement | `palimpsest_branch_result` call in the branch session |
| settlement | the branch closed with an admitted conclusion | `palimpsest_delegate action=status` returned `COMPLETED` |
| delivery | a terminal text reachs the principal session as a follow-up turn | `PALIMPSEST_DELEGATION {"delivered":true}` |
| consumption | the principal's next turn quotes the finding and changes an artifact | the delivery turn and the plan's assumptions table |
| decision | the plan's schedule, booking and calibration change | P1 plan, round one and round two |

---

## 2. Probe 1 — the chain works, the finding does not (pre-correction)

The mechanism prompt explicitly asked for `palimpsest_delegate` with the Northgate question. The
principal called it, received `STARTED`/`RUNNING` against basis `ba4c73cb`, wrote its probe file and
continued. The branch session contains **exactly one tool call**:

```json
{"name":"palimpsest_branch_result","arguments":{"statement":"Undetermined on the supplied basis: the frontier contains zero accepted claims and no Northgate site specifications ..."}}
```

The branch used 4,161 tokens. It never opened `sources/sites.md` or `sources/vendors.md`, although
they were tracked at its own basis. Why: `branchTask` told it "You have exactly ONE tool,
`palimpsest_branch_result`" and "Think briefly about the frozen question using ONLY the material
above". The capability profile already allowed `read`/`glob`/`grep`; the text contradicted it.

The terminal text was delivered and consumed. The principal noticed the result was a basis artefact,
checked the repository itself, and wrote the substantive answer into `deliverables/probe.md`. That
is good principal behaviour, but it is **not** a cross-agent finding: the delegated execution added
nothing that the principal did not then derive itself.

## 3. Probe 2 — the read fix works, settlement refuses the shape

After the prompt was made profile-aware, the same path produced a branch that made **9 calls**:
`glob`, seven `read` calls (`brief.md`, `sites.md`, `vendors.md`, `condition.md`, `collections.csv`,
`open-questions.md`, `rights.md`) and one `palimpsest_branch_result`. The statement was substantive
and named the inspection room and the 40-reel/30-minute rule.

Settlement then failed:

```text
Delegated research ended without an admissible conclusion.
Basis: d1158c8977bd
Detail: the research branch could not be settled: externalEvidenceRefs[].evidenceId must be a stable identifier
```

The branch had passed file paths (`sources/sites.md`, ...) as `evidenceRefs`. The settlement owner
requires stable evidence ids, and no allowlist existed for this delegation. The refusal is honest and
the failure was **not** rewritten into a success. It also identified the second half of the same
presentation defect: a read-enabled branch must be told not to send file paths as evidence ids.

## 4. Probe 3 — grounded, admitted, delivered, consumed (post-correction)

After the result-shape sentence was added to the same prompt block:

| observation | value |
| --- | --- |
| branch tool calls | 9 (`glob`, 7 reads, one result) |
| branch tokens | 16,798 |
| branch statement | inspection room 16°C/45% RH inside Filmtek's 15–20°C/40–50%; 40 reels / 30 minutes; no network; per-reel speed absent from the sources |
| settlement | `COMPLETED`, admitted conclusion |
| delivery | `PALIMPSEST_DELEGATION {"delivered":true}`, basis `ade62028eca6` |
| consumption | the principal's delivery turn quotes the finding and writes it into `deliverables/probe.md` with the exploratory standing label |

The principal also computed the budget consequence (14 × £1,200 + £3,600 = £20,400) and the batch
count (six batches), and flagged the missing per-reel speed as the number to obtain before the
booking. The finding is not Evidence and the principal did not present it as Evidence.

## 5. The scored run

In the scored P run the principal was not told which tool to call. It read the journal (all four
entries), decided the pack's real unknown was the Filmtek per-reel scan time, and started one
delegation for that question. The branch read the frozen basis and returned a grounded statement
that the pack contains no throughput specification and that a professional 35mm nitrate scan is
realistically 20–40 minutes per reel externally. The principal consumed it, tightened the plan's
calibration assumption to 20–30 minutes per reel, and planned a three-week booking with one reel per
30-minute batch.

That is the observed influence chain. Its limitation is stated in the results: the principal also
used `web_search` and `web_fetch` for the same question, so the delegated finding is not the sole
cause of the throughput assumption.

## 6. What this does and does not establish

**Established:**

- the shipped host creates a real second model execution through the existing branch port;
- the read basis is a frozen commit and the result carries it;
- settlement is the existing ReasoningCell path, not a new owner;
- the terminal result reaches the bound principal as a normal follow-up turn;
- the principal can quote and act on it;
- failures (unreadable basis, malformed result) are delivered honestly as failures.

**Not established:**

- that the branch result is Evidence, Proof or Project Verification (it is not);
- that the branch is a durable independent agent (it is not);
- that the delivery survives a crash (it does not; the host job is in-memory);
- that the finding alone caused the decision (the principal also searched the web);
- that this generalizes beyond one scenario and one model.
