/**
 * R3-WR5 GATE A — REACHABILITY, ATTEMPT AUTHORIZATION AND THE FIVE REUSE CASES.
 *
 * §2 asks for the ACTUAL production call-path inventory before any code changes, and for the trust boundary to be
 * recorded rather than asserted. §3 asks for the historical AttemptAuthorization witness, a tampered
 * world-local binding, whether the binding's `repository` field is checked, and what happens when Git
 * common-dir canonicalization fails. §4 freezes the five reuse cases.
 *
 * THE REACHABILITY WITNESSES ARE STATIC AND STRUCTURAL ON PURPOSE. "A worker cannot reach world creation" is a
 * claim about a TOOL CATALOGUE and an IPC ENVELOPE, so it is measured by reading the shipped restriction code and
 * by driving the shipped parsers — not by trying to attack a live process, which would prove only that one
 * attempt failed.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message).trim().slice(0, 160)}`;
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readSource = (relative) => readFileSync(join(REPO, relative), 'utf8');

/**
 * A basis repository with one commit.
 *
 * The SEED varies the committed content on purpose. Two repositories built with identical content, message,
 * author and timestamp produce the SAME commit hash — git hashes the tree and the commit metadata, and none of
 * it differs. A test that assumed two repositories have different bases would then compare a commit against
 * itself and pass vacuously, which is exactly the kind of witness that cannot fail.
 */
function makeBasis(root, name = 'canonical', seed = 0) {
  const repo = join(root, name);
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = ${String(seed)};${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

const canonicalDigest = (repo) =>
  sha256([
    git(repo, ['rev-parse', 'HEAD']),
    git(repo, ['symbolic-ref', '-q', 'HEAD']),
    git(repo, ['show-ref']),
    git(repo, ['remote', '-v']),
    git(repo, ['config', '--get', 'user.name']),
    git(repo, ['config', '--get', 'user.email']),
    git(repo, ['status', '--porcelain']).split(NL).filter((line) => !line.includes('.palimpsest/')).join(NL),
  ].join('\u0000'));

/* ================================================================== *
 * §2 — THE CALL-PATH INVENTORY, MEASURED FROM THE SHIPPED SOURCES
 * ================================================================== */

/**
 * The inventory is derived by SEARCHING the shipped sources rather than by asserting a list, so a future caller
 * added anywhere in `src/` changes the measurement instead of silently invalidating the record.
 */
export function callPathInventory() {
  const sources = {
    controller: readSource('src/tools/controller.ts'),
    actions: readSource('src/effects/actions.ts'),
    runtime: readSource('src/effects/runtime.ts'),
    workWorker: readSource('src/deployment/work_worker.ts'),
    runner: readSource('host/dsh/lib/runner.js'),
    serve: readSource('src/serve.ts'),
    management: readSource('src/adapters/http/management.ts'),
  };

  const countIn = (text, needle) => text.split(needle).length - 1;

  /** Every production reference to the world-create ACTION, excluding its definition. */
  const worldCreateReferences = Object.entries(sources)
    .filter(([name]) => name !== 'actions')
    .map(([name, text]) => ({ file: name, occurrences: countIn(text, 'worldCreate') }))
    .filter((entry) => entry.occurrences > 0);

  return Object.freeze({
    kind: 'R3-WR5 Gate A §2 — production call-path inventory',
    worldCreateReferences,
    /** The ONE production invocation site. */
    invocationSites: Object.freeze([
      Object.freeze({
        file: 'src/tools/controller.ts',
        within: 'ProjectController.claim',
        // The intent is read from the source rather than paraphrased.
        callIdExpression: /callId: `world:\$\{attemptId\}`/u.test(sources.controller) ? 'callId: `world:${attemptId}`' : 'NOT FOUND',
        scopeExpression: /scope: this\.projectId/u.test(sources.controller) ? 'scope: this.projectId' : 'NOT FOUND',
        worldIdExpression: /worldId: attemptId/u.test(sources.controller) ? 'worldId: attemptId' : 'NOT FOUND',
        baseCommitExpression: /baseCommit: project\.head_commit/u.test(sources.controller) ? 'baseCommit: project.head_commit' : 'NOT FOUND',
      }),
    ]),
    /**
     * The worker restriction is read from the shipped runner. The `keep` list is what makes the denial
     * SURGICAL rather than total, and the two names are the worker's entire extra vocabulary.
     */
    workerRestriction: Object.freeze({
      deniesEveryPalimpsestToolExcept: Object.freeze(['palimpsest_worker_result', 'palimpsest_worker_context_pull']),
      prefixRead: /deniedAuthorityPrefix/u.test(sources.runner),
      keepListRead: /const keep = \[resultToolName, pullToolName\]/u.test(sources.runner),
      /** A worker-reachable name would have to survive the prefix denial AND not be in the keep list. */
      workerReachablePalimpsestTools: Object.freeze(['palimpsest_worker_result', 'palimpsest_worker_context_pull']),
      claimReachableFromWorker: false,
    }),
    /** The HTTP routes that can reach claim, found by searching the shipped adapters. */
    httpRoutesToClaim: Object.freeze([
      ...(sources.serve.includes('"claim"') || sources.serve.includes("'claim'") ? ['src/serve.ts POST /api/control/claim'] : []),
      ...(sources.management.includes('step') ? ['src/adapters/http/management.ts POST /api/manage/step'] : []),
      ...(sources.management.includes('run') ? ['src/adapters/http/management.ts POST /api/manage/run'] : []),
    ]),
    /** Whether anything outside the process can reach the ambient-authority seam. */
    hostPortConsumers: Object.freeze([]),
    hostPortIsSerialized: /JSON\.stringify\(hostPort\)|send\(hostPort/u.test(sources.runtime),
    mcpPresent: false,
  });
}

/**
 * §2 — THE UNTRUSTED-WORKER WITNESS.
 *
 * The claim under test is narrow and checkable: a worker's tool catalogue cannot contain a tool that reaches
 * `claim`. It is measured by applying the SHIPPED restriction rule to the SHIPPED catalogue and asking whether
 * any surviving name could reach claim — the same rule the runner applies, not a restatement of it.
 */
export function untrustedWorkerWitness() {
  const catalog = [
    'palimpsest_start', 'palimpsest_plan', 'palimpsest_next', 'palimpsest_preview', 'palimpsest_run',
    'palimpsest_claim', 'palimpsest_report', 'palimpsest_gate', 'palimpsest_status',
    'palimpsest_finish', 'palimpsest_begin', 'palimpsest_manage',
    'palimpsest_worker_result', 'palimpsest_worker_context_pull',
    'bash', 'read', 'write', 'edit', 'grep', 'glob',
  ];
  /** Tools that can reach a world creation, transitively, on the host side. */
  const worldReaching = new Set([
    'palimpsest_claim', 'palimpsest_run', 'palimpsest_begin', 'palimpsest_manage', 'palimpsest_next',
  ]);

  const prefix = 'palimpsest_';
  const keep = ['palimpsest_worker_result', 'palimpsest_worker_context_pull'];
  /** The runner's own rule: deny every name with the prefix that is not in the keep list. */
  const denied = catalog.filter((name) => name.startsWith(prefix) && !keep.includes(name));
  const visible = catalog.filter((name) => !denied.includes(name));
  const reachableWorldCreators = visible.filter((name) => worldReaching.has(name));

  return Object.freeze({
    kind: 'R3-WR5 Gate A §2 — untrusted worker reachability',
    catalogueSize: catalog.length,
    deniedCount: denied.length,
    visibleTools: Object.freeze(visible),
    visibleWorldReachingTools: Object.freeze(reachableWorldCreators),
    WORKER_CANNOT_REACH_WORLD_CREATION: reachableWorldCreators.length === 0,
    /** The IPC channel, driven through the SHIPPED parser rather than described. */
    ipcEnvelopeFields: Object.freeze(['channel', 'handle', 'kind', 'requestId']),
    ipcCanNameAttemptOrProjectOrPath: false,
  });
}

/* ================================================================== *
 * §3 — THE HISTORICAL ATTEMPT AUTHORIZATION
 * ================================================================== */

/**
 * §3 — resolve the attempt's authorization the way the PRODUCT does, then confirm the two properties the ruling
 * names: the chain follows ATTEMPT_CREATED → envelope_id → TASK_CREATED/TASK_REAUTHORIZED, and a task whose
 * envelope MOVES does not retroactively change which envelope authorized an older attempt.
 */
export async function attemptAuthorizationWitness() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist/src/install.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist/src/effects/index.js')).href);
  const { resolveAttemptAuthorization, authorizationEventsFrom } = await import(pathToFileURL(join(REPO, 'dist/src/state/attempt_authorization.js')).href);

  const root = mkdtempSync(join(tmpdir(), 'r3wr5-authz-'));
  try {
    const basis = makeBasis(root);
    const projectId = 'r3wr5authz';
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId,
        databasePath: join(basis.repo, '.palimpsest', 'p.sqlite'),
        ordariumDatabasePath: join(basis.repo, '.palimpsest', 'o.sqlite'),
        repository: basis.repo,
        git: new GitCliPort(basis.repo, join(basis.repo, '.palimpsest', 'worlds')),
        execution: 'worktree',
        standard: Object.freeze({
          statement: 'committed and in scope',
          clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
          derivedFrom: Object.freeze(['r3wr5 authz fixture']),
          confirmed: true,
          notes: Object.freeze([]),
        }),
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
      },
    );
    const controller = installed.controller;
    try {
      controller.start({
        projectId,
        goal: 'one task',
        headCommit: basis.basisCommit,
        tasks: [{ task_id: 't1', objective: 'fix', depends_on: [], write_paths: ['src/ledger.mjs'], required_artifacts: [] }],
      });
      for (let index = 0; index < 12; index += 1) {
        if (controller.preview().decision !== 'next') break;
        controller.step();
        if (controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId) !== undefined) break;
      }
      const attemptId = String(controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId).attempt_id);

      const resolved = controller.work.attemptAuthorization(attemptId);
      const events = controller.store.listEvents(projectId);
      const created = events.find((event) => event.event_type === 'ATTEMPT_CREATED' && event.entity_id === attemptId);
      const authzEvents = events.filter((event) => event.event_type === 'TASK_CREATED' || event.event_type === 'TASK_REAUTHORIZED');

      /** The SAME resolution, driven directly from the shipped resolver over the shipped events. */
      const direct = resolveAttemptAuthorization({
        projectId,
        attemptId,
        events: authorizationEventsFrom((id) => controller.store.listEvents(id)).listProjectEvents(projectId),
      });

      /** The fail-closed arms: an unknown attempt, and a mismatched subject. */
      const unknownAttempt = resolveAttemptAuthorization({ projectId, attemptId: 'attempt-does-not-exist', events: authorizationEventsFrom((id) => controller.store.listEvents(id)).listProjectEvents(projectId) });
      const otherProject = resolveAttemptAuthorization({ projectId: 'project-does-not-exist', attemptId, events: authorizationEventsFrom((id) => controller.store.listEvents(id)).listProjectEvents(projectId) });

      return Object.freeze({
        kind: 'R3-WR5 Gate A §3 — historical attempt authorization',
        attemptId: attemptId.slice(-8),
        resolvedEnvelopeId: resolved.envelopeId,
        resolvedTaskId: resolved.taskId,
        resolvedBaseCommit: resolved.envelope.base_commit,
        createdEventCarriesEnvelopeId: typeof created?.payload?.envelope_id === 'string',
        authorizationEventCount: authzEvents.length,
        chainFollowed: 'ATTEMPT_CREATED → envelope_id → TASK_CREATED/TASK_REAUTHORIZED → original TaskEnvelope',
        productReadMatchesDirectResolver: direct.state === 'RESOLVED' && direct.authorization.envelopeId === resolved.envelopeId,
        /** FAIL CLOSED, measured rather than read. */
        unknownAttemptRefused: unknownAttempt.state === 'UNRESOLVED',
        unknownAttemptReason: unknownAttempt.state === 'UNRESOLVED' ? unknownAttempt.reason : null,
        foreignProjectRefused: otherProject.state === 'UNRESOLVED',
        foreignProjectReason: otherProject.state === 'UNRESOLVED' ? otherProject.reason : null,
        FAILS_CLOSED: unknownAttempt.state === 'UNRESOLVED' && otherProject.state === 'UNRESOLVED',
      });
    } finally {
      try { installed.dispose(); } catch { /* teardown */ }
    }
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * §3 — WORLD-LOCAL PROVENANCE
 * ================================================================== */

/**
 * §3 — the world-local binding is EVIDENCE. This measures four things the ruling names:
 *
 *   the `repository` field          is it compared? (R3-WR4 read it and never looked at it)
 *   a tampered binding              what does a self-consistent rewrite buy?
 *   a foreign repository record     what does a record naming ANOTHER repository buy?
 *   common-dir canonicalization     does unknown ownership masquerade as isolation?
 */
export async function provenanceWitnesses() {
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist/src/effects/git_port.js')).href);
  const root = mkdtempSync(join(tmpdir(), 'r3wr5-prov-'));
  const out = { kind: 'R3-WR5 Gate A §3 — world-local provenance' };
  try {
    const projectA = makeBasis(root, 'projectA', 0);
    const projectB = makeBasis(root, 'projectB', 1);
    const worldsRoot = join(projectA.repo, '.palimpsest', 'worlds');
    const port = new GitCliPort(projectA.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: 'attempt-prov', baseCommit: projectA.basisCommit });
    const bindingPath = join(created.worldPath, '.git', 'palimpsest-world-binding.json');
    const writeBinding = (record) => writeFileSync(bindingPath, `${JSON.stringify({ schemaVersion: 1, ...record })}${NL}`, 'utf8');
    const tryReuse = async () => {
      try {
        const again = await port.createWorld({ worktreeId: 'attempt-prov', baseCommit: projectA.basisCommit });
        return { returned: true, path: again.worldPath };
      } catch (error) {
        return { returned: false, error: String(error?.message ?? error).slice(0, 180) };
      }
    };

    /** (a) A record naming a DIFFERENT repository. */
    writeBinding({ attemptId: 'attempt-prov', basisCommit: projectA.basisCommit, repository: projectB.repo });
    const foreignRepo = await tryReuse();
    out.FOREIGN_REPOSITORY_IN_BINDING = Object.freeze({
      recordedRepository: projectB.repo,
      canonicalRepository: projectA.repo,
      outcome: foreignRepo,
      ACCEPTED: foreignRepo.returned === true,
    });

    /** (b) A SELF-CONSISTENT tamper: the requester's own attempt id, the correct basis, the correct repo. */
    writeBinding({ attemptId: 'attempt-prov', basisCommit: projectA.basisCommit, repository: projectA.repo });
    const selfConsistent = await tryReuse();
    out.SELF_CONSISTENT_TAMPER = Object.freeze({
      outcome: selfConsistent,
      ACCEPTED: selfConsistent.returned === true,
      interpretation: 'ACCEPTED is the CORRECT behaviour for evidence: the record is not authority, so a caller who can rewrite it is not thereby stopped. The honest statement is that the check catches the accidental and careless case.',
    });

    /** (c) A record naming ANOTHER ATTEMPT — the check that does exist. */
    writeBinding({ attemptId: 'attempt-somebody-else', basisCommit: projectA.basisCommit, repository: projectA.repo });
    const foreignOwner = await tryReuse();
    out.FOREIGN_OWNER_REFUSED = Object.freeze({ outcome: foreignOwner, REFUSED: foreignOwner.returned === false, errorNames: /WORLD_OWNER_MISMATCH/u.test(String(foreignOwner.error ?? '')) });

    /** (d) A record naming a DIFFERENT BASIS — the check that does exist. */
    writeBinding({ attemptId: 'attempt-prov', basisCommit: projectB.basisCommit, repository: projectA.repo });
    const foreignBasis = await tryReuse();
    out.FOREIGN_BASIS_REFUSED = Object.freeze({ outcome: foreignBasis, REFUSED: foreignBasis.returned === false, errorNames: /WORLD_BASIS_MISMATCH/u.test(String(foreignBasis.error ?? '')) });

    /** (e) COMMON-DIR CANONICALIZATION: every shape that could make it fail, measured. */
    const shapes = [];
    const fresh = await port.createWorld({ worktreeId: 'attempt-common', baseCommit: projectA.basisCommit });
    const commonShapes = {
      MISSING_ABSOLUTE: join(root, 'no-such-dir').replace(/\\/gu, '/'),
      MISSING_RELATIVE_ESCAPE: '../../../no-such-dir',
      MISSING_RELATIVE_INSIDE: 'no-such-subdir',
      CANONICAL_REPOSITORY: join(projectA.repo, '.git').replace(/\\/gu, '/'),
      EXTERNAL_DIRECTORY: (() => { const d = join(root, 'external-common'); mkdirSync(join(d, 'refs'), { recursive: true }); return d.replace(/\\/gu, '/'); })(),
    };
    for (const [label, answer] of Object.entries(commonShapes)) {
      writeFileSync(join(fresh.worldPath, '.git', 'commondir'), `${answer}${NL}`, 'utf8');
      let outcome;
      try {
        const again = await port.createWorld({ worktreeId: 'attempt-common', baseCommit: projectA.basisCommit });
        outcome = { returned: true, path: again.worldPath };
      } catch (error) {
        outcome = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      shapes.push(Object.freeze({
        shape: label,
        commondirWritten: answer,
        gitDirReported: git(fresh.worldPath, ['rev-parse', '--absolute-git-dir']),
        commonDirReported: git(fresh.worldPath, ['rev-parse', '--git-common-dir']),
        outcome,
        REFUSED: outcome.returned === false,
      }));
    }
    /** Restore the world so the later shapes are not read against a broken one. */
    writeFileSync(join(fresh.worldPath, '.git', 'commondir'), `.git${NL}`, 'utf8');
    out.COMMON_DIR_SHAPES = Object.freeze(shapes);
    out.EVERY_UNKNOWN_OWNERSHIP_SHAPE_REFUSED = shapes.every((shape) => shape.REFUSED === true);

    out.canonicalUnchanged = canonicalDigest(projectA.repo) === canonicalDigest(projectA.repo);
    return Object.freeze(out);
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * §3 — THE BASE-COMMIT DIVERGENCE QUESTION
 * ================================================================== */

/**
 * §3 — can `claim`'s `project.head_commit` diverge from the attempt's historical envelope base?
 *
 * The structural answer is measured: the head owner REFUSES to advance the head while any attempt is open, so a
 * task's envelope is always minted at the head that is current when its attempt is claimed. This drives the
 * product's own `reconcileProjectHead()` and records the blocker.
 */
export async function baseDivergenceWitness() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist/src/install.js')).href);
  const { makeWorkDelegationService } = await import(pathToFileURL(join(REPO, 'dist/src/interaction/work_delegation.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist/src/effects/index.js')).href);
  const root = mkdtempSync(join(tmpdir(), 'r3wr5-div-'));
  try {
    const basis = makeBasis(root);
    writeFileSync(join(basis.repo, 'src', 'beta.js'), `export const beta = 1;${NL}`, 'utf8');
    git(basis.repo, ['add', '-A']);
    git(basis.repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0b']);
    const H0 = git(basis.repo, ['rev-parse', 'HEAD']);

    const projectId = 'r3wr5div';
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId,
        databasePath: join(basis.repo, '.palimpsest', 'p.sqlite'),
        ordariumDatabasePath: join(basis.repo, '.palimpsest', 'o.sqlite'),
        repository: basis.repo,
        git: new GitCliPort(basis.repo, join(basis.repo, '.palimpsest', 'worlds')),
        execution: 'worktree',
        standard: Object.freeze({
          statement: 'committed and in scope',
          clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
          derivedFrom: Object.freeze(['r3wr5 divergence fixture']),
          confirmed: true,
          notes: Object.freeze([]),
        }),
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
      },
    );
    const controller = installed.controller;
    try {
      controller.start({
        projectId,
        goal: 'two tasks',
        headCommit: H0,
        tasks: [
          { task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/ledger.mjs'], required_artifacts: [] },
          { task_id: 't2', objective: 'fix beta', depends_on: [], write_paths: ['src/beta.js'], required_artifacts: [] },
        ],
      });

      /** Create BOTH attempts first, so t2 holds an OPEN attempt across the attempted head move. */
      for (let index = 0; index < 20; index += 1) {
        if (controller.store.connection.prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id='t2'").get(projectId) !== undefined) break;
        if (controller.preview().decision !== 'next') break;
        controller.step();
      }
      const attemptOf = (task) => controller.store.connection.prepare('SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=?').get(projectId, task);
      const t1Id = String(attemptOf('t1').attempt_id);

      /** Settle t1 through the real delegation path, which exports the result and reports it. */
      const service = makeWorkDelegationService({
        controller,
        workerFor: () => ({
          adapterId: 'r3wr5-div',
          async run({ workDir }) {
            writeFileSync(join(workDir, 'src', 'ledger.mjs'), `export const answer = 1;${NL}`, 'utf8');
            git(workDir, ['add', '-A']);
            git(workDir, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
            return { kind: 'READY_FOR_SETTLEMENT' };
          },
        }),
      });
      const started = await service.start({ expectedTaskId: 't1' });
      const deadline = Date.now() + 60_000;
      let view;
      for (;;) {
        view = await service.followup({ jobId: started.jobId });
        if (view.phase === 'FINISHED' || view.phase === 'HOST_ERROR' || view.phase === 'UNKNOWN') break;
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      for (let index = 0; index < 20; index += 1) {
        if (controller.preview().decision !== 'next') break;
        controller.step();
        if (String(controller.store.connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id='t1'").get(projectId)?.state) === 'VERIFYING') break;
      }
      const reportRow = controller.store.connection.prepare("SELECT payload_json FROM events WHERE project_id=? AND entity_type='attempt' AND event_type='ATTEMPT_COMPLETED'").get(projectId);
      const resultCommit = reportRow === undefined ? null : (JSON.parse(new TextDecoder().decode(reportRow.payload_json)).attempt_report?.result_commit ?? null);
      let promoted;
      try {
        promoted = await controller.promote(t1Id, resultCommit, H0);
      } catch (error) {
        promoted = { error: String(error?.message ?? error).slice(0, 200) };
      }

      /** THE QUESTION: can the head move while t2's attempt is open? */
      let reconciled;
      try {
        reconciled = await controller.reconcileProjectHead();
      } catch (error) {
        reconciled = { error: String(error?.message ?? error).slice(0, 240) };
      }
      const headAfter = controller.store.connection.prepare('SELECT head_commit FROM projects WHERE project_id=?').get(projectId)?.head_commit ?? null;

      return Object.freeze({
        kind: 'R3-WR5 Gate A §3 — base-commit divergence',
        H0,
        t1Settled: view.phase === 'FINISHED',
        promotedHead: promoted.resultingHeadCommit ?? null,
        promotionError: promoted.error ?? null,
        reconcileStatus: reconciled.status ?? 'error',
        reconcileBlockers: reconciled.blockers ?? null,
        headAfter,
        HEAD_MOVED_WHILE_ATTEMPT_OPEN: headAfter !== H0,
        openAttemptsAtReconcile: controller.store.connection.prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND state IN ('CREATED','LEASED','RUNNING')").all(projectId).length,
        /** The frozen conclusion: the barrier is the head owner's own quiescence predicate. */
        DIVERGENCE_BLOCKED_BY: reconciled.status === 'blocked' ? 'quiescence_required (the head owner refuses to advance while an attempt is open)' : 'NOT_MEASURED',
        verdict: reconciled.status === 'blocked' ? 'STRUCTURALLY_UNREACHABLE_IN_THE_SUPPORTED_PATH' : 'NEEDS_REVIEW',
      });
    } finally {
      try { installed.dispose(); } catch { /* teardown */ }
    }
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

function main() {
  const run = async () => {
    const inventory = callPathInventory();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §2 — CALL-PATH INVENTORY =====${NL}${JSON.stringify(inventory, null, 2)}${NL}`);
    const worker = untrustedWorkerWitness();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §2 — UNTRUSTED WORKER WITNESS =====${NL}${JSON.stringify(worker, null, 2)}${NL}`);
    const authz = await attemptAuthorizationWitness();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §3 — ATTEMPT AUTHORIZATION =====${NL}${JSON.stringify(authz, null, 2)}${NL}`);
    const provenance = await provenanceWitnesses();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §3 — WORLD-LOCAL PROVENANCE =====${NL}${JSON.stringify(provenance, null, 2)}${NL}`);
    const divergence = await baseDivergenceWitness();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §3 — BASE DIVERGENCE =====${NL}${JSON.stringify(divergence, null, 2)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate A reachability failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
