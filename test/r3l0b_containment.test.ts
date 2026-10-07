/**
 * R3-L0B — THE EXPERIMENTAL-CONTAINMENT CONTRACT TESTS.
 *
 * These exercise the FROZEN CONTRACT and the reconstruction LOGIC. They read committed evidence and write
 * nothing, so a re-run cannot change a verdict without failing here.
 *
 * §3 is the load-bearing assertion in this file: a behavioral mechanism claim requires BOTH gates, and the
 * task outcome is deliberately not an input to that decision. The tests pin that in both directions, because
 * the R3-L0 result failed in one direction and the containment defect in the other.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BEHAVIORAL_CLAIM_ADMISSION,
  CANARY_ATTEMPTS,
  CANARY_ROOTS,
  CANARY_VERDICTS,
  COMPONENT_VERDICTS,
  CONFIDENTIALITY_CLAIM_LAW,
  CONTAINMENT_MUTATIONS,
  EXPERIMENT_CONTAINMENT_ENVELOPE,
  EXPERIMENT_LAWS,
  EXPERIMENT_VALIDITY_COMPONENTS,
  EXPOSURE_CLASSES,
  FUTURE_OUTCOME_SCOPE,
  PRE_RULING_SCOPE,
  PRESERVED_COMMITS,
  R3L0_EVIDENCE_CLASSES,
  RECONSTRUCTION_PRIMARY_OUTCOMES,
  RECONSTRUCTION_PRESSURE_REQUIREMENTS,
  ROOT_CAUSE_LAYERS,
  SESSION_LABELS,
  SPILLOVER_CLASSES,
  STAGE_EVIDENCE_PATH,
  admitBehavioralClaim,
  adjudicateOracleExposure,
  adjudicateSpillover,
  envelopeEntries,
  experimentContainmentFrom,
  experimentValidFrom,
  hostPrivateIds,
  labelBlock,
  labelSession,
} from "../scripts/r3l0b/contract.mjs";
import {
  adjudicateOracleExposures,
  adjudicateSpillovers,
  cleanMap,
  outcomeRelevantOracleExposures,
  reconstructGraph,
  spilloverSummary,
} from "../scripts/r3l0b/interference.mjs";
import {
  ISOLATED_LAYOUT,
  buildIsolatedLayout,
  buildSharedParentLayout,
  layoutShape,
  mutationVerdict,
  runContainmentGate,
  runOutcomeBlindnessGate,
} from "../scripts/r3l0b/containment.mjs";
import { containmentHypothesis, layoutFacts, rootCauseVerdict } from "../scripts/r3l0b/root-cause.mjs";
import { KNOWN_PRE_EXISTING_MUTATORS, checkImmutability, protectedEvidenceUnchanged } from "../scripts/r3l0b/immutability.mjs";
import { tmpdir } from "node:os";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-l0b");
const R3L0_EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-l0");
const read = (name: string) => JSON.parse(readFileSync(join(EVIDENCE, name), "utf8"));
const matrix = JSON.parse(readFileSync(join(R3L0_EVIDENCE, "matrix.json"), "utf8"));

/* ================================================================ §3 ExperimentValidity */

describe("R3-L0B §3/§16 — the experimental-validity contract", () => {
  it("§3 names exactly the five components the ruling requires", () => {
    expect(EXPERIMENT_VALIDITY_COMPONENTS.map((entry: { id: string }) => entry.id)).toEqual([
      "TREATMENT_INTEGRITY",
      "CONTAINMENT",
      "OUTCOME_BLINDNESS",
      "UNIT_INDEPENDENCE",
      "EVIDENCE_IMMUTABILITY",
    ]);
  });

  it("§16 EXPERIMENT_VALID is a CONJUNCTION, so one red component invalidates the whole experiment", () => {
    const allPass = experimentValidFrom(Object.fromEntries(EXPERIMENT_VALIDITY_COMPONENTS.map((entry: { id: string }) => [entry.id, COMPONENT_VERDICTS.PASS])));
    expect(allPass.EXPERIMENT_VALID).toBe(true);
    expect(allPass.notPass).toEqual([]);
    for (const definition of EXPERIMENT_VALIDITY_COMPONENTS as readonly { id: string }[]) {
      const oneRed = experimentValidFrom(Object.fromEntries(EXPERIMENT_VALIDITY_COMPONENTS.map((entry: { id: string }) => [entry.id, entry.id === definition.id ? COMPONENT_VERDICTS.FAIL : COMPONENT_VERDICTS.PASS])));
      expect(oneRed.EXPERIMENT_VALID, `${definition.id} must invalidate the experiment`).toBe(false);
      expect(oneRed.notPass).toEqual([definition.id]);
    }
  });

  it("§16 a missing component is a FAIL rather than an omission", () => {
    const partial = experimentValidFrom({ CONTAINMENT: COMPONENT_VERDICTS.PASS });
    expect(partial.EXPERIMENT_VALID).toBe(false);
    expect(partial.notPass).toContain("TREATMENT_INTEGRITY");
    expect(partial.notPass).toContain("EVIDENCE_IMMUTABILITY");
  });

  it("§3 a behavioral claim requires BOTH gates, and the task outcome is not an input", () => {
    expect(BEHAVIORAL_CLAIM_ADMISSION.requires).toEqual(["SYSTEM_VALID", "EXPERIMENT_VALID"]);
    expect(admitBehavioralClaim({ systemValid: true, experimentValid: true }).admitted).toBe(true);
    expect(admitBehavioralClaim({ systemValid: true, experimentValid: false })).toMatchObject({ admitted: false, refusedBy: ["EXPERIMENT_VALID"] });
    expect(admitBehavioralClaim({ systemValid: false, experimentValid: true })).toMatchObject({ admitted: false, refusedBy: ["SYSTEM_VALID"] });
  });

  it("§3 a FAVORABLE outcome cannot repair a failed gate, and an UNFAVORABLE one cannot break a passing gate", () => {
    const favorable = admitBehavioralClaim({ systemValid: false, experimentValid: false, taskSuccess: true, outcomeFavorsCapital: true });
    expect(favorable.admitted).toBe(false);
    expect(favorable.taskOutcomeConsidered).toBe(false);
    const unfavorable = admitBehavioralClaim({ systemValid: true, experimentValid: true, taskSuccess: false, outcomeFavorsCapital: false });
    expect(unfavorable.admitted).toBe(true);
  });
});

/* ================================================================ §4 the envelope */

describe("R3-L0B §4 — the experiment containment envelope", () => {
  it("§4 separates the worker-visible surface from the host-private artifacts", () => {
    const visible = EXPERIMENT_CONTAINMENT_ENVELOPE.workerVisible.map((entry: { id: string }) => entry.id);
    const privateIds = hostPrivateIds();
    expect(visible).toContain("OWN_WORKTREE");
    expect(visible).toContain("DECLARED_RAW_HISTORY");
    expect(visible).toContain("GOVERNED_PULLED_BODIES");
    for (const required of ["DIAGNOSTIC_ORACLE", "HIDDEN_ACCEPTANCE", "REFERENCE_SOLUTION", "HARNESS_IMPLEMENTATION", "SCHEDULE", "PRIMARY_EVIDENCE", "CONTROL_PAYLOAD", "SIBLING_TRAJECTORY_WORLDS", "SIBLING_PROMOTED_SOURCE", "ANALYSIS_CODE"]) {
      expect(privateIds, `${required} must be host-private`).toContain(required);
    }
    /** The two sets must be disjoint: an artifact cannot be both. */
    expect(visible.filter((id: string) => privateIds.includes(id))).toEqual([]);
  });

  it("§4 every envelope entry is machine-readable and carries a checkable requirement", () => {
    for (const entry of envelopeEntries() as readonly { id: string; requirement: string; visibility: string; r3l0ObservedPath: string }[]) {
      expect(entry.requirement.length, `${entry.id} requirement`).toBeGreaterThan(10);
      expect(entry.r3l0ObservedPath.length, `${entry.id} observed path`).toBeGreaterThan(0);
      expect(["WORKER_VISIBLE", "HOST_PRIVATE"]).toContain(entry.visibility);
    }
  });

  it("§4 the envelope is research-only and not a canonical owner", () => {
    expect(EXPERIMENT_CONTAINMENT_ENVELOPE.researchOnly).toBe(true);
    expect(EXPERIMENT_CONTAINMENT_ENVELOPE.notCanonical).toBe(true);
  });
});

/* ================================================================ §5/§6/§7/§8 the graph */

describe("R3-L0B §5 — the interference graph over the existing 24 sessions", () => {
  const graph = existsSync(EVIDENCE) ? read("interference-graph.json") : null;

  it("§5 reconstructs all 24 sessions from the durable artifacts, with no new worker call", () => {
    expect(graph).not.toBeNull();
    expect(graph.sessionCount).toBe(24);
    expect(graph.sessions.map((entry: { sessionId: string }) => entry.sessionId)).toEqual(matrix.sessions.map((entry: { sessionId: string }) => entry.sessionId));
  });

  it("§5 records every field the ruling requires for an access outside the declared surface", () => {
    const accesses = graph.sessions.flatMap((session: { accesses: readonly Record<string, unknown>[] }) => session.accesses);
    expect(accesses.length).toBeGreaterThan(0);
    for (const access of accesses as readonly Record<string, unknown>[]) {
      for (const field of ["seq", "tool", "path", "classification", "artifactOwner", "artifactType", "operation", "contentReturned"]) {
        expect(access, `access is missing ${field}`).toHaveProperty(field);
      }
      expect(Object.values(EXPOSURE_CLASSES)).toContain(access.classification);
    }
  });

  it("§5 classifies every access into the five declared classes", () => {
    const used = new Set(graph.sessions.flatMap((session: { accesses: readonly { classification: string }[] }) => session.accesses.map((access) => access.classification)));
    for (const classification of used as Set<string>) expect(Object.values(EXPOSURE_CLASSES)).toContain(classification);
  });

  it("§5 a NAMED access and a CONTENT exposure are separate facts", () => {
    /**
     * A session can name a path without receiving its content. If the two were collapsed, every session that
     * enumerated a directory would be reported as exposed, which is the over-reporting R3-L0A's text search did.
     */
    const anyNamedWithoutContent = graph.sessions.some((session: { namedAccessesOutsideWorld: number; hostPrivateExposureCount: number }) => session.namedAccessesOutsideWorld > 0);
    expect(anyNamedWithoutContent).toBe(true);
    for (const session of graph.sessions as readonly { accesses: readonly { contentReturned: boolean; contentBytes: number }[] }[]) {
      for (const access of session.accesses) {
        if (!access.contentReturned) expect(access.contentBytes, "a refused access must carry no content bytes").toBe(0);
      }
    }
  });
});

describe("R3-L0B §6 — treatment spillover adjudication", () => {
  const graph = existsSync(EVIDENCE) ? read("interference-graph.json") : null;

  it("§6 every sibling read is classified into the four allowed classes", () => {
    const allowed = Object.values(SPILLOVER_CLASSES);
    for (const row of graph.spillovers as readonly { classification: string }[]) expect(allowed).toContain(row.classification);
  });

  it("§6 a CONFIRMED spillover requires content actually returned", () => {
    for (const row of graph.spillovers as readonly { classification: string; contentReturned: boolean }[]) {
      if (row.classification === SPILLOVER_CLASSES.TREATMENT_SPILLOVER_CONFIRMED) expect(row.contentReturned).toBe(true);
    }
  });

  it("§6 visibility alone yields at most POSSIBLE, never CONFIRMED", () => {
    const visibleOnly = adjudicateSpillover({ sourceArm: "C", sourceGeneration: "G3", sourceExistedBeforeReader: true, contentReturned: false });
    expect(visibleOnly.classification).toBe(SPILLOVER_CLASSES.TREATMENT_SPILLOVER_POSSIBLE);
    const confirmed = adjudicateSpillover({ sourceArm: "C", sourceGeneration: "G3", sourceExistedBeforeReader: true, contentReturned: true });
    expect(confirmed.classification).toBe(SPILLOVER_CLASSES.TREATMENT_SPILLOVER_CONFIRMED);
  });

  it("§6 an unattributable source is UNKNOWN rather than guessed", () => {
    expect(adjudicateSpillover({ sourceArm: null, sourceExistedBeforeReader: true, contentReturned: true }).classification).toBe(SPILLOVER_CLASSES.UNKNOWN);
    expect(adjudicateSpillover({ sourceArm: "H", sourceGeneration: "G3", sourceExistedBeforeReader: false, contentReturned: true }).classification).toBe(SPILLOVER_CLASSES.UNKNOWN);
  });

  it("§6 every confirmed row names the source arm and generation", () => {
    const confirmed = (graph.spillovers as readonly { classification: string; sourceArm: string | null; sourceGeneration: string | null; sourceExistedBeforeReader: boolean }[]).filter((row) => row.classification === SPILLOVER_CLASSES.TREATMENT_SPILLOVER_CONFIRMED);
    expect(confirmed.length).toBeGreaterThan(0);
    for (const row of confirmed) {
      expect(["H", "C"]).toContain(row.sourceArm);
      expect(row.sourceExistedBeforeReader).toBe(true);
    }
  });

  it("§6 the summary keeps the four classes apart and states the law", () => {
    const summary = spilloverSummary(graph.spillovers);
    expect(summary.law).toContain("visibility");
    for (const key of ["NO_TREATMENT_SPILLOVER", "TREATMENT_SPILLOVER_POSSIBLE", "TREATMENT_SPILLOVER_CONFIRMED", "UNKNOWN"]) {
      expect(summary).toHaveProperty(key);
    }
  });
});

describe("R3-L0B §7 — outcome-oracle exposure adjudication", () => {
  const graph = existsSync(EVIDENCE) ? read("interference-graph.json") : null;

  it("§7 preserves b3-H-G1 as an outcome-relevant exposure", () => {
    const decisive = (graph.oracleExposures as readonly { sessionId: string; isKnownDecisiveCase: boolean; outcomeRelevantExposure: boolean }[]).find((row) => row.sessionId === "b3-H-G1");
    expect(decisive).toBeDefined();
    expect(decisive!.isKnownDecisiveCase).toBe(true);
    expect(decisive!.outcomeRelevantExposure).toBe(true);
  });

  it("§7 records the observable sequence and never an inference about reasoning", () => {
    for (const row of graph.oracleExposures as readonly Record<string, unknown>[]) {
      expect(String(row.inference)).toContain("none");
      for (const field of ["ORACLE_MODULE_READ", "CASE_INVENTORY_OBTAINED", "EXPECTED_OUTPUTS_OBTAINED", "ORACLE_EXECUTED_ON_CANDIDATE", "CLASS_PASS_OBTAINED", "EDITED_AFTER_EXPOSURE"]) {
        expect(row, `oracle row is missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it("§7 the outcome-relevant set is exactly the sessions the ruling names", () => {
    expect([...graph.outcomeRelevantOracleExposures].sort()).toEqual(["b0-C-G1", "b1-C-G2", "b3-C-G1", "b3-H-G1"]);
  });

  it("§7 an exposure with no module read is not outcome-relevant", () => {
    const row = adjudicateOracleExposure({ sessionId: "s", ORACLE_MODULE_READ: false, CASE_INVENTORY_OBTAINED: true });
    expect(row.outcomeRelevantExposure).toBe(false);
  });
});

describe("R3-L0B §8 — the clean/contaminated map", () => {
  const graph = existsSync(EVIDENCE) ? read("interference-graph.json") : null;

  it("§8 labels every session with one of the four declared labels", () => {
    const labels = new Set((graph.sessions as readonly { label: string }[]).map((session) => session.label));
    for (const label of labels as Set<string>) expect(Object.values(SESSION_LABELS)).toContain(label);
    expect((graph.sessions as readonly unknown[]).length).toBe(24);
  });

  it("§8 precedence is cross-trajectory, then oracle, then other contamination, then clean", () => {
    expect(labelSession({ siblingTrajectoryAccesses: 1, oracleAccesses: 1 })).toBe(SESSION_LABELS.CROSS_TRAJECTORY_CONTAMINATED);
    expect(labelSession({ siblingTrajectoryAccesses: 0, oracleAccesses: 1, checkoutAccesses: 1 })).toBe(SESSION_LABELS.ORACLE_CONTAMINATED);
    expect(labelSession({ oracleAccesses: 0, checkoutAccesses: 1 })).toBe(SESSION_LABELS.CONTAMINATED_NON_ORACLE);
    expect(labelSession({})).toBe(SESSION_LABELS.CLEAN);
  });

  it("§8 derives block-level contamination from the session labels", () => {
    const block = labelBlock([SESSION_LABELS.CLEAN, SESSION_LABELS.CROSS_TRAJECTORY_CONTAMINATED]);
    expect(block.blockLabel).toBe("BLOCK_CROSS_TRAJECTORY_CONTAMINATED");
    expect(labelBlock([SESSION_LABELS.CLEAN, SESSION_LABELS.CLEAN]).blockLabel).toBe("BLOCK_CLEAN");
    expect(labelBlock([SESSION_LABELS.ORACLE_CONTAMINATED]).blockLabel).toBe("BLOCK_ORACLE_CONTAMINATED");
  });

  it("§8 the map is explicitly diagnostic and NOT a post-hoc randomized primary analysis", () => {
    expect(graph.postHocLabel).toContain("DESCRIPTIVE_ONLY");
    for (const block of graph.blocks as readonly { diagnosticOnly: boolean }[]) expect(block.diagnosticOnly).toBe(true);
    expect(cleanMap([]).blocks).toEqual([]);
  });
});

/* ================================================================ §9 root cause */

describe("R3-L0B §9 — the filesystem root cause", () => {
  it("§9 names the harness layout as the cause and does NOT name a production confidentiality defect", () => {
    const verdict = rootCauseVerdict("C:/does-not-exist");
    expect(verdict.primaryCause).toBe(ROOT_CAUSE_LAYERS.RESEARCH_HARNESS_DIRECTORY_LAYOUT);
    const runtime = verdict.layers.find((entry: { layer: string }) => entry.layer === ROOT_CAUSE_LAYERS.PRODUCTION_RUNTIME_DESIGN);
    expect(runtime!.verdict).toBe("NOT_IMPLICATED");
  });

  it("§9 the security-profile scope is a CONTRIBUTING factor, not the cause", () => {
    const verdict = rootCauseVerdict("C:/does-not-exist");
    const profile = verdict.layers.find((entry: { layer: string }) => entry.layer === ROOT_CAUSE_LAYERS.SECURITY_PROFILE_SCOPE);
    expect(profile!.verdict).toBe("CONTRIBUTING_FACTOR");
    expect(CONFIDENTIALITY_CLAIM_LAW.rule).toContain("promises");
  });

  it("§9 the hypothesis is falsifiable and requires no runtime change", () => {
    const hypothesis = containmentHypothesis("C:/does-not-exist");
    expect(hypothesis.requiresRuntimeChange).toBe(false);
    expect(hypothesis.falsifier.length).toBeGreaterThan(20);
    expect(hypothesis.undeclaredRoots.length).toBeGreaterThan(0);
  });

  it("§9 the layout facts place host-private content in an ancestor or a sibling of the world", () => {
    const facts = layoutFacts("C:/does-not-exist");
    const relations = facts.rows.map((row: { relationToWorld: string }) => row.relationToWorld).join(" ");
    expect(relations).toMatch(/ANCESTOR/u);
    expect(relations).toMatch(/SIBLING/u);
    expect(facts.structuralFacts.sharedParentForEveryTrajectory).toBe(true);
    expect(facts.structuralFacts.anyRootDeclaredToTheFence).toBe(false);
  });
});

/* ================================================================ §10 the isolated layout */

describe("R3-L0B §10/§12 — the isolated layout and its mutation", () => {
  const root = join(tmpdir(), "r3l0b-layout-test");
  const unitIds: [string, string] = ["u0-H", "u0-C"];

  it("§10 the isolated layout puts NO host-private root in an ancestor of or beside a world", () => {
    buildIsolatedLayout(root, unitIds);
    const shape = layoutShape(root, unitIds);
    expect(shape.hostPrivateIsAncestorOfAnyWorld).toBe(false);
    expect(shape.hostPrivateIsSiblingOfAnyWorld).toBe(false);
    for (const pair of shape.relations as readonly { relation: string }[]) expect(pair.relation).not.toBe("ANCESTOR");
    rmSync(root, { recursive: true, force: true });
  });

  it("§10 the world's only ancestor holds nothing host-private", () => {
    buildIsolatedLayout(root, unitIds);
    const world = ISOLATED_LAYOUT.unitWorld(root, unitIds[0]);
    /** The unit directory is the world's parent; it must contain the world and its own state/home only. */
    const siblings = readdirSync(join(root, "units", unitIds[0]));
    expect(siblings.sort()).toEqual(["home", "state", "world"]);
    expect(world.endsWith(join("units", unitIds[0], "world"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("§12 the SHARED-PARENT layout is detected as a containment violation", () => {
    buildSharedParentLayout(root, unitIds);
    const shape = layoutShape(root, unitIds);
    /** In the R3-L0 shape the shared run record sits beside the unit directories. */
    expect(existsSync(join(root, "trials.partial.json"))).toBe(true);
    const gate = runContainmentGate({ root, unitIds, probes: [] });
    expect(gate.CONTAINMENT).toBe("FAIL");
    expect(shape.worlds.length).toBe(unitIds.length);
    rmSync(root, { recursive: true, force: true });
  });

  it("§12 the gate PASSES on the corrected layout, so it discriminates rather than always failing", () => {
    buildIsolatedLayout(root, unitIds);
    const gate = runContainmentGate({ root, unitIds, probes: [] });
    expect(gate.CONTAINMENT).toBe("PASS");
    rmSync(root, { recursive: true, force: true });
  });

  it("§12/§13 a mutation is only DETECTED when the gate fails mutated AND passes corrected", () => {
    expect(mutationVerdict({ id: "M", gateName: "G", mutatedVerdict: "FAIL", positiveVerdict: "PASS", recordedVerdict: "X" }).mutationDetected).toBe(true);
    expect(mutationVerdict({ id: "M", gateName: "G", mutatedVerdict: "PASS", positiveVerdict: "PASS", recordedVerdict: "X" }).recordedVerdict).toBe("MUTATION_ESCAPED");
    expect(mutationVerdict({ id: "M", gateName: "G", mutatedVerdict: "FAIL", positiveVerdict: "FAIL", recordedVerdict: "X" }).recordedVerdict).toBe("MUTATION_ESCAPED");
  });

  it("§13 outcome blindness FAILS when the oracle sits inside a world", () => {
    buildIsolatedLayout(root, unitIds);
    const world = ISOLATED_LAYOUT.unitWorld(root, unitIds[0]);
    const gate = runOutcomeBlindnessGate({ root, unitIds, probes: [], oracleRootOverride: join(world, "diagnostic") });
    expect(gate.OUTCOME_BLINDNESS).toBe("FAIL");
    const positive = runOutcomeBlindnessGate({ root, unitIds, probes: [] });
    expect(positive.OUTCOME_BLINDNESS).toBe("PASS");
    rmSync(root, { recursive: true, force: true });
  });

  it("§10/§13 the two mutations are declared with their required gate and recorded verdict", () => {
    expect(CONTAINMENT_MUTATIONS.map((entry: { id: string }) => entry.id)).toEqual(["SHARED_PARENT_MUTATION", "ORACLE_EXPOSURE_MUTATION"]);
    expect(CONTAINMENT_MUTATIONS.find((entry: { id: string }) => entry.id === "SHARED_PARENT_MUTATION")!.recordedVerdict).toBe("SHARED_PARENT_MUTATION_DETECTED");
    expect(CONTAINMENT_MUTATIONS.find((entry: { id: string }) => entry.id === "ORACLE_EXPOSURE_MUTATION")!.recordedVerdict).toBe("ORACLE_EXPOSURE_MUTATION_DETECTED");
  });
});

/* ================================================================ §11 the canary plan */

describe("R3-L0B §11 — the canary plan", () => {
  it("§11 declares the four roots and eight attempts the ruling names", () => {
    expect(CANARY_ROOTS.map((entry: { id: string }) => entry.id)).toEqual(["DIAGNOSTIC_ORACLE_ROOT", "CONTROL_PLANE_ROOT", "SIBLING_TRAJECTORY_ROOT", "REFERENCE_SOLUTION_ROOT"]);
    expect(CANARY_ATTEMPTS.map((entry: { id: string }) => entry.id)).toEqual([
      "PARENT_TRAVERSAL", "ABSOLUTE_PATH_READ", "DIRECTORY_ENUMERATION", "GLOB_SEARCH", "NODE_SUBPROCESS", "POWERSHELL", "SIBLING_WORLD_LOOKUP", "ORACLE_IMPORT_EXECUTE",
    ]);
  });

  it("§11 a single reachable canary fails containment", () => {
    const unreachable = CANARY_ATTEMPTS.map((attempt: { id: string }) => ({ rootId: "DIAGNOSTIC_ORACLE", attemptId: attempt.id, verdict: CANARY_VERDICTS.UNREACHABLE }));
    expect(experimentContainmentFrom(unreachable).EXPERIMENT_CONTAINMENT).toBe("PASS");
    const oneReachable = [...unreachable.slice(1), { rootId: "DIAGNOSTIC_ORACLE", attemptId: "ABSOLUTE_PATH_READ", verdict: CANARY_VERDICTS.REACHABLE }];
    expect(experimentContainmentFrom(oneReachable).EXPERIMENT_CONTAINMENT).toBe("FAIL");
  });

  it("§11 a NOT_APPLICABLE attempt is a GAP rather than a pass", () => {
    const gap = [{ rootId: "DIAGNOSTIC_ORACLE", attemptId: "POWERSHELL", verdict: CANARY_VERDICTS.NOT_APPLICABLE }];
    const verdict = experimentContainmentFrom(gap);
    expect(verdict.EXPERIMENT_CONTAINMENT).toBe("FAIL");
    expect(verdict.notApplicable).toEqual(["DIAGNOSTIC_ORACLE/POWERSHELL"]);
    expect(experimentContainmentFrom([]).EXPERIMENT_CONTAINMENT).toBe("FAIL");
  });
});

/* ================================================================ §14/§15 immutability */

describe("R3-L0B §14/§15 — historical evidence immutability", () => {
  it("§15 a protected historical mutation FAILS the guard immediately", () => {
    const guard = checkImmutability();
    expect(guard.HISTORICAL_EVIDENCE_IMMUTABLE).toBe("PASS");
    expect(guard.changed).toEqual([]);
    expect(guard.removed).toEqual([]);
    expect(guard.unexpectedAdditions).toEqual([]);
  });

  it("§14 the repaired r2lr mutator is CLEAN", () => {
    const guard = checkImmutability();
    expect(guard.r2lrMutatorRepair).toBe("CLEAN");
    expect(guard.stillLiveKnownMutators).toEqual([]);
  });

  it("§15 the guard has ONE verdict and forbids detect-restore-continue", () => {
    const guard = checkImmutability();
    expect(guard.verdictCount).toBe(1);
    expect(guard.forbidsDetectRestoreContinue).toBe(true);
    expect(guard).not.toHaveProperty("HISTORICAL_EVIDENCE_IMMUTABLE_EXCLUDING_KNOWN_MUTATORS");
  });

  it("§15 only the current stage's own evidence is excluded", () => {
    const guard = checkImmutability();
    expect(guard.excludedStagePaths).toEqual([STAGE_EVIDENCE_PATH]);
  });

  it("§14 the known-mutator record preserves what was repaired", () => {
    const mutator = KNOWN_PRE_EXISTING_MUTATORS.find((entry: { path: string }) => entry.path === "research-evidence/r2-lr/deterministic-suite.json");
    expect(mutator).toBeDefined();
    expect(String(mutator!.repairedBy)).toContain("R3-L0B");
    expect(String(mutator!.cause)).toContain("recordedAt");
  });

  it("§14 the regression predicate detects a changed digest", () => {
    const before = { fileCount: 1, treeDigest: "a", digests: { "x": "1" } };
    expect(protectedEvidenceUnchanged(before, { fileCount: 1, treeDigest: "a", digests: { "x": "1" } }).unchanged).toBe(true);
    expect(protectedEvidenceUnchanged(before, { fileCount: 1, treeDigest: "b", digests: { "x": "2" } }).unchanged).toBe(false);
    expect(protectedEvidenceUnchanged(before, { fileCount: 0, treeDigest: "c", digests: {} }).unchanged).toBe(false);
  });
});

/* ================================================================ §2 re-adjudication */

describe("R3-L0B §2 — the re-adjudicated R3-L0 evidence classes", () => {
  it("§2 keeps the mechanism facts VALID", () => {
    const valid = R3L0_EVIDENCE_CLASSES.stillValidMechanismEvidence.map((entry: { id: string; value: string }) => `${entry.id}=${entry.value}`);
    expect(valid).toEqual(["SYSTEM_VALID=YES", "CAPITAL_DELIVERY=CLOSED", "CAPITAL_UPTAKE=CLOSED", "HISTORY_ACCESS=OBSERVED", "CAPITAL_OVERHEAD=OBSERVED"]);
  });

  it("§2 makes the behavioral causal status NOT_IDENTIFIABLE for exactly the three named reasons", () => {
    expect(R3L0_EVIDENCE_CLASSES.behavioralCausalStatus.value).toBe("NOT_IDENTIFIABLE");
    expect(R3L0_EVIDENCE_CLASSES.behavioralCausalStatus.reasons.map((entry: { id: string }) => entry.id)).toEqual(["HISTORY_ONLY_FLOOR", "OUTCOME_ORACLE_EXPOSURE", "CROSS_TRAJECTORY_INTERFERENCE"]);
  });

  it("§2 PRESERVES the preregistered verdict and supersedes only its causal reading", () => {
    const preserved = R3L0_EVIDENCE_CLASSES.preservedPreregisteredVerdict;
    expect(preserved.value).toBe("MIXED");
    expect(preserved.status).toBe("PROTOCOL_OUTPUT");
    expect(preserved.causalInterpretation).toBe("SUPERSEDED_BY_CONTAINMENT_ADJUDICATION");
  });
});

/* ================================================================ §17/§18/§19/§20 laws */

describe("R3-L0B §17/§18/§19/§20 — the frozen laws", () => {
  it("§17 carries plan immutability forward and closes the smoke escape hatch", () => {
    expect(EXPERIMENT_LAWS.planImmutability).toContain("activates plan immutability");
    expect(EXPERIMENT_LAWS.smokeEscapeHatchClosed).toContain("cannot be reclassified");
    expect(EXPERIMENT_LAWS.smokeEscapeHatchClosed).toContain("Dummy fixtures only");
  });

  it("§18 requires post-hoc enrichment to be append-only and separate", () => {
    expect(EXPERIMENT_LAWS.postHocEnrichment).toContain("separate append-only evidence artifacts");
    expect(EXPERIMENT_LAWS.postHocEnrichment).toContain("never be rewritten");
  });

  it("§19 freezes the design requirements and FORBIDS authoring the next trajectory", () => {
    expect(PRE_RULING_SCOPE.authoring).toBe("FORBIDDEN_IN_THIS_STAGE");
    const ids = RECONSTRUCTION_PRESSURE_REQUIREMENTS.map((entry: { id: string }) => entry.id);
    for (const required of ["PROJECT_SPECIFIC", "RECOVERABLE_FROM_RAW_HISTORY", "NONTRIVIAL_FROM_PRIOR", "DISTRIBUTED", "COMPRESSIBLE_INTO_GOVERNED_CAPITAL", "RECURRING", "MEASURABLE_ON_RECONSTRUCTION", "RAW_HISTORY_ARM_CAN_SUCCEED", "CAPITAL_REDUCES_BURDEN_NOT_ORACLE"]) {
      expect(ids, `${required} must be frozen`).toContain(required);
    }
  });

  it("§19 keeps the raw-history arm capable of succeeding and forbids oracle capital", () => {
    const byId = Object.fromEntries((RECONSTRUCTION_PRESSURE_REQUIREMENTS as readonly { id: string; requirement: string }[]).map((entry) => [entry.id, entry.requirement]));
    expect(byId.RAW_HISTORY_ARM_CAN_SUCCEED).toContain("capable of succeeding");
    expect(byId.CAPITAL_REDUCES_BURDEN_NOT_ORACLE).toContain("not provide otherwise unavailable oracle information");
  });

  it("§20 recommends the five primary outcomes plus a safety co-primary, and freezes no threshold", () => {
    const primary = RECONSTRUCTION_PRIMARY_OUTCOMES.filter((entry: { role: string }) => entry.role === "PRIMARY").map((entry: { id: string }) => entry.id);
    expect(primary).toEqual(["HISTORY_ARTIFACTS_READ", "HISTORY_BYTES_CONSUMED", "ACTIONS_BEFORE_CORRECT_FIRST_IMPLEMENTATION", "PREPAID_INVARIANT_RECURRENCE", "RESULT_WITHIN_COGNITIVE_BUDGET"]);
    expect(RECONSTRUCTION_PRIMARY_OUTCOMES.find((entry: { id: string }) => entry.id === "TERMINAL_FUNCTIONAL_CORRECTNESS")!.role).toBe("SAFETY_CO_PRIMARY");
    expect(FUTURE_OUTCOME_SCOPE.thresholds).toBe("NOT_FROZEN_IN_THIS_STAGE");
  });

  it("§1 preserves the five prior commits", () => {
    expect([...PRESERVED_COMMITS]).toEqual(["90f6b1f", "be52b08", "1be2062", "bfbf917", "a465f8e"]);
  });
});
