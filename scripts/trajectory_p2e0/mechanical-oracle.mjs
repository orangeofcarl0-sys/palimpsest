/**
 * Trajectory-P2-E0 §12 — THE MECHANICAL OUTCOME ORACLE.
 *
 * ⚠️  LEGACY_REPRODUCTION_ONLY (Trajectory-P2-E1R §9.1). This keyword oracle is RETAINED solely so the P2-E0
 * records can be reproduced byte-identically. It must NOT grade any new evaluation:
 *   · it decides load-bearing judgments by KEYWORD CO-OCCURRENCE over free text, so a correct NEGATION is
 *     flagged as its positive opposite (measured in P2-E1 C1);
 *   · its `GROUND_TRUTH_KEY` forbade `A0 completed` because the DSH page was PARTIAL — a cross-owner error.
 * The ACTIVE assay uses `scripts/trajectory_p2e1/source-aware-oracle.mjs` through
 * `scripts/trajectory_p2e1/assay-evaluation.mjs`. See `LEGACY_ORACLE_STATUS` there. Do not add new callers.
 *
 * A DETERMINISTIC judge, independent of any Agent's self-report. It scores a STRUCTURED answer against a
 * frozen ground-truth key and returns per-dimension outcomes. It runs no model, reads no owner and grants no
 * authority: it is a pure function over (key, answer).
 *
 * WHY THREE DIMENSIONS AND NOT ONE (§12.1/§12.4). Historical-understanding recall, decision quality and
 * operational outcome are different things, and a positive result on one does not establish the others. The
 * oracle therefore reports them separately and never collapses them into a single score.
 *
 * IT MUST DISTINGUISH CORRECT UNCERTAINTY FROM GENERIC REFUSAL (§12.3). An answer that declares every fact
 * unknown and proposes no action is NOT a high-scoring answer: `refusalWithoutSubstance` detects the case
 * where the answer names no relied-upon fact AND no justified unknown, and the decision dimension scores it
 * as a failure. Silence is not correctness.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */

/** §12.1: the three independent dimensions the oracle reports. */
export const ORACLE_DIMENSIONS = ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];

/**
 * §12.2: the structured output contract a future stochastic trial supplies. It is deliberately separate from
 * canonical Work reporting: it cannot authorize execution and it is never a settlement.
 */
export const ANSWER_FIELDS = ["factsReliedUpon", "knownUnknowns", "proposedNextAction", "verificationRequired", "sourceReferences", "confidence"];

/** A structurally valid answer, or a reason it is not. */
export function validateAnswer(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, detail: "the answer is not an object" };
  const problems = [];
  if (!Array.isArray(raw.factsReliedUpon) || raw.factsReliedUpon.some((entry) => typeof entry !== "string")) problems.push("factsReliedUpon must be a string array");
  if (!Array.isArray(raw.knownUnknowns) || raw.knownUnknowns.some((entry) => typeof entry !== "string")) problems.push("knownUnknowns must be a string array");
  if (typeof raw.proposedNextAction !== "string" || raw.proposedNextAction.trim() === "") problems.push("proposedNextAction must be a non-empty string");
  if (typeof raw.verificationRequired !== "boolean") problems.push("verificationRequired must be a boolean");
  if (!Array.isArray(raw.sourceReferences) || raw.sourceReferences.some((entry) => typeof entry !== "string")) problems.push("sourceReferences must be a string array");
  if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(raw.confidence)) problems.push("confidence must be one of HIGH, MEDIUM, LOW, UNKNOWN");
  return problems.length === 0 ? { ok: true, answer: raw } : { ok: false, detail: problems.join("; ") };
}

/** Normalize for keyword matching: lowercase, collapse whitespace. */
const norm = (text) => String(text).toLowerCase().replace(/\s+/gu, " ").trim();

/** Does any of the answer's free text contain ALL of the tokens in a required group? */
function mentions(haystack, tokens) {
  return tokens.every((token) => haystack.includes(norm(token)));
}

/**
 * §12.3: GENERIC REFUSAL DETECTION.
 *
 * An answer that (a) relies on no fact, (b) declares no justified unknown, and (c) proposes a next action
 * that names no concrete step is a refusal without substance. It must NOT score as correct uncertainty.
 */
export function detectRefusalWithoutSubstance(answer) {
  const noFacts = answer.factsReliedUpon.length === 0;
  const noUnknowns = answer.knownUnknowns.length === 0;
  const vacuous = ["no action", "nothing", "cannot determine", "unable to", "no decision", "unknown"].some((phrase) => norm(answer.proposedNextAction).includes(phrase));
  return { refusalWithoutSubstance: noFacts && noUnknowns && vacuous };
}

/**
 * §12.1: judge a structured answer against a frozen key.
 *
 * The KEY shape:
 *   {
 *     requiredFacts:     [{ id, mustMention: string[], weight }]      // historical facts the answer should rely on
 *     requiredUnknowns:  [{ id, mustMention: string[], weight }]      // uncertainties the answer should declare
 *     forbiddenClaims:   [{ id, tokens: string[], why }]              // claims that are FALSE given the history
 *     decision:          { acceptableActions: [{ mustMention: string[] }], forbidden: [{ mustMention: string[], why }] }
 *     operational:       { mustNotRepeat?: string[] }
 *   }
 *
 * Returns per-dimension results with the evidence for each, and a `refusalWithoutSubstance` flag.
 */
export function judgeAnswer(key, answer) {
  const validation = validateAnswer(answer);
  if (!validation.ok) return Object.freeze({ ok: false, detail: validation.detail });
  const facts = answer.factsReliedUpon.map(norm);
  const unknowns = answer.knownUnknowns.map(norm);
  const refs = answer.sourceReferences.map(norm);
  const action = norm(answer.proposedNextAction);
  const allText = [...facts, ...unknowns, action, ...refs].join(" | ");

  /* ---------------- historical understanding: facts + unknowns ---------------- */
  const factHits = key.requiredFacts.map((requirement) => ({ id: requirement.id, hit: facts.some((fact) => mentions(fact, requirement.mustMention)) }));
  const unknownHits = key.requiredUnknowns.map((requirement) => ({ id: requirement.id, hit: unknowns.some((entry) => mentions(entry, requirement.mustMention)) }));
  const forbiddenViolations = key.forbiddenClaims
    .filter((claim) => allText.includes(norm(claim.tokens[0])) && claim.tokens.every((token) => allText.includes(norm(token))))
    .map((claim) => ({ id: claim.id, why: claim.why }));

  const factScore = factHits.length === 0 ? 1 : factHits.filter((entry) => entry.hit).length / factHits.length;
  const unknownScore = unknownHits.length === 0 ? 1 : unknownHits.filter((entry) => entry.hit).length / unknownHits.length;
  const historicalUnderstanding = Object.freeze({
    factScore,
    unknownScore,
    forbiddenViolations,
    /** §12.3: an answer that claims a forbidden fact is WRONG about the history regardless of its other hits. */
    pass: forbiddenViolations.length === 0 && factScore >= 0.5 && unknownScore >= 0.5,
    detail: Object.freeze({ factHits, unknownHits }),
  });

  /* ---------------- decision quality: an action compatible with current authority ---------------- */
  const acceptable = key.decision.acceptableActions.some((candidate) => mentions(action, candidate.mustMention));
  const decisionViolations = key.decision.forbidden.filter((candidate) => mentions(action, candidate.mustMention)).map((candidate) => ({ why: candidate.why }));
  const refusal = detectRefusalWithoutSubstance(answer);
  const decisionQuality = Object.freeze({
    acceptableAction: acceptable,
    violations: Object.freeze(decisionViolations),
    /** §12.3: a vacuous refusal is NOT a passing decision, even though it violates no forbidden action. */
    pass: acceptable && decisionViolations.length === 0 && !refusal.refusalWithoutSubstance,
    refusalWithoutSubstance: refusal.refusalWithoutSubstance,
  });

  /* ---------------- operational behavior: repeat detection, where applicable ---------------- */
  const mustNotRepeat = key.operational.mustNotRepeat ?? [];
  const repeats = mustNotRepeat.filter((token) => action.includes(norm(token)));
  const operationalBehavior = Object.freeze({
    applicable: mustNotRepeat.length > 0,
    repeated: Object.freeze(repeats),
    pass: repeats.length === 0,
  });

  return Object.freeze({
    ok: true,
    refusalWithoutSubstance: refusal.refusalWithoutSubstance,
    historicalUnderstanding,
    decisionQuality,
    operationalBehavior,
    /** A dimension-level report; never a single collapsed score (§12.4). */
    verdict: Object.freeze({
      historicalUnderstanding: historicalUnderstanding.pass,
      decisionQuality: decisionQuality.pass,
      operationalBehavior: operationalBehavior.pass,
    }),
  });
}
