/**
 * R3-L0C §10/§23 — THE DUMMY PLUMBING CHECK.
 *
 * §10 requires the containment canaries before trial 1 and §23 forbids a primary-fixture smoke. So the plumbing —
 * the child-process spawn, the shipped worker port, the payload capture, the governed pull, the ordinary
 * gate/promotion path — is proven against a THROWAWAY project that is not the experimental family.
 *
 * It writes NOTHING into research-evidence and contributes nothing to N. A dummy run is not a session.
 *
 * WHY IT IS WORTH RUNNING AT ALL. Every one of these seams has failed silently before in this project: a missing
 * environment variable made a worker produce nothing, an unwired procedure store made a selected handle
 * unresolvable, and an absent reasoning policy made the capability disappear. A plumbing check is what turns
 * those from a lost primary session into a preflight failure.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { containmentEnvironment } from './trajectory.mjs';

const NL = String.fromCharCode(10);

/** §10: the dummy project, deliberately trivial and NOT the experimental family. */
const DUMMY_SOURCE = ['/** A dummy module. Set `answer` to 42. */', 'export const answer = 0;', ''].join(NL);
const DUMMY_ORACLE = [
  'import assert from "node:assert/strict";',
  'import { answer } from "../src/dummy.mjs";',
  'assert.equal(answer, 42, "answer must be 42");',
  'process.stdout.write("ok" + String.fromCharCode(10));',
  '',
].join(NL);

/** §10: the dummy child, which drives ONE real worker through a throwaway world. */
const DUMMY_CHILD = [
  '#!/usr/bin/env node',
  'import { execFileSync } from "node:child_process";',
  'import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";',
  'import { join } from "node:path";',
  'import { pathToFileURL } from "node:url";',
  'const NL = String.fromCharCode(10);',
  'const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));',
  'const DIST = join(spec.repoRoot, "dist", "src");',
  'const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);',
  'process.env.PALIMPSEST_REAL_DSH_BIN = spec.realDshBin;',
  'process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = spec.transcript;',
  'process.env.DSH_HOME = spec.dshHome;',
  'if (typeof spec.protectedRoots === "string" && spec.protectedRoots !== "") process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS = spec.protectedRoots;',
  'const report = { schemaVersion: 1, stage: "R3-L0C", kind: "dummy plumbing child", pid: process.pid, steps: [] };',
  'let installed = null;',
  'try {',
  '  const advanced = await load("advanced.js");',
  '  const delegation = await load("interaction/work_delegation.js");',
  '  const workWorker = await load("deployment/work_worker.js");',
  '  const workspaceModule = await load("project_workspace/index.js");',
  '  const proofModule = await load("proof_asset/index.js");',
  '  const reasoningModule = await load("reasoning_cell/index.js");',
  '  const proceduresModule = await load("procedures/index.js");',
  '  /**',
  '   * The store composition must MATCH the real generation child, or the knowledge capability is absent and a',
  '   * selection is refused with KNOWLEDGE_CAPABILITY_UNAVAILABLE. That is what a first version of this check',
  '   * measured: it proved the H shape and could not reach the C boundary at all.',
  '   */',
  '  const paths2 = spec.paths;',
  '  installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, {',
  '    projectId: spec.projectId,',
  '    databasePath: spec.paths.orchestration,',
  '    ordariumDatabasePath: spec.paths.ordarium,',
  '    repository: spec.repo,',
  '    execution: "worktree",',
  '    standard: { statement: "the dummy oracle passes", clauses: [{ kind: "scope_respected" }], derivedFrom: ["r3l0c plumbing"], confirmed: true, notes: [] },',
  '    policy: advanced.trustedDefaultPolicy({ read_paths: ["src", "test"], allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }, { executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),',
  '    projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths2.association),',
  '    projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths2.journal),',
  '    proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(paths2.proof),',
  '    proofBlobStore: proofModule.localProofBlobStore(paths2.proofBlobs),',
  '    reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(paths2.cells),',
  '    reasoningCellStoreOwned: false,',
  '    reasoningVerificationPolicy: {',
  '      async verify({ definition, candidate, frontierBasis }) {',
  '        const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };',
  '        return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };',
  '      },',
  '      async verifyInvalidation({ definition, request, frontierBasis }) {',
  '        const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", evidenceIds: ["ev-9"], provenanceDigest: "b".repeat(64) };',
  '        return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };',
  '      },',
  '    },',
  '    reasoningAdmissionPolicy: {',
  '      async admit({ definition, candidate, verification, frontierBasis }) {',
  '        const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT", provenanceDigest: "c".repeat(64) };',
  '        return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };',
  '      },',
  '      async admitInvalidation({ definition, request, verification, frontierBasis }) {',
  '        const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT", provenanceDigest: "d".repeat(64) };',
  '        return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };',
  '      },',
  '    },',
  '    procedureStore: new proceduresModule.SqliteProcedureStore(paths2.procedures),',
  '    procedureAuthoring: { origin: "r3l0c-plumbing", async propose() { return { outcome: "NO_PROCEDURE" }; } },',
  '    procedureAdmission: { policyRef: { policyId: "r3l0c-plumbing", version: "1" }, async decide({ candidateDigest }) { return { decision: "UNRESOLVED", candidateDigest, rationale: "plumbing authors nothing", policyRef: { policyId: "r3l0c-plumbing", version: "1" } }; } },',
  '  });',
  '  const controller = installed.controller;',
  '  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: spec.repo, encoding: "utf8" }).trim();',
  '  /**',
  '   * The project is started ONLY when it does not already exist. When the probe runs against the real',
  '   * prehistory stores, the project is already started, and re-starting it reuses an idempotency key for a',
  '   * different request — a probe artifact, not a delivery defect.',
  '   */',
  '  let projectAlreadyStarted = true;',
  '  try { controller.work.project(); } catch { projectAlreadyStarted = false; }',
  '  if (!projectAlreadyStarted) {',
  '    controller.start({ projectId: spec.projectId, goal: "make the dummy oracle pass", headCommit: head, requirements: [{ requirement_id: "P1", statement: "answer must be 42", priority: "critical", acceptance_refs: [] }], tasks: [{ task_id: "t1", objective: "set answer to 42", depends_on: [], write_paths: ["src/dummy.mjs"], required_artifacts: [] }] });',
  '  }',
  '  for (let i = 0; i < 24; i += 1) { const preview = controller.preview(); if (preview.decision !== "next" || preview.eventType !== "TASK_READY") break; controller.step(); }',
  '  const states = controller.work.taskStates();',
  '  const target = states.find((t) => t.state === "READY")?.taskId ?? states.find((t) => t.state === "ACTIVE")?.taskId ?? "t1";',
  '  const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: spec.teePath, profile: spec.profile, timeoutMs: 900_000 });',
  '  const workerFor = () => ({ adapterId: port.adapterId, async run(input) {',
  '    writeFileSync(spec.payloadSink, JSON.stringify({ compiledHandleCount: (input.context?.compiled?.handles ?? []).length, allowedPullHandles: workWorker.workWorkerEnvironmentPayload(input.context).allowedPullHandles }, null, 2), "utf8");',
  '    return await port.run(input);',
  '  } });',
  '  const service = delegation.makeWorkDelegationService({ controller, workerFor });',
  '  const started = await service.start(spec.knowledge === null || spec.knowledge === undefined ? { expectedTaskId: target } : { expectedTaskId: target, knowledge: spec.knowledge });',
  '  let view = await service.followup({ jobId: started.jobId });',
  '  for (let i = 0; i < 4000 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) { await new Promise((r) => setTimeout(r, 500)); view = await service.followup({ jobId: started.jobId }); }',
  '  report.jobPhase = view.phase;',
  '  /** The host error, so a HOST_ERROR names its cause rather than only its phase. */',
  '  report.hostError = "hostError" in view ? view.hostError : null;',
  '  report.view = JSON.stringify(Object.keys(view));',
  '  report.attemptId = "attemptId" in view ? view.attemptId : null;',
  '  if (report.attemptId !== null) {',
  '    for (let i = 0; i < 12; i += 1) { const preview = controller.preview(); if (preview.decision !== "next") break; controller.step(); }',
  '    /**',
  '     * The gate command must be one the profile AUTHORIZES and that succeeds from the gate own cwd. A bare',
  '     * `node test/check.js` was refused because the gate does not run in the world, which surfaced as',
  '     * HOST_ERROR with "passing process evidence requires exit_code 0" — a plumbing failure, not a capital one.',
  '     */',
  '    await controller.gate({ attemptId: report.attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });',
  '    for (let i = 0; i < 12; i += 1) { const preview = controller.preview(); if (preview.decision !== "next") break; controller.step(); }',
  '    const record = controller.attemptWorkRecord(report.attemptId);',
  '    const eligibility = controller.promotionEligibility(report.attemptId);',
  '    report.eligible = eligibility.eligible;',
  '    if (eligibility.eligible && record?.report) { await controller.promote(report.attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead); controller.step(); report.promoted = true; }',
  '    await controller.reconcileProjectHead({ operator: true });',
  '  }',
  '  report.finalHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: spec.repo, encoding: "utf8" }).trim();',
  '  report.source = execFileSync("git", ["show", "HEAD:src/dummy.mjs"], { cwd: spec.repo, encoding: "utf8" });',
  '  try { const out2 = execFileSync("node", ["test/check.js"], { cwd: spec.repo, encoding: "utf8" }); report.visibleOracle = /ok/u.test(out2); } catch { report.visibleOracle = false; }',
  '  report.payload = existsSync(spec.payloadSink) ? JSON.parse(readFileSync(spec.payloadSink, "utf8")) : null;',
  '  report.transcriptBytes = existsSync(spec.transcript) ? readFileSync(spec.transcript).length : 0;',
  '  report.ok = true;',
  '} catch (error) { report.ok = false; report.error = String(error?.stack ?? error).slice(0, 2000); }',
  'finally { if (installed !== null) await installed.dispose().catch(() => undefined); }',
  'writeFileSync(spec.reportPath, JSON.stringify(report, null, 2), "utf8");',
  'process.stdout.write("DUMMY_DONE ok=" + String(report.ok) + NL);',
  '',
].join(NL);

/**
 * §10: RUN THE PLUMBING CHECK.
 *
 * It uses a real worker against a throwaway world, and reports whether the answer was actually changed — the only
 * proof that the whole path works end to end rather than merely composing.
 */
export async function runPlumbing(input) {
  const runRoot = input.runRoot;
  const route = input.route;
  /**
   * §10: the plumbing check runs against the REAL project's stores when a selection is supplied.
   *
   * A dummy project has no capital associations, so a C-shaped selection cannot resolve against it — the
   * capability composes and then refuses with KNOWLEDGE_NOT_PROJECT_ASSOCIATED, which is correct behaviour and
   * useless as a plumbing probe. Passing the prehistory's paths lets the probe measure the DELIVERY path against
   * the project the primary run will actually use.
   */
  const projectId = input.projectId ?? 'r3l0c-dummy';
  const root = join(runRoot, 'preflight', 'plumbing');
  mkdirSync(root, { recursive: true });
  const repo = join(root, 'world');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), `# dummy${NL}`, 'utf8');
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'dummy', private: true, type: 'module' }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(repo, 'src', 'dummy.mjs'), DUMMY_SOURCE, 'utf8');
  writeFileSync(join(repo, 'test', 'check.js'), DUMMY_ORACLE, 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: repo });

  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const state = join(root, 'state');
  mkdirSync(state, { recursive: true });
  /** The full store path set, matching the real generation child so the same capabilities compose. */
  const paths = input.paths ?? Object.freeze({
    state,
    orchestration: join(state, 'orchestration.sqlite'),
    ordarium: join(state, 'ordarium.sqlite'),
    association: join(state, 'assoc.sqlite'),
    journal: join(state, 'journal.sqlite'),
    proof: join(state, 'proof.sqlite'),
    proofBlobs: join(state, 'proof-blobs'),
    cells: join(state, 'cells.sqlite'),
    procedures: join(state, 'procedures.sqlite'),
  });

  const { installHostBundle, dshHome, dshBin } = await import('../gates/env.mjs');
  const { makeProfile, TEE_PATH } = await import('./trajectory.mjs');
  const profile = 'r3l0cdummy';
  makeProfile(home, route, profile, installHostBundle, dshHome, undefined, { extraPatch: input.extraPatch });
  /**
   * An optional full settings document, supplied by a stage that declares provider ROUTES.
   *
   * The shipped adapter reads provider routes from its `llm-pi-ai` settings namespace, so a route declared only
   * in the profile patch is never registered and the worker falls back to the base bundle's vendor default. A
   * caller that needs a custom route passes the whole document here.
   */
  if (typeof input.settingsYaml === 'string' && input.settingsYaml !== '') writeFileSync(join(home, 'settings.yaml'), input.settingsYaml, 'utf8');
  /**
   * An optional COMPOSITION default-model entry.
   *
   * The shipped host runner pins the model from `agent-default-model.currentSelection()`, which reads the
   * composition config and installs it on the agent — overriding the settings document. So a caller that needs a
   * custom route must ALSO override this entry, or the worker silently uses the base bundle's vendor default.
   */


  const childPath = join(root, 'dummy-child.mjs');
  writeFileSync(childPath, DUMMY_CHILD, 'utf8');
  const specPath = join(root, 'spec.json');
  const reportPath = join(root, 'report.json');
  const payloadSink = join(root, 'payload.json');
  const transcript = join(root, 'transcript.txt');
  /**
   * §8/§10: THE PLUMBING CHECK ALSO EXERCISES A SELECTION.
   *
   * The primary run's capital delivery failed SILENTLY: the selection was accepted, no handle was compiled, and
   * every CAPITALIZED session ran with an empty capital surface while reporting `selected=true`. A plumbing check
   * that only ran the H shape could not have caught it, so the check now drives BOTH shapes and reports the
   * compiled handle count for each. `input.selection` supplies the C-shaped selection.
   */
  writeFileSync(specPath, JSON.stringify({
    repoRoot: REPO_ROOT, projectId, repo: input.repo ?? repo, paths, dshHome: home, realDshBin: dshBin(), profile,
    teePath: TEE_PATH, payloadSink, transcript, reportPath,
    knowledge: input.selection ?? null,
    protectedRoots: containmentEnvironment(runRoot, {}).PALIMPSEST_WORKER_PROTECTED_ROOTS,
  }, null, 2), 'utf8');

  let threw = null;
  let childStdout = '';
  let childStderr = '';
  try {
    childStdout = execFileSync(process.execPath, [childPath, specPath], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 1_200_000, env: containmentEnvironment(runRoot, process.env) });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 300);
    childStdout = String(error?.stdout ?? '');
    childStderr = String(error?.stderr ?? '');
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const ok = report !== null && report.ok === true && report.visibleOracle === true && /answer = 42/u.test(String(report.source ?? ''));
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'dummy plumbing check',
    ok,
    detail: report === null
      ? `the dummy child produced no report${threw === null ? '' : ` (${threw})`}`
      : `phase=${String(report.jobPhase)} promoted=${String(report.promoted)} visibleOracle=${String(report.visibleOracle)} answer42=${String(/answer = 42/u.test(String(report.source ?? '')))}`,
    /** The child's own output, so a HOST_ERROR is diagnosable rather than a bare phase name. */
    childStdout: childStdout.slice(-1500),
    childStderr: childStderr.slice(-1500),
    childThrew: threw,
    jobPhase: report?.jobPhase ?? null,
    promoted: report?.promoted ?? null,
    visibleOracle: report?.visibleOracle ?? null,
    payload: report?.payload ?? null,
    transcriptBytes: report?.transcriptBytes ?? null,
    contributesToN: false,
    note: 'a dummy run is not a session and touches no primary bytes',
  });
}
