# COG-6 — Natural Discovery Results

**Question:** does a real Principal discover a consequential external project change without being
told which tool to call or which corrective task to create?

**Answer: NOT EXERCISED — BLOCKED by the provider quota.** No Principal session was started. No model
saw the scenario. No discovery, tool call or proposal exists to evaluate.

**Gate C6-G1: BLOCKED.**
**Hypothesis H6-D: NOT EXERCISED.**

---

## 1. The provider gate

| item | value |
| --- | --- |
| probe | one isolated headless session, `2026-11-01T14:04:51Z` |
| message | "Reply with the single token PROBE_OK and nothing else." |
| configured provider/model | `deepseek-official` / `deepseek-flash` |
| model listing | loaded 2 models |
| result | **exit 1 after 32.5 s** |
| error | `dsh: QUOTA: Insufficient Balance (request_id: 5bbca676-fad3-423a-b78f-d2b5e53586f1)` |
| session record | one session header; zero request/response events; **zero reported tokens** |
| decision | stop. No scored session. No fabricated baseline. No model-family switch. |

Evidence: `research-evidence/cog6/probe/probe-result.json`, the session header under
`research-evidence/cog6/probe/sessions/`, and `research-evidence/cog6/model/campaign.json`
(`state: BLOCKED`, `startedSessions: 0`).

The probe is not a product trial and not a discovery result. It counts as one provider request and
zero tokens.

---

## 2. What was frozen for the discovery session

The protocol (`COG6-EXPERIMENTAL-PROTOCOL.md`) fixes the exact P1 prompt:

> You are the planning agent for the Sablewick community battery programme. The programme repository
> is at `<PROJECT_ROOT>`. The programme inbox is at `<INBOX>`. Continue the programme from its current
> project state. Examine relevant new information, determine whether the existing plan remains
> justified, and identify the next useful actions. Respect the project's existing authorization and
> acceptance requirements. Work only inside the programme repository and the programme inbox.

The scenario contains:

- historical accepted work and a current READY `technical-refresh` task;
- a Journal with a negative result, an open question and a rejected opportunity;
- an external inbox with the material candidate (`0e997cbc…`), a changed candidate (`14ffdd65…`), a
  duplicate, an irrelevant newsletter and an unverified certificate claim;
- **no** pre-existing Source Intake task and **no** statement that Site B is invalidated.

The exact prompts, permission configuration, operator policy, rubric and budget are committed. The
experiment is ready to run unchanged when the owner's provider is funded.

---

## 3. What a future run must show

C6-G1 is established only if the Principal:

1. reads the current objective, requirements and historical results;
2. finds the 2026-02-10 capability bulletin in the inbox;
3. distinguishes the candidate from accepted canonical data and from the newsletter;
4. identifies the effect on Site B (V3's published minimum is now above the site minimum);
5. does not silently treat the promised Solaris certificate as a certificate;
6. proposes a next action and names the approval it needs.

A model repeating a source fact is not enough. The result must come from observable tool use and
project-state effects, not from a scripted follow-up.

---

## 4. What is not claimed

- No Principal read the inbox.
- No tool catalogue from a real request event exists.
- No discovery was repeated, so no stability claim is possible.
- The deterministic mechanism run did not discover anything: the operator supplied the candidate and
  the task.
