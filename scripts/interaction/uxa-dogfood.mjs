/**
 * UX-A §42 — ONE-REQUEST LOCAL MULTI-AGENT COLLABORATION DOGFOOD.
 *
 * Usage: node scripts/interaction/uxa-dogfood.mjs   (run `pnpm build` first)
 *
 * The §42 "plus" gates, on the REAL installed stack (a real `installPalimpsest`
 * with real stores on temp files and a REAL reasoning-cell branch-execution port,
 * so Explore genuinely admits claims through the canonical ReasoningCell kernel):
 *
 *   A. DSH one-request Explore       — ONE `collaboration.run` call, content back.
 *   B. PARALLEL_AND_CHECK            — one call + a REAL independent verifier.
 *   C. AUTO Focus / AUTO Explore     — the advisor decides, incl. the safe fallback.
 *   D. COORDINATE handoff            — CROSS_PROJECT_REQUIRED with ZERO mutation.
 *   E. No-CoT result proof           — the payload carries no branch/reasoning
 *                                      machinery and no ProjectIR/Journal write.
 *
 * Plus the separately-owned AE-R boundary dogfood (`scripts/scope/aer-boundary-dogfood.mjs`)
 * is RUN as a child process and reported in the same summary, so the §42 line
 * "AE-R boundary dogfood remains green" has evidence in one place.
 *
 * Every check prints REAL evidence derived from the payload it asserts. Nothing is
 * fabricated: a property the composed stack cannot demonstrate becomes an
 * `honestNotes` entry, and `pass` reflects only the checks that were really made.
 *
 * The script prints a final `pass=true|false` line and exits non-zero on failure.
 * The temp dir is ALWAYS cleaned up in a `finally`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const REPO = join(import.meta.dirname, "..", "..");
const DIST = pathToFileURL(join(REPO, "dist", "src")).href;
const PROJECT = "uxa-dogfood";
const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const LOCAL_PEER = Object.freeze({ schemaVersion: 1, peerId: "palimpsest-uxa-dogfood" });
const VERIFIER_REF = "uxa-dogfood-mechanical";
const PEER_ID = "peer-independent-1";
const GOLDEN_TASK = "Parallel investigate two plausible approaches to this implementation and check the result.";
const EXPLORE_TASK =
  "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.";
const COUPLED_TASK = "Change the shared state migration that every module depends on; cross-component coupled.";
const COORDINATE_TASK = "Get an independent review by another team of the shared state migration.";

/* -------------------------------------------------------------------------- *
 * Real stack imports (dist only, exactly like the house dogfoods)
 * -------------------------------------------------------------------------- */

const { installPalimpsest } = await import(`${DIST}/install.js`);
const { FakeGitPort } = await import(`${DIST}/effects/index.js`);
const { SqliteCoordinationStore } = await import(`${DIST}/coordination/index.js`);
const { SqliteOrganizationMemoryStore } = await import(`${DIST}/organization_memory/index.js`);
const { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } = await import(
  `${DIST}/project_workspace/index.js`
);
const reasoning = await import(`${DIST}/reasoning_cell/index.js`);
const verification = await import(`${DIST}/project_verification/index.js`);
const interaction = await import(`${DIST}/interaction/index.js`);
const recipes = await import(`${DIST}/recipes/index.js`);

/* -------------------------------------------------------------------------- *
 * Evidence collection (house style)
 * -------------------------------------------------------------------------- */

const evidence = {};
const failures = [];
const honestNotes = {};

function check(name, condition, detail) {
  const ok = condition === true;
  evidence[name] = { ok, detail };
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

function note(name, text) {
  honestNotes[name] = text;
}

/** The human-readable text of one finding (content is a structured claim object). */
function findingText(finding) {
  const content = finding?.content;
  if (typeof content === "string") return content;
  if (content !== null && typeof content === "object" && !Array.isArray(content)) {
    if (typeof content.statement === "string") return content.statement;
    if (typeof content.description === "string") return content.description;
  }
  return JSON.stringify(content);
}

function textsOf(findings) {
  return (findings ?? []).map((finding) => findingText(finding));
}

/** Raw rows of every named table in one SQLite file, or a marker when the table is absent. */
function rawTableRows(databasePath, table) {
  const database = new DatabaseSync(databasePath);
  try {
    const exists = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (exists === undefined) return "<absent>";
    return JSON.stringify(database.prepare(`SELECT * FROM ${table}`).all());
  } finally {
    database.close();
  }
}

/* -------------------------------------------------------------------------- *
 * The real install rig (mirrors test/uxa_collaboration.test.ts)
 * -------------------------------------------------------------------------- */

/**
 * A branch executes EPHEMERALLY and answers with ITS OWN content. It deliberately
 * does not echo the branch-brief plumbing, so the result projection can be
 * asserted to carry no internal branch machinery.
 */
function makeBranchPort(branchExecutions) {
  return {
    adapterId: "uxa-dogfood-branch",
    run: async (input) => {
      const index = branchExecutions.length + 1;
      branchExecutions.push(index);
      // The frozen brief is READ (it is the branch's own input) and its plumbing
      // is NEVER echoed back into the claim, so the result projection cannot
      // accidentally carry branch machinery.
      const brief = input?.brief ?? {};
      if (typeof brief.question !== "string") throw new Error("the branch port received no frozen branch question");
      return { statement: `approach ${index}: a distinct candidate answer` };
    },
  };
}

/**
 * The harness-owned verification/admission policy seams. CX semantics are never
 * mocked: these are the two declared adapter seams, and they make the canonical
 * kernel do the real verification + SEPARATE epistemic admission.
 */
function reasoningPolicySeams() {
  const verificationPolicy = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED",
        supportingEvidenceIds: ["ev-1"],
        contradictingEvidenceIds: [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: reasoning.reasoningVerificationDigestOf(base) };
    },
    verifyInvalidation: async ({ definition, request, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED",
        evidenceIds: ["ev-9"],
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: reasoning.invalidationVerificationDigestOf(base) };
    },
  };
  const admissionPolicy = {
    admit: async ({ definition, candidate, verification: result, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: result.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "ADMIT",
        provenanceDigest: "c".repeat(64),
      };
      return { ...base, digest: reasoning.reasoningAdmissionDigestOf(base) };
    },
    admitInvalidation: async ({ definition, request, verification: result, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        verificationResultDigest: result.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "INVALIDATE",
        provenanceDigest: "d".repeat(64),
      };
      return { ...base, digest: reasoning.invalidationAdmissionDigestOf(base) };
    },
  };
  return { verificationPolicy, admissionPolicy };
}

async function makeRig(parentDir, label, options = {}) {
  const dir = mkdtempSync(join(parentDir, `${label}-`));
  const branchExecutions = [];
  const sent = [];
  const directoryCalls = [];
  const statePath = join(dir, "state.sqlite");
  const journalPath = join(dir, "journal.sqlite");
  const coordinationPath = join(dir, "coordination.sqlite");
  const seams = reasoningPolicySeams();

  const withReasoning = options.withReasoning === true;
  const verifiers = options.verifiers ?? "none";

  const installed = installPalimpsest(
    { tools: { register: () => undefined } },
    {
      projectId: PROJECT,
      databasePath: statePath,
      ordariumDatabasePath: join(dir, "ordarium.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(journalPath),
      localPeer: LOCAL_PEER,
      coordinationStore: new SqliteCoordinationStore(coordinationPath),
      peerTransportPort: {
        adapterId: "uxa-dogfood-transport",
        send: async (message) => {
          sent.push(message);
          return { transportMessageId: `t-${sent.length}`, delivered: true };
        },
      },
      peerDirectoryPort: {
        observePeers: async () => {
          directoryCalls.push(directoryCalls.length + 1);
          return { state: "known", value: [] };
        },
      },
      attemptCatalog: { assertAdmissibleAttempt: async () => undefined },
      ...(options.withAdvisor === true
        ? { organizationMemoryStore: new SqliteOrganizationMemoryStore(join(dir, "memory.sqlite")) }
        : {}),
      ...(withReasoning
        ? {
            reasoningCellStore: new reasoning.SqliteReasoningCellStore(join(dir, "reasoning.sqlite")),
            reasoningVerificationPolicy: seams.verificationPolicy,
            reasoningAdmissionPolicy: seams.admissionPolicy,
            reasoningBranchExecution: makeBranchPort(branchExecutions),
          }
        : {}),
      ...(options.knownPeerIds === undefined
        ? {}
        : { knownIndependentPeers: options.knownPeerIds.map((peerId) => ({ peerId })) }),
      projectVerificationStore: new verification.SqliteProjectVerificationStore(join(dir, "verification.sqlite")),
      ...(verifiers === "independent"
        ? {
            projectVerifierProviders: [
              verification.commandProjectHeadVerifier({
                verifierRef: VERIFIER_REF,
                command: process.execPath,
                args: ["-e", "process.exit(0)"],
              }),
            ],
            projectVerificationDefaultVerifierRef: VERIFIER_REF,
          }
        : { projectVerifierProviders: [] }),
    },
  );

  installed.controller.start({ projectId: PROJECT, goal: "uxa dogfood", headCommit: HEAD, tasks: [] });

  const mutationSurface = () => ({
    project: rawTableRows(statePath, "projects"),
    tasks: rawTableRows(statePath, "tasks"),
    promotions: rawTableRows(statePath, "promotions"),
    journal: rawTableRows(journalPath, "project_journal_events"),
  });

  return {
    installed,
    dir,
    statePath,
    journalPath,
    coordinationPath,
    branchExecutions,
    sent,
    directoryCalls,
    collaboration: installed.collaboration,
    mutationSurface,
    head: () => {
      const row = installed.controller.store.connection
        .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
        .get(PROJECT);
      return { revision: Number(row?.revision ?? 0), digest: String(row?.digest ?? "") };
    },
    dispose: async () => {
      try {
        await installed.dispose();
      } catch {
        /* best effort */
      }
    },
  };
}

function runContext(name, args) {
  return { callId: "c1", rootCallId: "r1", name, arguments: args, signal: new AbortController().signal };
}

function toolNamed(rig, name) {
  const found = rig.installed.tools.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`tool "${name}" is missing (registered: ${rig.installed.tools.map((entry) => entry.name).join(", ")})`);
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * main
 * -------------------------------------------------------------------------- */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-uxa-dogfood-"));
  const rigs = [];
  const track = (rig) => {
    rigs.push(rig);
    return rig;
  };

  try {
    /* ====================================================================== *
     * A. DSH one-request Explore (§32/§42)
     * ====================================================================== */

    const rigA = track(await makeRig(dir, "a", { withAdvisor: true, withReasoning: true, verifiers: "none" }));
    // The caller names NO recipe id, NO plan, NO cell id and NO branch id. This is
    // the ENTIRE request — exactly the three fields a user/host can supply.
    const requestA = { task: "Parallel investigate two plausible approaches to this implementation", intent: "PARALLEL", requestedBy: "dogfood:host" };
    const resultA = await rigA.collaboration.run(requestA);

    check(
      "A_request_carries_no_recipe_plan_cell_or_branch_id",
      JSON.stringify(Object.keys(requestA).sort()) === JSON.stringify(["intent", "requestedBy", "task"]),
      `request keys=${JSON.stringify(Object.keys(requestA).sort())}`,
    );
    check("A_status_completed", resultA.status === "COMPLETED", `status=${resultA.status}`);
    check(
      "A_at_least_two_findings_with_content",
      resultA.findings.length >= 2 && resultA.findings.every((finding) => findingText(finding).trim() !== ""),
      `${resultA.findings.length} finding(s): ${JSON.stringify(textsOf(resultA.findings))}`,
    );
    check(
      "A_findings_source_is_reasoning_cell",
      resultA.findings.length > 0 && resultA.findings.every((finding) => finding.source === "reasoning_cell"),
      `sources=${JSON.stringify(resultA.findings.map((finding) => finding.source))}`,
    );
    check(
      "A_details_carry_ids_and_findings_carry_the_value",
      typeof resultA.details.cellId === "string" &&
        resultA.details.cellId.length > 0 &&
        Array.isArray(resultA.details.branchIds) &&
        resultA.details.branchIds.length >= 2 &&
        resultA.findings.every((finding) => typeof finding.claimId === "string"),
      `details.cellId=${resultA.details.cellId} branchIds=${JSON.stringify(resultA.details.branchIds)} claimIds=${JSON.stringify(
        resultA.findings.map((finding) => finding.claimId),
      )}`,
    );
    check(
      "A_dsh_tool_is_registered_with_plan_and_run",
      (() => {
        const tool = toolNamed(rigA, "palimpsest_collaborate");
        const actions = tool.parameters?.properties?.action?.enum ?? [];
        return JSON.stringify(actions) === JSON.stringify(["plan", "run"]);
      })(),
      `palimpsest_collaborate actions=${JSON.stringify(toolNamed(rigA, "palimpsest_collaborate").parameters?.properties?.action?.enum)}`,
    );
    // A is the §42 DSH one-request Explore: one call, findings read back.
    evidence.A_findings_printed = { ok: true, detail: textsOf(resultA.findings) };
    evidence.A_summary = { ok: true, detail: resultA.summary };

    /* ====================================================================== *
     * B. PARALLEL_AND_CHECK (§32) with a REAL independent verifier
     * ====================================================================== */

    const rigB = track(await makeRig(dir, "b", { withAdvisor: true, withReasoning: true, verifiers: "independent" }));
    const resultB = await rigB.collaboration.run({
      task: GOLDEN_TASK,
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "dogfood:host",
    });

    check("B_status_completed", resultB.status === "COMPLETED", `status=${resultB.status}`);
    check(
      "B_findings_present",
      resultB.findings.length >= 2 && resultB.findings.every((finding) => findingText(finding).trim() !== ""),
      `${resultB.findings.length} finding(s): ${JSON.stringify(textsOf(resultB.findings))}`,
    );
    check(
      "B_verification_verdict_recorded",
      resultB.verification !== undefined && typeof resultB.verification.verdict === "string",
      `verification=${JSON.stringify(resultB.verification ?? null)}`,
    );
    check(
      "B_verification_independence_reported",
      resultB.verification !== undefined &&
        typeof resultB.verification.independence === "string" &&
        resultB.verification.independence.length > 0,
      `independence=${resultB.verification?.independence} freshness=${resultB.verification?.freshness} verifierRef=${resultB.verification?.verifierRef}`,
    );
    check(
      "B_protocol_note_present_and_truthful",
      resultB.verification !== undefined &&
        resultB.verification.protocolNote === interaction.VERIFICATION_PROTOCOL_NOTE &&
        /protocol result, not truth/u.test(resultB.verification.protocolNote) &&
        resultB.summary.includes(resultB.verification.protocolNote),
      `note="${resultB.verification?.protocolNote}"`,
    );
    evidence.B_findings_printed = { ok: true, detail: textsOf(resultB.findings) };
    evidence.B_summary = { ok: true, detail: resultB.summary };

    /* ====================================================================== *
     * C. AUTO Focus and AUTO Explore (§33)
     * ====================================================================== */

    // C1 — tightly-coupled, low-decomposability: the advisor must choose FOCUS, so
    // ZERO branch execution and ZERO reasoning cell are created.
    const rigC1 = track(await makeRig(dir, "c1", { withAdvisor: true, withReasoning: true, verifiers: "independent" }));
    const resultC1 = await rigC1.collaboration.run({ task: COUPLED_TASK, intent: "AUTO", requestedBy: "dogfood:host" });
    const cellCountC1 = (await rigC1.installed.reasoningCells.store.cells()).length;
    check(
      "C1_auto_focus_principal_continues_with_zero_branches",
      resultC1.status === "PRINCIPAL_CONTINUES" &&
        resultC1.executionKind === "PRINCIPAL_CONTINUES" &&
        resultC1.findings.length === 0 &&
        rigC1.branchExecutions.length === 0 &&
        cellCountC1 === 0,
      `status=${resultC1.status} kind=${resultC1.executionKind} findings=${resultC1.findings.length} branchExecutions=${rigC1.branchExecutions.length} reasoningCells=${cellCountC1}`,
    );

    // C2 — high-decomposability, low-coupling, high-parallel-benefit: the advisor
    // must choose EXPLORE and real admitted findings must come back.
    const rigC2 = track(await makeRig(dir, "c2", { withAdvisor: true, withReasoning: true, verifiers: "none" }));
    const resultC2 = await rigC2.collaboration.run({ task: EXPLORE_TASK, intent: "AUTO", requestedBy: "dogfood:host" });
    check(
      "C2_auto_explore_local_explore_with_real_findings",
      resultC2.status === "COMPLETED" &&
        resultC2.executionKind === "LOCAL_EXPLORE" &&
        resultC2.findings.length >= 2 &&
        rigC2.branchExecutions.length >= 2,
      `status=${resultC2.status} kind=${resultC2.executionKind} findings=${resultC2.findings.length} branchExecutions=${rigC2.branchExecutions.length} texts=${JSON.stringify(textsOf(resultC2.findings))}`,
    );

    // C3 — the safe fallback: a collaboration service composed WITHOUT an advisor
    // cannot select an architecture, so AUTO must fall back to FOCUS and NAME the
    // fallback rather than guess. (UX-C §7: a normal install with a local peer now
    // always has a memoryless advisor, so the fallback is proven through the service
    // itself rather than through a starved install.)
    const bareService = interaction.makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: recipes.builtinRecipeRegistry(),
    });
    const planC3 = await bareService.plan({ task: EXPLORE_TASK, intent: "AUTO", requestedBy: "dogfood:host" });
    const fallbackText = planC3.reason.join(" ");
    check(
      "C3_auto_without_advisor_falls_back_to_focus_and_names_it",
      planC3.executionKind === "PRINCIPAL_CONTINUES" &&
        planC3.effectiveBaseMode === "FOCUS" &&
        /no empirical architecture advisor is configured/u.test(fallbackText) &&
        /falls back to FOCUS/u.test(fallbackText),
      `executionKind=${planC3.executionKind} baseMode=${planC3.effectiveBaseMode} reason=${fallbackText.slice(0, 200)}`,
    );
    evidence.C3_fallback_reason = { ok: true, detail: fallbackText };

    // C4 — UX-C §7/§34 (CF-UXA-02): the SAME install without any OrganizationMemory
    // store now HAS a memoryless advisor and can AUTO-Explore, claiming no empirical
    // evidence. This is the new intended behaviour the C3 fallback no longer covers.
    const rigC4 = track(await makeRig(dir, "c4", { withAdvisor: false, withReasoning: true, verifiers: "none" }));
    const advisorC4 = rigC4.installed.application?.advisor ?? rigC4.installed.advisor;
    const resultC4 = await rigC4.collaboration.run({ task: EXPLORE_TASK, intent: "AUTO", requestedBy: "dogfood:host" });
    const recommendationC4 =
      advisorC4 === undefined ? undefined : await advisorC4.recommend({ taskProfile: await advisorC4.profile({ task: EXPLORE_TASK }) });
    check(
      "C4_memoryless_advisor_exists_and_auto_explores_without_empirical_claim",
      advisorC4 !== undefined &&
        recommendationC4 !== undefined &&
        recommendationC4.empiricalSupport.length === 0 &&
        resultC4.executionKind === "LOCAL_EXPLORE" &&
        resultC4.findings.length >= 2 &&
        rigC4.branchExecutions.length >= 2,
      `advisor=${advisorC4 !== undefined} empiricalSupport=${recommendationC4?.empiricalSupport.length ?? "n/a"} kind=${resultC4.executionKind} findings=${resultC4.findings.length} branchExecutions=${rigC4.branchExecutions.length}`,
    );
    note(
      "C_auto_needs_advisor",
      "AUTO selects EXPLORE only when an advisor is composed. UX-C §7/CF-UXA-02 changed the first-party install: the advisor is now composed whenever the installation can act (a local peer) OR an OrganizationMemory store was supplied, so a memoryless install can AUTO-Explore and claims no empirical evidence (C4). C3 proves the documented safe fallback through a collaboration service composed with NO advisor at all.",
    );

    /* ====================================================================== *
     * D. COORDINATE handoff (§34) with ZERO mutation
     * ====================================================================== */

    const rigD = track(
      await makeRig(dir, "d", { withAdvisor: true, withReasoning: false, verifiers: "none", knownPeerIds: [PEER_ID] }),
    );
    const surfaceD = rigD.installed.federation;
    check(
      "D_federation_surface_composed",
      surfaceD !== undefined,
      surfaceD === undefined
        ? "the install composed NO federation surface; zero-mutation is proven against the raw coordination rows that DO exist"
        : "installed.federation is present, so inbox/commitments and the raw coordination rows can both be compared",
    );
    if (surfaceD === undefined) {
      note("D_federation_absent", "This install composes no federation surface, so only the raw coordination store rows could be compared.");
    }

    const headBeforeD = rigD.head();
    const coordinationBeforeD = rawTableRows(rigD.coordinationPath, "coordination_events");
    const inboxBeforeD = surfaceD === undefined ? undefined : await surfaceD.inbox(LOCAL_PEER);
    const commitmentsBeforeD = surfaceD === undefined ? undefined : await surfaceD.commitments();
    const mutationBeforeD = rigD.mutationSurface();

    const planD = await rigD.collaboration.plan({ task: COORDINATE_TASK, intent: "AUTO", requestedBy: "dogfood:host" });
    const resultD = await rigD.collaboration.run({ task: COORDINATE_TASK, intent: "AUTO", requestedBy: "dogfood:host" });

    const coordinationAfterD = rawTableRows(rigD.coordinationPath, "coordination_events");
    const inboxAfterD = surfaceD === undefined ? undefined : await surfaceD.inbox(LOCAL_PEER);
    const commitmentsAfterD = surfaceD === undefined ? undefined : await surfaceD.commitments();
    const mutationAfterD = rigD.mutationSurface();

    check(
      "D_plan_and_run_are_cross_project_required",
      planD.executionKind === "CROSS_PROJECT_REQUIRED" && resultD.executionKind === "CROSS_PROJECT_REQUIRED" && resultD.status === "CROSS_PROJECT_REQUIRED",
      `plan.executionKind=${planD.executionKind} plan.effectiveBaseMode=${planD.effectiveBaseMode} result.executionKind=${resultD.executionKind} result.status=${resultD.status}`,
    );
    check(
      "D_peers_are_named",
      Array.isArray(resultD.details.peers) && resultD.details.peers.includes(PEER_ID),
      `details.peers=${JSON.stringify(resultD.details.peers)} unresolved=${JSON.stringify(resultD.unresolved)}`,
    );
    check(
      "D_zero_peer_message_and_zero_commitment",
      rigD.sent.length === 0 &&
        rigD.directoryCalls.length === 0 &&
        JSON.stringify(commitmentsAfterD ?? []) === JSON.stringify(commitmentsBeforeD ?? []) &&
        JSON.stringify(inboxAfterD ?? null) === JSON.stringify(inboxBeforeD ?? null),
      `sent=${rigD.sent.length} directoryCalls=${rigD.directoryCalls.length} commitments=${JSON.stringify(commitmentsAfterD ?? null)} inbox.received=${JSON.stringify(
        (inboxAfterD ?? {}).received ?? null,
      )} (a thread/contact-need would appear as a coordination_events row, checked below)`,
    );
    check(
      "D_raw_coordination_rows_byte_identical",
      coordinationBeforeD === coordinationAfterD,
      `before=${coordinationBeforeD} after=${coordinationAfterD}`,
    );
    check(
      "D_zero_project_mutation",
      rigD.head().revision === headBeforeD.revision &&
        rigD.head().digest === headBeforeD.digest &&
        JSON.stringify(mutationBeforeD) === JSON.stringify(mutationAfterD),
      `head before=${JSON.stringify(headBeforeD)} after=${JSON.stringify(rigD.head())} project/tasks/promotions/journal identical=${
        JSON.stringify(mutationBeforeD) === JSON.stringify(mutationAfterD)
      }`,
    );

    /* ====================================================================== *
     * E. No-CoT result proof (§19/§42)
     * ====================================================================== */

    const rigE = track(await makeRig(dir, "e", { withAdvisor: true, withReasoning: true, verifiers: "independent" }));
    const headBeforeE = rigE.head();
    const mutationBeforeE = rigE.mutationSurface();

    // The DSH tool: ONE high-level call, no cell/branch/recipe id from the caller.
    const rawE = await toolNamed(rigE, "palimpsest_collaborate").execute(
      { action: "run", task: GOLDEN_TASK, intent: "PARALLEL_AND_CHECK" },
      runContext("palimpsest_collaborate", { action: "run" }),
    );
    const resultE = rawE;
    const serializedE = JSON.stringify(resultE);

    const FORBIDDEN = [
      "scratchpad",
      "chain of thought",
      "chainOfThought",
      "chain_of_thought",
      "transcript",
      "messages",
      "brief",
      "branchBrief",
      "candidateDigest",
      "candidateRecord",
      "candidates",
      "acceptedClaims",
      "frontierBasis",
      "VERIFICATION_RECORDED",
      "ADMISSION_DECIDED",
      "CANDIDATE_SUBMITTED",
      "EVENT",
      "events",
      "[branch",
    ];
    const leaked = FORBIDDEN.filter((token) => serializedE.includes(token));
    check(
      "E_result_carries_no_branch_or_cot_machinery",
      leaked.length === 0,
      `forbidden tokens found=${JSON.stringify(leaked)}; payload bytes=${serializedE.length}`,
    );

    // Prove the finding contents ARE the admitted frontier claims, read back by the
    // dogfood itself from the canonical ReasoningCell service (not the projection).
    const cellId = resultE.details.cellId;
    const frontier = await rigE.installed.reasoningCells.service.frontier({ cellId });
    const active = await rigE.installed.reasoningCells.service.activeClaims({ cellId });
    const frontierByClaim = new Map(frontier.claims.map((entry) => [entry.ref.claimId, entry.claim.content]));
    const activeByClaim = new Map(active.map((entry) => [entry.ref.claimId, entry.claim.content]));
    const mutationAfterE = rigE.mutationSurface();
    const everyFindingIsAnAdmittedClaim =
      resultE.findings.length > 0 &&
      resultE.findings.every(
        (finding) =>
          frontierByClaim.has(finding.claimId) &&
          activeByClaim.has(finding.claimId) &&
          JSON.stringify(frontierByClaim.get(finding.claimId)) === JSON.stringify(finding.content) &&
          JSON.stringify(activeByClaim.get(finding.claimId)) === JSON.stringify(finding.content),
      );
    check(
      "E_finding_content_equals_the_admitted_frontier_claim",
      everyFindingIsAnAdmittedClaim &&
        frontier.claims.length === resultE.findings.length &&
        active.length === resultE.findings.length,
      `frontier claims=${frontier.claims.length} activeClaims=${active.length} findings=${resultE.findings.length} equal=${everyFindingIsAnAdmittedClaim} findings=${JSON.stringify(
        textsOf(resultE.findings),
      )}`,
    );

    check(
      "E_no_projectir_revision_and_no_journal_or_decision_write",
      rigE.head().revision === headBeforeE.revision &&
        rigE.head().digest === headBeforeE.digest &&
        JSON.stringify(mutationBeforeE) === JSON.stringify(mutationAfterE),
      `head before=${JSON.stringify(headBeforeE)} after=${JSON.stringify(rigE.head())}; project/tasks/promotions/journal identical=${
        JSON.stringify(mutationBeforeE) === JSON.stringify(mutationAfterE)
      }`,
    );
    evidence.E_payload_keys = { ok: true, detail: Object.keys(resultE).sort() };
    evidence.E_summary = { ok: true, detail: resultE.summary };

    /* ====================================================================== *
     * §42 extra: the separately-owned AE-R boundary dogfood remains green
     * ====================================================================== */

    const aer = spawnSync(process.execPath, [join(REPO, "scripts", "scope", "aer-boundary-dogfood.mjs")], {
      encoding: "utf8",
      cwd: REPO,
      timeout: 300_000,
    });
    const aerLines = `${aer.stdout ?? ""}`.trim().split("\n");
    const aerPassLine = aerLines.length === 0 ? "<no output>" : aerLines[aerLines.length - 1].trim();
    check(
      "AE_R_boundary_dogfood_remains_green",
      aer.status === 0 && aerPassLine === "pass=true",
      `exit=${aer.status} final=${aerPassLine}`,
    );
  } finally {
    for (const rig of rigs.splice(0)) {
      await rig.dispose();
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
    }
  }

  const summary = {
    evidence,
    honestNotes,
    failures,
    pass: failures.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(`pass=${failures.length === 0}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
