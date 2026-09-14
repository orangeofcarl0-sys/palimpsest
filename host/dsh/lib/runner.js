// palimpsest-dsh-host/runner — the persistent project principal.
//
// Creates or COLD-RESUMES one durable principal session over the real DSH agent
// runtime, delivers the launch message, then runs an attention loop:
//
//   durable semantic fact → Palimpsest AttentionSignal → the REAL Palimpsest
//   host activation adapter (dshAgentsAttentionAdapter) → agent.followup(turn)
//   → the SAME persistent principal decides using the palimpsest_* tools.
//
// Notification ≠ Activation: the loop only wakes the agent; all semantic
// decisions are made by the agent through the product tools. The host session id
// is NOT the PeerRef: a cold resume mints a fresh agent over the persisted
// session while the Palimpsest identity (PeerRef/PersistentPoint) is unchanged.
//
// No chain-of-thought is captured: only tool calls, semantic state, host
// activation events and the final visible response matter to the dogfood.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { brandString } from '@deepseek-ai/dsh-brand';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

export const name = 'palimpsest-runner';
export const inject = ['agents', 'sessions', 'agentDefaultModel', 'palimpsestStartup', 'palimpsestHost'];

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
}

/**
 * The task text for ONE ephemeral reasoning branch. It carries everything the
 * agent needs to act (cellId/branchId/question/frontier) and explicitly forbids
 * the actions a branch must never take (open branch / evaluate / invalidate).
 */
function branchTask(brief, cellId, branchId) {
  const objective = typeof brief.objective === 'string' ? brief.objective : '';
  const question = typeof brief.question === 'string' ? brief.question : '';
  return [
    'You are an EPHEMERAL reasoning branch of a Palimpsest ReasoningCell. You are NOT a durable principal: you create no peer, no persistent point and no durable session. You may ONLY read the frozen brief and submit exactly ONE structured candidate.',
    'Do NOT call palimpsest_reasoning with action "branch", "evaluate" or "invalidate" (they are forbidden for a branch).',
    '',
    `cellId: ${cellId}`,
    `branchId: ${branchId}`,
    `objective: ${objective}`,
    `question: ${question}`,
    `acceptedFrontierBasis: ${JSON.stringify(brief.frontierBasis ?? null)}`,
    `acceptedClaims: ${JSON.stringify(brief.acceptedClaims ?? [])}`,
    '',
    'Do this now:',
    `1. Call palimpsest_reasoning with action "brief", cellId "${cellId}", branchId "${branchId}" to read the frozen brief and the accepted frontier.`,
    '2. Think briefly, then call palimpsest_reasoning with action "candidate", cellId "' +
      cellId +
      '", branchId "' +
      branchId +
      '", type {"typeId":"reasoning.statement","version":"v1"}, content {"statement":"<one concise, falsifiable statement that directly answers the question>"}. Submit EXACTLY ONE candidate. Do not try again if it succeeds or fails.',
    '3. Reply with one short line. Do nothing else.',
  ].join('\n');
}

/** Machine-readable line the harness parses; exactly one is printed, even on failure. */
function printBranchResult(result) {
  process.stdout.write(`PALIMPSEST_BRANCH_RESULT ${JSON.stringify(result)}\n`);
}

/**
 * Run ONE ephemeral branch: create a fresh in-memory agent (no --session-file
 * write, no resume, not kept alive), deliver the branch task, observe the single
 * structured candidate it submitted through the real ReasoningCell service, and
 * exit. A branch NEVER opens a durable principal, writes a session id file,
 * creates a peer, or calls admission.
 */
async function runBranch(ctx, deps) {
  const { startup, host, agents, agentOptions, setup } = deps;
  const exitWith = (code) => {
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(code);
    else process.exit(code);
  };

  let status = 'failed';
  let detail = '';
  let candidateDigest;
  let statement;
  let submitted = false;

  try {
    const brief = JSON.parse(readFileSync(startup.branchFile, 'utf8'));
    const cellId = brief?.cell && typeof brief.cell.cellId === 'string' ? brief.cell.cellId : undefined;
    const branchId = brief?.branch && typeof brief.branch.branchId === 'string' ? brief.branch.branchId : undefined;
    if (cellId === undefined || branchId === undefined) {
      detail = 'branch brief is missing cell/branch identity';
    } else {
      const handle = await agents.create({
        sessionId: brandString(`branch-${randomUUID()}`),
        meta: { cwd: process.cwd() },
        agentOptions,
        setup,
      });
      const agent = handle.agent;
      await agent.whenIdle();

      const fromSeq = agent.session.seq;
      agent.followup(userMessage(branchTask(brief, cellId, branchId)));
      await agent.whenIdle();

      // Observe ONLY tool calls / results (never private reasoning) to find the
      // one candidate submitted through palimpsest_reasoning.
      const session = agent.session;
      const length = session.seq;
      const candidateCalls = new Map();
      for (let seq = fromSeq; seq < length; seq += 1) {
        const event = session.eventAt(seq);
        if (event === undefined) continue;
        if (event.type === 'tool/call' && event.data?.name === 'palimpsest_reasoning') {
          let args;
          try {
            args = JSON.parse(event.data.arguments ?? '{}');
          } catch {
            args = {};
          }
          const callId = String(event.data.callId ?? '');
          candidateCalls.set(callId, args);
          if (args?.action === 'candidate') {
            submitted = true;
            if (typeof args.content?.statement === 'string' && args.content.statement.trim() !== '') statement = args.content.statement;
          }
        } else if (event.type === 'tool/result') {
          const block = event.data?.message?.content?.[0];
          if (block === undefined) continue;
          const args = candidateCalls.get(String(block.toolCallId ?? ''));
          if (args?.action !== 'candidate') continue;
          const text = (block.content ?? [])
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('');
          const match = /"candidateDigest"\s*:\s*"([^"]+)"/u.exec(text);
          if (match !== null) candidateDigest = match[1];
          if (typeof args.content?.statement === 'string' && args.content.statement.trim() !== '') statement = args.content.statement;
        }
      }
      status = submitted ? 'completed' : 'failed';
      detail = submitted ? `branch submitted a candidate through the real ReasoningCell service (${cellId}/${branchId})` : 'branch did not submit a candidate through palimpsest_reasoning';
    }
  } catch (error) {
    status = 'failed';
    detail = error?.message ?? String(error);
  }

  printBranchResult({
    status,
    ...(candidateDigest === undefined ? {} : { candidateDigest }),
    ...(statement === undefined ? {} : { statement }),
    detail,
  });
  try {
    await host.deployment.close();
  } catch {
    /* the harness may already have closed the deployment */
  }
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
    await runBranch(ctx, { startup, host, agents, agentOptions, setup });
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

  // Machine-readable readiness line for the dogfood harness (noncanonical).
  process.stdout.write(
    `PALIMPSEST_HOST_READY ${JSON.stringify({
      sessionId,
      mode: startup.mode,
      localPeer: host.profile?.localPeer ?? null,
      persistentPoint: host.profile?.persistentPoint ?? null,
      transportAdapter: host.deployment?.transport?.adapterId ?? null,
      attentionAdapter: 'dsh-agents (in-process real agent service)',
      application: host.deployment?.installed?.application ? 'full' : 'none',
      toolNames: host.toolNames ?? [],
      url: host.serve?.url ?? null,
      token: host.serve?.token ?? null,
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

  if (typeof startup.message === 'string' && startup.message.trim() !== '') {
    await deliver(startup.message);
  }

  if (startup.once === true) {
    await host.deployment.close();
    const exit = ctx.get('appExit');
    if (typeof exit === 'function') exit(0);
    return;
  }

  // The REAL Palimpsest host activation adapter, bound to the live agent. The
  // string→UserMessage shim is host-side (the adapter asserts a followup(string)).
  const activation = host.palimpsest.dshAgentsAttentionAdapter({
    agents: { get: () => ({ followup: (text) => agent.followup(userMessage(text)) }) },
    resumeSessionId: sessionId,
  });

  const idleMs = Number.isFinite(startup.idleMs) && startup.idleMs > 0 ? startup.idleMs : 1500;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await host.deployment.pump.pumpOnce();
      const attention = host.deployment.installed.attention;
      if (attention !== undefined) {
        const signals = await attention.drain();
        for (const signal of signals) {
          const outcome = await activation.activate(signal);
          process.stdout.write(
            `PALIMPSEST_ACTIVATION ${JSON.stringify({ signalId: signal.signalId, kind: signal.kind, activated: outcome.activated })}\n`,
          );
          if (outcome.activated) await attention.markDelivered([signal.signalId]);
        }
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

export { apply };
