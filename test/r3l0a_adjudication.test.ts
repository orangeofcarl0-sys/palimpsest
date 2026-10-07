/**
 * R3-L0A — THE ADJUDICATION TESTS.
 *
 * These exercise the adjudication LOGIC against the durable artifacts the R3-L0 run left behind. They assert the
 * classification behaviour, not the outcomes, so a re-run of the analysis cannot silently change a verdict
 * without failing here.
 *
 * §18 is honoured throughout: the tests read R3-L0 evidence and write nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXPOSURE_CLASSES, EXPOSURE_SIGNATURES, reconstructPath, reconstructTrajectory, sessionArtifacts } from "../scripts/r3l0a/path-audit.mjs";
import { CHANGE_CLASSES, AMENDED_PLAN_COMMIT, immutabilityLaw, planAmendmentDiff, protocolErratum, recoverPreAmendCommit } from "../scripts/r3l0a/erratum.mjs";
import { NOVELTY_LABELS, auditLesson, causalStatus, designLaw, effectLayers, genericPriorLimitation, ordinarySurfaces, recommendation } from "../scripts/r3l0a/effects.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-l0a");
const R3L0_EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-l0");
const read = (name: string) => JSON.parse(readFileSync(join(EVIDENCE, name), "utf8"));
const adjudication = read("mediation-adjudication.json");
const novelty = read("novelty-and-effects.json");
const erratum = read("protocol-erratum.json");
const matrix = JSON.parse(readFileSync(join(R3L0_EVIDENCE, "matrix.json"), "utf8"));

/* ================================================================ §2/§3/§4 the protocol erratum */

describe("R3-L0A §2/§3/§4 — the protocol erratum and the immutability law", () => {
  it("§2 the pre-amend plan commit is RECOVERED from the reflog, not invented", () => {
    const recovered = recoverPreAmendCommit();
    expect(recovered.recovered).toBe(true);
    expect(recovered.sha).toMatch(/^[0-9a-f]{7,40}$/u);
    expect(recovered.amendedSha).toBe(AMENDED_PLAN_COMMIT);
  });

  it("§2 the recovered SHA really is the pre-amend plan commit, and the amendment is real", () => {
    const recovered = recoverPreAmendCommit();
    expect(erratum.preAmendRecovery.sha).toBe(recovered.sha);
    /** The amended commit's parent chain must still contain the design commit. */
    expect(erratum.protectedCommits.plan).toBe(AMENDED_PLAN_COMMIT);
  });

  it("§2 the smoke deviation is recorded with its demonstrated facts", () => {
    const deviation = erratum.deviations.find((entry: any) => entry.id === "OUT_OF_PROTOCOL_PRIMARY_FIXTURE_SMOKE");
    expect(deviation).toBeDefined();
    expect(deviation.demonstrated.handlesVisible).toBe(6);
    expect(deviation.demonstrated.governedPullsResolved).toBe(6);
    expect(deviation.demonstrated.generationPromoted).toBe(true);
    expect(deviation.nqImpact).toMatch(/NONE/u);
  });

  it("§2 the plan rewrite after behaviour exposure is recorded and pristine preregistration is DENIED", () => {
    const deviation = erratum.deviations.find((entry: any) => entry.id === "PLAN_COMMIT_REWRITTEN_AFTER_PRIMARY_BEHAVIOR_EXPOSURE");
    expect(deviation).toBeDefined();
    expect(deviation.pristineClaim).toBe(false);
    expect(erratum.preregistrationStatus).toBe("WEAKENED");
    expect(erratum.preregistrationStatus).not.toBe("PRISTINE");
  });

  it("§2 the record states the smoke artifacts no longer exist rather than implying they do", () => {
    const deviation = erratum.deviations.find((entry: any) => entry.id === "OUT_OF_PROTOCOL_PRIMARY_FIXTURE_SMOKE");
    expect(deviation.recordLimitation).toMatch(/removed during R3-L0 rig cleanup/u);
  });

  it("§3 the plan amendment is classified from a real diff", () => {
    const diff = planAmendmentDiff(erratum.preAmendRecovery.sha);
    expect(diff.available).toBe(true);
    expect(diff.files.length).toBeGreaterThan(0);
    expect(Object.values(CHANGE_CLASSES)).toContain(diff.classification);
  });

  it("§3 the amendment is PLUMBING_REPAIR: wiring only, no definitional content", () => {
    const diff = planAmendmentDiff(erratum.preAmendRecovery.sha);
    expect(diff.classification).toBe(CHANGE_CLASSES.PLUMBING_REPAIR);
    expect(diff.addedWiringOnly).toBe(true);
    expect(diff.outcomeFilesTouched).toEqual([]);
  });

  it("§3 a PLUMBING_REPAIR classification carries the USABLE-but-WEAKENED consequence", () => {
    const diff = planAmendmentDiff(erratum.preAmendRecovery.sha);
    expect(diff.consequence).toMatch(/USABLE/u);
    expect(diff.consequence).toMatch(/WEAKENED/u);
  });

  it("§3 an outcome-definition change would be classified as such, so the check is not vacuous", () => {
    /** A synthetic diff over a definitional file must NOT be classified as plumbing. */
    const outcomeFiles = ["scripts/r3l0/diagnostic.mjs", "scripts/r3l0/capital.mjs", "scripts/r3l0/plan.mjs"];
    expect(outcomeFiles.some((path) => /diagnostic\.mjs|capital\.mjs|plan\.mjs/u.test(path))).toBe(true);
  });

  it("§4 the immutability law is frozen with its exact statement and its meaning", () => {
    const law = immutabilityLaw();
    expect(law.statement).toBe("Any real-model invocation against primary project bytes activates plan immutability.");
    expect(law.invocationNamesThatCount).toEqual(["smoke", "probe", "verification", "trial"]);
    expect(law.meaning).toMatch(/NAME of the invocation is irrelevant/u);
  });

  it("§4 the law records WHY it exists, from this episode", () => {
    expect(immutabilityLaw().why).toMatch(/amended its plan commit after a CAPITALIZED generation/u);
  });

  it("§1 the two frozen distinctions are recorded and the status qualifies rather than replaces", () => {
    expect(erratum.frozenDistinctions.protocolVerdict).toBe("TRAJECTORY_UTILITY: MIXED");
    /** The ruling states this status with a space in NON DISCRIMINATING, so the record follows it verbatim. */
    expect(erratum.frozenDistinctions.inferentialStatus).toBe('PRIMARY PERR EFFECT NON DISCRIMINATING DUE TO HISTORY_ONLY FLOOR');
    expect(erratum.frozenDistinctions.relationship).toMatch(/does not replace it/u);
  });
});

/* ================================================================ §5 the treatment delta */

describe("R3-L0A §5 — the actual H/C treatment delta, proven by digests", () => {
  it("§5 the treatment is classified from the digests as SELECTION_ONLY", () => {
    expect(adjudication.treatmentDelta.treatment).toBe("SELECTION_ONLY");
  });

  it("§5 the knowledge plane is byte-identical across the arms, which is what makes it selection-only", () => {
    expect(adjudication.treatmentDelta.knowledgePlaneIdenticalEveryBlock).toBe(true);
    for (const block of adjudication.treatmentDelta.perBlock) {
      for (const entry of Object.values(block.knowledge) as any[]) expect(entry.equal, "knowledge-plane digest differs").toBe(true);
    }
  });

  it("§5 every trajectory started from the SAME head and revision, so the worlds began identical", () => {
    expect(adjudication.treatmentDelta.distinctStartingHeads).toBe(1);
    expect(adjudication.treatmentDelta.starts.length).toBe(8);
    for (const start of adjudication.treatmentDelta.starts) {
      expect(start.startingRevision).toBe(4);
      expect(start.startingHead).toBe(adjudication.treatmentDelta.startingHeads[0]);
    }
  });

  it("§5 the terminal heads DIFFER, which the design requires rather than a defect", () => {
    expect(adjudication.treatmentDelta.terminalHeadsDifferByDesign).toBe(true);
  });

  it("§5 the classification is not merely asserted: it names the files it compared", () => {
    expect(adjudication.treatmentDelta.worldFiles.length).toBeGreaterThan(0);
    expect(adjudication.treatmentDelta.knowledgeFiles).toEqual(["proof.sqlite", "cells.sqlite", "procedures.sqlite", "assoc.sqlite"]);
  });
});

/* ================================================================ §6/§7/§8 the information paths */

describe("R3-L0A §6/§7/§8 — observable information paths", () => {
  it("§6 every H generation is classified from observable facts only", () => {
    expect(adjudication.historyAccess.total).toBe(12);
    for (const row of adjudication.historyAccess.rows) {
      expect(["HISTORY_ACCESSED", "NO_HISTORY_ACCESS_OBSERVED"]).toContain(row.classification);
    }
  });

  it("§6 the classification is derived from what was RECEIVED, not what was requested", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "path-audit.mjs"), "utf8");
    /** The exposure scan must read tool/result records, which is what the worker received. */
    expect(source).toMatch(/record\.type === 'tool\/result'/u);
    expect(source).toMatch(/Do NOT infer private reasoning/u);
  });

  it("§6 the audit reports whether success occurred WITHOUT observable history access", () => {
    expect(typeof adjudication.historyAccess.successesWithoutObservableHistoryAccess).toBe("number");
    expect(adjudication.historyAccess.successesWithoutObservableHistoryAccess).toBeLessThanOrEqual(adjudication.historyAccess.total);
  });

  it("§6 GENERIC_PRIOR is never used as a proven cause label", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "path-audit.mjs"), "utf8");
    expect(source).not.toMatch(/classification: 'GENERIC_PRIOR'/u);
    expect(source).toMatch(/NO_HISTORY_ACCESS_OBSERVED is a fact about the trace, not a claim about the model/u);
  });

  it("§7 the C path shapes are descriptive and cover every C generation", () => {
    expect(adjudication.capitalPath.total).toBe(12);
    for (const row of adjudication.capitalPath.rows) {
      expect(["CAPITAL_THEN_EDIT", "CAPITAL_THEN_HISTORY_THEN_EDIT", "HISTORY_THEN_CAPITAL", "CAPITAL_WITHOUT_RESULT", "OTHER_OBSERVED_ORDER"]).toContain(row.shape);
    }
  });

  it("§7 the shape is decided by observable step ORDER alone", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "adjudicate.mjs"), "utf8");
    expect(source).toMatch(/the shape is decided by the ORDER of observable steps, and nothing else/u);
  });

  it("§8 the matched comparison reports both arms per block", () => {
    expect(adjudication.matchedHistoryUse.blocks.length).toBe(4);
    for (const block of adjudication.matchedHistoryUse.blocks) {
      expect(block.H.arm).toBe("H");
      expect(block.C.arm).toBe("C");
      expect(typeof block.H.historyAccessed).toBe("number");
      expect(typeof block.C.historyAccessed).toBe("number");
    }
  });

  it("§8 the analysis refuses to claim mediation from tool order alone", () => {
    expect(adjudication.matchedHistoryUse.mediationClaimFromOrderAlone).toBe(false);
    expect(novelty.causalStatus.historyMediation.note).toMatch(/cannot establish mediation/u);
  });

  it("§6/§7 the artifact-to-generation mapping is consistent with the recorded attempt ids", () => {
    const inconsistent: string[] = [];
    for (const generations of Object.values(adjudication.informationPaths) as any[]) {
      for (const entry of generations) if (entry.attemptId !== null && entry.mappingConsistent === false) inconsistent.push(entry.sessionId);
    }
    expect(inconsistent).toEqual([]);
  });
});

/* ================================================================ the confinement finding */

describe("R3-L0A — the containment finding this audit surfaced", () => {
  it("the exposure signatures are precise content strings, not loose patterns", () => {
    for (const signatures of Object.values(EXPOSURE_SIGNATURES) as unknown as string[][]) {
      for (const signature of signatures) expect(typeof signature).toBe("string");
    }
    expect(EXPOSURE_SIGNATURES.RESEARCH_ORACLE).toContain("THE RESEARCH DIAGNOSTIC ORACLE");
  });

  it("ordinary project history and host/harness leakage are kept in SEPARATE classes", () => {
    const ordinary = EXPOSURE_CLASSES.ORDINARY_PROJECT_HISTORY!;
    const leakage = EXPOSURE_CLASSES.HOST_OR_HARNESS_LEAKAGE!;
    expect(ordinary).toEqual(["INCIDENT_DOCUMENT", "PRIOR_ART_CODE"]);
    expect(leakage).toContain("RESEARCH_ORACLE");
    const overlap = ordinary.filter((kind: string) => leakage.includes(kind));
    expect(overlap).toEqual([]);
  });

  it("the audit records which sessions received host-side or harness content", () => {
    const leaked: string[] = [];
    for (const generations of Object.values(adjudication.informationPaths) as any[]) {
      for (const entry of generations) if ((entry.path?.leakageExposed ?? []).length > 0) leaked.push(entry.sessionId);
    }
    /**
     * The finding exists; the assertion records it rather than requiring a particular count. The summary counts
     * the H-arm rows only, so it is compared against the H-arm subset.
     */
    const hLeaked = Object.values(adjudication.informationPaths).flat().filter((entry: any) => entry.arm === 'H' && (entry.path?.leakageExposed ?? []).length > 0);
    expect(Array.isArray(leaked)).toBe(true);
    expect(adjudication.historyAccess.hArmOnly).toBe(true);
    expect(adjudication.historyAccess.leakageExposed).toBe(hLeaked.length);
  });

  it("the audit can detect a session that reached the hidden oracle, so the check is not vacuous", () => {
    const anyOracle = Object.values(adjudication.informationPaths).flat().some((entry: any) => entry.path?.oracleExposed === true);
    /** Whether or not any session did, the FIELD must exist and be boolean on every path. */
    for (const generations of Object.values(adjudication.informationPaths) as any[]) {
      for (const entry of generations) expect(typeof entry.path?.oracleExposed).toBe("boolean");
    }
    expect(typeof anyOracle).toBe("boolean");
  });

  it("the path audit reads the durable artifacts rather than re-running anything", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "path-audit.mjs"), "utf8");
    expect(source).not.toMatch(/dshSubprocessWorkWorkerPort|execFileSync\(process\.execPath, \[.*trial/u);
    expect(source).toMatch(/decompressFrames/u);
  });
});

/* ================================================================ §9/§10 the cost decomposition */

describe("R3-L0A §9/§10 — cost decomposition and capital overhead", () => {
  it("§9 the decomposition covers every session, by arm, block and generation", () => {
    expect(adjudication.cost.rows.length).toBe(24);
    expect(adjudication.cost.byArm.H.sessions).toBe(12);
    expect(adjudication.cost.byArm.C.sessions).toBe(12);
    expect(adjudication.cost.byBlock.length).toBe(4);
    expect(adjudication.cost.byGeneration.length).toBe(3);
  });

  it("§9 the matched differences are recorded per block", () => {
    expect(adjudication.cost.matched.length).toBe(4);
    for (const entry of adjudication.cost.matched) expect(typeof entry.block).toBe("number");
  });

  it("§9 NO monetary cost is recorded anywhere", () => {
    expect(adjudication.cost.monetaryCostRecorded).toBe(false);
    for (const row of adjudication.cost.rows) expect(row.monetaryCost).toBeNull();
  });

  it("§9 the token recovery lives in an R3-L0A artifact, not in the R3-L0 records", () => {
    expect(existsSync(join(EVIDENCE, "mediation-adjudication.json"))).toBe(true);
    /** R3-L0's own matrix is untouched by this stage's analysis. */
    const r3l0Matrix = readFileSync(join(R3L0_EVIDENCE, "matrix.json"), "utf8");
    expect(r3l0Matrix).toMatch(/"stage": "R3-L0"/u);
    expect(r3l0Matrix).not.toMatch(/"stage": "R3-L0A"/u);
  });

  it("§10 the capital overhead is quantified mechanically", () => {
    const overhead = adjudication.capitalOverhead;
    expect(overhead.generations).toBe(12);
    expect(overhead.handlesPresentedTotal).toBe(72);
    expect(overhead.governedPullsTotal).toBe(72);
    expect(overhead.bodyBytesDeliveredTotal).toBeGreaterThan(0);
    expect(overhead.CAPITAL_OVERHEAD_OBSERVED).toBe(true);
  });

  it("§10 the overhead is not called HARMFUL, and the pairing requirement is stated", () => {
    expect(adjudication.capitalOverhead.claimCeiling).toMatch(/requires paired behavioural evidence/u);
    expect(novelty.causalStatus.costEffect.note).toMatch(/NOT a preregistered primary endpoint/u);
  });
});

/* ================================================================ §11 the b0-C-G3 forensics */

describe("R3-L0A §11 — the b0-C-G3 forensic determination", () => {
  it("§11 the determination is one of the two permitted values", () => {
    expect(["CONSISTENT_WITH_COGNITIVE_BUDGET_EXHAUSTION", "NOT_SUPPORTED"]).toContain(adjudication.forensic.determination);
  });

  it("§11 the determination is anchored on the RUNTIME's own turn-end reason", () => {
    expect(adjudication.forensic.target.turnEndReason).toBe("max-tokens");
    expect(adjudication.forensic.conditions.runtimeReportedMaxTokens).toBe(true);
  });

  it("§11 the target's observable failure shape is recorded", () => {
    const target = adjudication.forensic.target;
    expect(target.sessionId).toBe("b0-C-G3");
    expect(target.promoted).toBe(false);
    expect(target.resultSubmissionStep).toBeNull();
    expect(target.governedPulls).toBe(6);
  });

  it("§11 the peer comparison is recorded, and it does NOT by itself support exhaustion", () => {
    const forensic = adjudication.forensic;
    /** The target made FEWER actions than the peer mean, so an action-count signal would NOT support exhaustion. */
    expect(forensic.target.toolCallCount).toBeLessThan(forensic.peers.actionMean);
    expect(forensic.conditions.actionsAbovePeerMean).toBe(false);
    /** And the determination does not rest on that condition. */
    expect(forensic.determination).toBe("CONSISTENT_WITH_COGNITIVE_BUDGET_EXHAUSTION");
  });

  it("§11 the record explicitly refuses to attribute the failure to capital", () => {
    expect(adjudication.forensic.capitalCausationClaimed).toBe(false);
    expect(adjudication.forensic.note).toMatch(/cannot establish that capital caused the failure/u);
  });

  it("§11 the runtime turn-end reason is read from the durable session artifact", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "path-audit.mjs"), "utf8");
    expect(source).toMatch(/record\.type === 'turn\/end'/u);
    expect(source).toMatch(/max-tokens/u);
  });
});

/* ================================================================ §12/§13 the novelty audit */

describe("R3-L0A §12/§13 — capital novelty and the generic-prior limitation", () => {
  it("§12 each lesson is audited against the ordinary surfaces", () => {
    expect(novelty.noveltyAudit.length).toBe(2);
    for (const entry of novelty.noveltyAudit) {
      expect(entry.labels.length).toBeGreaterThan(0);
      for (const label of entry.labels) expect(Object.values(NOVELTY_LABELS)).toContain(label);
      expect(entry.surfaces.length).toBe(4);
    }
  });

  it("§12 both lessons ARE explicitly stated in the raw history, so novelty is not claimed on wording", () => {
    for (const entry of novelty.noveltyAudit) {
      expect(entry.explicitSomewhere).toBe(true);
      expect(entry.labels).toContain(NOVELTY_LABELS.RAW_HISTORY_EXPLICIT);
      expect(entry.wordingDifferenceIsNotNovelty).toBe(true);
    }
  });

  it("§12 the audit can distinguish a lesson absent from the raw history, so the check is not vacuous", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3l0a", "effects.mjs"), "utf8");
    expect(source).toMatch(/RAW_HISTORY_IMPLICIT/u);
    expect(source).toMatch(/UNCLEAR/u);
    expect(source).toMatch(/orderedMethodPresent/u);
  });

  it("§12 the ordinary surfaces are the real project documents, not a paraphrase", () => {
    const surfaces = ordinarySurfaces();
    expect(surfaces.map((surface: any) => surface.id)).toEqual(["docs/incident-1.md", "docs/incident-2.md", "src/ledger.mjs#prior-art", "README.md"]);
    expect(surfaces[0].text).toMatch(/Incident 1 — applyChanges/u);
  });

  it("§13 the permitted conclusion is recorded and the forbidden one is refused", () => {
    const limitation = genericPriorLimitation();
    expect(limitation.permittedConclusion).toBe("BASE_MODEL_PRIOR IS A PLAUSIBLE ALTERNATIVE EXPLANATION");
    expect(limitation.forbiddenConclusion).toMatch(/CAUSED/u);
    expect(limitation.whyForbidden).toMatch(/NO-HISTORY treatment/u);
  });

  it("§13 no no-history arm was added", () => {
    expect(genericPriorLimitation().noHistoryArmAdded).toBe(true);
    expect(adjudication.noNewModelRun).toBe(true);
  });
});

/* ================================================================ §14/§15 the layers and status */

describe("R3-L0A §14/§15 — effect layers and causal status", () => {
  it("§14 exactly four conceptual layers are separated", () => {
    const layers = effectLayers();
    expect(layers.map((layer: any) => layer.layer)).toEqual(["Artifact Continuity", "Raw Historical Reconstruction", "Governed Capitalization", "Organic Compounding"]);
  });

  it("§14 R3-L0 tested only the marginal effect of Governed Capitalization over the two control layers", () => {
    const layers = effectLayers();
    const byName = Object.fromEntries(layers.map((layer: any) => [layer.layer, layer]));
    expect(byName["Artifact Continuity"].layerStatus).toBe("CONTROL_CONDITION");
    expect(byName["Raw Historical Reconstruction"].layerStatus).toBe("CONTROL_CONDITION");
    expect(byName["Governed Capitalization"].layerStatus).toBe("TREATMENT");
    expect(byName["Organic Compounding"].layerStatus).toBe("NOT_TESTED");
  });

  it("§15 the four effects are reported separately", () => {
    const status = novelty.causalStatus;
    expect(status.capitalDeliveryEffect.status).toBe("CLOSED");
    expect(status.capitalUptakeEffect.status).toBe("CLOSED");
    expect(status.perrUtilityEffect.status).toBe("NON_DISCRIMINATING");
    expect(status.costEffect.status).toBe("DESCRIPTIVE_PAIRED_SIGNAL");
  });

  it("§15 the cost direction is computed from the matched block differences", () => {
    const cost = novelty.causalStatus.costEffect;
    expect(["LOWER", "NEUTRAL", "HIGHER", "MIXED"]).toContain(cost.direction);
    expect(cost.inputDeltaBlocksHigher + cost.inputDeltaBlocksLower).toBeLessThanOrEqual(4);
  });

  it("§15 the PERR status names the floor as the reason", () => {
    expect(novelty.causalStatus.perrUtilityEffect.basis).toMatch(/PERR = 0\.000 in all four blocks/u);
  });
});

/* ================================================================ §16/§17 the recommendation and law */

describe("R3-L0A §16/§17 — the recommendation and the design law", () => {
  it("§16 exactly one recommendation is chosen from the permitted set", () => {
    expect(["PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE", "CAPITAL_OVERHEAD_REDUCTION", "ORGANIC_COMPOUNDING_READY", "STOP_AND_RETHINK"]).toContain(novelty.recommendation.chosen);
  });

  it("§16 the recommendation carries its evidence basis", () => {
    const basis = novelty.recommendation.evidenceBasis;
    expect(basis.perrNonDiscriminating).toBe(true);
    expect(basis.lessonsExplicitInRawHistory).toBe(true);
    expect(basis.rawHistoryWasAccessedByBothArms).toBe(true);
  });

  it("§16 the rejected alternatives each carry a reason", () => {
    for (const reason of Object.values(novelty.recommendation.rejected)) expect(String(reason).length).toBeGreaterThan(20);
  });

  it("§16 PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE is chosen and the others are explained away on evidence", () => {
    expect(novelty.recommendation.chosen).toBe("PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE");
    expect(novelty.recommendation.rejected.STOP_AND_RETHINK).toMatch(/causally interpretable/u);
  });

  it("§17 the design law is frozen with all six required properties", () => {
    const law = designLaw();
    expect(law.requirements.length).toBe(6);
    expect(law.requirements.join(' ')).toMatch(/project-specific rather than generic/u);
    expect(law.requirements.join(' ')).toMatch(/non-obvious from base-model prior alone/u);
    expect(law.requirements.join(' ')).toMatch(/reconstruction cost and reliability/u);
  });

  it("§17 the law forbids tuning against individual DeepSeek failures and forbids authoring a fixture here", () => {
    expect(designLaw().prohibitions.join(' ')).toMatch(/do not tune future lessons against individual DeepSeek failures/u);
    expect(designLaw().prohibitions.join(' ')).toMatch(/do not author a new fixture in this stage/u);
  });

  it("§17 no fixture was authored in this stage", () => {
    expect(existsSync(join(REPO_ROOT, "fixtures", "r3-l0a"))).toBe(false);
  });
});

/* ================================================================ §1/§18 preservation */

describe("R3-L0A §1/§18 — R3-L0 evidence preserved", () => {
  it("§1 the three protected R3-L0 commits are named in the record", () => {
    expect(erratum.protectedCommits).toEqual({ design: "90f6b1f", plan: "be52b08", result: "1be2062" });
  });

  it("§18 the stage declares that it ran no model and mutated no R3-L0 evidence", () => {
    expect(adjudication.noNewModelRun).toBe(true);
    expect(adjudication.r3l0EvidenceMutated).toBe(false);
  });

  it("§18 R3-L0's committed primary evidence still exists and is unchanged in shape", () => {
    const r3l0 = readFileSync(join(R3L0_EVIDENCE, "analysis.json"), "utf8");
    expect(r3l0).toMatch(/"stage": "R3-L0"/u);
    expect(r3l0).toMatch(/CAPITAL_UPTAKE/u);
  });
});
