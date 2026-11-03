#!/usr/bin/env node
/**
 * R1-R §29/§31/§32 — NORMALIZE, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §29 fixes the evidence layout under `research-evidence/r1-r/`, and §31 requires that the frozen
 * comparisons are computed only after all 30 trials exist. This script enforces that ordering: it
 * refuses to analyse a matrix whose trial count is not the pre-registered one, so an incomplete run
 * cannot be reported as a result.
 *
 * §29 also requires SANITIZATION. Every artifact written here passes through `sanitize`, which replaces
 * absolute local paths with placeholders. Credentials, tokens and private reasoning are never captured
 * in the first place: the trial harness records only observable fields, and the worker's own summary is
 * its self-report, not its chain-of-thought.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./amendment.mjs";
import { analyse, normalizeTrial, pairedStateCheck } from "./analyse.mjs";
import { parseAmendment } from "./amendment.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import { sha256 } from "./scenarios.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(REPO_ROOT, "..", ".r1r-matrix");
const CALIBRATION_RIG = args.get("calibration") ?? join(REPO_ROOT, "..", ".r1r-calibration");
const EXPECTED_TRIALS = Number(args.get("expected") ?? "30");
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r1-r");

/**
 * §29: strip absolute local paths. The pattern covers Windows drive paths and POSIX home paths; the
 * replacement keeps the artifact readable while removing the machine-specific prefix.
 */
function sanitize(value) {
  if (typeof value === "string") {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, "<home>")
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes(".palimpsest-r1r") ? "<rig>" : "<abs>"))
      .replace(/\/(?:home|Users)\/[^/\s"]+/gu, "<home>");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      // A field that could carry a credential is dropped outright rather than sanitized.
      if (/credential|secret|token|password|api[_-]?key/iu.test(key) && key !== "tokens") continue;
      out[key] = sanitize(inner);
    }
    return out;
  }
  return value;
}

const write = (relative, value) => {
  const path = join(EVIDENCE, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitize(value), null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${relative}\n`);
};

async function main() {
  const amendment = parseAmendment();
  const trialsPath = join(RIG, "trials.json");
  if (!existsSync(trialsPath)) throw new Error(`no trial record at ${trialsPath}; run the matrix first`);
  const matrix = JSON.parse(readFileSync(trialsPath, "utf8"));
  if (matrix.completed !== EXPECTED_TRIALS) {
    throw new Error(`§31: the matrix has ${matrix.completed} of ${EXPECTED_TRIALS} trials; the frozen comparisons are computed only on a complete matrix`);
  }

  const normalized = matrix.trials.map(normalizeTrial);
  const blocks = pairedStateCheck(normalized);
  const analysis = analyse(normalized, blocks);

  /* -- §3/§6: the amendment record, with the digests re-derived ----------------- */
  /**
   * The freeze record is written ONCE, at freeze time, by the freeze step — it is the artifact that
   * says what was frozen BEFORE the trials. Re-deriving its digests here is useful, but REWRITING it
   * would erase the freeze-time disclosure (for example the note that the amendment was revised during
   * calibration). So this VERIFIES the record instead of replacing it, and fails loudly on a mismatch.
   */
  const freezeRecordPath = join(EVIDENCE, "protocol-amendment-a1.json");
  if (existsSync(freezeRecordPath)) {
    const freeze = JSON.parse(readFileSync(freezeRecordPath, "utf8"));
    if (freeze.amendmentDigest !== amendment.amendmentDigest) {
      throw new Error(
        `the amendment changed after it was frozen: the freeze record says ${freeze.amendmentDigest}, the document now digests to ${amendment.amendmentDigest}. ` +
          "A frozen amendment must not be edited; append a new amendment instead.",
      );
    }
    if (freeze.parentProtocolDigest !== amendment.parentProtocolDigest) {
      throw new Error(`the parent protocol digest changed after freeze: ${freeze.parentProtocolDigest} -> ${amendment.parentProtocolDigest}`);
    }
    process.stdout.write("verified protocol-amendment-a1.json (freeze record matches the document)\n");
  } else {
    throw new Error(`no freeze record at ${freezeRecordPath}; the amendment must be frozen before the matrix runs`);
  }

  /* -- §29: the calibration record --------------------------------------------- */
  const calibrationPath = join(CALIBRATION_RIG, "calibration.json");
  if (existsSync(calibrationPath)) write("calibration/calibration.json", JSON.parse(readFileSync(calibrationPath, "utf8")));

  /* -- §29: the primary record -------------------------------------------------- */
  write("primary/trials.json", { schemaVersion: 1, expected: matrix.expected, completed: matrix.completed, trials: matrix.trials });
  write("primary/paired-state-blocks.json", { schemaVersion: 1, blocks });

  /* -- §29: normalized results + analysis -------------------------------------- */
  write("normalized-results.json", { schemaVersion: 1, stage: "R1-R", trials: normalized });
  write("analysis.json", {
    schemaVersion: 1,
    stage: "R1-R",
    protocolDigest: amendment.parentProtocolDigest,
    amendmentDigest: amendment.amendmentDigest,
    blockOrdering: JSON.parse(readFileSync(join(RIG, "plan.json"), "utf8")).blockOrder.map((block) => ({ block: block.block, order: block.order })),
    trialsPlanned: EXPECTED_TRIALS,
    trialsAccounted: matrix.completed,
    pairedStateBlocks: blocks.length,
    confoundedBlocks: analysis.confoundedBlocks,
    excludedTrials: analysis.excludedTrialCount,
    usableTrials: analysis.usableTrialCount,
    scenarios: analysis.scenarios,
    totals: analysis.totals,
    verdict: analysis.verdict,
    verdictBasis: {
      allPrimaryScenariosShowDirectionalBenefit: analysis.allDirectional,
      atLeastOnePrimaryScenarioShowsDirectionalBenefit: analysis.someDirectional,
      atLeastOnePrimaryScenarioShowsC2OverC1WithProcedurePull: analysis.someC2OverC1,
      anyHostFailureInUsableTrials: analysis.anyHostFailure,
    },
    criteriaSource: "docs/engineering/R1-PROTOCOL-AMENDMENT-A1.md §6 and R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md §6, applied unchanged",
  });

  process.stdout.write(`\nR1-R VERDICT: R1 STOCHASTIC WORKER COMPOUNDING: ${analysis.verdict}\n`);
  for (const [scenario, data] of Object.entries(analysis.scenarios)) {
    process.stdout.write(`  ${scenario}: C0 final ${data.conditions.C0.finalSolved} recur ${data.conditions.C0.knownFailureRecurred} | C1 final ${data.conditions.C1.finalSolved} recur ${data.conditions.C1.knownFailureRecurred} | C2 final ${data.conditions.C2.finalSolved} recur ${data.conditions.C2.knownFailureRecurred} procPulled ${data.conditions.C2.procedurePulled}\n`);
  }
  process.exit(0);
}

await main();
