// Presentation identities include the owner and its scope. Equal display names never merge objects.
export const key = (...parts) => JSON.stringify(parts);

export function drawing() {
  const nodes = new Map();
  const edges = new Map();
  const coverage = {};
  function node(id, lane, kind, label, state, source, ref, facts = {}) {
    nodes.set(id, { id, lane, kind, label, state, source, ref, facts });
    return id;
  }
  function edge(from, to, kind, source, ref = '') {
    const id = key(source, kind, from, to, ref);
    edges.set(id, { id, from, to, kind, source, ref });
  }
  function finish() {
    const sort = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return { nodes: [...nodes.values()].sort(sort), edges: [...edges.values()].filter(e => nodes.has(e.from) && nodes.has(e.to)).sort(sort), coverage };
  }
  return { node, edge, coverage, finish };
}

export function drawWork(d, graph, headCommit) {
  const { project, tasks, promotions } = graph;
  const root = d.node(key('project', project.projectId), 0, '项目', project.projectId, project.paused ? '调度暂停' : '调度开放',
    'Work', project.projectId, { 目标: project.goal, 修订: project.revision });
  if (headCommit) {
    const head = d.node(key('commit', headCommit), 3, '项目版本', headCommit.slice(0, 12), null, 'Work', headCommit);
    d.edge(root, head, '项目 HEAD', 'Work');
  }
  for (const task of tasks) {
    const taskKey = d.node(key('task', task.taskId), 2, '任务', task.objective, task.state, 'Work', task.taskId,
      { 写范围: task.writePaths, 要求交付: task.requiredArtifacts, 调试挂起: task.held ?? null });
    const role = d.node(key('role', task.role), 1, '任务角色', task.role, null, 'Work', task.role);
    d.edge(root, role, '声明角色', 'Work');
    d.edge(role, taskKey, '负责', 'Work');
    if (task.scopeId) {
      const scope = d.node(key('work-scope', task.scopeId), 0, '工作分组', task.scopeId, null, 'Work', task.scopeId);
      d.edge(scope, taskKey, '包含任务', 'Work');
    }
    for (const dep of task.dependsOn) d.edge(key('task', dep), taskKey, '前置任务', 'Work');
    for (const attempt of task.attempts) {
      const run = d.node(key('attempt', attempt.attemptId), 2, '执行尝试', attempt.attemptId, attempt.state, 'Work', attempt.attemptId,
        { 最近记录: attempt.timeline.slice(-6), 模型归因: attempt.attribution?.model ?? null });
      d.edge(taskKey, run, '执行', 'Work');
      for (const id of attempt.evidence) {
        d.edge(run, d.node(key('evidence', id), 3, '证据', id, null, 'Work', id), '记录证据', 'Work');
      }
    }
  }
  for (const p of promotions) {
    const promotion = d.node(key('promotion', p.promotionId), 3, '晋升', p.promotionId, p.state, 'Work', p.promotionId);
    d.edge(key('attempt', p.attemptId), promotion, '晋升记录', 'Work');
  }
}

const actorKinds = new Set(['peer', 'external_peer', 'member', 'role', 'activation']);
const anchorKinds = new Set(['scope', 'workspace', 'external_boundary']);
const resultKinds = new Set(['claim', 'candidate']);
export function drawProjection(d, envelope, scope, source) {
  for (const n of envelope.nodes) {
    const lane = actorKinds.has(n.kind) ? 1 : anchorKinds.has(n.kind) ? 0 : resultKinds.has(n.kind) ? 3 : 2;
    d.node(key(scope, n.presentationId), lane, n.kind, n.label, n.state, source, n.ref.id);
  }
  for (const e of envelope.edges) d.edge(key(scope, e.from), key(scope, e.to), e.kind, source, e.presentationId);
}

export function drawPulse(d, pulse) {
  const root = key('project', pulse.projectId);
  const ep = pulse.episode;
  if (ep.conclusion) {
    const c = ep.conclusion;
    const n = d.node(key('episode', c.conclusionId), 3, '会话结论', c.intent, ep.state, '项目接续', c.conclusionId,
      { 陈述: c.statement, 等待: c.waitingOn, 仍适用: ep.current, 时间: c.recordedAt });
    d.edge(root, n, '记录结论', '项目接续');
  }
  for (const item of pulse.delegations) {
    const n = d.node(key('delegation', item.delegationRef), 2, '委派', item.task, item.state, '项目接续', item.delegationRef,
      { 基线: item.basisCommit, 已评估: item.assessed });
    d.edge(root, n, '发出委派', '项目接续');
    if (item.contributionId) d.edge(n, key('contribution', item.contributionId), '交回贡献', '项目接续');
  }
  for (const item of pulse.decisionQueue.filter(i => i.kind === 'OPERATOR_ACCEPTANCE' && i.ref.startsWith('task:'))) {
    const owner = d.node(key('operator'), 1, '审批角色', '项目所有者', null, '项目接续', 'OPERATOR');
    d.edge(key('task', item.ref.slice(5)), owner, '待所有者判断', '项目接续', item.ref);
  }
  for (const { record, status, downstream, decisions = [] } of pulse.contributions) {
    const n = d.node(key('contribution', record.contributionId), 3, '贡献', record.finding, status, '项目接续', record.contributionId,
      { 来源: record.sourceRef, 任务: record.task, 工件: record.artifacts });
    for (const id of downstream.addedTaskIds) d.edge(n, key('task', id), '产生后续任务', '项目接续');
    for (const { record: decision, journalEntryId } of decisions) {
      const choice = d.node(key('contribution-decision', decision.decisionId), 3, '贡献决定', decision.decision,
        decision.basisState, '项目接续', decision.decisionId,
        { 依据: decision.decisionNote, 决定时版本: decision.basisAtDecision.headCommit, 日志: journalEntryId });
      d.edge(n, choice, '评估发现', '项目接续', journalEntryId);
    }
  }
  for (const { taskId, relay } of pulse.execution.attempts) {
    if (!taskId || !relay) continue;
    const result = d.node(key('settlement', taskId, relay.resultCommit), 3, '结算记录', relay.resultCommit.slice(0, 12), null,
      '项目接续', relay.resultCommit, { 执行归因: relay.attribution, 执行角色: relay.executor, 结算方: relay.settledBy, 依据: relay.detail });
    d.edge(key('task', taskId), result, '最近结算结果', '项目接续');
    const label = { ORIGINAL_WORKER: '原 Worker', SUBSEQUENT_WORKER: '接续 Worker', PRINCIPAL: 'Principal' }[relay.executor];
    if (label) {
      const actor = d.node(key('settlement-role', taskId, relay.resultCommit, relay.executor), 1,
        '结算时的执行角色', label, null, '项目接续', relay.executor, { 任务: taskId });
      d.edge(actor, result, '执行归因', '项目接续');
    }
  }
  for (const [group, entries] of [['接受成果', pulse.acceptedAssets], ['候选结果', pulse.candidates]]) {
    for (const item of entries) {
      const pending = item.id.startsWith('loop:');
      const kind = pending ? '待处理事项' : group;
      const n = d.node(key('asset', item.id), pending ? 2 : 3, kind, item.title, item.standing, '项目接续', item.id,
        { 说明: item.detail, 来源: item.sourceRefs, 当前适用性: item.currentApplicability });
      d.edge(root, n, kind, '项目接续');
      for (const ref of item.sourceRefs) {
        if (ref.startsWith('task:')) d.edge(key('task', ref.slice(5)), n, '关联事项', '项目接续');
        if (ref.startsWith('promotion:')) d.edge(key('promotion', ref.slice(10)), n, '接受依据', '项目接续');
      }
    }
  }
}

// Only structural metadata from this deployment's registered tools is retained.
// The session and call ID pair is the identity even when two sessions reuse a call ID.
export function sessionCalls(toolNames) {
  const names = new Set(toolNames);
  const calls = new Map();
  function record(session, event) {
    const data = event.data;
    const isPtc = event.type === 'tool/ptc-dispatch-start' || event.type === 'tool/ptc-dispatch';
    const result = event.type === 'tool/result' || event.type === 'tool/ptc-dispatch';
    if (!isPtc && event.type !== 'tool/call' && !result) return;
    const callId = isPtc ? data.subCallId : result ? data.message.toolCallId ?? data.message.source?.callId : data.callId;
    if (callId == null || !session.id) return;
    const id = key(session.id, String(callId));
    const previous = calls.get(id);
    const name = previous?.name ?? data.name;
    if (!names.has(name)) return;
    if (previous && previous.seq >= event.seq) return;
    calls.delete(id);
    const failed = result && (isPtc ? data.isError : data.message.isError);
    calls.set(id, { session: session.id, id: String(callId), name, seq: event.seq,
      started: result ? previous?.started ?? null : event.seq, returned: result ? event.seq : null,
      state: failed ? '工具错误' : result ? '已返回' : '已调用' });
    if (calls.size > 64) calls.delete(calls.keys().next().value);
  }
  function draw(d) {
    for (const c of calls.values()) {
      const session = d.node(key('session', c.session), 1, 'DSH 会话', c.session, null, 'DSH', c.session);
      const call = d.node(key('call', c.session, c.id), 2, '工具调用', c.name, c.state, 'DSH', c.id, { 会话: c.session, 调用序号: c.started, 结果序号: c.returned });
      d.edge(session, call, '调用', 'DSH');
    }
  }
  return { record, draw };
}
