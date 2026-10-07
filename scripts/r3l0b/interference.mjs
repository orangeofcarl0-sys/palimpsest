/**
 * R3-L0B §5/§6/§7/§8 — THE R3-L0 INTERFERENCE GRAPH.
 *
 * §5 requires a `session -> artifact access` graph for all 24 sessions, built from EXISTING durable artifacts
 * and transcripts only, with no new worker call. §6, §7 and §8 then adjudicate that graph: treatment spillover,
 * outcome-oracle exposure, and the clean/contaminated map.
 *
 * WHY THIS IS RECONSTRUCTED FROM `tool/ptc-dispatch` RATHER THAN FROM TEXT SEARCH. The R3-L0A audit matched
 * substrings against a session's whole decompressed text, which reports that a path APPEARED somewhere — in the
 * worker's own arguments, in a harness echo, or in a returned body. Those are different experimental facts. The
 * packaged runtime records each tool invocation separately, with its `name`, its `arguments`, its `isError` flag
 * and the `content` it returned. That record is what makes §5's question ("was content actually returned")
 * answerable instead of guessed.
 *
 * TWO DISTINCT FACTS, KEPT APART. This module separates:
 *
 *   NAMED ACCESS    the worker NAMED a path outside its world. It asked. The read may have been refused.
 *   CONTENT EXPOSURE what the returned content ACTUALLY CONTAINED. This is what §6 means by exposure, and it is
 *                   the only thing that can establish that an artifact reached a session.
 *
 * A worker that lists a shared directory has NAMED the directory and RECEIVED its listing; whether that listing
 * carries a sibling unit's diagnostics is a question about the content, and only the content answers it. §6's bar
 * is enforced in the code, not in prose: a sibling read is `TREATMENT_SPILLOVER_CONFIRMED` only when content was
 * actually returned, so file visibility alone can never be promoted to influence.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { isAbsolute, join, normalize as normalizePath, resolve } from 'node:path';

import { decompressFrames, sessionArtifacts, sessionRecords } from '../r3l0a/path-audit.mjs';
import { ACCESS_OPERATIONS, EXPOSURE_CLASSES, SPILLOVER_CLASSES, adjudicateSpillover, labelSession } from './contract.mjs';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

/** Fold Windows separators to POSIX so one spelling matches every path. */
function fold(text) {
  return String(text).split(BS + BS).join('/').split(BS).join('/');
}

/** The checkout root as it appears in a session, used to recognise a checkout reference. */
export const CHECKOUT_MARKER = 'Codex_Work_Space/Palimpsest/palimpsest-sr1';

/** §5: the trajectory ids, so an access can be attributed to the unit it names. */
export const TRAJECTORY_IDS = Object.freeze(['b0-C', 'b0-H', 'b1-C', 'b1-H', 'b2-C', 'b2-H', 'b3-C', 'b3-H']);

/** §5: the host-private files the harness itself writes into a trajectory's control directory. */
const CONTROL_FILE_PREFIXES = Object.freeze(['payload-', 'spec-', 'report-', 'transcript-']);
const CONTROL_FILE_NAMES = Object.freeze(['trials.partial.json', 'trials.json', 'matrix.json']);

/** The checkout-relative paths that constitute the outcome instrument and the analysis. */
const ORACLE_PATHS = Object.freeze(['scripts/r3l0/diagnostic.mjs', 'scripts/r3l0/project.mjs', 'scripts/r3l0a/']);
const HARNESS_PATHS = Object.freeze(['scripts/r3l0/']);

/** A result that is a refusal or an empty result is NOT returned content. */
const EMPTY_RESULT_PATTERNS = Object.freeze([/^no matches/iu, /^found 0 /iu]);

/**
 * §5/§6: THE CONTENT SIGNATURES.
 *
 * Each is a string that appears only in the artifact it names, so a match in RETURNED CONTENT is evidence that
 * the artifact reached the session. Deliberately precise: a loose pattern would over-report exposure and make
 * the finding useless in the other direction.
 */
export const CONTENT_SIGNATURES = Object.freeze({
  /**
   * The oracle's own vocabulary. §10 says the oracle is invisible to the worker.
   *
   * Deliberately narrowed to `diagnosticVector` and the oracle's header: `classPass` and `DIAGNOSTIC_CLASSES`
   * also appear in the worker's OWN result submission (the worker submits `classPass: true`), so matching them
   * would report every session as oracle-exposed. The first version of this file did exactly that and reported
   * 24 contaminated sessions; the signatures below are the correction.
   */
  ORACLE_CONTENT: Object.freeze(['diagnosticVector', 'THE RESEARCH DIAGNOSTIC ORACLE', 'judgeCase']),
  /** The harness control payload the generation child wrote for its own bookkeeping. */
  CONTROL_PAYLOAD_CONTENT: Object.freeze(['compiledHandleCount']),
  /** The generation spec, which names the harness paths. */
  GENERATION_SPEC_CONTENT: Object.freeze(['"teePath"', '"payloadSink"']),
  /** The frozen schedule and the primary evidence records. */
  PRIMARY_EVIDENCE_CONTENT: Object.freeze(['"infrastructureInvalid"', '"startingHead"', '"trajectoryId"']),
  /** The checkout itself. */
  CHECKOUT_CONTENT: Object.freeze([CHECKOUT_MARKER]),
  /** The project's own incident documents — ORDINARY project history, which R3-L0 §17 says is NOT leakage. */
  INCIDENT_DOCUMENT: Object.freeze(['Incident 1 — applyChanges applied before it validated', 'Incident 2 — recomputeIndex lost the edges it needed']),
  /** The visible oracle, which is ordinary project verification. */
  VISIBLE_ORACLE: Object.freeze(['the visible oracle passes']),
});

/** §5: which content signatures are host-private experimental artifacts rather than ordinary project history. */
export const HOST_PRIVATE_CONTENT_SIGNATURES = Object.freeze(['ORACLE_CONTENT', 'CONTROL_PAYLOAD_CONTENT', 'GENERATION_SPEC_CONTENT', 'PRIMARY_EVIDENCE_CONTENT', 'CHECKOUT_CONTENT']);

/* ================================================================ reading a dispatch */

/** Extract the arguments of a dispatch as a string, whatever shape the runtime recorded. */
function argsText(data) {
  const raw = data?.arguments;
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  try { return JSON.stringify(raw); } catch { return String(raw); }
}

/** Extract the returned content of a dispatch as a string. */
export function contentTextOf(data) {
  const raw = data?.content;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((entry) => (typeof entry === 'string' ? entry : entry?.text ?? '')).join(NL);
  if (raw === null || raw === undefined) return '';
  try { return JSON.stringify(raw); } catch { return String(raw); }
}

/** §5: whether a dispatch actually RETURNED content, which §6 requires for a confirmed exposure. */
export function contentReturnedOf(data) {
  if (data?.isError === true) return false;
  const text = contentTextOf(data).trim();
  if (text === '') return false;
  return !EMPTY_RESULT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * §5: THE PATHS A DISPATCH NAMES.
 *
 * A tool call can name a path in `file_path`, in `path`, in a `glob` pattern or inside a shell command. All four
 * are extracted, because a shell command is how most of the observed breaches actually happened and reading only
 * `file_path` would miss them.
 */
export function namedPathsOf(data) {
  const text = argsText(data);
  const found = new Set();
  const raw = data?.arguments;
  const structured = raw !== null && typeof raw === 'object' ? raw : null;

  for (const key of ['file_path', 'path', 'cwd', 'dir']) {
    const value = structured?.[key];
    if (typeof value === 'string' && value.trim() !== '') found.add(value);
  }
  if (typeof structured?.pattern === 'string' && structured.pattern.trim() !== '') found.add(structured.pattern);

  /**
   * Absolute Windows paths, POSIX absolute paths and traversal forms, anywhere in the call text. The `command`
   * field of a shell call is included because that is where the observed breaches named their targets.
   */
  const haystack = fold(`${text}${NL}${structured?.command ?? ''}`);
  for (const match of haystack.matchAll(/[A-Za-z]:\/[^\s"',;)|]+/gu)) found.add(match[0]);
  for (const match of haystack.matchAll(/(?:^|[\s"'(=])(\/[A-Za-z][^\s"',;)|]*)/gu)) found.add(match[1]);
  for (const match of haystack.matchAll(/(?:^|[\s"'(=])(\.\.[/\\][^\s"',;)|]*)/gu)) found.add(match[1]);
  return Object.freeze([...found]);
}

/**
 * §5: RESOLVE A NAMED PATH AGAINST THE WORKER'S WORLD.
 *
 * A relative path such as `src/ledger.mjs` is the ordinary information surface, and treating it as an exposure
 * would drown the finding. Only a path that resolves OUTSIDE the world is an access worth recording.
 */
export function resolveAgainstWorld(path, worldRoot) {
  const folded = fold(path).replace(/^\.\//u, '');
  if (folded.startsWith('**') || folded === '') return null;
  if (/^[A-Za-z]:\//u.test(folded)) return normalizePath(folded);
  if (folded.startsWith('/')) return normalizePath(folded);
  return normalizePath(resolve(worldRoot, folded));
}

/**
 * §5: CLASSIFY ONE NAMED PATH.
 *
 * Anything that resolves INSIDE the world is `null` — the ordinary information surface. Anything outside is an
 * exposure, and the class names which boundary was crossed. `ORACLE_EXPOSED` takes precedence over
 * `CHECKOUT_EXPOSED` because reaching the outcome instrument is the more severe fact, and §7 adjudicates it
 * separately.
 */
export function classifyPath(path, worldRoot, runDir, ownTrajectoryId) {
  const resolved = resolveAgainstWorld(path, worldRoot);
  if (resolved === null) return null;
  const p = fold(resolved);
  const world = fold(normalizePath(worldRoot));
  const run = fold(normalizePath(runDir));
  if (p === world || p.startsWith(`${world}/`)) return null;

  /** The outcome instrument and the analysis, whether reached through the checkout or by a relative path. */
  if (ORACLE_PATHS.some((suffix) => p.includes(suffix))) return EXPOSURE_CLASSES.ORACLE_EXPOSED;

  /** A sibling unit's world, promoted source or control directory. */
  const sibling = TRAJECTORY_IDS.find((id) => p.includes(`/${id}/`) || p.endsWith(`/${id}`));
  if (sibling !== undefined && sibling !== ownTrajectoryId) return EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED;

  /** The harness's own control plane, which lives beside the world under the same trajectory root. */
  const base = p.split('/').pop() ?? '';
  const isControlFile = CONTROL_FILE_NAMES.includes(base) || CONTROL_FILE_PREFIXES.some((prefix) => base.startsWith(prefix));
  const ownRoot = ownTrajectoryId === null ? null : `${run}/${ownTrajectoryId}`;
  const inOwnControlDir = ownRoot !== null && p.startsWith(ownRoot) && !p.startsWith(world);
  if (inOwnControlDir) return EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED;
  if (isControlFile && p.startsWith(run)) return EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED;

  if (p.includes(CHECKOUT_MARKER) || HARNESS_PATHS.some((suffix) => p.includes(suffix))) return EXPOSURE_CLASSES.CHECKOUT_EXPOSED;
  /** Enumerating the shared run directory is a control-plane act even when no single file is named. */
  if (p === run || p.startsWith(`${run}/`)) return EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED;
  return EXPOSURE_CLASSES.OTHER;
}

/** §5: the access operation a tool name and its arguments imply. */
export function operationOf(name, data) {
  if (name === 'read') return ACCESS_OPERATIONS.READ;
  if (name === 'glob') return ACCESS_OPERATIONS.ENUMERATE;
  if (name === 'grep') return ACCESS_OPERATIONS.SEARCH;
  if (name === 'write') return ACCESS_OPERATIONS.READ;
  if (name === 'pwsh' || name === 'bash') {
    const command = fold(argsText(data));
    if (/get-childitem|ls |dir |find |get-item/iu.test(command)) return ACCESS_OPERATIONS.ENUMERATE;
    if (/select-string|findstr|grep/iu.test(command)) return ACCESS_OPERATIONS.SEARCH;
    if (/node -e|node --|import\(/iu.test(command)) return ACCESS_OPERATIONS.EXECUTE;
    return ACCESS_OPERATIONS.READ;
  }
  if (name === 'run_code') return ACCESS_OPERATIONS.EXECUTE;
  return ACCESS_OPERATIONS.READ;
}

/* ================================================================ §5 one session */

/**
 * §5: RECONSTRUCT ONE SESSION'S ACCESS RECORD.
 *
 * The returned shape carries every field §5 asks for: the session identity, the accessed path, its owner and
 * type, the operation, whether content was actually returned, and the reader's start time. `contentExposures`
 * additionally records WHAT the returned content contained, which is what §6 and §8 are decided from.
 */
export function reconstructSession(input) {
  const { artifact, runDir, trajectoryId, arm, block, generation, sessionId } = input;
  const records = sessionRecords(decompressFrames(artifact.path));
  const worldRoot = join(runDir, trajectoryId, 'repo', '.palimpsest', 'worlds', `attempt-${String(artifact.attemptId)}`);
  const startedAt = records.find((record) => record.type === 'session')?.createdAt ?? null;
  const accesses = [];
  const contentExposures = [];
  const dispatches = [];
  let turnEndReason = null;
  let firstWriteStep = null;

  for (const record of records) {
    if (record.type === 'turn/end') turnEndReason = record.data?.reason?.kind ?? null;
    if (record.type !== 'tool/ptc-dispatch') continue;
    const data = record.data ?? {};
    const name = String(data.name ?? '');
    /** The worker's own result submission and governed pull are protocol acts, not artifact accesses. */
    if (name === 'palimpsest_worker_result' || name === 'palimpsest_worker_context_pull') continue;

    const step = record.seq ?? null;
    const operation = operationOf(name, data);
    const returned = contentReturnedOf(data);
    const content = contentTextOf(data);
    const foldedContent = fold(content);
    if (name === 'write' && firstWriteStep === null) firstWriteStep = step;

    dispatches.push(Object.freeze({ seq: step, name, operation, returned, bytes: content.length, detail: fold(argsText(data)).slice(0, 200) }));

    for (const path of namedPathsOf(data)) {
      const classification = classifyPath(path, worldRoot, runDir, trajectoryId);
      if (classification === null) continue;
      accesses.push(Object.freeze({
        seq: step,
        tool: name,
        path: fold(path),
        resolvedPath: resolveAgainstWorld(path, worldRoot),
        classification,
        operation,
        contentReturned: returned,
        contentBytes: returned ? content.length : 0,
        owner: ownerOf(classification),
        artifactType: artifactTypeOf(path),
        siblingTrajectoryId: TRAJECTORY_IDS.find((id) => fold(path).includes(`/${id}/`) || fold(path).endsWith(`/${id}`)) ?? null,
      }));
    }

    if (!returned) continue;

    /**
     * §5/§6: WHAT THE RETURNED CONTENT ACTUALLY CARRIED.
     *
     * This is the load-bearing measurement. A session that enumerated the shared run directory named only that
     * directory; whether it received sibling units' records is a fact about the content, and this is where it is
     * established.
     */
    const signatures = Object.entries(CONTENT_SIGNATURES).filter(([, needles]) => needles.some((needle) => foldedContent.includes(needle))).map(([name_]) => name_);
    const siblingUnits = TRAJECTORY_IDS.filter((id) => id !== trajectoryId && carriesSibling(foldedContent, id));
    const ownWorldRevealed = foldedContent.includes(`/${trajectoryId}/repo`);
    for (const signature of signatures) {
      contentExposures.push(Object.freeze({
        seq: step,
        tool: name,
        signature,
        hostPrivate: HOST_PRIVATE_CONTENT_SIGNATURES.includes(signature),
        bytes: content.length,
      }));
    }
    if (siblingUnits.length > 0) {
      contentExposures.push(Object.freeze({
        seq: step,
        tool: name,
        signature: 'SIBLING_UNIT_CONTENT',
        hostPrivate: true,
        siblingUnits: Object.freeze(siblingUnits),
        bytes: content.length,
      }));
    }
    if (ownWorldRevealed) {
      contentExposures.push(Object.freeze({ seq: step, tool: name, signature: 'OWN_WORLD_PATH_REVEALED', hostPrivate: false, bytes: content.length }));
    }
  }

  const named = (cls) => accesses.filter((entry) => entry.classification === cls);
  const returnedOf = (cls) => named(cls).filter((entry) => entry.contentReturned);
  const exposure = (signature) => contentExposures.filter((entry) => entry.signature === signature);
  const siblingExposure = exposure('SIBLING_UNIT_CONTENT');
  const oracleExposure = [...exposure('ORACLE_CONTENT'), ...exposure('PRIMARY_EVIDENCE_CONTENT')];

  const label = labelSession({
    siblingTrajectoryAccesses: siblingExposure.length,
    oracleAccesses: oracleExposure.length,
    checkoutAccesses: exposure('CHECKOUT_CONTENT').length,
    controlPlaneAccesses: [...exposure('CONTROL_PAYLOAD_CONTENT'), ...exposure('GENERATION_SPEC_CONTENT')].length,
    otherAccesses: 0,
  });

  return Object.freeze({
    sessionId,
    trajectoryId,
    arm,
    block,
    generation,
    attemptId: artifact.attemptId,
    artifactPath: artifact.path,
    artifactMtimeMs: artifact.mtimeMs,
    startedAt,
    worldRoot,
    dispatchCount: dispatches.length,
    turnEndReason,
    accesses: Object.freeze(accesses),
    contentExposures: Object.freeze(contentExposures),
    dispatches: Object.freeze(dispatches),
    namedCounts: Object.freeze({
      total: accesses.length,
      checkout: named(EXPOSURE_CLASSES.CHECKOUT_EXPOSED).length,
      oracle: named(EXPOSURE_CLASSES.ORACLE_EXPOSED).length,
      siblingTrajectory: named(EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED).length,
      controlPlane: named(EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED).length,
      other: named(EXPOSURE_CLASSES.OTHER).length,
      withContentReturned: accesses.filter((entry) => entry.contentReturned).length,
    }),
    exposureCounts: Object.freeze({
      checkoutContent: exposure('CHECKOUT_CONTENT').length,
      oracleContent: exposure('ORACLE_CONTENT').length,
      primaryEvidenceContent: exposure('PRIMARY_EVIDENCE_CONTENT').length,
      controlPayloadContent: exposure('CONTROL_PAYLOAD_CONTENT').length,
      generationSpecContent: exposure('GENERATION_SPEC_CONTENT').length,
      siblingUnitContent: siblingExposure.length,
      incidentDocument: exposure('INCIDENT_DOCUMENT').length,
    }),
    siblingUnitsExposed: Object.freeze([...new Set(siblingExposure.flatMap((entry) => entry.siblingUnits ?? []))]),
    hostPrivateExposureCount: contentExposures.filter((entry) => entry.hostPrivate).length,
    label,
    firstWriteStep,
    firstOracleStep: named(EXPOSURE_CLASSES.ORACLE_EXPOSED)[0]?.seq ?? null,
    firstSiblingStep: named(EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED)[0]?.seq ?? null,
  });
}

/**
 * §6: whether returned content carries a SIBLING unit's artifact.
 *
 * A bare directory name in a listing is not enough — `b0-C` appears in any enumeration of the shared run
 * directory. What counts is a path that reaches INTO the sibling unit: its world, its repository or its
 * per-session records.
 */
function carriesSibling(foldedContent, siblingId) {
  const needle = `/${siblingId}/`;
  let index = foldedContent.indexOf(needle);
  while (index !== -1) {
    const tail = foldedContent.slice(index + needle.length, index + needle.length + 40);
    if (/^(repo|home|diagnostic|state)\b/u.test(tail) || /^repo\/\.palimpsest/u.test(tail)) return true;
    index = foldedContent.indexOf(needle, index + 1);
  }
  /** A record that NAMES the sibling as a unit is also cross-unit information. */
  return foldedContent.includes(`"trajectoryId": "${siblingId}"`) || foldedContent.includes(`"trajectoryId":"${siblingId}"`);
}

/** §5: the owner/origin of an exposed artifact. */
function ownerOf(classification) {
  if (classification === EXPOSURE_CLASSES.ORACLE_EXPOSED) return 'the R3-L0 research experiment (outcome instrument or analysis)';
  if (classification === EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED) return 'a sibling experimental unit';
  if (classification === EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED) return 'the R3-L0 harness control plane';
  if (classification === EXPOSURE_CLASSES.CHECKOUT_EXPOSED) return 'the palimpsest checkout (the harness host)';
  return 'the R3-L0 run directory';
}

/** §5: the artifact type of an exposed path, by its shape. */
function artifactTypeOf(path) {
  const p = fold(path);
  if (p.endsWith('.sqlite')) return 'durable store';
  if (p.endsWith('.json')) return 'JSON record';
  if (p.endsWith('.mjs') || p.endsWith('.js') || p.endsWith('.ts')) return 'source module';
  if (p.endsWith('.md')) return 'document';
  if (p.endsWith('.txt')) return 'text transcript';
  return 'directory or unknown';
}

/* ================================================================ §5 the whole graph */

/**
 * §5: RECONSTRUCT THE GRAPH FOR ALL 24 SESSIONS.
 *
 * The sessions come from the committed R3-L0 matrix, so the arm/block/generation attribution is the one the
 * experiment recorded rather than one re-derived from a directory name.
 */
export function reconstructGraph(runDir, matrix) {
  const sessions = [];
  for (const trajectory of matrix.trajectories) {
    const home = join(runDir, trajectory.trajectoryId, 'home');
    const artifacts = sessionArtifacts(home);
    for (const generation of trajectory.generations) {
      const artifact = artifacts.find((entry) => entry.attemptId === normalizeAttempt(generation.attemptId));
      if (artifact === undefined) continue;
      sessions.push(reconstructSession({
        artifact,
        runDir,
        trajectoryId: trajectory.trajectoryId,
        arm: trajectory.arm,
        block: trajectory.block,
        generation: generation.generation,
        sessionId: generation.sessionId,
      }));
    }
  }
  return Object.freeze(sessions);
}

/**
 * The artifact path carries the attempt id without a prefix; the report carries it with `attempt-`. Normalizing
 * both is what lets a session be matched to the artifact it produced.
 */
export function normalizeAttempt(attemptId) {
  return String(attemptId ?? '').replace(/^attempt-/u, '');
}

/* ================================================================ §6 spillover adjudication */

/**
 * §6: ADJUDICATE EVERY SIBLING-TRAJECTORY READ.
 *
 * The originating arm comes from the frozen schedule's trajectory id. The originating generation and its
 * existence before the reader are recovered from the durable matrix and the sessions' own recorded start times,
 * which is what §6 means by "where recoverable".
 */
export function adjudicateSpillovers(sessions, matrix) {
  const rows = [];
  for (const session of sessions) {
    const exposures = session.contentExposures.filter((entry) => entry.signature === 'SIBLING_UNIT_CONTENT');
    const namedSibling = session.accesses.filter((entry) => entry.classification === EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED);
    const ids = new Set([...exposures.flatMap((entry) => entry.siblingUnits ?? []), ...namedSibling.map((entry) => entry.siblingTrajectoryId).filter((id) => id !== null)]);
    for (const id of ids) {
      if (id === session.trajectoryId) continue;
      const siblingTrajectory = matrix.trajectories.find((trajectory) => trajectory.trajectoryId === id);
      const sourceArm = siblingTrajectory?.arm ?? null;
      const contentReturned = exposures.some((entry) => (entry.siblingUnits ?? []).includes(id)) || namedSibling.some((entry) => entry.siblingTrajectoryId === id && entry.contentReturned);
      const siblingSessions = sessions.filter((candidate) => candidate.trajectoryId === id);
      const beforeReader = siblingSessions.filter((candidate) => candidate.startedAt !== null && session.startedAt !== null && candidate.startedAt < session.startedAt);
      const sourceGeneration = beforeReader.length > 0 ? beforeReader[beforeReader.length - 1].generation : null;
      const adjudication = adjudicateSpillover({ sourceArm, sourceGeneration, sourceExistedBeforeReader: beforeReader.length > 0, contentReturned });
      rows.push(Object.freeze({
        readerSessionId: session.sessionId,
        readerArm: session.arm,
        readerBlock: session.block,
        readerGeneration: session.generation,
        readerStartedAt: session.startedAt,
        siblingTrajectoryId: id,
        sourceArm,
        sourceGeneration,
        sourceExistedBeforeReader: beforeReader.length > 0,
        siblingSessionsBeforeReader: Object.freeze(beforeReader.map((candidate) => candidate.sessionId)),
        namedAccesses: namedSibling.filter((entry) => entry.siblingTrajectoryId === id).length,
        contentReturned,
        accessedPaths: Object.freeze([...new Set([...namedSibling.filter((entry) => entry.siblingTrajectoryId === id).map((entry) => entry.path), ...exposures.flatMap((entry) => entry.siblingUnits ?? []).filter((unit) => unit === id).map(() => 'returned content carried this unit')])]),
        ...adjudication,
      }));
    }
  }
  return Object.freeze(rows);
}

/** §6: the spillover summary, keeping the four classes separate. */
export function spilloverSummary(rows) {
  const count = (cls) => rows.filter((row) => row.classification === cls).length;
  return Object.freeze({
    siblingReadRows: rows.length,
    sessionsWithSiblingReads: new Set(rows.map((row) => row.readerSessionId)).size,
    NO_TREATMENT_SPILLOVER: count(SPILLOVER_CLASSES.NO_TREATMENT_SPILLOVER),
    TREATMENT_SPILLOVER_POSSIBLE: count(SPILLOVER_CLASSES.TREATMENT_SPILLOVER_POSSIBLE),
    TREATMENT_SPILLOVER_CONFIRMED: count(SPILLOVER_CLASSES.TREATMENT_SPILLOVER_CONFIRMED),
    UNKNOWN: count(SPILLOVER_CLASSES.UNKNOWN),
    law: 'influence is never inferred from file visibility; a confirmed spillover requires content actually returned',
  });
}

/* ================================================================ §8 the clean map */

/** §8: the session map and the derived block map. */
export function cleanMap(sessions) {
  const sessionRows = sessions.map((session) => Object.freeze({
    sessionId: session.sessionId,
    trajectoryId: session.trajectoryId,
    arm: session.arm,
    block: session.block,
    generation: session.generation,
    label: session.label,
    namedOutsideWorld: session.namedCounts.total,
    namedCheckout: session.namedCounts.checkout,
    namedOracle: session.namedCounts.oracle,
    namedSibling: session.namedCounts.siblingTrajectory,
    namedControlPlane: session.namedCounts.controlPlane,
    checkoutContent: session.exposureCounts.checkoutContent,
    oracleContent: session.exposureCounts.oracleContent,
    primaryEvidenceContent: session.exposureCounts.primaryEvidenceContent,
    controlPayloadContent: session.exposureCounts.controlPayloadContent,
    siblingUnitContent: session.exposureCounts.siblingUnitContent,
    siblingUnitsExposed: session.siblingUnitsExposed,
    hostPrivateExposureCount: session.hostPrivateExposureCount,
  }));
  const blocks = [...new Set(sessionRows.map((row) => row.block))].sort((left, right) => left - right).map((block) => {
    const members = sessionRows.filter((row) => row.block === block);
    return Object.freeze({ block, sessions: Object.freeze(members.map((row) => row.sessionId)), ...blockLabelFor(members.map((row) => row.label)) });
  });
  const counts = {};
  for (const row of sessionRows) counts[row.label] = (counts[row.label] ?? 0) + 1;
  return Object.freeze({ sessions: Object.freeze(sessionRows), blocks: Object.freeze(blocks), counts: Object.freeze(counts) });
}

function blockLabelFor(labels) {
  const any = (label) => labels.includes(label);
  return Object.freeze({
    sessionCount: labels.length,
    clean: labels.filter((label) => label === 'CLEAN').length,
    contaminatedNonOracle: labels.filter((label) => label === 'CONTAMINATED_NON_ORACLE').length,
    oracleContaminated: labels.filter((label) => label === 'ORACLE_CONTAMINATED').length,
    crossTrajectoryContaminated: labels.filter((label) => label === 'CROSS_TRAJECTORY_CONTAMINATED').length,
    blockLabel: any('CROSS_TRAJECTORY_CONTAMINATED') ? 'BLOCK_CROSS_TRAJECTORY_CONTAMINATED'
      : any('ORACLE_CONTAMINATED') ? 'BLOCK_ORACLE_CONTAMINATED'
        : any('CONTAMINATED_NON_ORACLE') ? 'BLOCK_CONTAMINATED_NON_ORACLE'
          : 'BLOCK_CLEAN',
    diagnosticOnly: true,
  });
}

/* ================================================================ §7 the oracle adjudication */

/**
 * §7: ADJUDICATE EVERY ORACLE-EXPOSED SESSION.
 *
 * Each question is answered by an OBSERVED event from the dispatch record. The ordering fact is the load-bearing
 * one, and `b3-H-G1` is preserved by name because it is the case that reached full diagnostic coverage.
 */
export function adjudicateOracleExposures(sessions) {
  const rows = [];
  for (const session of sessions) {
    const namedOracle = session.accesses.filter((entry) => entry.classification === EXPOSURE_CLASSES.ORACLE_EXPOSED);
    const oracleContent = session.contentExposures.filter((entry) => entry.signature === 'ORACLE_CONTENT' || entry.signature === 'PRIMARY_EVIDENCE_CONTENT');
    const anyOracleTouch = namedOracle.length > 0 || oracleContent.length > 0;
    if (!anyOracleTouch) continue;
    const moduleRead = namedOracle.some((entry) => entry.contentReturned) || oracleContent.some((entry) => entry.signature === 'ORACLE_CONTENT');
    const primaryEvidence = oracleContent.some((entry) => entry.signature === 'PRIMARY_EVIDENCE_CONTENT');
    const step = session.firstOracleStep;
    rows.push(Object.freeze({
      sessionId: session.sessionId,
      arm: session.arm,
      block: session.block,
      generation: session.generation,
      namedOracleAccesses: namedOracle.length,
      namedOracleWithContent: namedOracle.filter((entry) => entry.contentReturned).length,
      oracleContentExposures: oracleContent.length,
      ORACLE_MODULE_READ: moduleRead,
      CASE_INVENTORY_OBTAINED: primaryEvidence || oracleContent.some((entry) => entry.signature === 'ORACLE_CONTENT'),
      EXPECTED_OUTPUTS_OBTAINED: primaryEvidence,
      ORACLE_EXECUTED_ON_CANDIDATE: session.dispatches.some((entry) => entry.operation === ACCESS_OPERATIONS.EXECUTE && entry.returned),
      CLASS_PASS_OBTAINED: oracleContent.some((entry) => entry.signature === 'PRIMARY_EVIDENCE_CONTENT'),
      EDITED_AFTER_EXPOSURE: step !== null && session.firstWriteStep !== null && session.firstWriteStep > step,
      RESULT_CHANGED_AFTER_EXPOSURE: 'NOT_OBSERVABLE_WITHOUT_A_BASELINE_ARM',
      firstOracleStep: step,
      firstWriteStep: session.firstWriteStep,
      isKnownDecisiveCase: session.sessionId === 'b3-H-G1',
      outcomeRelevantExposure: moduleRead && (primaryEvidence || oracleContent.length > 0),
      inference: 'none — only the observable sequence is recorded',
    }));
  }
  return Object.freeze(rows);
}

/** §7: the outcome-relevant oracle exposures, which is the set that damages the outcome instrument. */
export function outcomeRelevantOracleExposures(rows) {
  return Object.freeze(rows.filter((row) => row.outcomeRelevantExposure).map((row) => row.sessionId));
}
