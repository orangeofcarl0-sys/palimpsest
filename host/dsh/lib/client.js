// Native DSH browser module. React comes from the renderer that owns the slots.
window.__ModuleLoader__.load({ id: 'palimpsest-dsh-host', factory(require) {
  const React = require('react');
  const { createElement: h, useState, useEffect, useRef } = React;
  const laneNames = ['项目与世界', '主体与角色', '工作与执行', '成果与证据'];
  const laneColors = ['#678b88', '#7e79b6', '#367caa', '#af8150'];
  const fmt = at => at == null ? '—' : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
  const clip = (text, n) => Array.from(String(text)).slice(0, n).join('') + (Array.from(String(text)).length > n ? '…' : '');
  const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
  const badge = (label, className) => h('span', { className }, label);

  function Icon({ size = 18 }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
      h('path', { d: 'M6 6 17 11M6 18l11-6M6 8v8' }), ...[[5,5],[18,11],[5,19]].map(([cx,cy]) => h('circle', { key: cy, cx, cy, r: 2.4, fill: 'currentColor' })));
  }

  function Graph({ state, selected, select, positions, scale, query, neighbors }) {
    const points = new Map();
    const current = new Set(state.nodes.map(n => n.id));
    for (const slots of positions) for (const id of slots.keys()) if (!current.has(id)) slots.delete(id);
    const usedSlots = positions.map(slots => new Set(slots.values()));
    const nextSlot = positions.map(() => 0);
    for (const n of state.nodes) {
      const slots = positions[n.lane];
      if (!slots.has(n.id)) {
        while (usedSlots[n.lane].has(nextSlot[n.lane])) nextSlot[n.lane]++;
        slots.set(n.id, nextSlot[n.lane]++);
      }
      points.set(n.id, { x: 18 + n.lane * 221, y: 48 + slots.get(n.id) * 78 });
    }
    const related = new Set([selected]);
    for (const e of state.edges) if ([e.id, e.from, e.to].includes(selected)) {
      related.add(e.id); related.add(e.from); related.add(e.to);
    }
    const height = Math.max(250, ...Array.from(points.values(), p => p.y + 78));
    const width = 885;
    const selectionPresent = current.has(selected) || state.edges.some(e => e.id === selected);
    const visible = id => !neighbors || !selectionPresent || related.has(id);
    const accessible = (id, label) => ({
      role: 'button', tabIndex: 0, 'aria-label': label, onClick: () => select(id),
      onKeyDown: e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); select(id); } },
    });
    return h('svg', { className: 'pi-graph', width: width * scale, height: height * scale, viewBox: '0 0 ' + width + ' ' + height,
      'aria-label': '当前时点的工作关系图' },
      h('defs', null, h('marker', { id: 'pi-arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' },
        h('path', { d: 'M0,0 L8,4 L0,8', fill: 'var(--pi-edge)' }))),
      ...laneNames.map((name, i) => h('g', { key: name }, h('text', { x: 18 + i * 221, y: 22, className: 'pi-lane' }, name),
        h('path', { d: 'M' + (18 + i * 221) + ' 32h178', className: 'pi-rule' }))),
      ...state.edges.filter(e => visible(e.id)).map(e => {
        const a = points.get(e.from), b = points.get(e.to);
        if (!a || !b) return null;
        const same = a.x === b.x, reverse = a.x > b.x;
        const x1 = a.x + (reverse ? 0 : 178), x2 = b.x + (reverse || same ? 178 : 0);
        const y1 = a.y + 25, y2 = b.y + (same ? 36 : 25);
        const bend = same ? x1 + 35 : (x1 + x2) / 2;
        const path = 'M' + x1 + ',' + y1 + ' C' + bend + ',' + y1 + ' ' + bend + ',' + y2 + ' ' + x2 + ',' + y2;
        const hot = selected && related.has(e.id);
        return h('g', { key: e.id, className: 'pi-link' + (hot ? ' pi-hot' : ''), ...accessible(e.id, '关系 ' + e.kind) },
          h('title', null, e.kind), h('path', { d: path, className: 'pi-hit' }),
          h('path', { d: path, className: 'pi-line', markerEnd: 'url(#pi-arrow)' }));
      }),
      ...state.nodes.filter(n => visible(n.id)).map(n => {
        const pos = points.get(n.id);
        const matches = query && [n.label, n.ref, n.kind, n.state].some(v => String(v ?? '').toLowerCase().includes(query.toLowerCase()));
        const short = n.label.length > 0 && /[^\x00-\x7f]/.test(n.label) ? 13 : 23;
        return h('g', { key: n.id, transform: 'translate(' + pos.x + ' ' + pos.y + ')', className: 'pi-node' +
          (selected === n.id ? ' pi-selected' : '') + (matches ? ' pi-match' : query ? ' pi-muted' : ''), ...accessible(n.id, n.kind + ' ' + n.label + ' ' + (n.state ?? '')) },
          h('title', null, [n.label, n.state, n.ref].filter(Boolean).join(' · ')),
          h('rect', { width: 178, height: 53, rx: 7, className: 'pi-card' }),
          h('circle', { cx: 12, cy: 15, r: 3, fill: laneColors[n.lane] }),
          h('text', { x: 21, y: 18, className: 'pi-kind' }, clip(n.kind, 15)),
          n.state && h('text', { x: 167, y: 18, className: 'pi-state', textAnchor: 'end' }, clip(n.state, 15)),
          h('text', { x: 11, y: 38, className: 'pi-label' }, clip(n.label, short)));
      }));
  }

  function Detail({ state, selected, select }) {
    const node = state.nodes.find(n => n.id === selected);
    const edge = state.edges.find(e => e.id === selected);
    const lookup = id => state.nodes.find(n => n.id === id);
    const row = (label, value) => h('div', { key: label, className: 'pi-fact' }, h('dt', null, label),
      h('dd', null, typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value, null, 2)));
    const follow = (id, label) => button(label, () => select(id), { key: id, title: label, className: 'pi-object' });
    return h('aside', { className: 'pi-detail', 'aria-label': '对象检查' },
      h('div', { className: 'pi-bar' }, h('strong', null, node ? node.kind : edge ? '关系' : '对象检查'), button('×', () => select(null), { 'aria-label': '关闭对象检查' })),
      node ? h(React.Fragment, null, h('h3', null, node.label), h('dl', null,
        row('来源', node.source), row('引用', node.ref), node.state && row('状态', node.state),
        ...Object.entries(node.facts).filter(([,v]) => v != null && (!Array.isArray(v) || v.length)).map(([k,v]) => row(k,v))),
        ...state.edges.filter(e => e.from === node.id || e.to === node.id).map(e => {
          const outgoing = e.from === node.id;
          const other = lookup(outgoing ? e.to : e.from);
          return follow(e.id, (outgoing ? '→ ' : '← ') + e.kind + ' · ' + other.label);
        })) : edge ? h(React.Fragment, null, h('h3', null, edge.kind), h('dl', null, row('来源', edge.source), edge.ref && row('记录', edge.ref)),
          follow(edge.from, '从 · ' + lookup(edge.from).label), follow(edge.to, '到 · ' + lookup(edge.to).label))
        : h('p', null, '此时点没有该对象的记录。'));
  }

  function Panel({ read, memory }) {
    const [live, setLive] = useState(null), [pinned, setPinned] = useState(memory.pinned);
    const [selected, setSelected] = useState(memory.selected), [network, setNetwork] = useState('连接中');
    const [tab, setTab] = useState('observed'), [older, setOlder] = useState(null);
    const [query, setQuery] = useState(''), [neighbors, setNeighbors] = useState(false), [scale, setScale] = useState(1);
    const [notice, setNotice] = useState(''), [sources, setSources] = useState(false);
    const nav = useRef(null), pageRequest = useRef(null), epoch = useRef(null);
    useEffect(() => {
      const abort = new AbortController();
      let cursor = {}, timer;
      async function poll() {
        try {
          const data = await read('live', cursor, abort.signal);
          if (abort.signal.aborted) return;
          if (epoch.current && epoch.current !== data.epoch) {
            setOlder(null); nav.current?.abort(); pageRequest.current?.abort();
            setNotice('宿主已重新启动，实时观察从新窗口继续。');
          }
          epoch.current = data.epoch;
          cursor = { epoch: data.epoch, id: data.latest };
          setLive(prev => data.frame ? data : { ...prev, ...data });
          setNetwork('已连接');
        } catch (error) { if (!abort.signal.aborted) setNetwork('连接中断 · ' + error.message); }
        if (!abort.signal.aborted) timer = setTimeout(poll, 1500);
      }
      poll();
      return () => { abort.abort(); clearTimeout(timer); nav.current?.abort(); pageRequest.current?.abort(); };
    }, [read]);
    function select(id) { memory.selected = id; setSelected(id); }
    function pin(value) { memory.pinned = value; setPinned(value); }
    function follow() { nav.current?.abort(); pin(null); setNotice(''); }
    function pause() {
      nav.current?.abort();
      if (live?.frame) pin({ ...live.frame, epoch: live.epoch, type: 'frame' });
    }
    async function inspect(type, item) {
      nav.current?.abort();
      const request = new AbortController(); nav.current = request;
      try {
        const basis = type === 'frame' ? { id: item.id } : { seq: item.seq };
        const data = await read(type, { epoch: live.epoch, ...basis }, request.signal);
        if (!request.signal.aborted) {
          pin({ ...data, type, epoch: live.epoch, at: item.at, title: item.title ?? item.kind, seenAt: live.latest });
          setNotice('');
        }
      } catch (error) { if (!request.signal.aborted) setNotice(error.message); }
    }
    async function pageBack() {
      const entries = older ?? live.events;
      pageRequest.current?.abort();
      const request = new AbortController(); pageRequest.current = request;
      try {
        const rows = await read('earlier', { epoch: live.epoch, before: entries.at(-1).seq }, request.signal);
        if (!request.signal.aborted) setOlder(rows);
      } catch (error) { if (!request.signal.aborted) setNotice(error.message); }
    }
    const frame = pinned ?? live?.frame, state = frame?.state;
    const delta = pinned && live?.epoch === pinned.epoch ? live.latest - (pinned.seenAt ?? pinned.id) : 0;
    const frameList = live?.frames ?? [], events = older ?? live?.events ?? [];
    const chosenIndex = pinned && pinned.epoch !== live?.epoch ? -1 : frameList.findIndex(f => f.id === (pinned?.id ?? live?.latest));
    const sourceFailures = Object.values(state?.coverage ?? {}).filter(v => v.startsWith('读取失败') || ['error','stale','unknown'].includes(v)).length;
    return h('section', { className: 'pi', 'aria-label': 'Palimpsest 工作检查器' },
      h('style', null, css),
      h('header', { className: 'pi-head' }, h('div', { className: 'pi-brand' }, h(Icon, { size: 20 }), h('strong', null, 'Palimpsest'), badge('工作检查器', 'pi-sub')),
        h('div', { className: 'pi-controls' }, badge(live?.projectId ?? '读取项目…', 'pi-project'),
          badge(network !== '已连接' ? '○  ' + network : pinned ? '◷  已固定' : '●  实时', 'pi-status ' + (network !== '已连接' ? 'pi-off' : pinned ? 'pi-past' : 'pi-now')),
          pinned ? button('返回实时' + (delta > 0 ? ' +' + delta : ''), follow, { className: 'pi-return' }) :
            button('暂停跟随', pause, { disabled: !state }))),
      notice && h('div', { className: 'pi-notice', role: 'status' }, notice),
      h('div', { className: 'pi-toolbar' }, h('strong', null, '关系图'),
        state && badge(state.nodes.length + ' 个对象 · ' + state.edges.length + ' 条关系', 'pi-sub'),
        h('span', { className: 'pi-spacer' }),
        h('input', { type: 'search', placeholder: '查找对象', 'aria-label': '查找对象', value: query, onChange: e => setQuery(e.target.value) }),
        button('相邻关系', () => setNeighbors(!neighbors), { disabled: !selected, 'aria-pressed': neighbors && !!selected }),
        button('−', () => setScale(Math.max(0.55, scale - 0.15)), { 'aria-label': '缩小关系图' }),
        button('+', () => setScale(Math.min(1.9, scale + 0.15)), { 'aria-label': '放大关系图' })),
      h('div', { className: 'pi-workspace' },
        h('div', { className: 'pi-surface' }, state ? h(Graph, { state, selected, select, positions: memory.positions, scale, query, neighbors })
          : h('p', { className: 'pi-empty' }, network === '连接中' ? '正在读取当前部署…' : '等待读取项目状态。')),
        selected && state && h(Detail, { state, selected, select })),
      h('div', { className: 'pi-foot' }, button('数据来源' + (sourceFailures ? ' · ' + sourceFailures + ' 项异常' : ''), () => setSources(!sources), { 'aria-expanded': sources }),
        badge(pinned?.type === 'cut' ? 'Work 账本重建 · #' + pinned.seq : frame ? 'Work 序号 #' + frame.seq : '', 'pi-sub'),
        h('span', { className: 'pi-spacer' }), h('time', null, (pinned ? '固定于 ' : '最近读取 ') + fmt(pinned?.at ?? live?.observedAt))),
      sources && state && h('dl', { className: 'pi-sources' }, ...Object.entries(state.coverage).map(([k,v]) => h('div', { key: k }, h('dt', null, k), h('dd', null, v)))),
      h('div', { className: 'pi-time' },
        h('div', { className: 'pi-bar' }, h('strong', null, '时间线'),
          button('现场观察', () => setTab('observed'), { 'aria-pressed': tab === 'observed' }),
          button('Work 事件', () => setTab('ledger'), { 'aria-pressed': tab === 'ledger' }),
          h('span', { className: 'pi-spacer' }), badge(tab === 'observed' ? '按观测变化' : '按提交序号', 'pi-sub')),
        tab === 'observed' ? h(React.Fragment, null,
          h('input', { className: 'pi-range', 'aria-label': '定位现场观察', type: 'range', min: 0, max: Math.max(0, frameList.length - 1),
            value: Math.max(0, chosenIndex), disabled: frameList.length < 2 || pinned?.type === 'cut' || (pinned && chosenIndex < 0),
            onChange: e => inspect('frame', frameList[Number(e.target.value)]) }),
          h('div', { className: 'pi-stops' }, ...frameList.slice().reverse().map(f => button(h(React.Fragment, null, h('time', null, fmt(f.at)), h('span', null, f.title)),
            () => inspect('frame', f), { key: f.id, 'aria-pressed': f.id === (pinned ? pinned.id : live.latest) && (!pinned || pinned.epoch === live.epoch) }))))
          : h(React.Fragment, null, h('div', { className: 'pi-events' }, !events.length && badge('尚无 Work 事件', 'pi-sub'),
            ...events.map(e => button(h(React.Fragment, null, h('span', null, '#' + e.seq), h('time', null, fmt(e.at)), h('b', null, e.kind), h('span', null, e.subject)),
              () => inspect('cut', e), { key: e.seq, 'aria-pressed': pinned?.type === 'cut' && pinned.seq === e.seq }))),
            (older || events.at(-1)?.seq > 1) && h('div', { className: 'pi-pages' },
              older && button('最新事件', () => { pageRequest.current?.abort(); setOlder(null); }),
              events.at(-1)?.seq > 1 && button('较早事件', pageBack)))),
    );
  }

  function apply(ctx) {
    const memory = { pinned: null, selected: null, positions: laneNames.map(() => new Map()) };
    const read = async (method, args, signal) => {
      const url = new URL('api/palimpsest/inspector', document.baseURI);
      url.searchParams.set('view', method);
      for (const [k, v] of Object.entries(args)) url.searchParams.set(k, String(v));
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
      if (!response.ok) throw new Error('DSH HTTP ' + response.status);
      const result = await response.json();
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'palimpsest', inject: () => ({ read, memory }) }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'palimpsest', order: 35, label: () => 'Palimpsest' }, Icon));
  }
  const css = `
  .pi{--pi-bg:var(--color-background,#fafbf9);--pi-card:var(--color-surface,#fff);--pi-text:var(--color-foreground,#242c2c);--pi-dim:#55656a;--pi-rule:#d8dfdd;--pi-edge:#8a9ba0;--pi-accent:#246b65;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--pi-bg);color:var(--pi-text);font:13px/1.4 system-ui,sans-serif}
  .pi *{box-sizing:border-box}.pi button,.pi input{font:inherit;color:inherit}.pi button{cursor:pointer;border:1px solid var(--pi-rule);background:var(--pi-card);border-radius:5px;padding:4px 9px;line-height:1.35}.pi button:disabled{opacity:.45;cursor:default}.pi button[aria-pressed=true],.pi button:hover:not(:disabled){border-color:var(--pi-accent);color:var(--pi-accent)}.pi button:focus-visible,.pi input:focus-visible{outline:2px solid var(--pi-accent);outline-offset:2px}
  .pi-head,.pi-toolbar,.pi-foot,.pi-bar,.pi-controls,.pi-brand,.pi-pages{display:flex;align-items:center;gap:9px}.pi-head,.pi-toolbar,.pi-foot,.pi-time{padding:9px 15px}.pi-head{min-height:49px;justify-content:space-between;border-bottom:1px solid var(--pi-rule);gap:8px;flex-wrap:wrap}.pi-brand strong{font-size:16px;letter-spacing:-.025em}.pi-brand svg{color:var(--pi-accent)}.pi-sub,.pi time,.pi-project{font-size:12px;color:var(--pi-dim)}.pi-project{max-width:23ch;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.pi-status{font-size:12px;overflow-wrap:anywhere}.pi-now,.pi-return{color:var(--pi-accent)}.pi-past,.pi-notice,.pi-off{color:#996120}.pi-toolbar{border-bottom:1px solid var(--pi-rule);flex-wrap:wrap;gap:6px}.pi-toolbar input{width:9em;background:var(--pi-card);border:1px solid var(--pi-rule);border-radius:4px;padding:4px 7px}.pi-spacer{flex:1}.pi-workspace{display:flex;min-height:100px;flex:1;position:relative;overflow:hidden}.pi-surface{flex:1;min-width:0;overflow:auto;background-image:radial-gradient(var(--pi-rule) .7px,transparent .8px);background-size:18px 18px}.pi-graph{display:block;overflow:visible}.pi-lane,.pi-kind,.pi-state{font-size:10px;fill:var(--pi-dim)}.pi-lane{font-size:12px;letter-spacing:.08em}.pi-rule{stroke:var(--pi-rule)}.pi-node,.pi-link{cursor:pointer;outline:none}.pi-card{fill:var(--pi-card);stroke:var(--pi-rule)}.pi-node:hover .pi-card,.pi-node:focus .pi-card,.pi-selected .pi-card,.pi-match .pi-card{stroke:var(--pi-accent);stroke-width:2}.pi-muted{opacity:.38}.pi-label{font-size:13px;font-weight:550;fill:var(--pi-text)}.pi-hit,.pi-line{fill:none;stroke:transparent;stroke-width:14}.pi-line{stroke:var(--pi-edge);stroke-width:1.35;pointer-events:none}.pi-hot .pi-line,.pi-link:hover .pi-line,.pi-link:focus .pi-line{stroke:var(--pi-accent);stroke-width:2.8}
  .pi-detail{width:clamp(190px,24%,325px);overflow:auto;border-left:1px solid var(--pi-rule);background:var(--pi-card);padding:10px;overflow-wrap:anywhere}.pi-detail .pi-bar{justify-content:space-between}.pi-detail h3{font-size:15px;margin:12px 0}.pi-fact{margin:7px 0}.pi dt{font-size:11px;color:var(--pi-dim)}.pi dd{margin:2px 0;white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace}.pi-object{display:block;text-align:left;width:100%;margin:5px 0;overflow-wrap:anywhere}.pi-foot{padding-block:5px;border-block:1px solid var(--pi-rule);flex-wrap:wrap}.pi-foot button{font-size:11px}.pi-sources{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:6px 15px;max-height:105px;overflow:auto}.pi-sources dd{font-size:11px}.pi-time{background:var(--pi-card);min-height:99px}.pi-bar strong{margin-right:6px}.pi-bar button{font-size:12px}.pi-stops,.pi-events{display:flex;gap:5px;overflow:auto;padding:3px 1px}.pi-stops button{display:grid;text-align:left;white-space:nowrap;font-size:11px;max-width:225px;overflow:hidden;text-overflow:ellipsis}.pi-range{display:block;width:100%;height:16px;margin:3px 0;accent-color:var(--pi-accent)}.pi-events{flex-direction:column;max-height:125px;margin-top:4px}.pi-events button{display:grid;grid-template-columns:4ch 8ch minmax(95px,1fr) 1fr;gap:7px;text-align:left;overflow-wrap:anywhere;font:11px/1.3 ui-monospace,monospace}.pi-events time{font-size:11px}.pi-pages{margin-top:3px}.pi-empty,.pi-notice{margin:0;padding:12px 15px}.pi-notice{font-size:12px}
  @media(prefers-color-scheme:dark){.pi{--pi-bg:#1c2224;--pi-card:#242b2e;--pi-text:#e0e6e5;--pi-dim:#a6b4b7;--pi-rule:#404b50;--pi-edge:#76898d;--pi-accent:#8acac0}}
  @media(max-width:760px){.pi-head,.pi-toolbar,.pi-time{padding:6px 9px}.pi-project,.pi-brand .pi-sub{display:none}.pi-detail{position:absolute;right:0;height:100%;width:min(245px,70%);box-shadow:-3px 0 12px #0001}.pi-time .pi-sub{display:none}}
  `;
  return { inject: ['slots', 'connection'], apply };
} });
