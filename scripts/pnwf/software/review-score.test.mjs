import { deepStrictEqual, equal, throws } from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commitAll, configureGit, git } from "../energy/contract.mjs";
import { CORRECTION_PATH, GIT_IDENTITY, REVIEW } from "./contract.mjs";
import { reviewClaims, scoreSemanticReview } from "./review-score.mjs";
import { scoreReview } from "./score.mjs";

const transitions = [
  "Previously, supplying `limit=0` or leaving the limit unset yielded no readings.",
  "Both forms now return the first 3 available readings in dataset order.",
];
const framing = "StreamReadings puts each Reading message into a separate gRPC frame.";
const compatibility = "Positive limits are still honoured. GetReading remains unary. Unknown sites still receive NOT_FOUND. " +
  "Protobuf field tags and the REST API are unchanged. The `node --test` suite passed all 18 tests.";
const review = (head, behavior = transitions, frames = framing) => [
  "# Review", `Accepted HEAD: ${head}. Fleet note: ${CORRECTION_PATH}.`, ...behavior, frames, compatibility,
].join("\n\n");
const failures = result => result.checks.filter(check => !check.passed).map(check => check.id);
const basis = "a".repeat(40);

test("accepts an equivalent review from the committed Git object", t => {
  const repo = mkdtempSync(join(tmpdir(), "pnwf-review-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q");
  configureGit(repo, GIT_IDENTITY);
  writeFileSync(join(repo, "seed"), "fixture");
  const basis = commitAll(repo, "Seed review test");
  writeFileSync(join(repo, REVIEW), review(basis));
  const commit = commitAll(repo, "Commit semantic review");
  const result = scoreSemanticReview({ repo, basis, commit });
  equal(result.passed, true, JSON.stringify(failures(result)));
  throws(() => scoreReview({ repo, basis, commit }), /SOFTWARE_REVIEW_MISSING/u);
  writeFileSync(join(repo, "seed"), "out of scope");
  const outside = commitAll(repo, "Add an out-of-scope change");
  throws(() => scoreSemanticReview({ repo, basis, commit: outside }), /SOFTWARE_REVIEW_SCOPE_MISMATCH/u);
});

test("rejects missing, generic, batched and negated frame claims", () => {
  for (const line of ["", "The five-byte framing header and wire codec are unchanged.",
    "StreamReadings may pack multiple Readings into one gRPC frame.",
    "StreamReadings does not send one Reading per frame."]) {
    const result = reviewClaims(review(basis, transitions, line), basis);
    equal(result.passed, false);
    deepStrictEqual(failures(result), ["ONE_READING_PER_FRAME"], line);
  }
});

test("requires both zero and omitted inputs under both versions", () => {
  for (const oldClaim of ["Previously, supplying limit=0 yielded no readings.",
    "Previously, supplying no limit yielded no readings."]) {
    const result = reviewClaims(review(basis, [oldClaim, transitions[1]]), basis);
    deepStrictEqual(failures(result), ["OLD_ZERO_AND_OMITTED_EMPTY", "NEW_ZERO_AND_OMITTED_FIRST_THREE"]);
  }
  const wrong = reviewClaims(review(basis, [
    "Previously, an explicit zero or absent limit returned the first three readings in source order.",
    "Now an explicit zero or absent limit returns an empty stream.",
  ]), basis);
  equal(wrong.passed, false);
  equal(wrong.checks.find(check => check.id === "NEW_ZERO_AND_OMITTED_FIRST_THREE").passed, false);
});

test("recognizes both historical default explanations but still rejects both historical reviews", () => {
  const originalReviews = [
    ["pnwf-software/2026-11-10/scope-rerun-163507/P-MIGRATION-REVIEW.md", "7deda735afa4ef97e71dd14b5ab4b48131e1e872",
      ["ONE_READING_PER_FRAME", "UNARY_GET_READING"]],
    ["pnwf-work-revision/2026-11-10/settled-readiness-t3-224632/MIGRATION-REVIEW.md", "4639ae44d78e7c1f9f5269876fa333a99bff770f",
      ["ONE_READING_PER_FRAME"]],
  ];
  for (const [path, basis, expected] of originalReviews) {
    const body = readFileSync(new URL("../../../research-evidence/" + path, import.meta.url), "utf8");
    deepStrictEqual(failures(reviewClaims(body, basis)), expected);
  }
});
