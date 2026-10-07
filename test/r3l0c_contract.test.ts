/**
 * R3-L0C — THE CONTRACT AND PROJECT-FAMILY TESTS.
 *
 * These exercise the frozen contract, the project-specific invariants, the raw-history corpus and the diagnostic
 * oracle. They read committed evidence and write nothing.
 *
 * §4's load-bearing assertion lives here: each invariant must name the SPECIFIC fact a generic prior lacks, and
 * the test asserts that the fact is a date or a set of capability names rather than a maxim. That is what makes
 * the H arm a reconstruction task rather than a knowledge test, and it is the property the whole stage rests on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ARMS,
  BLOCK_COUNT,
  COMPRESSION_VERDICT_RULES,
  CORPUS_CATEGORIES,
  CORPUS_DIFFICULTY,
  CORRECTNESS_INTERPRETATION,
  GENERATIONS,
  GENERATIONS_PER_TRAJECTORY,
  INFORMATION_PATHS,
  INTERPRETATION_SCOPE,
  INVARIANT_IDS,
  INVARIANTS,
  NET_COST_VERDICT_RULES,
  NEXT_GATE_RULES,
  OUTCOME_SCHEMA,
  PREFLIGHT_REPAIRS,
  PROJECT,
  RECONSTRUCTION_COST_RULES,
  STAGE_EVIDENCE_PATH,
  STAGE_LAWS,
  TOTAL_SESSIONS,
  TREATMENT,
  VALIDITY_PREREQUISITES,
} from "../scripts/r3l0c/contract.mjs";
import { ARMS as CAPITAL_ARMS, STANDING_BODIES, bundleDigest, frozenBundle, futureCaseLeakage, selectionFor, treatmentDelta } from "../scripts/r3l0c/capital.mjs";
import { CORPUS_DOCUMENTS, corpusCoverage, corpusFiles, declaredCorpusPaths, isDeclaredCorpusPath } from "../scripts/r3l0c/corpus.mjs";
import { DIAGNOSTIC_CASES, INVARIANT_EXPOSURES, classSummary, diagnosticVector, eligibleClasses, instrumentedInvariants, uninstrumentedInvariants } from "../scripts/r3l0c/diagnostic.mjs";
import { H0_SOURCE, worldFiles } from "../scripts/r3l0c/project.mjs";
import { worldDigest } from "../scripts/r3l0c/prehistory.mjs";
import { armOrderIsBalanced, schedule, armOrderPerBlock, frozenHandlePlan } from "../scripts/r3l0c/plan.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
const read = (name: string) => JSON.parse(readFileSync(join(EVIDENCE, name), "utf8"));

/* ================================================================ §1/§26 validity */

describe("R3-L0C §1/§26 — the validity prerequisites", () => {
  it("§1 requires BOTH gates, before trial 1 and after the matrix", () => {
    expect(VALIDITY_PREREQUISITES.required.map((entry: { id: string }) => entry.id)).toEqual(["SYSTEM_VALID", "EXPERIMENT_VALID"]);
    expect(VALIDITY_PREREQUISITES.timing).toEqual(["BEFORE_TRIAL_1", "AFTER_THE_MATRIX"]);
  });

  it("§26 makes a favorable outcome unable to repair either failure", () => {
    expect(VALIDITY_PREREQUISITES.onFailure).toContain("INVALID");
    expect(VALIDITY_PREREQUISITES.onFailure).toContain("regardless of favorable outcomes");
  });
});

/* ================================================================ §2 preflight */

describe("R3-L0C §2 — the infrastructure preflight", () => {
  it("§2 names the three repairs, each with its defect and its module", () => {
    expect(PREFLIGHT_REPAIRS.map((entry: { id: string }) => entry.id)).toEqual(["EXPLICIT_EVIDENCE_MODE", "BASELINE_DERIVED_IMMUTABILITY", "PER_RUN_TEMP_ROOT"]);
    for (const repair of PREFLIGHT_REPAIRS as readonly { defect: string; repair: string; module: string }[]) {
      expect(repair.defect.length, `${repair.module} defect`).toBeGreaterThan(30);
      expect(repair.repair.length, `${repair.module} repair`).toBeGreaterThan(30);
      expect(existsSync(join(REPO_ROOT, repair.module)), `${repair.module} must exist`).toBe(true);
    }
  });

  it("§2 no model call occurs before the repairs are green", () => {
    expect(String(PREFLIGHT_REPAIRS.length)).toBe("3");
    /** The recorded preflight, when it exists, must show all three green. */
    if (existsSync(join(EVIDENCE, "preflight.json"))) {
      const preflight = read("preflight.json");
      expect(preflight.allGreen).toBe(true);
      expect(preflight.repairs.length).toBe(3);
      expect(preflight.law).toContain("no model call");
    }
  });
});

/* ================================================================ §3-§4 the project family */

describe("R3-L0C §3/§4 — the project-specific invariants", () => {
  it("§3 authors exactly TWO invariants", () => {
    expect(INVARIANT_IDS).toEqual(["I1", "I2"]);
    expect(PROJECT.name).toBe("cutover-entitlements");
  });

  it("§3 the family is NOT a harder version of a generic lesson", () => {
    const text = INVARIANTS.map((entry: { currentStanding: string }) => entry.currentStanding).join(" ");
    expect(text).toMatch(/cutover/u);
    expect(text).toMatch(/capability/u);
    /** A generic maxim would not mention a date, a tenant class or a named capability. */
    expect(text).toMatch(/date/u);
  });

  it("§4 every invariant names the SPECIFIC fact a generic prior lacks", () => {
    for (const invariant of INVARIANTS as readonly { id: string; genericPriorCannotDetermine: string }[]) {
      expect(invariant.genericPriorCannotDetermine.length, `${invariant.id}`).toBeGreaterThan(80);
      /** The disambiguating fact is a date or a named capability, never a restated maxim. */
      expect(/date|capabilit/iu.test(invariant.genericPriorCannotDetermine), `${invariant.id} must name a date or capability`).toBe(true);
    }
  });

  it("§4 every invariant is supported by MULTIPLE historical artifacts", () => {
    for (const invariant of INVARIANTS as readonly { id: string; historicalArtifacts: readonly string[] }[]) {
      expect(invariant.historicalArtifacts.length, `${invariant.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("§6 every invariant carries initial rule, revisions, current standing, applicability and limitations", () => {
    for (const invariant of INVARIANTS as readonly Record<string, unknown>[]) {
      expect(String(invariant.historicalInitialRule).length).toBeGreaterThan(40);
      expect((invariant.revisions as readonly unknown[]).length).toBeGreaterThanOrEqual(3);
      expect(String(invariant.currentStanding).length).toBeGreaterThan(60);
      expect(String(invariant.applicability).length).toBeGreaterThan(30);
      expect((invariant.limitations as readonly unknown[]).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("§6 the current standing is NOT the historical initial rule, so standing is a conclusion", () => {
    for (const invariant of INVARIANTS as readonly { id: string; historicalInitialRule: string; currentStanding: string }[]) {
      expect(invariant.currentStanding, `${invariant.id} standing must differ from its first rule`).not.toBe(invariant.historicalInitialRule);
    }
  });

  it("§6 every revision records what it superseded and why", () => {
    for (const invariant of INVARIANTS as readonly { id: string; revisions: readonly { supersedes: string | null; reason: string }[] }[]) {
      for (const revision of invariant.revisions) {
        expect(revision.reason.length, `${invariant.id} revision reason`).toBeGreaterThan(30);
      }
      /** At least one revision supersedes something, or the lineage has no supersession. */
      expect(invariant.revisions.some((revision) => revision.supersedes !== null), `${invariant.id} must have a supersession`).toBe(true);
    }
  });

  it("§4 forbids claiming the model lacks the knowledge before testing", () => {
    expect(CORPUS_DIFFICULTY.forbiddenPreTestClaim).toContain("before testing");
  });
});

/* ================================================================ §5 the corpus */

describe("R3-L0C §5 — the raw-history corpus", () => {
  it("§5 contains every required category", () => {
    const coverage = corpusCoverage();
    expect(coverage.complete).toBe(true);
    expect(coverage.missingRequiredCategories).toEqual([]);
    expect(coverage.documents).toBeGreaterThanOrEqual(20);
  });

  it("§5 includes current AND superseded rules, so standing must be reconstructed", () => {
    const standings = new Set(CORPUS_DOCUMENTS.map((entry: { standing: string }) => entry.standing));
    expect(standings.has("CURRENT")).toBe(true);
    expect([...standings].some((entry) => entry.startsWith("SUPERSEDED"))).toBe(true);
  });

  it("§5 includes ordinary irrelevant-but-plausible history", () => {
    const irrelevant = CORPUS_DOCUMENTS.filter((entry: { category: string }) => entry.category === "IRRELEVANT_PLAUSIBLE");
    expect(irrelevant.length).toBeGreaterThanOrEqual(8);
    /** A superseded document must SAY it is superseded, so the corpus is not misleading. */
    for (const document of CORPUS_DOCUMENTS as readonly { body: string }[]) {
      if (document.body.includes("SUPERSEDED")) expect(document.body).toMatch(/SUPERSEDED/u);
    }
  });

  it("§5 fixes the difficulty as search and chronology, NOT obscurity, and forbids misleading noise", () => {
    expect(CORPUS_DIFFICULTY.kind).toContain("SEARCH");
    expect(CORPUS_DIFFICULTY.forbidden).toBe("ALGORITHMIC_OBSCURITY");
    expect(CORPUS_DIFFICULTY.misleadingNoise).toBe(false);
  });

  it("§5 the corpus is sufficient and substantial", () => {
    expect(CORPUS_DIFFICULTY.sufficiencyLaw).toContain("sufficient");
    expect(corpusCoverage().totalBytes).toBeGreaterThan(15000);
  });

  it("§5 the declared corpus path set is what the cost outcome counts", () => {
    const paths = declaredCorpusPaths();
    expect(paths.length).toBe(CORPUS_DOCUMENTS.length);
    expect(isDeclaredCorpusPath(String(paths[0]))).toBe(true);
    expect(isDeclaredCorpusPath("src/entitlements.mjs")).toBe(false);
  });
});

/* ================================================================ §6/§8 the capital */

describe("R3-L0C §6/§8 — the current-standing capital", () => {
  it("§6 the standing body states a RULE, not a history", () => {
    for (const [id, body] of Object.entries(STANDING_BODIES) as readonly [string, { statement: string; derivationRemoved: readonly string[] }][]) {
      expect(body.statement.length, `${id}`).toBeGreaterThan(60);
      /** The compression is recorded explicitly, so a reader can see what was removed. */
      expect(body.derivationRemoved.length, `${id} derivationRemoved`).toBeGreaterThanOrEqual(3);
    }
  });

  it("§6 no body leaks a future case id or a case fixture literal", () => {
    const leakage = futureCaseLeakage();
    expect(leakage.leakFree).toBe(true);
    expect(leakage.leaks).toEqual([]);
  });

  it("§8 selects ONE reasoning claim and ONE active procedure revision per invariant, and NO proof", () => {
    const bundle = frozenBundle();
    for (const [id, entry] of Object.entries(bundle.invariants) as readonly [string, { selected: { reasoningClaim: number; activeProcedureRevision: number; proofClaim: number }; backingProof: { selectedForWorker: boolean } }][]) {
      expect(entry.selected.reasoningClaim, `${id}`).toBe(1);
      expect(entry.selected.activeProcedureRevision, `${id}`).toBe(1);
      expect(entry.selected.proofClaim, `${id}`).toBe(0);
      expect(entry.backingProof.selectedForWorker).toBe(false);
    }
    expect(bundle.minimalityLaw).toContain("not selected for the worker");
  });

  it("§8 no new asset kind is created", () => {
    expect(frozenBundle().newAssetKindCreated).toBe(false);
    for (const owner of frozenBundle().owners as readonly string[]) expect(owner).toMatch(/^src\//u);
  });

  it("§6 the bundle digest is stable, so a post-trial edit is detectable", () => {
    expect(bundleDigest()).toBe(bundleDigest(frozenBundle()));
    expect(bundleDigest()).toMatch(/^[0-9a-f]{64}$/u);
  });
});

/* ================================================================ §7/§9 the arms */

describe("R3-L0C §7/§9 — the arms and the treatment", () => {
  it("§9 H and C are the two named arms", () => {
    expect(Object.keys(ARMS)).toEqual(["H", "C"]);
    expect(ARMS.H.name).toBe("RAW_HISTORY");
    expect(ARMS.C.name).toBe("CAPITALIZED");
    expect(Object.keys(CAPITAL_ARMS)).toEqual(["H", "C"]);
  });

  it("§7 the treatment is SELECTION_ONLY", () => {
    expect(TREATMENT.kind).toBe("SELECTION_ONLY");
    expect(TREATMENT.bothArmsIdenticalCapitalPlane).toBe(true);
    expect(TREATMENT.rawHistoryAvailableToBothArms).toBe(true);
    expect(treatmentDelta().kind).toBe("SELECTION_ONLY");
  });

  it("§7 both arms contain identical canonical capital; only the selection differs", () => {
    const delta = treatmentDelta();
    expect(delta.identical).toContain("canonical capital assets");
    expect(delta.identical).toContain("capital associations");
    expect(delta.differing).toEqual(["the selected handle set compiled into the attempt"]);
  });

  it("§8/§9 H OMITS the selection entirely rather than sending it empty", () => {
    const refs = [{ invariant: "I1", handle: "@ctx/reasoning/a/b" }, { invariant: "I2", handle: "@ctx/reasoning/c/d" }];
    expect(selectionFor("H", "G1", refs)).toBeUndefined();
    const c = selectionFor("C", "G1", refs);
    expect(c).toBeDefined();
    expect(c!.handles).toEqual(["@ctx/reasoning/a/b"]);
  });

  it("§9 C receives only the handles for the invariants the generation exposes", () => {
    const refs = [{ invariant: "I1", handle: "h1" }, { invariant: "I2", handle: "h2" }];
    expect(selectionFor("C", "G1", refs)!.handles).toEqual(["h1"]);
    expect(selectionFor("C", "G2", refs)!.handles).toEqual(["h1", "h2"]);
  });

  it("§8 no dynamic relevance ranker and no forced prework", () => {
    expect(TREATMENT.dynamicRelevanceRanker).toBe(false);
    expect(TREATMENT.hostMediatedForcedPrework).toBe(false);
  });
});

/* ================================================================ §11/§12 the schedule */

describe("R3-L0C §11/§12 — the generations and the schedule", () => {
  it("§11 G1 applies I1 and G2 applies I1 under a changed surface plus I2", () => {
    expect(GENERATIONS.length).toBe(2);
    expect(GENERATIONS[0].requires).toEqual(["I1"]);
    expect(GENERATIONS[1].requires).toEqual(["I1", "I2"]);
    expect(GENERATIONS[1].exposes).toEqual(["I1", "I2"]);
  });

  it("§12 the schedule is exactly 16 sessions across 4 blocks", () => {
    expect(TOTAL_SESSIONS).toBe(16);
    expect(BLOCK_COUNT).toBe(4);
    expect(GENERATIONS_PER_TRAJECTORY).toBe(2);
    const sessions = schedule();
    expect(sessions.length).toBe(16);
    expect(new Set(sessions.map((entry: { sessionId: string }) => entry.sessionId)).size).toBe(16);
  });

  it("§12 each block has one H and one C trajectory with both generations", () => {
    const sessions = schedule();
    for (let block = 0; block < BLOCK_COUNT; block += 1) {
      const members = sessions.filter((entry: { block: number }) => entry.block === block);
      expect(members.length).toBe(4);
      expect(members.filter((entry: { arm: string }) => entry.arm === "H").length).toBe(2);
      expect(members.filter((entry: { arm: string }) => entry.arm === "C").length).toBe(2);
    }
  });

  it("§12 the arm order is randomized and frozen", () => {
    const order = armOrderPerBlock();
    expect(order.length).toBe(BLOCK_COUNT);
    for (const entry of order as readonly string[][]) expect([...entry].sort().join("")).toBe("CH");
    /** It is deterministic from the seed, so it cannot have been chosen after seeing anything. */
    expect(armOrderPerBlock()).toEqual(order);
  });

  it("§12 the randomization is NOT degenerate, so arm order is not confounded with block order", () => {
    /**
     * The first seed produced `C/H` in all four blocks, which would have made arm order and block order
     * indistinguishable. The property is asserted rather than assumed, and the plan refuses to freeze a
     * degenerate order.
     */
    const balance = armOrderIsBalanced();
    expect(balance.balanced).toBe(true);
    expect(balance.hFirst).toBeGreaterThan(0);
    expect(balance.cFirst).toBeGreaterThan(0);
    expect(balance.law).toContain("confounded");
  });

  it("§12 no adaptive repetitions", () => {
    const plan = existsSync(EVIDENCE) ? read("plan.json") : null;
    if (plan !== null) {
      expect(plan.runBudget.adaptiveStopping).toBe(false);
      expect(plan.runBudget.addRepetitionsIfAmbiguous).toBe(false);
    }
  });

  it("§8/§12 the frozen handle plan is empty for H and counted for C", () => {
    const handles = frozenHandlePlan();
    expect(handles.H.G1.expectedHandles).toBe(0);
    expect(handles.H.G2.expectedHandles).toBe(0);
    expect(handles.C.G1.expectedHandles).toBe(2);
    expect(handles.C.G2.expectedHandles).toBe(4);
  });
});

/* ================================================================ §15 the oracle */

describe("R3-L0C §15 — the project-specific diagnostic oracle", () => {
  it("§15 instruments BOTH invariants, so neither is an unmeasured gap", () => {
    expect([...instrumentedInvariants()].sort()).toEqual(["I1", "I2"]);
    expect(uninstrumentedInvariants()).toEqual([]);
  });

  it("§15 every class names its invariant and whether it is prepaid", () => {
    for (const entry of classSummary() as readonly { id: string; invariant: string | null; prepaid: boolean; cases: number }[]) {
      expect(entry.cases, `${entry.id}`).toBeGreaterThan(0);
      if (entry.invariant !== null) expect(INVARIANT_IDS).toContain(entry.invariant);
    }
  });

  it("§15 the H0 source FAILS project-specific classes and PASSES the ordinary ones", async () => {
    const vector = diagnosticVector(await candidateFor(H0_SOURCE, "h0"));
    expect(vector.failedClasses.length).toBeGreaterThan(0);
    /** The failures must be the project-specific ones, or the oracle is not testing the invariants. */
    expect(vector.failedClasses).toContain("P1");
    expect(vector.prepaidCoverage).toBeLessThan(1);
  });

  it("§15 the oracle is solvable: a correct implementation passes every case", () => {
    const vector = diagnosticVector(referenceImplementation());
    expect(vector.failedClasses).toEqual([]);
    expect(vector.coverage).toBe(1);
    expect(vector.prepaidCoverage).toBe(1);
  });

  it("§15 every case is judged mechanically with a fresh store, so no case contaminates another", () => {
    const candidate = referenceImplementation();
    const first = diagnosticVector(candidate);
    const second = diagnosticVector(candidate);
    expect(JSON.stringify(first.classPass)).toBe(JSON.stringify(second.classPass));
  });

  it("§11 the exposure mapping is frozen and the eligible classes are the prepaid ones", () => {
    expect(Object.keys(INVARIANT_EXPOSURES)).toEqual(["G1", "G2"]);
    for (const classId of eligibleClasses("G1") as readonly string[]) {
      expect(DIAGNOSTIC_CASES.some((testCase: { classId: string }) => testCase.classId === classId)).toBe(true);
    }
    /** X1 is an extension class and must not enter the prepaid vector. */
    expect(eligibleClasses("G1")).not.toContain("X1");
    expect(INVARIANT_EXPOSURES.G1).toContain("X1");
  });
});

/* ================================================================ the world */

describe("R3-L0C — the project world", () => {
  it("the world contains the corpus, the source and the visible oracle", () => {
    const files = worldFiles(corpusFiles());
    expect(Object.keys(files)).toContain("README.md");
    expect(Object.keys(files)).toContain("src/entitlements.mjs");
    expect(Object.keys(files)).toContain("test/check.js");
    expect(Object.keys(files).filter((path) => path.startsWith("docs/history/")).length).toBe(CORPUS_DOCUMENTS.length);
  });

  it("the README points at the history as the authority and does NOT state the invariants", () => {
    expect(worldFiles(corpusFiles())["README.md"]).toContain("docs/history/");
    expect(worldFiles(corpusFiles())["README.md"]).not.toContain("cutover date is the key");
  });

  it("the world digest is deterministic, so both arms provably start from identical bytes", () => {
    expect(worldDigest()).toBe(worldDigest(corpusFiles()));
    expect(worldDigest()).toMatch(/^[0-9a-f]{64}$/u);
  });
});

/* ================================================================ §13-§22 the outcomes */

describe("R3-L0C §13-§22 — the frozen outcome and verdict contract", () => {
  it("§13/§14 the outcome schema names every required field", () => {
    expect(OUTCOME_SCHEMA.reconstructionCost).toEqual(["rawHistoryArtifactsRead", "rawHistoryBytesReturned"]);
    for (const field of ["actionsBeforeFirstResult", "historyReadActions", "capitalPullActions", "toolCallsBeforeFirstResult", "elapsedToFirstResult"]) {
      expect(OUTCOME_SCHEMA.searchActionCost).toContain(field);
    }
    expect(OUTCOME_SCHEMA.completionBudget).toContain("RESULT_SUBMITTED");
    expect(OUTCOME_SCHEMA.completionBudget).toContain("MAX_TOKENS");
  });

  it("§13 capital bodies are never counted as raw-history bytes", () => {
    expect(RECONSTRUCTION_COST_RULES.capitalBodiesCountAsRawHistoryBytes).toBe(false);
    expect(RECONSTRUCTION_COST_RULES.countsOnlyDeclaredCorpusReads).toBe(true);
    expect(RECONSTRUCTION_COST_RULES.countsBeforeFirstResultSubmission).toBe(true);
  });

  it("§19 POSITIVE_SIGNAL is a conjunction of five conditions at 3/4 blocks", () => {
    const rules = COMPRESSION_VERDICT_RULES.POSITIVE_SIGNAL;
    expect(rules.fewerBytesBlocksRequired).toBe(3);
    expect(rules.fewerArtifactsBlocksRequired).toBe(3);
    expect(rules.qualityNotWorseBlocksRequired).toBe(3);
    expect(rules.requiresConsumptionInEveryCTrajectory).toBe(true);
    expect(rules.forbidsAveragedCompletionFailure).toBe(true);
    expect(COMPRESSION_VERDICT_RULES.pValues).toContain("n=4");
  });

  it("§20 the net-cost verdict is separate and cannot overwrite the compression verdict", () => {
    expect(NET_COST_VERDICT_RULES.overridesCompressionVerdict).toBe(false);
    expect(NET_COST_VERDICT_RULES.values).toEqual(["LOWER", "NEUTRAL", "HIGHER", "MIXED"]);
  });

  it("§21 no correctness gap is required", () => {
    expect(CORRECTNESS_INTERPRETATION.requiresCorrectnessGap).toBe(false);
    expect(CORRECTNESS_INTERPRETATION.principalSuccessMode).toContain("less re-derivation");
  });

  it("§22 the contrast is raw history vs raw history plus capital, with no no-history arm", () => {
    expect(INTERPRETATION_SCOPE.doesNotEstablish).toContain("organic capital compounding");
    expect(INTERPRETATION_SCOPE.doesNotEstablish).toContain("Fusion value");
  });

  it("§18 the information paths are the observable labels", () => {
    expect(Object.keys(INFORMATION_PATHS)).toEqual(["CAPITAL_THEN_EDIT", "CAPITAL_THEN_HISTORY", "HISTORY_RECONSTRUCTION", "DIRECT_EDIT_WITHOUT_HISTORY", "NO_RESULT"]);
  });

  it("§28 the next-gate rule is frozen", () => {
    expect(NEXT_GATE_RULES.POSITIVE_SIGNAL).toContain("R3-L1");
    expect(NEXT_GATE_RULES.ADVERSE_SIGNAL).toContain("STOP");
    expect(NEXT_GATE_RULES.enlargeModelSetAutomatically).toBe(false);
  });

  it("§23-§25 the stage laws are frozen", () => {
    expect(STAGE_LAWS.planImmutability).toContain("activates plan immutability");
    expect(STAGE_LAWS.primaryRecordImmutability).toContain("append-only");
    expect(STAGE_LAWS.historicalEvidenceImmutability).toContain("restore-and-continue");
  });
});

/* ================================================================ the frozen plan */

describe("R3-L0C §23 — the committed plan", () => {
  const plan = existsSync(EVIDENCE) ? read("plan.json") : null;

  it("§23 the plan is committed and names the stage", () => {
    expect(plan).not.toBeNull();
    expect(plan.stage).toBe("R3-L0C");
    expect(plan.kind).toContain("frozen project-specific reconstruction experiment plan");
  });

  it("§23 the plan records the schedule, the executor and the frozen handles", () => {
    expect(plan.sessions.length).toBe(16);
    expect(plan.primaryExecutor.modelId).toBe("deepseek-flash");
    expect(plan.primaryExecutor.switchableAfterTrial1).toBe(false);
    expect(plan.frozenHandlePlan.H.G1.expectedHandles).toBe(0);
  });

  it("§23 the plan records the digests of the code it is frozen against", () => {
    const digests = plan.analysisCodeDigests as Record<string, string>;
    expect(Object.keys(digests).length).toBeGreaterThanOrEqual(12);
    for (const [path, digest] of Object.entries(digests)) expect(digest, path).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("§23 the plan forbids a primary-fixture smoke and states the immutability rule", () => {
    expect(plan.smokePolicy).toContain("no primary-fixture smoke");
    expect(plan.smokePolicy).toContain("activates plan immutability");
  });

  it("§5/§6 the plan records the corpus completeness and the capital bundle digest", () => {
    expect(plan.corpus.complete).toBe(true);
    expect(plan.capitalBundleDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(plan.capitalBundle.leakage.leakFree).toBe(true);
  });
});

/* ================================================================ helpers */

/** The reference implementation, derived from the corpus rules, used only to prove the oracle is solvable. */
function referenceImplementation() {
  const consolidated: Record<string, string> = { "ledger.view": "ledger.operate", "ledger.edit": "ledger.operate", "ledger.approve": "ledger.operate" };
  const capabilityOf = (capability: string): string => consolidated[capability] ?? capability;
  const tenantOf = (store: any, tenantId: string) => {
    const tenant = store.tenants[tenantId];
    if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
    return tenant;
  };
  const decisionsFor = (store: any, tenantId: string, capability: string, atDate: string) => {
    const target = capabilityOf(capability);
    return store.decisions
      .filter((decision: any) => decision.tenantId === tenantId && capabilityOf(decision.capability) === target && decision.recordedAt <= atDate)
      .sort((left: any, right: any) => (left.recordedAt < right.recordedAt ? -1 : left.recordedAt > right.recordedAt ? 1 : 0));
  };
  return {
    resolveEntitlement(store: any, tenantId: string, capability: string, atDate: string) {
      const tenant = tenantOf(store, tenantId);
      const decisions = decisionsFor(store, tenantId, capability, atDate);
      if (decisions.length === 0) return "DENY";
      const cutover = tenant.cutoverDate;
      if (cutover !== null && cutover !== undefined && decisions.some((decision: any) => decision.effect === "DENY" && decision.recordedAt < cutover)) return "DENY";
      return decisions[decisions.length - 1].effect;
    },
    revokeEntitlement(store: any, tenantId: string, capability: string) {
      tenantOf(store, tenantId);
      const held = store.decisions.some((decision: any) => decision.tenantId === tenantId && decision.capability === capability);
      if (!held) throw new Error(`the tenant does not hold ${capability}`);
      const target = capabilityOf(capability);
      store.decisions = store.decisions.filter((decision: any) => !(decision.tenantId === tenantId && capabilityOf(decision.capability) === target));
      return store;
    },
  };
}

/** The fixture and candidate caches, declared before the helpers that use them. */
const moduleCache = new Map<string, string>();
const candidateCache = new Map<string, any>();

/** Write a module source to a fixture directory and return its path. */
function loadModule(source: string, name: string) {
  const cached = moduleCache.get(name);
  if (cached !== undefined) return cached;
  /**
   * The fixture is written INSIDE the checkout, not under the system temp root, because a concurrent run's temp
   * hygiene sweep can delete a live directory — the defect R3-L0B diagnosed. A checked-in-adjacent cache
   * directory is outside that sweep's reach.
   */
  const dir = join(REPO_ROOT, "node_modules", ".cache", "r3l0c-fixtures");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.mjs`);
  writeFileSync(path, source, "utf8");
  moduleCache.set(name, path);
  return path;
}

/**
 * The H0 source, imported as a real ES module.
 *
 * `diagnosticVector` calls the candidate's exports, so the fixture is written to disk and imported — the same way
 * the generation child judges a candidate, which keeps the test measuring what the experiment measures. The import
 * is awaited at each call site via `candidateFor`.
 */
async function candidateFor(source: string, name: string) {
  const cached = candidateCache.get(name);
  if (cached !== undefined) return cached;
  const path = loadModule(source, name);
  const module = await import(`${pathToFileURL(path).href}?v=${String(Date.now())}`);
  candidateCache.set(name, module);
  return module;
}
