// Native DSH browser module. React comes from the renderer that owns the slots.
window.__ModuleLoader__.load({ id: 'palimpsest-dsh-host', factory(require) {
  const React = require('react');
  const { createElement: h, useState, useEffect, useLayoutEffect, useMemo, useRef } = React;
  const lanes = ['项目与世界', '主体与角色', '工作与执行', '成果与证据'];
  const fmt = at => at == null ? '—' : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
  const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
  const paths = {
    layers: 'M12 3 21 8 12 13 3 8ZM3 12l9 5 9-5M3 16l9 5 9-5',
    graph: 'M6 6 17 10M6 18l11-6M5 8v8M7.5 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM21 11a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM7.5 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
    person: 'M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM5 20v-1.5a7 7 0 0 1 14 0V20',
    work: 'M5 5h14v14H5zM8.5 10l2.2 2.2 4.8-4.8',
    terminal: 'm5 7 4.5 4.5L5 16m7 1h7',
    commit: 'M2 12h5m10 0h5m-5 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    file: 'M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 16h4',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3.5 2',
    search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.5 4.5L21 21',
    focus: 'M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    pause: 'M8 5v14m8-14v14', live: 'm6 5 12 7-12 7z', pin: 'm15 3 6 6-4 1-4 6-2-2-6 6m3-9-2-2 6-4z',
    minus: 'M5 12h14', plus: 'M5 12h14m-7-7v14', close: 'm6 6 12 12M18 6 6 18',
    timeline: 'M3 12h4m4 0h10M9 8v8m6-12v5m3 6v5',
    source: 'M4 8V6c0-4 16-4 16 0v12c0 4-16 4-16 0V8m0-2c0 4 16 4 16 0M4 12c0 4 16 4 16 0',
    right: 'm9 6 6 6-6 6', enter: 'M19 5v8H5m5-5-5 5 5 5', branch: 'M6 4v12m0-3c7 0 12-2 12-7M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12-14a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  };
  function Glyph({ name, size = 16 }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'pi-glyph' },
    h('path', { d: paths[name] }));
  }
  const icon = (name, size) => h(Glyph, { name, size });
  function Icon({ size = 18 }) { return icon('layers', size); }

  const kinds = { peer: '协作方', external_peer: '外部协作方', scope: '运行域', role: '角色', member: '成员',
    workspace: '工作区', activation: '激活记录', candidate: '候选结果', claim: '主张' };
  const states = { ACTIVE: '进行中', RUNNING: '执行中', BLOCKED: '被阻塞', COMPLETED: '已完成', VERIFYING: '待验证',
    READY: '就绪', PENDING: '待处理', FAILED: '失败', CANDIDATE: '候选', local: '本地', external: '外部' };
  const events = { PROJECT_CREATED: '建立项目', PROJECT_REVISED: '修订项目', ROLE_TABLE_DEFINED: '登记角色', STAGE_GRAPH_DEFINED: '登记阶段依赖',
    TASK_CREATED: '登记任务', TASK_READY: '任务就绪',
    ATTEMPT_CREATED: '建立执行尝试', ATTEMPT_STARTED: '认领执行', ATTEMPT_COMPLETED: '完成执行', ATTEMPT_FAILED: '执行失败',
    EVIDENCE_ADDED: '记录证据', PROMOTION_PREPARED: '准备晋升', PROMOTION_COMMITTED: '完成晋升' };
  const kindName = n => kinds[n.kind] ?? n.kind;
  const nodeGlyph = n => n.kind === '项目版本' ? 'commit' : n.kind === '待处理事项' ? 'clock' :
    ['执行尝试', 'Worker 作业', '工具调用', 'DSH 会话'].includes(n.kind) ? 'terminal' : ['layers', 'person', 'work', 'file'][n.lane];
  const stateName = n => states[n.state] ?? n.state;
  const tone = state => ['FAILED', 'ERROR', '工具错误'].includes(state) ? 'bad' :
    ['BLOCKED', 'WAIT_FOR_OPERATOR', 'VERIFYING'].includes(state) ? 'wait' :
    ['RUNNING', 'ACTIVE', 'COMPLETED', 'FINISHED'].includes(state) ? 'ok' : '';
  const titleFor = n => n.kind === '执行尝试' && n.label === n.ref ? '执行尝试' :
    n.label === 'Work awaiting a legal next step' ? '等待下一步工作' : n.label;
  const refFor = n => n.kind === '执行尝试' ? n.ref.replace(/^attempt-/, '').slice(0, 8) : kindName(n);
  const matchNode = (n, term) => [n.label, n.ref, kindName(n), n.kind, n.state, stateName(n), titleFor(n)]
    .some(v => String(v ?? '').toLowerCase().includes(term));

  function layoutGraph(state, positions, width, availableHeight, stacked) {
    const current = new Set(state.nodes.map(n => n.id));
    for (const slots of positions) for (const id of slots.keys()) if (!current.has(id)) slots.delete(id);
    const used = positions.map(slots => new Set(slots.values()));
    const next = lanes.map(() => 0);
    const points = new Map();
    const columns = stacked ? 2 : lanes.length;
    const step = width / columns;
    // Stable positions grow above and below the first occupant of each lane.
    for (const n of state.nodes) {
      const slots = positions[n.lane];
      if (!slots.has(n.id)) {
        while (used[n.lane].has(next[n.lane])) next[n.lane]++;
        slots.set(n.id, next[n.lane]++);
      }
      const s = slots.get(n.id);
      const row = s % 2 ? (s + 1) / 2 : -s / 2;
      const y = stacked ? row * 100 + [0, -26, 0, 16][n.lane] : row * 118 + [0, -50, -14, 20][n.lane];
      points.set(n.id, { x: step * (n.lane % columns + 0.5), y, band: Math.floor(n.lane / columns) });
    }
    if (stacked) {
      let top = 40;
      for (const band of [0, 1]) {
        const group = [...points.values()].filter(p => p.band === band);
        if (!group.length) continue;
        let low = Infinity, high = -Infinity;
        for (const p of group) { low = Math.min(low, p.y); high = Math.max(high, p.y); }
        for (const p of group) p.y += top - low;
        top += high - low + 104;
      }
      return { points, height: Math.max(availableHeight, top - 24), step };
    }
    let min = 0, max = 0;
    for (const p of points.values()) { min = Math.min(min, p.y); max = Math.max(max, p.y); }
    const origin = Math.max(54 - min, (availableHeight - 48) * 0.44);
    for (const p of points.values()) p.y += origin;
    return { points, height: Math.max(availableHeight, origin + max + 86), step };
  }

  // Score a handful of arcs only where a long edge crosses an occupied lane.
  // The horizontal Bézier coordinates are linear, so the height at that lane is known.
  function clearArc(a, b, columns, height) {
    const span = b.x - a.x;
    let best = 0, least = Infinity;
    for (const lift of [-62, 62, -115, 115, -175, 175, 0]) {
      let collisions = 0;
      for (const [x, ys] of columns) {
        const t = (x - a.x) / span;
        if (t <= 0 || t >= 1) continue;
        const y = a.y + (b.y-a.y) * t*t*(3-2*t) + 3*t*(1-t)*lift;
        if (y < 14 || y > height-14) collisions += 3;
        let lo = 0, hi = ys.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (ys[mid] < y-63) lo = mid + 1; else hi = mid;
        }
        if (lo < ys.length && ys[lo] < y+25) collisions++;
      }
      if (!collisions) return lift;
      if (collisions < least) { least = collisions; best = lift; }
    }
    return best;
  }
  function curve(a, b, r1, r2, step, width, lift, offset) {
    let c1, c2;
    if (a.x === b.x) {
      let side = a.x > width - step ? -1 : 1;
      if (Math.abs(b.y - a.y) > 180 && a.x > step && a.x < width-step) side *= -1;
      const bend = side * (54 + Math.min(48, Math.abs(b.y - a.y) * 0.1) + offset);
      c1 = { x: a.x + bend, y: a.y - 32 };
      c2 = { x: b.x + bend, y: b.y + (a.y === b.y ? 32 : -20) };
    } else {
      const dx = b.x - a.x;
      c1 = { x: a.x + dx / 3, y: a.y + lift + offset };
      c2 = { x: b.x - dx / 3, y: b.y + lift + offset };
    }
    const rim = (p, c, radius) => {
      const dx = c.x - p.x, dy = c.y - p.y, length = Math.hypot(dx, dy);
      return { x: p.x + radius * dx / length, y: p.y + radius * dy / length };
    };
    const start = rim(a, c1, r1), end = rim(b, c2, r2);
    const at = t => {
      const s = 1-t;
      const coordinate = k => s*s*s*start[k] + 3*s*s*t*c1[k] + 3*s*t*t*c2[k] + t*t*t*end[k];
      return { x: coordinate('x'), y: coordinate('y')-6 };
    };
    return { path: 'M' + start.x + ',' + start.y + ' C' + c1.x + ',' + c1.y + ' ' + c2.x + ',' + c2.y + ' ' + end.x + ',' + end.y,
      captions: [0.5, 0.35, 0.65].map(at) };
  }

  function Graph({ state, selected, select, positions, scale, query, neighbors, viewport }) {
    const [hover, setHover] = useState(null);
    const stacked = viewport.width < 565;
    const width = Math.max(stacked ? 292 : 565, viewport.width);
    const { points, height, step } = useMemo(() => layoutGraph(state, positions, width, viewport.height, stacked),
      [state, positions, width, viewport.height, stacked]);
    const nodes = useMemo(() => new Map(state.nodes.map(n => [n.id, n])), [state]);
    const routes = useMemo(() => {
      const pairs = new Map();
      const columns = new Map();
      for (const p of points.values()) {
        if (!columns.has(p.x)) columns.set(p.x, []);
        columns.get(p.x).push(p.y);
      }
      for (const ys of columns.values()) ys.sort((a, b) => a-b);
      for (const e of state.edges) {
        const pair = JSON.stringify([e.from, e.to].sort());
        if (!pairs.has(pair)) pairs.set(pair, []);
        pairs.get(pair).push(e);
      }
      const result = new Map();
      for (const edges of pairs.values()) edges.forEach((e, i) => {
        const radius = id => nodes.get(id).kind === '项目' ? 22 : 17;
        const a = points.get(e.from), b = points.get(e.to);
        const lift = Math.abs(b.x-a.x) > 1.5*step ? clearArc(a, b, columns, height) : 0;
        result.set(e.id, curve(a, b, radius(e.from) + 2, radius(e.to) + 3, step, width, lift,
          (i - (edges.length - 1) / 2) * 20));
      });
      return result;
    }, [state, points, step, width, height, nodes]);
    const known = id => nodes.has(id) || routes.has(id);
    const active = known(selected) ? selected : known(hover) ? hover : null;
    const adjacent = id => {
      const set = new Set([id]);
      for (const e of state.edges) if (e.id === id || e.from === id || e.to === id) {
        set.add(e.id); set.add(e.from); set.add(e.to);
      }
      return set;
    };
    const lit = active && adjacent(active);
    const visible = neighbors && known(selected) ? adjacent(selected) : null;
    const action = (id, label) => ({
      role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selected === id,
      onPointerEnter: e => { if (e.pointerType !== 'touch') setHover(id); }, onPointerLeave: () => setHover(null),
      onFocus: () => setHover(id), onBlur: () => setHover(null), onClick: () => select(id),
      onKeyDown: e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); select(id); } },
    });
    const search = query.trim().toLowerCase();
    const labelWidth = Math.min(218, step - 12);
    const captions = [];
    const occupied = useMemo(() => {
      const textWidth = (value, size) => Array.from(value).reduce((sum, ch) => sum + size * (ch.charCodeAt(0) > 255 ? 1 : .62), 0);
      return state.nodes.map(n => {
        const p = points.get(n.id), titleWidth = textWidth(titleFor(n), 14);
        const metaWidth = textWidth([refFor(n), stateName(n)].filter(Boolean).join(' · '), 11);
        return { ...p, half: Math.min(labelWidth, Math.max(titleWidth, metaWidth))/2 + 2,
          bottom: (n.kind === '项目' ? 21 : 16) + 7 + (titleWidth > labelWidth ? 38 : 19) + 18 };
      });
    }, [state, points, labelWidth]);
    const edgesToLabel = state.edges.filter(e => (!visible || visible.has(e.id)) &&
      (e.id === active || (lit ? lit.has(e.id) : !search && state.edges.length <= (stacked ? 4 : 10))));
    // Give short action verbs room between objects. A crowded label stays in the inspector.
    for (const e of edgesToLabel.slice(0, 12)) {
      const half = Math.min(88, Math.max(20, Array.from(e.kind).length * 6 + 3));
      const choices = routes.get(e.id).captions;
      const spot = choices.find(p => p.x > half && p.x < width-half && p.y > 14 &&
        !occupied.some(n => (Math.abs(p.x-n.x) < half+22 && p.y > n.y-25 && p.y < n.y+29) ||
          (Math.abs(p.x-n.x) < half+n.half && p.y > n.y+18 && p.y < n.y+n.bottom+10)) &&
        !captions.some(c => Math.abs(p.x-c.x) < half+c.half+5 && Math.abs(p.y-c.y) < 16));
      if (spot || e.id === active) captions.push({ edge: e, ...(spot ?? choices[0]), half });
    }
    return h('svg', { className: 'pi-graph', width: width * scale, height: height * scale, viewBox: '0 0 ' + width + ' ' + height,
      'aria-label': '当前时点的工作关系图' },
      h('defs', null, ...['edge', 'accent'].map(color => h('marker', { key: color, id: 'pi-arrow-' + color,
        viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' },
      h('path', { d: 'M1,1 L7,4 L1,7', fill: 'none', stroke: 'var(--pi-' + color + ')', strokeWidth: 1.4 })))),
      ...state.edges.filter(e => !visible || visible.has(e.id)).map(e => {
        const hot = lit?.has(e.id), line = routes.get(e.id);
        return h('g', { key: e.id, className: 'pi-link' + (hot ? ' pi-hot' : lit ? ' pi-distant' : ''), ...action(e.id, '关系 ' + e.kind) },
          h('title', null, e.kind), h('path', { d: line.path, className: 'pi-hit' }),
          h('path', { d: line.path, className: 'pi-line', markerEnd: 'url(#pi-arrow-' + (hot ? 'accent' : 'edge') + ')' }));
      }),
      ...state.nodes.filter(n => !visible || visible.has(n.id)).map(n => {
        const p = points.get(n.id), root = n.kind === '项目', r = root ? 21 : 16, glyph = root ? 23 : 17;
        const matched = search && matchNode(n, search);
        const faint = n.id !== selected && (search ? !matched : lit && !lit.has(n.id));
        const meta = stateName(n);
        return h('g', { key: n.id, transform: 'translate(' + p.x + ' ' + p.y + ')', 'data-lane': n.lane,
          className: 'pi-node' + (active === n.id ? ' pi-near' : '') + (selected === n.id ? ' pi-selected' : '') +
            (matched ? ' pi-match' : '') + (faint ? ' pi-distant' : ''), ...action(n.id, n.kind + ' ' + n.label + ' ' + (n.state ?? '')) },
          h('title', null, [n.label, n.state, n.ref].filter(Boolean).join(' · ')),
          h('circle', { r: r+7, fill: 'transparent' }),
          h('rect', { x: -labelWidth/2, y: r+3, width: labelWidth, height: 50, fill: 'transparent' }),
          h('circle', { r: r+5, className: 'pi-halo' }), h('circle', { r, className: 'pi-disc' }),
          h('g', { transform: 'translate(' + (-glyph/2) + ' ' + (-glyph/2) + ')' }, icon(nodeGlyph(n), glyph)),
          h('foreignObject', { x: -labelWidth/2, y: r+7, width: labelWidth, height: 61, 'aria-hidden': true },
            h('div', { className: 'pi-caption' }, h('span', { className: 'pi-node-label' + (n.kind === '项目版本' ? ' pi-mono' : '') }, titleFor(n)),
              h('span', { className: 'pi-meta' }, refFor(n), meta && h(React.Fragment, null, ' · ',
                h('span', { className: 'pi-state ' + tone(n.state) }, meta))))));
      }),
      ...captions.map(c => h('text', { key: 'caption:' + c.edge.id, className: 'pi-edge-caption' + (lit ? ' pi-active-caption' : ''),
        x: c.x, y: c.y, textAnchor: 'middle', 'aria-hidden': true }, c.edge.kind)));
  }

  function Detail({ state, selected, select }) {
    const node = state.nodes.find(n => n.id === selected);
    const edge = state.edges.find(e => e.id === selected);
    const lookup = id => state.nodes.find(n => n.id === id);
    function value(v) {
      if (Array.isArray(v)) return h('ul', { className: 'pi-values' }, ...v.map((item, i) =>
        h('li', { key: i }, item && typeof item === 'object' && 'label' in item && 'at' in item
          ? h(React.Fragment, null, h('time', { title: item.at }, fmt(item.at)), item.label)
          : typeof item === 'string' ? item : JSON.stringify(item))));
      return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    }
    const row = (label, v, mono = false) => h('div', { key: label, className: 'pi-fact' }, h('dt', null, label),
      h('dd', { className: mono ? 'pi-mono' : undefined }, value(v)));
    const follow = (id, kind, label) => button(h(React.Fragment, null, h('span', { className: 'pi-rel-kind' }, kind),
      h('span', { className: 'pi-rel-to' }, label), icon('right', 12)), () => select(id), { key: id, title: label, className: 'pi-object' });
    const attached = node ? state.edges.filter(e => e.from === node.id || e.to === node.id) : [];
    return h('aside', { className: 'pi-detail', 'aria-label': '对象检查' },
      h('div', { className: 'pi-detail-head' }, icon('focus', 15), h('strong', null, '对象检查'),
        button(icon('close', 15), () => select(null), { className: 'pi-icon-btn', 'aria-label': '关闭对象检查' })),
      node ? h(React.Fragment, null,
        h('div', { className: 'pi-detail-title', 'data-lane': node.lane },
          h('span', { className: 'pi-detail-symbol' }, icon(nodeGlyph(node), 17)), h('div', null,
            h('small', null, titleFor(node) === kindName(node) ? refFor(node) : kindName(node)), h('h3', null, titleFor(node)))),
        h('dl', { className: 'pi-facts' }, row('来源', node.source), row('引用', node.ref, true), node.state && row('状态', node.state, true),
          ...Object.entries(node.facts).filter(([,v]) => v != null && (!Array.isArray(v) || v.length)).map(([k,v]) => row(k,v))),
        attached.length > 0 && h('div', { className: 'pi-relations' }, h('h4', null, '相邻关系', h('span', null, attached.length)),
          ...attached.map(e => {
            const outgoing = e.from === node.id;
            return follow(e.id, (outgoing ? '→ ' : '← ') + e.kind, titleFor(lookup(outgoing ? e.to : e.from)));
          }))) : edge ? h(React.Fragment, null,
        h('div', { className: 'pi-detail-title' }, h('span', { className: 'pi-detail-symbol' }, icon('branch')), h('div', null, h('small', null, '关系'), h('h3', null, edge.kind))),
        h('dl', { className: 'pi-facts' }, row('来源', edge.source), edge.ref && row('引用', edge.ref, true)),
        h('div', { className: 'pi-relations' }, follow(edge.from, '起点', titleFor(lookup(edge.from))), follow(edge.to, '终点', titleFor(lookup(edge.to)))))
        : h('p', { className: 'pi-empty' }, '此时点没有该对象的记录。'));
  }

  function Canvas({ state, selected, select, positions, scale, setScale, search, neighbors, network }) {
    const surface = useRef(null);
    const drag = useRef(null);
    const [viewport, setViewport] = useState({ width: 800, height: 360 });
    useLayoutEffect(() => {
      const el = surface.current;
      const resize = () => {
        const width = el.clientWidth, height = el.clientHeight;
        setViewport(old => old.width === width && old.height === height ? old : { width, height });
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => {
      const el = surface.current;
      const target = el.querySelector('.pi-node[aria-pressed="true"]');
      if (!target) return;
      const mark = target.getBoundingClientRect(), box = el.getBoundingClientRect();
      const dx = mark.left < box.left ? mark.left-box.left-8 : Math.max(0, mark.right-box.right+8);
      const dy = mark.top < box.top ? mark.top-box.top-8 : Math.max(0, mark.bottom-box.bottom+8);
      if (dx || dy) el.scrollBy(dx, dy);
    }, [selected, viewport.width, viewport.height, scale]);
    function startDrag(e) {
      if (e.button !== 0 || e.pointerType !== 'mouse' || e.target.closest('[role=button]')) return;
      const el = e.currentTarget;
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = '';
    }
    function endDrag(e) { drag.current = null; delete e.currentTarget.dataset.dragging; }
    const zoom = by => setScale(current => Math.max(0.55, Math.min(1.9, Math.round((current + by) * 100) / 100)));
    return h('div', { className: 'pi-canvas' },
      h('div', { className: 'pi-legend', 'aria-label': '对象类型' }, ...lanes.map((label, i) =>
        h('span', { key: label, 'data-lane': i }, h('i', { 'aria-hidden': true }), label))),
      h('div', { ref: surface, className: 'pi-surface', tabIndex: 0, 'aria-label': '图谱画布',
        onPointerDown: startDrag, onLostPointerCapture: endDrag, onPointerUp: endDrag, onPointerCancel: endDrag,
        onPointerMove: e => {
          if (drag.current) e.currentTarget.scrollTo(drag.current.left + drag.current.x - e.clientX, drag.current.top + drag.current.y - e.clientY);
        } }, state ? h(Graph, { state, selected, select, positions, scale, query: search, neighbors, viewport })
          : h('p', { className: 'pi-empty' }, network === '连接中' ? '正在读取当前部署…' : '等待读取项目状态。')),
      h('div', { className: 'pi-zoom', role: 'group', 'aria-label': '画布缩放' },
        button(icon('minus', 13), () => zoom(-0.15), { className: 'pi-icon-btn', disabled: scale <= 0.55, 'aria-label': '缩小关系图', title: '缩小关系图' }),
        button(Math.round(scale * 100) + '%', () => setScale(1), { className: 'pi-reset pi-mono', 'aria-label': '重置缩放', title: '重置缩放' }),
        button(icon('plus', 13), () => zoom(0.15), { className: 'pi-icon-btn', disabled: scale >= 1.9, 'aria-label': '放大关系图', title: '放大关系图' })));
  }

  function Timeline({ tab, setTab, frames, entries, chosen, pinned, inspect, older, showLatest, pageBack }) {
    const strip = useRef(null);
    const ledger = useRef(null);
    const latestSeq = entries[0]?.seq;
    useLayoutEffect(() => {
      if (tab === 'ledger' && !pinned && !older && ledger.current) ledger.current.scrollTop = 0;
    }, [tab, pinned, older, latestSeq]);
    useLayoutEffect(() => {
      const row = strip.current;
      if (!row || chosen < 0) return;
      const stop = row.children[chosen];
      if (!stop) return;
      const left = stop.offsetLeft, right = left + stop.offsetWidth;
      if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
      else if (left < row.scrollLeft) row.scrollLeft = left;
    }, [tab, chosen]);
    return h('section', { className: 'pi-time', 'aria-label': '时间线' },
      h('div', { className: 'pi-time-head' }, h('div', { className: 'pi-time-title' }, icon('timeline', 16), h('strong', null, '时间线')),
        h('div', { className: 'pi-tabs', role: 'group', 'aria-label': '时间线来源' },
          button('现场观察', () => setTab('observed'), { 'aria-pressed': tab === 'observed' }),
          button('Work 事件', () => setTab('ledger'), { 'aria-pressed': tab === 'ledger' })),
        tab === 'observed' && frames.length > 1 && h('input', { className: 'pi-range', 'aria-label': '定位现场观察', type: 'range',
          min: 0, max: frames.length - 1, value: Math.max(0, chosen), disabled: chosen < 0 || pinned?.type === 'cut',
          'aria-valuetext': chosen >= 0 ? fmt(frames[chosen].at) : undefined,
          onChange: e => inspect('frame', frames[Number(e.target.value)]) })),
      tab === 'observed' ? h('div', { className: 'pi-stops', ref: strip },
        ...frames.map((f, i) => button(h(React.Fragment, null, h('span', { className: 'pi-stop-rail', 'aria-hidden': true }, h('i')),
          h('time', null, fmt(f.at)), h('span', { className: 'pi-stop-label' }, events[f.title] ?? f.title)),
        () => inspect('frame', f), { key: f.id, title: f.title, 'aria-pressed': i === chosen })))
        : h(React.Fragment, null, h('div', { className: 'pi-events', ref: ledger }, !entries.length && h('p', { className: 'pi-empty' }, '尚无 Work 事件'),
          ...entries.map(e => button(h(React.Fragment, null, h('span', { className: 'pi-serial' }, '#' + e.seq), h('time', null, fmt(e.at)),
            h('span', { className: 'pi-event-kind' }, events[e.kind] ?? e.kind), h('code', null, events[e.kind] ? e.kind : ''), h('span', { className: 'pi-event-ref' }, e.subject)),
            () => inspect('cut', e), { key: e.seq, title: e.kind + ' · ' + e.subject, 'aria-label': '#' + e.seq + ' ' + fmt(e.at) + ' ' + e.kind + ' ' + e.subject,
              'aria-pressed': pinned?.type === 'cut' && pinned.seq === e.seq }))),
          (older || entries.at(-1)?.seq > 1) && h('div', { className: 'pi-pages' },
            older && button('最新事件', showLatest), entries.at(-1)?.seq > 1 && button('较早事件', pageBack))));
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
    function follow() { nav.current?.abort(); pageRequest.current?.abort(); setOlder(null); pin(null); setNotice(''); }
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
    const searchBox = useRef(null);
    const term = query.trim().toLowerCase();
    const hits = useMemo(() => term && state ? state.nodes.filter(n => matchNode(n, term)) : [], [state, term]);
    const liveMode = network !== '已连接' ? 'offline' : pinned ? 'pinned' : 'live';
    return h('section', { className: 'pi', lang: 'zh-CN', 'aria-label': 'Palimpsest 工作检查器',
      onKeyDown: e => {
        if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea,[contenteditable=true]')) {
          e.preventDefault(); e.stopPropagation(); searchBox.current?.focus();
        }
      } },
      h('style', null, css),
      h('header', { className: 'pi-head' },
        h('div', { className: 'pi-brand' }, h(Icon, { size: 20 }), h('strong', null, 'Palimpsest'),
          h('span', { className: 'pi-slash', 'aria-hidden': true }, '/'), h('span', { className: 'pi-project', title: live?.projectId }, live?.projectId ?? '读取项目…')),
        h('div', { className: 'pi-controls' }, h('span', { className: 'pi-status ' + liveMode, role: 'status' },
          h('i', { 'aria-hidden': true }), network !== '已连接' ? network : pinned ? '已固定' : '实时'),
          pinned ? button(h(React.Fragment, null, icon('live', 13), '返回实时' + (delta > 0 ? ' +' + delta : '')), follow, { className: 'pi-follow' }) :
            button(h(React.Fragment, null, icon('pause', 13), '暂停跟随'), pause, { className: 'pi-follow', disabled: !state }))),
      notice && h('div', { className: 'pi-notice', role: 'status' }, notice),
      h('div', { className: 'pi-toolbar' },
        h('div', { className: 'pi-view-title' }, h('h2', null, '关系图'),
          state && h('span', { className: 'pi-count' }, term ? (hits.length ? '匹配 ' + hits.length + ' 个对象' : '没有匹配对象') :
            h(React.Fragment, null, state.nodes.length + ' 个对象', h('i', { 'aria-hidden': true }, '·'), state.edges.length + ' 条关系'))),
        h('div', { className: 'pi-tools' }, h('label', { className: 'pi-search' }, icon('search', 15),
          h('input', { type: 'search', placeholder: '查找对象', 'aria-label': '查找对象', ref: searchBox, value: query,
            onChange: e => setQuery(e.target.value), onKeyDown: e => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(''); }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && hits.length) {
                e.preventDefault();
                const next = (hits.findIndex(n => n.id === selected) + 1) % hits.length;
                select(hits[next].id);
              }
            } }),
          h('kbd', { 'aria-hidden': true }, '/')),
          button(h(React.Fragment, null, icon('focus', 15), h('span', null, '相邻关系')), () => setNeighbors(!neighbors),
            { className: 'pi-neighbors', disabled: !selected, title: '仅查看所选对象的一跳关系', 'aria-label': '相邻关系', 'aria-pressed': neighbors && !!selected }))),
      h('div', { className: 'pi-workspace' },
        h(Canvas, { state, selected, select, positions: memory.positions, scale, setScale, search: query, neighbors, network }),
        selected && state && h(Detail, { state, selected, select })),
      h(Timeline, { tab, setTab, frames: frameList, entries: events, chosen: pinned?.type === 'cut' ? -1 : chosenIndex,
        pinned, inspect, older, pageBack, showLatest: () => { pageRequest.current?.abort(); setOlder(null); } }),
      sources && state && h('dl', { className: 'pi-sources' }, ...Object.entries(state.coverage).map(([k,v]) =>
        h('div', { key: k }, h('dt', null, k), h('dd', null, v)))),
      h('footer', { className: 'pi-foot' },
        button(h(React.Fragment, null, icon('source', 13), '数据来源' + (sourceFailures ? ' · ' + sourceFailures + ' 项异常' : '')),
          () => setSources(!sources), { 'aria-expanded': sources, className: sourceFailures ? 'pi-source-error' : undefined }),
        frame && h('span', { className: 'pi-ledger' }, pinned?.type === 'cut' ? 'Work 账本重建 · #' + pinned.seq : 'Work 序号 #' + frame.seq),
        h('span', { className: 'pi-spacer' }), h('time', null, (pinned ? '固定于 ' : '最近读取 ') + fmt(pinned?.at ?? live?.observedAt))));
  }

  function apply(ctx) {
    const memory = { pinned: null, selected: null, positions: lanes.map(() => new Map()) };
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
  .pi {
    --pi-paper:light-dark(#faf9fb,#19191c); --pi-chrome:light-dark(#fff,#202023); --pi-bar:light-dark(#f5f4f7,#1d1d20);
    --pi-ink:light-dark(#25242b,#eeedf1); --pi-mid:light-dark(#504d59,#c5c1ce); --pi-muted:light-dark(#696473,#a9a4b2);
    --pi-rule:light-dark(#dfdce4,#36343b); --pi-soft:light-dark(#eeeaf1,#302e35); --pi-dot:light-dark(#dcd9e1,#353239);
    --pi-edge:light-dark(#9c95a6,#817989); --pi-accent:light-dark(#6d4a99,#c9b2ed);
    --pi-tint:light-dark(#f0eaf8,#352d40); --pi-ok:light-dark(#216b50,#91cfb1); --pi-wait:light-dark(#845516,#e4bb84);
    --pi-bad:light-dark(#a33647,#f29daa); --pi-mono:var(--ds-font-family-code, "Cascadia Code", Consolas, monospace);
    container:pi-inspector / inline-size; color-scheme:inherit; height:100%; min-height:0; min-width:0; overflow:hidden;
    display:flex; flex-direction:column; color:var(--pi-ink); background:var(--pi-chrome);
    font:13px/1.45 var(--dsw-font-family, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  }
  body[data-ds-dark-theme] .pi {color-scheme:dark}
  @media(prefers-color-scheme:dark) {html:not([data-ds-theme-source]) .pi {color-scheme:dark}}
  .pi [data-lane="0"] {--pi-lane:light-dark(#71578a,#c5b3dc)}
  .pi [data-lane="1"] {--pi-lane:light-dark(#846044,#dbb697)}
  .pi [data-lane="2"] {--pi-lane:light-dark(#366873,#a2cdd2)}
  .pi [data-lane="3"] {--pi-lane:light-dark(#486c53,#abd0b4)}
  .pi *, .pi *::before, .pi *::after {box-sizing:border-box}
  .pi :is(h2,h3,h4,p,dl,dd,ul) {margin:0}
  .pi button, .pi input {font:inherit; color:inherit}
  .pi button {display:inline-flex; align-items:center; justify-content:center; gap:6px; border:0; background:transparent; padding:0; cursor:pointer; border-radius:5px}
  .pi button:disabled {opacity:.46; cursor:default}
  .pi button:hover:not(:disabled), .pi .pi-tabs button[aria-pressed=true] {color:var(--pi-ink); background:var(--pi-soft)}
  .pi :is(button,input,[tabindex]):focus-visible {outline:2px solid var(--pi-accent); outline-offset:2px}
  .pi .pi-graph [role=button]:focus-visible {outline:0}
  .pi-glyph {display:block; flex:none; overflow:visible}
  .pi-mono, .pi time, .pi code, .pi kbd, .pi-serial {font-family:var(--pi-mono); font-variant-numeric:tabular-nums}
  .pi-spacer {flex:1}
  .pi-head, .pi-brand, .pi-controls, .pi-tools, .pi-view-title, .pi-legend, .pi-time-head, .pi-time-title, .pi-foot {display:flex; align-items:center}
  .pi-head {min-height:47px; flex:none; padding:0 22px; gap:16px; justify-content:space-between; border-bottom:1px solid var(--pi-rule); background:var(--pi-bar)}
  .pi-brand {gap:10px; min-width:0}
  .pi-brand > .pi-glyph {color:var(--pi-accent)}
  .pi-brand strong {font-size:15px; font-weight:650; letter-spacing:-.035em}
  .pi-slash {color:var(--pi-edge); margin:0 1px; font-weight:400}
  .pi-project {min-width:0; text-overflow:ellipsis; white-space:nowrap; overflow:hidden; color:var(--pi-mid); font:12px/1.4 var(--pi-mono)}
  .pi-controls {flex:none; gap:13px}
  .pi-status {display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--pi-mid)}
  .pi-status i {width:7px; height:7px; border-radius:50%; display:block; background:var(--pi-ok)}
  .pi-status.pinned i {background:var(--pi-wait); border-radius:1.5px}
  .pi-status.offline i {background:transparent; border:1.5px solid var(--pi-bad)}
  .pi .pi-follow {min-height:28px; padding:3px 10px; color:var(--pi-ink); border:1px solid var(--pi-rule); background:var(--pi-chrome)}
  .pi-notice, .pi-empty {padding:9px 18px; color:var(--pi-muted); font-size:12px}
  .pi-notice {color:var(--pi-wait); border-bottom:1px solid var(--pi-rule)}
  .pi-toolbar {flex:none; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:15px 22px 12px; background:var(--pi-paper)}
  .pi-view-title {gap:12px; min-width:0; flex-wrap:wrap}
  .pi-view-title h2 {font-size:20px; font-weight:620; line-height:1.3; letter-spacing:-.025em}
  .pi-count {color:var(--pi-muted); font-size:12px; white-space:nowrap}
  .pi-count i {font-style:normal; margin-inline:5px}
  .pi-tools {gap:8px; min-width:0}
  .pi-search {height:31px; width:160px; display:flex; align-items:center; gap:7px; padding:0 8px; border:1px solid var(--pi-rule); border-radius:6px; color:var(--pi-muted); background:var(--pi-chrome)}
  .pi-search:focus-within {border-color:var(--pi-accent); box-shadow:0 0 0 1px var(--pi-accent)}
  .pi-search input {width:100%; min-width:0; padding:0; border:0; background:none; font-size:12px; outline:0!important; color:var(--pi-ink)}
  .pi-search input::placeholder {color:var(--pi-muted)}
  .pi-search kbd {pointer-events:none; padding:0 4px; border:1px solid var(--pi-rule); border-radius:3px; font-size:10px; line-height:16px}
  .pi .pi-neighbors {min-height:31px; padding:3px 8px; font-size:12px; color:var(--pi-mid)}
  .pi .pi-neighbors[aria-pressed=true] {color:var(--pi-accent); background:var(--pi-tint)}
  .pi-workspace {flex:1 1 0; min-height:94px; display:flex; position:relative; overflow:hidden; background:var(--pi-paper)}
  .pi-canvas {position:relative; min-width:0; min-height:0; flex:1; display:flex; flex-direction:column}
  .pi-legend {z-index:1; gap:16px; padding:0 22px 12px; min-height:27px; border-bottom:1px solid var(--pi-rule); color:var(--pi-muted); font-size:11px}
  .pi-legend span {display:inline-flex; align-items:center; gap:6px; white-space:nowrap}
  .pi-legend i {width:6px; height:6px; border-radius:50%; display:block; background:var(--pi-lane)}
  .pi-surface {flex:1; min-width:0; min-height:0; overflow:auto; overscroll-behavior:contain; cursor:grab;
    background-color:var(--pi-paper); background-image:radial-gradient(var(--pi-dot) .7px, transparent .85px); background-size:22px 22px; background-position:center}
  .pi-surface[data-dragging] {cursor:grabbing; user-select:none}
  .pi-surface:focus-visible {outline-offset:-2px!important}
  .pi-graph {display:block; user-select:none}
  .pi-node,.pi-link {cursor:pointer; outline:0}
  .pi-node {color:var(--pi-lane)}
  .pi-disc {fill:color-mix(in srgb, var(--pi-lane) 12%, var(--pi-paper)); stroke:var(--pi-lane); stroke-width:1.35px}
  .pi-halo {fill:none; stroke:transparent; stroke-width:1.3px}
  .pi-node:is(.pi-selected,.pi-near,.pi-match,:focus-visible) .pi-disc {stroke:var(--pi-accent); stroke-width:2px}
  .pi-node:is(.pi-selected,.pi-match,:focus-visible) .pi-halo {stroke:var(--pi-accent)}
  .pi-node:is(.pi-selected,.pi-near,.pi-match) {color:var(--pi-accent)}
  .pi-caption {width:100%; display:flex; flex-direction:column; align-items:center; text-align:center; color:var(--pi-ink); pointer-events:none;
    text-shadow:1px 0 var(--pi-paper), -1px 0 var(--pi-paper), 0 1px var(--pi-paper), 0 -1px var(--pi-paper)}
  .pi-node-label {display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; overflow-wrap:anywhere;
    max-width:100%; font-size:14px; line-height:19px; font-weight:580}
  .pi-meta {display:block; color:var(--pi-muted); overflow:hidden; max-width:100%; white-space:nowrap; text-overflow:ellipsis; margin-top:2px; font-size:11px; line-height:16px}
  .pi-state.ok {color:var(--pi-ok)} .pi-state.wait {color:var(--pi-wait)} .pi-state.bad {color:var(--pi-bad)}
  .pi-node.pi-distant {opacity:.56}
  .pi-hit {fill:none; stroke:transparent; stroke-width:15; pointer-events:stroke}
  .pi-line {fill:none; stroke:var(--pi-edge); stroke-width:1.25; pointer-events:none}
  .pi-link.pi-hot .pi-line, .pi-link:focus-visible .pi-line {stroke:var(--pi-accent); stroke-width:2.15}
  .pi-link.pi-distant {opacity:.30}
  .pi-edge-caption {pointer-events:none; font-size:11px; font-weight:480; fill:var(--pi-muted); stroke:var(--pi-paper); stroke-width:5px; stroke-linejoin:round; paint-order:stroke}
  .pi-active-caption {fill:var(--pi-accent); font-weight:580}
  .pi-zoom {display:flex; align-items:center; position:absolute; bottom:12px; right:14px; padding:2px; background:var(--pi-chrome);
    border:1px solid var(--pi-rule); border-radius:7px}
  .pi .pi-icon-btn {width:27px; height:27px; color:var(--pi-mid)}
  .pi .pi-reset {min-width:43px; height:26px; font:11px/1 var(--pi-mono); color:var(--pi-mid)}
  .pi-detail {width:clamp(220px,25%,310px); overflow:auto; flex:none; background:var(--pi-chrome); border-left:1px solid var(--pi-rule)}
  .pi-detail-head {display:flex; align-items:center; gap:8px; height:35px; padding:0 13px 0 16px; color:var(--pi-muted); border-bottom:1px solid var(--pi-rule); position:sticky; top:0; background:var(--pi-chrome); z-index:1}
  .pi-detail-head strong {font-size:12px; font-weight:550}
  .pi-detail-head .pi-icon-btn {margin-left:auto}
  .pi-detail-title {display:flex; align-items:flex-start; gap:10px; padding:18px 16px 13px}
  .pi-detail-title small {display:block; color:var(--pi-muted); font-size:11px}
  .pi-detail-title h3 {overflow-wrap:anywhere; font-size:16px; line-height:1.45; font-weight:600}
  .pi-detail-symbol {display:grid; place-items:center; flex:none; width:31px; height:31px; margin-top:2px; border-radius:8px;
    color:var(--pi-lane,var(--pi-accent)); background:color-mix(in srgb, currentColor 12%, var(--pi-chrome))}
  .pi-facts {padding:0 16px 14px}
  .pi-fact {display:grid; grid-template-columns:5.1em minmax(0,1fr); gap:7px; padding:5px 0; font-size:12px; line-height:1.6}
  .pi dt, .pi-rel-kind {color:var(--pi-muted)}
  .pi dd {min-width:0; color:var(--pi-ink); overflow-wrap:anywhere; white-space:pre-wrap}
  .pi .pi-values {padding:0; list-style:none}
  .pi-values li+li {margin-top:4px}
  .pi-values time {display:block; font-size:10px; color:var(--pi-muted)}
  .pi-relations {border-top:1px solid var(--pi-rule); padding:12px}
  .pi-relations h4 {font-size:12px; font-weight:600; padding:0 4px 6px}
  .pi-relations h4 span {margin-left:6px; color:var(--pi-muted); font-size:11px; font-weight:450}
  .pi .pi-object {display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr) 12px; width:100%; gap:5px; padding:7px 4px; text-align:left; font-size:12px}
  .pi-object span {overflow-wrap:anywhere}
  .pi-object .pi-glyph {color:var(--pi-muted)}
  .pi-time {flex:none; background:var(--pi-chrome); border-top:1px solid var(--pi-rule); padding:11px 20px 8px}
  .pi-time-head {gap:15px}
  .pi-time-title {gap:7px; color:var(--pi-mid)}
  .pi-time-title strong {color:var(--pi-ink); font-size:13px; font-weight:600}
  .pi-tabs {display:inline-flex; gap:2px; padding:2px; background:var(--pi-bar); border:1px solid var(--pi-rule); border-radius:6px}
  .pi .pi-tabs button {min-height:23px; padding:2px 9px; color:var(--pi-muted); font-size:11px; line-height:16px}
  .pi .pi-tabs button[aria-pressed=true] {color:var(--pi-ink); background:var(--pi-chrome); box-shadow:0 0 0 1px var(--pi-rule)}
  .pi-range {appearance:none; margin:0 0 0 auto; width:clamp(66px,12%,150px); height:22px; padding:0; border:0; background:transparent; cursor:ew-resize}
  .pi-range::-webkit-slider-runnable-track {height:2px; background:var(--pi-edge); border-radius:2px}
  .pi-range::-webkit-slider-thumb {appearance:none; margin-top:-4px; width:10px; height:10px; border:2px solid var(--pi-accent); border-radius:50%; background:var(--pi-chrome)}
  .pi-range::-moz-range-track {height:2px; background:var(--pi-edge)}
  .pi-range::-moz-range-thumb {width:8px; height:8px; border:2px solid var(--pi-accent); border-radius:50%; background:var(--pi-chrome)}
  .pi-stops {position:relative; display:flex; align-items:stretch; overflow-x:auto; padding:5px 0; scrollbar-width:thin}
  .pi .pi-stops button {position:relative; flex:0 0 clamp(118px,18%,188px); display:flex; align-items:flex-start; justify-content:flex-start; flex-direction:column; gap:2px; min-width:0; padding:0 7px 5px 3px; text-align:left}
  .pi-stop-rail {position:relative; height:15px; width:calc(100% + 11px); display:flex; align-items:center; padding-left:0}
  .pi-stop-rail::before {content:""; position:absolute; top:7px; left:0; right:0; border-top:1px solid var(--pi-rule)}
  .pi-stops button:last-child .pi-stop-rail::before {display:none}
  .pi-stop-rail i {position:relative; width:7px; height:7px; background:var(--pi-chrome); border:1.5px solid var(--pi-edge); border-radius:50%}
  .pi-stops [aria-pressed=true] .pi-stop-rail i {background:var(--pi-accent); border-color:var(--pi-accent); box-shadow:0 0 0 2px var(--pi-tint)}
  .pi-stops time {font-size:10.5px; color:var(--pi-muted)}
  .pi-stop-label {font-size:12px; color:var(--pi-mid); max-width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis}
  .pi-stops [aria-pressed=true] .pi-stop-label {color:var(--pi-accent)}
  .pi-events {max-height:121px; overflow:auto; padding:4px 0; margin-top:5px}
  .pi .pi-events button {display:grid; width:100%; grid-template-columns:45px 72px minmax(80px,.7fr) minmax(120px,1fr) minmax(100px,1.2fr); min-height:26px; gap:10px; justify-content:stretch; text-align:left; padding:3px 6px; font-size:12px}
  .pi-events button[aria-pressed=true] {color:var(--pi-accent); background:var(--pi-tint)}
  .pi-events :is(code,time,.pi-serial,.pi-event-ref) {font-size:11px; color:var(--pi-muted)}
  .pi-events button span,.pi-events button code {overflow:hidden; white-space:nowrap; text-overflow:ellipsis}
  .pi-pages {display:flex; gap:9px; margin-top:4px}
  .pi .pi-pages button {padding:3px 7px; color:var(--pi-accent); font-size:11px}
  .pi-foot {flex:none; min-height:29px; gap:13px; padding:2px 19px; border-top:1px solid var(--pi-rule); background:var(--pi-bar); color:var(--pi-muted); font-size:11px}
  .pi-foot button {min-height:23px; padding:2px 4px; border-radius:4px}
  .pi-foot button[aria-expanded=true] {color:var(--pi-accent)}
  .pi-foot time, .pi-ledger {font-size:10.5px; font-variant-numeric:tabular-nums}
  .pi-foot .pi-source-error {color:var(--pi-bad)}
  .pi-sources {display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); max-height:126px; overflow:auto; gap:9px 16px; padding:10px 21px; border-top:1px solid var(--pi-rule); font-size:11px; background:var(--pi-bar)}
  .pi-sources dt {font-weight:600}
  .pi-sources dd {margin-top:2px}
  @media(prefers-reduced-motion:no-preference) {
    .pi-node,.pi-link {transition:opacity 100ms ease-out}
    .pi button,.pi-disc,.pi-line {transition:color 95ms ease-out, background-color 95ms ease-out, stroke 95ms ease-out}
  }
  @container pi-inspector (max-width:730px) {
    .pi-head,.pi-toolbar,.pi-time,.pi-foot {padding-inline:13px}
    .pi-legend {padding-inline:13px; gap:12px}
    .pi-toolbar {gap:8px} .pi-view-title {gap:6px}
    .pi-search {width:123px}
    .pi-detail {position:absolute; z-index:3; right:0; top:0; bottom:0; width:min(290px,82%); box-shadow:-4px 0 16px #0001}
  }
  @container pi-inspector (max-width:490px) {
    .pi-head {min-height:43px; gap:7px} .pi-brand,.pi-controls {gap:7px}
    .pi-brand strong {font-size:13px} .pi-brand > .pi-glyph {width:16px}
    .pi-project {font-size:10.5px} .pi-status,.pi .pi-follow {font-size:11px}
    .pi .pi-follow {padding-inline:6px}
    .pi-toolbar {padding-block:9px; align-items:center}
    .pi-view-title {display:block} .pi-view-title h2 {font-size:17px} .pi-count {font-size:10.5px}
    .pi-tools {gap:3px} .pi-search {width:105px} .pi-search kbd,.pi-neighbors span {display:none}
    .pi .pi-neighbors {width:32px}
    .pi-legend {gap:9px; padding-bottom:7px; min-height:22px; font-size:10px} .pi-legend span {gap:4px}
    .pi-canvas {display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-rows:auto minmax(0,1fr)}
    .pi-legend {grid-area:1 / 1; flex-wrap:wrap; align-content:center; border:0; padding-right:0}
    .pi-zoom {position:static; grid-area:1 / 2; align-self:center; margin:0 10px 5px 4px; padding:0}
    .pi-zoom .pi-icon-btn {width:22px; height:25px} .pi-zoom .pi-reset {min-width:34px; height:24px}
    .pi-surface {grid-area:2 / 1 / 3 / 3; border-top:1px solid var(--pi-rule)}
    .pi-time {padding-block:7px 4px} .pi-time-head {gap:8px}
    .pi-time-title {gap:4px} .pi-range {width:65px}
    .pi .pi-events button {grid-template-columns:34px 62px minmax(80px,1fr) minmax(50px,.75fr); gap:5px} .pi-events code {display:none}
    .pi-foot {gap:7px; min-height:26px}
    .pi-detail {width:auto; left:0; top:auto; bottom:0; max-height:50%; border-left:0; border-top:1px solid var(--pi-rule); box-shadow:0 -3px 12px #0001}
  }
  @media(forced-colors:active) {
    .pi {--pi-edge:CanvasText; --pi-accent:Highlight; --pi-paper:Canvas}
    .pi-surface {background-image:none} .pi-disc {stroke:CanvasText; fill:Canvas}
    .pi-link.pi-distant,.pi-node.pi-distant {opacity:.65}
  }
  @media(pointer:coarse) {
    .pi .pi-follow, .pi .pi-neighbors, .pi-tabs button, .pi .pi-icon-btn, .pi .pi-reset {min-height:44px}
    .pi .pi-icon-btn, .pi .pi-reset {min-width:44px}
    .pi-object {min-height:44px}
  }
  `;
  return { inject: ['slots', 'connection'], apply };
} });
