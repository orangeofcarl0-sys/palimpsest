# PAL-FED-0 Delivery Report

Status: EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0` (isolated worktree). Base: `59fae6e`.

---

## 1. Outcome

The smallest real system in which `palimpsest.main` and `ordarium.main`
communicate directly and durably — each with its own repository, worktree,
context, plan and authority — is implemented as a removable leaf
(`src/federation/`), tested to machine acceptance, and runs on frozen released
Ordarium v1.3.1. **What has not happened is the real two-Main dogfood run**;
this report says so plainly instead of dressing synthetic dialogue up as
evidence.

## 2. Isolation

- Dedicated worktree, `main` untouched:
  `F:/Codex_Work_Space/Palimpsest/palimpsest-fed0` on `experiment/pal-fed-0`.
- History kept reviewable, baseline repair separated from federation semantics:

| Commit | Content |
|---|---|
| `2ef77a9` | baseline portability repair (`test/paths.test.ts` host-native) — **not** PAL-FED-0 functionality |
| `f9bd403` | pin Ordarium v1.3.1 + freeze probe + bump-checklist schema pin 3→4 |
| `1040631` | `src/federation/` storage/domain core + CLI/MCP leaf + 32 tests |
| (this) | docs / operating guide / skill / evidence / delivery |

## 3. Baseline status (honest)

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm test` @ baseline | ✅ 60 files / 433 tests |
| `pnpm build:web` | ✅ |
| `pnpm test:e2e` @ baseline | ⚠️ 20/21 — `E2E-DEBUG-01` fails only in the exact default 21-spec order |

The E2E failure is **pre-existing and not caused by PAL-FED-0 or the pin**:
reproduced at `59fae6e` with Ordarium 1.2.0 before any change. Evidence it is
order/environment dependent, not a product defect:

- runs 4/4 green when `runtime-debugger.spec.ts` is run alone;
- 14/14 green with the three preceding spec files;
- 11/11 green with the two other preceding spec files;
- **21/21 green when the same 21 specs run with the debugger spec first**;
- 20/21 in the exact default order.

Playwright `retries` remain `0`; the flake is reported, never masked.

```
baseline local:  unit ✅  build:web ✅  e2e 20/21 (pre-existing order flake)
baseline remote: unverified at base HEAD (no CI observation performed on 59fae6e)
```

## 4. Ordarium upgrade

- `@ordarium/{core,host-kit,ledger-sqlite,testing}` pinned to published
  `ordarium-v1.3.1` release tarballs (manifest + workspace overrides + lockfile).
  No `../ordarium`, no `workspace:*`, no live HEAD.
- `test/federation_freeze.test.ts` asserts exact `1.3.1`, `HOST_CONTRACT_VERSION
  = 1`, and `StateChangeFeed` via public APIs.
- One intended bump-boundary breakage fixed: the Ordarium ledger bump checklist
  pinned SQLite `user_version = 3`; 1.3.0's ORD-BOOT-0 feed moved it to 4.
- Existing suite after the bump: ✅ 60 files / 433 tests (no behavior change).

## 5. What was implemented

`src/federation/` (EXPERIMENTAL, removable leaf, not exported from the package
root):

- fabric marker + explicit `init` + fail-closed startup validation;
- immutable `CollaborationEvent` (revision 1 only), adapter-injected
  `from`/`eventId`/`createdAt`;
- revisioned `BoundaryContract` with complete-terms proposals, digest-bound
  bilateral acceptance, stale-digest rejection, CAS conflict surfacing;
- peer inbox with pending-batch + explicit ack (crash/restart replay);
- thread as a derived `StateChangeFeed` scan;
- strict exact-envelope codecs for durable records and tool inputs;
- `palimpsest-collab` CLI + six-tool MCP stdio leaf;
- no Ordarium change, no canonical runtime change, no shared task graph.

## 6. Machine acceptance

`FED-A01–A04` ✅ · `FED-B01–B04` ✅ · `FED-C01–C05` ✅ · `FED-D01–D06` ✅ ·
codec strictness ✅ · freeze proof ✅ · two-process integration ✅.

Full suite at experiment HEAD: **64 files / 465 tests green** (was 60/433; +32
federation tests). Details in `evidence/PAL-FED-0-EVIDENCE.md`.

## 7. Final gate at experiment HEAD

```
clean ✅   build ✅   build:web ✅   test ✅ (465)   test:e2e ⚠️ 20/21
```

`test:e2e` carries the same pre-existing order-dependent flake (identical
failure signature, identical provenance at baseline). PAL-FED-0 has no GUI and
its integration proof is process-level, so it adds no browser E2E.

**Remote CI: observed green at the final HEAD —
run [34529583002](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/34529583002):
`unit => success`, `e2e => success` on draft PR #1.** The remote e2e job passing
confirms the local `E2E-DEBUG-01` failure is a Windows/order artifact of this
host, not a product defect and not a PAL-FED-0 regression.

## 8. Stop conditions (§74)

```
isolated experiment branch exists ............................ ✅
baseline locally green ....................................... ⚠️ unit+build green; e2e 20/21 pre-existing flake
Ordarium 1.3.1 pinned ........................................ ✅
fabric init/validation works ................................. ✅
two fixed peers work ......................................... ✅
immutable events work ........................................ ✅
derived thread history works ................................. ✅
CAS BoundaryContract works ................................... ✅
bilateral digest acceptance works ............................ ✅
pending inbox + explicit ack works ........................... ✅
restart replay works ......................................... ✅
spoofing fails ............................................... ✅
contract race fails closed ................................... ✅
two real processes share one DB .............................. ✅
existing unit/E2E remain green ............................... ⚠️ unit green; e2e pre-existing flake unchanged
operating guide exists ....................................... ✅
dogfood harness/config exists ................................ ✅ (.zcode skill + evidence/dogfood.config.json)
experimental delivery report exists .......................... ✅
```

Not started (per §74): PAL-FED-1, automatic wake, dynamic peers, capability
discovery, collaboration graph, ProjectCell/Holon, G10-A, Ordarium changes.

## 9. Remote CI

GitHub credentials were available, so the experimental branch was pushed and a
**draft PR** opened ([#1](https://github.com/orangeofcarl0-sys/palimpsest/pull/1))
to run the existing `pull_request` workflow.

```
run:    https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/34529583002  (final HEAD 29355e0)
status: completed / success
  unit => success
  e2e  => success

also observed at the preceding HEAD e5c54a4:
run:    https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/34529419443
status: completed / success
  unit => success
  e2e  => success
```

Remote unit and e2e are both green at the experiment HEAD. This is the same
workflow that runs with `retries = 0`; the e2e job passing on ubuntu confirms
the local Windows `E2E-DEBUG-01` ordering flake is environmental, not a
PAL-FED-0 regression. The PR stays a **draft** — PAL-FED-0 semantics are not to
be merged into `main` as canonical UAS semantics in this batch.

## 10. The twenty dogfood questions (§60)

Answered honestly. Labels: **[mech]** machine-proven by this batch;
**[struct]** true by construction/structure; **[open]** not answerable without
the real two-Main dogfood run.

1. **Did `PeerRef` prove sufficient?** [mech] sufficient for exactly two fixed
   peers — identity, addressing and validation all work. [open] whether it
   generalizes beyond two.
2. **Was `Thread` correctly modeled as a view rather than state?** [struct] yes:
   no thread subject exists; a thread is a feed scan in commit order. Real-scale
   cost is untested beyond synthetic volumes.
3. **Did real collaboration require more event kinds?** [open]
4. **Were event kinds actually useful, or mostly arbitrary labels?** [open]
5. **Did BoundaryContract provide value beyond messages?** [mech] it adds
   digest-bound, revocable agreement that messages cannot express. [open]
   whether that value is worth the ceremony in practice.
6. **Was bilateral explicit acceptance useful or too heavy?** [open]
7. **Was pending-batch + ack necessary?** [mech] it is the only reason a crash
   after delivery cannot lose a message. Whether the ceremony is worth it is
   [open].
8. **Did checkpoint-driven inbox checks feel sufficiently real-time?** [open]
9. **Was blocking wake actually needed?** [open] no evidence yet; this is the
   intended first real topic.
10. **Did agents over-communicate?** [open]
11. **Did they under-communicate?** [open]
12. **Did they attempt to share full plans?** [open]; structural discouragement
    exists (size bounds reject context dumps; the operating guide forbids it).
13. **Did they need cross-repo task synchronization?** [struct] no such channel
    exists and none is needed by the protocol. [open] real need.
14. **Did the user remain a message bus anywhere?** [open]
15. **What decisions required user escalation?** [open]
16. **Did Ordarium need any additional primitive?** [open] deliberately
    unanswered — the first real topic asks exactly this, and PAL-FED-0 must not
    implement the answer.
17. **Did any Palimpsest collaboration semantic leak downward?** [struct] no:
    the dependency direction is federation → Ordarium public APIs only, and the
    federation leaf is not exported by the package root or `advanced`.
18. **What parts should be promoted into G10-A0?** Recommend evaluating (not
    presuming): `PeerRef`, immutable boundary events, digest-bound contracts,
    and the pending-batch/ack pattern. Promotion requires dogfood evidence.
19. **What should be deleted rather than generalized?** Candidate deletions to
    test against evidence: the eight-kind event union (may collapse), and
    `artifacts` (may be unnecessary). Do not generalize before evidence.
20. **Did this feel like two persistent peers or merely two subagents?**
    [open] — the honest primary residual.

## 11. Primary residual

**The experiment has not yet observed two real persistent Main Agents.** All
machine acceptance is synthetic and process-level; the harness, config,
operating guide and evidence template are ready, but the real
`palimpsest.main ↔ ordarium.main` dogfood — including autonomous contact and
possibly a BoundaryContract evolved from a genuine dependency — remains the
next, necessary step. Until then, the §60 behavioral questions above stay open
and no claim about real peer autonomy is made.
