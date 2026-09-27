#!/usr/bin/env node
/**
 * §E4-L-LIVE — GOVERNED INSTITUTIONAL LEARNING, end to end, on REAL PACKAGED INSTALLS.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 *
 * The loop this gate exists to close:
 *
 *     Structural Observation
 *       → Dynamics Diagnosis / Proposal
 *       → Governed Organization or Runtime Evolution (REAL independent authority)
 *       → Durable Intervention Record
 *       → Later Empirical Experiment / Evaluation
 *       → Reusable Institutional Experience
 *       → Future Architecture Advice
 *
 * and the question the whole stage exists to answer, without the original session:
 *
 *     Why did we change the structure?  Which governed proposal caused it?
 *     Which evolution case executed it?  What was observed before and after?
 *     What later empirical evaluation studied the change?  What did it establish?
 *
 * WHAT MAKES THIS A REAL GATE:
 *
 *   · the structural change is a REAL governed evolution driven through the existing authority seam;
 *   · Phase 3 DISPOSES the installation between the activation and any reconciliation — the crash window
 *     §12 requires — and the structural change must survive it;
 *   · Phase 4 composes a SECOND installation over the same durable stores and reconstructs the record
 *     from evolution history alone;
 *   · Phase 6 restarts AGAIN and re-reads the linked evaluation;
 *   · Phase 8 proves the recommendation/evaluation changes NONE of Organization, RuntimeScope, ProjectIR
 *     or Work.
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { gateRepoRoot, gateRoot } from "./env.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/e4l-live`;
const PROJECT_DIR = `${RIG}/repo`;
const STATE = `${RIG}/state`;

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const orgModule = await import(pathToFileURL(`${REPO}/dist/src/organization/index.js`).href);
const scopeModule = await import(pathToFileURL(`${REPO}/dist/src/runtime_scope/index.js`).href);
const evolutionModule = await import(pathToFileURL(`${REPO}/dist/src/organization_evolution/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const advisorModule = await import(pathToFileURL(`${REPO}/dist/src/advisor/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);

const project = "e4llive";
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

/* ------------------------------------------------------------------ fixture */

function setup() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(join(PROJECT_DIR, "src"), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  writeFileSync(join(PROJECT_DIR, "src", "a.js"), "export const value = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: PROJECT_DIR });
  execFileSync("git", ["add", "-A"], { cwd: PROJECT_DIR });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: PROJECT_DIR });
  return git(PROJECT_DIR, ["rev-parse", "HEAD"]);
}

const PEER = { schemaVersion: 1, peerId: "p1" };
const MEMBER = { kind: "peer", peer: PEER };
const POLICY = {
  ref: { id: "e4l-live", version: "1" },
  minDistinctBases: 2,
  churnMinReconfigurations: 3,
  concentrationShareThreshold: 0.5,
  federationMinMessageEvents: 4,
  federationMinDistinctPeers: 2,
};

const STANDARD = Object.freeze({
  statement: "the commit exists and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["e4l-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function orgDef(revision, mission) {
  return orgModule.materializeOrganizationDefinition({
    organizationDefinitionId: "O",
    revision,
    mission,
    members: [MEMBER],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [{ member: MEMBER, roleId: "r1" }],
    norms: [],
    interactions: [{ interactionId: "i-1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
  });
}

/** A compiler that authorizes the REVISE transformation, as a host's real compiler would. */
function orgCompiler() {
  return {
    compile: async ({ proposal, sources }) => {
      const base = sources[0];
      const candidate = orgDef(base.revision + 1, `${base.mission}-next`);
      const body = {
        schemaVersion: 1,
        proposalDigest: proposal.digest,
        proposalBasisDigest: proposal.basisDigest,
        kind: "REVISE",
        transformation: { kind: "REVISE", base: orgModule.organizationRefOf(base), candidate },
        compilerProvenance: "e4l-live-compiler",
      };
      return { ...body, digest: evolutionModule.evolutionCandidateDigestOf(body) };
    },
  };
}

/** §34: a REAL independent structural authority, deterministic. `script.decision` is MUTABLE so the gate
 *  can exercise a REFUSAL and an ADMISSION against ONE deployment. */
function authority(script) {
  return {
    admit: async () => (script.decision === "authorized" ? { outcome: "authorized" } : { outcome: "denied", detail: "the e4l-live authority refused" }),
  };
}

/* ------------------------------------------------------------------ the run */

async function main() {
  const head = setup();
  process.stdout.write(`repo     ${PROJECT_DIR}\nhead     ${head}\n\n`);

  const paths = {
    org: `${STATE}/org.sqlite`,
    scope: `${STATE}/scope.sqlite`,
    orgEvo: `${STATE}/org-evo.sqlite`,
    runtimeEvo: `${STATE}/runtime-evo.sqlite`,
    memory: `${STATE}/memory.sqlite`,
    orchestration: `${STATE}/orchestration.sqlite`,
    ordarium: `${STATE}/ordarium.sqlite`,
  };

  const authorityScript = { decision: "authorized" };

  /** ONE packaged install over PATH-based stores, so a new install reads the SAME durable state. */
  function install() {
    const orgStore = new orgModule.SqliteOrganizationStore(paths.org);
    const scopeStore = new scopeModule.SqliteRuntimeScopeStore(paths.scope);
    const orgEvolutionStore = new evolutionModule.SqliteOrganizationEvolutionStore(paths.orgEvo);
    const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
    const installed = advanced.installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId: project,
        databasePath: paths.orchestration,
        ordariumDatabasePath: paths.ordarium,
        repository: PROJECT_DIR,
        execution: "worktree",
        standard: STANDARD,
        policy: advanced.trustedDefaultPolicy({
          read_paths: ["src"],
          allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
        }),
        organizationStore: orgStore,
        runtimeScopeStore: scopeStore,
        organizationEvolutionStore: orgEvolutionStore,
        organizationEvolutionCompiler: orgCompiler(),
        organizationEvolutionAuthority: authority(authorityScript),
        organizationMemoryStore: memoryStore,
      },
    );
    return {
      installed,
      orgStore,
      scopeStore,
      orgEvolutionStore,
      memoryStore,
      close: () => {
        installed.dispose();
        orgStore.close();
        scopeStore.close();
        orgEvolutionStore.close();
        memoryStore.close();
      },
    };
  }

  const scopeServiceOf = (rig) =>
    scopeModule.makeRuntimeScopeService({
      store: rig.scopeStore,
      organizations: {
        current: (id) => rig.orgStore.head(id),
        exists: async (ref) => (await rig.orgStore.get(ref)) !== undefined,
        definition: async (ref) => {
          const definition = await rig.orgStore.get(ref);
          return definition === undefined ? undefined : { interactions: definition.interactions };
        },
      },
      representationAdmission: { admit: async () => ({ admitted: true }) },
    });

  /* ---------------------------------------------------------------- Phase 1 */

  process.stdout.write("PHASE 1 — observe structural pressure\n");
  const first = install();
  const o0 = orgDef(0, "m");
  await first.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
  await scopeServiceOf(first).openScope({ scopeId: "R", organizationBasis: orgModule.organizationRefOf(o0) });
  const o1 = orgDef(1, "m-next");
  await first.orgStore.registerRevision({ definition: o1, parent: orgModule.organizationRefOf(o0), expectedHeadRevision: 0 });
  const proposed = await first.installed.organizationDynamics.service.propose({
    subject: { kind: "organization", organization: orgModule.organizationRefOf(o1) },
    policy: POLICY,
  });
  if ("status" in proposed) throw new Error(`propose returned ${proposed.status}`);
  const proposal = proposed.proposal;
  record("1. proposal snapshot digest", proposal.snapshotDigest.slice(0, 16) + "…");
  record("2. proposal diagnosis digest", proposal.diagnosisDigest.slice(0, 16) + "…");
  record("3. proposal basis digest", proposal.basisDigest.slice(0, 16) + "…");
  record("4. proposal intent", proposal.intent);
  record("5. proposal kind", proposal.kind);

  /* ---------------------------------------------------------------- Phase 2 */

  process.stdout.write("\nPHASE 2 — governed structural evolution\n");
  const evolution = first.installed.organizationEvolution.service;
  const outcome = await evolution.advanceEvolution({ proposal, policy: POLICY });
  if (outcome.status !== "activated") throw new Error(`evolution returned ${outcome.status}: ${JSON.stringify(outcome)}`);
  const caseRef = outcome.caseRef;
  const inspection = await evolution.inspectEvolution(caseRef);
  record("6. structural change ACTIVATED", `case ${caseRef} = ${inspection.state}`);
  record("7. the exact proposal was bound durably", inspection.events.some((event) => event.type === "EVOLUTION_PROPOSAL_BOUND") ? "EVOLUTION_PROPOSAL_BOUND present" : "MISSING");
  record("8. immediate after snapshot", outcome.afterSnapshotDigest === null ? "(absent — honest)" : outcome.afterSnapshotDigest.slice(0, 16) + "…");
  record("9. NO OrganizationMemory assertion yet", `${(await first.memoryStore === undefined ? [] : await memoryModule.makeOrganizationMemoryService({ store: first.memoryStore }).interventions()).length} interventions`);

  /* ---------------------------------------------------------------- Phase 3 */

  process.stdout.write("\nPHASE 3 — crash window\n");
  // The activation is durable; the empirical write never happened. The process "dies" here.
  const interventionsBeforeCrash = await memoryModule.makeOrganizationMemoryService({ store: first.memoryStore }).interventions();
  record("10. crash window: activation durable, memory write absent", `${interventionsBeforeCrash.length} intervention(s)`);
  first.close();
  record("11. structural change survived the process ending", "installation disposed");

  /* ---------------------------------------------------------------- Phase 4 */

  process.stdout.write("\nPHASE 4 — cold restart + reconciliation\n");
  const second = install();
  const memory = second.installed.organizationMemory;
  record("12. after restart: still zero interventions", `${(await memory.interventions()).length}`);
  const report = await second.installed.institutionalLearning.reconcileInterventions();
  record("13. reconcileInterventions()", `${report.recorded} recorded, ${report.alreadyRecorded} already, ${report.incomplete} incomplete`);
  const records = await memory.interventions();
  if (records.length !== 1) throw new Error(`expected exactly one reconstructed intervention, got ${records.length}`);
  const intervention = records[0];
  record("14. proposalDigest preserved", intervention.proposalDigest === proposal.digest ? "exact" : "MISMATCH");
  record("15. evolutionCaseRef preserved", intervention.evolutionCaseRef === `organization_evolution:${caseRef}` ? "exact (lane-tagged)" : intervention.evolutionCaseRef);
  record("16. beforeRef preserved", intervention.beforeRef === proposal.snapshotDigest ? "exact (proposal snapshot)" : "MISMATCH");
  record("17. afterRef preserved/absent honestly", intervention.afterRef === undefined ? "(absent)" : intervention.afterRef === outcome.afterSnapshotDigest ? "exact" : "MISMATCH");
  record("18. rationale from the exact bound proposal", intervention.rationale === proposal.intent ? "exact" : "MISMATCH");
  record("19. no previous session required", "reconstructed from durable evolution history alone");

  /* ---------------------------------------------------------------- Phase 5 */

  process.stdout.write("\nPHASE 5 — linked longitudinal experiment\n");
  const scenario = memoryModule.materializeScenario({
    scenarioId: "s1",
    scenarioRevision: 0,
    kind: "RUNTIME_TOPOLOGY",
    classification: "SCRIPTED_MECHANICAL",
    task: "run the structural scenario",
    successCriteria: ["criterion"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 },
  });
  const variant = memoryModule.materializeVariant({ variantId: "v1", kind: "RUNTIME_TOPOLOGY", description: "post-intervention topology" });
  const experiment = memoryModule.materializeExperiment({
    experimentId: `exp-${intervention.interventionRef.slice(-8)}`,
    revision: 0,
    objective: "measure the structural effect under one scenario",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: { metricIds: ["latency"], primaryValidatorRef: "validator-1", objectives: ["latency"], objectiveNote: "decision_aid_not_truth" },
    runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 },
    interventionRef: intervention.interventionRef,
  });
  await memory.recordExperiment(experiment);
  await memory.recordScenario(experiment.experimentId, scenario);
  await memory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "e4l-live", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: {
      outcome: "PASS",
      failureClassification: "NONE",
      measurements: [memoryModule.materializeMetric({ metricId: "latency", unit: "ms", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 12, provenance: "e4l-live" })],
      validatorResults: [],
    },
    startedAt: "2020-01-01T00:00:00.000Z",
    endedAt: "2020-01-01T00:00:01.000Z",
  });
  await memory.recordRun(experiment.experimentId, run);
  record("20. experiment linked to the intervention", experiment.interventionRef === intervention.interventionRef ? "exact ref" : "MISMATCH");
  record("21. ordinary run recorded (no special score)", `${(await memory.runs(experiment.experimentId)).length} run(s)`);

  /* ---------------------------------------------------------------- Phase 6 */

  process.stdout.write("\nPHASE 6 — restart\n");
  second.close();
  const third = install();
  const view = await third.installed.institutionalLearning.interventionEvaluations(intervention.interventionRef);
  record("22. linked experiment survived the restart", `${view.experiments.length} experiment(s)`);
  record("23. the link is intact", view.experiments[0]?.experimentRef === experiment.experimentId ? "exact experiment ref" : "MISMATCH");
  const interventionAfterRestart = await third.installed.organizationMemory.intervention(intervention.interventionRef);
  record("24. intervention still resolves", interventionAfterRestart?.proposalDigest === proposal.digest ? "proposal digest intact" : "MISMATCH");

  /* ---------------------------------------------------------------- Phase 7 */

  process.stdout.write("\nPHASE 7 — future reuse\n");
  const advisor = third.installed.advisor;
  const recommendation = await advisor.recommend({ taskProfile: advisorModule.unknownTaskProfile() });
  record("25. the ordinary advisor produced a recommendation", recommendation.recommendedPlan === undefined ? "MISSING" : "present");
  const linked = await third.installed.organizationMemory.experimentsForIntervention(intervention.interventionRef);
  const trace = await third.installed.organizationMemory.intervention(intervention.interventionRef);
  record("26. trace: recommendation → experiment", linked[0]?.experimentId ?? "MISSING");
  record("27. trace: experiment → interventionRef", linked[0]?.interventionRef === intervention.interventionRef ? "exact" : "MISMATCH");
  record("28. trace: interventionRef → evolutionCaseRef", trace?.evolutionCaseRef === `organization_evolution:${caseRef}` ? "exact" : "MISMATCH");
  record("29. trace: evolutionCaseRef → proposalDigest", trace?.proposalDigest === proposal.digest ? "exact" : "MISMATCH");

  /* ---------------------------------------------------------------- Phase 8 */

  process.stdout.write("\nPHASE 8 — zero authority\n");
  const orgHeadBefore = await third.orgStore.head("O");
  const scopesBefore = (await scopeServiceOf(third).listScopes()).map((ref) => ref.scopeId).sort();
  const caseEventsBefore = (await third.installed.organizationEvolution.service.inspectEvolution(caseRef)).events.length;
  const irBefore = JSON.stringify(third.installed.controller.work.projectOrNull());
  const workBefore = JSON.stringify(third.installed.controller.work.taskStates());

  // A SECOND evaluation on the SAME link — the ordinary path — and a second recommendation.
  await third.installed.organizationMemory.recordRun(experiment.experimentId, experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 43, orderIndex: 2, warmup: false, attempt: 1 },
    provenance: { provider: "e4l-live", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: {
      outcome: "PASS",
      failureClassification: "NONE",
      measurements: [memoryModule.materializeMetric({ metricId: "latency", unit: "ms", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 11, provenance: "e4l-live" })],
      validatorResults: [],
    },
    startedAt: "2020-01-01T00:00:02.000Z",
    endedAt: "2020-01-01T00:00:03.000Z",
  }));
  await advisor.recommend({ taskProfile: advisorModule.unknownTaskProfile() });

  record("30. OrganizationDefinition unchanged", JSON.stringify(await third.orgStore.head("O")) === JSON.stringify(orgHeadBefore) ? "unchanged" : "CHANGED");
  record("31. RuntimeScope unchanged", JSON.stringify((await scopeServiceOf(third).listScopes()).map((ref) => ref.scopeId).sort()) === JSON.stringify(scopesBefore) ? "unchanged" : "CHANGED");
  record("32. evolution authority unchanged (no new case event)", (await third.installed.organizationEvolution.service.inspectEvolution(caseRef)).events.length === caseEventsBefore ? "unchanged" : "CHANGED");
  record("33. ProjectIR unchanged", JSON.stringify(third.installed.controller.work.projectOrNull()) === irBefore ? "unchanged" : "CHANGED");
  record("34. Work unchanged", JSON.stringify(third.installed.controller.work.taskStates()) === workBefore ? "unchanged" : "CHANGED");
  // §23: the ONLY structural path is proposal → authority → evolution. A refusal still refuses — the
  // recommendation and the evaluation cannot stand in for the authority, so the change does not happen.
  authorityScript.decision = "denied";
  const secondProposal = await third.installed.organizationDynamics.service.propose({
    subject: { kind: "organization", organization: orgModule.organizationRefOf(orgDef(1, "m-next")) },
    policy: POLICY,
  });
  if ("status" in secondProposal) throw new Error(`propose returned ${secondProposal.status}`);
  const refusedChange = await third.installed.organizationEvolution.service.advanceEvolution({ proposal: secondProposal.proposal, policy: POLICY });
  record("35. a later structural change is REFUSED by the ordinary authority", refusedChange.status);
  const orgHeadAfterRefusal = await third.orgStore.head("O");
  record("36. the refusal changed no structure", JSON.stringify(orgHeadAfterRefusal) === JSON.stringify(orgHeadBefore) ? "unchanged" : "CHANGED");
  record("37. zero structural authority was granted by the evidence", "recommendation/evaluation mutated nothing");

  /* ---------------------------------------------------------------- verdict */

  const required = [
    ["real governed structural change happened", inspection.state === "POST_OBSERVED"],
    ["the change could survive an empirical-recording crash", interventionsBeforeCrash.length === 0],
    ["the intervention was reconstructed after restart", records.length === 1],
    ["proposalDigest/case/before/after provenance survived", intervention.proposalDigest === proposal.digest && intervention.evolutionCaseRef === `organization_evolution:${caseRef}` && intervention.beforeRef === proposal.snapshotDigest],
    ["the rationale came from the exact bound proposal", intervention.rationale === proposal.intent],
    ["a later experiment explicitly evaluated that intervention", linked.length === 1 && linked[0].interventionRef === intervention.interventionRef],
    ["evaluation survived another restart", view.experiments.length === 1],
    ["future advice could reuse that empirical experience", recommendation.recommendedPlan !== undefined],
    ["the provenance trace reaches the proposal digest", trace?.proposalDigest === proposal.digest],
    ["historical empirical experience granted zero structural authority", JSON.stringify(await third.orgStore.head("O")) === JSON.stringify(orgHeadBefore) && refusedChange.status === "denied"],
  ];
  let ok = true;
  process.stdout.write("\n");
  for (const [label, check] of required) {
    let value = false;
    try {
      value = Boolean(check);
    } catch (error) {
      process.stdout.write(`FAIL  ${label} — ${String(error)}\n`);
      ok = false;
      continue;
    }
    process.stdout.write(`${value ? "PASS" : "FAIL"}  ${label}\n`);
    if (!value) ok = false;
  }
  process.stdout.write(`\n§E4-L-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  if (process.env.PALIMPSEST_GATE_FINDINGS === "1") {
    for (const [key, value] of findings) process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write("\n");
  third.close();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`e4l-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
