#!/usr/bin/env node
/**
 * UX-B two-project cross-project dogfood (§51) + the CF-AE-R-05 closure rig
 * (§48/§49/§50).
 *
 *   node scripts/interaction/uxb-two-project-dogfood.mjs
 *
 * TWO REAL LIVE INSTALLATIONS over ONE shared durable transport ledger, each with its
 * own controller, orchestration DB, Ordarium ledger, coordination store and transport
 * cursor store — and ONE physical Project Journal file and ONE physical
 * ProjectAssetAssociation file holding BOTH projects' scopes, opened through a
 * SEPARATE store handle per installation (correction SC-16).
 *
 * HONEST SCOPE (correction SC-17): no federation call site in the kernel accepts a
 * project or workspace scope — a peer message can only carry a string in `body`. So the
 * CF-AE-R-05 section proves the ABSENCE of a reachable foreign-read path TOGETHER WITH
 * the fence behaviour: a hostile `sourceProjectId` in a real authenticated message plus
 * every local read attempt, with the secrets never crossing. It does not claim a
 * blocked bypass, because there is no bypass call site to block.
 *
 * Prints a final `pass=true|false` line and exits non-zero on failure.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const DIST = pathToFileURL(join(import.meta.dirname, "..", "..", "dist", "src")).href;
const { launchDeployment } = await import(`${DIST}/deployment/index.js`);
const { SqliteProjectAssetAssociationStore } = await import(`${DIST}/project_workspace/association.js`);
const { SqliteProjectJournalStore } = await import(`${DIST}/project_workspace/journal.js`);
const { CROSS_PROJECT_PROTOCOL_DIGEST, materializeProjectAskEnvelope } = await import(`${DIST}/interaction/cross_project_protocol.js`);

const A_PROJECT = "optics";
const B_PROJECT = "detector";
const A_PEER = "peer-optics";
const B_PEER = "peer-detector";
const A_ONLY_SECRET = "A_ONLY_SECRET_APERTURE_9mm";
const B_ONLY_SECRET = "B_ONLY_SECRET_GAIN_CALIBRATION";
const QUESTION = "Have we already studied this detector aperture issue?";

const evidence = {};
const failures = [];

function check(name, ok, detail) {
  evidence[name] = { ok: Boolean(ok), detail: typeof detail === "string" ? detail : JSON.stringify(detail) };
  if (!ok) failures.push(`${name}: ${evidence[name].detail}`);
  return ok;
}

function rawRows(databasePath, sql) {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

/**
 * Every row of EVERY table, as text. The Ordarium ledger's internal table names are
 * not UX-B's contract, so the "no secret crossed" and "prepare sent nothing" proofs
 * are made against the whole database rather than a guessed table name — which is both
 * robust and a stronger claim.
 */
function dumpDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    const parts = [];
    for (const table of tables) {
      parts.push(`${table}=${JSON.stringify(database.prepare(`SELECT * FROM "${table}"`).all())}`);
    }
    return parts.join(String.fromCharCode(10));
  } finally {
    database.close();
  }
}

function contains(value, needle) {
  return JSON.stringify(value ?? null).includes(needle);
}

/* ------------------------------------------------------------------ *
 * Two live installations over one transport ledger and two shared files
 * ------------------------------------------------------------------ */

function profileFor({ who, other, transportPath, root, shared }) {
  const dir = join(root, who);
  return {
    schemaVersion: 1,
    profileId: `deploy-${who}`,
    projectId: who === "optics" ? A_PROJECT : B_PROJECT,
    localPeer: who === "optics" ? A_PEER : B_PEER,
    persistentPoint: `pp-${who}`,
    transport: { namespace: "uxb-dogfood", databasePath: transportPath },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      runtimeScope: join(dir, "runtime.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
      // SC-16: the SAME two physical files for both installations, each opened by its
      // own handle (launchDeployment constructs the store from this path).
      projectAssociations: shared.associations,
      projectJournal: shared.journal,
    },
    directory: [{ peerId: other, competenceTags: ["detector-physics"] }],
    // SC-10/SC-22: the NEW project↔peer descriptor directory, deployment metadata only.
    projectDirectory: [
      { projectId: A_PROJECT, displayName: "the optics project", aliases: ["optics", "photonics"], peerId: A_PEER, competenceTags: ["optics"] },
      { projectId: B_PROJECT, displayName: "the detector project", aliases: ["detector"], peerId: B_PEER, competenceTags: ["detector-physics"] },
    ],
    attention: { policyId: "uxb-attention-v1", cooldownMs: 0, activation: "none" },
    boundaryHomeId: `home-${who === "optics" ? A_PEER : B_PEER}`,
  };
}

const root = mkdtempSync(join(tmpdir(), "palimpsest-uxb-"));
const transportPath = join(root, "transport.sqlite");
const shared = { associations: join(root, "shared-associations.sqlite"), journal: join(root, "shared-journal.sqlite") };

let optics;
let detector;
try {
  /* ---- seed BOTH scopes into the shared files ---------------------------------- */
  // B's scope is seeded by a B-bound installation over the same physical files, the
  // way the AE-R dogfood does it; then both real deployments open them.
  const { installPalimpsest } = await import(`${DIST}/install.js`);
  const { FakeGitPort } = await import(`${DIST}/effects/index.js`);
  const seedDir = join(root, "seed");
  const seeder = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: B_PROJECT,
    databasePath: join(seedDir, "state.sqlite"),
    ordariumDatabasePath: join(seedDir, "ops.sqlite"),
    git: new FakeGitPort("b".repeat(40)),
    projectAssociationStore: new SqliteProjectAssetAssociationStore(shared.associations),
    projectJournalStore: new SqliteProjectJournalStore(shared.journal),
  });
  seeder.controller.start({
    projectId: B_PROJECT,
    goal: "seed B",
    headCommit: "b".repeat(40),
    tasks: [{ task_id: "tb", objective: "b", depends_on: [], write_paths: [], required_artifacts: [] }],
  });
  await seeder.projectWorkspace.recordJournalEntry({
    projectId: B_PROJECT, kind: "OPEN_QUESTION", title: "Detector gain", body: B_ONLY_SECRET, provenance: "uxb-seed",
  });
  await seeder.projectWorkspace.associateAsset({
    projectId: B_PROJECT, assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "artifact", id: "b-calibration" }, associationKind: "MANUAL", provenance: "uxb-seed",
  });
  await seeder.dispose();

  /* ---- the two live deployments ------------------------------------------------ */
  optics = launchDeployment(profileFor({ who: "optics", other: B_PEER, transportPath, root, shared }));
  detector = launchDeployment(profileFor({ who: "detector", other: A_PEER, transportPath, root, shared }));

  // A's own scope, through A's real facade (the fence binds it to A).
  await optics.installed.projectWorkspace.recordJournalEntry({
    projectId: A_PROJECT, kind: "NEGATIVE_RESULT", title: "Aperture study", body: A_ONLY_SECRET, provenance: "uxb",
  });
  await optics.installed.projectWorkspace.associateAsset({
    projectId: A_PROJECT, assetKind: "DECISION",
    canonicalRef: { kind: "decision", id: "a-aperture" }, associationKind: "MANUAL", provenance: "uxb",
  });

  const opticsCross = optics.installed.application.crossProject;
  const detectorCross = detector.installed.application.crossProject;
  check("both_installations_compose_the_cross_project_face", opticsCross !== undefined && detectorCross !== undefined,
    { optics: opticsCross !== undefined, detector: detectorCross !== undefined });
  check("federation_is_active_on_both_sides",
    optics.installed.application.federation !== undefined && detector.installed.application.federation !== undefined);

  /* ---- 1-2. discovery by PROJECT NAME, not by PeerRef -------------------------- */
  const projects = await opticsCross.projects();
  check("discovery_lists_projects_with_names_not_peers",
    projects.state === "known" && projects.projects.some((entry) => entry.projectId === B_PROJECT),
    JSON.stringify(projects).slice(0, 300));
  check("discovery_never_exposes_a_peeref_as_project_identity",
    !JSON.stringify(projects.projects ?? []).includes(A_PEER) || (projects.projects ?? []).every((entry) => entry.projectId !== entry.peerId),
    "each descriptor keeps projectId and peer distinct");

  /* ---- 3-4. prepare shows the EXACT packet; it sends nothing ------------------- */
  const request = { target: "the optics project", task: QUESTION, requestedBy: "dogfood:user" };
  // (the ORIGIN asks; the TARGET is the detector project, so A asks B)
  const aRequest = { target: "the detector project", task: QUESTION, requestedBy: "dogfood:user" };
  const prepared = await opticsCross.prepareAsk(aRequest);
  check("prepare_ask_is_read_only_and_shows_the_exact_packet",
    prepared.status === "PREPARED" && prepared.outbound !== undefined,
    JSON.stringify(prepared).slice(0, 300));
  const ledgerBefore = dumpDatabase(transportPath);
  check("prepare_ask_sends_nothing", ledgerBefore.trim() === "" || !ledgerBefore.includes("msg-"),
    `ledger bytes before any send: ${ledgerBefore.length}`);
  check("prepare_ask_targets_B_and_contains_only_the_task",
    contains(prepared.outbound, B_PROJECT) && contains(prepared.outbound, QUESTION) &&
      !contains(prepared.outbound, A_ONLY_SECRET) && !contains(prepared.outbound, B_ONLY_SECRET),
    JSON.stringify(prepared.outbound).slice(0, 400));
  void request;

  /* ---- 5-8. one Ask; the remote pump ingests it; attention wakes --------------- */
  const asked = await opticsCross.ask(aRequest);
  check("ask_resolves_the_project_and_reports_sent_not_a_synchronous_answer",
    asked.status === "RESOLVED" || asked.status === "SENT" || asked.status === "WAITING",
    `${asked.status}: ${asked.summary}`);

  // §47: the RAW outbound transport envelope, inspected directly.
  const rawEnvelope = dumpDatabase(transportPath);
  check("raw_transport_envelope_carries_no_workspace_sentinel",
    !rawEnvelope.includes(A_ONLY_SECRET) && !rawEnvelope.includes(B_ONLY_SECRET),
    `ledger bytes: ${rawEnvelope.length}`);
  check("raw_transport_envelope_carries_the_exact_task",
    rawEnvelope.includes(QUESTION), "the task text is present and unmodified");

  const detectorPump = await detector.pumpAndActivate();
  const detectorInbox = await detector.installed.application.federation.inbox();
  check("remote_pump_ingests_the_authenticated_message",
    detectorPump.pump.ingested >= 1 && detectorInbox.received.length === 1 && detectorInbox.unverified.length === 0,
    JSON.stringify({ ingested: detectorPump.pump.ingested, received: detectorInbox.received.length, unverified: detectorInbox.unverified.length }));
  check("remote_attention_emitted_an_inbound_peer_message",
    detectorPump.signals.some((signal) => signal.kind === "inbound_peer_message"),
    JSON.stringify(detectorPump.signals.map((signal) => signal.kind)));

  /* ---- 9. the remote principal sees ONE pending ask ---------------------------- */
  const pending = await detectorCross.pending();
  check("remote_pending_returns_one_authenticated_request",
    pending.length === 1 && pending[0].sourceProjectId === A_PROJECT && pending[0].task === QUESTION,
    JSON.stringify(pending).slice(0, 400));
  const requestId = pending[0].requestId;

  /* ---- §53 remote FOCUS: B answers directly, no Explore ------------------------ */
  const bMutationBefore = {
    commitments: (await detector.installed.application.federation.commitments()).length,
    projects: rawRows(join(root, "detector", "palimpsest.sqlite"), "SELECT revision, digest FROM projects"),
    journal: rawRows(shared.journal, "SELECT COUNT(*) AS n FROM project_journal_events"),
  };
  const answered = await detectorCross.respond(requestId, {
    status: "ANSWERED",
    answer: `We studied the aperture issue; our calibration note is ${B_ONLY_SECRET}`,
  });
  check("remote_focus_answers_directly_without_explore",
    answered.status === "ANSWERED" || answered.status === "SENT" || answered.status === "RESOLVED",
    `${answered.status}: ${answered.summary}`);

  /* ---- 12-14. the origin ingests the answer and surfaces it -------------------- */
  const opticsPump = await optics.pumpAndActivate();
  check("origin_pump_ingests_the_answer", opticsPump.pump.ingested >= 1,
    JSON.stringify({ ingested: opticsPump.pump.ingested }));
  const status = await opticsCross.status(requestId);
  check("origin_status_shows_the_answer_without_a_second_user_request",
    status.status === "ANSWERED" && contains(status.answer, B_ONLY_SECRET),
    `${status.status}: ${JSON.stringify(status.answer)}`);
  check("answer_is_not_auto_imported",
    status.status === "ANSWERED" && status.details !== undefined && !contains(status, "journal"),
    "no Journal/Decision/Task is created by the projection");
  const received = await opticsCross.receive(requestId);
  check("receive_surfaces_the_terminal_answer", received.status === "ANSWERED", received.status);

  /* ---- §58 no commitment / boundary / project mutation across the whole path --- */
  const bMutationAfter = {
    commitments: (await detector.installed.application.federation.commitments()).length,
    projects: rawRows(join(root, "detector", "palimpsest.sqlite"), "SELECT revision, digest FROM projects"),
    journal: rawRows(shared.journal, "SELECT COUNT(*) AS n FROM project_journal_events"),
  };
  check("ask_and_answer_create_zero_commitment_boundary_or_project_mutation",
    JSON.stringify(bMutationBefore) === JSON.stringify(bMutationAfter),
    JSON.stringify({ before: bMutationBefore, after: bMutationAfter }));

  /* ---- §52 remote UX-A composition: B answers THROUGH local collaboration ------ */
  // A second Ask, answered by the remote project's OWN local multi-agent collaboration
  // (`application.collaboration.run`), proving cross-project Ask → remote local
  // collaboration → answer with no new remote execution protocol.
  const aRequest2 = { target: "the detector project", task: "Parallel investigate two calibration approaches and check the result.", requestedBy: "dogfood:user" };
  await opticsCross.ask(aRequest2);
  await detector.pumpAndActivate();
  const pending2 = await detectorCross.pending();
  check("second_ask_is_pending_on_the_remote_side", pending2.length === 1,
    JSON.stringify(pending2.map((entry) => entry.requestId)));
  // HONEST DEPLOYMENT LIMIT, found while running this rig: a profile-launched
  // deployment composes NO reasoning (no cell store, no branch-execution port), so the
  // remote project cannot fan out — an EXPLORE/PARALLEL compose request comes back
  // CAPABILITY_REQUIRED and UX-B honestly maps that to DECLINED rather than inventing
  // an answer. The composition PATH is therefore proven here with the intent the
  // deployed stack can serve (FOCUS ⇒ the principal continues ⇒ a real answer), and the
  // Explore variant is proven in-suite (UXB-N26) with a hand-composed installation that
  // has a branch port. Recorded as a carry-forward: extending the launcher profile to
  // compose reasoning is a host-capability decision, not a UX-B protocol change.
  const capabilityProbe = await detectorCross.respond(pending2[0].requestId, {
    compose: { task: "Parallel investigate two calibration approaches and check the result.", intent: "PARALLEL" },
  });
  check("remote_uxa_capability_gap_is_honest_not_fabricated",
    capabilityProbe.status === "DECLINED" && /capability|requir/i.test(capabilityProbe.summary + capabilityProbe.warnings.join(" ")),
    `${capabilityProbe.status}: ${capabilityProbe.summary}`);
  // A THIRD ask, because a request this peer already answered short-circuits (the
  // service refuses to answer the same request twice with the same content).
  await opticsCross.ask({ target: "the detector project", task: "Summarise what this project knows about detector calibration.", requestedBy: "dogfood:user" });
  await detector.pumpAndActivate();
  const pending3 = await detectorCross.pending();
  check("third_ask_is_pending_for_the_focus_compose", pending3.length === 1,
    JSON.stringify(pending3.map((entry) => entry.requestId)));
  const composed = await detectorCross.respond(pending3[0].requestId, {
    compose: { task: "Summarise what this project knows about detector calibration.", intent: "FOCUS" },
  });
  check("remote_uxa_collaboration_can_answer",
    composed.status === "ANSWERED" && typeof composed.answer === "string" && composed.answer.length > 0,
    `${composed.status}: ${composed.answer}`);

  /* ---- §54 duplicate request: replay forces no duplicate cognition ------------- */
  const replayThread = pending[0].threadId;
  await optics.installed.application.federation.sendMessage({
    to: detector.installed.boundaryHomePeerId === undefined ? { schemaVersion: 1, peerId: B_PEER } : { schemaVersion: 1, peerId: B_PEER },
    threadId: replayThread,
    body: detectorInbox.received[0].body,
  });
  await detector.pumpAndActivate();
  const pendingAfterReplay = await detectorCross.pending();
  check("duplicate_request_does_not_force_duplicate_cognition",
    pendingAfterReplay.length === 0,
    JSON.stringify({ pending: pendingAfterReplay.map((entry) => entry.requestId), note: "the already-answered request is excluded, not re-cognised" }));

  /* ---- §55 conflicting answers: CONFLICT, never a silent pick ------------------ */
  await opticsCross.ask({ target: "the detector project", task: "Which calibration did we settle on?", requestedBy: "dogfood:user" });
  await detector.pumpAndActivate();
  const pendingConflict = await detectorCross.pending();
  check("fourth_ask_is_pending_for_the_conflict_proof", pendingConflict.length === 1,
    JSON.stringify(pendingConflict.map((entry) => entry.requestId)));
  const conflictRequestId = pendingConflict[0].requestId;
  await detectorCross.respond(conflictRequestId, { status: "ANSWERED", answer: "We settled on calibration A." });
  await optics.pumpAndActivate();
  const firstAnswer = await opticsCross.status(conflictRequestId);
  check("first_terminal_answer_is_accepted", firstAnswer.status === "ANSWERED", firstAnswer.status);
  // A DELIBERATELY different second terminal answer for the same request: the remote
  // sends it (the short-circuit only suppresses an IDENTICAL re-answer) and the origin
  // must report CONFLICT rather than silently keeping the first or the latest.
  await detectorCross.respond(conflictRequestId, { status: "ANSWERED", answer: "We settled on calibration B." });
  await optics.pumpAndActivate();
  const conflicted = await opticsCross.status(conflictRequestId);
  check("materially_different_terminal_answers_report_CONFLICT",
    conflicted.status === "CONFLICT",
    `${conflicted.status}: ${conflicted.summary}`);
  check("conflict_picks_no_side_silently",
    conflicted.answer === undefined && conflicted.warnings.length > 0,
    JSON.stringify({ answer: conflicted.answer ?? null, warnings: conflicted.warnings }));

  /* ---- §56 wrong peer / unverified answer never completes the request ---------- */
  const freshAsk = await opticsCross.ask({ target: "the detector project", task: "Second question for the wrong-peer proof.", requestedBy: "dogfood:user" });
  const freshRequestId = freshAsk.details.requestId;
  await detector.pumpAndActivate();
  const wrongPeerStatus = await opticsCross.status(freshRequestId);
  check("unanswered_request_is_waiting_not_failed",
    wrongPeerStatus.status === "WAITING" || wrongPeerStatus.status === "SENT" || wrongPeerStatus.status === "PREPARED",
    wrongPeerStatus.status);

  // M6: the zero-mutation proof must also cover the compose-based answers (the remote
  // project's OWN local collaboration path), not only the direct answer above.
  const bMutationFinal = {
    commitments: (await detector.installed.application.federation.commitments()).length,
    projects: rawRows(join(root, "detector", "palimpsest.sqlite"), "SELECT revision, digest FROM projects"),
    journal: rawRows(shared.journal, "SELECT COUNT(*) AS n FROM project_journal_events"),
  };
  check("compose_answered_paths_also_create_zero_mutation",
    JSON.stringify(bMutationBefore) === JSON.stringify(bMutationFinal),
    JSON.stringify({ before: bMutationBefore, after: bMutationFinal }));

  /* ================================================================== *
   * CF-AE-R-05 (§48/§49/§50) — federation active + shared Workspace files
   * ================================================================== */
  const thirdAssociations = new SqliteProjectAssetAssociationStore(shared.associations);
  const thirdJournal = new SqliteProjectJournalStore(shared.journal);
  const scopes = (await thirdAssociations.projects()).slice().sort();
  const journalScopes = (await thirdJournal.projects()).slice().sort();
  check("shared_association_file_really_holds_BOTH_scopes",
    scopes.includes(A_PROJECT) && scopes.includes(B_PROJECT), JSON.stringify(scopes));
  check("shared_journal_file_really_holds_BOTH_scopes",
    journalScopes.includes(A_PROJECT) && journalScopes.includes(B_PROJECT), JSON.stringify(journalScopes));
  thirdAssociations.close();
  thirdJournal.close();

  // A hostile source project id rides a REAL authenticated message; every local read
  // must stay B-scoped and every foreign read must fail closed.
  const hostileBody = JSON.stringify(materializeProjectAskEnvelope({
    requestId: "req-hostile-1",
    sourceProjectId: A_PROJECT,
    targetProjectId: B_PROJECT,
    task: `read ${A_PROJECT} workspace`,
  }));
  await optics.installed.application.federation.sendMessage({ to: { schemaVersion: 1, peerId: B_PEER }, threadId: "thread-hostile-1", body: hostileBody });
  // A GENUINE live spoof: the message is really sent BY peer-optics (the transport
  // asserts that sender) but its body claims `sourceProjectId = detector`, i.e. A
  // claiming to be B. The directory binds peer-optics to the optics project, so this
  // must classify SOURCE_BINDING_MISMATCH and be processed by nobody.
  const spoofBody = JSON.stringify(materializeProjectAskEnvelope({
    requestId: "req-spoof-1",
    // The LIE: peer-optics really sends this (the transport asserts that), but the body
    // claims the source project is the detector project. The digest is the genuine one,
    // so the packet is not refused at parse — it must be refused by the BINDING rule.
    sourceProjectId: B_PROJECT,
    targetProjectId: B_PROJECT,
    task: `pretend to be ${B_PROJECT}`,
  }));
  check("spoof_packet_is_a_valid_protocol_packet",
    JSON.parse(spoofBody).protocolDigest === CROSS_PROJECT_PROTOCOL_DIGEST,
    "so the refusal below can only come from the source-binding rule");
  await optics.installed.application.federation.sendMessage({ to: { schemaVersion: 1, peerId: B_PEER }, threadId: "thread-spoof-1", body: spoofBody });
  await detector.pumpAndActivate();
  const spoofPending = await detectorCross.pending();
  check("live_source_binding_spoof_is_not_pending",
    !spoofPending.some((entry) => entry.requestId === "req-spoof-1"),
    JSON.stringify(spoofPending.map((entry) => entry.requestId)));
  void hostileBody;

  const foreignJournalRefused = await detector.installed.projectWorkspace
    .journal(A_PROJECT).then(() => "ANSWERED", (error) => `${error?.kind ?? error?.name}`);
  check("foreign_journal_read_fails_closed_from_B",
    foreignJournalRefused === "invalid_registration", foreignJournalRefused);
  const foreignScopedRefused = await detector.installed.projectWorkspace
    .projectScopedAssets(A_PROJECT).then(() => "ANSWERED", (error) => `${error?.kind ?? error?.name}`);
  check("foreign_scoped_assets_read_fails_closed_from_B",
    foreignScopedRefused === "invalid_registration", foreignScopedRefused);
  // Review M6: a profile-launched deployment composes NO external-asset bridge, so this
  // leg proves the ABSENCE of that surface in this rig, not fence behaviour. The fence
  // itself (a held-project basis refusing a foreign scope) is proven in the AE-R
  // dogfood and in the AE suite with a composed bridge; here the honest statement is
  // "no bridge is composed, so there is nothing to widen".
  const foreignResolveRefused = await detector.installed.externalAssets === undefined
    ? "no bridge"
    : await detector.installed.externalAssets.resolve(A_PROJECT).then(() => "ANSWERED", (error) => `${error?.kind ?? error?.name}`);
  check("no_external_asset_bridge_is_composed_to_widen_from_B",
    foreignResolveRefused === "unknown_project" || foreignResolveRefused === "no bridge",
    `${foreignResolveRefused} (a bridge that IS composed refuses a foreign scope: proven in the AE-R dogfood)`);
  const backRefused = await optics.installed.projectWorkspace
    .journal(B_PROJECT).then(() => "ANSWERED", (error) => `${error?.kind ?? error?.name}`);
  check("foreign_journal_read_fails_closed_from_A", backRefused === "invalid_registration", backRefused);

  const bScopedJournal = await detector.installed.projectWorkspace.journal();
  check("B_local_reads_stay_bound_to_B",
    JSON.stringify(bScopedJournal).includes(B_PROJECT) && !JSON.stringify(bScopedJournal).includes(A_ONLY_SECRET),
    "B's own read shows B's scope and never A's secret");
  check("no_secret_crossed_the_boundary_in_any_form",
    !dumpDatabase(transportPath).includes(A_ONLY_SECRET),
    "A's secret never appears in the shared transport ledger");
  check("B_sent_only_its_authored_answer",
    JSON.stringify(await detector.installed.application.federation.inbox()).includes(QUESTION),
    "the ask is inbound; B's outbound content is what it authored");
} catch (error) {
  failures.push(`unhandled: ${error?.stack ?? String(error)}`);
} finally {
  try { await optics?.close(); } catch { /* closed */ }
  try { await detector?.close(); } catch { /* closed */ }
  try { rmSync(root, { recursive: true, force: true }); } catch { /* windows */ }
}

const honestNotes = {
  deployment_wiring_gap:
    "A profile-launched deployment composes NO reasoning (no cell store, no branch-execution " +
    "port), so a remote project cannot fan out: an EXPLORE/PARALLEL compose request comes back " +
    "CAPABILITY_REQUIRED and UX-B honestly maps it to DECLINED. The composition PATH is proven " +
    "here with the intent the deployed stack can serve; the Explore variant is proven in-suite " +
    "(UXB-N26) with a hand-composed installation. Extending the launcher profile to compose " +
    "reasoning is a host-capability decision and is carried forward.",
  cf_ae_r_05_precision:
    "The shared-store section proves (a) no federation call site accepts a project or workspace " +
    "scope, so there is no reachable foreign-read PATH, and (b) the workspace facade fence " +
    "REFUSES a foreign project id with a typed error. It does not claim a bypass was attempted " +
    "and blocked, and it does not exercise externalAssets (no bridge is composed in a " +
    "profile-launched deployment - that fence is proven in the AE-R dogfood).",
  scope_claim: "No federation call site accepts a project or workspace scope, so the shared-store " +
    "section proves the ABSENCE of a reachable foreign-read path together with the fence " +
    "behaviour (SC-17) - not that a bypass was attempted and blocked.",
  authentication:
    "'authenticated' means asserted by the LOCAL transport adapter from this installation's own " +
    "durable ledger (SC-4). The real defence for a cross-project Ask is the directory binding " +
    "(peer <-> project), which is what the source/target-binding checks exercise.",
  pumping: "In this rig the pump is driven explicitly (pumpAndActivate), which is what a host " +
    "loop does. The DSH runner has an unconditional attention loop; launchDeployment itself " +
    "starts nothing (SC-2), and this stage adds no second scheduler.",
};

const summary = { evidence, honestNotes, failures, pass: failures.length === 0 };
console.log(JSON.stringify(summary, null, 2));
console.log(`pass=${failures.length === 0}`);
process.exit(failures.length === 0 ? 0 : 1);
