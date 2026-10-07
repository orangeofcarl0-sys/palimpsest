/**
 * R3-S0 — THE FROZEN CONTRACT TESTS (COMMIT 1).
 *
 * These assert the systemic contract itself, before any scenario or mutation runs. They are deliberately
 * written to FAIL against a contract that drifts, and they cover the law, the truth layers, the
 * consumer-boundary law, the lineages, the loop-matrix plan, the preregistered mutations and the witness
 * schema.
 *
 * The two audit gates (S1 graph audit, durable event audit) are exercised here as well, so a red audit is a
 * red test rather than a gate nobody runs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BYPASS_CHECKS,
  BYPASS_CLAIM,
  CONSTITUTIONAL_LAW,
  CONSUMER_BOUNDARY_LAW,
  CROSS_LOOP_SCENARIOS,
  DURABLE_EVENT_FAMILIES,
  EVENT_DEFECT_FLAGS,
  FORBIDDEN_INFERENCES,
  HISTORICAL_DEFECTS,
  LINEAGES,
  LOOP_MATRIX_PLAN,
  MATRIX_CELLS,
  MATRIX_PATHS,
  MECHANISM_WITNESS_CHAIN,
  MUTATION_VERDICTS,
  PREREGISTERED_MUTATIONS,
  SYSTEMIC_CONTRACT,
  SYSTEM_VALID_CATEGORIES,
  TRUTH_LAYERS,
  WITNESS_VERDICTS,
  authorityBearingNodes,
  inferenceForbidden,
  judgeWitness,
  lineagePath,
  ownedNodes,
  projectScopedNodes,
  systemValid,
} from "../scripts/r3s0/contract.mjs";
import { EVIDENCE_DIGEST_KINDS, PROJECT_BEHAVIOR_TRACE_FIELDS, makeBypassWitness, makeEvidenceClosure, makeMechanismWitness, makeProjectBehaviorTrace, traceCoverage } from "../scripts/r3s0/trace.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const runGate = (script: string): string =>
  execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r3s0", script)], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

/* ================================================================ §Constitutional law */

describe("R3-S0 §Constitutional law — frozen before execution", () => {
  it("§Constitutional law both laws are frozen with their exact statements", () => {
    expect(CONSTITUTIONAL_LAW.taskSuccessIsNotSystemCorrectness.statement).toBe("Task Success != System Correctness");
    expect(CONSTITUTIONAL_LAW.outcomeCannotRepairMechanism.statement).toBe("Outcome Success Cannot Repair an Invalid Mechanism Trace");
  });

  it("§Constitutional law a task PASS may not support a mechanism claim while the system is invalid", () => {
    /** The consequence must state BOTH halves: no mechanism claim, and the behavioral experiment is the thing withheld. */
    const consequence = CONSTITUTIONAL_LAW.taskSuccessIsNotSystemCorrectness.consequence;
    expect(consequence).toMatch(/support a mechanism claim/u);
    expect(consequence).toMatch(/SYSTEM_VALID/u);
    expect(CONSTITUTIONAL_LAW.outcomeCannotRepairMechanism.consequence).toMatch(/regardless of Y/u);
  });
});

/* ================================================================ §Truth layers */

describe("R3-S0 §Truth layers — four separate layers, no forbidden inference", () => {
  it("§Truth layers exactly four layers are declared with the four symbols", () => {
    expect(Object.keys(TRUTH_LAYERS)).toEqual(["CANONICAL_TRUTH", "RUNTIME_TRUTH", "EVIDENCE_TRUTH", "BEHAVIORAL_OUTCOME"]);
    expect(TRUTH_LAYERS.CANONICAL_TRUTH.symbol).toBe("G_C");
    expect(TRUTH_LAYERS.RUNTIME_TRUTH.symbol).toBe("G_R");
    expect(TRUTH_LAYERS.EVIDENCE_TRUTH.symbol).toBe("G_E");
    expect(TRUTH_LAYERS.BEHAVIORAL_OUTCOME.symbol).toBe("Y");
  });

  it("§Truth layers Y may not be used to infer the correctness of G_C or G_R", () => {
    expect(TRUTH_LAYERS.CANONICAL_TRUTH.mustNotBeInferredFrom).toContain("BEHAVIORAL_OUTCOME");
    expect(TRUTH_LAYERS.RUNTIME_TRUTH.mustNotBeInferredFrom).toContain("BEHAVIORAL_OUTCOME");
    expect(inferenceForbidden("BEHAVIORAL_OUTCOME", "CANONICAL_TRUTH")).toBe(true);
    expect(inferenceForbidden("BEHAVIORAL_OUTCOME", "RUNTIME_TRUTH")).toBe(true);
  });

  it("§Truth layers the forbidden inferences are data, so a report cannot quietly drop one", () => {
    expect(FORBIDDEN_INFERENCES.length).toBeGreaterThanOrEqual(4);
    for (const entry of FORBIDDEN_INFERENCES) {
      expect(entry.from).toBeTruthy();
      expect(entry.to).toBeTruthy();
      expect(entry.why.length).toBeGreaterThan(10);
    }
  });

  it("§Truth layers the runtime graph may not be used to infer canonical truth", () => {
    expect(inferenceForbidden("RUNTIME_TRUTH", "CANONICAL_TRUTH")).toBe(true);
  });
});

/* ================================================================ §Consumer-boundary law */

describe("R3-S0 §Consumer-boundary law — the authoritative observation boundary", () => {
  it("§Consumer-boundary law the law is frozen with its exact statement", () => {
    expect(CONSUMER_BOUNDARY_LAW.statement).toBe("Consumer Boundary Is the Authoritative Observation Boundary");
  });

  it("§Consumer-boundary law all four mechanisms from the ruling are present with a consumer-side requirement", () => {
    const mechanisms = CONSUMER_BOUNDARY_LAW.rules.map((rule: any) => rule.mechanism);
    expect(mechanisms).toEqual(["CONTEXT_DELIVERY", "PROMOTION", "ADOPTION", "INTENT_EVOLUTION"]);
    for (const rule of CONSUMER_BOUNDARY_LAW.rules) {
      expect(rule.insufficient.length).toBeGreaterThan(10);
      expect(rule.required.length).toBeGreaterThan(10);
      expect(rule.observationPoint.length).toBeGreaterThan(5);
    }
  });

  it("§Consumer-boundary law context delivery is proven from the consumer, not from producer intent", () => {
    const rule = CONSUMER_BOUNDARY_LAW.rules.find((entry: any) => entry.mechanism === "CONTEXT_DELIVERY");
    expect(rule.insufficient).toMatch(/producer intent/u);
    expect(rule.required).toMatch(/consumer-visible/u);
  });

  it("§Consumer-boundary law promotion is proven from canonical state, not from a function call", () => {
    const rule = CONSUMER_BOUNDARY_LAW.rules.find((entry: any) => entry.mechanism === "PROMOTION");
    expect(rule.insufficient).toMatch(/function invocation/u);
    expect(rule.required).toMatch(/canonical/u);
  });

  it("§Consumer-boundary law adoption is proven from local state and future use, not remote fulfillment", () => {
    const rule = CONSUMER_BOUNDARY_LAW.rules.find((entry: any) => entry.mechanism === "ADOPTION");
    expect(rule.insufficient).toMatch(/remote fulfillment alone/u);
    expect(rule.required).toMatch(/future use|later local Work/u);
  });

  it("§Consumer-boundary law intent evolution is proven from future Work, not from approval alone", () => {
    const rule = CONSUMER_BOUNDARY_LAW.rules.find((entry: any) => entry.mechanism === "INTENT_EVOLUTION");
    expect(rule.insufficient).toMatch(/proposal approval alone/u);
    expect(rule.required).toMatch(/future Work/u);
  });
});

/* ================================================================ §Canonical lineages */

describe("R3-S0 §Canonical graph — the four lineages are frozen and shaped", () => {
  it("§Canonical graph audit exactly four lineages exist", () => {
    expect(Object.keys(LINEAGES)).toEqual(["WORK", "KNOWLEDGE", "COLLABORATION", "EVOLUTION"]);
  });

  it("§Canonical graph audit the Work lineage is the required ordered path", () => {
    expect(lineagePath("WORK")).toEqual(["Project", "Work", "Attempt", "Result", "Verification", "Promotion", "ProjectWorld"]);
  });

  it("§Canonical graph audit the Knowledge lineage is the required ordered path", () => {
    expect(lineagePath("KNOWLEDGE")).toEqual(["CognitiveCandidate", "Admission", "AssetRevision", "ProjectAssetAssociation", "FutureSelection"]);
  });

  it("§Canonical graph audit the Collaboration lineage carries its ground and the required ordered path", () => {
    const path = lineagePath("COLLABORATION");
    /** The ruling's path, plus the real ground node the code requires. */
    expect(path).toContain("ProjectReality");
    expect(path.indexOf("ProjectReality")).toBeLessThan(path.indexOf("Need"));
    expect(path).toContain("LocalAdoption");
    expect(path.indexOf("Fulfillment")).toBeLessThan(path.indexOf("LocalAdoption"));
    expect(path.indexOf("LocalAdoption")).toBeLessThan(path.indexOf("LocalContinuation"));
  });

  it("§Canonical graph audit the Evolution lineage orders the receipt after the authority decision", () => {
    const path = lineagePath("EVOLUTION");
    expect(path.indexOf("AuthorityDecision")).toBeLessThan(path.indexOf("RevisionReceipt"));
    expect(path.indexOf("RevisionReceipt")).toBeLessThan(path.indexOf("FutureWork"));
  });

  it("§Canonical graph audit every node names an owner and its real identifiers", () => {
    for (const node of ownedNodes()) {
      expect(node.owner, `${node.lineage}/${node.node}`).toBeTruthy();
      expect(node.implementedBy.length, `${node.lineage}/${node.node}`).toBeGreaterThan(0);
      expect(typeof node.projectScoped).toBe("boolean");
    }
  });

  it("§Canonical graph audit the concepts with NO implementing type say so explicitly", () => {
    /** SovereignRemoteWorkRef, LocalAdoption and LocalContinuation are conceptual: the absence IS the mechanism. */
    const collaboration = LINEAGES.COLLABORATION.nodes;
    for (const name of ["SovereignRemoteWorkRef", "LocalAdoption", "LocalContinuation"]) {
      const node = collaboration.find((entry: any) => entry.node === name);
      expect(node, name).toBeDefined();
      expect(node.note).toMatch(/NO such type exists/u);
    }
  });

  it("§Canonical graph audit the authority-bearing nodes name a mechanism, not a vague phrase", () => {
    const nodes = authorityBearingNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(8);
    for (const node of nodes) expect(String(node.requiredAuthority).length).toBeGreaterThan(15);
  });

  it("§Canonical graph audit unscoped nodes are the capital planes, and each states why", () => {
    const unscoped = ownedNodes().filter((node) => node.projectScoped !== true);
    expect(unscoped.length).toBeGreaterThan(0);
    for (const node of unscoped) expect(node.note).toMatch(/non-canonical|durable|revisioned|per-owner|selection|DECISION|type/iu);
    expect(projectScopedNodes().length).toBeGreaterThan(unscoped.length);
  });
});

/* ================================================================ §Durable event families */

describe("R3-S0 §Event / producer-consumer audit — families and the four flags", () => {
  it("§Event audit the four defect flags the ruling names are declared", () => {
    expect(Object.keys(EVENT_DEFECT_FLAGS)).toEqual(["WRITE_ONLY_EVENT", "UNCONSUMED_RECEIPT", "CONSUMER_WITHOUT_OWNER", "ORPHANED_RUNTIME_PROJECTION"]);
  });

  it("§Event audit every family declares owner, producer, consumer, retry and restart survival", () => {
    expect(DURABLE_EVENT_FAMILIES.length).toBeGreaterThanOrEqual(6);
    for (const family of DURABLE_EVENT_FAMILIES) {
      expect(family.canonicalOwner, family.family).toBeTruthy();
      expect(family.producer, family.family).toBeTruthy();
      expect(family.consumer, family.family).toBeTruthy();
      expect(family.retry, family.family).toBeTruthy();
      expect(typeof family.survivesRestart, family.family).toBe("boolean");
      expect(Array.isArray(family.flags), family.family).toBe(true);
    }
  });

  it("§Event audit no declared family carries a defect flag", () => {
    for (const family of DURABLE_EVENT_FAMILIES) expect(family.flags, family.family).toEqual([]);
  });

  it("§Event audit the orchestration family covers the whole canonical registry", () => {
    const ledger = DURABLE_EVENT_FAMILIES.find((family: any) => family.family === "ORCHESTRATION_LEDGER");
    expect(ledger.eventTypes.length).toBe(37);
  });
});

/* ================================================================ §Loop conformance matrix */

describe("R3-S0 §Loop conformance matrix — the plan is frozen before execution", () => {
  it("§Loop conformance matrix the six paths from the ruling are declared", () => {
    expect(MATRIX_PATHS.map((path: any) => path.id)).toEqual(["happy", "rejection", "stale", "crash", "coldRestart", "nextGeneration"]);
  });

  it("§Loop conformance matrix the four allowed cells are exactly the four", () => {
    expect(Object.values(MATRIX_CELLS)).toEqual(["PASS", "FAIL", "NOT_APPLICABLE", "NOT_EXERCISED"]);
  });

  it("§Loop conformance matrix every loop declares which paths apply and why any does not", () => {
    for (const loopId of ["WORK", "KNOWLEDGE", "COLLABORATION", "EVOLUTION"]) {
      const plan = LOOP_MATRIX_PLAN[loopId as keyof typeof LOOP_MATRIX_PLAN];
      expect(plan, loopId).toBeDefined();
      expect(plan.applies.length, loopId).toBeGreaterThan(0);
      const covered = new Set([...plan.applies, ...plan.notApplicable.map((entry: any) => entry.path)]);
      expect(covered.size, `${loopId} must classify every path`).toBe(MATRIX_PATHS.length);
      for (const entry of plan.notApplicable) expect(entry.reason.length, `${loopId}/${entry.path}`).toBeGreaterThan(20);
    }
  });

  it("§Loop conformance matrix the Work loop has NO not-applicable path: every path is load-bearing", () => {
    expect(LOOP_MATRIX_PLAN.WORK.notApplicable).toEqual([]);
    expect(LOOP_MATRIX_PLAN.WORK.applies.length).toBe(6);
  });

  it("§Loop conformance matrix the three cross-loop seams from the ruling are declared", () => {
    expect(CROSS_LOOP_SCENARIOS.map((scenario: any) => scenario.id)).toEqual(["WORK_TO_KNOWLEDGE_TO_FUTURE_WORK", "COLLABORATION_TO_LOCAL_WORK", "EVOLUTION_TO_FUTURE_WORK"]);
    for (const scenario of CROSS_LOOP_SCENARIOS) expect(scenario.statement.length).toBeGreaterThan(20);
  });
});

/* ================================================================ §Mutation testing */

describe("R3-S0 §Mutation testing — the mutations are preregistered before execution", () => {
  it("§Mutation testing all six required mutations are preregistered and load-bearing", () => {
    expect(PREREGISTERED_MUTATIONS.length).toBe(6);
    expect(PREREGISTERED_MUTATIONS.map((mutation: any) => mutation.id)).toEqual([
      "M1_DROP_CONTEXT_INDEX",
      "M2_BYPASS_ATTEMPT_ALLOWLIST",
      "M3_PROMOTE_WITHOUT_VERIFICATION",
      "M4_ACCEPT_STALE_RESULT",
      "M5_OMIT_PROJECT_ASSET_ASSOCIATION",
      "M6_EVOLUTION_RECEIPT_OLD_INTENT",
    ]);
    for (const mutation of PREREGISTERED_MUTATIONS) {
      expect(mutation.loadBearing, mutation.id).toBe(true);
      expect(mutation.seam, mutation.id).toBeTruthy();
      expect(mutation.detectedBy, mutation.id).toBeTruthy();
    }
  });

  it("§Mutation testing the two verdicts are the two the ruling names", () => {
    expect(Object.values(MUTATION_VERDICTS)).toEqual(["MUTATION_DETECTED", "MUTATION_ESCAPED"]);
  });

  it("§Mutation testing every mutation names a test seam, not a production file to edit permanently", () => {
    for (const mutation of PREREGISTERED_MUTATIONS) expect(mutation.seam).not.toMatch(/production source/iu);
  });

  it("§Historical-defect regression the three historical defect classes are mapped to an invariant", () => {
    expect(HISTORICAL_DEFECTS.length).toBe(3);
    expect(HISTORICAL_DEFECTS.map((entry: any) => entry.id)).toEqual(["R1L_R2U_MISSING_INDEX_FORWARDING", "VACUOUS_CONDITION_OR_TRUE_GATE", "R3A_NESTED_CLASSPASS_INTEGRATION"]);
    for (const entry of HISTORICAL_DEFECTS) {
      expect(entry.caughtBy).toBeTruthy();
      expect(entry.how.length).toBeGreaterThan(30);
    }
  });
});

/* ================================================================ §System validity */

describe("R3-S0 §System-validity gate — six categories, fail-closed", () => {
  it("§System-validity gate the six load-bearing categories from the ruling are declared", () => {
    expect(SYSTEM_VALID_CATEGORIES.map((category: any) => category.id)).toEqual([
      "graph_integrity",
      "loop_conformance",
      "runtime_conformance",
      "authority_checks",
      "evidence_chain_checks",
      "forbidden_bypass_checks",
    ]);
  });

  it("§System-validity gate SYSTEM_VALID is true only when every category is green", () => {
    const allGreen = Object.fromEntries(SYSTEM_VALID_CATEGORIES.map((category: any) => [category.id, true]));
    expect(systemValid(allGreen).SYSTEM_VALID).toBe(true);
    for (const category of SYSTEM_VALID_CATEGORIES) {
      const withOneRed = { ...allGreen, [category.id]: false };
      expect(systemValid(withOneRed).SYSTEM_VALID, category.id).toBe(false);
    }
  });

  it("§System-validity gate an ABSENT category fails closed rather than passing", () => {
    expect(systemValid({ graph_integrity: true }).SYSTEM_VALID).toBe(false);
    expect(systemValid({}).SYSTEM_VALID).toBe(false);
    expect(systemValid(null).SYSTEM_VALID).toBe(false);
  });

  it("§System-validity gate the diagnostic-only use is recorded, not silently allowed", () => {
    expect(systemValid({}).note).toMatch(/DIAGNOSIS/u);
    expect(systemValid({}).note).toMatch(/may not support a mechanism claim/u);
  });
});

/* ================================================================ §Forbidden bypass */

describe("R3-S0 §Forbidden-bypass witness — known bypasses, honest claim", () => {
  it("§Forbidden-bypass witness all six bypass classes from the ruling are declared", () => {
    expect(BYPASS_CHECKS.map((check: any) => check.id)).toEqual([
      "NO_DIRECT_BACKING_STORE_READ",
      "NO_UNLISTED_HANDLE_USE",
      "NO_WRONG_ATTEMPT_REUSE",
      "NO_CONTROL_PAYLOAD_DISCOVERY",
      "NO_AUTHORITY_BYPASS",
      "NO_DIRECT_REMOTE_TO_LOCAL_OWNERSHIP_CONVERSION",
    ]);
  });

  it("§Forbidden-bypass witness the honest claim word is used and the stronger claim is refused", () => {
    expect(BYPASS_CLAIM.allowed).toBe("KNOWN_BYPASSES_BLOCKED");
    expect(BYPASS_CLAIM.forbidden).toBe("NO_BYPASS_EXISTS");
    expect(BYPASS_CLAIM.reason).toMatch(/not a proof/u);
  });

  it("§Forbidden-bypass witness a witness with an open bypass reports the open claim, not the blocked one", () => {
    const blocked = makeBypassWitness({ results: BYPASS_CHECKS.map((check: any) => ({ id: check.id, blocked: true })) });
    expect(blocked.claim).toBe("KNOWN_BYPASSES_BLOCKED");
    expect(blocked.open).toEqual([]);
    expect(blocked.claimScope).toMatch(/not a proof/u);
    const open = makeBypassWitness({ results: [{ id: "NO_AUTHORITY_BYPASS", blocked: false }] });
    expect(open.claim).toBe("KNOWN_BYPASSES_OPEN");
    expect(open.open).toContain("NO_AUTHORITY_BYPASS");
  });
});

/* ================================================================ §Mechanism witness */

describe("R3-S0 §Mechanism Witness — the law applies to the witness", () => {
  it("§Mechanism Witness the six-step chain from the ruling is declared in order", () => {
    expect(MECHANISM_WITNESS_CHAIN.map((step: any) => step.step)).toEqual([
      "canonical_precondition",
      "runtime_projection",
      "actual_consumer_visible_state",
      "allowed_action_or_tool",
      "authorized_owner_interaction",
      "durable_consequence",
    ]);
  });

  it("§Mechanism Witness a complete chain is DEMONSTRATED", () => {
    const steps = Object.fromEntries(MECHANISM_WITNESS_CHAIN.map((step: any) => [step.step, `evidence for ${step.step}`]));
    const witness = makeMechanismWitness({ mechanism: "CONTEXT_DELIVERY", steps, taskOutcome: "TASK_SUCCESS" });
    expect(witness.verdict).toBe(WITNESS_VERDICTS.DEMONSTRATED);
    expect(witness.complete).toBe(true);
    expect(witness.missingSteps).toEqual([]);
    expect(witness.taskSuccessWithoutWitness).toBe(false);
    expect(witness.witnessDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("§Mechanism Witness a TASK_SUCCESS with an incomplete chain is MECHANISM_NOT_DEMONSTRATED", () => {
    const witness = makeMechanismWitness({ mechanism: "CONTEXT_DELIVERY", steps: { canonical_precondition: "x" }, taskOutcome: "TASK_SUCCESS" });
    expect(witness.verdict).toBe(WITNESS_VERDICTS.NOT_DEMONSTRATED);
    expect(witness.taskSuccessWithoutWitness).toBe(true);
    expect(witness.ruling).toMatch(/NOT mechanism success/u);
    expect(witness.missingSteps).toContain("durable_consequence");
  });

  it("§Mechanism Witness a blank step counts as missing, not as satisfied", () => {
    const steps = Object.fromEntries(MECHANISM_WITNESS_CHAIN.map((step: any) => [step.step, "evidence"]));
    steps.durable_consequence = "   ";
    const witness = makeMechanismWitness({ mechanism: "PROMOTION", steps, taskOutcome: "TASK_SUCCESS" });
    expect(witness.verdict).toBe(WITNESS_VERDICTS.NOT_DEMONSTRATED);
    expect(witness.missingSteps).toContain("durable_consequence");
  });

  it("§Mechanism Witness the judge is the same function the builder uses, so they cannot disagree", () => {
    const steps = Object.fromEntries(MECHANISM_WITNESS_CHAIN.map((step: any) => [step.step, "evidence"]));
    const judged = judgeWitness({ ...steps, taskOutcome: "TASK_SUCCESS" });
    const built = makeMechanismWitness({ mechanism: "ADOPTION", steps, taskOutcome: "TASK_SUCCESS" });
    expect(judged.verdict).toBe(built.verdict);
  });
});

/* ================================================================ §Project Behavior Trace */

describe("R3-S0 §Project Behavior Trace — experimental evidence, not a canonical owner", () => {
  it("§Project Behavior Trace the trace declares the fields the ruling lists", () => {
    for (const field of ["projectId", "workIds", "attemptIds", "canonicalNodeRefs", "canonicalEdgeWitnesses", "authorityDecisions", "runtimeBindingDigests", "consumerVisibleDigests", "toolSurfaceDigest", "toolInvocations", "ownerReads", "durableMutations", "verificationPromotionReceipts", "restartBoundaries", "forbiddenBypassChecks"]) {
      expect(PROJECT_BEHAVIOR_TRACE_FIELDS).toContain(field);
    }
  });

  it("§Project Behavior Trace the trace records that it is NOT canonical", () => {
    const trace = makeProjectBehaviorTrace({ projectId: "p" });
    expect(trace.canonical).toBe(false);
    expect(trace.kind).toBe("ProjectBehaviorTrace");
    expect(trace.traceDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("§Project Behavior Trace an empty trace is visible as empty rather than looking complete", () => {
    const coverage = traceCoverage(makeProjectBehaviorTrace({}));
    expect(coverage.populatedCount).toBe(0);
    expect(coverage.empty.length).toBe(PROJECT_BEHAVIOR_TRACE_FIELDS.length);
  });

  it("§Project Behavior Trace the digest changes when the trace changes, so it cannot be reused", () => {
    const first = makeProjectBehaviorTrace({ projectId: "p", ownerReads: ["a"] });
    const second = makeProjectBehaviorTrace({ projectId: "p", ownerReads: ["b"] });
    expect(first.traceDigest).not.toBe(second.traceDigest);
  });

  it("§Evidence correctness the five digest kinds are required, and a gap is visible", () => {
    expect(EVIDENCE_DIGEST_KINDS).toEqual(["testedSourceBytes", "canonicalState", "runtimeSessionBytes", "acceptanceModule", "producedTrace"]);
    const complete = makeEvidenceClosure({ scenario: "S", digests: Object.fromEntries(EVIDENCE_DIGEST_KINDS.map((kind) => [kind, "a".repeat(64)])) });
    expect(complete.complete).toBe(true);
    const partial = makeEvidenceClosure({ scenario: "S", digests: { testedSourceBytes: "a".repeat(64) } });
    expect(partial.complete).toBe(false);
    expect(partial.missing.length).toBe(4);
  });

  it("§Evidence correctness a malformed digest does not count as present", () => {
    const closure = makeEvidenceClosure({ scenario: "S", digests: { testedSourceBytes: "not-a-digest" } });
    expect(closure.present).not.toContain("testedSourceBytes");
    expect(closure.complete).toBe(false);
  });
});

/* ================================================================ the contract is frozen and non-canonical */

describe("R3-S0 the contract itself — frozen, experimental, non-canonical", () => {
  it("§the contract declares its stage and that it introduces no canonical owner", () => {
    expect(SYSTEMIC_CONTRACT.stage).toBe("R3-S0");
    expect(SYSTEMIC_CONTRACT.kind).toMatch(/introduces no canonical owner/u);
  });

  it("§the contract exposes every section the ruling asks for", () => {
    for (const key of ["constitutionalLaw", "truthLayers", "forbiddenInferences", "consumerBoundaryLaw", "lineages", "durableEventFamilies", "systemValidCategories", "matrixCells", "matrixPaths", "loopMatrixPlan", "crossLoopScenarios", "preregisteredMutations", "historicalDefects", "bypassChecks", "mechanismWitnessChain", "witnessVerdicts"]) {
      expect(SYSTEMIC_CONTRACT[key], key).toBeDefined();
    }
  });

  it("§the contract introduces no Council / SupervisorAgent / FusionAgent ontology", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3s0", "contract.mjs"), "utf8");
    expect(source).not.toMatch(/Council|SupervisorAgent|FusionAgent/u);
  });
});

/* ================================================================ GATE S1 / the event audit */

describe("R3-S0 GATE S1 and the durable event audit are green", () => {
  it("§Gate S1 the structural graph audit passes every invariant", () => {
    const output = runGate("graph-audit.mjs");
    expect(output).toMatch(/10\/10 invariant\(s\) PASS/u);
    expect(output).not.toMatch(/^FAIL/mu);
    expect(output).toMatch(/No aggregate score is produced/u);
  });

  it("§Event audit the durable event producer/consumer audit passes every check", () => {
    const output = runGate("event-audit.mjs");
    expect(output).toMatch(/5\/5 audit check\(s\) PASS/u);
    expect(output).not.toMatch(/^FAIL/mu);
  });
});
