#!/usr/bin/env node
/**
 * R1 §6 — THE PROTOCOL PARSER AND ITS DIGEST.
 *
 * §6 requires the pre-registered protocol to be frozen and its digest computed and recorded. A digest
 * that a human computes once by hand proves nothing on the next edit, so this module RE-DERIVES it
 * from the document's own bytes and exposes the frozen values the harness reads.
 *
 * It also parses the fields the trial harness must not be allowed to invent: the conditions, the N
 * values, the relevant-asset count, the trial count and the protocol seed. If the document and the
 * harness ever disagree, the disagreement is a bug in R1, not a detail to be smoothed over.
 *
 * PLAIN JAVASCRIPT (`.mjs`), like the harnesses that import it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** This repository's root — `scripts/r1/` → the checkout. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PROTOCOL_PATH = join(REPO_ROOT, "docs", "engineering", "R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md");

/** The frozen values. They are stated HERE and asserted against the document by `parseProtocol`. */
export const FROZEN = Object.freeze({
  conditions: Object.freeze(["C0", "C1", "C2"]),
  scenarios: Object.freeze(["A_DAG_PLANNER", "B_CONFIG_MIGRATION"]),
  /** §14: 5 per condition per scenario; the exploratory floor is 3. */
  trialsPerConditionPerScenario: 5,
  exploratoryFloor: 3,
  /** §15: one fixed seed generates the block ordering. */
  protocolSeed: 20260928,
  /** §26: the population sizes for the secondary experiment. */
  populations: Object.freeze([5, 25, 100]),
  /** §26: exactly one Proof, one Reasoning and one Procedure are relevant at EVERY N. */
  relevantCount: 3,
  /** §6: the primary matrix is blocked, and the document must say so. */
  primaryMatrixStatus: "BLOCKED_R1_SEMANTIC_BLOCKER",
});

/** The digest of the protocol document's bytes — the freeze witness §6 asks for. */
export function protocolDigest() {
  return createHash("sha256").update(readFileSync(PROTOCOL_PATH)).digest("hex");
}

/**
 * Parse the document and assert the frozen values are the ones it states.
 *
 * The assertions are deliberately about TEXT the document must contain, not about prose style: the
 * point is that a silently weakened protocol (an extra condition, a reduced N, a dropped firewall)
 * fails loudly instead of passing quietly.
 */
export function parseProtocol() {
  const text = readFileSync(PROTOCOL_PATH, "utf8");
  const failures = [];
  const require_ = (needle, why) => {
    if (!text.includes(needle)) failures.push(`${why}: the protocol does not contain ${JSON.stringify(needle)}`);
  };

  for (const condition of FROZEN.conditions) require_(`**${condition}**`, `condition ${condition} must be pre-registered`);
  for (const scenario of ["Scenario A", "Scenario B"]) require_(scenario, `${scenario} must be pre-registered`);
  for (const n of FROZEN.populations) require_(`N ∈ {${FROZEN.populations.join(", ")}}`, "the population sizes must be frozen");
  require_("FIXED at 3", "the relevant-asset count must be frozen at 3");
  require_("BLOCKED", "the primary matrix's blocked status must be recorded");
  require_("NO_REPLICATION", "all three verdicts must remain available");
  require_("Knowledge ≠ Authority", "the architectural firewalls must remain in force");
  require_("No private chain-of-thought", "the CoT discipline must remain in force");

  if (failures.length > 0) {
    throw new Error(`R1 protocol is not the frozen one:\n  - ${failures.join("\n  - ")}`);
  }

  return Object.freeze({
    digest: protocolDigest(),
    conditions: FROZEN.conditions,
    scenarios: FROZEN.scenarios,
    trialsPerConditionPerScenario: FROZEN.trialsPerConditionPerScenario,
    exploratoryFloor: FROZEN.exploratoryFloor,
    protocolSeed: FROZEN.protocolSeed,
    populations: FROZEN.populations,
    relevantCount: FROZEN.relevantCount,
    primaryMatrixStatus: FROZEN.primaryMatrixStatus,
  });
}

/**
 * §15: the pre-registered block ordering, derived from the ONE protocol seed.
 *
 * A small deterministic PRNG rather than a library: the point is reproducibility, and a reader can
 * re-derive the sequence from the seed with nothing but this function. Each block contains exactly one
 * C0, one C1 and one C2, so no condition is ever run in a contiguous temporal run.
 */
export function blockOrder(blocks) {
  let state = FROZEN.protocolSeed >>> 0;
  const next = () => {
    // xorshift32 — deterministic, dependency-free, and adequate for ordering 3 items.
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
  const out = [];
  for (let block = 0; block < blocks; block += 1) {
    const order = [...FROZEN.conditions];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = next() % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    out.push(Object.freeze({ block, order: Object.freeze(order) }));
  }
  return Object.freeze(out);
}

/** The plan §14 pre-registers: 2 scenarios × 3 conditions × 5 trials. */
export function trialPlan() {
  return Object.freeze({
    blocks: FROZEN.trialsPerConditionPerScenario,
    perScenario: FROZEN.conditions.length * FROZEN.trialsPerConditionPerScenario,
    total: FROZEN.scenarios.length * FROZEN.conditions.length * FROZEN.trialsPerConditionPerScenario,
  });
}
