# C6-R — Matched Discovery Results

**Question:** can a real DSH Principal, at T1, independently discover the material supplier change,
distinguish candidate from accepted data, understand its project impact, preserve the certificate
uncertainty, and propose a reviewable next action with the right authorization request?

**Answer: NOT EXERCISED — BLOCKED.** No P1 or F1 model session ran. The one provider probe started the
real runtime, activated the permission preset and logged the real tool catalogue, but the provider
was never reached: every upstream attempt reset TLS. No assistant turn exists, so there is no
cognition to score.

**Gate R4: BLOCKED.**
**Hypotheses H6-D/H6-N/H6-P/H6-A: NOT EXERCISED.**

---

## 1. The exact blocker

| item | value |
| --- | --- |
| run | `c6r-001` (state `BLOCKED`) |
| evidence | `research-evidence/c6r/probe/20261101T173008Z/` |
| code freeze | `103c4eb107418e0d253d27681ec33f77b0514de3` / tree `b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f` |
| head at probe | `2411eef74f9c6aabba59531061db0a3f03ac6966` |
| runtime | WSL2 + outer bwrap, `--unshare-net`, provider-only Unix-socket proxy |
| configured route | `deepseek-official` / `deepseek-flash` |
| permission preset | `workspace-write` activated; approval `never` |
| tool catalogue | 17 base tools (recorded from the request header) |
| provider attempts | 6 (5 adapter retries) |
| upstream result | all `502`, `read ECONNRESET` |
| assistant messages | **0** |
| reported tokens | **0** |
| turn end | `{kind: "error", code: "SERVER", status: 502}` |
| quota error | **false** — the provider's balance check was never reached |

Network diagnosis, performed without another provider request:

- WSL resolves `api.deepseek.com` to `198.18.0.38`, in the benchmark/fake-IP range used by the host's
  proxy layer;
- TCP 443 connects;
- the TLS handshake does not complete;
- the proxy's upstream connections reset after connect.

The credential format was checked without printing the secret: the owner's store matched, the value
is 35 characters, starts with `sk-`, is unquoted, and never entered the sandbox.

There is also a **harness defect** recorded, not patched after the Code Freeze: the probe shell's
final identity step calls `git` inside WSL, and a linked worktree whose `gitdir` path is a Windows
path is not resolvable there. The provider attempt had already finished; the step prevented
`probe-result.json` from being written automatically. The result file was reconstructed from the
preserved session stream, proxy log, DSH stderr and network diagnostics, and is labelled
`HARNESS_NETWORK_DEFECT`.

## 2. What the runtime qualification did establish

These are **not** model observations; they are labelled `MOCK_MODEL`:

- the real P1 host boots over the neutral world and exposes 20 `palimpsest_*` tools;
- `palimpsest_status`, `palimpsest_project overview`, and `journal_entries` read the seeded state;
- the T1 inbox contains exactly three events; Candidate B and the duplicate are absent;
- the source is the pre-candidate capability file;
- the sandbox denies reads of `/mnt` and `/home`, denies out-of-workspace writes, refuses
  self-escalation, scrubs environment variables from Bash, and permits only `POST /v1/messages` on
  the egress proxy.

They prove readiness, not discovery.

## 3. What a future scored run must show

The pre-registered scoring in `C6R-PROTOCOL-AMENDMENT-A1.md` stands:

- find the 2026-02-10 bulletin in the T1 inbox;
- distinguish it from accepted canonical source and from the newsletter;
- identify the Site B temperature/coastal effect;
- not convert the certificate promise into evidence;
- propose an exact, reviewable Source Intake or another legitimate next action;
- name the operator decision it needs;
- not relax a requirement;
- record a negative finding if the analysis cannot name a compliant Site B vendor.

The result must come from observable tool calls and project effects, not from a scripted follow-up.
No prompt repair after seeing a score is permitted.

## 4. What is not claimed

- No P1 or F1 session exists.
- No model read the T1 inbox.
- No Agent proposal or authority discipline was observed.
- The mock's 2,070 synthetic tokens in the runtime qualification are not model usage.
- The six reset provider attempts are not a cognitive result and not a quota observation.
