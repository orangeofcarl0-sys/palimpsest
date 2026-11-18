import { createHash, randomUUID } from 'node:crypto';
import { drawing, drawWork, drawPulse, drawProjection, key, sessionCalls } from './graph.js';

const coverageNames = ['Work', '正式 Worker', '项目接续', '版本引用', '协作', '运行域', '组织依据', '推理', 'DSH'];
const safeError = error => error instanceof Error ? error.message : String(error);

// One project per mounted principal. No client-provided project, DB path or source URL.
export function createInspector(host, { clock = Date.now, retention = 90, interval = 1500 } = {}) {
  const { controller, application: app, workDelegation, organization } = host.deployment.installed;
  const projectId = host.profile.projectId;
  const epoch = randomUUID();
  const calls = sessionCalls(host.toolNames);
  const frames = new Map();
  let workCache, latest, inFlight, observedAt = 0, serial = 0;

  function readWork(cursor) {
    if (workCache?.cursor === cursor) return workCache;
    const timeline = controller.store.projectTimeline(projectId);
    const initialized = controller.isProjectInitialized();
    const graph = initialized ? controller.orchestrationGraph() : null;
    const head = initialized ? controller.work.project().head_commit : null;
    return workCache = { cursor, timeline, graph, head };
  }

  async function sample() {
    const cursor = controller.viewCursor();
    const { graph, head, timeline } = readWork(cursor);
    const d = drawing();
    const coverage = d.coverage;
    for (const name of coverageNames) coverage[name] = '未挂载';
    if (graph) {
      drawWork(d, graph, head);
      coverage.Work = '已读取';
    } else {
      d.node(key('project', projectId), 0, '项目', projectId, '尚未建档', 'Work', projectId);
      coverage.Work = '尚未建档';
    }
    async function read(name, enabled, action) {
      if (!enabled) return;
      try { coverage[name] = await action() ?? '已读取'; }
      catch (error) { coverage[name] = '读取失败 · ' + safeError(error); }
    }
    await read('版本引用', head && app.projectWorkspace, async () => {
      for (const { entry } of await app.projectWorkspace.journal()) {
        if (entry.projectId !== projectId || entry.kind !== 'REFERENCE_NOTE' ||
            !entry.relatedRefs.some(r => r.kind === 'git_commit' && r.id === head)) continue;
        const note = d.node(key('journal', entry.entryId), 3, '版本依据', entry.title, null, '项目日志',
          entry.entryId, { 依据: entry.body, 记录来源: entry.provenance, 版本: head });
        d.edge(key('commit', head), note, '关联记录', '项目日志', entry.entryId);
      }
    });
    await read('正式 Worker', workDelegation, async () => {
      for (const job of await workDelegation.jobs()) {
        const node = d.node(key('worker', job.jobId), 1, 'Worker 作业', job.jobId, job.phase, '正式 Worker', job.jobId,
          { 任务: job.taskId, 结算: job.settlement?.state ?? null, 执行者: job.attribution?.executor ?? null, 宿主错误: job.hostError });
        d.edge(node, key('task', job.taskId), '执行任务', '正式 Worker');
        if (job.attemptId) d.edge(node, key('attempt', job.attemptId), '绑定尝试', '正式 Worker');
      }
    });
    await read('项目接续', graph && app.projectWorkspace, async () => {
      const pulse = await app.projectWorkspace.pulse();
      drawPulse(d, pulse);
      if (!pulse.coverage.complete) return '部分可见 · ' + [...pulse.coverage.unavailable, ...pulse.coverage.omitted].join('、');
    });
    await read('协作', app.federation, async () => {
      const env = await app.projections.collaboration();
      drawProjection(d, env, 'collaboration', '协作');
      if (env.knowledge !== 'known') return env.knowledge;
      d.edge(key('project', projectId), key('collaboration', 'collaboration:peer:' + host.profile.localPeer), '本地主体', '协作');
    });
    let scopes = [];
    await read('运行域', app.runtime, async () => {
      const env = await app.projections.runtime();
      drawProjection(d, env, 'runtime', '运行域');
      if (env.knowledge !== 'known') return env.knowledge;
      scopes = env.nodes.filter(n => n.kind === 'scope');
    });
    await read('组织依据', organization && app.runtime, async () => {
      for (const scope of scopes) {
        const state = await app.runtime.view(scope.ref.id);
        const basis = state.definition.organizationBasis;
        if (!basis) continue;
        const ns = key('organization', basis.organizationDefinitionId, basis.revision, basis.digest);
        const org = d.node(ns, 0, '组织修订', basis.organizationDefinitionId, 'r' + basis.revision, '组织依据', basis.digest);
        d.edge(key('runtime', scope.presentationId), org, '采用组织修订', '组织依据');
        const definition = await organization.store.get(basis);
        if (!definition) throw new Error('找不到绑定的组织修订 ' + basis.digest);
        const env = host.palimpsest.organizationProjection({ organizationDefinitionId: basis.organizationDefinitionId, definition, lifecycle: null });
        drawProjection(d, env, ns, '组织依据');
        for (const n of env.nodes) d.edge(org, key(ns, n.presentationId), n.kind === 'role' ? '定义角色' : '包含成员', '组织依据');
      }
      return scopes.length ? '按运行域的修订引用' : '无可见运行域引用';
    });
    await read('推理', app.reasoning, async () => {
      for (const cell of await app.reasoning.listCells()) {
        const ns = key('cell', cell.cellId);
        const cellNode = d.node(ns, 0, '推理单元', cell.objective, null, '推理', cell.cellId);
        const env = await app.projections.reasoning({ cellId: cell.cellId });
        if (env.knowledge !== 'known') throw new Error(cell.cellId + ' · ' + env.knowledge);
        drawProjection(d, env, ns, '推理');
        for (const n of env.nodes) d.edge(cellNode, key(ns, n.presentationId), '单元内', '推理');
      }
    });
    calls.draw(d);
    coverage.DSH = '本宿主最近 64 笔 Palimpsest 调用';
    if (controller.viewCursor() !== cursor) return false;
    const state = d.finish();
    const seq = timeline[0]?.seq ?? 0;
    const digest = createHash('sha256').update(JSON.stringify([state, seq])).digest('hex');
    observedAt = clock();
    if (digest === latest?.digest) return true;
    const previous = new Map(latest?.state.nodes.map(n => [n.id, n]));
    const changed = state.nodes.find(n => JSON.stringify(n) !== JSON.stringify(previous.get(n.id)));
    const title = !latest ? '接入项目' : latest.seq !== seq ? timeline[0].kind :
      changed ? changed.kind + ' · ' + (changed.state ?? changed.label) : '关系或来源变化';
    latest = { id: ++serial, at: observedAt, title, digest, seq, state };
    frames.set(serial, latest);
    if (frames.size > retention) frames.delete(frames.keys().next().value);
    return true;
  }

  async function live(known) {
    if (!latest || clock() - observedAt >= interval) {
      inFlight ??= (async () => {
        if (!await sample() && !await sample()) throw new Error('项目在读取期间推进，等待下一次观察');
      })().finally(() => { inFlight = undefined; });
      await inFlight;
    }
    const base = { projectId, epoch, observedAt, latest: latest.id };
    if (known?.epoch === epoch && known.id === latest.id) return base;
    return { ...base, frame: latest, frames: [...frames.values()].map(({ id, at, title, seq }) => ({ id, at, title, seq })),
      events: workCache.timeline };
  }

  function historical(sequence, signal) {
    return controller.store.readProjectPrefix(projectId, sequence, (connection, project) => {
      // A process-local attribution observed today does not belong in a ledger cut.
      const graph = host.palimpsest.buildOrchestrationGraph({ projectId, connection, project, attribution: new Map() });
      const d = drawing();
      drawWork(d, graph, project.head_commit);
      d.coverage.Work = '账本重建 · #' + sequence;
      return { seq: sequence, state: d.finish() };
    }, signal);
  }
  const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
  const fields = new Map([['live', ['epoch', 'id']], ['frame', ['epoch', 'id']], ['cut', ['epoch', 'seq']], ['earlier', ['epoch', 'before']]]);
  async function read(endpoint, input, signal) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('invalid', '请求格式错误');
    const allowed = fields.get(endpoint);
    if (!allowed) return failure('unknown', '未知的只读请求');
    if (Object.keys(input).some(k => !allowed.includes(k))) return failure('invalid', '只可读取当前部署和指定时点');
    try {
      if (endpoint === 'live') return { ok: true, value: await live(input) };
      if (input.epoch !== epoch) return failure('expired', '宿主已重新启动');
      if (endpoint === 'frame') {
        const frame = frames.get(input.id);
        return frame ? { ok: true, value: frame } : failure('expired', '观察已移出宿主窗口');
      }
      if (endpoint === 'cut') return { ok: true, value: await historical(input.seq, signal) };
      if (endpoint === 'earlier') return { ok: true, value: controller.store.projectTimeline(projectId, input.before) };
      return failure('unknown', '未知的只读请求');
    } catch (error) { return failure('unavailable', safeError(error)); }
  }
  return { read, onSessionEvent: calls.record };
}

export function mountInspector(ctx, host) {
  // A headless host and ephemeral workers install no browser route or polling timer.
  ctx.inject(['webServer', 'connection', 'sessions'], web => {
    const inspector = createInspector(host);
    // This is DSH's authenticated shared channel. Its exact Fetch routes admit only the
    // owner Peer, including for in-process transports and shared-session viewers.
    web.connection.fetch.register({
      path: '/api/palimpsest/inspector', methods: ['GET'], requestBody: 'buffered',
      async fetch(request) {
        const params = new URL(request.url).searchParams;
        const input = Object.fromEntries(params);
        const endpoint = input.view;
        delete input.view;
        for (const k of ['id', 'seq', 'before']) if (k in input) input[k] = Number(input[k]);
        const result = await inspector.read(endpoint, input, request.signal);
        return Response.json(result, { headers: { 'cache-control': 'no-store' } });
      },
    });
    web.on('session/event', (session, event) => {
      if (web.sessions.get(session.id) === session) inspector.onSessionEvent(session, event);
    }, { global: true });
  });
}
