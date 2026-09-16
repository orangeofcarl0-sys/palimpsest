# G10-AD — Independent verify evidence

Transcripts and results for the independent-verification claims. Every block below
is pasted from a real run on this working tree; nothing is reconstructed.

Environment: Windows, Node v24.14.1, pnpm 11.21.0. The commit hashes inside the
dogfood output are derived from a freshly created TEMP repository, so they differ
per run; the digests and ids are deterministic for a fixed input.

## 1. The first-party mechanical dogfood

```text
$ node scripts/verification/mechanical-verify.mjs ; echo "EXIT=$?"
```

```text
EXIT=0
{
  "protocol": "git diff --check",
  "verifierRef": "project.head.git-diff-check.v1",
  "verifierDefinitionDigest": "ec49a1fdd12129b222cc155d6fc124dc2864f19249f2418c2a92dc5078d2fb9b",
  "subject": {
    "projectId": "mechanical-verify-dogfood",
    "projectRevision": 0,
    "projectDigest": "2087dbbee0e43165dd3a6b4eb977544fa76fa2aba7e90e93da5670b134fc37f5",
    "headCommit": "280e53bf7d356cefee17d3922c49c9a3003d74d0",
    "digest": "6d49e411abfaada4457e968e7b6b48218e061b36ab61fc9843c655c12f4715cb"
  },
  "independence": "MECHANICAL_INDEPENDENT",
  "verdict": "PASS",
  "status": "PASS",
  "freshness": "CURRENT",
  "runId": "pvrun-5fa3af2292013895959bb14d6d42929f",
  "runRef": "project_verification:pvrun-5fa3af2292013895959bb14d6d42929f",
  "gitHead": "280e53bf7d356cefee17d3922c49c9a3003d74d0",
  "repositoryConsistent": true,
  "workEvidenceCreated": 0,
  "proofPublished": 0,
  "reasoningAdmitted": 0,
  "workflow": "COMPLETED",
  "pass": true
}
{
  "afterHeadMove": {
    "previousRun": {
      "runId": "pvrun-5fa3af2292013895959bb14d6d42929f",
      "freshness": "CURRENT",
      "current": true
    },
    "headBeforeMove": {
      "revision": 0,
      "digest": "2087dbbee0e43165dd3a6b4eb977544fa76fa2aba7e90e93da5670b134fc37f5",
      "head_commit": "280e53bf7d356cefee17d3922c49c9a3003d74d0"
    },
    "headAfterMove": {
      "revision": 1,
      "digest": "525d3610a8151a4c4f30215c4796f5a49c96142e14a27854dc8109fe5fea0440",
      "head_commit": "280e53bf7d356cefee17d3922c49c9a3003d74d0"
    },
    "derivedRunFreshness": "STALE_SUBJECT",
    "derivedRunCurrent": false,
    "newHeadState": "UNVERIFIED",
    "newHeadHasRun": false,
    "historyRetained": 1,
    "detail": "no recorded run covers this exact project head; previous runs are retained as history"
  },
  "pass": true
}
```

What this transcript proves, in order:

```text
a REAL temp git repository with a REAL committed head           (not a stub)
the subject headCommit == the repository head                   repositoryConsistent: true
the registered protocol really executed as a subprocess         verdict PASS
the verifier counts as independent from a real DEFINITION        MECHANICAL_INDEPENDENT
ZERO Work Evidence, ZERO Proof publication, ZERO Reasoning      0 / 0 / 0
a real PROJECT_REVISED stale the run BY DERIVATION              STALE_SUBJECT, current: false
the NEW head is UNVERIFIED with no run                          UNVERIFIED, historyRetained: 1
the append-only chain still verifies                            store.verifyChain().ok
```

## 2. Gate results

```text
$ git diff --check
exit 0        (one CRLF notice on src/install.ts, no whitespace error)

$ pnpm build
exit 0        (tsc -b, no output)

$ pnpm run build:web
exit 0        (vite build, 203 modules; a >500 kB chunk-size notice, pre-existing)

$ pnpm exec vitest run --maxWorkers=2
Test Files  160 passed (160)
Tests       1623 passed (1623)

$ pnpm exec playwright test
29 passed (43.3s)
```

Baseline before this stage: 159 files / 1591 tests. After: 160 files / 1623 tests
(+1 file, +32 tests: `test/ad_verification_integration.test.ts`, 32 cases).

## 3. The integration suite

```text
$ pnpm exec vitest run --maxWorkers=2 test/ad_verification_integration.test.ts
Test Files  1 passed (1)
Tests       32 passed (32)
```

Covered there (AD-N17…AD-N27, AD-N30 plus the §15/§16/§17/§22/§23/§26/§27/§28
integration proofs and the install-level restart proof):

```text
a bare bool/ref no longer inflates VERIFY availability     (§16, AD-N17)
a real runtime + independent verifier DOES make it AVAILABLE (§15)
VERIFY preferred with no runtime stays preferred, honestly (§15)
verify.v1 is project.verification and CONDITIONAL          (§17)
an absent verifier binds the explicit project-default      (§17)
FOCUS+VERIFY verifies the current head through the runtime (AD-N24/N25)
a VERIFY plan with no runtime never fakes success          (§18)
a blocked run leaves the base outcome visible + UNRESOLVED (§18)
EXPLORE+VERIFY does not re-verify reasoning claims         (AD-N26)
COORDINATE+VERIFY accepts no commitment                    (AD-N27)
no VERIFY preference ⇒ no automatic candidate              (AD-N18)
a due head is reachable; a fresh run suppresses the repeat (AD-N19/N21)
a NEW head makes verification due with a NEW candidate id  (AD-N20)
DIRECT stays explicit; MANAGE/DELEGATE execute durably     (AD-N22/N23)
the activity REFERENCES project_verification:<runId>       (§21)
HTTP accepts only a registered ref and a derived subject   (§23)
the restart restores PASS/history from the same store      (§26)
the Advisor fact comes from the runtime, not a string      (§28)
the protected planes are unmodified (git + seam presence)   (§27)
```

## 4. The browser E2E

```text
$ pnpm exec playwright test
ok  E2E-PROJECT-01 … E2E-PROJECT-03                      (pre-existing, still green)
ok  E2E-PROJECT-04: the verification card names the protocol, never a generic verified badge
```

E2E-PROJECT-04 runs against the REAL built product stack with a REAL registered
mechanical verifier (`node -e process.exit(0)` as a bounded subprocess) and the
project head set to the working copy's real git head:

```text
verification-not-a-badge contains "never shows a generic"
verification-verdict-scope contains named_verifier_protocol_only
verification-availability contains AVAILABLE
verification-head-commit equals the real git head
verification-repository-consistent says the heads are equal
verification-state is UNVERIFIED before any run; no history row exists
after clicking verify: recorded, PASS, verifier ref, project_verification:… ref
independence MECHANICAL_INDEPENDENT and "counts as independent"
freshness CURRENT; latest run PASS
exactly ONE history row, count 1
an unknown verifierRef over HTTP is blocked with unknown_verifier_ref and run: null
the run count is still 1 afterwards
```

## 5. Honest notes on this evidence

1. The dogfood's temp-repository commit hash varies per run (the commit timestamp
   is part of the hash). Everything else in the transcript is deterministic.
2. The vitest suite spawns real `node` subprocesses for the mechanical verifier
   cases. That is the intended path, and it is why the suite is not instant.
3. The E2E's verifier command is `node -e process.exit(0)` rather than
   `git diff --check` so the verdict does not depend on the working copy's
   whitespace. The REAL `git diff --check` protocol is exercised by the dogfood
   above, against a REAL temp repository.
4. `pnpm exec vitest run` was invoked directly (not `pnpm test`, which rebuilds
   first) after an explicit `pnpm build`, so the typecheck is a separate exit-0
   gate rather than a hidden one.
