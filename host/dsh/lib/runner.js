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
function workTask(context) {
  const list = (values) => (Array.isArray(values) && values.length > 0 ? values.map((value) => `  - ${value}`).join('\n') : '  (none)');
  return [
    'You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.',
    'You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.',
    '',
    `Project goal: ${context.projectGoal}`,
    `Requirements:\n${list(context.requirements)}`,
    `Decisions in force:\n${list(context.decisions)}`,
    '',
    `Your task: ${context.objective}`,
    `Write scope (changes outside it are refused when the product observes the tree):\n${list(context.writeScope)}`,
    `Required artifacts:\n${list(context.requiredArtifacts)}`,
    `Base commit: ${context.baseCommit}`,
    `What completion will require:\n${list(context.completionChecks)}`,
    `Independent verification required: ${context.independentVerificationRequired === true ? 'yes' : 'no'}`,
    '',
    'How to work:',
    '  - your working directory IS your world: read, search, edit, run tests and commands, experiment freely inside it;',
    '  - commit the changes you want delivered, inside this worktree, before you report — an uncommitted tree cannot be settled;',
    `  - when you are done, call \`palimpsest_worker_result\` ONCE with kind READY_FOR_SETTLEMENT and a short summary of what you did;`,
    '  - if the task as defined cannot be finished inside your authority (scope too narrow, task wrong, a person must decide, an irreversible external action is needed), report kind NEEDS_ESCALATION with a reason instead — proposing is not authorizing;',
    '  - do not claim files, commits, passing tests, evidence or verification results in your report: the product observes all of that for itself.',
  ].join('\n');
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

  try {
    const environment = host.work;
    if (environment === undefined || environment.recorder === undefined) {
      failure = environment?.error ?? 'the worker environment was not composed';
    } else {
      // The name comes from the environment's OWN definition — the data Palimpsest sent — never from a
      // literal here, so the two sides cannot disagree about what the worker answers through.
      const resultToolName =
        typeof environment.tool?.name === 'string' && environment.tool.name.length > 0 ? environment.tool.name : undefined;
      if (resultToolName === undefined) {
        failure = 'the worker result tool name is unavailable; refusing to run a worker without a structural outcome boundary';
      } else {
        const workerSetup = (agentCtx) => {
          setup(agentCtx);
          // Enumerate what this scope INHERITS, then close the authority surface. The prefix comes from
          // the composed environment (one place knows what Palimpsest's tools are called).
          const prefix = typeof environment.deniedAuthorityPrefix === 'string' ? environment.deniedAuthorityPrefix : 'palimpsest_';
          const visible = typeof agentCtx.tools.schemas === 'function' ? agentCtx.tools.schemas() : [];
          denied = visible
            .map((entry) => (typeof entry?.name === 'string' ? entry.name : undefined))
            .filter((name) => typeof name === 'string' && name.startsWith(prefix) && name !== resultToolName);
          if (denied.length > 0) agentCtx.tools.restrict({ deny: denied });
          // The worker's OWN layer: a restriction filters what a scope inherits and never what it
          // registers, so the outcome tool survives the deny above. The definition arrives already
          // converted by the plugin layer, which owns that conversion.
          agentCtx.tools.register(environment.tool);
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
        const agent = handle.agent;
        await agent.whenIdle();
        agent.followup(userMessage(workTask(environment.context)));
        await agent.whenIdle();
        offeredTools = offeredToolNames(agent.session);
        if (typeof sessions?.flush === 'function') {
          try {
            await sessions.flush(agent.session);
          } catch (error) {
            process.stderr.write(`palimpsest-runner: worker session flush failed: ${error?.message ?? String(error)}\n`);
          }
        }
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
    `PALIMPSEST_WORKER_ENV ${JSON.stringify({ cwd: process.cwd(), presentation, deniedTools: denied, offeredTools })}
`,
  );

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
