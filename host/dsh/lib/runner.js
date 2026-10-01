// palimpsest-dsh-host/runner — the persistent project principal AND the ephemeral
// reasoning branch.
//
// PRINCIPAL MODE: creates or COLD-RESUMES one durable principal session over the
// real DSH agent runtime, delivers the launch message, then runs an attention loop:
//
//   durable semantic fact → Palimpsest AttentionSignal → the REAL Palimpsest
//   host activation adapter (dshAgentsAttentionAdapter) → agent.followup(turn)
//   → the SAME persistent principal decides using the palimpsest_* tools.
//
// UX-C §24: this runner no longer re-implements the lifecycle. It only SCHEDULES
// `deployment.pumpAndActivate()` — the deployment owns pump → drain → activate →
// mark-after-success — and late-binds the resume-capable activation adapter once it
// has created/resumed the principal session.
//
// BRANCH MODE: one ephemeral cognition that may only call the ONE strict
// `palimpsest_branch_result` tool and then exits. A branch composes no deployment,
// no ReasoningCell and no principal tool (UX-C §16/§18).
//
// Notification ≠ Activation: the loop only wakes the agent; all semantic decisions
// are made by the agent through the product tools. The host session id is NOT the
// PeerRef: a cold resume mints a fresh agent over the persisted session while the
// Palimpsest identity (PeerRef/PersistentPoint) is unchanged.
//
// No chain-of-thought is captured: only tool calls, semantic state, host
// activation events and the final visible response matter to the dogfood.

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { brandString } from '@deepseek-ai/dsh-brand';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

/**
 * R2-U §7: the EXPERIMENTAL presentation seam. Loaded statically because it has no imports of its own and
 * must never be the reason a worker fails to compose; the module carries the frozen clause and the
 * fail-safe mode resolution. In the default mode `applyAffordance` returns its input unchanged, so the
 * prompt this runner composes is byte-identical to production.
 */
import { AFFORDANCE_ENV, applyAffordance, resolveAffordanceMode } from './affordance.js';

/**
 * R1-H: the host-execution read boundary.
 *
 * Loaded DYNAMICALLY and CACHED, for two reasons. It is a sibling package (`palimpsest-host-deployment`),
 * so this bundle does not statically depend on it and a deployment that composes no worker still loads. And
 * a boundary that could not be loaded must be REPORTABLE rather than fatal: the runner records
 * `installed: false` with the reason in its telemetry, and `gate:r1-h-live` asserts the boundary IS
 * installed — so a packaging accident fails the gate instead of silently running a worker unprotected.
 */
let boundaryModule;
let boundaryModuleError;
async function loadBoundary() {
  if (boundaryModule !== undefined || boundaryModuleError !== undefined) return { module: boundaryModule, error: boundaryModuleError };
  try {
    boundaryModule = await import('palimpsest-host-deployment/runtime/worker_fence.js');
  } catch (error) {
    boundaryModuleError = error?.message ?? String(error);
  }
  return { module: boundaryModule, error: boundaryModuleError };
}

export const name = 'palimpsest-runner';
export const inject = ['agents', 'sessions', 'agentDefaultModel', 'palimpsestStartup', 'palimpsestHost'];

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
}

/**
 * The task text for ONE ephemeral reasoning branch. It carries the frozen brief and
 * (when supplied) the selector-only materialized evidence plus the frozen allowlist.
 * The capability boundary is NOT this text: the branch environment registers only
 * `palimpsest_branch_result`, so no other tool exists to call.
 */
function branchTask(payload) {
  const brief = payload.brief;
  const evidenceContext = payload.evidenceContext;
  const allowed = Array.isArray(evidenceContext?.allowedEvidenceRefs)
    ? evidenceContext.allowedEvidenceRefs.map((ref) => (typeof ref === 'string' ? ref : ref?.evidenceId)).filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const selections = Array.isArray(evidenceContext?.selections) ? evidenceContext.selections : [];
  const hasEvidence = allowed.length > 0 || selections.length > 0;

  const lines = [
    'You are an EPHEMERAL reasoning branch of a Palimpsest ReasoningCell. You are NOT a durable principal: you create no peer, no persistent point and no durable session. You have exactly ONE tool, `palimpsest_branch_result`, and you call it exactly ONCE.',
    '',
    `cellId: ${payload.cellId}`,
    `branchId: ${payload.branchId}`,
    `objective: ${typeof brief.objective === 'string' ? brief.objective : ''}`,
    `question: ${typeof brief.question === 'string' ? brief.question : ''}`,
    `acceptedFrontierBasis: ${JSON.stringify(brief.frontierBasis ?? null)}`,
    `acceptedClaims: ${JSON.stringify(brief.acceptedClaims ?? [])}`,
  ];

  if (hasEvidence) {
    lines.push('', 'ALLOWED EVIDENCE (you may cite ONLY these evidence ids):');
    for (const id of allowed) lines.push(`- ${id}`);
    lines.push('', 'MATERIALIZED EVIDENCE SELECTIONS (the exact selected bytes; this is ALL you may read):');
    for (const selection of selections) {
      lines.push(
        `--- evidenceId: ${String(selection?.evidenceId)} | kind: ${String(selection?.kind)} | mediaType: ${String(selection?.mediaType)} | digest: ${String(selection?.digest)} ---`,
      );
      lines.push(String(selection?.text ?? ''));
    }
    lines.push(
      '',
      'EVIDENCE RULES:',
      '- You may cite ONLY evidence ids from the ALLOWED EVIDENCE list above; never invent, guess or cite any other id.',
      '- You may NOT browse the Vault or read any other source; the materialized selections above are ALL the evidence you may use.',
      '- Your result MUST include `evidenceRefs` set to the evidence ids you actually used (an array of id strings).',
    );
  }

  lines.push('', 'Do this now:');
  lines.push('1. Think briefly about the frozen question using ONLY the material above.');
  lines.push(
    '2. Call `palimpsest_branch_result` EXACTLY ONCE with {"statement":"<one concise, falsifiable statement that directly answers the question>"' +
      (hasEvidence ? ',"evidenceRefs":["<only evidence ids you actually used from the ALLOWED list>"]' : '') +
      '}. Do not call it again if it succeeds or fails.',
  );
  lines.push('3. Reply with one short line. Do nothing else.');
  return lines.join('\n');
}

/** Machine-readable line the harness parses; exactly one is printed, even on failure. */
function printBranchResult(result) {
  process.stdout.write(`PALIMPSEST_BRANCH_RESULT ${JSON.stringify(result)}\n`);
}

/** The worker's ONE machine-readable outcome line, printed by the worker process itself. */
function printWorkResult(result) {
  process.stdout.write(`PALIMPSEST_WORK_RESULT ${JSON.stringify(result)}\n`);
}

/**
 * The task text a worker receives: the canonical task-sufficient context and the working rules.
 *
 * It carries NO orchestration state — no attempt id, no scheduler sequence, no gate id, no lease — and
 * it does not offer a settlement verb, because the worker cannot settle anything. What it DOES say is
 * where it may work (this world), that it must commit what it wants delivered, and that its outcome is
 * a report rather than a completion.
 */
function workTask(context, indexText) {
  const list = (values) => (Array.isArray(values) && values.length > 0 ? values.map((value) => `  - ${value}`).join('\n') : '  (none)');
  /**
   * §D5-c3: the delivered context is ATTEMPT-CENTRIC — `{work, compiled}` — where `work` is the
   * task-level static half the D2 era passed flat and `compiled` adds this attempt's own manifest
   * identity and read-only continuation presentation. Read BOTH shapes: the flat fields no longer
   * exist on the delivered object, and a runner that only read them would brief the agent on an
   * empty task (measured live by the D5-LIVE gate).
   */
  const work = context.work ?? context;
  const lines = [
    'You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.',
    'You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.',
    '',
    `Project goal: ${work.projectGoal}`,
    `Requirements:\n${list(work.requirements)}`,
    `Decisions in force:\n${list(work.decisions)}`,
    '',
    `Your task: ${work.objective}`,
    `Write scope (changes outside it are refused when the product observes the tree):\n${list(work.writeScope)}`,
    `Required artifacts:\n${list(work.requiredArtifacts)}`,
    `Base commit: ${work.baseCommit}`,
    `What completion will require:\n${list(work.completionChecks)}`,
    `Independent verification required: ${work.independentVerificationRequired === true ? 'yes' : 'no'}`,
  ];
  /**
   * §D5-c2: the read-only PriorResultContext, when this attempt is a governed re-execution. It is
   * PRESENTATION — what a prior attempt did and how the world moved since — never authority: the
   * agent may read it for orientation, and nothing in it changes what settlement will accept.
   */
  const continuation = context.compiled?.continuation;
  if (continuation !== undefined && continuation !== null) {
    const prior = continuation.prior_execution ?? {};
    const world = continuation.world_transition ?? {};
    lines.push(
      '',
      'Continuation context (READ-ONLY background — never authority):',
      `  - a prior attempt already worked on this task; its self-report was: ${prior.worker_summary ?? '(none recorded)'}`,
      `  - that prior result is superseded here: the world has moved (${world.from_head ? String(world.from_head).slice(0, 12) : '?'} → ${world.to_head ? String(world.to_head).slice(0, 12) : '?'}), so re-verify everything against THIS world`,
      `  - prior observed changes: ${Array.isArray(prior.observed_changed_files) && prior.observed_changed_files.length > 0 ? prior.observed_changed_files.join(', ') : '(none recorded)'}`,
    );
  }
  /**
   * R1-L §6: THE MODEL-VISIBLE PULL INDEX.
   *
   * R1 measured that this was missing: `compiled.handles` arrived in the payload and was dropped here,
   * so all three R1 conditions produced byte-identical prompts and the primary experiment could not be
   * formed. The TEXT is the product's (`contextIndexText`, rendered by `renderWorkerContextIndex` from
   * the attempt's OWN compiled handles); this host only decides where it goes. It carries `kind` and
   * `handle` only — never a body — so the index stays visible and the body stays pull-only (§4).
   */
  if (typeof indexText === 'string' && indexText.length > 0) lines.push(indexText);
  lines.push(
    '',
    'How to work:',
    '  - your working directory IS your world: read, search, edit, run tests and commands, experiment freely inside it;',
    '  - commit the changes you want delivered, inside this worktree, before you report — an uncommitted tree cannot be settled;',
    '  - when you are done, call `palimpsest_worker_result` ONCE with kind READY_FOR_SETTLEMENT and a short summary of what you did;',
    '  - if the attempt lists project context above and a body would help, call `palimpsest_worker_context_pull` with exactly one listed handle; it is read-only background and never authority;',
    '  - if the task as defined cannot be finished inside your authority (scope too narrow, task wrong, a person must decide, an irreversible external action is needed), report kind NEEDS_ESCALATION with a reason instead — proposing is not authorizing;',
    '  - do not claim files, commits, passing tests, evidence or verification results in your report: the product observes all of that for itself.',
  );
  return lines.join('\n');
}

/**
 * The tool catalogue the model was ACTUALLY offered, read from the branch agent's
 * OWN real `request/header` session event — not from the in-process environment
 * object. This is the same durable evidence a reviewer can read from the persisted
 * session artifact, and it is what the structural branch-firewall proof asserts on.
 */
function offeredToolNames(session) {
  const names = new Set();
  for (let seq = 0; seq < session.seq; seq += 1) {
    const event = session.eventAt(seq);
    if (event?.type !== 'request/header') continue;
    const tools = event.data?.header?.tools;
    if (!Array.isArray(tools)) continue;
    for (const tool of tools) if (typeof tool?.name === 'string' && tool.name.length > 0) names.add(tool.name);
  }
  return [...names].sort();
}

/**
 * R2-U §16: THE ORDERED ACTION LOG — tool NAMES only, in the order the model first used them.
 *
 * §16 asks whether a worker pulled BEFORE it started editing, before it ran the visible oracle, and before
 * it committed. Those are ORDERING facts, so the telemetry has to preserve order rather than count.
 *
 * NAMES ONLY. No arguments, no results, no reasoning: a tool name is a host fact about which capability was
 * used, while an argument would carry the worker's own text and a result would carry file content. The
 * pull's own handle is already reported by the pull telemetry line, so nothing here needs to carry it.
 *
 * A tool call emits MORE THAN ONE session event (a start and an end), so consecutive repeats of one name
 * are collapsed: the log records the ordinal of a tool's FIRST use, which is the fact §16 asks about.
 */
function toolActionLog(session) {
  const firstUse = new Map();
  let ordinal = 0;
  for (let seq = 0; seq < session.seq; seq += 1) {
    const event = session.eventAt(seq);
    if (event === undefined || typeof event.type !== 'string' || !event.type.startsWith('tool/')) continue;
    const name = event.data?.name ?? event.data?.call?.name ?? null;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (firstUse.has(name)) continue;
    firstUse.set(name, ordinal);
    ordinal += 1;
  }
  return { order: [...firstUse.keys()], firstUse: Object.fromEntries(firstUse) };
}

/**
 * Run ONE ephemeral branch: create a fresh agent over a transient session,
 * deliver the branch task, read the ONE result the strict tool recorded, and exit.
 *
 * CAPABILITY BOUNDARY (UX-C §17/§37): the branch agent's OWN scoped tool view is
 * restricted to exactly `palimpsest_branch_result` in its `setup` hook, i.e. BEFORE
 * publication and the first prompt assembly, and for every subsequent turn of that
 * one agent. A prompt line is NOT the boundary; the capability set is. The branch
 * still creates no PeerRef/PersistentPoint, writes no Palimpsest store and calls no
 * admission — but the DSH host DOES durably persist a session artifact for the
 * branch process (see the anti-waste doc): treat that artifact as host-local
 * telemetry, not as a Palimpsest store or a durable principal.
 */
/**
 * Run ONE worker: create a fresh agent whose world is the prepared worktree, hand it the canonical task
 * context, read the ONE outcome it reported, and exit.
 *
 * THE CAPABILITY RULE (`capability-open + authority-closed`): the worker INHERITS the host's normal
 * engineering tools and denies the inherited Palimpsest semantic surface. The deny list is ENUMERATED
 * from the scope's own visible schemas rather than hard-coded, because `restrict()` refuses unknown
 * names — a static list would break the moment a deployment composed a different Palimpsest surface,
 * and would silently stop covering tools added later. The worker's own result tool is registered into
 * its OWN scope layer, which a restriction never filters.
 *
 * THE PRESENTATION RULE: the worker's scope presents PTC-first (`presentAs('ptc')`), so a multi-step
 * engineering task can gather and transform inside one program and cross the boundary once, through a
 * governed sink. Presentation is HOST CONFIGURATION: it never enters the TaskEnvelope, the
 * AttemptReport or any Work event, because how a worker uses its capabilities is not Work semantics.
 */
async function runWorker(ctx, deps) {
  const { host, agents, sessions, agentOptions, setup } = deps;
  const exitWith = (code) => {
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(code);
    else process.exit(code);
  };

  let reported = null;
  let failure = null;
  let offeredTools = [];
  let denied = [];
  let presentation = null;
  /** R2-U §16: the ordered first-use log of the worker's tool actions. */
  let actionLog = { order: [], firstUse: {} };
  // R1-S §17: the handles the worker actually pulled. Hoisted for the same reason `offeredTools` is: the
  // telemetry is emitted after the try/catch, where `environment` is no longer in scope.
  let pulledHandles = [];
  // R1-H: what the read boundary achieved, for the telemetry line. `undefined` until the boundary runs, so a
  // worker that failed before installing it reports "not installed" rather than a false success.
  let boundary = null;
  // R1-HR §10: the fail-closed capability verdict, computed from the surface the worker ACTUALLY has.
  let capability = null;
  // R1-HC §4/§5: the confidential-profile admission slot, and its verdict for the telemetry line.
  let capacity = null;
  // R2-U §7: which presentation arm this worker was composed under. Read once so the telemetry line and
  // the prompt cannot disagree, and defaulted to the production arm so a failed read is never an A1.
  const affordanceMode = resolveAffordanceMode(process.env[AFFORDANCE_ENV]);
  /** @type {undefined | (() => void)} */
  let releaseCapacity;
  /**
   * The telemetry line's payload, computed from whatever `boundary` holds. Three states are distinguishable
   * on purpose, because "not installed" and "installed but unsupported" are different facts and the live
   * gate asserts on the difference: a boundary that silently failed to load must not read as a pass.
   */
  const readBoundaryTelemetry = () => {
    if (boundary === null) return JSON.stringify({ installed: false });
    if (typeof boundary.unavailable === 'string') return JSON.stringify({ installed: false, unavailable: boundary.unavailable });
    const outcomes = boundary.kernel?.outcomes ?? [];
    return JSON.stringify({
      installed: true,
      kernel: {
        supported: boundary.kernel?.supported === true,
        ...(boundary.kernel?.unavailable === undefined ? {} : { unavailable: boundary.kernel.unavailable }),
        labelled: outcomes.filter((entry) => entry.verified).length,
        attempted: outcomes.length,
        unverified: outcomes.filter((entry) => !entry.verified).map((entry) => entry.path),
        skipped: (boundary.kernel?.skipped ?? []).length,
      },
      guard: { installed: boundary.guardInstalled === true, scope: boundary.guardScope, tools: boundary.fencedTools ?? [] },
      aliases: { clean: boundary.aliasesClean === true, found: (boundary.aliasScan?.aliases ?? []).length },
      residuals: (boundary.config?.residuals ?? []).length,
      contract: boundary.kernel?.contract === undefined
        ? undefined
        : { package: boundary.kernel.contract.package, resolvedVersion: boundary.kernel.contract.resolvedVersion, qualifiedVersion: boundary.kernel.contract.qualifiedVersion, drifted: boundary.kernel.contract.drifted === true },
    });
  };

  try {
    const environment = host.work;
    if (environment === undefined || environment.recorder === undefined) {
      failure = environment?.error ?? 'the worker environment was not composed';
    } else {
      /**
       * R1-H: INSTALL THE READ BOUNDARY before the agent exists.
       *
       * The worker's cwd IS its execution world (the port spawns with `cwd: workDir`), so the fence derives
       * its own layout from the process position rather than being told: the world is cwd, the repository is
       * the ancestor holding `.palimpsest`, and the host home is `DSH_HOME`. The KERNEL layer (a MEDIUM +
       * NO_READ_UP label) is applied here, in the Medium-integrity host, which is exactly why it can fence
       * the Low-integrity worker without fencing itself.
       *
       * The GUARD layer is registered GLOBALLY on `ctx` (R1-HR §10): the shipped `subagent`/`workflow`/
       * `job_output` capabilities reach OTHER scopes whose children inherit `read`, so a guard registered on
       * the worker's own agent scope would leave exactly the hole this stage exists to close.
       */
      const boundaryLoad = await loadBoundary();
      /**
       * R1-HC §4/§5: THE CONFIDENTIAL PROFILE'S CAPACITY ADMISSION.
       *
       * This backend cannot read-fence two ACTIVE worlds at once — a running worker's own workspace write
       * grant is the last writer of its world's label — so the host runs at most ONE confidential worker and
       * refuses (or the caller queues) beyond that. The slot is host-local and carries no semantics; the
       * refusal below is a HOST CAPACITY fact, never a Work outcome.
       *
       * It is taken BEFORE the agent exists, so a refused worker never composes anything.
       */
      if (boundaryLoad.module !== undefined && typeof boundaryLoad.module.openConfidentialSlot === 'function') {
        const slot = boundaryLoad.module.openConfidentialSlot({ home: process.env.DSH_HOME ?? process.cwd() });
        const acquired = slot.acquire();
        capacity = { granted: acquired.granted, detail: acquired.detail };
        if (acquired.granted) releaseCapacity = () => slot.release();
        else failure = acquired.detail;
      }
      if (boundaryLoad.module === undefined) {
        boundary = { unavailable: boundaryLoad.error };
      } else {
        boundary = boundaryLoad.module.installWorkerReadBoundary({ world: process.cwd(), context: ctx });
        /**
         * R1-HR: AN ALIAS THAT REACHES PROTECTED CONTENT REFUSES THE WORKER.
         *
         * A world sharing a file record with a protected file, or holding a reparse point into a protected
         * root, cannot be fenced at all: the sandbox's own write grant re-labels the world tree, and through
         * such an alias that grant overwrites the protected object's NO_READ_UP. The measurement is recorded
         * in `alias_guard.js`. Refusing here is the fail-closed answer — running anyway would produce a
         * worker that looks protected and is not.
         */
        if (boundary.aliasesClean === false) {
          failure = `refusing to run this worker: ${boundary.aliasRefusal ?? 'the execution world can reach protected content by alias'}`;
        }
      }
      // The name comes from the environment's OWN definition — the data Palimpsest sent — never from a
      // literal here, so the two sides cannot disagree about what the worker answers through.
      const resultToolName =
        typeof environment.tool?.name === 'string' && environment.tool.name.length > 0 ? environment.tool.name : undefined;
      if (resultToolName === undefined) {
        failure = 'the worker result tool name is unavailable; refusing to run a worker without a structural outcome boundary';
      } else {
        /**
         * R1-L §7/§13: the SECOND worker-private tool. Both are registered for EVERY worker — the pull
         * tool even when this attempt selected no capital — so the R1 conditions differ only in the
         * visible index and the resolvable handles, never in the tool catalogue.
         */
        const pullToolName =
          typeof environment.contextPullTool?.name === 'string' && environment.contextPullTool.name.length > 0
            ? environment.contextPullTool.name
            : undefined;
        /** Set inside `workerSetup` when the capability gate refuses; checked immediately after creation. */
        let capabilityRefusal = null;
        const workerSetup = (agentCtx) => {
          setup(agentCtx);
          // Enumerate what this scope INHERITS, then close the authority surface. The prefix comes from
          // the composed environment (one place knows what Palimpsest's tools are called).
          const prefix = typeof environment.deniedAuthorityPrefix === 'string' ? environment.deniedAuthorityPrefix : 'palimpsest_';
          const keep = [resultToolName, pullToolName].filter((name) => typeof name === 'string');
          const visible = typeof agentCtx.tools.schemas === 'function' ? agentCtx.tools.schemas() : [];
          denied = visible
            .map((entry) => (typeof entry?.name === 'string' ? entry.name : undefined))
            .filter((name) => typeof name === 'string' && name.startsWith(prefix) && !keep.includes(name));
          if (denied.length > 0) agentCtx.tools.restrict({ deny: denied });
          /**
           * R1-HR §10/§11: THE FAIL-CLOSED CAPABILITY GATE.
           *
           * The surface is enumerated from the scope's OWN view — what this worker can actually reach, not
           * what a declaration says it should — and every name must classify. An unclassified capability
           * REFUSES THE WORKER START: unknown is not assumed safe.
           *
           * The second condition matters as much as the first. Several shipped capabilities reach OTHER
           * scopes (`subagent` joins the parent preset for its child; `workflow` spawns those children;
           * `job_output` returns a job's captured output). Those are only safe while the read guard is
           * registered globally, so a per-agent registration is refused rather than silently leaving a hole.
           */
          if (boundaryLoad.module !== undefined && typeof boundaryLoad.module.admitWorker === 'function') {
            const surface = [...visible.map((entry) => (typeof entry?.name === 'string' ? entry.name : undefined)), resultToolName, pullToolName].filter((name) => typeof name === 'string');
            capability = boundaryLoad.module.admitWorker({ visibleNames: surface, guardScope: boundary?.guardScope });
            if (capability.allowed !== true) capabilityRefusal = capability.reason ?? 'the capability classification refused this worker';
          }
          // The worker's OWN layer: a restriction filters what a scope inherits and never what it
          // registers, so the two worker-private tools survive the deny above. The definitions arrive
          // already converted by the plugin layer, which owns that conversion.
          agentCtx.tools.register(environment.tool);
          if (pullToolName !== undefined) agentCtx.tools.register(environment.contextPullTool);
          if (typeof agentCtx.tools.presentAs === 'function') {
            agentCtx.tools.presentAs('ptc');
            presentation = 'ptc';
          }
        };
        const handle = await agents.create({
          sessionId: brandString(`worker-${randomUUID()}`),
          meta: { cwd: process.cwd() },
          agentOptions,
          setup: workerSetup,
        });
        /**
         * The gate fired: the worker's surface contained a capability the host cannot vouch for. The agent is
         * disposed immediately and the attempt is reported as a HOST failure — never as a Work outcome,
         * because no work happened. The setup closure runs during `agents.create`, so this is the first
         * moment the verdict exists.
         */
        if (capabilityRefusal !== null) {
          try {
            await handle.dispose?.();
          } catch {
            /* the agent may not have finished composing */
          }
          throw new Error(`refusing to run this worker: ${capabilityRefusal}`);
        }
        const agent = handle.agent;
        await agent.whenIdle();
        /**
         * R2-U §7: the affordance is applied to the COMPOSED PROMPT and nowhere else. In the default mode
         * this is the identity function, so a production deployment's prompt is unchanged; in
         * `explicit-review` it appends the one frozen clause.
         */
        agent.followup(userMessage(applyAffordance(workTask(environment.context, environment.contextIndexText), affordanceMode)));
        await agent.whenIdle();
        offeredTools = offeredToolNames(agent.session);
        /**
         * R2-U §16: the ORDERED action log, read from the same session artifact as `offeredTools`. Read here
         * — after the turn finished and before the session is flushed — so the ordering facts the trial
         * record needs are captured from durable evidence rather than from a prompt line.
         */
        actionLog = toolActionLog(agent.session);
        if (typeof sessions?.flush === 'function') {
          try {
            await sessions.flush(agent.session);
          } catch (error) {
            process.stderr.write(`palimpsest-runner: worker session flush failed: ${error?.message ?? String(error)}\n`);
          }
        }
        pulledHandles = Array.isArray(environment.pulledHandles) ? environment.pulledHandles : [];
        const recorder = environment.recorder;
        if (recorder.status === 'reported') {
          reported = recorder.outcome;
        } else {
          failure = recorder.violations.length > 0 ? recorder.violations.join('; ') : 'the worker finished without reporting an outcome';
        }
      }
    }
  } catch (error) {
    failure = error?.message ?? String(error);
  }

  // Noncanonical telemetry, exactly like PALIMPSEST_TURN: the worker's OWN recorded capability facts.
  // A reviewer (and the live gate) reads the firewall from here rather than from a prompt line.
  process.stdout.write(
    `PALIMPSEST_WORKER_ENV ${JSON.stringify({ cwd: process.cwd(), presentation, deniedTools: denied, offeredTools, affordance: affordanceMode })}
`,
  );
  /**
   * R1-L §17: WHICH HANDLES the worker actually pulled — and never a body.
   *
   * This is what gives the resumed R1 experiment a mechanical answer to "did the stochastic worker use
   * the capital?" without persisting any model reasoning. It is noncanonical host telemetry, exactly
   * like `PALIMPSEST_WORKER_ENV`.
   */
  process.stdout.write(
    `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: pulledHandles })}
`,
  );
  /**
   * R2-U §16: THE ORDERED ACTION LOG. Tool NAMES and their first-use ordinals only — no argument, no
   * result, no reasoning. This is what lets a trial record answer "did the worker pull BEFORE it started
   * editing / before it ran the oracle / before it committed" mechanically, rather than from a transcript.
   */
  process.stdout.write(
    `PALIMPSEST_WORKER_ACTIONS ${JSON.stringify({ order: actionLog.order, firstUse: actionLog.firstUse })}
`,
  );
  /**
   * R1-H: WHAT THE READ BOUNDARY ACHIEVED — the noncanonical fact a reviewer and the live gate read instead
   * of a prompt line. It reports counts and states only: no path, no body, no credential (§13/§16).
   */
  process.stdout.write(
    `PALIMPSEST_WORKER_READ_BOUNDARY ${readBoundaryTelemetry()}
`,
  );
  /**
   * R1-HR §10: WHAT THE CAPABILITY CLASSIFICATION DECIDED — counts per class and the verdict, never a path
   * and never a tool body. A reviewer and the live gate read the fail-closed decision from here.
   */
  process.stdout.write(
    `PALIMPSEST_WORKER_CAPACITY ${JSON.stringify(capacity ?? { granted: false, detail: 'the confidential profile slot was not consulted' })}
`,
  );
  process.stdout.write(
    `PALIMPSEST_WORKER_CAPABILITIES ${JSON.stringify(
      capability === null
        ? { classified: false }
        : { classified: true, allowed: capability.allowed === true, counts: capability.counts, unclassified: capability.classification?.unclassified ?? [], requiresGlobalGuard: capability.classification?.requiresGlobalGuard === true },
    )}
`,
  );

  if (releaseCapacity !== undefined) {
    releaseCapacity();
    releaseCapacity = undefined;
  }
  if (reported !== null && reported !== undefined) {
    printWorkResult({
      kind: reported.kind,
      summary: reported.summary,
      ...(reported.reason === undefined ? {} : { reason: reported.reason }),
      ...(reported.proposedAction === undefined ? {} : { proposedAction: reported.proposedAction }),
    });
    exitWith(0);
    return;
  }
  // A worker that did not report is a HOST fact, never a Work outcome: no attempt is failed here.
  printWorkResult({ kind: 'HOST_FAILURE', detail: failure ?? 'the worker produced no outcome' });
  exitWith(1);
}

async function runBranch(ctx, deps) {
  const { host, agents, sessions, agentOptions, setup } = deps;
  const exitWith = (code) => {
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(code);
    else process.exit(code);
  };

  let status = 'failed';
  let detail = '';
  let statement;
  let evidenceRefs = [];
  let offeredTools = [];

  try {
    const environment = host.branch;
    if (environment === undefined || environment.recorder === undefined) {
      detail = environment?.error ?? 'the packaged branch environment was not composed';
    } else {
      // Prefer the product constant; fall back to the composed tool definition's own
      // name (never to a prompt-derived literal).
      const branchToolName =
        typeof host.palimpsest?.BRANCH_RESULT_TOOL_NAME === 'string' && host.palimpsest.BRANCH_RESULT_TOOL_NAME.length > 0
          ? host.palimpsest.BRANCH_RESULT_TOOL_NAME
          : typeof environment.tool?.name === 'string' && environment.tool.name.length > 0
            ? environment.tool.name
            : undefined;
      if (branchToolName === undefined) {
        detail = 'the branch result tool name is unavailable; refusing to run a branch without a structural capability boundary';
      } else {
        // Block body on purpose: `tools.restrict()` returns a disposer (truthy), and
        // a truthy setup return is read as a commit handle by the agent factory.
        // PLMP-LEAN-1 §C.23 (D1-g): the allowlist is whatever the composed environment DECLARED —
        // `[palimpsest_branch_result]` for a RESULT_ONLY branch (every blocking `collaborate`
        // branch, unchanged), plus the host's read-only project tools for a PROJECT_READ_ONLY one (a
        // delegated research branch, which reads its frozen snapshot). The list is not guessed here:
        // the environment that owns the capability boundary publishes it.
        const allowedTools =
          Array.isArray(environment.allowedTools) && environment.allowedTools.length > 0
            ? environment.allowedTools
            : [branchToolName];
        const branchSetup = (agentCtx) => {
          setup(agentCtx);
          // Scope-local, structural, fail-closed: an unknown/scope-local name throws
          // here and the branch fails rather than silently keeping a wider tool set.
          agentCtx.tools.restrict({ allow: allowedTools });
        };
        const handle = await agents.create({
          sessionId: brandString(`branch-${randomUUID()}`),
          meta: { cwd: process.cwd() },
          agentOptions,
          setup: branchSetup,
        });
        const agent = handle.agent;
        await agent.whenIdle();
        agent.followup(userMessage(branchTask(environment.payload)));
        await agent.whenIdle();
        offeredTools = offeredToolNames(agent.session);
        if (typeof sessions?.flush === 'function') {
          try {
            await sessions.flush(agent.session);
          } catch (error) {
            process.stderr.write(`palimpsest-runner: branch session flush failed: ${error?.message ?? String(error)}\n`);
          }
        }

        const recorder = environment.recorder;
        if (recorder.status === 'completed') {
          status = 'completed';
          statement = recorder.statement;
          evidenceRefs = [...recorder.evidenceRefs];
          detail = recorder.detail;
        } else {
          status = 'failed';
          detail = recorder.violations.length > 0 ? recorder.violations.join('; ') : recorder.detail;
        }
      }
    }
  } catch (error) {
    status = 'failed';
    detail = error?.message ?? String(error);
  }

  printBranchResult({
    status,
    ...(statement === undefined ? {} : { statement }),
    evidenceRefs,
    offeredTools,
    detail,
  });
  exitWith(status === 'completed' ? 0 : 1);
}

async function run(ctx, deps) {
  const { startup, host, agents, sessions, defaultModel } = deps;
  await ctx.get('loader')?.await();

  const selection = defaultModel.currentSelection();
  const agentOptions = { provider: selection.provider, model: selection.model };
  // Block body on purpose: the loop treats a truthy setup return as a commit
  // handle, so setup must return undefined (exactly as the headless runner does).
  const setup = (agentCtx) => {
    installModelSelection(agentCtx, { current: selection, assembled: undefined });
  };

  if (startup.mode === 'branch') {
    await runBranch(ctx, { startup, host, agents, sessions, agentOptions, setup });
    return;
  }

  if (startup.mode === 'work') {
    await runWorker(ctx, { startup, host, agents, sessions, agentOptions, setup });
    return;
  }

  const handle =
    startup.mode === 'resume' && typeof startup.sessionId === 'string' && startup.sessionId.length > 0
      ? await agents.resume({ resumeSessionId: brandString(startup.sessionId), agentOptions, setup })
      : await agents.create({
          sessionId: brandString(`session-${randomUUID()}`),
          meta: { cwd: process.cwd() },
          agentOptions,
          setup,
        });

  const agent = handle.agent;
  await agent.whenIdle();

  const sessionId = String(agent.session.id);
  if (typeof startup.sessionIdFile === 'string' && startup.sessionIdFile.length > 0) {
    try {
      writeFileSync(startup.sessionIdFile, sessionId, 'utf8');
    } catch (error) {
      process.stderr.write(`palimpsest-runner: cannot persist session id: ${error?.message ?? String(error)}\n`);
    }
  }

  // UX-C §22/§61: the PRODUCT attention formatter for cross-project signals. It reads
  // only the signal's routing metadata (there is no message body on a signal), so no
  // peer-message content can reach the attention text. Other kinds keep ordinary text.
  const formatAttention = (signal) =>
    signal.kind === 'inbound_peer_message'
      ? host.palimpsest.crossProjectAttentionText(signal, 'either')
      : host.palimpsest.defaultAttentionText(signal);

  // UX-C §23/CF-UXB-03: the REAL resume-capable agents service, wired into the
  // EXISTING activation adapter. `get()` may return undefined for a cold session, in
  // which case the adapter cold-resumes the persisted session and queues a followup;
  // a failed resume/activation returns activated:false so the signal stays pending.
  // The wiring itself lives in the product (`composeRunnerActivation`) so the
  // cold-resume proof drives the SHIPPED construction, not a parallel stub.
  const activation = host.palimpsest.composeRunnerActivation({
    createAdapter: host.palimpsest.dshAgentsAttentionAdapter,
    agents,
    sessionId,
    agentOptions,
    setup,
    brandSessionId: (id) => brandString(String(id)),
    toUserMessage: (text) => userMessage(text),
    format: formatAttention,
  });
  // The deployment owns pump → drain → activate → mark-after-success (§24); the runner
  // only binds the host session this launcher could not know, then SCHEDULES the loop.
  host.deployment.bindAttentionActivation(activation);

  // Machine-readable readiness line for the dogfood harness (noncanonical). It reports
  // composed CAPABILITIES only — never any credential (§31) and never any private
  // project content. The local serve bearer token is deliberately NOT printed: the
  // URL alone identifies the endpoint, and a credential must not reach stdout.
  const readiness = host.deployment.collaborationReadiness();
  process.stdout.write(
    `PALIMPSEST_HOST_READY ${JSON.stringify({
      sessionId,
      mode: startup.mode,
      localPeer: host.profile?.localPeer ?? null,
      persistentPoint: host.profile?.persistentPoint ?? null,
      transportAdapter: host.deployment?.transport?.adapterId ?? null,
      attentionAdapter: activation.adapterId,
      attentionFormat: 'product (cross-project formatter + default)',
      application: host.deployment?.installed?.application ? 'full' : 'none',
      collaboration: readiness,
      toolNames: host.toolNames ?? [],
      url: host.serve?.url ?? null,
    })}\n`,
  );

  // Only tool calls, the final visible assistant text and the durable outcome are
  // reported — never private chain-of-thought.
  const printTurn = (fromSeq) => {
    const session = agent.session;
    const length = session.seq;
    let text = '';
    const toolCalls = [];
    for (let seq = fromSeq; seq < length; seq += 1) {
      const event = session.eventAt(seq);
      if (event === undefined) continue;
      if (event.type === 'assistant/message') {
        const joined = (event.data.message.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('');
        if (joined !== '') text = joined;
      }
      if (typeof event.type === 'string' && event.type.startsWith('tool/')) {
        const name = event.data?.name ?? event.data?.call?.name ?? null;
        toolCalls.push(name === null ? event.type : `${event.type}:${name}`);
      }
    }
    process.stdout.write(`PALIMPSEST_TURN ${JSON.stringify({ text, toolCalls })}\n`);
  };

  const deliver = async (text) => {
    const fromSeq = agent.session.seq;
    agent.followup(userMessage(text));
    await agent.whenIdle();
    await sessions.flush(agent.session);
    printTurn(fromSeq);
  };

  // PLMP-LEAN-1 §C.11 ③: a delegated research branch's TERMINAL result reaches the principal as one
  // ordinary turn on THIS agent — the same path the launch message and an activated attention turn
  // take, so it is a first-class, flushed, reported turn rather than an invisible one. The binding is
  // late (the deployment exists before this session does) and it is NOT attention: no signal is
  // minted and the canonical attention plane is untouched, because "a local research branch finished"
  // is not a peer message, a boundary decision or a commitment.
  host.deployment.bindDelegationDelivery({
    adapterId: 'dsh-delegation-terminal',
    async deliver(text) {
      try {
        await deliver(text);
        process.stdout.write(`PALIMPSEST_DELEGATION ${JSON.stringify({ delivered: true, text })}\n`);
        return { delivered: true, detail: 'delivered a terminal delegation result as a turn' };
      } catch (error) {
        const detail = `delivery failed: ${error?.message ?? String(error)}`;
        process.stdout.write(`PALIMPSEST_DELEGATION ${JSON.stringify({ delivered: false, detail })}\n`);
        return { delivered: false, detail };
      }
    },
  });

  if (typeof startup.message === 'string' && startup.message.trim() !== '') {
    await deliver(startup.message);
  }

  if (startup.once === true) {
    await host.deployment.close();
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(0);
    return;
  }

  const idleMs = Number.isFinite(startup.idleMs) && startup.idleMs > 0 ? startup.idleMs : 1500;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      // The ONE lifecycle owner: the runner schedules, the deployment performs
      // pump → drain → activate → mark-after-success. Overlapping ticks serialize on
      // `busy`; the pump cursor advances only after ingest; a failed activation leaves
      // the signal pending (never marked delivered).
      const fromSeq = agent.session.seq;
      const report = await host.deployment.pumpAndActivate();
      for (const entry of report.activations) {
        // The trailing newline is load-bearing: this record and the `PALIMPSEST_TURN`
        // printed just below are two INDEPENDENT machine lines. Without it a harness
        // that parses by `line.startsWith(...)` loses both records on one physical line.
        process.stdout.write(
          `PALIMPSEST_ACTIVATION ${JSON.stringify({ signalId: entry.signal.signalId, kind: entry.signal.kind, activated: entry.outcome.activated })}\n`,
        );
      }
      // RC-1 §11/§40 observability (no semantics): a successful activation queues a
      // turn on THIS same agent, but `followup` itself is fire-and-forget. Wait for
      // the activated turn to finish, flush it, and report its tool calls + final
      // visible text exactly like a launch turn — otherwise an attention-driven turn
      // is invisible to the harness and may not be durably persisted.
      if (report.activations.some((entry) => entry.outcome.activated === true)) {
        await agent.whenIdle();
        await sessions.flush(agent.session);
        printTurn(fromSeq);
      }
    } catch (error) {
      process.stderr.write(`palimpsest-runner loop: ${error?.stack ?? String(error)}\n`);
    } finally {
      busy = false;
    }
  }, idleMs);

  ctx.effect(function* () {
    yield () => clearInterval(timer);
  }, 'palimpsest-runner attention loop');

  // Keep the principal alive until the harness stops it.
  setInterval(() => {}, 1 << 30);
}

function apply(ctx) {
  const startup = ctx.get('palimpsestStartup');
  const host = ctx.get('palimpsestHost');
  const agents = ctx.get('agents');
  const sessions = ctx.get('sessions');
  const defaultModel = ctx.get('agentDefaultModel');
  if (startup === undefined || host === undefined || agents === undefined || sessions === undefined || defaultModel === undefined) {
    return;
  }
  run(ctx, { startup, host, agents, sessions, defaultModel }).catch((error) => {
    process.stderr.write(`palimpsest-runner: ${error?.stack ?? String(error)}\n`);
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(1);
  });
}

export { apply, branchTask };
