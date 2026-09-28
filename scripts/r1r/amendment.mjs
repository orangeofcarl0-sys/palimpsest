#!/usr/bin/env node
/**
 * R1-R §3 — THE PROTOCOL AMENDMENT A1, PARSED AND DIGESTED.
 *
 * The parent protocol (`R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md`) registered the primary matrix as
 * BLOCKED and required any later correction to be an APPEND-ONLY amendment. This module is that
 * amendment's machine half:
 *
 *   · it recomputes the AMENDMENT's own digest from the amendment document's bytes;
 *   · it re-verifies the PARENT digest is still the frozen value, so an amendment cannot be used as a
 *     cover for editing the protocol it amends;
 *   · it asserts the amendment still says the things that make the resumed matrix legitimate — the
 *     parent digest it names, the reason, the Scenario-A ceiling fact, the demotion, the two
 *     replacement scenarios, and the unchanged trial count.
 *
 * A digest a human types once proves nothing on the next edit, so it is RE-DERIVED here, exactly as
 * `scripts/r1/protocol.mjs` does for the parent.
 *
 * PLAIN JAVASCRIPT (`.mjs`), like the R1 harness it extends.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** This repository's root — `scripts/r1r/` → the checkout. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PARENT_PROTOCOL_PATH = join(REPO_ROOT, "docs", "engineering", "R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md");
export const AMENDMENT_PATH = join(REPO_ROOT, "docs", "engineering", "R1-PROTOCOL-AMENDMENT-A1.md");

/** §3: the parent digest this amendment amends. It must never move. */
export const PARENT_PROTOCOL_DIGEST = "2d1dfecaf7feecc55601a00f0760cec7e95b667f2972ad34bb831740b006feca";

/** §3/§5: the amendment's frozen facts. Stated HERE and asserted against the document. */
export const AMENDMENT_FROZEN = Object.freeze({
  amendmentId: "A1",
  parentProtocolDigest: PARENT_PROTOCOL_DIGEST,
  /** §4: the replacement primary scenarios. Scenario A is demoted, never deleted. */
  primaryScenarios: Object.freeze(["B_CONFIG_MIGRATION", "C_REPLAY_SAFE_REDUCER"]),
  secondaryScenario: "A_DAG_PLANNER",
  /** §6: unchanged. */
  trialsPerConditionPerScenario: 5,
  conditions: Object.freeze(["C0", "C1", "C2"]),
  /** The Scenario-A ceiling fact this amendment is required to state (§3). */
  scenarioACeiling: "8/8",
});

/** The digest of the amendment document's bytes. */
export function amendmentDigest() {
  return createHash("sha256").update(readFileSync(AMENDMENT_PATH)).digest("hex");
}

/** The parent digest, recomputed from the parent's bytes — the guard against amending by rewriting. */
export function parentProtocolDigest() {
  return createHash("sha256").update(readFileSync(PARENT_PROTOCOL_PATH)).digest("hex");
}

/**
 * Parse the amendment and assert it still states the frozen facts.
 *
 * As in `scripts/r1/protocol.mjs`, the assertions are about TEXT the document must contain rather than
 * about prose: a silently weakened amendment (a dropped scenario, a raised trial count, a claim that
 * the parent moved) fails loudly instead of passing quietly.
 */
export function parseAmendment() {
  const text = readFileSync(AMENDMENT_PATH, "utf8");
  const failures = [];
  const require_ = (needle, why) => {
    if (!text.includes(needle)) failures.push(`${why}: the amendment does not contain ${JSON.stringify(needle)}`);
  };

  require_(PARENT_PROTOCOL_DIGEST, "the amendment must name the parent digest it amends");
  require_("R1 semantic blocker was closed by R1-L", "the amendment must state its reason");
  require_(AMENDMENT_FROZEN.scenarioACeiling, "the Scenario-A ceiling fact must be recorded");
  require_("demoted", "Scenario A must be demoted rather than deleted");
  require_("SECONDARY probe", "Scenario A must remain a secondary probe");
  require_("Versioned Config Migration", "Scenario B must be pre-registered");
  require_("Replay-Safe Event Reducer", "Scenario C must be pre-registered");
  require_("2 x 3 x 5 = 30", "the trial count must be unchanged and stated");
  require_("BLOCKED_R1_SEMANTIC_BLOCKER", "the parent's blocked status must remain recorded");
  require_("transform/default before legacy ambiguity validation", "Scenario B's pre-paid mistake must be frozen");
  require_("mutate/reduce before replay/sequence validity is established", "Scenario C's pre-paid mistake must be frozen");
  require_("Knowledge != Authority", "the firewalls must remain in force");
  require_("SCALING_FRICTION", "the relevance deferral must be carried forward");

  // The parent must not have been edited. This is the assertion that makes "append-only" checkable.
  const actualParent = parentProtocolDigest();
  if (actualParent !== PARENT_PROTOCOL_DIGEST) {
    failures.push(
      `the parent protocol was MODIFIED: expected ${PARENT_PROTOCOL_DIGEST}, found ${actualParent}. An amendment is append-only.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`R1 protocol amendment A1 is not the frozen one:\n  - ${failures.join("\n  - ")}`);
  }

  return Object.freeze({
    amendmentId: AMENDMENT_FROZEN.amendmentId,
    amendmentDigest: amendmentDigest(),
    parentProtocolDigest: actualParent,
    primaryScenarios: AMENDMENT_FROZEN.primaryScenarios,
    secondaryScenario: AMENDMENT_FROZEN.secondaryScenario,
    trialsPerConditionPerScenario: AMENDMENT_FROZEN.trialsPerConditionPerScenario,
    conditions: AMENDMENT_FROZEN.conditions,
  });
}
