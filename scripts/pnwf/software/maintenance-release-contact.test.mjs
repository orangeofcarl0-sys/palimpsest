import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readReleaseContactRefusals } from "./maintenance-release-contact-replay.mjs";
import { releaseContactBasis, releaseContactRefusal } from "./release-evidence-plugin/contact.js";

const old = fileURLToPath(new URL("../../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/", import.meta.url));
const basis = "73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad";
const cases = readReleaseContactRefusals(old);

test("release_contact describes the full Git HEAD and distinguishes archive identifiers", () => {
  assert.match(releaseContactBasis.description, /40-character Git HEAD SHA/u);
  assert.match(releaseContactBasis.description, /git rev-parse HEAD/u);
  assert.match(releaseContactBasis.description, /archive SHA-256/u);
});

for (const [arm, faults] of Object.entries(cases)) {
  for (const { args, callSeq, resultSeq } of faults) {
    test(arm + " original contact " + callSeq + "→" + resultSeq + " can recover from the refusal", () => {
      const input = { action: "contact", ...args };
      const error = releaseContactRefusal(input, basis);
      assert.equal(error.code, "REVIEW_BASIS_MISMATCH");
      assert.equal(error.expectedBasis, basis);
      assert.equal(error.recovery.command, "git rev-parse HEAD");
      assert.equal(error.recovery.tool, "release_contact");
      assert.equal(error.recovery.argument, "basis");
      assert.match(error.recovery.steps.join(" "), /same question/u);
      assert.equal(releaseContactRefusal({ ...input, [error.recovery.argument]: error.expectedBasis }, basis), null);
    });
  }
}

test("short or different full Git SHAs fail and malformed questions have their own refusal", () => {
  for (const wrongBasis of [basis.slice(0, 8), "1".repeat(40), undefined]) {
    assert.equal(releaseContactRefusal({ action: "contact", basis: wrongBasis, question: "Verify release." }, basis).expectedBasis, basis);
  }
  assert.deepEqual(releaseContactRefusal({ action: "contact", basis, question: " " }, basis),
    { ok: false, code: "REVIEW_REQUEST_INVALID" });
});
